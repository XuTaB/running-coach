# Running Coach PWA — Context for Claude

## Project
PWA de coaching running personnalisé. Déployé sur Railway, auto-deploy depuis GitHub `main`.
- URL prod : depuis Railway dashboard
- Stack : Node.js/Express, Supabase (PostgreSQL direct via `pg`), Gemini AI, Strava API
- Repo GitHub : https://github.com/XuTaB/running-coach

## Working directory
**Toujours travailler dans ce dossier** (`C:\Users\Melon\Projects\running-coach\`).
Ne jamais utiliser l'ancien dossier iCloud (`running-coach-fresh` dans iCloudDrive) — corrompu par iCloud.

## Version bump — OBLIGATOIRE à chaque commit
- `public/js/version.js` → incrémenter `APP_VERSION`
- `public/sw.js` → incrémenter `CACHE_NAME` (ex. `coach-running-v73` → `v74`)

## iCloud git bug
Le dossier était dans iCloud Drive qui renommait `refs/heads/main` en `main 2`, `main 3`.
**Ce dossier est hors iCloud, ce problème ne se pose plus.**

## Architecture clé
- `server.js` — Express + endpoints `/api/data/sync`, `/api/strava/*`, `/api/chat`, `/api/data/yearlystats`
- `public/js/app.js` — logique principale, `generatePlan()`, `syncStrava()`, `editProfile()`
- `public/js/ui.js` — rendu DOM, `renderHome()`, `renderSettings()`, `renderYearStats()`
- `public/js/setup.js` — wizard de configuration multi-étapes
- `public/js/storage.js` — LocalStorage + sync Supabase, `getYearlyStats()`, `saveYearlyStats()`
- `public/js/strava.js` — OAuth Strava + `fetchYearStats(year)`

## Supabase
Connexion directe PostgreSQL (superuser, bypass RLS). RLS activé sur `user_data` pour bloquer PostgREST public.
Table `user_data` : colonnes `user_id`, `data` (JSONB), `yearly_stats` (JSONB).

## Conventions
- Pas de commentaires sauf si le WHY est non-obvious
- CSS variables : `--orange`, `--bg`, `--bg2`, `--text`, `--text-muted`, `--border`, `--green`, `--red`
- `trainingDays` dans le profil = tableau de jours ex. `['Mar','Jeu','Dim']`
- `goal.dist` = distance ex. `'10km'`, `'Semi-marathon'`, `'Trail 50km'`
