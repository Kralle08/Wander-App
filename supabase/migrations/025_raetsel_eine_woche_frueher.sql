-- App-Start am 27.11.2026: Rätselsteig eine Woche vorgezogen (Etappe 1 am So 29.11.2026 20:00, letzte Auflösung Mi 25.08.2027)
update riddles set
  publish_at = ((publish_at at time zone 'Europe/Berlin') - interval '7 days') at time zone 'Europe/Berlin',
  resolve_at = ((resolve_at at time zone 'Europe/Berlin') - interval '7 days') at time zone 'Europe/Berlin';
