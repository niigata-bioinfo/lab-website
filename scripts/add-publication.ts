/**
 * Add a publication entry to the YAML file for its year.
 *
 * Interactive (default):
 *   npm run pub:add
 *   A wizard asks for the type, the identifier (papers) or the bibliographic fields (posters, talks, ...),
 *   the tags, shows a preview and asks before writing anything.
 *
 * Non-interactive (for scripts; only when --no-interactive is given):
 *   node scripts/add-publication.ts --no-interactive --pmid 39160276
 *   node scripts/add-publication.ts --no-interactive --pmcid PMC11535236
 *   node scripts/add-publication.ts --no-interactive --doi 10.1038/s44318-024-00196-0 --tags glycan,db
 *   node scripts/add-publication.ts --no-interactive --pmid 39160276 --dry-run   # print only
 *   Options: --type paper (default) | --tags a,b | --lang ja | --dry-run
 *
 * For papers, whichever of PMID / PMCID / DOI were not given are filled in from the NCBI ID converter
 * API and PubMed (PMID -> DOI + PMCID, PMCID -> PMID + DOI, DOI -> PMID + PMCID).
 * Set the NCBI_EMAIL environment variable to pass a contact address to the NCBI APIs (optional, recommended).
 * Dependencies: Node.js 22+ (built-in fetch and type stripping), the yaml package and @clack/prompts.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import * as p from '@clack/prompts';

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

/** Sent with every API request. A regular browser UA; some endpoints reject unfamiliar clients. */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
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

const TYPES = [
  { value: 'paper', label: 'Paper', hint: 'journal article; fetched from PubMed / Crossref' },
  { value: 'poster', label: 'Poster' },
  { value: 'talk', label: 'Talk', hint: 'oral presentation at a conference' },
  { value: 'lecture', label: 'Lecture', hint: 'invited lecture, seminar, tutorial' },
  { value: 'others', label: 'Others', hint: 'book chapter, article, etc.' },
] as const;
type PubType = (typeof TYPES)[number]['value'];

const TAG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hasJapanese = (s: string) => /[\u3040-\u30ff\u3400-\u9fff]/.test(s);

/** Classify a free-form identifier as PMID, PMCID or DOI. */
function detectIdentifier(raw: string): Ids | null {
  const v = raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (/^\d+$/.test(v)) return { pmid: Number(v) };
  if (/^PMC\d+$/i.test(v)) return { pmcid: v.toUpperCase() };
  if (/^10\.\d{4,9}\/\S+$/.test(v)) return { doi: v };
  return null;
}

/** Tags already used in the YAML files, most frequent first. */
function collectTags(entries: Entry[]): { slug: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) for (const t of e.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([slug, count]) => ({ slug, count })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

interface ManualFields { title: string; authors: string; venue: string; place: string; date: string }

/** Compose a citation in the lab's house style for presentations and other non-journal items. */
function buildManualCitation(f: ManualFields): string {
  const [y, m, d] = f.date.split('-').map(Number);
  const when = `${y}/${m}${d ? `/${d}` : ''}`;
  const ja = hasJapanese(f.title) || hasJapanese(f.authors);
  if (ja) {
    const authors = f.authors.split(/[、,，]/).map((a) => a.trim()).filter(Boolean).join('、');
    const tail = [f.venue, f.place].filter(Boolean).join('、');
    return `${authors ? `${authors}、` : ''}「${f.title}」、${tail} (${when}).`;
  }
  const authors = f.authors.trim().replace(/\.?$/, '');
  const title = f.title.trim().replace(/\.$/, '');
  const tail = [f.venue, f.place].filter(Boolean).join(', ');
  return `${authors ? `${authors}. ` : ''}${title}. ${tail} (${when}).`;
}

function makeEntry(type: string, base: Omit<Entry, 'type'>, tags: string[] | undefined, lang: string | undefined): Entry {
  const entry: Entry = { type, date: base.date, title: base.title, citation: base.citation };
  if (base.pmid) entry.pmid = base.pmid;
  if (base.pmcid) entry.pmcid = base.pmcid;
  if (base.doi) entry.doi = base.doi;
  if (base.links) entry.links = base.links;
  if (tags && tags.length) entry.tags = tags;
  if (lang) entry.lang = lang;
  return entry;
}

function writeEntry(entry: Entry): string {
  const year = entry.date.slice(0, 4);
  const file = join(PUB_DIR, `${year}.yaml`);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, stringify([entry], { lineWidth: 0 }) + current);
  return `src/content/publications/${year}.yaml`;
}

/** Resolve a paper from any identifier: complete the ids, then fetch from PubMed or Crossref. */
async function resolvePaper(input: Ids, existing: Entry[]): Promise<{ base: Omit<Entry, 'type'>; ids: Ids; dup?: Entry }> {
  const ids = await convertIds(input);
  if (!ids.pmid && ids.doi) ids.pmid = await pmidFromDoi(ids.doi);
  const dup = existing.find((e) =>
    (ids.pmid && e.pmid === ids.pmid) || (ids.pmcid && e.pmcid === ids.pmcid) || (ids.doi && e.doi?.toLowerCase() === ids.doi.toLowerCase()));
  if (dup) return { base: { date: '', title: '', citation: '' }, ids, dup };
  if (!ids.pmid && !ids.doi) throw new Error(`No PMID / DOI found for ${ids.pmcid}`);
  const base = ids.pmid ? await fromPubmed(ids.pmid) : await fromCrossref(ids.doi!);
  if (ids.doi && !base.doi) base.doi = ids.doi;
  if (ids.pmcid && !base.pmcid) base.pmcid = ids.pmcid;
  return { base, ids };
}

function loadAll(): { file: string; entries: Entry[] }[] {
  // Read only to detect duplicates (pmid / pmcid / doi)
  return readdirSync(PUB_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ file: join(PUB_DIR, f), entries: (parse(readFileSync(join(PUB_DIR, f), 'utf8')) ?? []) as Entry[] }));
}

async function runNonInteractive(opts: Record<string, string | boolean>) {
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
    console.error('Usage: node scripts/add-publication.ts --no-interactive --pmid <PMID> | --pmcid <PMCID> | --doi <DOI> [--type paper] [--tags a,b] [--lang ja] [--dry-run]');
    process.exit(1);
  }

  const existing = loadAll().flatMap((f) => f.entries);
  const { base, dup } = await resolvePaper({ pmid: pmidArg, pmcid: pmcidArg, doi: doiArg }, existing);
  if (dup) {
    console.error(`Already registered: ${dup.title}`);
    process.exit(1);
  }
  const tags = typeof opts.tags === 'string' ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
  const entry = makeEntry(typeof opts.type === 'string' ? opts.type : 'paper', base, tags, typeof opts.lang === 'string' ? opts.lang : undefined);
  console.log(stringify([entry], { lineWidth: 0 }));
  if (opts['dry-run']) return;
  console.log(`Added to ${writeEntry(entry)}`);
}

/** Abort the wizard cleanly when the user presses Ctrl+C / Esc. */
function guard<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled. Nothing was written.');
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

async function runWizard() {
  p.intro('Add a publication');
  const existing = loadAll().flatMap((f) => f.entries);

  const type = guard(await p.select<PubType>({ message: 'Type of publication', options: [...TYPES] }));

  let base: Omit<Entry, 'type'>;
  if (type === 'paper') {
    const raw = guard(await p.text({
      message: 'PMID, PMCID or DOI  (e.g. 39160276, PMC11535236, 10.1038/s44318-024-00196-0)',
      validate: (v) => (detectIdentifier(v ?? '') ? undefined : 'Enter a PMID (digits), a PMCID (PMC...) or a DOI (10.xxxx/...)'),
    }));
    const input = detectIdentifier(raw)!;
    const kind = input.pmid ? `PMID ${input.pmid}` : input.pmcid ? `PMCID ${input.pmcid}` : `DOI ${input.doi}`;
    const sp = p.spinner();
    sp.start(`Looking up ${kind}`);
    let resolved: Awaited<ReturnType<typeof resolvePaper>>;
    try {
      resolved = await resolvePaper(input, existing);
    } catch (e) {
      sp.stop('Lookup failed');
      p.cancel((e as Error).message);
      process.exit(1);
    }
    if (resolved.dup) {
      sp.stop('Already registered');
      p.cancel(`This paper is already in the list: ${resolved.dup.title}`);
      process.exit(1);
    }
    const ids = [resolved.ids.pmid && `PMID ${resolved.ids.pmid}`, resolved.ids.pmcid && resolved.ids.pmcid, resolved.ids.doi && `DOI ${resolved.ids.doi}`].filter(Boolean).join(', ');
    sp.stop(`Found: ${resolved.base.title}  (${ids})`);
    base = resolved.base;
  } else {
    const isOther = type === 'others';
    // Examples are part of the message so they stay visible while typing (a hint inside the field disappears on the first key).
    const title = guard(await p.text({ message: 'Title, in Japanese or English  (e.g. 腸内細菌叢の比較メタゲノム解析  or  Comparative metagenomics of the gut microbiota)', validate: (v) => (v?.trim() ? undefined : 'Required') }));
    const authors = guard(await p.text({ message: 'Authors in the order they appear, comma separated  (e.g. 奥田修二郎、山田拓司  or  Okuda, S., Yamada, T.)', defaultValue: '' }));
    const venue = guard(await p.text({
      message: isOther ? 'Published in  (e.g. 実験医学別冊 質量分析活用スタンダード  or  Methods Mol. Biol.)' : 'Conference or event name  (e.g. 第99回日本細菌学会総会  or  ISMB 2026)',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }));
    const place = guard(await p.text({
      message: isOther ? 'Pages, ISBN or other details, optional  (e.g. 328-331, ISBN 978-4-7581-2264-1)' : 'Venue or city, optional  (e.g. 朱鷺メッセ新潟  or  Montreal)',
      defaultValue: '',
    }));
    const today = new Date().toISOString().slice(0, 10);
    const date = guard(await p.text({
      message: 'Date  (YYYY-MM-DD; for an event, the day of the presentation)',
      initialValue: today,
      validate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') && !Number.isNaN(Date.parse(v!)) ? undefined : 'Use the form 2025-03-21'),
    }));
    const fields: ManualFields = { title: title.trim(), authors: authors.trim(), venue: venue.trim(), place: place.trim(), date };
    base = { date, title: fields.title, citation: buildManualCitation(fields) };
  }

  // Tags: existing ones as a checklist, plus free input for new ones
  const known = collectTags(existing);
  let tags: string[] = [];
  if (known.length) {
    tags = guard(await p.multiselect<string>({
      message: 'Tags (space to toggle, enter to continue)',
      options: known.map((t) => ({ value: t.slug, label: t.slug, hint: `${t.count}` })),
      required: false,
    }));
  }
  const extra = guard(await p.text({ message: 'New tags, comma separated, optional  (e.g. single-cell, long-read)', defaultValue: '',
    validate: (v) => { const bad = (v ?? '').split(',').map((t) => t.trim()).filter(Boolean).find((t) => !TAG_RE.test(t)); return bad ? `"${bad}": use lowercase letters, digits and hyphens` : undefined; } }));
  tags = [...new Set([...tags, ...extra.split(',').map((t) => t.trim()).filter(Boolean)])];

  const jaOnlyDefault = hasJapanese(base.title) || hasJapanese(base.citation);
  const showInEnglish = guard(await p.confirm({ message: 'Show on the English site too?', initialValue: !jaOnlyDefault }));
  let entry = makeEntry(type, base, tags, showInEnglish ? undefined : 'ja');

  // Preview, optionally edit the citation, then write
  for (;;) {
    p.note(stringify([entry], { lineWidth: 0 }).trimEnd(), `Preview (src/content/publications/${entry.date.slice(0, 4)}.yaml)`);
    const action = guard(await p.select<'write' | 'edit' | 'quit'>({
      message: 'What next?',
      options: [
        { value: 'write', label: 'Write it to the file' },
        { value: 'edit', label: 'Edit the citation text first' },
        { value: 'quit', label: 'Discard' },
      ],
    }));
    if (action === 'edit') {
      const citation = guard(await p.text({ message: 'Citation', initialValue: entry.citation, validate: (v) => (v?.trim() ? undefined : 'Required') }));
      entry = { ...entry, citation: citation.trim() };
      continue;
    }
    if (action === 'quit') {
      p.cancel('Discarded. Nothing was written.');
      return;
    }
    const file = writeEntry(entry);
    p.outro(`Added to ${file}. Review the diff and commit.`);
    return;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts['no-interactive']) await runNonInteractive(opts);
  else await runWizard();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
