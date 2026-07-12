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
    image: p.img,
    brand: { '@type': 'Brand', name: p.brand },
    category: p.cat,
    description: p.good,
    offers: {
      '@type': 'Offer',
      price: price || undefined,
      priceCurrency: 'JPY',
      url: rakutenUrl,
      availability: 'https://schema.org/InStock',
    },
  };
  const cleanedJsonLd = JSON.parse(JSON.stringify(productJsonLd));
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${CONFIG.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: p.cat, item: `${CONFIG.siteUrl}/#products` },
      { '@type': 'ListItem', position: 3, name: p.name, item: `${CONFIG.siteUrl}/goods/${p.slug}.html` },
    ],
  };
  const title = `${p.name} | Somni`;
  const description = `${p.name}(${p.brand})の紹介と「向かない人」まで正直に書きます。${p.good}`.slice(0, 150);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="google-site-verification" content="UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q">
<link rel="canonical" href="${CONFIG.siteUrl}/goods/${p.slug}.html">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(p.name)} | Somni">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${CONFIG.siteUrl}/goods/${p.slug}.html">
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
      <a href="/#products">グッズを探す</a>
      <a href="/#column">コラム</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <p class="crumbs"><a href="/">Somni</a> / <a href="/#products">${esc(p.cat)}</a> / ${esc(p.name)}</p>

  <div class="product">
    <div class="thumb"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="eager" width="500" height="500"></div>
    <div class="meta">
      <span class="cat">${esc(p.cat)}</span>
      <h1>${esc(p.name)}</h1>
      <p class="brand">${esc(p.brand)}</p>
      <p class="price">価格目安 ${esc(p.price)}</p>
      <div class="tags">${(p.tags||[]).map(t=>`<i>#${esc(t)}</i>`).join('')}</div>
      <div class="cta-row"><a class="btn btn-primary" href="${esc(rakutenUrl)}" target="_blank" rel="nofollow sponsored noopener">楽天で最新価格を見る →</a></div>
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
      ${relatedProducts.map(r => `<a href="/goods/${r.slug}.html"><span class="r-cat">${esc(r.cat)}</span><div class="r-name">${esc(r.name)}</div><div class="r-brand">${esc(r.brand)}</div></a>`).join('')}
    </div>
  </section>` : ''}

  <a class="back-link" href="/#products">← すべてのグッズ一覧に戻る</a>
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

  console.log(`gen-goods: 対象商品=${eligible.length}件 / 生成=${count}件`);
  console.log(`カテゴリ別内訳: ${[...byCategory.entries()].map(([k, v]) => `${k}=${v.length}`).join(', ')}`);
}

main();
