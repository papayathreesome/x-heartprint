(function () {
  try {
    if (window.__xhp_injected__) return;
    window.__xhp_injected__ = true;

    const isFavUrl = (url) => typeof url === 'string' && url.includes('/graphql/') && url.includes('/FavoriteTweet');

    const extractIdFromBody = (body) => {
      try {
        if (!body) return null;
        if (typeof body === 'string') {
          const j = JSON.parse(body);
          return j?.variables?.tweet_id || j?.variables?.tweetId || null;
        }
        if (body instanceof FormData) {
          const v = body.get('variables');
          if (typeof v === 'string') {
            const j = JSON.parse(v);
            return j?.tweet_id || j?.tweetId || null;
          }
        }
      } catch (_) {}
      return null;
    };

    const postFav = (tweetId) => {
      try { if (tweetId) window.postMessage({ source:'x-heartprint', type:'favorite', tweetId, at: Date.now() }, '*'); } catch(_){}
    };

    const ofetch = window.fetch;
    if (typeof ofetch === 'function') {
      window.fetch = function (input, init) {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        const watching = isFavUrl(url);
        const id = watching ? extractIdFromBody(init && init.body) : null;
        return ofetch.apply(this, arguments).then((res) => { if (watching && res && res.ok && id) postFav(id); return res; });
      };
    }

    const oopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__xh_watch = isFavUrl(url);
      this.__xh_id = null;
      return oopen.apply(this, arguments);
    };
    const osend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      if (this.__xh_watch) this.__xh_id = extractIdFromBody(body);
      if (this.__xh_watch) {
        this.addEventListener('loadend', function () {
          const ok = (this.status|0)>=200 && (this.status|0)<300;
          if (ok && this.__xh_id) postFav(this.__xh_id);
        });
      }
      return osend.apply(this, arguments);
    };
  } catch (_) {}
})();
