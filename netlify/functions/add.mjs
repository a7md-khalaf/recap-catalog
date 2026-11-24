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

async function apply(b) {
  const { d, sha: s } = await read();
  const brief = () => d.shows.map(x => ({ id: x.id, title: x.title }));
  if (b.op === 'list') return { shows: brief() };
  let msg;
  if (b.op === 'addShow') {
    const title = str(b.title, 120); if (!title) throw new Error('اكتب اسم العمل (حتى 120 حرف).');
    const type = ['مسلسل', 'فيلم', 'أنمي', 'برنامج'].includes(b.type) ? b.type : 'مسلسل';
    const desc = str(b.description || '', 1000); if (desc === null) throw new Error('الملخص طويل.');
    let poster = ''; if (b.poster) { poster = httpsUrl(b.poster); if (!poster) throw new Error('رابط البوستر لازم يبدأ بـ https.'); }
    if (d.shows.some(x => x.title === title)) throw new Error('العمل ده موجود بالفعل. استخدم خانة إضافة حلقات.');
    d.shows.push({ id: 's' + Date.now().toString(36), title, type, poster, description: desc, episodes: eps(b.episodes) });
    msg = 'Add show: ' + title.slice(0, 60);
  } else if (b.op === 'addEps') {
    const x = d.shows.find(z => z.id === b.id); if (!x) throw new Error('اختر عمل.');
    x.episodes = (x.episodes || []).concat(eps(b.episodes)); msg = 'Add episodes: ' + x.title.slice(0, 60);
  } else if (b.op === 'delShow') {
    const x = d.shows.find(z => z.id === b.id); if (!x) throw new Error('اختر عمل.');
    d.shows = d.shows.filter(z => z !== x); msg = 'Delete show: ' + x.title.slice(0, 60);
  } else throw new Error('طلب غير معروف.');
  await write(d, s, msg);
  return { ok: true, shows: brief() };
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
