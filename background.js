// background.js — x-heartprint v0.2.8 (dom-canonical ids; retweet net suppressed)

const DIR = 'x-heartprint';
const CAPTURE_DELAY_MS = 300;
const ENABLE_DB = true;

const log = (...a) => { try { console.log('[x-heartprint]', ...a); } catch (_) {} };

const p2 = n => String(n).padStart(2,'0');
const p3 = n => String(n).padStart(3,'0');
const fmtUTC = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth()+1)}-${p2(d.getUTCDate())}_${p2(d.getUTCHours())}-${p2(d.getUTCMinutes())}-${p2(d.getUTCSeconds())}_${p3(d.getUTCMilliseconds())}`;
};
const fname = (canonId, rawId, likeAtMs) => {
  const base = `x-like_UTC-${fmtUTC(likeAtMs)}_id-${canonId}`;
  return rawId && rawId !== canonId ? `${base}_rt-${rawId}.png` : `${base}.png`;
};

function appendLog(entry){
  if (!ENABLE_DB) return;
  chrome.storage.local.get({ log: [] }, ({ log: arr }) => {
    arr.push(entry);
    chrome.storage.local.set({ log: arr }, () => log('log +1 →', arr.length));
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getTab = (id) => new Promise(r => chrome.tabs.get(id, t => r(chrome.runtime.lastError ? null : t)));
const getWin = (id) => new Promise(r => chrome.windows.get(id, w => r(chrome.runtime.lastError ? null : w)));
const capTab = (winId) => new Promise(r => chrome.tabs.captureVisibleTab(winId, { format:'png' }, u => {
  if (chrome.runtime.lastError) log('capture error:', chrome.runtime.lastError.message);
  r(u || null);
}));
const dl = (url, filename) => new Promise(r => chrome.downloads.download({ url, filename, saveAs:false, conflictAction:'uniquify' }, id => r(id)));

function isX(url){ try { return new URL(url).hostname === 'x.com'; } catch { return false; } }
function injectMain(tabId, frameId=0){
  chrome.scripting.executeScript({
    target: { tabId, frameIds:[frameId] },
    files: ['injected.js'],
    world: 'MAIN',
    injectImmediately: true
  }, () => void chrome.runtime.lastError);
}
function sweepInject(){
  chrome.tabs.query({ url: 'https://x.com/*' }, tabs => tabs.forEach(t => injectMain(t.id, 0)));
}
chrome.runtime.onStartup.addListener(sweepInject);
chrome.runtime.onInstalled.addListener(sweepInject);
chrome.webNavigation.onCommitted.addListener(d => { if (d.frameId===0 && isX(d.url)) injectMain(d.tabId, d.frameId); });
chrome.webNavigation.onHistoryStateUpdated.addListener(d => { if (d.frameId===0 && isX(d.url)) injectMain(d.tabId, d.frameId); });
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type==='REQUEST_INJECT' && sender?.tab) injectMain(sender.tab.id, 0);
});

// exact name enforcement
const pendingNames = new Map(); // dataUrl -> desired "dir/name.png"
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  try {
    if (item.byExtensionId !== chrome.runtime.id) return;
    const wanted = pendingNames.get(item.url);
    if (wanted) {
      suggest({ filename: wanted, conflictAction: 'uniquify' });
      pendingNames.delete(item.url);
      return;
    }
    let base = item.filename || 'download.png';
    if (!base.startsWith(`${DIR}/`)) base = `${DIR}/${base}`;
    suggest({ filename: base, conflictAction: 'uniquify' });
  } catch (_) {}
});

// dedupe on CANONICAL id
const recent = new Map(); // canonicalId -> lastMillis
function seenRecently(id, now, ms=700){ const last = recent.get(id)||0; recent.set(id, now); return (now-last) < ms; }

async function ensureFront(ctx){
  let win = await getWin(ctx.windowId);
  if (!win) return false;
  if (win.state === 'minimized') { await new Promise(r => chrome.windows.update(win.id, { state:'normal' }, () => r())); await sleep(30); }
  if (!win.focused) { await new Promise(r => chrome.windows.update(win.id, { focused:true }, () => r())); await sleep(30); }
  await new Promise(r => chrome.tabs.update(ctx.tabId, { active:true }, () => r())); await sleep(30);
  return true;
}
async function tryCapture(ctx){
  let dataUrl = await capTab(ctx.windowId);
  if (dataUrl) return dataUrl;
  const ok = await ensureFront(ctx);
  if (!ok) return null;
  dataUrl = await capTab(ctx.windowId);
  return dataUrl;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'LIKE_EVENT') return;
  (async () => {
    try {
      const rawId = String(msg.tweetId||'').trim();
      const canonId = String(msg.canonicalId||rawId).trim();
      const likeAt = (typeof msg.at === 'number') ? msg.at : Date.now();
      if (!/^\d{5,}$/.test(canonId)) { log('drop: bad id', canonId, rawId); return sendResponse({ ok:false, reason:'bad_id' }); }
      if (!sender.tab || !sender.tab.id || !sender.tab.windowId) { log('drop: no_tab'); return sendResponse({ ok:false, reason:'no_tab' }); }

      const now = Date.now();
      if (seenRecently(canonId, now)) { log('drop: dup', canonId); return sendResponse({ ok:false, reason:'dup' }); }

      const delay = Math.max(0, CAPTURE_DELAY_MS - (now - likeAt));
      log('like_event', { canonId, rawId: rawId !== canonId ? rawId : undefined, delay, src: msg.source });

      await sleep(delay);

      const tab = await getTab(sender.tab.id);
      if (!tab) { log('drop: tab_gone'); return sendResponse({ ok:false, reason:'tab_gone' }); }
      let host=''; try { host = new URL(tab.url||'').hostname; } catch {}
      if (host !== 'x.com') { log('drop: host', tab.url); return sendResponse({ ok:false, reason:'host' }); }

      const dataUrl = await tryCapture({ tabId: sender.tab.id, windowId: sender.tab.windowId });
      if (!dataUrl) { log('drop: capture_failed'); return sendResponse({ ok:false, reason:'capture_failed' }); }

      const tsMs = likeAt || Date.now();
      const fileRel = `${DIR}/${fname(canonId, rawId, tsMs)}`;
      pendingNames.set(dataUrl, fileRel);

      const downloadId = await dl(dataUrl, fileRel);

      appendLog({
        tweet_id: canonId,
        tweet_id_raw: rawId !== canonId ? rawId : undefined,
        timestamp_iso: new Date(tsMs).toISOString(),
        filename: fileRel,
        download_id: downloadId ?? null,
        source: msg.source
      });
      log('saved', { canonId, rawId: rawId !== canonId ? rawId : undefined, downloadId, fileRel });

      return sendResponse({ ok:true, tweetId: canonId, downloadId, filename: fileRel });
    } catch (e) {
      log('err', e && e.message || e);
      return sendResponse({ ok:false, error: String(e) });
    }
  })();
  return true;
});

log('bg v0.2.8 ready');
