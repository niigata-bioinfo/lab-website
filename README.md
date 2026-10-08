# 新潟大学医学部メディカルAIセンター / バイオインフォマティクス分野 Web サイト

https://bioinfo.med.niigata-u.ac.jp の静的サイト版。WordPress から移行したもので、
[Astro](https://astro.build) でビルドし、`main` ブランチへの push をトリガーに GitHub Actions が
サイト全体を再生成して配信サーバーへ配置します。

## 動かし方

```bash
npm ci          # 依存のインストール (Node.js 22 以降)
npm run dev     # 開発サーバー http://localhost:4321
npm run build   # dist/ に静的ファイルを生成
npm run check   # 型とコンテンツスキーマの検査
```

## 日常の更新 (コンテンツ)

更新は `src/content/` 以下のファイルを編集して PR を出すだけです。
スキーマ (`src/content.config.ts`) に合わないファイルはビルドが失敗するので、
必須項目の抜けや typo は CI で検出されます。

| 内容 | ファイル | 形式 |
|---|---|---|
| お知らせ | `src/content/news/YYYY-MM-DD-<slug>.md` | Markdown + frontmatter (`title`, `date`, 任意で `titleEn`) |
| 研究業績 | `src/content/publications/<年>.yaml` | YAML。1 ファイルに 1 年分の配列。新しいものを上に書く |
| メンバー | `src/content/members.yaml` | YAML。`faculty` / `staff` / `students` / `collaborators` / `alumni` の 5 グループ |
| 研究内容・リンク・人材募集・トップの紹介文 | `src/content/pages/{ja,en}/*.md` | Markdown |

### 研究業績を追加する

論文は PubMed ID か DOI から自動生成できます。

```bash
npm run pub:add -- --pmid 39160276
npm run pub:add -- --doi 10.1038/s44318-024-00196-0 --tags glycan,db
npm run pub:add -- --pmid 39160276 --dry-run   # 追記せず内容の確認だけ
```

該当年の YAML の先頭にエントリが追記されるので、内容を確認して commit します。
ポスター・口頭発表・講演など PubMed に無いものは、同じ形式で手書きします。

```yaml
- id: 2923                 # 通し番号。既存の最大値 + 1
  type: poster             # paper | poster | talk | lecture | others
  date: 2025-03-21         # 並び順に使う。ファイルの年と一致させる
  title: 発表タイトル
  citation: 著者、「発表タイトル」、第NN回○○学会、開催地 (2025/3/21).
  tags: [gut-microbiome]   # 任意。小文字英数字とハイフン
  lang: ja                 # 日本語ページだけに出すとき
```

`pmid` があれば PubMed へのリンク、`links` に書いたものはそのラベルでリンクになります。
タグは全業績から自動で集計され、一覧ページに件数付きで並びます。
表示名を変えたいときは `src/i18n/ja.json` / `en.json` の `tags` に追記します (無ければスラッグがそのまま出ます)。

### メンバーを変更する

`src/content/members.yaml` を編集します。グループ内の並び順がそのまま表示順です。

```yaml
faculty:
  - name:
      ja: 奥田　修二郎
      en: Shujiro Okuda
    title:
      ja: 教授
      en: Professor
```

## たまに触る設定

| 変えたいもの | 場所 |
|---|---|
| 住所・電話・メール・地図 | `src/data/site.ts` |
| 画面の文言 (見出し、ボタン、種別名、タグ名) | `src/i18n/ja.json`, `src/i18n/en.json` |
| 配色・フォント | `src/styles/global.css` の `@theme` |
| 1 ページあたりの業績件数、トップの表示件数 | `src/data/site.ts` |

## 構成

```
src/
├── content/           # コンテンツ (上記)
├── content.config.ts  # コンテンツのスキーマ (zod)
├── data/site.ts       # サイト設定
├── i18n/              # UI 文言
├── lib/               # 業績・お知らせの読み込みと整形
├── layouts/           # ページ共通レイアウト
├── components/        # ヘッダー、業績カードなど
├── pages/[...lang]/   # ルーティング。日本語は /、英語は /en/ 配下
└── styles/global.css  # Tailwind CSS v4 とデザイントークン
scripts/add-publication.ts   # PubMed / DOI から業績 YAML を生成
redirects/                   # 旧 WordPress URL からのリダイレクト表 (nginx 用と Pages 用)
.github/workflows/           # CI (PR でビルド確認) とデプロイ (main で rsync)
```

URL は日本語が `/news/`、英語が `/en/news/` のように対応します。
英語ページには `lang: ja` の業績と `titleEn` の無いお知らせは出ません。

## デプロイ

`main` に push すると `.github/workflows/deploy.yml` が `dist/` を rsync で配信サーバーへ送ります。
リポジトリの Secrets に次を設定してください。

- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH` (配置先ディレクトリ), `DEPLOY_SSH_KEY` (秘密鍵)
- 任意: `DEPLOY_PORT`, `DEPLOY_KNOWN_HOSTS`

旧 URL のリダイレクトは `redirects/nginx-redirects.conf` を nginx の `server` ブロックで include します。
Cloudflare Pages / Netlify に置く場合は `redirects/_redirects` を `public/` にコピーしてください。

## 移行について

`migration/` の WordPress エクスポート (git 管理外) から 2026-10-08 に一括変換しました。
会員限定だった内部ブログ (研究レポート) とラボミーティングのページ、添付ファイルは移行していません。
