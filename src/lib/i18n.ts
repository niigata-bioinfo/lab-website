import ja from '../i18n/ja.json';
import en from '../i18n/en.json';

export type Lang = 'ja' | 'en';
export const langs: Lang[] = ['ja', 'en'];
export const defaultLang: Lang = 'ja';

const dict = { ja, en } as const;
export type Dict = typeof ja;

export function t(lang: Lang): Dict {
  return dict[lang] as Dict;
}

/** サイトのベースパス ("/" または "/niigata-bioinfo" など。末尾スラッシュ無し)。astro.config の base から来る。 */
export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

/** ルート相対パスにベースパスを付ける。サブパス配下 (GitHub Pages など) でもリンクが壊れないようにする。 */
export function withBase(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${p}`;
}

/** 言語に応じたパスを返す (ベースパス込み)。日本語はプレフィックス無し、英語は /en/。 */
export function localePath(lang: Lang, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return withBase(lang === defaultLang ? p : `/en${p === '/' ? '/' : p}`);
}

export function otherLang(lang: Lang): Lang {
  return lang === 'ja' ? 'en' : 'ja';
}

/** `[...lang]` ルートの getStaticPaths 用。日本語はパラメータ無し、英語は "en"。 */
export function langParam(lang: Lang): string | undefined {
  return lang === defaultLang ? undefined : lang;
}

/** URL パラメータから言語を決める。 */
export function langFromParam(param: string | undefined): Lang {
  return param === 'en' ? 'en' : 'ja';
}

/** タグのスラッグを表示名にする。辞書に無ければスラッグをそのまま返す。 */
export function tagLabel(lang: Lang, slug: string): string {
  const tags = t(lang).tags as Record<string, string>;
  return tags[slug] ?? slug;
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
