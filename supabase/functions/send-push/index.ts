// Verschickt Push-Nachrichten, sobald ein Rätsel, eine Auflösung oder eine Enthüllung fällig ist.
// Wird alle 10 Minuten von pg_cron aufgerufen. Jede Meldung geht genau einmal raus (push_log).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendPush } from './webpush.js';

const VAPID_PUBLIC = 'BLgE4as6w3jvbtrlQeXSyUfUPU9MJF4SbY30Q-J2K0-zH0SHm1B9IgIwx3vFUKL6yoBoY5rtuk6TVptxXPLhZt4';
const SUBJECT = 'https://kralle08.github.io/Wander-App/';

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: sec, error: secErr } = await db.rpc('push_secrets').single();
  if (secErr || !sec) return new Response('no secrets', { status: 500 });
  if (req.headers.get('x-cron-secret') !== sec.cron_secret) return new Response('forbidden', { status: 403 });
  const vapid = { publicKey: VAPID_PUBLIC, privateKey: sec.vapid_private, subject: SUBJECT };
  const body = await req.json().catch(() => ({}));

  const { data: subs, error: subErr } = await db.from('push_subscriptions').select('*');
  if (subErr) console.log('subs error', subErr.message);
  const sendAll = async (payload, onlyMember?: string) => {
    let ok = 0;
    for (const s of (subs || []).filter((x) => !onlyMember || x.member_id === onlyMember)) {
      try {
        const st = await sendPush(s, payload, vapid);
        if (st === 404 || st === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
        else if (st >= 200 && st < 300) ok++;
        else console.log('push status', st, s.endpoint.slice(0, 40));
      } catch (e) { console.log('push error', String(e)); }
    }
    return ok;
  };

  // Testnachricht (nur an ein Mitglied)
  if (body.test) {
    const n = await sendAll({ title: body.title || 'HIKE! · Test', body: body.body || 'Test von Ralle. Wenn du das liest, klappt es.', url: './', tag: 'test' }, body.member_id);
    return Response.json({ test: true, sent: n, subscriptions: subs?.length || 0 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - 2 * 864e5).toISOString();
  const sent = [];

  const claim = async (kind: string, id: number) => {
    const { data, error } = await db.from('push_log').upsert({ kind, ref_id: id }, { onConflict: 'kind,ref_id', ignoreDuplicates: true }).select();
    if (error) console.log('claim error', error.message);
    return (data || []).length > 0;
  };

  const { data: riddles } = await db.from('riddles').select('id,nr,question,publish_at').lte('publish_at', now.toISOString()).gte('publish_at', since);
  const { count: total } = await db.from('riddles').select('id', { count: 'exact', head: true });
  for (const r of riddles || []) {
    if (!(await claim('riddle', r.id))) continue;
    const q = (r.question || '').length > 110 ? r.question.slice(0, 107) + '…' : r.question;
    const text = 'Neue Frage von mir: ' + q;
    const n = await sendAll({ title: `Wer weiß denn sowas? · Etappe ${r.nr} von ${total || 20}`, body: text, url: './', tag: 'riddle-' + r.id });
    await db.from('push_log').update({ recipients: n }).eq('kind', 'riddle').eq('ref_id', r.id);
    sent.push({ riddle: r.nr, n });
  }

  // Auflösung (mittwochs oder vorzeitig per „Jetzt auflösen“)
  const { data: solved } = await db.from('riddles').select('id,nr,resolve_at').lte('resolve_at', now.toISOString()).gte('resolve_at', since);
  for (const r of solved || []) {
    if (!(await claim('solve', r.id))) continue;
    const n = await sendAll({ title: `Wer weiß denn sowas? · Auflösung Etappe ${r.nr}`, body: 'Ich habe aufgelöst. Schau, ob du richtig lagst und wie die Rangliste steht!', url: './', tag: 'solve-' + r.id });
    await db.from('push_log').update({ recipients: n }).eq('kind', 'solve').eq('ref_id', r.id);
    sent.push({ solve: r.nr, n });
  }

  const { data: reveals } = await db.from('reveals').select('id,teaser,reveal_at').lte('reveal_at', now.toISOString()).gte('reveal_at', since);
  for (const r of reveals || []) {
    if (!(await claim('reveal', r.id))) continue;
    const n = await sendAll({ title: 'HIKE! · Enthüllung', body: `Ich habe enthüllt: ${r.teaser}. Schau rein!`, url: './', tag: 'reveal-' + r.id });
    await db.from('push_log').update({ recipients: n }).eq('kind', 'reveal').eq('ref_id', r.id);
    sent.push({ reveal: r.id, n });
  }

  return Response.json({ ok: true, sent });
});
