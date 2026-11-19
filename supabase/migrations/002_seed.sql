
insert into public.members (nickname, full_name, is_admin, is_quizmaster) values
  ('Ralle', 'Ralf Jennemann', true, true),
  ('Ossi', 'Ronald Hohlfeld', false, false),
  ('Potti', 'Timo Portner', false, false),
  ('Stürmi', 'Mario Watzlawek', false, false),
  ('Jan', 'Jan U.', false, false),
  ('Klingel', 'René Klingelhöfer', false, false),
  ('Charly', 'Charly Nau', false, false),
  ('Bönne', 'Björn Jennemann', false, false);

insert into public.tours (year, title, region, date_from, date_to, motto, summary) values
  (2018, 'Die erste Tour', null, null, null, null, 'Hier fing alles an. Diese Tour fehlt im Chat-Export. Wer hat noch Fotos?'),
  (2019, 'Pfälzer Weinsteig', 'Deidesheim & Bad Dürkheim', '2019-09-20', '2019-09-22', null, 'Rückwärts gelaufen (Etappe 3-1-2), Sky Bar im 8. Stock und 84.000 Schritte. Der handgemalte Plan wird Legende.'),
  (2020, 'Moselsteig', 'Traben-Trarbach bis Zell', '2020-09-18', '2020-09-20', null, 'Moselschleifen, Straußwirtschaft und Ossis Leistungskurs Speedwandern. Ralle fehlte.'),
  (2021, 'Harzer Hexenstieg', 'Über den Brocken', '2021-09-17', '2021-09-19', null, 'Schierke, Brocken, Torfhaus. Taxi nach Bad Harzburg und Harzer Glitzer statt Mosel-Trester.'),
  (2022, 'Nibelungensteig', 'Odenwald', '2022-09-23', '2022-09-25', null, 'Bönnes Debüt als Ersatzmann für Charly. Stausee Marbach, Felsenmeer und ein Kellerabend in Michelstadt.'),
  (2023, 'Rheinsteig', 'Lorch & Loreley', '2023-09-22', '2023-09-24', null, 'Es sollte „diesmal entspannt“ werden. Weinbestellung per Liste, Loreley und die Kutsche für Ossi.'),
  (2024, 'Traumpfade', 'Eifel / Bad Breisig', '2024-09-20', '2024-09-22', null, 'Die grüne Hölle ohne Machete, Felsentunnel und ein Hotel mit Rheinblick, Pool und Sauna.'),
  (2025, 'Nahetal', 'Rotenfels & Lemberg', '2025-09-19', '2025-09-21', null, 'Der Parkplatz-Krimi um P3, die höchste Steilwand zwischen Alpen und Skandinavien und ein Röhrenfernseher statt Topspiel.'),
  (2026, 'Fränkische Schweiz', 'Brauereienweg Waischenfeld', '2026-09-18', '2026-09-20', null, 'Von Brauerei zu Brauerei. Bönnes Bahn-Odyssee über Nürnberg und Bayreuth, Ralles Witze kamen per Telefon.'),
  (2027, 'Jubiläumstour Mallorca', 'Serra de Tramuntana', '2027-09-16', '2027-09-20', 'Zu Land, zu Wasser und in der Luft', null);

insert into public.tour_organizers (tour_id, member_id)
select t.id, m.id from (values
  (2018,'Ossi'),(2019,'Ossi'),(2020,'Ossi'),(2021,'Ossi'),(2022,'Ossi'),
  (2023,'Stürmi'),(2023,'Klingel'),(2024,'Jan'),(2024,'Ralle'),
  (2025,'Bönne'),(2025,'Jan'),(2026,'Stürmi'),(2026,'Bönne'),(2027,'Ralle')
) as v(year, nick)
join public.tours t on t.year = v.year
join public.members m on m.nickname = v.nick;

insert into public.stages (tour_id, sort, day_label, title, meta, km, hm, is_secret, reveal_at)
select t.id, v.sort, v.day, v.title, v.meta, v.km, v.hm, v.secret, v.reveal_at::timestamptz
from (values
  (2019,1,'Fr','Start Deidesheim → Neustadt a. d. W.','Pfälzer Weinsteig · 19 km laut Plan',19.0,null::int,false,null::text),
  (2019,2,'Sa','Weiter nach Bad Dürkheim','19 km laut Plan · Sky Bar im 8. Stock',19.0,null,false,null),
  (2019,3,'So','Zurück nach Deidesheim','14 km · rückwärts gelaufen: Etappe 3-1-2',14.0,null,false,null),
  (2020,1,'Fr','Traben-Trarbach → Zeltingen-Rachtig','Moselsteig · ca. 15 km',15.0,null,false,null),
  (2020,2,'Sa','Zell → Enkirch','ca. 20 km · 600 hm am Stück',20.0,600,false,null),
  (2020,3,'So','Enkirch → Traben-Trarbach','ca. 13 km',13.0,null,false,null),
  (2021,1,'Fr','Königshütte → Schierke','13 km · 400 hm',13.0,400,false,null),
  (2021,2,'Sa','Schierke → Brocken → Torfhaus','17 km · 500 hm · Übernachtung Bad Harzburg',17.0,500,false,null),
  (2021,3,'So','Torfhaus → Altenau','12 km · 200 hm',12.0,200,false,null),
  (2022,1,'Fr','Ab Stausee Marbach','Nibelungensteig Etappe 2 · ca. 16 km',16.0,null,false,null),
  (2022,2,'Sa','Nibelungensteig Etappe 3','Felsenmeer · abends Erbach',null,null,false,null),
  (2022,3,'So','Abschluss mit Regenvariante','Michelstadt',null,null,false,null),
  (2023,1,'Fr','Lorch → Kaub','Rheinsteig Etappe 16 · Hotel Deutsches Haus',null,null,false,null),
  (2023,2,'Sa','Kaub → St. Goarshausen','Etappe 15, abgekürzt · Loreley · Herrmanns Mühle',null,null,false,null),
  (2023,3,'So','St. Goarshausen → Kestert','Etappe 14 · mit dem Zug zurück nach Lorch',null,null,false,null),
  (2024,1,'Fr','Laacher See → Nickenich','16,6 km · 418 hm · 3:48 h · Landgasthaus Rothbrust',16.6,418,false,null),
  (2024,2,'Sa','Felsentunnel und weiter an den Rhein','Übernachtung Bad Breisig · Pool mit Rheinblick',null,null,false,null),
  (2025,1,'Fr','Bad Münster am Stein → Gasthaus zur Krone','Burg Rheingrafenstein, Altenbaumburg · ca. 4,5 h',null,null,false,null),
  (2025,2,'Sa','Rund um den Lemberg → Rotenfelsstube','Silbersee, Lemberghütte, Klamm · ca. 18 km',18.0,null,false,null),
  (2025,3,'So','Rotenfels → Biergarten Brauwerk','Höchste Steilwand zwischen Alpen und Skandinavien',null,null,false,null),
  (2026,1,'Fr','Brauereienweg Waischenfeld','13 km Rundweg · 2 Brauereien',13.0,null,false,null),
  (2026,2,'Sa','Waischenfeld → Aufseß','15 km · 3 Gasthäuser, 3 Brauereien · Taxi zurück',15.0,null,false,null),
  (2026,3,'So','Frühstück & Heimfahrt','Hotel Zur Post, Waischenfeld',null,null,false,null),
  (2027,1,'Do','Anreise','Flug nach Palma, ab ins Sóller-Tal',null,null,false,null),
  (2027,2,'Fr','Etappe 1','Wird am 01.03.2027 enthüllt',null,null,true,'2027-03-01 20:00:00+01'),
  (2027,3,'Sa','Etappe 2','Wird am 01.05.2027 enthüllt',null,null,true,'2027-05-01 20:00:00+02'),
  (2027,4,'So','Etappe 3 und Jubiläumsessen','Wird am 01.08.2027 enthüllt',null,null,true,'2027-08-01 20:00:00+02'),
  (2027,5,'Mo','Abreise','Rückflug',null,null,false,null)
) as v(year, sort, day, title, meta, km, hm, secret, reveal_at)
join public.tours t on t.year = v.year;

insert into public.reveals (tour_id, sort, teaser, reveal_at, is_joke)
select t.id, v.sort, v.teaser, v.at::timestamptz, v.joke
from (values
  (1,'Wo wir schlafen','2027-01-01 20:00:00+01',false),
  (2,'Wie wir in die Luft gehen','2027-02-01 20:00:00+01',false),
  (3,'Was Tag 1 bereithält','2027-03-01 20:00:00+01',false),
  (4,'Wo wir nass werden','2027-04-01 20:00:00+02',true),
  (5,'April, April! Jetzt aber wirklich: Wo wir nass werden','2027-04-02 20:00:00+02',false),
  (6,'Was Tag 2 bereithält','2027-05-01 20:00:00+02',false),
  (7,'Die Disziplinen der Pool-Olympiade','2027-06-01 20:00:00+02',false),
  (8,'Termin der Qualifikation','2027-07-01 20:00:00+02',false),
  (9,'Wo wir feiern','2027-08-01 20:00:00+02',false),
  (10,'Das komplette Programm','2027-09-01 20:00:00+02',false)
) as v(sort, teaser, at, joke)
cross join public.tours t where t.year = 2027;

-- Rätsel: erstes am 06.12.2026 um 20:00 Uhr, danach alle 14 Tage; Auflösung mit dem nächsten Rätsel
with q(nr, kind, question, options, correct, num, expl) as (values
  (1,'archiv','Wer hat die Wandergruppe 2018 gegründet?','["Ossi","Stürmi","Potti","Jan"]'::jsonb,0,null::numeric,'Ossi hat die Gruppe am 19.07.2018 erstellt.'),
  (2,'schaetzen','Wie viele Nachrichten hat der Wander-Chat von 2019 bis November 2026?',null,null,2091,'2.091 Nachrichten. Am meisten geschrieben hat Potti (505), knapp vor Ossi (489).'),
  (3,'archiv','Wie viele Hotels musste Ossi 2019 nach eigener Aussage anrufen, bis er 8 Einzelzimmer in der Pfalz hatte?','["8","15","30","50"]',2,null,'Geschätzte 30 Hotels.'),
  (4,'mallorca','Wofür war das Sóller-Tal früher so reich, dass sich die Bauern eine eigene Bahn nach Palma finanziert haben?','["Oliven","Wein","Orangen","Mandeln"]',2,null,'Orangen und Zitrusfrüchte. Die Holzbahn heißt bis heute „Orangen-Express“.'),
  (5,'archiv','In welcher Reihenfolge ist die Truppe 2019 die Etappen des Pfälzer Weinsteigs gelaufen?','["1-2-3","3-2-1","3-1-2","2-3-1"]',2,null,'3-1-2. „Wir laufen rückwärts“ (Ossi).'),
  (6,'mallorca','Seit wann fährt die alte Holzbahn von Palma nach Sóller?','["1898","1912","1936","1964"]',1,null,'Seit 1912, durch 13 Tunnel.'),
  (7,'schaetzen','Wie viele Schritte hat Markus am Ende der Tour 2019 gemeldet?',null,null,84000,'84.000 Schritte.'),
  (8,'mallorca','Die Biniaraix-Schlucht war früher ein Pilgerweg. Wohin führte er?','["Kathedrale von Palma","Kloster Lluc","Valldemossa","Cap Formentor"]',1,null,'Zum Kloster Lluc.'),
  (9,'archiv','Was hat Ossi 2021 kurz vor dem Harz als „ganz wichtig!“ bezeichnet?','["Impfnachweis","Starterschnaps","Regenjacke","Brotdose"]',1,null,'Starterschnaps.'),
  (10,'archiv','Charly vermisste auf der Packliste Kabelbinder und … – was hat er zuerst getippt?','["Panzerband","Panzerfaust","Panzerknacker","Pansen"]',1,null,'Panzerfaust. Gemeint war Panzerband.'),
  (11,'archiv','Welche Bonbons wollte Potti statt der Fischermanns von Ossis Packliste mitnehmen?','["Em-eukal","Vivil","Ricola","Wick Blau"]',1,null,'Vivil.'),
  (12,'mallorca','Seit wann ist die Serra de Tramuntana UNESCO-Welterbe?','["1985","1999","2011","2019"]',2,null,'Seit 2011.'),
  (13,'archiv','Charly fiel 2022 wegen seines „grünen Abiturs“ aus. Was ist damit gemeint?','["Gärtnerprüfung","Jagdschein","Biologie-Abi","Angelschein"]',1,null,'Der Jagdschein.'),
  (14,'archiv','Unter welchem Namen kannte Potti den Neuzugang Bönne schon vorher?','["Toni der Libero","Björn die Bombe","Der Dude","Bönne Bönne"]',0,null,'Toni der Libero.'),
  (15,'archiv','Wie haben Stürmi und Klingel die Rheinsteig-Tour 2023 angekündigt?','["Als Genusswanderung","Als CO2-neutrale Wanderung","Als Extremtour","Als Kulturreise"]',1,null,'Als CO2-neutrale Wanderung, zurück ging es mit dem Zug.'),
  (16,'archiv','Wie hat Ossi die Planungsschule von Jan und Ralle 2024 getauft?','["Seidl Akademie","Jan-Uni","Ralle-Campus","Orga-Internat"]',0,null,'Seidl Akademie.'),
  (17,'archiv','Welcher Parkplatz war 2025 im Nahetal vereinbart, als Stürmi woanders stand?','["P1","P2","P3","Wanderparkplatz Süd"]',2,null,'P3.'),
  (18,'archiv','Warum konnte Ralle 2025 das Topspiel in der Unterkunft nicht sehen?','["Kein WLAN","Kein Sky, nur ein alter Röhrenfernseher","Stromausfall","Ossi hatte die Fernbedienung"]',1,null,'Kein Sky, dafür ein Röhrenfernseher.'),
  (19,'archiv','Wie viele Brauereien lagen an Tag 2 auf dem Weg von Waischenfeld nach Aufseß?','["1","2","3","5"]',2,null,'Drei Brauereien, dazu drei Gasthäuser.'),
  (20,'mallorca','Der Puig Major, Mallorcas höchster Berg, darf nicht bestiegen werden. Warum?','["Naturschutz","Militärische Radarstation","Privatbesitz","Steinschlag"]',1,null,'Auf dem Gipfel steht eine militärische Radarstation.')
), ins as (
  insert into public.riddles (nr, kind, question, options, points, publish_at, resolve_at)
  select nr, kind, question, options, case when kind = 'schaetzen' then 2 else 1 end,
         (timestamp '2026-12-06 20:00:00' + ((nr - 1) * interval '14 days')) at time zone 'Europe/Berlin',
         (timestamp '2026-12-06 20:00:00' + (nr * interval '14 days')) at time zone 'Europe/Berlin'
  from q
  returning id, nr
)
insert into public.riddle_solutions (riddle_id, correct_option, numeric_answer, explanation)
select ins.id, q.correct, q.num, q.expl from ins join q on q.nr = ins.nr;
