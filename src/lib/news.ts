import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from './i18n';

export type NewsEntry = CollectionEntry<'news'>;

/** 新しい順のお知らせ。英語ページには titleEn を持つ記事だけを出す。 */
export async function newsFor(lang: Lang): Promise<NewsEntry[]> {
  const all = await getCollection('news');
  const list = lang === 'en' ? all.filter((n) => n.data.titleEn) : all;
  return list.sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || newsSlug(b).localeCompare(newsSlug(a)));
}

export function newsTitle(n: NewsEntry, lang: Lang): string {
  return (lang === 'en' && n.data.titleEn) || n.data.title;
}

/** URL に使う識別子。旧 WordPress の ID があればそれ、無ければファイル名。 */
export function newsSlug(n: NewsEntry): string {
  return n.data.id ? String(n.data.id) : n.id;
}
