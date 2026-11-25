// Live content loader. Content lives in data.json in the GitHub repo and is read straight
// from GitHub on every visit, so edits in /admin show up without a Netlify deploy.
const RC = Object.assign({ repo: 'OWNER/REPO', branch: 'main' }, window.RC || {});
const LIVE = !/OWNER/.test(RC.repo);
const RAW = LIVE ? `https://raw.githubusercontent.com/${RC.repo}/${RC.branch}` : '';

// Poster paths saved by the admin look like /uploads/x.jpg and are served from the repo.
function mediaUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/uploads/')) return LIVE ? RAW + p : p.slice(1);
  return p;
}
// Turns whatever was pasted into a clean https embed URL: a plain URL, a full <iframe> code,
// a protocol-relative or http URL, HTML-escaped text, or a normal YouTube watch/short link.
function embedUrl(v) {
  v = (v || '').trim().replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const m = v.match(/<iframe[^>]*?\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  let u = (m ? (m[1] || m[2] || m[3]) : v).trim().replace(/^["']|["']$/g, '');
  if (u.startsWith('//')) u = 'https:' + u;
  if (/^http:\/\//i.test(u)) u = 'https://' + u.slice(7);
  try {
    const x = new URL(u);
    const yt = x.hostname.replace(/^www\./, '');
    if (yt === 'youtu.be') return 'https://www.youtube.com/embed/' + x.pathname.slice(1);
    if ((yt === 'youtube.com' || yt === 'm.youtube.com') && x.pathname === '/watch' && x.searchParams.get('v')) return 'https://www.youtube.com/embed/' + x.searchParams.get('v');
  } catch (e) {}
  return u;
}
function fetchJson(url, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { cache: 'no-store', signal: c.signal }).then(r => { if (!r.ok) throw 0; return r.json(); }).finally(() => clearTimeout(t));
}
const okData = d => d && Array.isArray(d.shows);
// Fast path: show the cached/bundled data.json from this same site right away, then refresh
// from GitHub in the background (8s limit). If GitHub has newer content, it is cached and the
// page reloads once to show it. So a slow GitHub never leaves the page blank.
async function loadRaw() {
  let d = null;
  try { const c = JSON.parse(localStorage.getItem('rc_cache') || 'null'); if (okData(c)) d = c; } catch (e) {}
  if (!d) { try { const x = await fetchJson('data.json?v=' + Math.floor(Date.now() / 600000), 6000); if (okData(x)) d = x; } catch (e) {} }
  if (LIVE) {
    const shown = JSON.stringify(d);
    fetchJson(`${RAW}/data.json?t=${Math.floor(Date.now() / 60000)}`, 8000).then(f => {
      if (!okData(f)) return;
      const fs = JSON.stringify(f);
      try { localStorage.setItem('rc_cache', fs); } catch (e) {}
      if (fs !== shown && sessionStorage.getItem('rc_reloaded') !== fs) { sessionStorage.setItem('rc_reloaded', fs); location.reload(); }
    }).catch(() => {});
  }
  if (d) return d;
  if (LIVE) { try { const f = await fetchJson(`${RAW}/data.json`, 10000); if (okData(f)) return f; } catch (e) {} }
  window.RC_FAILED = true;
  return { shows: [] };
}
document.addEventListener('DOMContentLoaded', () => { const e = document.getElementById('empty'); if (e) { e.hidden = false; e.textContent = 'جاري التحميل...'; } });

let _loadP;
function load() { return _loadP || (_loadP = loadRaw()); }
// Ordering and "new" badge. Items saved by the panel carry createdAt (ms). Older items have none,
// so they rank by their position in data.json (later = newer) and always sit below dated items.
const NEW_MS = 3 * 24 * 3600 * 1000;
const itemKey = (o, i) => (o && o.createdAt) || i || 0;
const isNew = (t) => !!t && Date.now() - t < NEW_MS && Date.now() >= t - 60000;
const showStamp = (s) => Math.max((s && s.createdAt) || 0, ...((s && s.episodes) || []).map(e => (e && e.createdAt) || 0));
const showKey = (s, i) => showStamp(s) || i;
function sortedShows(d) { return d.shows.map((s, i) => ({ s, i, k: showKey(s, i) })).sort((a, b) => b.k - a.k); }
function newestEp(s) { let best = -1, bk = -1; (s.episodes || []).forEach((e, j) => { const k = itemKey(e, j); if (k > bk) { bk = k; best = j; } }); return best; }
function watchHref(s, j) { return 'watch.html?show=' + encodeURIComponent(s.id) + '&ep=' + (j + 1); }
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function posterImg(s) { const i = document.createElement('img'); i.src = mediaUrl(s.poster); i.alt = s.title; i.loading = 'lazy'; return i; }
function newTag() { return mk('em', 'new', 'جديد'); }
