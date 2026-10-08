#!/usr/bin/env node
/**
 * PubMed ID または DOI から業績エントリを生成し、該当年の YAML の先頭に追記する。
 *
 *   npm run pub:add -- --pmid 39160276
 *   npm run pub:add -- --doi 10.1038/s44318-024-00196-0 --tags glycan,db
 *   npm run pub:add -- --pmid 39160276 --dry-run     # 追記せずに表示だけ
 *
 * オプション: --type paper (既定) | --tags a,b | --lang ja | --dry-run
 * 依存: Node.js 22 以降 (組み込み fetch と型ストリップ) と yaml パッケージのみ。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

const PUB_DIR = join(process.cwd(), 'src/content/publications');
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

interface Entry {
  id: number;
  type: string;
  date: string;
  title: string;
  citation: string;
  pmid?: number;
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
  if (!r || r.error) throw new Error(`PubMed に PMID ${pmid} が見つかりません`);
  const authors = (r.authors as { name: string }[]).map((a) => formatPubmedAuthor(a.name)).join(', ');
  const journal = formatJournalAbbrev(r.source, r.fulljournalname ?? r.source);
  const year = (r.pubdate as string).slice(0, 4);
  const volIssue = r.volume ? `${r.volume}${r.issue ? `(${r.issue})` : ''}` : '';
  // ページが無い電子ジャーナルは elocationid ("pii: bbae419" など) を使う
  const eloc = ((r.elocationid as string | undefined) ?? '').replace(/^pii:\s*/i, '');
  const pageStr = r.pages || (eloc && !/^doi:/i.test(eloc) ? eloc : '');
  const pages = pageStr ? `:${pageStr}` : '';
  const title = (r.title as string).trim();
  const citation = `${authors} ${title.endsWith('.') ? title : `${title}.`} ${journal} ${volIssue}${pages}(${year}).`.replace(/\s+/g, ' ');
  const doi = (r.articleids as { idtype: string; value: string }[]).find((a) => a.idtype === 'doi')?.value;
  const sortDate = (r.sortpubdate as string | undefined)?.slice(0, 10).replace(/\//g, '-');
  const date = sortDate ?? `${year}-01-01`;
  const entry: Omit<Entry, 'id' | 'type'> = { date, title, citation, pmid };
  if (doi) {
    entry.doi = doi;
    entry.links = [{ label: titleCase(r.fulljournalname ?? r.source), url: `https://doi.org/${doi}` }];
  }
  return entry;
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
  return readdirSync(PUB_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ file: join(PUB_DIR, f), entries: (parse(readFileSync(join(PUB_DIR, f), 'utf8')) ?? []) as Entry[] }));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pmidArg = opts.pmid ? Number(opts.pmid) : undefined;
  const doiArg = typeof opts.doi === 'string' ? opts.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : undefined;
  if (!pmidArg && !doiArg) {
    console.error('使い方: npm run pub:add -- --pmid <PMID> | --doi <DOI> [--type paper] [--tags a,b] [--lang ja] [--dry-run]');
    process.exit(1);
  }
  const all = loadAll();
  const existing = all.flatMap((f) => f.entries);
  const dup = existing.find((e) => (pmidArg && e.pmid === pmidArg) || (doiArg && e.doi?.toLowerCase() === doiArg.toLowerCase()));
  if (dup) {
    console.error(`既に登録されています: id=${dup.id} ${dup.title}`);
    process.exit(1);
  }

  let pmid = pmidArg;
  if (!pmid && doiArg) pmid = await pmidFromDoi(doiArg);
  const base = pmid ? await fromPubmed(pmid) : await fromCrossref(doiArg!);
  if (doiArg && !base.doi) base.doi = doiArg;

  const nextId = Math.max(0, ...existing.map((e) => e.id)) + 1;
  const entry: Entry = { id: nextId, type: typeof opts.type === 'string' ? opts.type : 'paper', ...base };
  if (typeof opts.tags === 'string') entry.tags = opts.tags.split(',').map((t) => t.trim()).filter(Boolean);
  if (typeof opts.lang === 'string') entry.lang = opts.lang;

  const snippet = stringify([entry], { lineWidth: 0 });
  console.log(snippet);
  if (opts['dry-run']) return;

  const year = entry.date.slice(0, 4);
  const file = join(PUB_DIR, `${year}.yaml`);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, snippet + current);
  console.log(`追記しました: src/content/publications/${year}.yaml (id=${entry.id})`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
