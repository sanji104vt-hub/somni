// Somni Worker entry
// workers.dev ドメインでアクセスが来たら、asutelu.com のカスタムドメインへ 301 リダイレクトする。
// それ以外(=カスタムドメイン直アクセス)は Static Assets(public/)にそのまま流す。
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.endsWith('workers.dev')) {
      return Response.redirect(
        'https://somni.asutelu.com' + url.pathname + url.search,
        301
      );
    }
    return env.ASSETS.fetch(request);
  },
};
