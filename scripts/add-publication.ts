#!/usr/bin/env node
/**
 * Generate a publication entry from a PubMed ID, a PMCID or a DOI and prepend it to the YAML file for its year.
 * Whichever identifiers were not given are filled in from the NCBI ID converter API and PubMed
 * (PMID -> DOI + PMCID, PMCID -> PMID + DOI, DOI -> PMID + PMCID).
 *
 *   npm run pub:add -- --pmid 39160276
 *   npm run pub:add -- --pmcid PMC11535236
 *   npm run pub:add -- --doi 10.1038/s44318-024-00196-0 --tags glycan,db
 *   npm run pub:add -- --pmid 39160276 --dry-run     # print the entry without writing it
 *
 * Options: --type paper (default) | --tags a,b | --lang ja | --dry-run
 * Set the NCBI_EMAIL environment variable to pass a contact address to the NCBI APIs (optional, recommended).
 * Dependencies: Node.js 22+ (built-in fetch and type stripping) and the yaml package only.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

const PUB_DIR = join(process.cwd(), 'src/content/publications');
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const IDCONV = 'https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/';
const TOOL = 'niigata-bioinfo-site';

interface Entry {
  type: string;
  date: string;
  title: string;
  citation: string;
  pmid?: number;
  pmcid?: string;
  doi?: string;
  links?: { label: string; url: string }[];
  tags?: string[];
  lang?: string;
}

function parseArgs(argv: string[]) {
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return opts;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'niigata-bioinfo-site (add-publication.ts)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

/** "Hsiao YT" → "Hsiao, Y.T." */
function formatPubmedAuthor(name: string): string {
  const m = name.match(/^(.*?)\s+([A-Z]+)$/);
  if (!m) return name;
  return `${m[1]}, ${m[2].split('').join('.')}.`;
}

/** "EMBO J" + "The EMBO journal" → "EMBO J." / "Brief Bioinform" → "Brief. Bioinform." */
function formatJournalAbbrev(abbrev: string, full: string): string {
  const fullWords = full.toLowerCase().split(/[\s,:;()]+/).filter(Boolean);
  return abbrev
    .split(/\s+/)
    .map((w) => {
      const lw = w.toLowerCase().replace(/\.$/, '');
      const isAbbrev = fullWords.some((f) => f.startsWith(lw) && f.length > lw.length);
      return isAbbrev && !w.endsWith('.') ? `${w}.` : w;
    })
    .join(' ');
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => (w.length > 2 || w === w.toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w));
}

async function fromPubmed(pmid: number): Promise<Omit<Entry, 'id' | 'type'>> {
  const data = await getJson(`${EUTILS}/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`);
  const r = data.result?.[String(pmid)];
  if (!r || r.error) throw new Error(`PMID ${pmid} was not found in PubMed`);
  const authors = (r.authors as { name: string }[]).map((a) => formatPubmedAuthor(a.name)).join(', ');
  const journal = formatJournalAbbrev(r.source, r.fulljournalname ?? r.source);
  const year = (r.pubdate as string).slice(0, 4);
  const volIssue = r.volume ? `${r.volume}${r.issue ? `(${r.issue})` : ''}` : '';
  // Online-only journals have no page numbers; fall back to elocationid (e.g. "pii: bbae419")
  const eloc = ((r.elocationid as string | undefined) ?? '').replace(/^pii:\s*/i, '');
  const pageStr = r.pages || (eloc && !/^doi:/i.test(eloc) ? eloc : '');
  const pages = pageStr ? `:${pageStr}` : '';
  const title = (r.title as string).trim();
  const citation = `${authors} ${title.endsWith('.') ? title : `${title}.`} ${journal} ${volIssue}${pages}(${year}).`.replace(/\s+/g, ' ');
  const articleIds = r.articleids as { idtype: string; value: string }[];
  const doi = articleIds.find((a) => a.idtype === 'doi')?.value;
  const pmcid = articleIds.find((a) => a.idtype === 'pmc')?.value;
  const sortDate = (r.sortpubdate as string | undefined)?.slice(0, 10).replace(/\//g, '-');
  const date = sortDate ?? `${year}-01-01`;
  const entry: Omit<Entry, 'id' | 'type'> = { date, title, citation, pmid };
  if (pmcid && /^PMC\d+$/.test(pmcid)) entry.pmcid = pmcid;
  if (doi) {
    entry.doi = doi;
    entry.links = [{ label: titleCase(r.fulljournalname ?? r.source), url: `https://doi.org/${doi}` }];
  }
  return entry;
}

interface Ids { pmid?: number; pmcid?: string; doi?: string }

/**
 * Fill in missing PMID / PMCID / DOI via the NCBI ID converter API (covers articles deposited in PMC only).
 * Returns the input unchanged when nothing is found.
 */
async function convertIds(ids: Ids): Promise<Ids> {
  const query = ids.pmcid ? { ids: ids.pmcid, idtype: 'pmcid' } : ids.pmid ? { ids: String(ids.pmid), idtype: 'pmid' } : ids.doi ? { ids: ids.doi, idtype: 'doi' } : null;
  if (!query) return ids;
  const params = new URLSearchParams({ ...query, format: 'json', tool: TOOL });
  if (process.env.NCBI_EMAIL) params.set('email', process.env.NCBI_EMAIL);
  try {
    const data = await getJson(`${IDCONV}?${params}`);
    const rec = data.records?.[0];
    if (!rec || rec.status === 'error') return ids;
    return {
      pmid: ids.pmid ?? (rec.pmid ? Number(rec.pmid) : undefined),
      pmcid: ids.pmcid ?? rec.pmcid,
      doi: ids.doi ?? rec.doi,
    };
  } catch {
    return ids; // if the converter is down we can still proceed with PubMed / Crossref alone
  }
}

async function pmidFromDoi(doi: string): Promise<number | undefined> {
  const data = await getJson(`${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(doi)}[doi]&retmode=json`);
  const id = data.esearchresult?.idlist?.[0];
  return id ? Number(id) : undefined;
}

async function fromCrossref(doi: string): Promise<Omit<Entry, 'id' | 'type'>> {
  const data = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const m = data.message;
  const authors = (m.author ?? [])
    .map((a: { family?: string; given?: string; name?: string }) => {
      if (!a.family) return a.name ?? '';
      const initials = (a.given ?? '').split(/[\s-]+/).filter(Boolean).map((g: string) => `${g[0]}.`).join('');
      return initials ? `${a.family}, ${initials}` : a.family;
    })
    .join(', ');
  const full = decodeEntities(m['container-title']?.[0] ?? '');
  const abbrev = decodeEntities(m['short-container-title']?.[0] ?? full);
  const journal = formatJournalAbbrev(abbrev, full);
  const parts: number[] = (m.issued ?? m['published-print'] ?? m['published-online'])?.['date-parts']?.[0] ?? [];
  const year = String(parts[0] ?? '');
  const date = `${parts[0] ?? '1970'}-${String(parts[1] ?? 1).padStart(2, '0')}-${String(parts[2] ?? 1).padStart(2, '0')}`;
  const mainTitle = decodeEntities(m.title?.[0] ?? '');
  const subtitle = decodeEntities(m.subtitle?.[0] ?? '');
  const title = (subtitle && !mainTitle.includes(subtitle) ? `${mainTitle}: ${subtitle}` : mainTitle).replace(/\s+/g, ' ').trim();
  const volIssue = m.volume ? `${m.volume}${m.issue ? `(${m.issue})` : ''}` : '';
  const pages = m.page ? `:${m.page}` : '';
  const citation = `${authors} ${title.endsWith('.') ? title : `${title}.`} ${journal} ${volIssue}${pages}(${year}).`.replace(/\s+/g, ' ');
  return { date, title, citation, doi, links: [{ label: titleCase(full), url: `https://doi.org/${doi}` }] };
}

function loadAll(): { file: string; entries: Entry[] }[] {
  // Read only to detect duplicates (pmid / pmcid / doi)
  return readdirSync(PUB_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ file: join(PUB_DIR, f), entries: (parse(readFileSync(join(PUB_DIR, f), 'utf8')) ?? []) as Entry[] }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // Treat --pmid "PMC..." as a PMCID; --pmcid may be given with or without the "PMC" prefix.
  let pmidArg: number | undefined;
  let pmcidArg: string | undefined;
  const pmidRaw = typeof opts.pmid === 'string' ? opts.pmid.trim() : undefined;
  const pmcidRaw = typeof opts.pmcid === 'string' ? opts.pmcid.trim() : undefined;
  if (pmidRaw && /^PMC\d+$/i.test(pmidRaw)) pmcidArg = pmidRaw.toUpperCase();
  else if (pmidRaw) pmidArg = Number(pmidRaw);
  if (pmcidRaw) pmcidArg = /^\d+$/.test(pmcidRaw) ? `PMC${pmcidRaw}` : pmcidRaw.toUpperCase();
  const doiArg = typeof opts.doi === 'string' ? opts.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : undefined;
  if ((pmidArg !== undefined && !Number.isInteger(pmidArg)) || (pmcidArg && !/^PMC\d+$/.test(pmcidArg))) {
    console.error('PMID must be an integer and PMCID must look like PMC1234567');
    process.exit(1);
  }
  if (!pmidArg && !pmcidArg && !doiArg) {
    console.error('Usage: npm run pub:add -- --pmid <PMID> | --pmcid <PMCID> | --doi <DOI> [--type paper] [--tags a,b] [--lang ja] [--dry-run]');
    process.exit(1);
  }

  // Fill in the identifiers that were not given
  const ids = await convertIds({ pmid: pmidArg, pmcid: pmcidArg, doi: doiArg });
  if (!ids.pmid && ids.doi) ids.pmid = await pmidFromDoi(ids.doi);

  const all = loadAll();
  const existing = all.flatMap((f) => f.entries);
  const dup = existing.find((e) =>
    (ids.pmid && e.pmid === ids.pmid) || (ids.pmcid && e.pmcid === ids.pmcid) || (ids.doi && e.doi?.toLowerCase() === ids.doi.toLowerCase()));
  if (dup) {
    console.error(`Already registered: ${dup.title}`);
    process.exit(1);
  }
  if (!ids.pmid && !ids.doi) {
    console.error(`No PMID / DOI found for ${ids.pmcid}`);
    process.exit(1);
  }

  const base = ids.pmid ? await fromPubmed(ids.pmid) : await fromCrossref(ids.doi!);
  if (ids.doi && !base.doi) base.doi = ids.doi;
  if (ids.pmcid && !base.pmcid) base.pmcid = ids.pmcid;

  const entry: Entry = { type: typeof opts.type === 'string' ? opts.type : 'paper', date: base.date, title: base.title, citation: base.citation };
  if (base.pmid) entry.pmid = base.pmid;
  if (base.pmcid) entry.pmcid = base.pmcid;
  if (base.doi) entry.doi = base.doi;
  if (base.links) entry.links = base.links;
  if (typeof opts.tags === 'string') entry.tags = opts.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (typeof opts.lang === 'string') entry.lang = opts.lang;

  const snippet = stringify([entry], { lineWidth: 0 });
  console.log(snippet);
  if (opts['dry-run']) return;

  const year = entry.date.slice(0, 4);
  const file = join(PUB_DIR, `${year}.yaml`);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, snippet + current);
  console.log(`Added to src/content/publications/${year}.yaml`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
