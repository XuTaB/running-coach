// server.js — Coach Running v1.1.3
// Auth : Strava OAuth · IA : Gemini · DB : Supabase (connexion directe PostgreSQL)
require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const path     = require('path');
const fetch    = require('node-fetch');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── PostgreSQL (connexion directe — contourne PostgREST) ────────────────────
let db = null;
if (process.env.DATABASE_URL) {
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  // Teste la connexion et crée la table si besoin
  db.connect()
    .then(client => {
      console.log('✅ PostgreSQL connecté');
      return client.query(`
        CREATE TABLE IF NOT EXISTS public.user_data (
          strava_id     BIGINT PRIMARY KEY,
          name          TEXT,
          access_token  TEXT,
          refresh_token TEXT,
          expires_at    BIGINT,
          profile       JSONB DEFAULT 'null'::jsonb,
          feedbacks     JSONB DEFAULT '{}'::jsonb,
          plan          JSONB DEFAULT 'null'::jsonb,
          chat_history  JSONB DEFAULT '[]'::jsonb,
          created_at    TIMESTAMPTZ DEFAULT NOW(),
          updated_at    TIMESTAMPTZ DEFAULT NOW()
        )
      `).then(() => {
        console.log('✅ Table user_data vérifiée');
        client.release();
      });
    })
    .catch(err => console.error('❌ PostgreSQL erreur:', err.message));
} else {
  console.warn('⚠️  DATABASE_URL manquante — mode local uniquement');
}

// Helper : upsert générique
async function dbUpsert(stravaId, fields) {
  if (!db) return false;
  const keys   = Object.keys(fields);
  const values = Object.values(fields);
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const query = `
    INSERT INTO public.user_data (strava_id, ${keys.join(', ')})
    VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
    ON CONFLICT (strava_id) DO UPDATE SET ${setClauses}, updated_at = NOW()
  `;
  const { rowCount } = await db.query(query, [stravaId, ...values]);
  return rowCount > 0;
}

// Helper : lire les données d'un user
async function dbGet(stravaId) {
  if (!db) return null;
  const { rows } = await db.query(
    'SELECT * FROM public.user_data WHERE strava_id = $1',
    [stravaId]
  );
  return rows[0] || null;
}

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use((req, res, next) => { res.setHeader('X-App-Version', '1.1.3'); next(); });
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

function requireAuth(req, res, next) {
  if (!req.session.athleteId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

// ─── Strava OAuth ─────────────────────────────────────────────────────────────
app.get('/api/strava/auth', (req, res) => {
  const appUrl      = process.env.APP_URL || `http://localhost:${PORT}`;
  const redirectUri = `${appUrl}/api/strava/callback`;
  const params = new URLSearchParams({
    client_id:       process.env.STRAVA_CLIENT_ID,
    redirect_uri:    redirectUri,
    response_type:   'code',
    approval_prompt: 'auto',
    scope:           'read,activity:read_all'
  });
  res.redirect(`https://www.strava.com/oauth/authorize?${params}`);
});

app.get('/api/strava/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?strava_error=1');

  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type:    'authorization_code'
      })
    });
    const data = await response.json();
    if (!response.ok || data.errors) return res.redirect('/?strava_error=2');

    const athleteId   = data.athlete?.id;
    const athleteName = data.athlete?.firstname || 'Athlète';

    req.session.athleteId   = athleteId;
    req.session.athleteName = athleteName;

    // Sauvegarde dans PostgreSQL
    if (db && athleteId) {
      console.log(`[DB] Upsert strava_id=${athleteId} name=${athleteName}`);
      try {
        await dbUpsert(athleteId, {
          name:          athleteName,
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
          expires_at:    data.expires_at
        });
        console.log('[DB] ✅ Utilisateur sauvegardé');
      } catch(e) {
        console.error('[DB] Erreur upsert:', e.message);
      }
    }

    const tokenData = JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    data.expires_at,
      athlete:       data.athlete
    });

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<script>
  try {
    var d = JSON.parse(localStorage.getItem('running_coach_v1') || '{}');
    d.stravaToken = ${tokenData};
    d.athleteId   = ${athleteId};
    d.athleteName = ${JSON.stringify(athleteName)};
    localStorage.setItem('running_coach_v1', JSON.stringify(d));
  } catch(e) {}
  window.location.href = '/?strava_connected=1';
</script></body></html>`);

  } catch (err) {
    console.error('Strava callback error:', err);
    res.redirect('/?strava_error=3');
  }
});

app.post('/api/strava/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token manquant' });
  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token,
        grant_type:    'refresh_token'
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: 'Refresh échoué' });

    if (db && req.session.athleteId) {
      await dbUpsert(req.session.athleteId, {
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at
      });
    }
    res.json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── API Données ──────────────────────────────────────────────────────────────
// Sync : accepte athleteId depuis session OU depuis le body (pour reconnexion)
app.get('/api/data/sync', async (req, res) => {
  if (!db) return res.json({ mode: 'local', data: null });

  // Priorité : session → query param (envoyé par le frontend au reconnect)
  const athleteId = req.session.athleteId || req.query.athleteId;
  if (!athleteId) return res.json({ mode: 'local', data: null });

  // Restaure la session si elle était perdue
  if (!req.session.athleteId && athleteId) {
    req.session.athleteId = parseInt(athleteId);
  }

  try {
    const row = await dbGet(athleteId);
    res.json({ mode: 'cloud', data: row || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper : récupère l'athleteId depuis session ou body
function getAthleteId(req) {
  return req.session.athleteId || req.body.athleteId || null;
}

app.post('/api/data/profile', async (req, res) => {
  if (!db) return res.json({ ok: true, mode: 'local' });
  const athleteId = getAthleteId(req);
  if (!athleteId) return res.status(401).json({ error: 'Non authentifié' });
  if (!req.session.athleteId) req.session.athleteId = parseInt(athleteId);
  try {
    await dbUpsert(athleteId, {
      name:    req.body.profile?.name || req.session.athleteName || 'Athlète',
      profile: JSON.stringify(req.body.profile)
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/data/feedback', async (req, res) => {
  if (!db) return res.json({ ok: true, mode: 'local' });
  const athleteId = getAthleteId(req);
  if (!athleteId) return res.status(401).json({ error: 'Non authentifié' });
  if (!req.session.athleteId) req.session.athleteId = parseInt(athleteId);
  try {
    const row       = await dbGet(athleteId) || {};
    const feedbacks = row.feedbacks || {};
    feedbacks[req.body.activityId] = req.body.feedback;
    await dbUpsert(athleteId, { feedbacks: JSON.stringify(feedbacks) });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/data/plan', async (req, res) => {
  if (!db) return res.json({ ok: true, mode: 'local' });
  const athleteId = getAthleteId(req);
  if (!athleteId) return res.status(401).json({ error: 'Non authentifié' });
  if (!req.session.athleteId) req.session.athleteId = parseInt(athleteId);
  try {
    await dbUpsert(athleteId, { plan: JSON.stringify(req.body.plan) });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/data/chat', async (req, res) => {
  if (!db) return res.json({ ok: true, mode: 'local' });
  const athleteId = getAthleteId(req);
  if (!athleteId) return res.status(401).json({ error: 'Non authentifié' });
  if (!req.session.athleteId) req.session.athleteId = parseInt(athleteId);
  try {
    await dbUpsert(athleteId, { chat_history: JSON.stringify(req.body.messages) });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/session', (req, res) => {
  res.json({
    authenticated: !!req.session.athleteId,
    athleteId:     req.session.athleteId   || null,
    athleteName:   req.session.athleteName || null
  });
});

// ─── Test DB ──────────────────────────────────────────────────────────────────
app.get('/api/test-db', async (req, res) => {
  if (!db) return res.json({ ok: false, error: 'DATABASE_URL non configurée' });
  try {
    await db.query(`
      INSERT INTO public.user_data (strava_id, name)
      VALUES (1, 'test')
      ON CONFLICT (strava_id) DO UPDATE SET name = 'test_ok', updated_at = NOW()
    `);
    const { rows } = await db.query('SELECT strava_id, name FROM public.user_data WHERE strava_id = 1');
    await db.query('DELETE FROM public.user_data WHERE strava_id = 1');
    res.json({ ok: true, message: 'PostgreSQL lecture/écriture OK', data: rows[0] });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── Coach IA — Gemini ────────────────────────────────────────────────────────
// Modèles par ordre de priorité : 2.5-flash en premier, 1.5-flash en fallback
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
];

async function callGemini(prompt, retries = 3) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.7,
                topP: 0.9,
                ...(model === 'gemini-2.5-flash' ? { thinkingConfig: { thinkingBudget: 0 } } : {})
              }
            })
          }
        );

        const data = await geminiRes.json();

        // Surcharge ou quota → retry sur le même modèle ou passe au suivant
        if (!geminiRes.ok || data.error) {
          const msg = data?.error?.message || '';
          const isOverload = msg.includes('high demand') || msg.includes('overloaded') || msg.includes('RESOURCE_EXHAUSTED') || geminiRes.status === 429 || geminiRes.status === 503;
          console.warn(`[COACH] ${model} tentative ${attempt}/${retries}: ${msg}`);
          lastError = msg;
          if (isOverload && attempt < retries) {
            await new Promise(r => setTimeout(r, attempt * 1000)); // 1s, 2s, 3s
            continue;
          }
          break; // erreur non-récupérable → essaie le modèle suivant
        }

        const parts = data.candidates?.[0]?.content?.parts || [];
        const text  = (parts.find(p => p.text && !p.thought) || parts[0])?.text;
        if (!text) { lastError = 'Réponse vide'; break; }

        console.log(`[COACH] ✅ Réponse via ${model} (tentative ${attempt})`);
        return text;

      } catch (e) {
        lastError = e.message;
        if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }
  }

  throw new Error(lastError || 'Tous les modèles Gemini ont échoué');
}

app.post('/api/coach/chat', async (req, res) => {
  const { system, messages } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'Clé Gemini manquante' });
  if (!messages?.length) return res.status(400).json({ error: 'messages[] requis' });

  try {
    const systemText = system || '';
    const userText   = messages[messages.length - 1]?.content || '';
    const fullPrompt = systemText ? `${systemText}\n\n---\n\n${userText}` : userText;
    const truncated  = fullPrompt.length > 40000 ? fullPrompt.slice(0, 40000) : fullPrompt;

    const text = await callGemini(truncated);
    res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error('[COACH] Erreur finale:', err.message);
    res.status(502).json({ error: 'Erreur Gemini', details: err.message });
  }
});

// ─── Health & Version ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    version:   '1.1.3',
    strava:    !!process.env.STRAVA_CLIENT_ID,
    gemini:    !!process.env.GEMINI_API_KEY,
    database:  !!db,
    timestamp: new Date().toISOString()
  });
});

app.get('/version', (req, res) => {
  res.json({ version: '1.1.2', model: 'gemini-2.5-flash', db: !!db });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🏃 Coach Running v1.1.3 — port ${PORT}`);
});
