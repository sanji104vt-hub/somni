"""
update_prices.py
=================
Somni (public/index.html) の商品カード内 keyword を使って
楽天市場商品検索API（新API・2026年2月刷新版）を叩き、
1) 実際の最安値レンジを price 欄に反映
2) 商品画像URL(500x500)を img フィールドに反映
3) AFFILIATE_MAP（card()が優先参照する固定URL辞書）を更新
するスクリプト。既存の Sillage 用パイプライン(fetch-rakuten-items.mjs)と
同じ新APIエンドポイント・認証方式に合わせてある。

【実行前に必ず確認すること】
------------------------------------------------------------
1. 環境変数で以下4つを渡す:
     RAKUTEN_APP_ID        アプリケーションID（UUID形式）
     RAKUTEN_ACCESS_KEY    アクセスキー（pk_... 、秘密情報）
     RAKUTEN_AFFILIATE_ID  アフィリエイトID
     RAKUTEN_ORIGIN        アプリ登録した「許可されたWebサイト」
                            (例 https://somni.asutelu.com/)

2. ★ Origin ヘッダの完全一致に注意 ★
   楽天の新APIは、アプリ登録時に設定した「利用サイトURL」と
   リクエストの Origin ヘッダが一致しないと 403/400 エラーを返す。
   末尾スラッシュの有無、http/https、wwwの有無まで厳密一致が必要。
   複数サイトで同一applicationIdを使い回している場合は、
   楽天デベロッパー管理画面の「利用サイトURL」欄に
   somni のドメインも追記登録しておくこと。

3. レート制限: 1リクエストあたり SLEEP_SEC 秒スリープする。

【使い方】
------------------------------------------------------------
$ export RAKUTEN_APP_ID="..."
$ export RAKUTEN_ACCESS_KEY="pk_..."
$ export RAKUTEN_AFFILIATE_ID="..."
$ export RAKUTEN_ORIGIN="https://somni.asutelu.com/"

# まず1〜2件だけ疎通テスト:
$ py update_prices.py public/index.html --limit 2

# 全件本実行:
$ py update_prices.py public/index.html
------------------------------------------------------------
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RAKUTEN_ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601"
SLEEP_SEC = 1.2
MAX_RETRIES = 3


def upsize_image(url: str | None, size: str = "500x500") -> str | None:
    """楽天のサムネイルURLは末尾に ?_ex=128x128 等のサイズ指定が付くことが多い。
    カード表示でぼやけないよう大きめのサイズに置換する。"""
    if not url:
        return None
    if "_ex=" in url:
        return re.sub(r"_ex=\d+x\d+", f"_ex={size}", url)
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}_ex={size}"


def fetch_item(keyword: str, app_id: str, access_key: str, affiliate_id: str, origin: str) -> dict | None:
    """楽天商品検索APIを1件叩いて、最も関連度の高い商品情報を返す。失敗時はNone。
    sort=+itemPrice(価格順)にすると交換バンドや保護フィルムなど無関係な
    安価アクセサリーが先頭に来てしまうため、標準(関連度)ソートを使う。
    429(レート制限)時はexponential backoffで最大MAX_RETRIES回リトライする。"""
    params = {
        "format": "json",
        "hits": 5,
        "imageFlag": 1,
        "applicationId": app_id,
        "accessKey": access_key,
        "keyword": keyword,
    }
    if affiliate_id:
        params["affiliateId"] = affiliate_id

    url = RAKUTEN_ENDPOINT + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    # 新APIは Referer ではなく Origin ヘッダで許可ドメインを判定する。
    req.add_header("Origin", origin)
    req.add_header("User-Agent", "Mozilla/5.0 (compatible; SomniPriceBot/1.0)")

    data = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                data = json.loads(res.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < MAX_RETRIES:
                backoff = 2 ** (attempt + 1)
                print(f"  [HTTP 429] {keyword} -> {backoff}秒待って再試行 ({attempt + 1}/{MAX_RETRIES})")
                time.sleep(backoff)
                continue
            body = e.read().decode("utf-8", errors="ignore")
            print(f"  [HTTP {e.code}] {keyword} -> {body[:200]}")
            return None
        except Exception as e:
            print(f"  [ERROR] {keyword} -> {e}")
            return None

    if data is None:
        return None

    items = data.get("Items", [])
    if not items:
        print(f"  [NO RESULT] {keyword}")
        return None

    item = items[0]["Item"]
    image = (item.get("mediumImageUrls") or [{}])[0].get("imageUrl")
    return {
        "price": item.get("itemPrice"),
        "url": item.get("affiliateUrl") or item.get("itemUrl"),
        "name": item.get("itemName"),
        "img": upsize_image(image),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("html_path", help="public/index.htmlのパス")
    parser.add_argument("--limit", type=int, default=0, help="先頭N件のみ実行する疎通テストモード(0=全件)")
    args = parser.parse_args()

    app_id = os.environ.get("RAKUTEN_APP_ID")
    access_key = os.environ.get("RAKUTEN_ACCESS_KEY")
    affiliate_id = os.environ.get("RAKUTEN_AFFILIATE_ID", "")
    origin = os.environ.get("RAKUTEN_ORIGIN")

    if not app_id or not access_key or not origin:
        print("RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY / RAKUTEN_ORIGIN を環境変数で指定してください。")
        sys.exit(1)

    with open(args.html_path, encoding="utf-8") as f:
        html = f.read()

    keyword_pattern = re.compile(r'keyword:"([^"]+)"')
    keywords = keyword_pattern.findall(html)
    if args.limit > 0:
        keywords = keywords[: args.limit]
    print(f"対象キーワード数: {len(keywords)}")

    results = {}
    for i, kw in enumerate(keywords, 1):
        print(f"[{i}/{len(keywords)}] {kw}")
        item = fetch_item(kw, app_id, access_key, affiliate_id, origin)
        if item:
            results[kw] = item
        time.sleep(SLEEP_SEC)

    # price / img フィールドを実勢価格・実画像に置換
    # 旧パターン \{cat:"[^"]+".*?\}\} は末尾が単一の "} である実際のブロック形状と
    # 一致せず、一件もマッチしていなかった(price/imgが更新されないサイレントな
    # バグだった)。notFor の終端までを明示的にマッチさせるよう修正。
    def replace_fields(match):
        full_block = match.group(0)
        kw_match = re.search(r'keyword:"([^"]+)"', full_block)
        if not kw_match:
            return full_block
        kw = kw_match.group(1)
        item = results.get(kw)
        if not item:
            return full_block

        block = full_block
        if item.get("price"):
            new_price = f"約{item['price']:,}円"
            block = re.sub(r'price:"[^"]*"', f'price:"{new_price}"', block, count=1)

        if item.get("img"):
            img_escaped = item["img"].replace('"', '\\"')
            if re.search(r'\bimg:"[^"]*"', block):
                block = re.sub(r'\bimg:"[^"]*"', f'img:"{img_escaped}"', block, count=1)
            else:
                block = re.sub(
                    r'(keyword:"[^"]+",)',
                    rf'\1 img:"{img_escaped}",',
                    block,
                    count=1,
                )
        return block

    product_block_pattern = re.compile(r'\{cat:"[^"]+".*?notFor:"[^"]*"\}', re.S)
    html, n_subs = product_block_pattern.subn(replace_fields, html)
    print(f"\n商品ブロックのマッチ数: {n_subs}/{len(keywords)}(0件の場合は正規表現が壊れている可能性)")

    with open(args.html_path, "w", encoding="utf-8") as f:
        f.write(html)

    # affiliateUrlのマッピングを別ファイルに書き出し(AFFILIATE_MAPに反映する用)
    affiliate_map = {kw: v["url"] for kw, v in results.items() if v.get("url")}
    map_path = args.html_path.replace(".html", "") + ".affiliate-map.json"
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(affiliate_map, f, ensure_ascii=False, indent=2)

    n_with_img = sum(1 for v in results.values() if v.get("img"))
    img_rate = (n_with_img / len(results) * 100) if results else 0

    print(f"\n完了: {len(results)}/{len(keywords)} 件を取得")
    print(f"画像取得成功率: {n_with_img}/{len(results)} ({img_rate:.1f}%)")
    print(f"価格・画像を {args.html_path} に反映しました。")
    print(f"アフィリURLマップを {map_path} に出力しました。")
    if args.limit > 0:
        print("(--limit 指定のため一部のみ実行。全件実行する場合は --limit を外してください)")


if __name__ == "__main__":
    main()
