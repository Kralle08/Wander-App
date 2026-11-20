-- Neuer Auftakt des Rätselsteigs: B (Plaudertasche) · C (Ossis Traum) · A (Panzerfaust); Hotels-Frage rückt auf Platz 10
update public.riddles set kind='archiv', points=1, question='Wer hat von 2019 bis November 2026 die meisten Nachrichten im Wander-Chat geschrieben?', options='["Ossi","Potti","Stürmi","Ralle"]'::jsonb where id=1;
update public.riddle_solutions set correct_option=1, numeric_answer=null, explanation='Potti mit 505 Nachrichten – knapp vor Ossi (489). Dahinter: Stürmi 254, Jan 182, Ralle 160. Insgesamt 2.091 Nachrichten.' where riddle_id=1;

update public.riddles set kind='archiv', points=1, question='Ossi 2019: „In meinem nächsten Leben werde ich … an der Mosel.“ Was wollte er werden?', options='["Winzer","Hotelier","Fährmann","Weinkönigin"]'::jsonb where id=2;
update public.riddle_solutions set correct_option=1, numeric_answer=null, explanation='Hotelier an der Mosel. Wer so viele Zimmer für die Truppe sucht, kennt das Geschäft schon von der anderen Seite.' where riddle_id=2;

update public.riddles set kind='archiv', points=1, question='2021 fehlten Charly auf der Packliste Kabelbinder und … – was hat er zuerst getippt, bevor er sich korrigiert hat?', options='["Panzerband","Panzerfaust","Panzerknacker","Pansen"]'::jsonb where id=3;
update public.riddle_solutions set correct_option=1, numeric_answer=null, explanation='Panzerfaust. Gemeint war Panzerband – für den Harz wäre beides übertrieben gewesen.' where riddle_id=3;

update public.riddles set kind='archiv', points=1, question='Wie viele Hotels musste Ossi 2019 nach eigener Aussage anrufen, bis er 8 Einzelzimmer in der Pfalz hatte?', options='["8","15","30","50"]'::jsonb where id=10;
update public.riddle_solutions set correct_option=2, numeric_answer=null, explanation='Rund 30 Hotels – Einzelzimmer sind eben Grundrecht.' where riddle_id=10;
