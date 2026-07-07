// generate-seo.mjs
// Somni ビルド時SEO強化スクリプト。
// 役割: public/index.html 内の PRODUCTS 配列と AFFILIATE_MAP を読み取り、
//   (1) カテゴリ別 Product/ItemList JSON-LD
//   (2) BreadcrumbList
//   (3) sitemap.xml
//   (4) robots.txt
// を生成し、index.html の </body> 直前へ構造化データを注入する。
//
// 元の指示書は data/products.json 前提だったが、SomniはPRODUCTS配列を
// index.html 内に直接持つ設計のため、そこから抽出する構成に変更している。
// 再実行しても JSON-LD は同じマーカーで置き換えるので重複しない。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONFIG = {
  siteUrl: 'https://somni.sanji-104vt.workers.dev',
  indexHtmlPath: './public/index.html',
  outDir: './public',
  extraSitemapUrls: [
    { loc: 'https://somni.sanji-104vt.workers.dev/depth.html', priority: '0.8', changefreq: 'monthly' },
    { loc: 'https://somni.sanji-104vt.workers.dev/column/nell-vs-koala.html', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://somni.sanji-104vt.workers.dev/column/hitsuji-kokai.html', priority: '0.7', changefreq: 'monthly' },
  ],
};

function loadIndexHtml() {
  if (!existsSync(CONFIG.indexHtmlPath)) {
    throw new Error(`index.html が見つかりません: ${CONFIG.indexHtmlPath}`);
  }
  return readFileSync(CONFIG.indexHtmlPath, 'utf-8');
}

function extractArrayBlock(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`${marker} が見つかりません`);
  const openBracket = marker.includes('[') ? '[' : '{';
  const closeBracket = openBracket === '[' ? ']' : '}';
  const arrStart = html.indexOf(openBracket, start);
  // 対応する閉じ括弧をブラケット深度で追跡(文字列内の [ ] { } を跨がないよう単純ステートマシン)
  let depth = 0;
  let inStr = false;
  let strCh = '';
  for (let i = arrStart; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === openBracket) depth++;
    else if (c === closeBracket) {
      depth--;
      if (depth === 0) return html.slice(arrStart, i + 1);
    }
  }
  throw new Error(`${marker} の閉じ括弧が見つかりません`);
}

function parseProducts(html) {
  const arrText = extractArrayBlock(html, 'const PRODUCTS = [');
  // JS objectリテラル(キーがクオートなし)を Function で評価
  const arr = new Function('return ' + arrText)();
  return arr;
}

function parseAffiliateMap(html) {
  const mapText = extractArrayBlock(html, 'const AFFILIATE_MAP = {');
  return new Function('return ' + mapText)();
}

function groupByCategory(products) {
  const map = new Map();
  for (const p of products) {
    const cat = p.cat || 'その他';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(p);
  }
  return map;
}

function priceToNumber(priceStr) {
  // "約33,660円" -> "33660"
  if (typeof priceStr !== 'string') return null;
  const m = priceStr.match(/([\d,]+)/);
  if (!m) return null;
  const n = m[1].replace(/,/g, '');
  return n;
}

function toProductSchema(p, affiliateMap) {
  const price = priceToNumber(p.price);
  const url = affiliateMap[p.keyword] ||
    `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(p.keyword)}/`;
  const schema = {
    '@type': 'Product',
    name: p.name,
    image: p.img || undefined,
    brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
    category: p.cat,
    offers: {
      '@type': 'Offer',
      price: price || undefined,
      priceCurrency: 'JPY',
      url,
      availability: 'https://schema.org/InStock',
    },
  };
  return JSON.parse(JSON.stringify(schema));
}

function buildItemListBlocks(grouped, affiliateMap) {
  return [...grouped.entries()].map(([category, items]) => {
    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Somni | ${category} の快眠グッズ`,
      itemListElement: items.slice(0, 50).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: toProductSchema(p, affiliateMap),
      })),
    };
    return `<script type="application/ld+json">${JSON.stringify(itemList)}</script>`;
  });
}

function buildBreadcrumb(categories) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${CONFIG.siteUrl}/` },
      ...categories.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: c,
        item: `${CONFIG.siteUrl}/#${encodeURIComponent(c)}`,
      })),
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

function injectIntoHtml(blocks) {
  let html = readFileSync(CONFIG.indexHtmlPath, 'utf-8');
  const markerStart = '<!-- SEO:PRODUCT-SCHEMA:START -->';
  const markerEnd = '<!-- SEO:PRODUCT-SCHEMA:END -->';
  const payload = `${markerStart}\n${blocks.join('\n')}\n${markerEnd}`;
  if (html.includes(markerStart) && html.includes(markerEnd)) {
    const re = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`);
    html = html.replace(re, payload);
  } else {
    html = html.replace('</body>', `${payload}\n</body>`);
  }
  writeFileSync(CONFIG.indexHtmlPath, html, 'utf-8');
}

function buildSitemap(extraUrls = []) {
  // 商品はページ内アンカーで独立URLを持たないため個別loc化しない。
  // フェイクURLで水増ししないという方針に沿う。
  const urls = [
    { loc: `${CONFIG.siteUrl}/`, priority: '1.0', changefreq: 'weekly' },
    ...extraUrls,
  ];
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  writeFileSync(`${CONFIG.outDir}/sitemap.xml`, xml, 'utf-8');
}

function buildRobotsTxt() {
  const txt = `User-agent: *
Allow: /

Sitemap: ${CONFIG.siteUrl}/sitemap.xml

# content signals
search: yes
ai-input: yes
ai-train: no
`;
  writeFileSync(`${CONFIG.outDir}/robots.txt`, txt, 'utf-8');
}

function main() {
  const html = loadIndexHtml();
  const products = parseProducts(html);
  const affiliateMap = parseAffiliateMap(html);
  const grouped = groupByCategory(products);
  const categories = [...grouped.keys()];
  const itemListBlocks = buildItemListBlocks(grouped, affiliateMap);
  const breadcrumb = buildBreadcrumb(categories);

  injectIntoHtml([breadcrumb, ...itemListBlocks]);
  buildSitemap(CONFIG.extraSitemapUrls);
  buildRobotsTxt();

  console.log(`SEO生成完了: カテゴリ数=${categories.length} / 商品数=${products.length} / AFFILIATE_MAP=${Object.keys(affiliateMap).length}`);
  console.log(`カテゴリ: ${categories.join(', ')}`);
}

main();
