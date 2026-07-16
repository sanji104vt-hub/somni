// gen-types.mjs
// 診断タイプ A/B/C/D それぞれに対して /type/{a|b|c|d}.html を生成する。
// TYPES.cats に含まれるカテゴリの商品を「カテゴリ×悩み」掛け合わせセクションとして並べる。
// index.html 内の TYPES / PRODUCTS / AFFILIATE_MAP をパースして流用する。

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CONFIG = {
  siteUrl: 'https://somni.asutelu.com',
  indexHtmlPath: './public/index.html',
  outDir: './public/type',
  perCategoryLimit: 6,
};

function extractArrayBlock(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`${marker} が見つかりません`);
  const openBracket = marker.includes('[') ? '[' : '{';
  const closeBracket = openBracket === '[' ? ']' : '}';
  const arrStart = html.indexOf(openBracket, start);
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

function slugFromKeyword(keyword) {
  return createHash('md5').update(keyword).digest('hex').slice(0, 10);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPage(typeKey, type, groupedProducts) {
  const typeSlug = typeKey.toLowerCase();
  const cleanTypeName = type.name.replace(/[^\S ]/g, '').trim(); // 絵文字も含めて残す
  const title = `${cleanTypeName}に向く快眠グッズと今夜の対策 | Somni`;
  const description = `${cleanTypeName}の原因仮説と、今夜からできる対策、相性のよい快眠グッズを紹介。${type.cause}`.slice(0, 155);
  const visibleProducts = type.cats.flatMap(cat => (groupedProducts.get(cat) || []).slice(0, CONFIG.perCategoryLimit));
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${CONFIG.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: '睡眠タイプ別ガイド', item: `${CONFIG.siteUrl}/#quiz` },
      { '@type': 'ListItem', position: 3, name: cleanTypeName, item: `${CONFIG.siteUrl}/type/${typeSlug}` },
    ],
  };
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url: `${CONFIG.siteUrl}/type/${typeSlug}`,
    description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: visibleProducts.length,
      itemListElement: visibleProducts.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.name,
          image: p.img,
          url: `${CONFIG.siteUrl}/goods/${p.slug}`,
        },
      })),
    },
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="google-site-verification" content="UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q">
<link rel="canonical" href="${CONFIG.siteUrl}/type/${typeSlug}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${CONFIG.siteUrl}/type/${typeSlug}">
<meta property="og:site_name" content="Somni">
<meta property="og:image" content="${CONFIG.siteUrl}/ogp.png">
<meta name="theme-color" content="#12162e">

<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-L6WT832DW8"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-L6WT832DW8');
  function track(name, params){
    if(typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet">

<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(collectionJsonLd)}</script>

<style>
:root{
  --night:#12162e;--night-deep:#0c0f22;--night-soft:#1b2140;
  --moon:#f3efe4;--moon-dim:#b9b6ac;
  --amber:#d9a45f;--amber-soft:#e8c9a0;
  --lavender:#8d93c8;--line:rgba(243,239,228,.14);
  --card:rgba(27,33,64,.72);
  --serif:'Shippori Mincho', serif;
  --sans:'Zen Kaku Gothic New', sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:linear-gradient(180deg,var(--night-deep) 0%,var(--night) 30%,#161b38 100%);color:var(--moon);line-height:1.9;letter-spacing:.02em;font-size:15.5px;min-height:100vh}
a{color:var(--amber-soft)}
.wrap{max-width:1000px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-family:var(--serif);font-weight:600;letter-spacing:.04em;line-height:1.5}
h1{font-size:clamp(1.6rem,4vw,2.4rem);margin:0 0 12px}
h2{font-size:1.35rem;margin:44px 0 14px}
h3{font-size:1rem}
header{position:sticky;top:0;z-index:50;background:rgba(12,15,34,.82);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.nav{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-family:var(--serif);font-size:1.3rem;letter-spacing:.18em;color:var(--moon);text-decoration:none}
.logo small{font-size:.62rem;letter-spacing:.3em;color:var(--lavender);display:block;line-height:1;margin-top:2px}
.nav-links{display:flex;gap:22px;font-size:.82rem}
.nav-links a{color:var(--moon-dim);text-decoration:none;transition:color .2s}
.nav-links a:hover,.nav-links a:focus-visible{color:var(--amber-soft)}
.crumbs{font-size:.78rem;color:var(--moon-dim);padding:22px 0 0}
.crumbs a{color:var(--amber-soft);text-decoration:none}
.hero-type{padding:20px 0 40px;border-bottom:1px solid var(--line)}
.hero-type .eyebrow{display:inline-block;font-size:.72rem;letter-spacing:.24em;color:var(--amber);border-bottom:1px solid var(--amber);padding-bottom:5px;margin-bottom:14px;text-transform:uppercase}
.hero-type p.lead{color:var(--moon-dim);max-width:640px;margin-top:14px;font-size:.95rem}
.block h4{font-family:var(--serif);color:var(--amber);font-size:.9rem;letter-spacing:.1em;margin:22px 0 6px}
.block p{color:var(--moon-dim);font-size:.93rem}
.cta-row{margin:28px 0}
.btn{display:inline-block;text-decoration:none;font-weight:700;font-size:.92rem;padding:14px 30px;border-radius:999px;transition:transform .15s,box-shadow .2s}
.btn:focus-visible{outline:2px solid var(--amber-soft);outline-offset:3px}
.btn-primary{background:var(--amber);color:var(--night-deep);box-shadow:0 6px 24px rgba(217,164,95,.25)}
.btn-primary:hover{transform:translateY(-2px)}
.btn-ghost{border:1px solid var(--line);color:var(--moon);background:transparent}
.btn-ghost:hover{border-color:var(--amber)}
.cat-section{margin-top:44px}
.cat-section .cat-title{font-family:var(--serif);font-size:1.25rem;margin-bottom:10px}
.cat-section .cat-note{font-size:.85rem;color:var(--moon-dim);margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.grid a{display:flex;flex-direction:column;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--card);text-decoration:none;color:var(--moon);transition:border-color .15s,transform .15s;gap:10px}
.grid a:hover,.grid a:focus-visible{border-color:var(--amber);transform:translateY(-2px)}
.grid .thumb{width:100%;aspect-ratio:1/1;background:#fff;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.grid .thumb img{max-width:100%;max-height:100%;object-fit:contain;padding:8px}
.grid .g-cat{font-size:.64rem;letter-spacing:.2em;color:var(--lavender);text-transform:uppercase}
.grid .g-name{font-family:var(--serif);font-size:.9rem;line-height:1.5}
.grid .g-price{font-family:var(--serif);color:var(--amber-soft);font-size:.85rem}
footer{border-top:1px solid var(--line);padding:36px 0 60px;margin-top:60px;font-size:.78rem;color:var(--moon-dim)}
footer .policy{max-width:640px;line-height:2;margin-bottom:16px}
.back-link{display:inline-block;margin:24px 0 0;color:var(--lavender);text-decoration:none;font-size:.85rem}
.back-link:hover{color:var(--amber-soft)}
</style>
</head>
<body>
<header>
  <div class="wrap nav">
    <a class="logo" href="/">SOMNI<small>眠りの手引き</small></a>
    <nav class="nav-links" aria-label="メイン">
      <a href="/#quiz">睡眠タイプ診断</a>
      <a href="/#products">グッズを探す</a>
      <a href="/#column">コラム</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <p class="crumbs"><a href="/">Somni</a> / <a href="/#quiz">睡眠タイプ別ガイド</a> / ${esc(cleanTypeName)}</p>

  <section class="hero-type">
    <span class="eyebrow">Sleep Type ${typeKey}</span>
    <h1>${esc(cleanTypeName)} のあなたへ</h1>
    <p class="lead">${esc(type.cause)}</p>
  </section>

  <div class="block">
    <h4>今夜からできる、お金のかからないこと</h4>
    <p>${esc(type.tonight)}</p>
    <h4>頼っていい道具</h4>
    <p>${esc(type.tools)}</p>
  </div>

  <div class="cta-row">
    <a class="btn btn-primary" href="/?type=${typeKey}">診断ページで結果を確認する</a>
    <a class="btn btn-ghost" href="/#quiz" style="margin-left:8px">最初から診断する</a>
  </div>

  <h2>このタイプに向く道具(カテゴリ別)</h2>
  <p style="color:var(--moon-dim);font-size:.9rem;margin-top:-4px">「${esc(cleanTypeName)}」の傾向に合わせて、対応するカテゴリの商品をカテゴリ別に並べています。</p>

  ${type.cats.map(cat => {
    const items = groupedProducts.get(cat) || [];
    if (items.length === 0) return '';
    return `<section class="cat-section">
      <h3 class="cat-title">${esc(cat)}</h3>
      <div class="grid">
        ${items.slice(0, CONFIG.perCategoryLimit).map(p => `
        <a href="/goods/${p.slug}" onclick="track('product_detail_click',{source:'type_page',sleep_type:'${typeKey}',category:'${esc(p.cat)}'})">
          <div class="thumb"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="240" height="240"></div>
          <span class="g-cat">${esc(p.cat)}</span>
          <div class="g-name">${esc(p.name)}</div>
          <div class="g-price">${esc(p.price || '')}</div>
        </a>
        `).join('')}
      </div>
    </section>`;
  }).join('')}

  <a class="back-link" href="/#quiz">← 診断に戻る</a>
</div>

<footer>
  <div class="wrap">
    <p class="policy"><strong>このサイトの方針:</strong> Somniは医療情報を提供するサイトではありません。掲載しているのは、眠る環境を整えるための道具と考え方です。商品リンクにはアフィリエイトリンクを含みます。つらい不眠が続く場合は、医療機関への相談を優先してください。</p>
    <p>&copy; 2026 Somni — 眠りの手引き</p>
  </div>
</footer>
</body>
</html>
`;
}

function main() {
  const html = readFileSync(CONFIG.indexHtmlPath, 'utf-8');
  const typesText = extractArrayBlock(html, 'const TYPES = {');
  const types = new Function('return ' + typesText)();
  const productsText = extractArrayBlock(html, 'const PRODUCTS = [');
  const products = new Function('return ' + productsText)();
  const mapText = extractArrayBlock(html, 'const AFFILIATE_MAP = {');
  const affiliateMap = new Function('return ' + mapText)();

  // 画像+アフィリURLが揃っている商品だけを対象化
  const eligible = products
    .filter(p => p.img && affiliateMap[p.keyword])
    .map(p => ({ ...p, slug: slugFromKeyword(p.keyword) }));

  const byCategory = new Map();
  for (const p of eligible) {
    if (!byCategory.has(p.cat)) byCategory.set(p.cat, []);
    byCategory.get(p.cat).push(p);
  }

  if (existsSync(CONFIG.outDir)) rmSync(CONFIG.outDir, { recursive: true, force: true });
  mkdirSync(CONFIG.outDir, { recursive: true });

  let count = 0;
  for (const [key, type] of Object.entries(types)) {
    const filename = `${key.toLowerCase()}.html`;
    writeFileSync(`${CONFIG.outDir}/${filename}`, renderPage(key, type, byCategory), 'utf-8');
    count++;
  }
  console.log(`gen-types: 生成=${count}件 (${Object.keys(types).join('/')})`);
}

main();
