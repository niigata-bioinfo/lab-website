/**
 * サイトのテーマ (見た目) の一覧。先頭が既定。
 * テーマを追加するときは、ここに 1 行足し、src/styles/themes/<id>.css を作り、global.css で import する。
 * 動きのある背景などの JS が必要なら src/scripts/theme-effects.ts に登録する。
 */
export const themes = [
  { id: 'legacy', label: { ja: 'レガシー', en: 'Legacy' } },
  { id: 'helix', label: { ja: 'ヘリックス', en: 'Helix' } },
] as const;

export type ThemeId = (typeof themes)[number]['id'];
export const defaultTheme: ThemeId = 'legacy';
export const THEME_STORAGE_KEY = 'site-theme';
