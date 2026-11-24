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
async function load() {
  const tries = [];
  if (LIVE) {
    tries.push(() => fetch(`https://api.github.com/repos/${RC.repo}/contents/data.json?ref=${RC.branch}`, { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw+json' } }));
    tries.push(() => fetch(`${RAW}/data.json?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' }));
  }
  tries.push(() => fetch('data.json', { cache: 'no-cache' }));
  for (const t of tries) {
    try { const r = await t(); if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.shows)) return d; } } catch (e) {}
  }
  return { shows: [] };
}
