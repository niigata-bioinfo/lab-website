import { createHash } from 'node:crypto';

/**
 * 業績 1 件を一意に表す短いキー。ページ内アンカー (#p-xxxxxxxx) と重複チェックに使う。
 * YAML に識別子を書かなくて済むよう、日付・種別・タイトル・引用文字列から決定的に導出する。
 * (同じ発表を同じ月に 2 つの学会で行った例があるため、タイトルだけでは区別できない。)
 * 内容を直すとキーも変わるが、ページ内アンカーなので実害は無い。
 */
export function publicationKey(input: { date: string | Date; type: string; title: string; citation: string }): string {
  const date = typeof input.date === 'string' ? input.date.slice(0, 10) : input.date.toISOString().slice(0, 10);
  const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(`${date}|${input.type}|${norm(input.title)}|${norm(input.citation)}`).digest('hex').slice(0, 8);
}
