-- Rätsel 13: Jagdschein raus (zu leicht), dafür der Weitwanderweg durch die Tramuntana
update public.riddles set kind='mallorca', points=1, question='Wie heißt der Weitwanderweg, der einmal quer durch die Serra de Tramuntana führt?', options='["Camí de Cavalls","GR 221 – Ruta de Pedra en Sec","Camino del Norte","Ruta del Sol"]'::jsonb where id=13;
update public.riddle_solutions set correct_option=1, numeric_answer=null, explanation='Die GR 221, die „Trockensteinroute“ – benannt nach den Trockensteinmauern der Tramuntana. Der Camí de Cavalls ist übrigens auf Menorca.' where riddle_id=13;
