import { getCollection } from 'astro:content';
import type { z } from 'astro/zod';
import type { publicationSchema } from '../content.config';
import { localePath, type Lang } from './i18n';
import { site } from '../data/site';
import { publicationKey } from './pubkey';

export type Publication = z.infer<typeof publicationSchema> & {
  year: number;
  /** 日付・種別・タイトルから導出した 8 文字のキー。アンカー #p-<key> に使う。 */
  key: string;
};

let cache: Publication[] | null = null;

/** 全業績を新しい順に返す。年ファイルを平坦化し、年ファイル名と date の年が一致することを検証する。 */
export async function allPublications(): Promise<Publication[]> {
  if (cache) return cache;
  const files = await getCollection('publications');
  const list: Publication[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const year = Number(file.id);
    if (!Number.isInteger(year)) throw new Error(`publications/${file.id}.yaml: ファイル名は西暦 4 桁にしてください`);
    for (const p of file.data) {
      const y = p.date.getUTCFullYear();
      if (y !== year) throw new Error(`publications/${file.id}.yaml: 「${p.title}」の date (${y}) がファイルの年と一致しません`);
      const key = publicationKey(p);
      if (seen.has(key)) throw new Error(`publications/${file.id}.yaml: 「${p.title}」(${p.type}) が ${seen.get(key)} と重複しています (日付・種別・タイトル・引用がすべて同じ)`);
      seen.set(key, `${file.id}.yaml`);
      list.push({ ...p, year, key });
    }
  }
  // 日付の新しい順。同じ日付の業績は YAML に書かれた順 (sort は安定ソート)。
  list.sort((a, b) => b.date.getTime() - a.date.getTime());
  cache = list;
  return list;
}

/** 指定言語のページに表示してよい業績。 */
export async function publicationsFor(lang: Lang): Promise<Publication[]> {
  const all = await allPublications();
  return all.filter((p) => !p.lang || p.lang === lang);
}

/** 業績から使用中のタグを件数付きで集計する (件数の多い順)。 */
export function collectTags(list: Publication[]): { slug: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of list) for (const tag of p.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([slug, count]) => ({ slug, count })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

/** 業績のある年を新しい順に返す。 */
export function collectYears(list: Publication[]): number[] {
  return [...new Set(list.map((p) => p.year))].sort((a, b) => b - a);
}

export interface Page<T> {
  items: T[];
  current: number;
  total: number;
}

/** 配列をページに分割する。ページ番号は 1 始まり。 */
export function paginate<T>(items: T[], size = site.publicationsPerPage): Page<T>[] {
  const total = Math.max(1, Math.ceil(items.length / size));
  return Array.from({ length: total }, (_, i) => ({ items: items.slice(i * size, (i + 1) * size), current: i + 1, total }));
}

/** 業績 1 件を指す URL (年別ページのアンカー)。 */
export function publicationUrl(lang: Lang, p: Publication): string {
  return localePath(lang, `/publications/year/${p.year}/#p-${p.key}`);
}

export function pubmedUrl(pmid: number): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

export function pmcUrl(pmcid: string): string {
  return `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`;
}

export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}
