// storage.js — Données locales + synchro Supabase via backend
const Storage = {
  KEY: 'running_coach_v1',

  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch { return {}; }
  },
  set(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); }
    catch(e) { console.warn('Storage full', e); }
  },
  update(patch) { this.set({ ...this.get(), ...patch }); },

  // ── Profil ──────────────────────────────────────────────────────────────────
  getProfile()          { return this.get().profile || null; },
  saveProfile(profile)  {
    this.update({ profile });
    this._syncProfile(profile); // synchro cloud en arrière-plan
  },

  // ── Activités ───────────────────────────────────────────────────────────────
  getActivities()             { return this.get().activities || []; },
  saveActivities(activities)  { this.update({ activities }); },

  // ── Feedbacks ───────────────────────────────────────────────────────────────
  saveFeedback(activityId, feedback) {
    const data     = this.get();
    const feedbacks = data.feedbacks || {};
    feedbacks[activityId] = feedback;
    this.set({ ...data, feedbacks });
    this._syncFeedback(activityId, feedback); // synchro cloud
  },
  getFeedback(activityId) {
    return (this.get().feedbacks || {})[activityId] || null;
  },

  // ── Plan ────────────────────────────────────────────────────────────────────
  getPlan()       { return this.get().plan || null; },
  savePlan(plan)  {
    this.update({ plan });
    this._syncPlan(plan); // synchro cloud
  },

  // ── Chat ────────────────────────────────────────────────────────────────────
  getChatHistory() { return this.get().chatHistory || []; },
  saveChatHistory(msgs) {
    this.update({ chatHistory: msgs });
    this._syncChat(msgs);
  },
  addChatMessage(msg) {
    const hist = this.getChatHistory();
    hist.push(msg);
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    this.saveChatHistory(hist);
  },

  // ── Strava token ────────────────────────────────────────────────────────────
  getStravaToken()        { return this.get().stravaToken || null; },
  saveStravaToken(token)  { this.update({ stravaToken: token }); },
  clearStravaToken()      {
    const data = this.get();
    delete data.stravaToken;
    this.set(data);
  },

  // ── Setup ───────────────────────────────────────────────────────────────────
  isSetupDone() { return !!this.getProfile(); },
  clear()       { localStorage.removeItem(this.KEY); },

  // ── Synchro cloud (fire & forget — n'affecte pas l'UX) ─────────────────────
  // Récupère l'athleteId stocké localement (pour restaurer la session serveur)
  getAthleteId() {
    return this.get().athleteId || null;
  },

  async _post(url, body) {
    const athleteId = this.getAthleteId();
    if (athleteId) body.athleteId = athleteId;
    try {
      await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
      });
    } catch(e) { /* silencieux */ }
  },

  async _syncProfile(profile)              { this._post('/api/data/profile',  { profile }); },
  async _syncFeedback(activityId, feedback){ this._post('/api/data/feedback', { activityId, feedback }); },
  async _syncPlan(plan)                    { this._post('/api/data/plan',     { plan }); },
  async _syncChat(messages)                { this._post('/api/data/chat',     { messages }); },

  // ── Pull depuis la base (au login ou reconnexion sur un nouvel appareil) ────
  async pullFromCloud() {
    try {
      const athleteId = this.getAthleteId();
      const url = athleteId ? `/api/data/sync?athleteId=${athleteId}` : '/api/data/sync';
      const res = await fetch(url);
      if (!res.ok) return false;
      const { mode, data } = await res.json();
      if (mode === 'local' || !data) return false;

      // Fusionne cloud + local (cloud prioritaire)
      const local  = this.get();
      const merged = {
        ...local,
        profile:     data.profile      || local.profile,
        plan:        data.plan          || local.plan,
        feedbacks:   { ...(local.feedbacks || {}), ...(data.feedbacks || {}) },
        chatHistory: data.chat_history  || local.chatHistory || []
      };
      this.set(merged);
      console.log('[Storage] ✅ Données cloud chargées');
      return true;
    } catch(e) {
      console.warn('[Storage] Pull cloud échoué:', e.message);
      return false;
    }
  }
};
