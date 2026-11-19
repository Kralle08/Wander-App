import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY, TOUR_YEAR } from './config.js';

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
  packing: {},
  expenses: [],
  shares: [],
  tab: 'start',
  rankSeg: 'orga',
  overlay: null,       // 'pack' | 'kasse' | 'teil' | {year}
  login: { step: 'email', email: '', code: '', busy: false, error: '' },
  kasse: { title: '', amount: '', paidBy: null, forIds: null, busy: false },
  guestName: '',
  notice: ''
};

// ---------------------------------------------------------------- Hilfen
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (x) => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => { const x = new Date(d); return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`; };
const fmtDateTime = (d) => { const x = new Date(d); return `${fmtDate(x)} um ${pad(x.getHours())}:${pad(x.getMinutes())} Uhr`; };
const nick = (id) => S.members.find((m) => m.id === id)?.nickname ?? '?';
const now = () => Date.now();
const isAdmin = () => !!S.me?.is_admin;

function toast(msg) {
  S.notice = msg; render();
  setTimeout(() => { if (S.notice === msg) { S.notice = ''; render(); } }, 3500);
}

async function q(promise) {
  const { data, error } = await promise;
  if (error) { console.error(error); toast('Fehler: ' + error.message); throw error; }
  return data;
}

// ---------------------------------------------------------------- Laden
async function loadAll() {
  const [members, tours, organizers, stages, reveals, revealContents, riddles, solutions, slots] = await Promise.all([
    q(sb.from('members').select('*').order('nickname')),
    q(sb.from('tours').select('*').order('year', { ascending: false })),
    q(sb.from('tour_organizers').select('*')),
    q(sb.from('stages').select('*').order('sort')),
    q(sb.from('reveals').select('*').order('reveal_at')),
    q(sb.from('reveal_contents').select('*')),
    q(sb.from('riddles').select('*').order('nr')),
    q(sb.from('riddle_solutions').select('*')),
    q(sb.from('orga_slots').select('*'))
  ]);
  S.members = members; S.tours = tours; S.organizers = organizers; S.stages = stages;
  S.reveals = reveals; S.riddles = riddles; S.slots = slots;
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
  S.leaderboard = leaderboard; S.rsvps = rsvps;
  S.packing = Object.fromEntries(packing.map((p) => [p.item_key, p.checked]));
  S.expenses = expenses; S.shares = shares;
}

async function afterLogin() {
  const mid = await q(sb.rpc('claim_member'));
  if (!mid) { S.me = null; render(); return; }
  const me = await q(sb.from('members').select('*').eq('id', mid).single());
  S.me = me;
  await loadAll();
  render();
}

// ---------------------------------------------------------------- Login
function viewLogin() {
  const L = S.login;
  return `
  <div class="login">
    <span class="kicker">WANDERCLUB · SEIT 2018</span>
    <h1>10 Jahre.<br>Jubiläumstour Mallorca</h1>
    <div class="card">
      ${L.step === 'email' ? `
        <p class="title">Anmelden</p>
        <p class="muted">Gib deine E-Mail-Adresse ein. Du bekommst einen 6-stelligen Code.</p>
        <label class="field">E-Mail
          <input type="email" inputmode="email" autocomplete="email" data-input="loginEmail" value="${esc(L.email)}" placeholder="name@beispiel.de">
        </label>
        <button class="btn block" data-action="sendCode" ${L.busy ? 'disabled' : ''}>Code schicken</button>
      ` : `
        <p class="title">Code eingeben</p>
        <p class="muted">Wir haben dir eine Mail an <b>${esc(L.email)}</b> geschickt. Steht darin ein Code, gib ihn hier ein. Steht darin ein Link, tipp ihn an, am besten auf diesem Gerät und in diesem Browser. Schau auch im Spam-Ordner nach.</p>
        <label class="field">Code
          <input class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" data-input="loginCode" value="${esc(L.code)}">
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
  if (token.length !== 6) { S.login.error = 'Der Code hat 6 Ziffern.'; return render(); }
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
  const daysLeft = t ? Math.max(0, Math.ceil((new Date(t.date_from + 'T00:00:00').getTime() - now()) / 86400000)) : '–';
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
    <div class="hero-top"><span class="kicker">WANDERCLUB · SEIT 2018</span><span class="chip">Reiseleitung: ${esc(orgaNames || '–')}</span></div>
    <h1>10 Jahre.<br>${esc(t?.title || 'Jubiläumstour')}</h1>
    <p>${esc(t?.region || '')}${t ? ' · ' + fmtDate(t.date_from) + '–' + fmtDate(t.date_to) : ''}${t?.motto ? '<br>Motto: ' + esc(t.motto) : ''}</p>
    <div class="big-count"><b>${daysLeft}</b><span>Tage bis<br>zum Abflug</span></div>
    <div class="bars">${Array.from({ length: 10 }, (_, i) => `<i class="${i < past ? 'on' : ''}"></i>`).join('')}</div>
    <span class="kicker" style="letter-spacing:0;font-weight:500">${past} Touren geschafft · die 10. kommt</span>
  </section>
  <div class="pad">
    ${viewNotifCard()}

    ${rv.finished ? `
      <div class="card dark"><span class="label">Reveals</span><p class="title">Alles enthüllt. Ab nach Mallorca!</p></div>
    ` : `
      <div class="card dark">
        <span class="label">Nächstes Reveal · ${Math.min(rv.done + 1, rv.total)} von ${rv.total}</span>
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
      <div class="seg3">
        ${['ja', 'vielleicht', 'nein'].map((s) => `<button class="opt center ${myStatus === s ? (s === 'ja' ? 'on' : s === 'vielleicht' ? 'on-maybe' : 'on-no') : ''}" data-action="rsvp" data-status="${s}">${s === 'ja' ? 'Dabei' : s === 'vielleicht' ? 'Vielleicht' : 'Nein'}</button>`).join('')}
      </div>
      <p class="muted small">${cnt.ja} dabei · ${cnt.vielleicht} vielleicht · ${cnt.nein} nicht dabei · ${cnt.offen} offen</p>
      <button class="btn ghost" data-action="open" data-overlay="teil">Wer ist dabei?</button>
    </div>

    ${viewRiddleCard(cr, lr, firstRiddle)}

    <div class="tiles">
      <button class="tile" data-action="open" data-overlay="kasse"><b>Kasse</b><span>Wer schuldet wem</span></button>
      <button class="tile" data-action="open" data-overlay="pack"><b>Packliste</b><span>${packDoneCount()} von ${PACK_TOTAL} gepackt</span></button>
      <button class="tile" data-action="open" data-overlay="teil"><b>Teilnehmer</b><span>${cnt.ja} Zusagen</span></button>
    </div>
    <button class="btn ghost" data-action="logout">Abmelden (${esc(S.me.nickname)})</button>
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
      return `<div class="card alert"><span class="label">Kein Reveal verpassen</span>
        <p class="muted">Leg die App auf deinen Home-Bildschirm: unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>. Öffne sie danach von dort, dann kannst du Mitteilungen erlauben.</p></div>`;
    }
    return '';
  }
  if (Notification.permission !== 'default') return '';
  return `<div class="card alert"><span class="label">Kein Reveal verpassen</span>
    <p class="muted">Wir sagen Bescheid, wenn ein Reveal oder ein neues Rätsel kommt. Sonst nichts, versprochen.</p>
    <button class="btn block" data-action="allowNotif">Mitteilungen erlauben</button></div>`;
}

function viewRiddleCard(cr, lr, first) {
  let html = '<div class="card"><span class="label">Rätsel · alle 14 Tage</span>';
  if (cr) {
    const mine = S.myAnswers[cr.id];
    html += `<p class="title">#${cr.nr}: ${esc(cr.question)}</p>`;
    if (cr.kind === 'schaetzen') {
      html += `<label class="field">Deine Schätzung
        <input inputmode="numeric" data-input="estimate" data-riddle="${cr.id}" value="${esc(mine?.numeric_value ?? '')}" placeholder="Zahl eingeben"></label>
        <button class="btn" data-action="saveEstimate" data-riddle="${cr.id}">${mine ? 'Schätzung ändern' : 'Schätzung abgeben'}</button>`;
    } else {
      html += (cr.options || []).map((o, i) => `<button class="opt ${mine?.option_index === i ? 'on' : ''}" data-action="answer" data-riddle="${cr.id}" data-idx="${i}">${esc(o)}</button>`).join('');
    }
    html += `<p class="muted small">${mine ? 'Antwort gespeichert, du kannst sie bis zur Auflösung ändern. ' : ''}Auflösung am ${fmtDateTime(cr.resolve_at)}.</p>`;
  } else if (first && new Date(first.publish_at).getTime() > now()) {
    html += `<p class="title">Das erste Rätsel kommt am ${fmtDateTime(first.publish_at)}.</p><p class="muted">Danach alle 14 Tage ein neues. Wer am Ende vorne liegt, hat auf Mallorca das erste Zimmerwahlrecht.</p>`;
  } else {
    html += `<p class="title">Alle Rätsel sind gelöst.</p>`;
  }
  if (lr && S.solutions[lr.id]) {
    const sol = S.solutions[lr.id];
    const right = lr.kind === 'schaetzen' ? Number(sol.numeric_answer).toLocaleString('de-DE') : (lr.options || [])[sol.correct_option];
    html += `<div class="okmsg"><b>Auflösung #${lr.nr}:</b> ${esc(right)}. ${esc(sol.explanation || '')}</div>`;
  }
  html += `<button class="btn ghost" data-action="goQuizRank">Rätsel-Rangliste ansehen</button></div>`;
  return html;
}

// ---------------------------------------------------------------- Ansichten: Etappen
function viewEtappen() {
  const st = S.stages.filter((s) => s.tour_id === S.tour?.id);
  const hidden = S.reveals.filter((r) => !r.is_joke && /Tag|feiern/.test(r.teaser) && new Date(r.reveal_at).getTime() > now());
  return `<div class="pad">
    <h2 style="font-size:30px">Die Etappen</h2>
    <p class="muted">${esc(S.tour?.region || '')} · ${S.tour ? fmtDate(S.tour.date_from) + '–' + fmtDate(S.tour.date_to) : ''}</p>
    <div class="card"><div class="list">
      ${st.map((s) => `<div class="row"><span class="daybox">${esc(s.day_label)}</span><div class="grow"><b>${esc(s.title)}</b><span class="muted small">${esc(s.meta || '')}</span></div></div>`).join('')}
    </div></div>
    ${hidden.length ? `<div class="card pine"><span class="label">Noch geheim</span>
      <p class="title">${hidden.length} ${hidden.length === 1 ? 'Enthüllung steht' : 'Enthüllungen stehen'} noch aus</p>
      ${hidden.map((r) => `<p class="muted">${esc(r.teaser)} · ${fmtDateTime(r.reveal_at)}</p>`).join('')}
    </div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- Ansichten: Ranking
function viewRanking() {
  return `<div class="pad">
    <h2 style="font-size:30px">Hall of Fame</h2>
    <div class="seg">
      <button class="${S.rankSeg === 'orga' ? 'on' : ''}" data-action="seg" data-seg="orga">Orga & Archiv</button>
      <button class="${S.rankSeg === 'quiz' ? 'on' : ''}" data-action="seg" data-seg="quiz">Rätsel</button>
    </div>
    ${S.rankSeg === 'orga' ? viewOrga() : viewQuiz()}
  </div>`;
}

function viewOrga() {
  const years = [2028, 2029, 2030, 2031, 2032];
  const counts = {};
  S.organizers.filter((o) => S.tours.find((t) => t.id === o.tour_id && t.year < TOUR_YEAR))
    .forEach((o) => { counts[o.member_id] = (counts[o.member_id] || 0) + 1; });
  const bilanz = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${esc(nick(id))} ${n}×`).join(' · ');
  const never = S.members.filter((m) => !m.is_guest && !counts[m.id] && !S.organizers.some((o) => o.member_id === m.id)).map((m) => m.nickname);
  return `
    <div class="card">
      <span class="label">Orga-Kalender</span>
      <p class="muted">Wer übernimmt die nächsten Jahre? Allein oder zu zweit.</p>
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
    <div class="list" style="gap:8px">
      ${S.tours.map((t) => {
        const org = S.organizers.filter((o) => o.tour_id === t.id).map((o) => nick(o.member_id)).join(' & ');
        return `<button class="yearbtn ${t.year === TOUR_YEAR ? 'current' : ''}" data-action="openYear" data-year="${t.year}">
          <span class="yr">${t.year}</span>
          <span class="grow" style="display:flex;flex-direction:column;gap:2px"><b>${esc(t.title)}</b><span class="muted small">${esc(org)}${t.region ? ' · ' + esc(t.region) : ''}</span></span>
        </button>`;
      }).join('')}
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
    <div class="card dark"><span class="label">Rätselwertung</span>
      <p class="title">${resolved ? `Stand nach Rätsel ${resolved} von ${S.riddles.length || 20}` : 'Noch kein Rätsel aufgelöst'}</p>
      <p class="muted">Wird nach jeder Auflösung alle 14 Tage aktualisiert. Platz 1 hat auf Mallorca das erste Zimmerwahlrecht, Platz 1–3 bekommen einen Bonus in der Pool-Olympiade.</p>
    </div>
    <div class="card"><div class="list">${rows || '<p class="muted">Noch keine Punkte.</p>'}</div></div>
    <p class="muted small">${esc(S.members.filter((m) => m.is_quizmaster).map((m) => m.nickname).join(', '))} schreibt die Rätsel und spielt außer Konkurrenz.</p>`;
}

// ---------------------------------------------------------------- Ansichten: Olympia
function viewOlympia() {
  const unlock = new Date('2027-06-01T20:00:00+02:00').getTime() <= now();
  return `<div class="pad">
    <h2 style="font-size:30px">Pool-Olympiade</h2>
    <div class="card" style="background:#8A5A12;color:#fff"><p class="title">Der goldene Wanderschuh</p><p style="margin:0;font-size:14px;line-height:1.4">Ein echter alter Wanderschuh, vergoldet. Wird jedes Jahr weitergegeben.</p></div>
    <div class="card"><span class="label">Der Fahrplan</span><div class="list">
      <div class="row"><span class="daybox">06</span><div class="grow"><b>Juni: Disziplinen-Reveal</b><span class="muted small">01.06.2027 um 20:00 Uhr</span></div></div>
      <div class="row"><span class="daybox">07</span><div class="grow"><b>Sommer: Qualifikation</b><span class="muted small">In Ralles Pool auf der Amöneburg</span></div></div>
      <div class="row"><span class="daybox" style="background:var(--accent)">09</span><div class="grow"><b>Finale auf Mallorca</b><span class="muted small">Siegerehrung beim Jubiläumsessen</span></div></div>
    </div></div>
    ${unlock ? '' : `<div class="card pine"><span class="label">Noch geheim</span><p class="title">Die Disziplinen werden am 01.06.2027 enthüllt.</p><p class="muted">Bis dahin: schwimmen üben, Arschbombe perfektionieren.</p></div>`}
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
  ['NEU · ZU WASSER', [['badehose', 'Badehose (Ossi 2019: „Hosen brauchen wir ja nicht“)'], ['handtuch', 'Handtuch'], ['badeschuhe', 'Badeschuhe für die felsigen Buchten'], ['sonne', 'Sonnencreme']]],
  ['NEU · IN DER LUFT', [['ausweis', 'Personalausweis'], ['bordkarte', 'Bordkarte aufs Handy'], ['powerbank', 'Powerbank (ins Handgepäck)'], ['karte', 'Krankenversicherungskarte']]],
  ['NEU · TRADITION', [['schnaps', 'Starterschnaps'], ['witze', 'Neue Witze (Ralle)'], ['pool', 'Form für die Pool-Olympiade']]]
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
    <h2 style="font-size:28px">Ja, Potti: Das ist die aktualisierte Packliste.</h2>
    <p class="muted">2019 wollte Potti Ossis Packliste „gerne als To-do-Liste“. Acht Jahre später ist sie da: das Original, ergänzt um alles für Mallorca. Deine Haken sieht nur du.</p>
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
    <div class="card" style="gap:0"><div class="list">
      ${S.members.map((m) => {
        const st = rsvpOf(m.id);
        return `<div class="row"><div class="grow"><b>${esc(m.nickname)}${m.id === S.me.id ? ' (du)' : ''}</b>
          <span class="muted small">${m.is_guest ? 'Von der Reiseleitung hinzugefügt' : (st === 'offen' ? 'Hat noch nicht geantwortet' : '')}${isAdmin() && !m.is_guest ? (m.email ? ' · ' + esc(m.email) : ' · keine E-Mail hinterlegt') : ''}</span></div>
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
    ${t.summary ? `<div class="card"><span class="label">Was hängen blieb</span><p style="margin:0;line-height:1.5">${esc(t.summary)}</p></div>` : ''}`);
}

// ---------------------------------------------------------------- Gesamtansicht
const ICONS = {
  start: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
  etappen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/></svg>',
  ranking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M9 20h6"/></svg>',
  olympia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16c2 0 2-1.5 4-1.5S8 16 10 16s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M2 20c2 0 2-1.5 4-1.5S8 20 10 20s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="15" cy="5" r="2"/><path d="M8 12l3-4 3 2 3-2"/></svg>'
};
const TABS = [['start', 'Start'], ['etappen', 'Etappen'], ['ranking', 'Ranking'], ['olympia', 'Olympia']];

function render() {
  if (!S.session) { app.innerHTML = viewLogin(); return; }
  if (!S.me) { app.innerHTML = viewNotMember(); return; }
  const body = S.tab === 'start' ? viewStart() : S.tab === 'etappen' ? viewEtappen() : S.tab === 'ranking' ? viewRanking() : viewOlympia();
  let ov = '';
  if (S.overlay === 'pack') ov = viewPack();
  else if (S.overlay === 'teil') ov = viewTeil();
  else if (S.overlay === 'kasse') ov = viewKasse();
  else if (S.overlay && S.overlay.year) ov = viewYear(S.overlay.year);
  app.innerHTML = `<main class="main">${body}</main>
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

  async allowNotif() {
    try { await Notification.requestPermission(); } catch (e) { /* ignorieren */ }
    toast(Notification.permission === 'granted' ? 'Mitteilungen sind an. Bis zum nächsten Reveal!' : 'Kein Problem. Du kannst Mitteilungen später in den Einstellungen erlauben.');
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
  kTitle: (v) => { S.kasse.title = v; },
  kAmount: (v) => { S.kasse.amount = v; }
};

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { ev.preventDefault(); Promise.resolve(fn(el)).catch((e) => console.error(e)); }
});
app.addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el.value);
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
  const box = document.getElementById('revealCount');
  if (!box || !S.me) return;
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
