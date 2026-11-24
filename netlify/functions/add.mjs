import { createHash, timingSafeEqual } from 'node:crypto';

const REPO = 'a7md-khalaf/recap-catalog', BRANCH = 'main', FILE = 'data.json';
const API = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const out = (code, o) => new Response(JSON.stringify(o), { status: code, headers: H });
const sha = s => createHash('sha256').update(String(s)).digest();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ghHeaders() {
  return { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'recap-add' };
}
async function read() {
  const r = await fetch(`${API}?ref=${BRANCH}`, { headers: ghHeaders() });
  if (!r.ok) throw new Error('read ' + r.status);
  const j = await r.json();
  const d = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  if (!d || !Array.isArray(d.shows)) throw new Error('bad data');
  return { d, sha: j.sha };
}
async function write(d, s, msg) {
  const body = { message: msg, content: Buffer.from(JSON.stringify(d, null, 2) + '\n', 'utf8').toString('base64'), sha: s, branch: BRANCH };
  const r = await fetch(API, { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) { const e = new Error('conflict'); e.conflict = true; throw e; }
  if (!r.ok) throw new Error('write ' + r.status);
}
const str = (v, max) => { v = typeof v === 'string' ? v.trim() : ''; return v.length <= max ? v : null; };
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && u.hostname.includes('.') && v.length <= 2000 ? u.href : null; } catch { return null; } };
function eps(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('اكتب حلقة واحدة على الأقل.');
  if (list.length > 300) throw new Error('عدد الحلقات كبير، أضفها على دفعات.');
  return list.map((e, i) => {
    const t = str(e && e.title, 120), u = httpsUrl(e && e.embed);
    if (!t) throw new Error(`الحلقة ${i + 1}: الاسم فاضي أو طويل.`);
    if (!u) throw new Error(`الحلقة ${i + 1}: الرابط لازم يبدأ بـ https وصحيح.`);
    return { title: t, embed: u };
  });
}

const FALLBACK = 'posters/demo-series.svg';
function derivePoster(embed) {
  try { const u = new URL(embed); if (/(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === 'www.youtube-nocookie.com') { const m = u.pathname.match(/^\/embed\/([\w-]{6,20})/); if (m) return `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`; } } catch {}
  return '';
}
function posterOf(raw, firstEmbed) {
  if (raw) { const p = httpsUrl(raw); if (!p) throw new Error('رابط البوستر لازم يبدأ بـ https.'); return p; }
  return derivePoster(firstEmbed) || FALLBACK;
}
const embedOf = (v, label) => { const u = httpsUrl(typeof v === 'string' ? v.trim() : ''); if (!u) throw new Error((label || '') + 'الرابط أو الكود لازم يبدأ بـ https وصحيح.'); return u; };
const TYPES = ['مسلسل', 'أنمي', 'برنامج'];

async function apply(b) {
  const { d, sha: s } = await read();
  const full = () => ({ shows: d.shows.map(x => ({ id: x.id, title: x.title, type: x.type, poster: x.poster || '', description: x.description || '', episodes: (x.episodes || []).map(e => ({ title: e.title, embed: e.embed })) })) });
  if (b.op === 'list') return full();
  const find = () => { const x = d.shows.find(z => z.id === b.id); if (!x) throw new Error('اختر عمل.'); return x; };
  const isFilm = x => x.type === 'فيلم';
  const dup = (t, except) => { if (d.shows.some(z => z !== except && z.title === t)) throw new Error('فيه عمل بنفس الاسم بالفعل.'); };
  let msg;
  if (b.op === 'addFilm') {
    const title = str(b.title, 120); if (!title) throw new Error('اكتب اسم الفيلم (حتى 120 حرف).');
    const desc = str(b.description || '', 1000); if (desc === null) throw new Error('الملخص طويل.');
    const embed = embedOf(b.embed); dup(title);
    d.shows.push({ id: 's' + Date.now().toString(36), title, type: 'فيلم', poster: posterOf(b.poster, embed), description: desc, episodes: [{ title, embed }] });
    msg = 'Add film: ' + title.slice(0, 60);
  } else if (b.op === 'addSeries') {
    const title = str(b.title, 120); if (!title) throw new Error('اكتب اسم المسلسل (حتى 120 حرف).');
    const desc = str(b.description || '', 1000); if (desc === null) throw new Error('الملخص طويل.');
    const type = TYPES.includes(b.type) ? b.type : 'مسلسل';
    const e = eps(b.episodes); dup(title);
    d.shows.push({ id: 's' + Date.now().toString(36), title, type, poster: posterOf(b.poster, e[0].embed), description: desc, episodes: e });
    msg = 'Add series: ' + title.slice(0, 60);
  } else if (b.op === 'addEps') {
    const x = find(); if (isFilm(x)) throw new Error('الإضافة للمسلسلات فقط.');
    x.episodes = (x.episodes || []).concat(eps(b.episodes)); msg = 'Add episodes: ' + x.title.slice(0, 60);
  } else if (b.op === 'editShow') {
    const x = find();
    if (b.title !== undefined) { const t = str(b.title, 120); if (!t) throw new Error('الاسم فاضي أو طويل.'); dup(t, x); x.title = t; if (isFilm(x) && x.episodes[0]) x.episodes[0].title = t; }
    if (b.description !== undefined) { const t = str(b.description, 1000); if (t === null) throw new Error('الملخص طويل.'); x.description = t; }
    if (b.poster !== undefined) x.poster = posterOf(b.poster, x.episodes && x.episodes[0] && x.episodes[0].embed);
    if (b.type !== undefined && !isFilm(x)) { if (!TYPES.includes(b.type)) throw new Error('نوع غير صالح.'); x.type = b.type; }
    msg = 'Edit: ' + x.title.slice(0, 60);
  } else if (b.op === 'editEp') {
    const x = find(); const i = Number(b.index); const e = x.episodes && x.episodes[i]; if (!e) throw new Error('الحلقة غير موجودة.');
    if (b.embed !== undefined) { e.embed = embedOf(b.embed); if (i === 0 && (!x.poster || x.poster === FALLBACK)) x.poster = derivePoster(e.embed) || x.poster || FALLBACK; }
    if (b.title !== undefined && !isFilm(x)) { const t = str(b.title, 120); if (!t) throw new Error('اسم الحلقة فاضي أو طويل.'); e.title = t; }
    msg = 'Edit episode: ' + x.title.slice(0, 50);
  } else if (b.op === 'delEps') {
    const x = find(); if (isFilm(x)) throw new Error('احذف الفيلم كامل.');
    const idx = new Set((Array.isArray(b.indexes) ? b.indexes : []).map(Number)); if (!idx.size) throw new Error('اختر حلقة واحدة على الأقل.');
    const keep = (x.episodes || []).filter((_, i) => !idx.has(i));
    if (b.all) { x.episodes = []; } else x.episodes = keep;
    msg = 'Delete episodes: ' + x.title.slice(0, 50);
  } else if (b.op === 'delAllEps') {
    const x = find(); if (isFilm(x)) throw new Error('احذف الفيلم كامل.'); x.episodes = []; msg = 'Delete all episodes: ' + x.title.slice(0, 50);
  } else if (b.op === 'delShow') {
    const x = find(); d.shows = d.shows.filter(z => z !== x); msg = 'Delete: ' + x.title.slice(0, 60);
  } else throw new Error('طلب غير معروف.');
  await write(d, s, msg);
  return full();
}

export default async (req) => {
  if (req.method !== 'POST') return out(405, { error: 'POST only' });
  let b; try { b = await req.json(); } catch { return out(400, { error: 'طلب غير صالح.' }); }
  const pw = process.env.ADD_PASSWORD;
  if (!pw || !process.env.GH_TOKEN) return out(500, { error: 'الإعداد غير مكتمل.' });
  if (!timingSafeEqual(sha(b && b.password), sha(pw))) { await sleep(1500); return out(401, { error: 'الباسورد غلط.' }); }
  try {
    for (let i = 0; i < 2; i++) {
      try { return out(200, await apply(b)); } catch (e) { if (!e.conflict || i) throw e; }
    }
  } catch (e) {
    const known = /[\u0600-\u06FF]/.test(e.message);
    return out(known ? 400 : 502, { error: known ? e.message : 'تعذر الحفظ، حاول مرة ثانية.' });
  }
};
