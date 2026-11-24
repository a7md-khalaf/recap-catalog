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
async function load() {
  let d = null;
  try { const c = JSON.parse(localStorage.getItem('rc_cache') || 'null'); if (okData(c)) d = c; } catch (e) {}
  if (!d) { try { const x = await fetchJson('data.json?v=' + Math.floor(Date.now() / 600000), 6000); if (okData(x)) d = x; } catch (e) {} }
  if (LIVE) {
    const shown = JSON.stringify(d);
    fetchJson(`${RAW}/data.json?t=${Math.floor(Date.now() / 60000)}`, 8000).then(f => {
      if (!okData(f)) return;
      const fs = JSON.stringify(f);
      try { localStorage.setItem('rc_cache', fs); } catch (e) {}
      if (fs !== shown && !sessionStorage.getItem('rc_reloaded')) { sessionStorage.setItem('rc_reloaded', '1'); location.reload(); }
    }).catch(() => {});
  }
  if (d) return d;
  if (LIVE) { try { const f = await fetchJson(`${RAW}/data.json`, 10000); if (okData(f)) return f; } catch (e) {} }
  window.RC_FAILED = true;
  return { shows: [] };
}
document.addEventListener('DOMContentLoaded', () => { const e = document.getElementById('empty'); if (e) { e.hidden = false; e.textContent = 'جاري التحميل...'; } });
