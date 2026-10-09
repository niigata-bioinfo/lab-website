import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/** 研究業績の種別。表示色と絞り込みに使う。 */
export const publicationTypes = ['paper', 'poster', 'talk', 'lecture', 'others'] as const;

const tagSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'tags は小文字英数字とハイフンのみ (例: gut-microbiome)');

/**
 * 1 件の研究業績。識別子は書かない。ページ内アンカーと重複チェックに使うキーは
 * 日付・種別・タイトルからビルド時に導出する (src/lib/pubkey.ts)。
 */
export const publicationSchema = z.object({
  type: z.enum(publicationTypes),
  /** 並び順に使う日付。年ファイルの年と一致していること。 */
  date: z.coerce.date(),
  title: z.string().min(1),
  /** 整形済みの引用文字列。1 行で書く。 */
  citation: z.string().min(1),
  pmid: z.number().int().positive().optional(),
  /** PubMed Central の ID。"PMC" 付きで書く。 */
  pmcid: z.string().regex(/^PMC\d+$/, 'pmcid は PMC1234567 の形式').optional(),
  doi: z.string().regex(/^10\.\d{4,9}\/\S+$/, 'doi は 10. で始まる識別子のみ (URL ではない)').optional(),
  /** PubMed / DOI 以外の外部リンク。label がそのままリンク文字列になる。 */
  links: z.array(z.object({ label: z.string().min(1), url: z.url() })).default([]),
  tags: z.array(tagSlug).default([]),
  /** 省略時は日英両方に表示。`ja` なら英語ページから除外する。 */
  lang: z.enum(['ja', 'en']).optional(),
}).strict();

/** 年ごとの YAML ファイル (src/content/publications/2024.yaml) が 1 エントリ。中身は業績の配列。 */
const publications = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/publications' }),
  schema: z.array(publicationSchema),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  /** URL はファイル名から決まる: src/content/news/2026-10-10-hupo-symposium.md → /news/2026-10-10-hupo-symposium/ */
  schema: z.object({
    title: z.string().min(1),
    date: z.coerce.date(),
    /** 英語版サイトにも載せる場合は en のタイトルを書く。本文は共通。 */
    titleEn: z.string().optional(),
  }).strict(),
});

/** 固定ページ。src/content/pages/<lang>/<slug>.md */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string().min(1),
  }),
});

const localized = z.object({ ja: z.string().min(1), en: z.string().min(1) });
const localizedOptional = z.object({ ja: z.string().optional(), en: z.string().optional() });

/** 経歴・学歴などの見出し付き箇条書き。 */
const bioSection = z.object({ heading: z.string().min(1), items: z.array(z.string().min(1)) });

const memberSchema = z.object({
  name: localized,
  /** 役職。括弧書きの所属などもここに含めてよい。 */
  title: localized,
  /** 学位 (Ph.D. など)。書いた場合は英語ページで役職の前に表示。 */
  degree: z.string().optional(),
  /** 所属。複数行可 (YAML の `|` ブロック)。 */
  affiliation: localizedOptional.optional(),
  /** 経歴などの補足。言語ごとに見出し付きリストの配列。 */
  bio: z.object({ ja: z.array(bioSection).optional(), en: z.array(bioSection).optional() }).optional(),
});

/** 過去のメンバー。名前の後ろに続ける文字列 (役職と在籍期間) をそのまま書く。 */
const alumnusSchema = z.object({
  name: localized,
  detail: localized,
});

/** src/content/members.yaml 1 ファイルのみ。トップレベルのキーが表示グループ。 */
const members = defineCollection({
  loader: glob({ pattern: 'members.yaml', base: './src/content' }),
  schema: z.object({
    faculty: z.array(memberSchema),
    staff: z.array(memberSchema),
    students: z.array(memberSchema),
    collaborators: z.array(memberSchema),
    alumni: z.array(alumnusSchema),
  }),
});

export const collections = { publications, news, pages, members };
