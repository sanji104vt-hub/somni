// gen-goods.mjs
// public/index.html 内の PRODUCTS 配列 + AFFILIATE_MAP から、画像URLとアフィリエイトURL両方が
// 揃っている商品だけを対象に、個別ページ public/goods/{slug}.html を生成する。
//
// slug は keyword の MD5 先頭10文字。keyword が固定なので slug も安定して固定される
// (指示書「一度生成した slug は変更しない」の要件を満たす)。
//
// 各ページは既存コラム記事(public/column/*.html)と同じCSSトークン・フォント・トーンで統一。

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CONFIG = {
  siteUrl: 'https://somni.asutelu.com',
  indexHtmlPath: './public/index.html',
  outDir: './public/goods',
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

function priceToNumber(priceStr) {
  if (typeof priceStr !== 'string') return null;
  const m = priceStr.match(/([\d,]+)/);
  return m ? m[1].replace(/,/g, '') : null;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPage(p, relatedProducts) {
  const rakutenUrl = p.affiliateUrl;
  const price = priceToNumber(p.price);
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    url: `${CONFIG.siteUrl}/goods/${p.slug}`,
    image: p.img,
    brand: { '@type': 'Brand', name: p.brand },
    category: p.cat,
    description: p.good,
    offers: {
      '@type': 'Offer',
      price: price || undefined,
      priceCurrency: 'JPY',
      url: rakutenUrl,
    },
  };
  const cleanedJsonLd = JSON.parse(JSON.stringify(productJsonLd));
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${CONFIG.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: '快眠グッズ一覧', item: `${CONFIG.siteUrl}/goods/` },
      { '@type': 'ListItem', position: 3, name: p.name, item: `${CONFIG.siteUrl}/goods/${p.slug}` },
    ],
  };
  const title = `${p.name}の向く人・向かない人 | Somni`;
  const description = `${p.name}(${p.brand})の特徴、価格目安${p.price}、向く人・向かない人を正直に紹介。${p.good} 向かない人: ${p.notFor}`.slice(0, 155);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="google-site-verification" content="UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q">
<link rel="canonical" href="${CONFIG.siteUrl}/goods/${p.slug}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${CONFIG.siteUrl}/goods/${p.slug}">
<meta property="og:site_name" content="Somni">
<meta property="og:image" content="${esc(p.img)}">
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

<script type="application/ld+json">${JSON.stringify(cleanedJsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>

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
.wrap{max-width:900px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-family:var(--serif);font-weight:600;letter-spacing:.04em;line-height:1.5}
h1{font-size:clamp(1.4rem,3.4vw,1.9rem);margin-bottom:8px}
h2{font-size:1.2rem;margin:36px 0 14px}
header{position:sticky;top:0;z-index:50;background:rgba(12,15,34,.82);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.nav{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-family:var(--serif);font-size:1.3rem;letter-spacing:.18em;color:var(--moon);text-decoration:none}
.logo small{font-size:.62rem;letter-spacing:.3em;color:var(--lavender);display:block;line-height:1;margin-top:2px}
.nav-links{display:flex;gap:22px;font-size:.82rem}
.nav-links a{color:var(--moon-dim);text-decoration:none;transition:color .2s}
.nav-links a:hover,.nav-links a:focus-visible{color:var(--amber-soft)}
.crumbs{font-size:.78rem;color:var(--moon-dim);padding:22px 0 0}
.crumbs a{color:var(--amber-soft);text-decoration:none}
.crumbs a:hover{text-decoration:underline}
.product{margin:34px 0 40px;display:grid;grid-template-columns:320px 1fr;gap:36px;align-items:start}
@media(max-width:720px){.product{grid-template-columns:1fr}}
.thumb{background:#fff;border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.35);padding:14px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;overflow:hidden}
.thumb img{max-width:100%;max-height:100%;object-fit:contain}
.meta .cat{font-size:.68rem;letter-spacing:.24em;color:var(--lavender);text-transform:uppercase}
.meta .brand{font-size:.85rem;color:var(--moon-dim);margin-top:4px}
.meta .price{font-family:var(--serif);color:var(--amber-soft);font-size:1.15rem;margin-top:14px}
.meta .tags{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px}
.meta .tags i{font-style:normal;font-size:.68rem;border:1px solid var(--line);border-radius:999px;padding:2px 9px;color:var(--moon-dim)}
.section-good p,.section-notfor p{margin-top:8px;color:var(--moon-dim)}
.section-notfor{background:rgba(12,15,34,.55);border-left:2px solid var(--lavender);padding:14px 18px;border-radius:0 8px 8px 0;margin-top:26px}
.section-notfor h3{color:var(--lavender);font-size:.95rem;font-family:var(--sans);letter-spacing:.02em}
.cta-row{margin:28px 0}
.btn{display:inline-block;text-decoration:none;font-weight:700;font-size:.92rem;padding:14px 30px;border-radius:999px;transition:transform .15s,box-shadow .2s}
.btn:focus-visible{outline:2px solid var(--amber-soft);outline-offset:3px}
.btn-primary{background:var(--amber);color:var(--night-deep);box-shadow:0 6px 24px rgba(217,164,95,.25)}
.btn-primary:hover{transform:translateY(-2px)}
.related{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:12px}
.related a{display:block;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--card);text-decoration:none;color:var(--moon);transition:border-color .15s}
.related a:hover,.related a:focus-visible{border-color:var(--amber)}
.related .r-cat{font-size:.66rem;letter-spacing:.2em;color:var(--lavender);text-transform:uppercase}
.related .r-name{font-family:var(--serif);font-size:.95rem;margin-top:6px;line-height:1.5}
.related .r-brand{font-size:.72rem;color:var(--moon-dim);margin-top:4px}
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
      <a href="/goods/">グッズを探す</a>
      <a href="/#column">コラム</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <p class="crumbs"><a href="/">Somni</a> / <a href="/goods/">快眠グッズ一覧</a> / ${esc(p.name)}</p>

  <div class="product">
    <div class="thumb"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="eager" width="500" height="500"></div>
    <div class="meta">
      <span class="cat">${esc(p.cat)}</span>
      <h1>${esc(p.name)}</h1>
      <p class="brand">${esc(p.brand)}</p>
      <p class="price">価格目安 ${esc(p.price)}</p>
      <div class="tags">${(p.tags||[]).map(t=>`<i>#${esc(t)}</i>`).join('')}</div>
      <div class="cta-row"><a class="btn btn-primary" href="${esc(rakutenUrl)}" target="_blank" rel="nofollow sponsored noopener" onclick="track('product_click',{source:'goods_page',category:'${esc(p.cat)}'})">楽天で最新価格を見る →</a></div>
    </div>
  </div>

  <section class="section-good">
    <h2>この商品の良いところ</h2>
    <p>${esc(p.good)}</p>
  </section>

  <section class="section-notfor">
    <h3>向かない人</h3>
    <p>${esc(p.notFor)}</p>
  </section>

  ${relatedProducts.length ? `<section>
    <h2>同じカテゴリの他の選択肢</h2>
    <div class="related">
      ${relatedProducts.map(r => `<a href="/goods/${r.slug}" onclick="track('product_detail_click',{source:'related_goods',category:'${esc(r.cat)}'})"><span class="r-cat">${esc(r.cat)}</span><div class="r-name">${esc(r.name)}</div><div class="r-brand">${esc(r.brand)}</div></a>`).join('')}
    </div>
  </section>` : ''}

  <a class="back-link" href="/goods/">← すべてのグッズ一覧に戻る</a>
</div>

<footer>
  <div class="wrap">
    <p class="policy"><strong>このサイトの方針:</strong> Somniは医療情報を提供するサイトではありません。掲載しているのは、眠る環境を整えるための道具と考え方です。商品リンクにはアフィリエイトリンクを含みます。価格・仕様は変動するため、購入前に必ずリンク先の最新情報をご確認ください。</p>
    <p>&copy; 2026 Somni — 眠りの手引き</p>
  </div>
</footer>
</body>
</html>
`;
}

function renderIndexPage(products, byCategory) {
  const title = `快眠グッズ一覧｜枕・マットレス・睡眠改善グッズ${products.length}点 | Somni`;
  const description = `枕・マットレス・寝具・光・音・スリープテックなど、詳細情報と実商品URLを確認できる快眠グッズ${products.length}点をカテゴリ別に掲載。向く人・向かない人まで正直に紹介します。`;
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${CONFIG.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: '快眠グッズ一覧', item: `${CONFIG.siteUrl}/goods/` },
    ],
  };
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Somni 快眠グッズ一覧',
    url: `${CONFIG.siteUrl}/goods/`,
    description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
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
<link rel="canonical" href="${CONFIG.siteUrl}/goods/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${CONFIG.siteUrl}/goods/">
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
<script type="application/ld+json">${JSON.stringify(collectionJsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>

<style>
:root{--night:#12162e;--night-deep:#0c0f22;--night-soft:#1b2140;--moon:#f3efe4;--moon-dim:#b9b6ac;--amber:#d9a45f;--amber-soft:#e8c9a0;--lavender:#8d93c8;--line:rgba(243,239,228,.14);--card:rgba(27,33,64,.72);--serif:'Shippori Mincho',serif;--sans:'Zen Kaku Gothic New',sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:linear-gradient(180deg,var(--night-deep),var(--night) 30%,#161b38);color:var(--moon);line-height:1.8;letter-spacing:.02em;font-size:15.5px;min-height:100vh}
a{color:var(--amber-soft)}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-family:var(--serif);font-weight:600;line-height:1.5}
header{position:sticky;top:0;z-index:50;background:rgba(12,15,34,.88);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.nav{display:flex;align-items:center;justify-content:space-between;height:60px}.logo{font-family:var(--serif);font-size:1.3rem;letter-spacing:.18em;color:var(--moon);text-decoration:none}.logo small{font-size:.62rem;letter-spacing:.3em;color:var(--lavender);display:block;line-height:1;margin-top:2px}.nav-links{display:flex;gap:22px;font-size:.82rem}.nav-links a{color:var(--moon-dim);text-decoration:none}.nav-links a:hover{color:var(--amber-soft)}
.crumbs{font-size:.78rem;color:var(--moon-dim);padding:22px 0}.crumbs a{text-decoration:none}
.hero{padding:26px 0 34px;border-bottom:1px solid var(--line)}.eyebrow{font-size:.7rem;letter-spacing:.24em;color:var(--amber);text-transform:uppercase}.hero h1{font-size:clamp(1.7rem,4vw,2.5rem);margin:10px 0}.hero .lead{max-width:760px;color:var(--moon-dim)}
.cat-nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}.cat-nav a{font-size:.78rem;text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:6px 13px;color:var(--moon-dim)}.cat-nav a:hover{border-color:var(--amber);color:var(--amber-soft)}
.cat-section{padding-top:40px;scroll-margin-top:70px}.cat-section h2{font-size:1.35rem;margin-bottom:16px}.cat-section h2 small{font-family:var(--sans);font-size:.72rem;color:var(--lavender);margin-left:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.item{display:flex;flex-direction:column;gap:9px;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--moon);text-decoration:none;transition:border-color .15s,transform .15s}.item:hover,.item:focus-visible{border-color:var(--amber);transform:translateY(-2px)}
.thumb{width:100%;aspect-ratio:1;background:#fff;border-radius:9px;overflow:hidden;display:flex;align-items:center;justify-content:center}.thumb img{width:100%;height:100%;object-fit:contain;padding:8px}.cat{font-size:.64rem;letter-spacing:.18em;color:var(--lavender)}.item h3{font-size:.92rem}.brand{font-size:.72rem;color:var(--moon-dim)}.price{font-family:var(--serif);font-size:.86rem;color:var(--amber-soft)}.honest{font-size:.75rem;color:var(--moon-dim);border-left:2px solid var(--lavender);padding-left:8px}
.back{display:inline-block;margin:46px 0 0;text-decoration:none}
footer{border-top:1px solid var(--line);padding:36px 0 60px;margin-top:60px;font-size:.78rem;color:var(--moon-dim)}footer .policy{max-width:720px;line-height:2;margin-bottom:16px}
@media(max-width:680px){.nav-links a:not(:first-child){display:none}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.item{padding:10px}.item h3{font-size:.82rem}.honest{display:none}}
@media(max-width:420px){.grid{grid-template-columns:1fr 1fr}.wrap{padding:0 14px}}
</style>
</head>
<body>
<header><div class="wrap nav"><a class="logo" href="/">SOMNI<small>眠りの手引き</small></a><nav class="nav-links" aria-label="メイン"><a href="/goods/">グッズ一覧</a><a href="/#quiz">睡眠タイプ診断</a><a href="/#column">コラム</a></nav></div></header>
<main class="wrap">
  <p class="crumbs"><a href="/">Somni</a> / 快眠グッズ一覧</p>
  <section class="hero">
    <span class="eyebrow">Honest Picks Index</span>
    <h1>快眠グッズ一覧</h1>
    <p class="lead">画像・価格・実商品URLを確認できる${products.length}点を、カテゴリ別にまとめました。各商品ページでは、良いところだけでなく「向かない人」も確認できます。価格は変動するため、購入前にリンク先の最新情報をご確認ください。</p>
    <nav class="cat-nav" aria-label="商品カテゴリ">${[...byCategory.keys()].map(cat => `<a href="#${encodeURIComponent(cat)}">${esc(cat)} (${byCategory.get(cat).length})</a>`).join('')}</nav>
  </section>
  ${[...byCategory.entries()].map(([cat, items]) => `<section class="cat-section" id="${esc(cat)}"><h2>${esc(cat)}<small>${items.length}点</small></h2><div class="grid">${items.map(p => `<a class="item" href="/goods/${p.slug}" onclick="track('product_detail_click',{source:'goods_index',category:'${esc(p.cat)}'})"><div class="thumb"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="280" height="280"></div><span class="cat">${esc(p.cat)}</span><h3>${esc(p.name)}</h3><span class="brand">${esc(p.brand)}</span><span class="price">価格目安 ${esc(p.price)}</span><p class="honest">向かない人: ${esc(p.notFor)}</p></a>`).join('')}</div></section>`).join('')}
  <a class="back" href="/">← 睡眠タイプ診断とトップページへ</a>
</main>
<footer><div class="wrap"><p class="policy"><strong>このサイトの方針:</strong> Somniは医療情報を提供するサイトではありません。掲載しているのは、眠る環境を整えるための道具と考え方です。商品詳細ページにはアフィリエイトリンクを含みます。</p><p>&copy; 2026 Somni — 眠りの手引き</p></div></footer>
</body>
</html>`;
}

function main() {
  const html = readFileSync(CONFIG.indexHtmlPath, 'utf-8');
  const productsArrText = extractArrayBlock(html, 'const PRODUCTS = [');
  const products = new Function('return ' + productsArrText)();
  const mapText = extractArrayBlock(html, 'const AFFILIATE_MAP = {');
  const affiliateMap = new Function('return ' + mapText)();

  // 画像URL と アフィリエイトURL 両方が揃った商品だけ
  const eligible = products
    .filter(p => p.img && affiliateMap[p.keyword])
    .map(p => ({
      ...p,
      affiliateUrl: affiliateMap[p.keyword],
      slug: slugFromKeyword(p.keyword),
    }));

  // 出力ディレクトリを一度クリアして再生成(再実行冪等性)
  if (existsSync(CONFIG.outDir)) rmSync(CONFIG.outDir, { recursive: true, force: true });
  mkdirSync(CONFIG.outDir, { recursive: true });

  // カテゴリ別インデックス(内部リンク用)
  const byCategory = new Map();
  for (const p of eligible) {
    if (!byCategory.has(p.cat)) byCategory.set(p.cat, []);
    byCategory.get(p.cat).push(p);
  }

  let count = 0;
  for (const p of eligible) {
    const sameCat = (byCategory.get(p.cat) || []).filter(x => x.slug !== p.slug);
    // 現商品と近い価格帯 4件を選ぶ(価格情報がない場合は先頭4件)
    const priceNum = Number((p.price || '').replace(/[^\d]/g, '')) || 0;
    const related = sameCat
      .map(x => ({ x, d: Math.abs((Number((x.price || '').replace(/[^\d]/g, '')) || 0) - priceNum) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map(({ x }) => x);
    writeFileSync(`${CONFIG.outDir}/${p.slug}.html`, renderPage(p, related), 'utf-8');
    count++;
  }

  writeFileSync(`${CONFIG.outDir}/index.html`, renderIndexPage(eligible, byCategory), 'utf-8');

  console.log(`gen-goods: 対象商品=${eligible.length}件 / 詳細ページ=${count}件 / 一覧ページ=1件`);
  console.log(`カテゴリ別内訳: ${[...byCategory.entries()].map(([k, v]) => `${k}=${v.length}`).join(', ')}`);
}

main();
