-- ============================================================
-- COACH RUNNING — Fix Supabase (à exécuter dans SQL Editor)
-- Corrige le problème d'écriture bloquée par RLS
-- ============================================================

-- 1. Supprime la table existante si elle est mal configurée
drop table if exists public.user_data;

-- 2. Recrée la table proprement
create table public.user_data (
  strava_id     bigint primary key,
  name          text,
  access_token  text,
  refresh_token text,
  expires_at    bigint,
  profile       jsonb,
  feedbacks     jsonb default '{}'::jsonb,
  plan          jsonb,
  chat_history  jsonb default '[]'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 3. DÉSACTIVE RLS — le serveur Railway utilise la service role key
--    qui bypasse RLS, mais on désactive pour éviter tout conflit
alter table public.user_data disable row level security;

-- 4. Donne tous les droits au rôle service_role
grant all on public.user_data to service_role;
grant all on public.user_data to postgres;

-- 5. Test immédiat : insère une ligne de test
insert into public.user_data (strava_id, name)
values (999999999, 'TEST_CONNEXION')
on conflict (strava_id) do update set name = 'TEST_OK_' || now()::text;

-- 6. Vérifie que la ligne est bien là
select strava_id, name, created_at from public.user_data where strava_id = 999999999;

-- ============================================================
-- Si tu vois la ligne TEST dans les résultats → tout est bon
-- Tu peux supprimer la ligne test après :
-- delete from public.user_data where strava_id = 999999999;
-- ============================================================
