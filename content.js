(() => {
  console.log('x-heartprint: content v0.2.8');

  const COOLDOWN_MS = 800;
  const NET_FALLBACK_WINDOW_MS = 1200; // within this window after a DOM like, ignore network event
  let lastDomId = null, lastDomAt = 0;
  let lastSentId = null, lastSentAt = 0;

  // best-effort dedupe on the id we actually send
  function uniqueGate(id){
    const now = Date.now();
    if (id === lastSentId && (now - lastSentAt) < COOLDOWN_MS) return false;
    lastSentId = id; lastSentAt = now;
    return true;
  }

  function safeSend(payload){
    try{
      if (typeof chrome==='undefined' || !chrome.runtime || !chrome.runtime.id) return;
      chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
    }catch(_){}
  }

  function extractTweetIdFromLikeBtn(btn){
    try{
      const root = btn.closest('article,[data-testid="cellInnerDiv"]') || document;
      // prefer any permalink within the tweet card; should point at the ORIGINAL status id
      const a = root.querySelector('a[href*="/status/"]');
      if (a && a.href){
        const m = a.href.match(/status\/(\d{5,})/);
        if (m) return m[1];
      }
    }catch(_){}
    return null;
  }

  function sendDomLike(canonicalId, atMillis){
    if (!/^\d{5,}$/.test(canonicalId)) return;
    if (document.visibilityState !== 'visible') return;
    lastDomId = canonicalId; lastDomAt = atMillis || Date.now();
    if (!uniqueGate(canonicalId)) return;
    // dom is authoritative; include both ids (raw==canonical here)
    safeSend({ type:'LIKE_EVENT', source:'dom', tweetId: canonicalId, canonicalId, at: lastDomAt });
  }

  function sendNetLike(rawId, atMillis){
    if (!/^\d{5,}$/.test(rawId)) return;
    if (document.visibilityState !== 'visible') return;
    const now = atMillis || Date.now();
    // if we just saw a DOM like, assume this net event is the same user gesture (retweet id) → drop
    if (now - lastDomAt < NET_FALLBACK_WINDOW_MS) return;
    // no recent dom like: fall back to network id as canonical
    if (!uniqueGate(rawId)) return;
    safeSend({ type:'LIKE_EVENT', source:'net', tweetId: rawId, canonicalId: rawId, at: now });
  }

  // dom path: literal click on the heart
  document.addEventListener('click', (ev)=>{
    const btn = ev.target && ev.target.closest && ev.target.closest('[data-testid="like"]');
    if (!btn) return;
    const id = extractTweetIdFromLikeBtn(btn);
    if (id) sendDomLike(id, Date.now());
  }, true);

  // network path: injected.js will post {type:'favorite', tweetId}
  window.addEventListener('message', (ev)=>{
    if (ev.source !== window) return;
    const d = ev.data;
    if (d && d.source==='x-heartprint' && d.type==='favorite' && d.tweetId){
      sendNetLike(String(d.tweetId), d.at || Date.now());
    }
  }, false);

  // ask bg to inject page hook (defense-in-depth)
  try { chrome.runtime.sendMessage({ type:'REQUEST_INJECT' }, () => void chrome.runtime.lastError); } catch(_){}
})();
