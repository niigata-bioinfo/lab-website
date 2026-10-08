import { langs, langParam, type Lang } from './i18n';

/** `[...lang]` ルートで日英 2 つのパスを生成する。 */
export function langPaths() {
  return langs.map((lang) => ({ params: { lang: langParam(lang) }, props: { lang } }));
}

/** 日本語のみのページ用。 */
export function jaOnlyPaths() {
  return [{ params: { lang: undefined }, props: { lang: 'ja' as Lang } }];
}
