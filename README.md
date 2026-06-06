# 🏃 Coach Running — Agent IA connecté à Strava

Coach running personnel propulsé par **Google Gemini** (gratuit), connecté à Strava, installable comme app iPhone (PWA).

## Fonctionnalités

- 📊 **Import automatique Strava** — toutes tes courses synchronisées
- 🧠 **Analyse IA** — ton coach Gemini analyse chaque séance
- 💬 **Ressentis détaillés** — effort, cardio, jambes, mental, douleurs, sommeil
- 📅 **Plan personnalisé** — généré selon ton profil, objectif et historique
- 💬 **Chat coach** — pose tes questions à tout moment
- 📱 **PWA iPhone** — installable sur l'écran d'accueil

---

## Variables d'environnement Railway

| Variable | Où la trouver |
|---|---|
| `STRAVA_CLIENT_ID` | [strava.com/settings/api](https://strava.com/settings/api) |
| `STRAVA_CLIENT_SECRET` | Même page Strava |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API Key (gratuit) |
| `SESSION_SECRET` | N'importe quel texte de 32+ caractères |
| `APP_URL` | Ton URL Railway ex: `https://running-coach-xyz.up.railway.app` |

---

## Installation rapide

1. **Fork** ce repo GitHub (bouton en haut à droite)
2. **Railway** → New Project → Deploy from GitHub → sélectionne ce repo
3. Onglet **Variables** → ajoute les 5 variables ci-dessus
4. **Strava** → [strava.com/settings/api](https://strava.com/settings/api) → mettre ton URL Railway dans "Authorization Callback Domain"
5. **iPhone** → ouvre l'URL dans Safari → Partage → Sur l'écran d'accueil

---

## Architecture

```
running-coach/
├── server.js          ← Serveur Express (Strava OAuth + Gemini IA)
├── package.json       ← Dépendances Node.js
├── railway.json       ← Config Railway
├── .env.example       ← Template variables
└── public/
    ├── index.html
    ├── manifest.json  ← Config PWA
    ├── sw.js          ← Service Worker offline
    ├── css/app.css
    └── js/
        ├── app.js     ← Contrôleur principal + wizard setup
        ├── ui.js      ← Rendu interface
        ├── coach.js   ← Appels IA
        ├── strava.js  ← API Strava
        └── storage.js ← LocalStorage
```

## Coûts

| Service | Coût |
|---|---|
| Railway | Gratuit |
| Strava API | Gratuit |
| Google Gemini | **100% gratuit** (quota généreux) |

Fait avec ❤️ 🏃
