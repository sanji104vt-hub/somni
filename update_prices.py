"""
update_prices.py
=================
Somni (public/index.html) の商品カード内 keyword を使って
楽天市場商品検索API（新API・2026年2月刷新版）を叩き、
1) 実際の最安値レンジを price 欄に反映
2) AFFILIATE_MAP（card()が優先参照する固定URL辞書）を更新
するスクリプト。既存の Sillage 用パイプライン(fetch-rakuten-items.mjs)と
同じ新APIエンドポイント・認証方式に合わせてある。

【実行前に必ず確認すること】
------------------------------------------------------------
1. 環境変数で以下4つを渡す:
     RAKUTEN_APP_ID        アプリケーションID（UUID形式）
     RAKUTEN_ACCESS_KEY    アクセスキー（pk_... 、秘密情報）
     RAKUTEN_AFFILIATE_ID  アフィリエイトID
     RAKUTEN_ORIGIN        アプリ登録した「許可されたWebサイト」
                            (例 https://somni.sanji-104vt.workers.dev/)

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
$ export RAKUTEN_ORIGIN="https://somni.sanji-104vt.workers.dev/"

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


def fetch_item(keyword: str, app_id: str, access_key: str, affiliate_id: str, origin: str) -> dict | None:
    """楽天商品検索APIを1件叩いて、最も関連度の高い商品情報を返す。失敗時はNone。
    sort=+itemPrice(価格順)にすると交換バンドや保護フィルムなど無関係な
    安価アクセサリーが先頭に来てしまうため、標準(関連度)ソートを使う。"""
    params = {
        "format": "json",
        "hits": 5,
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

    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"  [HTTP {e.code}] {keyword} -> {body[:200]}")
        return None
    except Exception as e:
        print(f"  [ERROR] {keyword} -> {e}")
        return None

    items = data.get("Items", [])
    if not items:
        print(f"  [NO RESULT] {keyword}")
        return None

    item = items[0]["Item"]
    return {
        "price": item.get("itemPrice"),
        "url": item.get("affiliateUrl") or item.get("itemUrl"),
        "name": item.get("itemName"),
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

    # price フィールドを実勢価格に置換
    def replace_price(match):
        full_block = match.group(0)
        kw_match = re.search(r'keyword:"([^"]+)"', full_block)
        if not kw_match:
            return full_block
        kw = kw_match.group(1)
        item = results.get(kw)
        if not item or not item.get("price"):
            return full_block
        new_price = f"約{item['price']:,}円"
        return re.sub(r'price:"[^"]*"', f'price:"{new_price}"', full_block)

    product_block_pattern = re.compile(r'\{cat:"[^"]+".*?\}\}', re.S)
    html = product_block_pattern.sub(replace_price, html)

    with open(args.html_path, "w", encoding="utf-8") as f:
        f.write(html)

    # affiliateUrlのマッピングを別ファイルに書き出し(AFFILIATE_MAPに反映する用)
    affiliate_map = {kw: v["url"] for kw, v in results.items() if v.get("url")}
    map_path = args.html_path.replace(".html", "") + ".affiliate-map.json"
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(affiliate_map, f, ensure_ascii=False, indent=2)

    print(f"\n完了: {len(results)}/{len(keywords)} 件を取得")
    print(f"価格を {args.html_path} に反映しました。")
    print(f"アフィリURLマップを {map_path} に出力しました。")
    if args.limit > 0:
        print("(--limit 指定のため一部のみ実行。全件実行する場合は --limit を外してください)")


if __name__ == "__main__":
    main()
