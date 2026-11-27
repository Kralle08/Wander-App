import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY, TOUR_YEAR, VAPID_PUBLIC } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
});

const app = document.getElementById('app');

// ---------------------------------------------------------------- Zustand
const S = {
  session: null,
  me: null,            // eigener Mitgliedseintrag
  members: [],
  tour: null,          // Tour 2027
  tours: [],
  organizers: [],      // {tour_id, member_id}
  stages: [],
  reveals: [],
  revealContents: {},
  riddles: [],
  solutions: {},
  myAnswers: {},
  leaderboard: [],
  rsvps: [],
  slots: [],
  photos: [],
  schedule: [],
  sched: { time: '', title: '', note: '' },
  photoUrls: {},
  lightbox: null,
  uploading: '',
  packing: {},
  expenses: [],
  shares: [],
  tab: 'start',
  rankSeg: 'quiz',
  overlay: null,       // 'pack' | 'kasse' | 'teil' | {year}
  login: { step: 'email', email: '', code: '', busy: false, error: '' },
  kasse: { title: '', amount: '', paidBy: null, forIds: null, busy: false },
  polls: [], pollOptions: [], pollVotes: [],
  pollForm: { q: '', opts: ['', ''], multi: false, closes: '', busy: false },
  guestName: '',
  notice: '',
  preview: false,
  _orig: null
};

// ---------------------------------------------------------------- Hilfen
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (x) => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => { const x = new Date(d); return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`; };
const fmtDateTime = (d) => { const x = new Date(d); return `${fmtDate(x)} um ${pad(x.getHours())}:${pad(x.getMinutes())} Uhr`; };
const nick = (id) => S.members.find((m) => m.id === id)?.nickname ?? '?';
const now = () => Date.now();
const isAdmin = () => !!S.me?.is_admin && !S.preview;
const isQuizmaster = () => !!S.me?.is_quizmaster && !S.preview;

function toast(msg) {
  S.notice = msg; render();
  setTimeout(() => { if (S.notice === msg) { S.notice = ''; render(); } }, 3500);
}

async function q(promise) {
  const { data, error } = await promise;
  if (error) { console.error(error); toast('Fehler: ' + error.message); throw error; }
  return data;
}

// Wird bei jeder Veröffentlichung erhöht (gleiche Zahl wie der Cache im Service Worker)
const APP_VERSION = 44;

// ---------------------------------------------------------------- Laden
async function loadAll() {
  const [members, tours, organizers, photos, schedule, stages, reveals, revealContents, riddles, solutions, slots, riddleSched] = await Promise.all([
    q(sb.from('members').select('*').order('nickname')),
    q(sb.from('tours').select('*').order('year', { ascending: false })),
    q(sb.from('tour_organizers').select('*')),
    q(sb.from('tour_photos').select('*').order('sort').order('id')),
    q(sb.from('stage_schedule').select('*').order('at_time')),
    q(sb.from('stages').select('*').order('sort')),
    q(sb.from('reveals').select('*').order('reveal_at')),
    q(sb.from('reveal_contents').select('*')),
    q(sb.from('riddles').select('*').order('nr')),
    q(sb.from('riddle_solutions').select('*')),
    q(sb.from('orga_slots').select('*')),
    q(sb.rpc('riddle_schedule'))
  ]);
  const [polls, pollOptions, pollVotes] = await Promise.all([
    q(sb.from('polls').select('*').order('created_at', { ascending: false })),
    q(sb.from('poll_options').select('*').order('sort').order('id')),
    q(sb.from('poll_votes').select('*'))
  ]);
  S.polls = polls; S.pollOptions = pollOptions; S.pollVotes = pollVotes;
  S.appStatus = S.me?.is_admin ? Object.fromEntries((await q(sb.rpc('member_app_status'))).map((r) => [r.member_id, r])) : null;
  S.members = members; S.tours = tours; S.organizers = organizers; S.stages = stages;
  S.reveals = reveals;
  // Fahrplan für alle 20 Etappen; Fragen nur für bereits veröffentlichte Rätsel
  const full = Object.fromEntries(riddles.map((r) => [r.id, r]));
  S.riddles = (riddleSched.length ? riddleSched : riddles).map((r) => full[r.id] || { ...r, question: null }); S.slots = slots; S.photos = photos; S.schedule = schedule;
  S.revealContents = Object.fromEntries(revealContents.map((r) => [r.reveal_id, r]));
  S.solutions = Object.fromEntries(solutions.map((s) => [s.riddle_id, s]));
  S.tour = tours.find((t) => t.year === TOUR_YEAR) || null;

  const tourId = S.tour?.id ?? -1;
  const [answers, leaderboard, rsvps, packing, expenses, shares] = await Promise.all([
    q(sb.from('riddle_answers').select('*').eq('member_id', S.me.id)),
    q(sb.rpc('riddle_leaderboard')),
    q(sb.from('rsvps').select('*').eq('tour_id', tourId)),
    q(sb.from('packing_checks').select('*').eq('member_id', S.me.id)),
    q(sb.from('expenses').select('*').eq('tour_id', tourId).order('created_at', { ascending: false })),
    q(sb.from('expense_shares').select('*'))
  ]);
  S.myAnswers = Object.fromEntries(answers.map((a) => [a.riddle_id, a]));
  S.rsvps = rsvps;
  { const crewIds = new Set(tourCrew().map((m) => m.id)); S.leaderboard = leaderboard.filter((l) => crewIds.has(l.member_id) || l.answered > 0); }
  S.packing = Object.fromEntries(packing.map((p) => [p.item_key, p.checked]));
  S.expenses = expenses; S.shares = shares;
  S.riddlePoints = lastResolvedRiddle() ? await q(sb.rpc('riddle_points')) : [];
  await loadRiddleExtras();
  if (S.preview) applyPreview();
  await refreshPhotoUrls();
}

// Vorschau als Mitglied: blendet alles aus, was nur die Reiseleitung sehen darf
function applyPreview() {
  const t = now();
  const o = S._orig = { stages: S.stages, schedule: S.schedule, solutions: S.solutions, revealContents: S.revealContents, riddles: S.riddles };
  S.stages = o.stages.filter((s) => !s.is_secret || (s.reveal_at && new Date(s.reveal_at).getTime() <= t));
  const ids = new Set(S.stages.map((s) => s.id));
  S.schedule = o.schedule.filter((x) => ids.has(x.stage_id));
  S.riddles = o.riddles.map((r) => new Date(r.publish_at).getTime() <= t ? r : { id: r.id, nr: r.nr, publish_at: r.publish_at, resolve_at: r.resolve_at, question: null });
  S.solutions = Object.fromEntries(Object.entries(o.solutions).filter(([rid]) => {
    const r = o.riddles.find((x) => x.id === Number(rid)); return r && new Date(r.resolve_at).getTime() <= t;
  }));
  S.revealContents = Object.fromEntries(Object.entries(o.revealContents).filter(([rid]) => {
    const r = S.reveals.find((x) => x.id === Number(rid)); return r && new Date(r.reveal_at).getTime() <= t;
  }));
}
function endPreview() {
  if (S._orig) Object.assign(S, S._orig);
  S._orig = null; S.preview = false;
}

async function loadRiddleExtras() {
  const cr = currentRiddle(), lr = lastResolvedRiddle();
  S.riddleCount = cr ? await q(sb.rpc('riddle_answer_count', { rid: cr.id })) : 0;
  S.lastRight = []; S.lastAll = []; S.freeAnswers = [];
  if (cr && cr.kind === 'frei' && isAdmin()) {
    S.freeAnswers = (await q(sb.from('riddle_answers').select('*').eq('riddle_id', cr.id))).filter((a) => a.text_value);
  }
  if (lr && S.solutions[lr.id]) {
    const sol = S.solutions[lr.id];
    const ans = await q(sb.from('riddle_answers').select('*').eq('riddle_id', lr.id));
    if (lr.kind === 'frei') {
      const wins = sol.winner_ids || [];
      S.lastAll = ans.filter((a) => a.text_value);
      S.lastRight = S.lastAll.filter((a) => wins.includes(a.member_id)).map((a) => `${nick(a.member_id)}: „${a.text_value}“`);
    } else if (lr.kind === 'schaetzen') {
      const withVal = ans.filter((a) => a.numeric_value !== null);
      const best = Math.min(...withVal.map((a) => Math.abs(a.numeric_value - sol.numeric_answer)));
      S.lastRight = withVal.filter((a) => Math.abs(a.numeric_value - sol.numeric_answer) === best)
        .map((a) => `${nick(a.member_id)} (${Number(a.numeric_value).toLocaleString('de-DE')})`);
    } else {
      S.lastRight = ans.filter((a) => a.option_index === sol.correct_option).map((a) => nick(a.member_id));
    }
  }
}

async function refreshPhotoUrls() {
  const paths = S.photos.map((p) => p.storage_path).filter((p) => !S.photoUrls[p]);
  if (!paths.length) return;
  const { data, error } = await sb.storage.from('tour-photos').createSignedUrls(paths, 60 * 60 * 6);
  if (error) { console.error(error); return; }
  (data || []).forEach((d) => { if (d.signedUrl) S.photoUrls[d.path] = d.signedUrl; });
}

async function afterLogin() {
  const mid = await q(sb.rpc('claim_member'));
  if (!mid) { S.me = null; render(); return; }
  const me = await q(sb.from('members').select('*').eq('id', mid).single());
  S.me = me;
  await loadAll();
  render();
  ensurePush();
}

// ---------------------------------------------------------------- Push
// Meldet dieses Gerät für Push an (nur wenn Mitteilungen erlaubt sind) und merkt es sich in Supabase.
async function ensurePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const raw = Uint8Array.from(atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    }
    const j = sub.toJSON();
    const { error } = await sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) });
    if (error) { console.error(error); return false; }
    return true;
  } catch (e) { console.error('push', e); return false; }
}


// ---------------------------------------------------------------- Marke
function brandHtml() {
  return `<div class="brand">
    <span class="brand-word">HIKE<em>!</em></span>
    <span class="brand-sub"><i></i>CREW HESSEN · EST. 2018<i></i></span>
  </div>`;
}

// ---------------------------------------------------------------- Login
function viewLogin() {
  const L = S.login;
  return `
  <div class="login">
    ${brandHtml()}
    <div class="jubi"><span class="jubi-label">10 Jahre · Jubiläumswanderung 2027</span><h1>Mallorca</h1></div>
    <div class="card">
      ${L.step === 'email' ? `
        <p class="title">Anmelden</p>
        <p class="muted">Gib deine E-Mail-Adresse ein. Du bekommst einen Code per Mail.</p>
        <label class="field">E-Mail
          <input type="email" inputmode="email" autocomplete="email" data-input="loginEmail" value="${esc(L.email)}" placeholder="name@beispiel.de">
        </label>
        <button class="btn block" data-action="sendCode" ${L.busy ? 'disabled' : ''}>Code schicken</button>
      ` : `
        <p class="title">Code eingeben</p>
        <p class="muted">Ich habe dir eine Mail an <b>${esc(L.email)}</b> geschickt. Steht darin ein Code, gib ihn hier ein. Steht darin ein Link, tipp ihn an, am besten auf diesem Gerät und in diesem Browser.</p>
        <div class="spamhint"><b>📬 Keine Mail da? Schau im Spam-Ordner nach!</b><span>Absender „HIKE!“. Bei web.de, GMX & Co. landet sie gern dort. Am besten gleich als „Kein Spam“ markieren.</span></div>
        <label class="field">Code
          <input class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" data-input="loginCode" value="${esc(L.code)}">
        </label>
        <button class="btn block" data-action="verifyCode" ${L.busy ? 'disabled' : ''}>Anmelden</button>
        <button class="btn ghost" data-action="backToEmail">Andere E-Mail-Adresse</button>
      `}
      ${L.error ? `<p class="err">${esc(L.error)}</p>` : ''}
    </div>
  </div>`;
}

async function sendCode() {
  const email = S.login.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { S.login.error = 'Bitte eine gültige E-Mail-Adresse eingeben.'; return render(); }
  S.login.busy = true; S.login.error = ''; render();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
  S.login.busy = false;
  if (error) { S.login.error = 'Das hat nicht geklappt: ' + error.message; return render(); }
  S.login.email = email; S.login.step = 'code'; render();
}

async function verifyCode() {
  const token = S.login.code.replace(/\D/g, '');
  if (token.length < 6 || token.length > 10) { S.login.error = 'Bitte den vollständigen Code aus der Mail eingeben.'; return render(); }
  S.login.busy = true; S.login.error = ''; render();
  const { data, error } = await sb.auth.verifyOtp({ email: S.login.email, token, type: 'email' });
  S.login.busy = false;
  if (error) { S.login.error = 'Code ungültig oder abgelaufen. Fordere einen neuen an.'; return render(); }
  S.session = data.session;
  await afterLogin();
}

function viewNotMember() {
  return `
  <div class="login">
    <h1>Fast geschafft</h1>
    <div class="card">
      <p class="title">Du bist noch nicht eingetragen</p>
      <p class="muted">Deine E-Mail-Adresse <b>${esc(S.session?.user?.email)}</b> ist noch keinem Mitglied zugeordnet. Schick sie Ralle, er trägt dich ein. Danach einfach neu laden.</p>
      <button class="btn block" data-action="reload">Neu laden</button>
      <button class="btn ghost" data-action="logout">Abmelden</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Berechnungen
function revealState() {
  const all = S.reveals;
  const real = all.filter((r) => !r.is_joke);
  const nextIdx = all.findIndex((r) => new Date(r.reveal_at).getTime() > now());
  const done = real.filter((r) => new Date(r.reveal_at).getTime() <= now()).length;
  const latest = [...all].reverse().find((r) => new Date(r.reveal_at).getTime() <= now()) || null;
  if (nextIdx === -1) return { finished: true, done, total: real.length, latest };
  const nx = all[nextIdx];
  const afterJoke = nextIdx > 0 && all[nextIdx - 1].is_joke && new Date(all[nextIdx - 1].reveal_at).getTime() <= now();
  return { finished: false, next: nx, done, total: real.length, latest, afterJoke };
}

function calendarDaysUntil(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const n = new Date();
  const todayUtc = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.max(0, Math.round((Date.UTC(y, m - 1, d) - todayUtc) / 86400000));
}

function splitCountdown(target) {
  const s = Math.max(0, Math.floor((new Date(target).getTime() - now()) / 1000));
  return { d: Math.floor(s / 86400), h: pad(Math.floor((s % 86400) / 3600)), m: pad(Math.floor((s % 3600) / 60)), s: pad(s % 60) };
}

function rsvpOf(memberId) { return S.rsvps.find((r) => r.member_id === memberId)?.status || 'offen'; }
const ST_LABEL = { ja: 'Dabei', vielleicht: 'Vielleicht', nein: 'Nicht dabei', offen: 'Offen' };

function currentRiddle() {
  const t = now();
  return S.riddles.find((r) => new Date(r.publish_at).getTime() <= t && new Date(r.resolve_at).getTime() > t) || null;
}
function lastResolvedRiddle() {
  const t = now();
  return [...S.riddles].reverse().find((r) => new Date(r.resolve_at).getTime() <= t) || null;
}

// ---------------------------------------------------------------- Rückblick nach jeder Etappe
function standings(riddleIds) {
  const active = new Set((S.riddlePoints || []).map((r) => r.member_id));
  const crewIds = new Set(tourCrew().map((m) => m.id));
  const players = S.members.filter((m) => !m.is_guest && !m.is_quizmaster && (crewIds.has(m.id) || active.has(m.id)));
  const pts = Object.fromEntries(players.map((m) => [m.id, 0]));
  for (const r of S.riddlePoints || []) if (riddleIds.has(r.riddle_id) && r.member_id in pts) pts[r.member_id] += r.points;
  const sorted = Object.values(pts).sort((a, b) => b - a);
  const rank = (id) => sorted.indexOf(pts[id]) + 1; // gleiche Punkte = gleicher Platz
  return { pts, rank, players };
}
const andList = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1] : a[0] || '');
function recapLines(lr) {
  const done = S.riddles.filter((r) => new Date(r.resolve_at).getTime() <= new Date(lr.resolve_at).getTime()).map((r) => r.id);
  const after = standings(new Set(done));
  const before = standings(new Set(done.filter((id) => id !== lr.id)));
  const lines = [];
  const top = Math.max(...Object.values(after.pts));
  if (top > 0) {
    const leaders = after.players.filter((m) => after.pts[m.id] === top);
    const prevTop = Math.max(...Object.values(before.pts));
    const prevLeaders = prevTop > 0 ? before.players.filter((m) => before.pts[m.id] === prevTop).map((m) => m.id) : [];
    const names = andList(leaders.map((m) => m.nickname));
    const same = leaders.length === prevLeaders.length && leaders.every((m) => prevLeaders.includes(m.id));
    if (!prevLeaders.length) lines.push(`🥇 Erste Führung: ${names} (${top} ${top === 1 ? 'Punkt' : 'Punkte'})`);
    else if (same) lines.push(`🥇 ${names} ${leaders.length > 1 ? 'bleiben' : 'bleibt'} vorne (${top} ${top === 1 ? 'Punkt' : 'Punkte'})`);
    else if (leaders.length > 1 && leaders.some((m) => prevLeaders.includes(m.id))) lines.push(`🥇 Gleichstand an der Spitze: ${names} (${top} ${top === 1 ? 'Punkt' : 'Punkte'})`);
    else lines.push(`🥇 Neue Spitze: ${names} (${top} ${top === 1 ? 'Punkt' : 'Punkte'})`);
  }
  if (lr.nr > 1) {
    let best = null;
    for (const m of after.players) {
      const jump = before.rank(m.id) - after.rank(m.id);
      if (jump >= 2 && (!best || jump > best.jump)) best = { m, jump, from: before.rank(m.id), to: after.rank(m.id) };
    }
    if (best) lines.push(`📈 Aufsteiger der Etappe: ${best.m.nickname} (Platz ${best.from} → ${best.to})`);
  }
  const answered = new Set((S.riddlePoints || []).filter((r) => r.riddle_id === lr.id).map((r) => r.member_id));
  const missing = tourCrew().filter((m) => !answered.has(m.id)).map((m) => m.nickname);
  if (missing.length && missing.length <= 3) lines.push(`💤 Nicht getippt: ${andList(missing)}`);
  const zero = after.players.filter((m) => after.pts[m.id] === 0 && !missing.includes(m.nickname)).map((m) => m.nickname);
  if (lr.nr >= 3 && zero.length && zero.length <= 2) lines.push(`🥾 Noch ohne Punkt: ${andList(zero)}. Wird schon.`);
  return lines;
}
function recapHtml(lr) {
  if (!S.riddlePoints?.length) return '';
  const lines = recapLines(lr);
  if (!lines.length) return '';
  return `<div class="recap"><b>Rückblick nach Etappe ${lr.nr}</b>${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- Zeitreise: jeden Tag ein Foto aus den alten Touren
function berlinToday() {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (k) => p.find((x) => x.type === k).value;
  return { y: Number(g('year')), md: `${g('month')}-${g('day')}`, key: `${g('year')}-${g('month')}-${g('day')}` };
}
const isAdminId = (id) => !!S.members.find((m) => m.id === id)?.is_admin;
function timeTravelPick() {
  const pool = S.photos.filter((p) => p.taken_on && S.photoUrls[p.storage_path] && (!p.uploaded_by || isAdminId(p.uploaded_by)));
  if (!pool.length) return null;
  const today = berlinToday();
  const seed = [...today.key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const exact = pool.filter((p) => p.taken_on.slice(5) === today.md && Number(p.taken_on.slice(0, 4)) < today.y);
  const list = exact.length ? exact : pool;
  return { photo: list[seed % list.length], exact: exact.length > 0, today };
}
function viewTimeTravel() {
  const pick = timeTravelPick();
  if (!pick) return '';
  const { photo, exact, today } = pick;
  const tour = S.tours.find((t) => t.id === photo.tour_id);
  const y = Number(photo.taken_on.slice(0, 4));
  const ago = today.y - y;
  let day = '';
  if (tour?.date_from) {
    const n = Math.round((new Date(photo.taken_on) - new Date(tour.date_from)) / 864e5) + 1;
    if (n >= 1 && n <= 5) day = ` · Tag ${n}`;
  }
  const label = exact ? `Heute vor ${ago} ${ago === 1 ? 'Jahr' : 'Jahren'}` : 'Zeitreise';
  return `<div class="card timetravel">
    <span class="label">${label}</span>
    <button class="ttimg" data-action="lightbox" data-path="${esc(photo.storage_path)}" aria-label="Foto vergrößern"><img src="${esc(S.photoUrls[photo.storage_path])}" alt="Foto ${y}" loading="lazy"></button>
    <p class="title" style="margin:0">${esc(tour?.title || 'Tour ' + y)} ${y}</p>
    <p class="muted small" style="margin:0">${fmtDate(photo.taken_on)}${day}${exact ? '' : ' · morgen gibt es ein neues Foto'}</p>
  </div>`;
}

// Wer bei der Tour dabei ist (Zusage „Ja“ oder „Vielleicht“), zählt bei Tipps, Abstimmungen und Rückblick.
// Wer nicht mitfährt, aber trotzdem mitmacht, wird mitgezählt, sobald er getippt bzw. abgestimmt hat.
function tourCrew() {
  const base = S.members.filter((m) => !m.is_guest && !m.is_quizmaster);
  const yes = base.filter((m) => ['ja', 'vielleicht'].includes(rsvpOf(m.id)));
  return yes.length ? yes : base;
}

function participants() {
  const yes = S.members.filter((m) => rsvpOf(m.id) === 'ja');
  return yes.length ? yes : S.members.filter((m) => !m.is_guest);
}

function kasseCalc() {
  const people = participants();
  const ids = new Set(people.map((p) => p.id));
  S.expenses.forEach((e) => { ids.add(e.paid_by); S.shares.filter((x) => x.expense_id === e.id).forEach((x) => ids.add(x.member_id)); });
  const bal = {}; ids.forEach((id) => { bal[id] = 0; });
  let total = 0;
  S.expenses.forEach((e) => {
    const amt = Number(e.amount); total += amt;
    const sh = S.shares.filter((x) => x.expense_id === e.id).map((x) => x.member_id);
    if (!sh.length) return;
    bal[e.paid_by] += amt;
    sh.forEach((m) => { bal[m] -= amt / sh.length; });
  });
  const cred = Object.entries(bal).filter(([, v]) => v > 0.005).map(([m, v]) => ({ m, v })).sort((a, b) => b.v - a.v);
  const debt = Object.entries(bal).filter(([, v]) => v < -0.005).map(([m, v]) => ({ m, v: -v })).sort((a, b) => b.v - a.v);
  const transfers = []; let ci = 0, di = 0;
  while (ci < cred.length && di < debt.length) {
    const x = Math.min(cred[ci].v, debt[di].v);
    transfers.push({ from: debt[di].m, to: cred[ci].m, amt: x });
    cred[ci].v -= x; debt[di].v -= x;
    if (cred[ci].v < 0.005) ci++;
    if (debt[di].v < 0.005) di++;
  }
  return { total, bal, transfers, count: Math.max(1, people.length) };
}

// ---------------------------------------------------------------- Ansichten: Start
function viewStart() {
  const t = S.tour;
  const daysLeft = t ? calendarDaysUntil(t.date_from) : '–';
  const past = S.tours.filter((x) => x.year < TOUR_YEAR).length;
  const rv = revealState();
  const myStatus = rsvpOf(S.me.id);
  const cnt = { ja: 0, vielleicht: 0, nein: 0, offen: 0 };
  S.members.forEach((m) => { cnt[rsvpOf(m.id)]++; });
  const cr = currentRiddle();
  const lr = lastResolvedRiddle();
  const firstRiddle = S.riddles[0];
  const orgaNames = S.organizers.filter((o) => o.tour_id === t?.id).map((o) => nick(o.member_id)).join(' & ');

  return `
  <section class="hero">
    <div class="hero-top"><span class="kicker">HUT, HUT …</span><span class="chip">Reiseleitung: ${esc(orgaNames || '–')}</span></div>
    ${brandHtml()}
    <div class="jubi"><span class="jubi-label">10 Jahre · Jubiläumswanderung ${TOUR_YEAR}</span><h1>Mallorca</h1></div>
    <p>${esc(t?.region || '')}${t ? ' · ' + fmtDate(t.date_from) + '–' + fmtDate(t.date_to) : ''}${t?.motto ? '<br>Motto: ' + esc(t.motto) : ''}</p>
    <div class="big-count"><b>${daysLeft}</b><span>Tage bis<br>zum Abflug</span></div>
    <div class="bars">${Array.from({ length: 10 }, (_, i) => `<i class="${i < past ? 'on' : ''}"></i>`).join('')}</div>
    <span class="kicker" style="letter-spacing:0;font-weight:500">${past} Touren geschafft · die 10. kommt</span>
  </section>
  <div class="pad">
    ${viewNotifCard()}

    ${viewRiddleCard(cr, lr, firstRiddle)}

    ${openPolls().slice(0, 2).map((p) => pollCard(p)).join('')}
    ${openPolls().length > 2 ? `<button class="btn ghost" data-action="open" data-overlay="polls">Alle ${openPolls().length} offenen Abstimmungen</button>` : ''}

    ${viewTimeTravel()}

    ${rv.finished ? `
      <div class="card dark"><span class="label">Enthüllungen</span><p class="title">Alles enthüllt. Ab nach Mallorca!</p></div>
    ` : `
      <div class="card dark">
        <span class="label">${rv.done === 0 ? 'Erste Enthüllung' : 'Nächste Enthüllung'} · ${Math.min(rv.done + 1, rv.total)} von ${rv.total}</span>
        <p class="title">${esc(rv.next.teaser)}</p>
        <div class="count4" id="revealCount">${countHtml(rv.next.reveal_at)}</div>
        <div class="bars">${Array.from({ length: rv.total }, (_, i) => `<i class="${i < rv.done ? 'on' : ''}" style="${i === rv.done ? 'background:#fff' : ''}"></i>`).join('')}</div>
        <p class="muted small">${rv.afterJoke ? 'Wer auf den Aprilscherz reingefallen ist, schuldet eine Runde. ' : ''}Enthüllung am ${fmtDateTime(rv.next.reveal_at)} · nur hier in der App</p>
      </div>
    `}

    ${rv.latest && S.revealContents[rv.latest.id] ? `
      <div class="card"><span class="label">Zuletzt enthüllt</span>
        <p class="title">${esc(S.revealContents[rv.latest.id].title || rv.latest.teaser)}</p>
        <p class="muted" style="white-space:pre-line">${esc(S.revealContents[rv.latest.id].body || '')}</p>
      </div>` : ''}

    <div class="card">
      <span class="label">Teilnahme ${TOUR_YEAR}</span>
      <p class="title">Bist du auf Mallorca dabei?</p>
      <div class="yesno">
        <button class="yn yes ${myStatus === 'ja' ? 'on' : ''}" data-action="rsvp" data-status="ja">${myStatus === 'ja' ? '✓ ' : ''}Ja, ich bin dabei</button>
        <button class="yn maybe ${myStatus === 'vielleicht' ? 'on' : ''}" data-action="rsvp" data-status="vielleicht">${myStatus === 'vielleicht' ? '✓ ' : ''}Vielleicht</button>
        <button class="yn no ${myStatus === 'nein' ? 'on' : ''}" data-action="rsvp" data-status="nein">${myStatus === 'nein' ? '✓ ' : ''}Nein</button>
      </div>
      <p class="muted small">${cnt.ja} dabei · ${cnt.vielleicht} vielleicht · ${cnt.nein} nicht dabei · ${cnt.offen} offen</p>
      <button class="btn ghost" data-action="open" data-overlay="teil">Wer ist dabei?</button>
    </div>

    <div class="tiles">
      <button class="tile" data-action="open" data-overlay="kasse"><b>Kasse</b><span>Wer schuldet wem</span></button>
      <button class="tile" data-action="open" data-overlay="pack"><b>Packliste</b><span>${packDoneCount()} von ${PACK_TOTAL} gepackt</span></button>
      <button class="tile" data-action="open" data-overlay="teil"><b>Teilnehmer</b><span>${cnt.ja} Zusagen</span></button>
      <button class="tile" data-action="open" data-overlay="polls"><b>Abstimmungen</b><span>${openPolls().length ? openPolls().length + ' offen' : 'Alle Ergebnisse'}</span></button>
    </div>
    ${S.me.is_admin && !S.preview ? `<button class="btn ghost" data-action="previewOn">Als Mitglied ansehen (Vorschau)</button>
    <button class="btn ghost" data-action="testPush">Test-Mitteilung an mich</button>` : ''}
    <button class="btn ghost" data-action="logout">Abmelden (${esc(S.me.nickname)})</button>
    <p class="muted small" style="text-align:center;opacity:.6">App-Version ${APP_VERSION}</p>
  </div>`;
}

function countHtml(target) {
  const c = splitCountdown(target);
  return `<div><b>${c.d}</b><span>Tage</span></div><div><b>${c.h}</b><span>Std</span></div><div><b>${c.m}</b><span>Min</span></div><div class="sec"><b>${c.s}</b><span>Sek</span></div>`;
}

function viewNotifCard() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!('Notification' in window)) {
    if (ios && !standalone) {
      return `<div class="card alert"><span class="label">Keine Enthüllung verpassen</span>
        <p class="muted">Leg die App auf deinen Home-Bildschirm: unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>. Öffne sie danach von dort, dann kannst du Mitteilungen erlauben.</p></div>`;
    }
    return '';
  }
  if (Notification.permission !== 'default') return '';
  return `<div class="card alert"><span class="label">Keine Enthüllung verpassen</span>
    <p class="muted">Ich sage dir Bescheid, wenn ich etwas enthülle oder ein neues Rätsel kommt. Sonst nichts, versprochen.</p>
    <button class="btn block" data-action="allowNotif">Mitteilungen erlauben</button></div>`;
}

function viewRiddleCard(cr, lr, first) {
  const players = tourCrew().length;
  const nextR = S.riddles.find((r) => new Date(r.publish_at).getTime() > now()) || null;
  const meQuiz = isQuizmaster();
  const lb = S.leaderboard.find((r) => r.member_id === S.me.id);
  let myRank = null;
  if (lb) { const better = S.leaderboard.filter((r) => r.points > lb.points).length; myRank = better + 1; }
  let html = '<div class="card riddle">';

  if (cr) {
    const mine = S.myAnswers[cr.id];
    html += `<p class="rbrand">Wer weiß denn sowas?</p>
      <div class="riddle-top"><span class="label">Der Rätselsteig · Etappe ${cr.nr} von ${S.riddles.length}</span>
      <span class="rchip">${cr.kind === 'schaetzen' ? 'Schätzfrage · ' + cr.points + ' Punkte' : cr.kind === 'frei' ? 'Freie Antwort · ' + cr.points + ' Punkte' : cr.kind === 'mallorca' ? 'Mallorca' : 'Aus dem Archiv'}</span></div>
      <p class="rq">${esc(cr.question)}</p>`;
    if (meQuiz && cr.kind === 'frei') {
      html += `<div class="rstamp">Du bist Rätselmeister und kürst die beste Antwort. Tippe auf 👑, um jemanden zu küren (auch mehrere möglich).</div>
        ${freeAnswerList(cr, S.freeAnswers, true)}`;
    } else if (meQuiz) {
      const sol = S.solutions[cr.id];
      const right = sol ? (cr.kind === 'schaetzen' ? Number(sol.numeric_answer).toLocaleString('de-DE') : (cr.options || [])[sol.correct_option]) : '–';
      html += `<div class="rstamp">Du bist Rätselmeister und spielst außer Konkurrenz. Lösung: <b>${esc(right)}</b></div>`;
    } else if (cr.kind === 'frei') {
      html += `<label class="field" style="color:#fff">Deine Erklärung
        <textarea rows="3" maxlength="300" data-input="freeText" data-riddle="${cr.id}" placeholder="Schreib, was du glaubst – gern auch kreativ">${esc(mine?.text_value ?? '')}</textarea></label>
        <button class="btn light" data-action="saveFree" data-riddle="${cr.id}">${mine ? 'Antwort ändern' : 'Antwort abgeben'}</button>`;
    } else if (cr.kind === 'schaetzen') {
      html += `<label class="field" style="color:#fff">Deine Schätzung
        <input inputmode="numeric" data-input="estimate" data-riddle="${cr.id}" value="${esc(mine?.numeric_value ?? '')}" placeholder="Zahl eingeben"></label>
        <button class="btn light" data-action="saveEstimate" data-riddle="${cr.id}">${mine ? 'Schätzung ändern' : 'Schätzung abgeben'}</button>`;
    } else {
      html += `<div class="ropts">${(cr.options || []).map((o, i) => `<button class="ropt ${mine?.option_index === i ? 'on' : ''}" data-action="answer" data-riddle="${cr.id}" data-idx="${i}"><span class="rletter">${'ABCD'[i] || i + 1}</span>${esc(o)}</button>`).join('')}</div>`;
    }
    if (mine && !meQuiz) html += `<div class="rstamp">✓ Dein Tipp ist drin. Ändern geht bis zur Auflösung.</div>`;
    html += `<div class="rmeta"><span>Auflösung in</span><b id="riddleCount" data-target="${esc(cr.resolve_at)}">${shortCount(cr.resolve_at)}</b></div>
      <div class="rbar"><i style="width:${players ? Math.round(Math.min(S.riddleCount, players) / players * 100) : 0}%"></i></div>
      <p class="rsmall">${S.riddleCount} von ${players} haben getippt${!meQuiz && !mine ? ' · du fehlst noch!' : ''}${myRank && !meQuiz ? ` · Du bist aktuell auf Platz ${myRank}` : ''}</p>`;
    if (isAdmin()) {
      const all = players > 0 && S.riddleCount >= players;
      const needCrown = cr.kind === 'frei' && !(S.solutions[cr.id]?.winner_ids || []).length;
      html += all
        ? `<div class="rstamp">🎉 Alle haben getippt.${needCrown ? ' Erst küren, dann auflösen.' : ''}</div>
           <button class="btn light" data-action="resolveNow" data-riddle="${cr.id}" ${needCrown ? 'disabled' : ''}>Jetzt auflösen</button>`
        : `<button class="btn ghost rlink" data-action="resolveNow" data-riddle="${cr.id}">Vorzeitig auflösen (Reiseleitung)</button>`;
    }
  } else if (nextR) {
    const isFirst = nextR === first;
    html += `<p class="rbrand">Wer weiß denn sowas?</p>
      <div class="riddle-top"><span class="label">Der Rätselsteig · ${isFirst ? S.riddles.length + ' Etappen bis Mallorca' : 'Etappe ' + nextR.nr + ' von ' + S.riddles.length}</span></div>
      <p class="rq" style="font-size:20px">${isFirst ? 'Die erste Etappe startet in' : 'Die nächste Etappe startet in'}</p>
      <div class="count4 rcount" id="riddleStart" data-target="${esc(nextR.publish_at)}">${countHtml(nextR.publish_at)}</div>
      <p class="rsmall">${isFirst ? `Ab ${fmtDateTime(first.publish_at)} alle 14 Tage ein neues Rätsel, jeweils sonntags um 20 Uhr. Ihr habt 3 Tage Zeit, Mittwoch um 20 Uhr wird aufgelöst. Wer am Ende vorne liegt, sucht sich auf Mallorca als Erster sein Zimmer aus.` : `Am ${fmtDateTime(nextR.publish_at)} geht es weiter. Ihr habt dann wieder 3 Tage Zeit.`}</p>`;
  } else {
    html += `<p class="rbrand">Wer weiß denn sowas?</p><span class="label">Der Rätselsteig</span><p class="rq">Alle 20 Etappen sind geschafft.</p>`;
  }

  if (lr && S.solutions[lr.id]) {
    const sol = S.solutions[lr.id];
    const isFree = lr.kind === 'frei';
    const right = isFree ? 'Die Auflösung' : lr.kind === 'schaetzen' ? Number(sol.numeric_answer).toLocaleString('de-DE') : (lr.options || [])[sol.correct_option];
    const mineLast = S.myAnswers[lr.id];
    const iWasRight = mineLast && (isFree ? (sol.winner_ids || []).includes(S.me.id) : lr.kind === 'schaetzen' ? S.lastRight.some((x) => x.startsWith(S.me.nickname + ' ')) : mineLast.option_index === sol.correct_option);
    html += `<div class="rsolve"><span class="label" style="color:var(--accent)">Auflösung Etappe ${lr.nr}</span>
      <p style="margin:0;font-weight:800;font-size:17px">${esc(right)}</p>
      <p class="muted small" style="margin:0">${esc(sol.explanation || '')}</p>
      ${isFree ? `<p style="margin:0;font-size:14px"><b>👑 Gekürt:</b> ${S.lastRight.length ? esc(S.lastRight.join(' · ')) : 'Ich küre noch.'}</p>
        ${S.lastAll.length ? `<details class="rall"><summary>Alle ${S.lastAll.length} Antworten lesen</summary>${freeAnswerList(lr, S.lastAll, isAdmin())}</details>` : ''}`
      : `<p style="margin:0;font-size:14px"><b>${lr.kind === 'schaetzen' ? 'Am nächsten dran' : 'Richtig lagen'}:</b> ${S.lastRight.length ? esc(S.lastRight.join(', ')) : 'niemand. Peinlich.'}</p>`}
      ${mineLast && !meQuiz ? `<p style="margin:0;font-size:14px;font-weight:700;color:${iWasRight ? 'var(--ok)' : 'var(--accent-dark)'}">${isFree ? (iWasRight ? 'Und du bist dabei. Stark!' : 'Diesmal nicht gekürt.') : (iWasRight ? 'Du auch. Stark!' : 'Du leider nicht.')}</p>` : ''}
      ${recapHtml(lr)}</div>`;
  }
  html += `<button class="btn ghost rlink" data-action="goQuizRank">Zur Rätsel-Rangliste</button></div>`;
  return html;
}

// Zweites Tippen innerhalb von 5 Sekunden bestätigt (ohne Browser-Dialog)
function confirmTwice(el) {
  const k = el.dataset.riddle, t = Date.now();
  if (S._confirm && S._confirm.k === k && t - S._confirm.t < 5000) { S._confirm = null; return true; }
  S._confirm = { k, t }; return false;
}

function freeAnswerList(r, answers, canCrown) {
  const wins = S.solutions[r.id]?.winner_ids || [];
  if (!answers.length) return `<p class="rsmall">Noch keine Antworten.</p>`;
  return `<div class="ranswers">${answers.map((a) => {
    const won = wins.includes(a.member_id);
    return `<div class="ranswer ${won ? 'won' : ''}"><div><b>${esc(nick(a.member_id))}</b><p>${esc(a.text_value)}</p></div>
      ${canCrown ? `<button class="crown ${won ? 'on' : ''}" data-action="crown" data-riddle="${r.id}" data-member="${a.member_id}" aria-label="Küren">👑</button>` : won ? '<span class="crown on">👑</span>' : ''}</div>`;
  }).join('')}</div>`;
}

function shortCount(target) {
  const c = splitCountdown(target);
  return c.d > 0 ? `${c.d} T ${c.h}:${c.m}:${c.s}` : `${c.h}:${c.m}:${c.s}`;
}

// ---------------------------------------------------------------- Ansichten: Etappen
function viewEtappen() {
  const st = S.stages.filter((s) => s.tour_id === S.tour?.id);
  const hidden = S.reveals.filter((r) => !r.is_joke && /Tag/.test(r.teaser) && new Date(r.reveal_at).getTime() > now());
  return `<div class="pad">
    <h2 style="font-size:30px">Die Etappen</h2>
    <p class="muted">${esc(S.tour?.region || '')} · ${S.tour ? fmtDate(S.tour.date_from) + '–' + fmtDate(S.tour.date_to) : ''}</p>
    <div class="card"><div class="list">
      ${st.map((s) => {
        const n = S.schedule.filter((x) => x.stage_id === s.id).length;
        return `<button class="row rowbtn" data-action="openStage" data-id="${s.id}"><span class="daybox">${esc(s.day_label)}</span><span class="grow"><b>${esc(s.title)}</b><span class="muted small">${esc(s.meta || '')}</span>
          <span class="small" style="color:var(--accent-dark);font-weight:700">${n ? `Tagesablauf · ${n} ${n === 1 ? 'Punkt' : 'Punkte'}` : (isAdmin() ? 'Tagesablauf eintragen' : 'Tagesablauf folgt')}</span></span><span aria-hidden="true" style="color:var(--muted);font-size:20px">›</span></button>`;
      }).join('')}
    </div></div>
    ${hidden.length ? `<div class="card pine"><span class="label">Noch geheim · ${hidden.length} ${hidden.length === 1 ? 'Etappe' : 'Etappen'}</span>
      <p class="title" style="font-size:24px">Sei nicht so ungeduldig.</p>
      <p class="muted">Die Etappen werden enthüllt, wenn es so weit ist. Bis dahin: Wanderschuhe einlaufen und Füße still halten.</p>
    </div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- Ansichten: Ranking
function viewRanking() {
  return `<div class="pad">
    <h2 style="font-size:30px">Ranking</h2>
    <div class="seg">
      <button class="${S.rankSeg === 'quiz' ? 'on' : ''}" data-action="seg" data-seg="quiz">Rätsel</button>
      <button class="${S.rankSeg === 'orga' ? 'on' : ''}" data-action="seg" data-seg="orga">Orga</button>
    </div>
    ${S.rankSeg === 'orga' ? viewOrga() : viewQuiz()}
  </div>`;
}

function viewOrga() {
  const years = [TOUR_YEAR + 1];
  const counts = {};
  S.organizers.filter((o) => S.tours.find((t) => t.id === o.tour_id && t.year < TOUR_YEAR))
    .forEach((o) => { counts[o.member_id] = (counts[o.member_id] || 0) + 1; });
  const bilanz = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${esc(nick(id))} ${n}×`).join(' · ');
  const never = S.members.filter((m) => !m.is_guest && !counts[m.id] && !S.organizers.some((o) => o.member_id === m.id)).map((m) => m.nickname);
  return `
    <div class="card">
      <span class="label">Orga-Kalender</span>
      <p class="muted">Wer übernimmt die Tour ${TOUR_YEAR + 1}? Allein oder zu zweit.</p>
      ${years.map((y) => `<div style="display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid #E6EAE2">
        <b style="font-family:Archivo;font-size:17px;color:var(--pine)">${y}</b>
        <div class="slotgrid">${[1, 2].map((slot) => {
          const s = S.slots.find((x) => x.year === y && x.slot === slot);
          const mineOrAdmin = s && (s.member_id === S.me.id || isAdmin());
          if (s) return `<button class="slot taken ${mineOrAdmin ? '' : 'other'}" data-action="slotDel" data-year="${y}" data-slot="${slot}" ${mineOrAdmin ? '' : 'disabled'}>${esc(nick(s.member_id))}<small>${mineOrAdmin ? 'Tippen zum Austragen' : 'eingetragen'}</small></button>`;
          return `<button class="slot" data-action="slotAdd" data-year="${y}" data-slot="${slot}">${slot === 1 ? 'Ich übernehme' : '+ Co-Orga'}<small>${slot === 1 ? 'Orga gesucht' : 'optional'}</small></button>`;
        }).join('')}</div></div>`).join('')}
    </div>
    <div class="card"><span class="label">Orga-Bilanz</span>
      <p style="margin:0;font-size:15px;line-height:1.45">${bilanz}</p>
      ${never.length ? `<p class="muted">Noch nie organisiert: ${esc(never.join(' und '))}. Nur so als Hinweis.</p>` : ''}
    </div>
`;
}

function viewArchiv() {
  return `<div class="pad">
    <h2 style="font-size:30px">Archiv</h2>
    <p class="muted">${S.tours.filter((x) => x.year < TOUR_YEAR).length} Touren seit 2018. Antippen für Etappen, Fotos und was hängen blieb.</p>
    <div class="list" style="gap:8px">
      ${S.tours.map((t) => {
        const org = S.organizers.filter((o) => o.tour_id === t.id).map((o) => nick(o.member_id)).join(' & ');
        const cover = S.photos.find((p) => p.tour_id === t.id);
        const curl = cover && S.photoUrls[cover.storage_path];
        return `<button class="yearbtn ${t.year === TOUR_YEAR ? 'current' : ''}" data-action="openYear" data-year="${t.year}">
          ${curl ? `<img src="${esc(curl)}" alt="" style="width:52px;height:52px;border-radius:10px;object-fit:cover;flex:none">` : ''}
          <span class="yr">${t.year}</span>
          <span class="grow" style="display:flex;flex-direction:column;gap:2px"><b>${esc(t.title)}</b><span class="muted small">${esc(org)}${t.region ? ' · ' + esc(t.region) : ''}</span></span>
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function viewQuiz() {
  const resolved = S.riddles.filter((r) => new Date(r.resolve_at).getTime() <= now()).length;
  let lastPts = null, lastRank = 0;
  const rows = S.leaderboard.map((r, i) => {
    const rank = r.points === lastPts ? lastRank : i + 1; lastPts = r.points; lastRank = rank;
    return `<div class="row"><span class="rank">${rank}</span><div class="grow"><b>${esc(r.nickname)}</b><span class="muted small">${rank === 1 && resolved ? 'Aktuell Rätselkönig · erstes Zimmerwahlrecht' : r.answered + ' beantwortet'}</span></div><span class="pts">${r.points}</span></div>`;
  }).join('');
  return `
    <div class="card dark"><span class="label">Wer weiß denn sowas? · Der Rätselsteig</span>
      <p class="title">${resolved ? `Stand nach Etappe ${resolved} von ${S.riddles.length || 20}` : 'Noch keine Etappe aufgelöst'}</p>
      <p class="muted">Wird nach jeder Auflösung alle 14 Tage aktualisiert. Platz 1 hat auf Mallorca das erste Zimmerwahlrecht, Platz 1–3 bekommen einen Bonus in der Jubiläums-Olympiade.</p>
    </div>
    <div class="card"><div class="list">${rows || '<p class="muted">Noch keine Punkte.</p>'}</div></div>
    <p class="muted small">${esc(S.members.filter((m) => m.is_quizmaster).map((m) => m.nickname).join(', '))} schreibt die Rätsel und spielt außer Konkurrenz.</p>`;
}

// ---------------------------------------------------------------- Ansichten: Olympiade
function viewOlympia() {
  const unlock = new Date('2027-06-01T20:00:00+02:00').getTime() <= now();
  return `<div class="pad">
    <h2 style="font-size:30px">Jubiläums-Olympiade</h2>
    <p class="muted">2027 auf Mallorca · die nächste gibt es erst zu 20 Jahren HIKE!, 2037.</p>
    <div class="card" style="background:#8A5A12;color:#fff">
      <span class="label" style="color:#FFE2B8">Der Preis</span>
      <p class="title">Die goldene Wandermütze</p>
      <p style="margin:0;font-size:14px;line-height:1.45">Wird nur zum Jubiläum vergeben: 2027 und wieder 2037. Bis dahin wandert sie mit, denn der Träger muss sie auf jeder Tour dabeihaben.</p>
    </div>
    <div class="card"><span class="label">Die Regeln der Mütze</span><div class="list">
      <div class="row"><span class="daybox">1</span><div class="grow"><b>Die Mütze fehlt auf keiner Tour.</b><span class="muted small">Ist der Träger verhindert, übergibt er sie vorher an einen Stellvertreter. Fehlt sie trotzdem, zahlt er die erste Runde.</span></div></div>
      <div class="row"><span class="daybox">2</span><div class="grow"><b>Tragepflicht beim Gipfelfoto.</b><span class="muted small">Jedes Jahr ein Mützenfoto – bis 2037 wird daraus eine eigene Galerie.</span></div></div>
    </div></div>
    <div class="card"><span class="label">Der Fahrplan</span><div class="list">
      <div class="row"><span class="daybox">06</span><div class="grow"><b>Juni: Enthüllung der Disziplinen</b><span class="muted small">01.06.2027 um 20:00 Uhr</span></div></div>
      <div class="row"><span class="daybox">07</span><div class="grow"><b>Sommer: Qualifikation</b><span class="muted small">In Ralles Pool auf der Amöneburg</span></div></div>
      <div class="row"><span class="daybox" style="background:var(--accent)">09</span><div class="grow"><b>Finale auf Mallorca</b><span class="muted small">Siegerehrung beim Jubiläumsessen</span></div></div>
    </div></div>
    ${unlock ? '' : `<div class="card pine"><span class="label">Noch geheim</span><p class="title">Die Disziplinen werden am 01.06.2027 enthüllt.</p><p class="muted">Bis dahin: Tischtennisschläger suchen, Arschbombe perfektionieren.</p></div>`}
    <div class="card"><span class="label">Startvorteile aus der Rätselwertung</span>
      <p style="margin:0;font-size:14px"><b>Platz 1:</b> bestimmt eine Zusatzdisziplin.</p>
      <p style="margin:0;font-size:14px"><b>Platz 2 und 3:</b> je ein Joker, um eine Disziplin zu wiederholen.</p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Overlays
const PACK = [
  ['ZU LAND · TAGESRUCKSACK (OSSIS ORIGINAL 2019)', [
    ['volvic', '1 große Flasche Volvic (Potti mag kein Volvic)'], ['fisch', 'Fischermanns (oder Vivil, Potti 2021)'], ['dextro', 'Dextrose'],
    ['messer', 'Messer (nur ins Aufgabegepäck!)'], ['feuer', 'Feuerzeug'], ['stirn', 'Stirnlampe'], ['lade', 'Ladegerät Handy'],
    ['kappe', 'Kappe/Mütze'], ['stock', 'Wanderstock'], ['tempo', 'Tempo'], ['pflaster', 'Pflaster'], ['blasen', 'Blasenpflaster'],
    ['regen', 'Regenjacke'], ['gps', 'GPS-Daten'], ['lunch', 'Gefrierbeutel Lunchpaket'], ['handschuhe', 'Handschuhe (Mallorca im September: mutig)']]],
  ['KLEIDUNG (ORIGINAL)', [
    ['hose', 'Wanderhose'], ['shirts', 'T-Shirts'], ['socken', 'Wandersocken'], ['pulli', 'Wanderpulli'],
    ['wolfgang', 'Sportunterhosen gegen Wolfgang'], ['wechsel', 'Ggf. Wechselklamotten'], ['abend', 'Hose / Pulli / ggf. Schuhe fürs Abendessen'],
    ['abendwaesche', 'Socken/Unterhosen abends'], ['jogging', 'Jogginghose/Shorts'], ['lange', 'Ggf. lange Unterhosen (bei 28 Grad eher nicht)'],
    ['beutel', 'Beutel für dreckige Wäsche']]],
  ['KULTURBEUTEL (ORIGINAL)', [['dusche', 'Reiseduschgel/Zahnpasta/Deo'], ['medis', 'Medikamente'], ['ohren', 'Ohrstöpsel'], ['buerste', 'Bürste für Schuhe']]],
  ['SEIT 2019 UNGEKLÄRT', [['seil', 'Seil (Stürmi: „Wofür war nochmal das Seil?“)'], ['angel', 'Angelhaken'], ['kabel', 'Kabelbinder'], ['wanderkarte', 'Wanderkarte']]],
  ['NEU · ZU WASSER', [['badehose', 'Badehose'], ['handtuch', 'Handtuch'], ['badeschuhe', 'Badeschuhe für die felsigen Buchten'], ['sonne', 'Sonnencreme']]],
  ['NEU · IN DER LUFT', [['ausweis', 'Personalausweis'], ['bordkarte', 'Bordkarte aufs Handy'], ['powerbank', 'Powerbank (ins Handgepäck)'], ['karte', 'Krankenversicherungskarte']]],
  ['NEU · TRADITION', [['schnaps', 'Starterschnaps'], ['witze', 'Neue Witze (Ralle)'], ['pool', 'Form für die Jubiläums-Olympiade']]]
];
const PACK_TOTAL = PACK.reduce((a, g) => a + g[1].length, 0);
const packDoneCount = () => PACK.reduce((a, g) => a + g[1].filter(([k]) => S.packing[k]).length, 0);

function overlayShell(label, inner) {
  return `<div class="overlay"><div class="overlay-inner">
    <div class="overlay-head"><span class="label">${esc(label)}</span><button class="close" data-action="close" aria-label="Schließen">×</button></div>
    ${inner}</div></div>`;
}

function viewPack() {
  const done = packDoneCount();
  return overlayShell('Packliste Mallorca', `
    <h2 style="font-size:28px">Die Packliste – Das Original seit 2018</h2>
    <p class="muted small">ergänzt mit sinnvollen Details für Mallorca</p>
    <div class="card"><b>${done} von ${PACK_TOTAL} gepackt${done === PACK_TOTAL ? ' · Startklar!' : ''}</b><div class="progress"><i style="width:${Math.round(done / PACK_TOTAL * 100)}%"></i></div></div>
    ${PACK.map(([g, items]) => `<div class="card" style="gap:2px"><span class="label">${esc(g)}</span>
      ${items.map(([k, label]) => `<button class="check ${S.packing[k] ? 'done' : ''}" data-action="pack" data-key="${k}"><span class="box">${S.packing[k] ? '✓' : ''}</span><span>${esc(label)}</span></button>`).join('')}
    </div>`).join('')}`);
}

function viewTeil() {
  const cnt = { ja: 0, vielleicht: 0, nein: 0, offen: 0 };
  S.members.forEach((m) => { cnt[rsvpOf(m.id)]++; });
  return overlayShell(`Teilnehmer · Mallorca ${TOUR_YEAR}`, `
    <h2 style="font-size:28px">Wer ist dabei?</h2>
    <p class="muted">${cnt.ja} dabei · ${cnt.vielleicht} vielleicht · ${cnt.nein} nicht dabei · ${cnt.offen} offen</p>
    ${isAdmin() && S.appStatus ? (() => {
      const crew = S.members.filter((m) => !m.is_guest && m.id !== S.me.id && ['ja', 'vielleicht'].includes(rsvpOf(m.id)));
      const inApp = crew.filter((m) => S.appStatus[m.id]?.logged_in), push = crew.filter((m) => S.appStatus[m.id]?.push_on);
      const missing = crew.filter((m) => !S.appStatus[m.id]?.logged_in).map((m) => m.nickname);
      return `<div class="card dark"><span class="label">Nur für dich · App-Stand</span>
        <p class="title" style="margin:0">${inApp.length} von ${crew.length} angemeldet · ${push.length} mit Mitteilungen</p>
        <p class="muted small" style="margin:0">${missing.length ? 'Noch nicht drin: ' + esc(missing.join(', ')) : 'Alle sind drin. 🎉'}</p></div>`;
    })() : ''}
    <div class="card" style="gap:0"><div class="list">
      ${S.members.map((m) => {
        const st = rsvpOf(m.id);
        return `<div class="row"><div class="grow"><b>${esc(m.nickname)}${m.id === S.me.id ? ' (du)' : ''}</b>
          <span class="muted small">${m.is_guest ? 'Von mir hinzugefügt' : (st === 'offen' ? 'Hat noch nicht geantwortet' : '')}${isAdmin() && !m.is_guest ? (m.email ? ' · ' + esc(m.email) : ' · keine E-Mail hinterlegt') : ''}${isAdmin() && S.appStatus && !m.is_guest ? (S.appStatus[m.id]?.logged_in ? ' · ✓ in der App' + (S.appStatus[m.id]?.push_on ? ' · 🔔' : ' · 🔕 keine Mitteilungen') : ' · noch nicht angemeldet') : ''}</span></div>
          ${isAdmin() || m.id === S.me.id ? `<button class="pill ${st}" data-action="cycleRsvp" data-member="${m.id}">${ST_LABEL[st]}</button>` : `<span class="pill ${st}" style="display:inline-flex;align-items:center">${ST_LABEL[st]}</span>`}
        </div>
        ${isAdmin() && !m.is_guest ? `<div style="display:flex;gap:6px;padding-bottom:10px;border-bottom:1px solid #EEF1EA">
          <input style="flex:1;min-height:38px;border-radius:8px;border:1.5px solid #C9D1C4;padding:0 10px" type="email" placeholder="E-Mail für den Login" data-input="memberEmail" data-member="${m.id}" value="${esc(m.email || '')}">
          <button class="pill offen" data-action="saveEmail" data-member="${m.id}">Speichern</button></div>` : ''}`;
      }).join('')}
    </div></div>
    ${isAdmin() ? `<div class="card dark"><span class="label">Nur für die Reiseleitung</span>
      <p class="muted">Status antippen, um ihn für jemanden zu ändern. Gäste oder Ersatzleute hier von Hand eintragen. Über die E-Mail-Adresse können sich die Jungs anmelden.</p>
      <label class="field" style="color:#fff">Person hinzufügen
        <input type="text" data-input="guestName" value="${esc(S.guestName)}" placeholder="Name oder Spitzname"></label>
      <button class="btn" data-action="addGuest">Hinzufügen</button></div>` : ''}`);
}

// ---------------------------------------------------------------- Abstimmungen
const pollIsOpen = (p) => !p.closed && (!p.closes_at || new Date(p.closes_at).getTime() > now());
const openPolls = () => S.polls.filter(pollIsOpen);
// Bei Abstimmungen zählt die Reiseleitung mit (beim Rätsel ist sie als Rätselmeister außen vor)
const voters = () => {
  const base = S.members.filter((m) => !m.is_guest);
  const yes = base.filter((m) => ['ja', 'vielleicht'].includes(rsvpOf(m.id)));
  return yes.length ? yes : base;
};

function pollCard(p, inOverlay = false) {
  const opts = S.pollOptions.filter((o) => o.poll_id === p.id);
  const votes = S.pollVotes.filter((v) => v.poll_id === p.id);
  const people = new Set(votes.map((v) => v.member_id));
  const mine = new Set(votes.filter((v) => v.member_id === S.me.id).map((v) => v.option_id));
  const open = pollIsOpen(p);
  const max = Math.max(1, ...opts.map((o) => votes.filter((v) => v.option_id === o.id).length));
  const missing = voters().filter((m) => !people.has(m.id)).map((m) => m.nickname);
  return `<div class="card poll">
    <span class="label">${open ? 'Abstimmung' : 'Abstimmung · beendet'}</span>
    <p class="title">${esc(p.question)}</p>
    <p class="muted small">${p.multi ? 'Mehrere Antworten möglich' : 'Eine Antwort'}${p.closes_at ? ` · ${open ? 'läuft bis' : 'endete am'} ${fmtDateTime(p.closes_at)}` : ''}</p>
    <div class="popts">
      ${opts.map((o) => {
        const vs = votes.filter((v) => v.option_id === o.id);
        const pct = people.size ? Math.round((vs.length / people.size) * 100) : 0;
        const lead = !open && vs.length === max && vs.length > 0;
        return `<button class="popt ${mine.has(o.id) ? 'on' : ''} ${lead ? 'lead' : ''}" ${open ? `data-action="vote" data-poll="${p.id}" data-option="${o.id}"` : 'disabled'}>
          <span class="pbar" style="width:${pct}%"></span>
          <span class="prow"><span class="pchk">${mine.has(o.id) ? '✓' : ''}</span><span class="ptext">${esc(o.label)}</span><b>${vs.length}</b></span>
          ${vs.length ? `<span class="pwho">${vs.map((v) => esc(nick(v.member_id))).join(', ')}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    <p class="muted small">${voters().filter((m) => people.has(m.id)).length} von ${voters().length} haben abgestimmt${open && missing.length && missing.length <= 4 ? ' · fehlt noch: ' + esc(missing.join(', ')) : ''}</p>
    ${isAdmin() && inOverlay ? `<div style="display:flex;gap:14px">
      ${open ? `<button class="btn ghost" data-action="pollClose" data-poll="${p.id}">Beenden</button>` : ''}
      <button class="btn ghost" data-action="pollDel" data-poll="${p.id}">Löschen</button></div>` : ''}
  </div>`;
}

function viewPolls() {
  const F = S.pollForm;
  const open = openPolls(), done = S.polls.filter((p) => !pollIsOpen(p));
  return overlayShell('Abstimmungen', `
    <h2 style="font-size:28px">Abstimmungen</h2>
    <p class="muted">Tipp auf eine Antwort, um abzustimmen. Nochmal tippen nimmt die Stimme zurück. Wer was gewählt hat, sehen alle.</p>
    ${isAdmin() ? `<div class="card dark"><span class="label">Neue Abstimmung</span>
      <label class="field" style="color:#fff">Frage<input type="text" maxlength="200" data-input="pollQ" value="${esc(F.q)}" placeholder="z. B. Welcher Flug?"></label>
      ${F.opts.map((o, i) => `<label class="field" style="color:#fff">Antwort ${i + 1}<input type="text" maxlength="120" data-input="pollOpt" data-i="${i}" value="${esc(o)}" placeholder="${i === 0 ? 'z. B. Freitag 6:10 Uhr ab FRA' : i === 1 ? 'z. B. Donnerstag 18:45 Uhr ab FRA' : 'weitere Antwort'}"></label>`).join('')}
      ${F.opts.length < 8 ? `<button class="btn ghost" style="color:#fff" data-action="pollAddOpt">+ Antwort hinzufügen</button>` : ''}
      <div class="chips"><button class="chipbtn ${F.multi ? '' : 'on'}" data-action="pollMulti" data-v="0">Eine Antwort</button><button class="chipbtn ${F.multi ? 'on' : ''}" data-action="pollMulti" data-v="1">Mehrere Antworten</button></div>
      <label class="field" style="color:#fff">Läuft bis (optional)<input type="datetime-local" data-input="pollCloses" value="${esc(F.closes)}"></label>
      <button class="btn" data-action="pollCreate" ${F.busy ? 'disabled' : ''}>Abstimmung starten</button>
      <p class="muted small">Alle bekommen sofort eine Mitteilung.</p>
    </div>` : ''}
    ${open.length ? open.map((p) => pollCard(p, true)).join('') : '<div class="card"><p class="muted">Gerade läuft keine Abstimmung.</p></div>'}
    ${done.length ? `<span class="label" style="margin-top:6px">Ergebnisse</span>${done.map((p) => pollCard(p, true)).join('')}` : ''}
  `);
}

function viewKasse() {
  const K = S.kasse;
  const people = participants();
  const forIds = K.forIds ?? people.map((p) => p.id);
  const paidBy = K.paidBy ?? S.me.id;
  const c = kasseCalc();
  const amt = parseFloat(String(K.amount).replace(',', '.'));
  return overlayShell(`Kasse · Mallorca ${TOUR_YEAR}`, `
    <h2 style="font-size:28px">Wer schuldet wem</h2>
    <div class="card pine" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><span class="muted small">Ausgaben gesamt</span><p class="title" style="font-size:22px">${eur(c.total)}</p></div>
      <div><span class="muted small">Ø pro Kopf</span><p class="title" style="font-size:22px">${eur(c.total / c.count)}</p></div>
    </div>
    <div class="card"><span class="label">Ausgleich · so wenig Überweisungen wie möglich</span>
      <div class="list">${c.transfers.length ? c.transfers.map((t) => `<div class="row"><div class="grow"><span><b>${esc(nick(t.from))}</b> → ${esc(nick(t.to))}</span></div><b>${eur(t.amt)}</b></div>`).join('') : '<p class="muted">Alles ausgeglichen.</p>'}</div>
    </div>
    <div class="card"><span class="label">Ausgabe eintragen</span>
      <label class="field">Wofür?<input type="text" data-input="kTitle" value="${esc(K.title)}" placeholder="z. B. Bier für den Pool"></label>
      <label class="field">Betrag in Euro<input type="text" inputmode="decimal" data-input="kAmount" value="${esc(K.amount)}" placeholder="0,00"></label>
      <b style="font-size:13px">Wer hat bezahlt?</b>
      <div class="chips">${S.members.map((m) => `<button class="chipbtn pay ${paidBy === m.id ? 'on' : ''}" data-action="kPaid" data-member="${m.id}">${esc(m.nickname)}</button>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">Für wen?</b>
        <span><button class="btn ghost" style="min-height:36px" data-action="kAll">Alle</button> <button class="btn ghost" style="min-height:36px" data-action="kNone">Keiner</button></span></div>
      <div class="chips">${S.members.map((m) => `<button class="chipbtn ${forIds.includes(m.id) ? 'on' : ''}" data-action="kFor" data-member="${m.id}">${forIds.includes(m.id) ? '✓ ' : ''}${esc(m.nickname)}</button>`).join('')}</div>
      <p class="muted small">${forIds.length ? `Wird auf ${forIds.length} ${forIds.length === 1 ? 'Person' : 'Personen'} aufgeteilt${amt > 0 ? ': je ' + eur(amt / forIds.length) : ''}.` : 'Bitte mindestens eine Person auswählen.'}</p>
      <button class="btn" data-action="kSave" ${K.busy ? 'disabled' : ''}>Ausgabe speichern</button>
    </div>
    <div class="card"><span class="label">Salden</span><div class="list">
      ${Object.entries(c.bal).map(([id, v]) => `<div class="row"><div class="grow">${esc(nick(id))}</div><b style="color:${v >= 0 ? 'var(--ok)' : 'var(--accent-dark)'}">${v >= 0 ? '+' : '−'}${eur(Math.abs(v))}</b></div>`).join('')}
    </div></div>
    <div class="card"><span class="label">Alle Ausgaben</span><div class="list">
      ${S.expenses.length ? S.expenses.map((e) => {
        const sh = S.shares.filter((x) => x.expense_id === e.id).map((x) => nick(x.member_id));
        const mayDel = e.created_by === S.me.id || isAdmin();
        return `<div class="row"><div class="grow"><b>${esc(e.title)}</b><span class="muted small">${esc(nick(e.paid_by))} · für ${esc(sh.join(', '))}${sh.length ? ' · je ' + eur(Number(e.amount) / sh.length) : ''}</span></div>
          <b>${eur(Number(e.amount))}</b>${mayDel ? `<button class="pill nein" data-action="kDel" data-id="${e.id}" aria-label="Löschen">×</button>` : ''}</div>`;
      }).join('') : '<p class="muted">Noch keine Ausgaben.</p>'}
    </div></div>`);
}

function viewStage(id) {
  const s = S.stages.find((x) => x.id === id);
  if (!s) return '';
  const items = S.schedule.filter((x) => x.stage_id === id).sort((a, b) => a.at_time.localeCompare(b.at_time));
  const F = S.sched;
  return overlayShell(`Etappe · ${s.day_label}`, `
    <h2 style="font-size:28px">${esc(s.title)}</h2>
    ${s.meta ? `<p class="muted">${esc(s.meta)}</p>` : ''}
    ${s.description ? `<p style="margin:0;line-height:1.5">${esc(s.description)}</p>` : ''}
    <div class="card"><span class="label">Tagesablauf</span>
      ${items.length ? `<div class="timeline">${items.map((x) => `<div class="tl">
        <span class="tltime">${esc(x.at_time)}</span>
        <div class="grow"><b>${esc(x.title)}</b>${x.note ? `<span class="muted small" style="display:block">${esc(x.note)}</span>` : ''}</div>
        ${isAdmin() ? `<button class="pill nein" data-action="schedDel" data-id="${x.id}" aria-label="Punkt löschen">×</button>` : ''}
      </div>`).join('')}</div>` : `<p class="muted">${isAdmin() ? 'Noch nichts eingetragen.' : 'Der Tagesablauf folgt. Ich bin dran.'}</p>`}
    </div>
    ${isAdmin() ? `<div class="card dark"><span class="label">Punkt hinzufügen</span>
      <div style="display:grid;grid-template-columns:110px 1fr;gap:8px">
        <label class="field" style="color:#fff">Uhrzeit<input type="time" data-input="schedTime" value="${esc(F.time)}"></label>
        <label class="field" style="color:#fff">Was?<input type="text" data-input="schedTitle" value="${esc(F.title)}" placeholder="z. B. Taxi holt uns ab"></label>
      </div>
      <label class="field" style="color:#fff">Hinweis (optional)<input type="text" data-input="schedNote" value="${esc(F.note)}" placeholder="z. B. Treffpunkt vor der Finca"></label>
      <button class="btn" data-action="schedAdd" data-stage="${s.id}">Hinzufügen</button>
    </div>` : ''}`);
}

function viewYear(year) {
  const t = S.tours.find((x) => x.year === year);
  if (!t) return '';
  const org = S.organizers.filter((o) => o.tour_id === t.id).map((o) => nick(o.member_id)).join(' & ');
  const st = S.stages.filter((s) => s.tour_id === t.id);
  return overlayShell('Tour-Archiv', `
    <h2 style="font-size:28px">${t.year} · ${esc(t.title)}</h2>
    <p class="muted">${esc(t.region || '')}${t.date_from ? ' · ' + fmtDate(t.date_from) + '–' + fmtDate(t.date_to) : ''}<br><b>Orga: ${esc(org)}</b></p>
    ${st.length ? `<div class="card"><span class="label">Die Etappen</span><div class="list">
      ${st.map((s) => `<div class="row"><span class="daybox">${esc(s.day_label)}</span><div class="grow"><b>${esc(s.title)}</b><span class="muted small">${esc(s.meta || '')}</span></div></div>`).join('')}
    </div></div>` : ''}
    ${viewPhotos(t)}
    ${t.summary ? `<div class="card"><span class="label">Was hängen blieb</span><p style="margin:0;line-height:1.5">${esc(t.summary)}</p></div>` : ''}`);
}

function viewPhotos(t) {
  const ph = S.photos.filter((p) => p.tour_id === t.id);
  const grid = ph.length ? `<div class="photogrid">${ph.map((p) => {
    const url = S.photoUrls[p.storage_path];
    return `<div class="ph">${url ? `<button class="phbtn" data-action="lightbox" data-path="${esc(p.storage_path)}" aria-label="Foto vergrößern"><img src="${esc(url)}" alt="${esc(p.caption || 'Foto ' + t.year)}" loading="lazy"></button>` : '<div class="phph"></div>'}
      ${p.uploaded_by && !isAdminId(p.uploaded_by) ? `<span class="phby">${esc(nick(p.uploaded_by))}</span>` : ''}
      ${isAdmin() || (p.uploaded_by && p.uploaded_by === S.me.id && !S.preview) ? `<button class="phdel" data-action="photoDel" data-id="${p.id}" aria-label="Foto löschen">×</button>` : ''}</div>`;
  }).join('')}</div>` : `<p class="muted">Noch keine Fotos. Du hast welche? Rein damit!</p>`;
  return `<div class="card"><span class="label">Fotos${ph.length ? ' · ' + ph.length : ''}</span>${grid}
    <label class="btn" style="display:flex;align-items:center;justify-content:center;cursor:pointer">${S.uploading ? esc(S.uploading) : 'Eigene Fotos hinzufügen'}
      <input type="file" accept="image/*" multiple data-upload="${t.id}" data-year="${t.year}" style="display:none" ${S.uploading ? 'disabled' : ''}></label>
    <p class="muted small">Fehlt ein Foto? Lad es hoch – es wird verkleinert und ist nur für die Crew sichtbar. Deine eigenen Fotos kannst du wieder löschen.</p></div>`;
}

// ---------------------------------------------------------------- Gesamtansicht
const ICONS = {
  start: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
  etappen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/></svg>',
  ranking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M9 20h6"/></svg>',
  archiv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></svg>',
  olympia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16c2 0 2-1.5 4-1.5S8 16 10 16s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M2 20c2 0 2-1.5 4-1.5S8 20 10 20s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="15" cy="5" r="2"/><path d="M8 12l3-4 3 2 3-2"/></svg>'
};
const TABS = [['start', 'Start'], ['etappen', 'Etappen'], ['ranking', 'Ranking'], ['archiv', 'Archiv'], ['olympia', 'Olympiade']];

function render() {
  if (!S.session) { app.innerHTML = viewLogin(); return; }
  if (!S.me) { app.innerHTML = viewNotMember(); return; }
  const body = S.tab === 'start' ? viewStart() : S.tab === 'etappen' ? viewEtappen() : S.tab === 'ranking' ? viewRanking() : S.tab === 'archiv' ? viewArchiv() : viewOlympia();
  let ov = '';
  if (S.overlay === 'pack') ov = viewPack();
  else if (S.overlay === 'teil') ov = viewTeil();
  else if (S.overlay === 'kasse') ov = viewKasse();
  else if (S.overlay === 'polls') ov = viewPolls();
  else if (S.overlay && S.overlay.year) ov = viewYear(S.overlay.year);
  else if (S.overlay && S.overlay.stage) ov = viewStage(S.overlay.stage);
  if (S.lightbox) ov += `<div class="lightbox" data-action="closeLightbox"><img src="${esc(S.lightbox)}" alt="Foto"><button class="close" aria-label="Schließen">×</button></div>`;
  const banner = S.preview ? `<div class="previewbar"><span>Vorschau: So sehen es die Jungs</span><button data-action="previewOff">Beenden</button></div>` : '';
  app.innerHTML = `${banner}<main class="main">${body}</main>
    <nav class="nav" aria-label="Hauptnavigation"><div class="nav-inner">
      ${TABS.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-action="tab" data-tab="${k}">${ICONS[k]}<span>${l}</span></button>`).join('')}
    </div></nav>
    ${ov}
    ${S.notice ? `<div style="position:fixed;left:16px;right:16px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:30;max-width:488px;margin:0 auto" class="okmsg">${esc(S.notice)}</div>` : ''}`;
}

// ---------------------------------------------------------------- Aktionen
const actions = {
  sendCode, verifyCode,
  backToEmail() { S.login.step = 'email'; S.login.code = ''; S.login.error = ''; render(); },
  async logout() { await sb.auth.signOut(); S.session = null; S.me = null; render(); },
  reload() { location.reload(); },
  tab(el) { S.tab = el.dataset.tab; S.overlay = null; window.scrollTo(0, 0); render(); },
  seg(el) { S.rankSeg = el.dataset.seg; render(); },
  goQuizRank() { S.tab = 'ranking'; S.rankSeg = 'quiz'; S.overlay = null; window.scrollTo(0, 0); render(); },
  open(el) { S.overlay = el.dataset.overlay; S.kasse.forIds = null; render(); },
  openYear(el) { S.overlay = { year: Number(el.dataset.year) }; render(); },
  close() { S.overlay = null; render(); },
  previewOn() { S.preview = true; S.overlay = null; applyPreview(); window.scrollTo(0, 0); render(); toast('Vorschau aktiv: Du siehst die App wie ein normales Mitglied.'); },
  previewOff() { endPreview(); render(); },
  async vote(el) {
    const pid = Number(el.dataset.poll), oid = Number(el.dataset.option);
    const p = S.polls.find((x) => x.id === pid);
    const mine = S.pollVotes.filter((v) => v.poll_id === pid && v.member_id === S.me.id).map((v) => v.option_id);
    let next;
    if (mine.includes(oid)) next = mine.filter((x) => x !== oid);
    else next = p.multi ? mine.concat(oid) : [oid];
    const { error } = await sb.rpc('vote_poll', { p_poll: pid, p_options: next });
    if (error) { toast(error.message); return; }
    S.pollVotes = S.pollVotes.filter((v) => !(v.poll_id === pid && v.member_id === S.me.id))
      .concat(next.map((o) => ({ poll_id: pid, option_id: o, member_id: S.me.id })));
    render();
  },
  pollAddOpt() { if (S.pollForm.opts.length < 8) S.pollForm.opts.push(''); render(); },
  pollMulti(el) { S.pollForm.multi = el.dataset.v === '1'; render(); },
  async pollCreate() {
    const F = S.pollForm;
    const question = F.q.trim(), opts = F.opts.map((o) => o.trim()).filter(Boolean);
    if (question.length < 3) { toast('Bitte eine Frage eingeben.'); return; }
    if (opts.length < 2) { toast('Bitte mindestens zwei Antworten eingeben.'); return; }
    const closes = F.closes ? new Date(F.closes) : null;
    if (closes && closes.getTime() <= now()) { toast('Das Ende muss in der Zukunft liegen.'); return; }
    F.busy = true; render();
    try {
      const poll = await q(sb.from('polls').insert({ question, multi: F.multi, closes_at: closes ? closes.toISOString() : null, created_by: S.me.id }).select().single());
      const rows = await q(sb.from('poll_options').insert(opts.map((label, i) => ({ poll_id: poll.id, label, sort: i }))).select());
      S.polls.unshift(poll); S.pollOptions.push(...rows);
      S.pollForm = { q: '', opts: ['', ''], multi: false, closes: '', busy: false };
      toast('Abstimmung läuft. Die Jungs bekommen gleich eine Mitteilung.');
    } catch (e) { F.busy = false; }
    render();
  },
  async pollClose(el) {
    const pid = Number(el.dataset.poll);
    await q(sb.from('polls').update({ closed: true }).eq('id', pid));
    S.polls = S.polls.map((p) => (p.id === pid ? { ...p, closed: true } : p)); render();
  },
  async pollDel(el) {
    const pid = Number(el.dataset.poll);
    if (!confirm('Abstimmung samt Stimmen löschen?')) return;
    await q(sb.from('polls').delete().eq('id', pid));
    S.polls = S.polls.filter((p) => p.id !== pid); render();
  },
  async testPush() {
    if (!('Notification' in window) || Notification.permission !== 'granted') { toast('Erst Mitteilungen erlauben (Karte oben auf der Startseite).'); return; }
    const ok = await ensurePush();
    if (!ok) { toast('Dieses Gerät konnte sich nicht anmelden. App bitte über den Home-Bildschirm öffnen.'); return; }
    const { error } = await sb.rpc('send_test_push');
    toast(error ? 'Fehler: ' + error.message : 'Unterwegs! In ein paar Sekunden sollte die Mitteilung kommen.');
  },
  openStage(el) { S.overlay = { stage: Number(el.dataset.id) }; S.sched = { time: '', title: '', note: '' }; render(); },
  async schedAdd(el) {
    const F = S.sched;
    if (!/^\d{1,2}:\d{2}$/.test(F.time)) return toast('Bitte eine Uhrzeit eingeben.');
    if (!F.title.trim()) return toast('Bitte eintragen, was passiert.');
    const row = await q(sb.from('stage_schedule').insert({ stage_id: Number(el.dataset.stage), at_time: F.time.padStart(5, '0'), title: F.title.trim(), note: F.note.trim() || null }).select().single());
    S.schedule.push(row); S.sched = { time: '', title: '', note: '' }; render();
  },
  async schedDel(el) {
    const id = Number(el.dataset.id);
    if (!confirm('Diesen Punkt löschen?')) return;
    await q(sb.from('stage_schedule').delete().eq('id', id));
    S.schedule = S.schedule.filter((x) => x.id !== id); render();
  },
  lightbox(el) { S.lightbox = S.photoUrls[el.dataset.path] || null; render(); },
  closeLightbox() { S.lightbox = null; render(); },
  async photoDel(el) {
    const id = Number(el.dataset.id);
    const p = S.photos.find((x) => x.id === id);
    if (!p || !confirm('Dieses Foto löschen?')) return;
    await q(sb.storage.from('tour-photos').remove([p.storage_path]));
    await q(sb.from('tour_photos').delete().eq('id', id));
    S.photos = S.photos.filter((x) => x.id !== id); render();
  },

  async allowNotif() {
    try { await Notification.requestPermission(); } catch (e) { /* ignorieren */ }
    if (Notification.permission === 'granted') {
      const ok = await ensurePush();
      toast(ok ? 'Mitteilungen sind an. Ich melde mich, wenn es etwas Neues gibt!' : 'Mitteilungen erlaubt, aber die Anmeldung hat nicht geklappt. Öffne die App bitte über den Home-Bildschirm.');
    } else {
      toast('Kein Problem. Du kannst Mitteilungen später in den Einstellungen erlauben.');
    }
    render();
  },

  async rsvp(el) { await setRsvp(S.me.id, el.dataset.status); },
  async cycleRsvp(el) {
    const order = ['offen', 'ja', 'vielleicht', 'nein'];
    const id = el.dataset.member;
    const next = order[(order.indexOf(rsvpOf(id)) + 1) % order.length];
    if (next === 'offen') {
      if (!isAdmin()) return setRsvp(id, 'ja');
      await q(sb.from('rsvps').delete().eq('tour_id', S.tour.id).eq('member_id', id));
      S.rsvps = S.rsvps.filter((r) => r.member_id !== id); render(); return;
    }
    await setRsvp(id, next);
  },

  async answer(el) {
    const rid = Number(el.dataset.riddle), idx = Number(el.dataset.idx);
    const row = { riddle_id: rid, member_id: S.me.id, option_index: idx };
    await q(sb.from('riddle_answers').upsert(row));
    S.myAnswers[rid] = row; render(); toast('Antwort gespeichert.');
  },
  async resolveNow(el) {
    if (!isAdmin()) return;
    const rid = Number(el.dataset.riddle);
    const r = S.riddles.find((x) => x.id === rid);
    const players = tourCrew().length;
    if (S.riddleCount < players && !confirmTwice(el)) return toast(`Erst ${S.riddleCount} von ${players} haben getippt. Zum Auflösen nochmal tippen.`);
    const at = new Date().toISOString();
    await q(sb.from('riddles').update({ resolve_at: at }).eq('id', rid));
    if (r) r.resolve_at = at;
    await loadAll(); render(); toast('Aufgelöst! Alle sehen jetzt die Lösung.');
  },
  async saveFree(el) {
    const rid = Number(el.dataset.riddle);
    const inp = document.querySelector(`[data-input="freeText"][data-riddle="${rid}"]`);
    const v = String(inp?.value || '').trim();
    if (!v) return toast('Bitte erst etwas schreiben.');
    const row = { riddle_id: rid, member_id: S.me.id, text_value: v.slice(0, 300) };
    await q(sb.from('riddle_answers').upsert(row));
    S.myAnswers[rid] = row; render(); toast('Antwort gespeichert.');
  },
  async crown(el) {
    if (!isAdmin()) return;
    const rid = Number(el.dataset.riddle), mid = el.dataset.member;
    const sol = S.solutions[rid]; if (!sol) return toast('Keine Lösung hinterlegt.');
    const wins = new Set(sol.winner_ids || []);
    wins.has(mid) ? wins.delete(mid) : wins.add(mid);
    const next = [...wins];
    await q(sb.from('riddle_solutions').update({ winner_ids: next }).eq('riddle_id', rid));
    sol.winner_ids = next; await loadRiddleExtras(); render(); toast(wins.has(mid) ? 'Gekürt! 👑' : 'Krone zurückgenommen.');
  },
  async saveEstimate(el) {
    const rid = Number(el.dataset.riddle);
    const inp = document.querySelector(`[data-input="estimate"][data-riddle="${rid}"]`);
    const v = Number(String(inp?.value || '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(v) || inp.value.trim() === '') return toast('Bitte eine Zahl eingeben.');
    const row = { riddle_id: rid, member_id: S.me.id, numeric_value: v };
    await q(sb.from('riddle_answers').upsert(row));
    S.myAnswers[rid] = row; render(); toast('Schätzung gespeichert.');
  },

  async slotAdd(el) {
    const row = { year: Number(el.dataset.year), slot: Number(el.dataset.slot), member_id: S.me.id };
    await q(sb.from('orga_slots').insert(row));
    S.slots.push(row); render();
  },
  async slotDel(el) {
    const y = Number(el.dataset.year), s = Number(el.dataset.slot);
    await q(sb.from('orga_slots').delete().eq('year', y).eq('slot', s));
    S.slots = S.slots.filter((x) => !(x.year === y && x.slot === s)); render();
  },

  async pack(el) {
    const k = el.dataset.key; const v = !S.packing[k];
    S.packing[k] = v; render();
    if (v) await q(sb.from('packing_checks').upsert({ member_id: S.me.id, item_key: k, checked: true }));
    else await q(sb.from('packing_checks').delete().eq('member_id', S.me.id).eq('item_key', k));
  },

  async saveEmail(el) {
    const id = el.dataset.member;
    const inp = document.querySelector(`[data-input="memberEmail"][data-member="${id}"]`);
    const email = (inp?.value || '').trim().toLowerCase() || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Bitte eine gültige E-Mail-Adresse eingeben.');
    await q(sb.from('members').update({ email }).eq('id', id));
    const m = S.members.find((x) => x.id === id); if (m) m.email = email;
    render(); toast('E-Mail gespeichert.');
  },
  async addGuest() {
    const name = S.guestName.trim();
    if (!name) return;
    if (S.members.some((m) => m.nickname.toLowerCase() === name.toLowerCase())) return toast('Den Namen gibt es schon.');
    const m = await q(sb.from('members').insert({ nickname: name, is_guest: true }).select().single());
    S.members.push(m); S.members.sort((a, b) => a.nickname.localeCompare(b.nickname));
    S.guestName = '';
    await setRsvp(m.id, 'ja');
  },

  kPaid(el) { S.kasse.paidBy = el.dataset.member; render(); },
  kFor(el) {
    const id = el.dataset.member;
    const cur = S.kasse.forIds ?? participants().map((p) => p.id);
    S.kasse.forIds = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; render();
  },
  kAll() { S.kasse.forIds = S.members.map((m) => m.id); render(); },
  kNone() { S.kasse.forIds = []; render(); },
  async kSave() {
    const K = S.kasse;
    const amt = Math.round(parseFloat(String(K.amount).replace(',', '.')) * 100) / 100;
    const forIds = K.forIds ?? participants().map((p) => p.id);
    if (!K.title.trim()) return toast('Bitte eintragen, wofür die Ausgabe war.');
    if (!(amt > 0)) return toast('Bitte einen Betrag eingeben.');
    if (!forIds.length) return toast('Bitte mindestens eine Person auswählen.');
    K.busy = true; render();
    try {
      const e = await q(sb.from('expenses').insert({ tour_id: S.tour.id, title: K.title.trim(), amount: amt, paid_by: K.paidBy ?? S.me.id, created_by: S.me.id }).select().single());
      const rows = forIds.map((m) => ({ expense_id: e.id, member_id: m }));
      await q(sb.from('expense_shares').insert(rows));
      S.expenses.unshift(e); S.shares.push(...rows);
      S.kasse = { title: '', amount: '', paidBy: null, forIds: null, busy: false };
      render(); toast('Ausgabe gespeichert.');
    } finally { S.kasse.busy = false; }
  },
  async kDel(el) {
    const id = el.dataset.id;
    if (!confirm('Diese Ausgabe löschen?')) return;
    await q(sb.from('expenses').delete().eq('id', id));
    S.expenses = S.expenses.filter((e) => e.id !== id); S.shares = S.shares.filter((x) => x.expense_id !== id); render();
  }
};

async function setRsvp(memberId, status) {
  const row = { tour_id: S.tour.id, member_id: memberId, status, set_by: S.me.id, updated_at: new Date().toISOString() };
  await q(sb.from('rsvps').upsert(row));
  S.rsvps = S.rsvps.filter((r) => r.member_id !== memberId).concat([row]);
  render();
}

// Eingaben ohne Neuaufbau speichern (sonst springt der Cursor)
const inputs = {
  loginEmail: (v) => { S.login.email = v; },
  loginCode: (v) => { S.login.code = v; },
  guestName: (v) => { S.guestName = v; },
  pollQ: (v) => { S.pollForm.q = v; },
  pollCloses: (v) => { S.pollForm.closes = v; },
  pollOpt: (v, el) => { S.pollForm.opts[Number(el.dataset.i)] = v; },
  kTitle: (v) => { S.kasse.title = v; },
  schedTime: (v) => { S.sched.time = v; },
  schedTitle: (v) => { S.sched.title = v; },
  schedNote: (v) => { S.sched.note = v; },
  kAmount: (v) => { S.kasse.amount = v; }
};

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  const WRITES = ['vote', 'pollCreate', 'pollClose', 'pollDel', 'rsvp', 'cycleRsvp', 'answer', 'saveEstimate', 'saveFree', 'crown', 'resolveNow', 'slotAdd', 'slotDel', 'pack', 'kSave', 'kDel', 'saveEmail', 'addGuest'];
  if (S.preview && WRITES.includes(el.dataset.action)) { ev.preventDefault(); toast('In der Vorschau wird nichts gespeichert.'); return; }
  if (fn) { ev.preventDefault(); Promise.resolve(fn(el)).catch((e) => console.error(e)); }
});
function resizeImage(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht verarbeitet werden'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

// Aufnahmedatum: erst aus dem Dateinamen (WhatsApp-Export iPhone „PHOTO-2019-09-21-…“, Android „IMG-20190921-WA…“),
// dann Änderungsdatum der Datei, wenn es im Tourjahr liegt, sonst der erste Tourtag.
function photoDate(file, tourId, year) {
  const ok = (y, m, d) => Number(y) === Number(year) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  for (const m of file.name.matchAll(/(20\d\d)[-_]?(\d\d)[-_]?(\d\d)/g)) {
    if (ok(m[1], Number(m[2]), Number(m[3]))) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (file.lastModified) {
    const d = new Date(file.lastModified).toISOString().slice(0, 10);
    if (d.slice(0, 4) === String(year)) return d;
  }
  const tour = S.tours.find((t) => t.id === tourId);
  return tour?.date_from || null;
}

app.addEventListener('change', async (ev) => {
  const el = ev.target.closest('[data-upload]');
  if (!el || !el.files?.length) return;
  if (S.preview) { el.value = ''; toast('In der Vorschau wird nichts gespeichert.'); return; }
  const tourId = Number(el.dataset.upload), year = el.dataset.year;
  const files = [...el.files];
  let sort = S.photos.filter((p) => p.tour_id === tourId).length;
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    S.uploading = `Lade hoch … ${i + 1} von ${files.length}`; render();
    try {
      const blob = await resizeImage(files[i]);
      const path = `${year}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await sb.storage.from('tour-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      const takenOn = photoDate(files[i], tourId, year);
      const row = await q(sb.from('tour_photos').insert({ tour_id: tourId, storage_path: path, sort: sort++, taken_on: takenOn, uploaded_by: S.me.id }).select().single());
      S.photos.push(row); ok++;
    } catch (e) { console.error(e); toast('Ein Foto ging nicht: ' + (e.message || e)); }
  }
  await refreshPhotoUrls();
  S.uploading = ''; render();
  toast(`${ok} ${ok === 1 ? 'Foto' : 'Fotos'} hochgeladen.`);
});

app.addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el.value, el);
});
app.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  const el = ev.target.closest('[data-input]');
  if (!el) return;
  if (el.dataset.input === 'loginEmail') sendCode();
  if (el.dataset.input === 'loginCode') verifyCode();
});

// Sekunden-Countdown, ohne die ganze Seite neu aufzubauen
setInterval(() => {
  if (!S.me) return;
  const rc = document.getElementById('riddleCount');
  const rs = document.getElementById('riddleStart');
  for (const [el, fmt] of [[rc, shortCount], [rs, countHtml]]) {
    if (!el) continue;
    if (new Date(el.dataset.target).getTime() <= now()) { loadAll().then(render); return; }
    el.innerHTML = fmt(el.dataset.target);
  }
  const box = document.getElementById('revealCount');
  if (!box) return;
  const rv = revealState();
  if (rv.finished || (rv.next && new Date(rv.next.reveal_at).getTime() <= now())) { loadAll().then(render); return; }
  box.innerHTML = countHtml(rv.next.reveal_at);
}, 1000);

// ---------------------------------------------------------------- Start
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

(async () => {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  if (S.session) { try { await afterLogin(); } catch (e) { render(); } }
  else render();
  sb.auth.onAuthStateChange((event, session) => {
    S.session = session;
    if (!session) { S.me = null; render(); return; }
    if (event === 'SIGNED_IN' && !S.me) {
      if (location.search.includes('code=')) history.replaceState(null, '', location.pathname);
      setTimeout(() => { afterLogin().catch(() => render()); }, 0);
    }
  });
})();
