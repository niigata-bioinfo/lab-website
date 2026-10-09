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
| お知らせ | `src/content/news/YYYY-MM-DD-<slug>.md` | Markdown + frontmatter (`title`, `date`, 任意で `titleEn`)。ファイル名がそのまま URL になる |
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
- type: poster             # paper | poster | talk | lecture | others
  date: 2025-03-21         # 並び順に使う。ファイルの年と一致させる
  title: 発表タイトル
  citation: 著者、「発表タイトル」、第NN回○○学会、開催地 (2025/3/21).
  tags: [gut-microbiome]   # 任意。小文字英数字とハイフン
  lang: ja                 # 日本語ページだけに出すとき
```

識別子は書きません。各業績は年別ページ (`/publications/year/2025/`) に並び、1 件を指すリンクは
日付・種別・タイトル・引用文字列から自動生成されるアンカー (`#p-xxxxxxxx`) です。まったく同じ業績を
二重に書くとビルドが失敗します。
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
| 配色・フォント | `src/styles/global.css` の `@theme` と `src/styles/themes/*.css` |
| 1 ページあたりの業績件数、トップの表示件数 | `src/data/site.ts` |

## テーマ (見た目の切り替え)

画面右下のセレクトボックスでテーマを切り替えられます。選択は `localStorage` に保存され、次回以降も維持されます。
HTML は全テーマで共通で、`<html data-theme="...">` の値に応じて CSS が切り替わる仕組みです。

| テーマ | 内容 |
|---|---|
| `legacy` (既定) | 旧 WordPress テーマの見た目をそのまま再現 |
| `helix` | 暗い背景に WebGL (Three.js) の DNA 二重らせんが回る、ガラス質のカード UI |

テーマを追加するには次の 3 か所を触ります。

1. `src/data/themes.ts` の配列に `{ id, label }` を 1 行足す。
2. `src/styles/themes/<id>.css` を作り、`[data-theme="<id>"]` スコープで各クラスのスタイルを書く
   (`legacy.css` にあるクラス一覧がそのまま雛形になります)。`global.css` で import する。
3. 背景アニメーションなど JS が必要なら `src/scripts/theme-effects.ts` に動的 import を登録する。
   登録したコードは、そのテーマが選ばれたときだけ読み込まれます (`helix` の Three.js は約 540KB、gzip で約 130KB)。

`helix` の 3D 背景は `prefers-reduced-motion` が有効なら静止画になり、タブが非表示の間は描画を止めます。

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

### テスト公開 (GitHub Pages、現在有効)

`main` に push すると `.github/workflows/pages.yml` がビルドして GitHub Pages に公開します。
初回だけ、リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** にしてください。
公開 URL は `https://<owner>.github.io/<repo>/` です。

プロジェクトサイトはサブパス配下になるため、ワークフローは `BASE_PATH=/<repo>` と `SITE_URL=https://<owner>.github.io` を
環境変数で渡してビルドしています。内部リンクは `localePath()` / `withBase()` 経由で生成しているので、
`href="/..."` のようにルート相対パスを直接書かないでください。フォントや背景画像など CSS から参照するファイルは
`src/assets/` に置き、相対パスで参照します (Vite がベースパスを付けます)。

ローカルで Pages と同じ条件のビルドを確認するには次のようにします。

```bash
SITE_URL=https://annpin.github.io BASE_PATH=/niigata-bioinfo npm run build
```

### 本番公開 (rsync、現在は無効)

本番サーバーへの rsync デプロイは `.github/workflows/deploy-rsync.yml.disabled` に全行コメントで残してあります。
本番に切り替えるときは、ファイル名を `deploy.yml` に戻してコメントを外し、Secrets
(`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`、任意で `DEPLOY_PORT`, `DEPLOY_KNOWN_HOSTS`) を設定します。
その際 `pages.yml` は止めるか、テスト用ブランチに限定してください。

旧 URL のリダイレクトは `redirects/nginx-redirects.conf` を nginx の `server` ブロックで、
`redirects/legacy-ids.map` (旧 WordPress の投稿 ID → 新 URL の対応表) を `http` ブロックで include します。
Cloudflare Pages / Netlify に置く場合は `redirects/_redirects` と `_redirects.legacy-ids` を連結して `public/_redirects` に置いてください。
対応表は ID を廃止した時点で 1 回だけ生成したもので、以後の保守は不要です。

これらのリダイレクトは配信サーバー側の設定なので、開発サーバー (`npm run dev`) と GitHub Pages では動きません
(旧 URL は 404 になります)。本番の nginx に載せた時点で有効になります。

## 移行について

`migration/` の WordPress エクスポート (git 管理外) から 2026-10-08 に一括変換しました。
会員限定だった内部ブログ (研究レポート) とラボミーティングのページ、添付ファイルは移行していません。
