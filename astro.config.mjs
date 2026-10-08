// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * 配信先に応じて環境変数で上書きできる。
 *   SITE_URL  : 公開 URL のオリジン (既定: 本番ドメイン)
 *   BASE_PATH : サブパス配下に置く場合のパス (例: GitHub Pages のプロジェクトサイトなら "/niigata-bioinfo")
 * ローカルでは何も設定しなければ "/" 直下として動く。
 */
const siteUrl = process.env.SITE_URL ?? 'https://bioinfo.med.niigata-u.ac.jp';
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site: siteUrl,
  base: basePath,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  vite: { plugins: [tailwindcss()] },
});
