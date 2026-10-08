/**
 * サイト全体の設定。研究室名・住所・連絡先など、年に数回しか変わらない値をここに集約する。
 * 文言 (ボタン名や見出し) は src/i18n/*.json に置く。
 */
export const site = {
  url: 'https://bioinfo.med.niigata-u.ac.jp',
  /** 2013 年開設。フッターの © 表記に使う。 */
  since: 2013,
  contact: {
    ja: {
      heading: '新潟大学医学部メディカルAIセンター・新潟大学大学院医歯学総合研究科バイオインフォーマティクス分野',
      address: '〒951-8514　新潟県新潟市中央区学校町通2番町5274　新潟大学ライフイノベーションハブ3階',
      email: 'okd[at]med.niigata-u.ac.jp',
      tel: '025-227-0390 （研究室）025-227-2139 （教授室）',
      campusMap: '/images/detail_map_new.jpg',
    },
    en: {
      heading: 'Niigata University Graduate School of Medical and Dental Sciences',
      address: '3F Niigata University Life Innovation Hub, 2−5274, Gakkocho-dori, Chuo-ku, Niigata, 951-8514',
      email: 'okd[at]med.niigata-u.ac.jp',
      tel: '+81-25-227-0390',
      campusMap: '/images/detail_map_en_new.jpg',
    },
  },
  /** Google マップの埋め込み URL (iframe の src)。API キーは不要。 */
  mapEmbedUrl:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1014.5911517985741!2d139.03566771135033!3d37.91745914965442!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x5ff4c9e861a6da6b%3A0x26bb9dd255941209!2z5paw5r2f5aSn5a2m5aSn5a2m6ZmiIOWMu-atr-Wtpue3j-WQiOeglOeptuenkeODkOOCpOOCquOCpOODs-ODleOCqeODvOODnuODhuOCo-OCr-OCueWIhumHjg!5e0!3m2!1sja!2sjp!4v1658293658290!5m2!1sja!2sjp',
  /** トップページの「最新の研究業績」に出す件数 */
  topPublications: 6,
  /** トップページとサイドバーの「お知らせ」件数 */
  topNews: 5,
  /** 研究業績一覧の 1 ページあたり件数 */
  publicationsPerPage: 22,
} as const;
