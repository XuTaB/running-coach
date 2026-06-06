// app.js — Contrôleur principal
const App = {
  currentTab: 'home',
  setupStep: 0,
  setupData: {},
  activities: [],

  async init() {
    this.initDark(); // applique dark mode avant le premier rendu
    const params = new URLSearchParams(window.location.search);

    if (params.get('code')) {
      const ok = await Strava.handleCallback();
      if (ok) UI.toast('Strava connecté !');
    }

    if (params.get('strava_connected') === '1') {
      window.history.replaceState({}, '', '/');
      UI.toast('Chargement de tes données…');
      // Charge les données depuis Supabase (multi-appareils)
      const pulled = await Storage.pullFromCloud();
      if (pulled) {
        UI.toast('Données synchronisées ✓');
      }
    }

    if (params.get('strava_error')) {
      window.history.replaceState({}, '', '/');
      UI.toast('Erreur de connexion Strava — réessaie');
    }

    // Détermine quel écran afficher
    if (Storage.isSetupDone()) {
      this.showMainApp();
    } else if (Strava.isConnected()) {
      // Strava connecté mais pas de profil local → essaie de charger depuis le cloud
      const pulled = await Storage.pullFromCloud();
      if (pulled && Storage.isSetupDone()) {
        this.showMainApp();
      } else {
        this.startOnboarding();
      }
    } else {
      this.showScreen('onboarding');
    }
  },

  // "Se connecter avec Strava" → OAuth direct
  loginWithStrava() {
    Strava.authorize();
  },

  // Appelé si déjà un compte : va dans l'app ou propose Strava
  showLogin() {
    if (Storage.isSetupDone()) {
      this.showMainApp();
    } else if (Strava.isConnected()) {
      this.startOnboarding();
    } else {
      // Pas de données locales → connexion Strava pour récupérer les données cloud
      Strava.authorize();
    }
  },

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
  },

  // ===== ONBOARDING — délégué à Setup ===========================
  startOnboarding() {
    const existing = Storage.getProfile();
    this.showScreen('setup');
    Setup.start(existing);
  },


  setupSteps: [
    {
      title: 'Ton objectif principal',
      sub: 'Sur quelle course tu te prépares ?',
      render() {
        return `
          <div class="field">
            <label class="field-label">Ton prénom</label>
            <input class="field-input" type="text" id="s-name" placeholder="ex : Thomas" value="${App.setupData.name||''}" autocomplete="given-name">
          </div>
          <div class="field">
            <label class="field-label">Course / événement</label>
            <input class="field-input" type="text" id="s-goal-name" placeholder="ex : Marathon de Paris" value="${App.setupData.goalName||''}">
          </div>
          <div class="field-grid">
            <div class="field">
              <label class="field-label">Date</label>
              <input class="field-input" type="date" id="s-goal-date" value="${App.setupData.goalDate||''}">
            </div>
            <div class="field">
              <label class="field-label">Chrono cible</label>
              <input class="field-input" type="text" id="s-goal-target" placeholder="ex : 3h45" value="${App.setupData.goalTarget||''}">
            </div>
          </div>
          <div class="field">
            <label class="field-label">Objectif secondaire (optionnel)</label>
            <input class="field-input" type="text" id="s-goal2" placeholder="ex : Semi de Paris - mars 2026" value="${App.setupData.goal2||''}">
          </div>`;
      },
      save() {
        App.setupData.name       = document.getElementById('s-name').value;
        App.setupData.goalName   = document.getElementById('s-goal-name').value;
        App.setupData.goalDate   = document.getElementById('s-goal-date').value;
        App.setupData.goalTarget = document.getElementById('s-goal-target').value;
        App.setupData.goal2      = document.getElementById('s-goal2').value;
        return !!App.setupData.goalName;
      }
    },
    {
      title: 'Tes records personnels',
      sub: 'Aide-moi à calibrer ton niveau. Laisse vide si tu n\'as pas le chrono.',
      render() {
        return `
          ${[['10 km','km10','s-pr-10'],['Semi-marathon','semi','s-pr-semi'],['Marathon','marathon','s-pr-marathon']].map(([lbl,key,id]) => `
          <div class="field-grid" style="align-items:end;margin-bottom:14px;">
            <div class="field" style="margin:0;">
              <label class="field-label">${lbl}</label>
              <input class="field-input" type="text" id="${id}" placeholder="ex : 48:30" value="${App.setupData['pr_'+key]||''}">
            </div>
            <div class="field" style="margin:0;">
              <label class="field-label">Date</label>
              <input class="field-input" type="date" id="${id}-date" value="${App.setupData['pr_'+key+'_date']||''}">
            </div>
          </div>`).join('')}
          <div class="field">
            <label class="field-label">Ton niveau actuel</label>
            <div class="chips" id="level-chips">
              ${['Débutant','Intermédiaire','Confirmé','Expert'].map(l =>
                `<div class="chip${App.setupData.level===l?' active':''}" onclick="App.pickLevel(this,'${l}')">${l}</div>`
              ).join('')}
            </div>
          </div>`;
      },
      save() {
        App.setupData.pr_km10    = document.getElementById('s-pr-10').value;
        App.setupData.pr_semi    = document.getElementById('s-pr-semi').value;
        App.setupData.pr_marathon = document.getElementById('s-pr-marathon').value;
        return true;
      }
    },
    {
      title: 'Ton planning',
      sub: 'Combien de fois par semaine tu peux courir et quels jours ?',
      render() {
        const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
        const selected = App.setupData.trainingDays || [];
        return `
          <div class="field">
            <label class="field-label">Séances par semaine</label>
            <div class="chips">
              ${[2,3,4,5].map(n => `<div class="chip${App.setupData.sessionsPerWeek===n?' active':''}" onclick="App.pickSessions(this,${n})">${n} séances</div>`).join('')}
            </div>
          </div>
          <div class="field">
            <label class="field-label">Jours disponibles</label>
            <div class="chips" id="days-chips">
              ${days.map(d => `<div class="chip${selected.includes(d)?' active':''}" onclick="App.toggleDay(this,'${d}')">${d}</div>`).join('')}
            </div>
          </div>
          <div class="field">
            <label class="field-label">Jour de la sortie longue</label>
            <div class="chips" id="sl-day-chips">
              ${days.map(d => `<div class="chip${App.setupData.slDay===d?' active':''}" onclick="App.pickSlDay(this,'${d}')">${d}</div>`).join('')}
            </div>
          </div>`;
      },
      save() { return (App.setupData.trainingDays||[]).length > 0; }
    },
    {
      title: 'Tes données physiques',
      sub: 'Pour calibrer tes zones d\'entraînement.',
      render() {
        return `
          <div class="field-grid">
            <div class="field">
              <label class="field-label">Âge</label>
              <input class="field-input" type="number" id="s-age" placeholder="ans" value="${App.setupData.age||''}">
            </div>
            <div class="field">
              <label class="field-label">FC maximale</label>
              <input class="field-input" type="number" id="s-fcmax" placeholder="bpm" value="${App.setupData.fcMax||''}">
            </div>
            <div class="field">
              <label class="field-label">FC au repos</label>
              <input class="field-input" type="number" id="s-fcrest" placeholder="bpm" value="${App.setupData.fcRest||''}">
            </div>
            <div class="field">
              <label class="field-label">Allure EF cible</label>
              <input class="field-input" type="text" id="s-ef" placeholder="min/km" value="${App.setupData.efPace||''}">
            </div>
          </div>
          <div class="field">
            <label class="field-label">Fragilités / blessures connues</label>
            <div class="chips" id="injury-chips">
              ${['Genoux','Mollets','Tendons','Dos','Hanches','Aucune'].map(i =>
                `<div class="chip${(App.setupData.injuries||[]).includes(i)?' active-soft':''}" onclick="App.toggleInjury(this,'${i}')">${i}</div>`
              ).join('')}
            </div>
          </div>
          <div class="field">
            <label class="field-label">Contexte</label>
            <div class="chips">
              ${['Travail sédentaire','Travail physique','Stress élevé','Enfants jeunes','Voyages fréquents'].map(c =>
                `<div class="chip${(App.setupData.context||[]).includes(c)?' active-soft':''}" onclick="App.toggleContext(this,'${c}')">${c}</div>`
              ).join('')}
            </div>
          </div>`;
      },
      save() {
        App.setupData.age    = document.getElementById('s-age').value;
        App.setupData.fcMax  = document.getElementById('s-fcmax').value;
        App.setupData.fcRest = document.getElementById('s-fcrest').value;
        App.setupData.efPace = document.getElementById('s-ef').value;
        return true;
      }
    },
    {
      title: 'Connexion Strava',
      sub: 'Connecte ton compte pour importer tes courses. Tu peux le faire plus tard.',
      render() {
        if (Strava.isConnected()) {
          return `<div class="strava-connected-bar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <div><strong>Strava connecté !</strong><br><span>Tes courses seront synchronisées automatiquement.</span></div>
          </div>`;
        }
        return `
          <div style="text-align:center;padding:20px 0;">
            <svg width="64" height="64" viewBox="0 0 64 64" style="margin-bottom:16px;"><circle cx="32" cy="32" r="32" fill="#FC4C02"/><path d="M22 44l8-16 8 16h-5l-3-6-3 6h-5zm-8-16l3 6H10L22 12l12 22h-7l-5-10-5 10h-3.5l1.5-6z" fill="white"/></svg>
            <div style="font-size:17px;font-weight:700;margin-bottom:8px;">Connecter Strava</div>
            <div style="font-size:14px;color:var(--text-muted);margin-bottom:24px;line-height:1.5;">Ton coach analysera tes courses et adaptera ton entraînement automatiquement.</div>
            <button class="btn-primary" style="margin:0 auto;" onclick="App.savePartialProfileAndConnectStrava()">Se connecter avec Strava</button>
            <div style="margin-top:12px;font-size:13px;color:var(--text-hint);">Tu pourras le faire plus tard dans les paramètres.</div>
          </div>`;
      },
      save() { return true; }
    }
  ],

  renderSetupStep() {
    const step  = this.setupSteps[this.setupStep];
    const total = this.setupSteps.length;
    const progress = ((this.setupStep + 1) / total) * 100;

    document.getElementById('setup-progress').style.width = progress + '%';
    document.getElementById('setup-step-label').textContent = `Étape ${this.setupStep + 1} / ${total}`;

    const content = document.getElementById('setup-content');
    content.innerHTML = `
      <h2 class="setup-title">${step.title}</h2>
      <p class="setup-sub">${step.sub}</p>
      ${step.render()}`;

    let footer = document.querySelector('.setup-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'setup-footer';
      document.getElementById('screen-setup').appendChild(footer);
    }
    const isLast = this.setupStep === total - 1;
    // BUG 2 FIX : si on édite (profil existant), le bouton retour revient à l'app
    const backLabel = Storage.isSetupDone() && this.setupStep === 0 ? '✕ Annuler' : '←';
    footer.innerHTML = `
      <button class="btn-back" onclick="${Storage.isSetupDone() && this.setupStep === 0 ? 'App.showMainApp()' : 'App.prevSetupStep()'}">${backLabel}</button>
      <button class="btn-next" onclick="App.nextSetupStep()">${isLast ? 'Enregistrer →' : 'Suivant →'}</button>`;
  },

  nextSetupStep() {
    const step = this.setupSteps[this.setupStep];
    if (!step.save()) {
      UI.toast('Remplis les champs obligatoires');
      return;
    }
    if (this.setupStep < this.setupSteps.length - 1) {
      this.setupStep++;
      this.renderSetupStep();
    } else {
      this.finishSetup();
    }
  },

  prevSetupStep() {
    if (this.setupStep > 0) {
      this.setupStep--;
      this.renderSetupStep();
    }
  },

  finishSetup() {
    const d = this.setupData;
    const profile = {
      name: d.name || 'Toi',
      goal: { name: d.goalName, date: d.goalDate, target: d.goalTarget },
      goal2: d.goal2,
      prs: { km10: d.pr_km10, semi: d.pr_semi, marathon: d.pr_marathon },
      level: d.level || 'Intermédiaire',
      trainingDays: d.trainingDays || [],
      slDay: d.slDay,
      sessionsPerWeek: d.sessionsPerWeek || 3,
      age: d.age,
      fcMax: d.fcMax,
      fcRest: d.fcRest,
      efPace: d.efPace,
      injuries: d.injuries || [],
      context: d.context || [],
      createdAt: Date.now()
    };
    Storage.saveProfile(profile);
    UI.toast('Profil sauvegardé ✓');
    this.showMainApp();
  },

  // BUG 2 FIX : sauvegarde le profil avant de rediriger vers Strava
  savePartialProfileAndConnectStrava() {
    const d = this.setupData;
    const profile = {
      name: d.name||'Toi',
      goal: { name: d.goalName||'', date: d.goalDate||'', target: d.goalTarget||'' },
      goal2: d.goal2||'',
      prs: { km10: d.pr_km10||'', semi: d.pr_semi||'', marathon: d.pr_marathon||'' },
      level: d.level || 'Intermédiaire',
      trainingDays: d.trainingDays || [],
      slDay: d.slDay||'',
      sessionsPerWeek: d.sessionsPerWeek || 3,
      age: d.age||'',
      fcMax: d.fcMax||'',
      fcRest: d.fcRest||'',
      efPace: d.efPace||'',
      injuries: d.injuries || [],
      context: d.context || [],
      createdAt: Date.now()
    };
    Storage.saveProfile(profile);
    Strava.authorize();
  },

  // ===== CHIP PICKERS =====
  pickLevel(el, val) {
    document.querySelectorAll('#level-chips .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this.setupData.level = val;
  },
  pickSessions(el, n) {
    el.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this.setupData.sessionsPerWeek = n;
  },
  toggleDay(el, day) {
    el.classList.toggle('active');
    if (!this.setupData.trainingDays) this.setupData.trainingDays = [];
    const idx = this.setupData.trainingDays.indexOf(day);
    if (idx > -1) this.setupData.trainingDays.splice(idx, 1);
    else this.setupData.trainingDays.push(day);
  },
  pickSlDay(el, day) {
    el.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this.setupData.slDay = day;
  },
  toggleInjury(el, val) {
    el.classList.toggle('active-soft');
    if (!this.setupData.injuries) this.setupData.injuries = [];
    const idx = this.setupData.injuries.indexOf(val);
    if (idx > -1) this.setupData.injuries.splice(idx, 1);
    else this.setupData.injuries.push(val);
  },
  toggleContext(el, val) {
    el.classList.toggle('active-soft');
    if (!this.setupData.context) this.setupData.context = [];
    const idx = this.setupData.context.indexOf(val);
    if (idx > -1) this.setupData.context.splice(idx, 1);
    else this.setupData.context.push(val);
  },

  // ===== MAIN APP =====
  async showMainApp() {
    this.showScreen('main');
    const profile = Storage.getProfile();

    if (profile) {
      const name = profile.name || 'Toi';
      document.getElementById('user-avatar').textContent = name[0].toUpperCase();
      document.getElementById('user-name').textContent = name === 'Toi' ? 'Mon profil' : name;
      if (profile.goal?.date && profile.goal?.name) {
        const days = Math.round((new Date(profile.goal.date) - Date.now()) / 86400000);
        document.getElementById('countdown-label').textContent = `J−${days} · ${profile.goal.name}`;
      }
    }

    this.activities = Storage.getActivities();
    await this.showTab('home');

    // Génère automatiquement le plan si pas encore fait
    if (!Storage.getPlan()) {
      setTimeout(() => this.generatePlan(), 800);
    }

    if (Strava.isConnected()) {
      Storage.pullFromCloud().then(pulled => {
        if (pulled) {
          this.activities = Storage.getActivities();
          this.showTab(this.currentTab);
        }
      });
      setTimeout(() => this.syncStrava(true), 1500);
      setTimeout(() => this.checkRunTest(), 3000);
    }
  },

  async showTab(name) {
    this.currentTab = name;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById('tab-' + name).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });

    const profile  = Storage.getProfile();
    const plan     = Storage.getPlan();

    switch(name) {
      case 'home':     UI.renderHome(profile, this.activities, plan); break;
      case 'strava':   UI.renderStravaTab(Strava.isConnected(), this.activities); break;
      case 'plan':     UI.renderPlanTab(plan, false); break;
      case 'coach':    UI.renderCoachTab(); break;
      case 'settings': UI.renderSettings(profile); break;
    }
  },

  async syncStrava(silent = false) {
    if (!Strava.isConnected()) { UI.toast('Strava non connecté'); return; }
    if (!silent) UI.toast('Synchronisation…');
    const activities = await Strava.fetchActivities(30);
    if (activities) {
      this.activities = activities;
      if (!silent) UI.toast(`${activities.length} courses synchronisées`);
      if (this.currentTab === 'strava') UI.renderStravaTab(true, activities);
      if (this.currentTab === 'home')   UI.renderHome(Storage.getProfile(), activities, Storage.getPlan());
    } else {
      if (!silent) UI.toast('Erreur de synchronisation');
    }
  },

  // BUG 1 FIX : génération plan avec meilleure gestion d'erreur Gemini
  async generatePlan() {
    const profile = Storage.getProfile();

    // Si run test choisi et pas encore fait → mettre uniquement le run test dans le plan
    if (profile && profile.runTest === 'yes' && !profile.runTestDone) {
      const days = Object.keys(profile.schedule || {});
      const firstDay = days[0] || 'Mar';
      const runTestPlan = {
        weeks: [{
          title: 'Run test de calibration',
          volume_km: 8,
          days: [{
            day: firstDay,
            type: 'test',
            label: 'Run test 20 min',
            detail: '15 min échauffement progressif · 20 min effort maximal constant · 10 min retour au calme — Lance Strava pour toute la séance'
          }]
        }]
      };
      Storage.savePlan(runTestPlan);
      this.showTab('plan');
      UI.renderPlanTab(runTestPlan, false);
      UI.toast('Run test planifié — Lance-toi quand tu es prêt !');
      return;
    }

    this.showTab('plan');
    UI.renderPlanTab(null, true);

    let raw = null;
    try {
      raw = await Coach.generatePlan();
    } catch(e) {
      console.error('generatePlan exception:', e);
    }

    if (!raw) {
      UI.toast('Le coach est indisponible — réessaie dans quelques secondes');
      UI.renderPlanTab(null, false);
      return;
    }

    try {
      console.log('[generatePlan] Raw reçu (200 chars):', raw.slice(0, 200));

      // Nettoyage agressif : retire tout ce qui n'est pas du JSON
      let clean = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .replace(/^[^{]*/s, '')   // tout ce qui précède le premier {
        .trim();

      // Cherche le premier { et le dernier } pour extraire le JSON pur
      const start = clean.indexOf('{');
      const end   = clean.lastIndexOf('}');
      if (start === -1 || end === -1) {
        console.error('[generatePlan] Pas de JSON dans:', clean.slice(0, 300));
        throw new Error('Pas de JSON trouvé');
      }
      const jsonStr = clean.slice(start, end + 1);

      let plan;
      try {
        plan = JSON.parse(jsonStr);
      } catch(parseErr) {
        console.error('[generatePlan] JSON.parse échoué:', parseErr.message);
        console.error('[generatePlan] JSON tenté:', jsonStr.slice(0, 300));
        throw parseErr;
      }

      if (!plan.weeks || !Array.isArray(plan.weeks) || plan.weeks.length === 0) {
        throw new Error('Format weeks manquant ou vide');
      }

      // Valide et corrige chaque jour
      plan.weeks = plan.weeks.map(week => ({
        title:     week.title     || 'Semaine',
        volume_km: week.volume_km || 0,
        days: (week.days || []).map(d => ({
          day:    d.day    || '',
          type:   d.type   || 'rest',
          label:  d.label  || 'Repos',
          detail: d.detail || ''
        }))
      }));

      Storage.savePlan(plan);
      UI.renderPlanTab(plan, false);
      UI.toast('Plan généré ✓');

    } catch(e) {
      console.error('[generatePlan] Erreur finale:', e.message);
      UI.toast('Erreur de génération — réessaie');
      UI.renderPlanTab(null, false);
    }
  },

  async analyzeActivity(activityId) {
    const activity = this.activities.find(a => a.id === activityId);
    const feedback = Storage.getFeedback(activityId);
    if (!activity) return;
    if (!feedback) { UI.toast('Remplis d\'abord le formulaire de ressenti'); return; }

    UI.toast('Analyse en cours…', 3000);
    const analysisReply = await Coach.analyzeActivity(activity, feedback);
    Storage.addChatMessage({ role: 'assistant', content: analysisReply, ts: Date.now() });
    this.showTab('coach');
    setTimeout(() => UI.renderChatMessages(), 100);
  },

  async sendChat(text) {
    const input = document.getElementById('chat-input');
    const msg   = text || (input ? input.value.trim() : '');
    if (!msg) return;
    if (input) input.value = '';

    // Sauvegarde le message utilisateur et l'affiche
    Storage.addChatMessage({ role: 'user', content: msg, ts: Date.now() });
    UI.renderChatMessages();
    UI.addLoadingBubble();

    const btn = document.getElementById('chat-send-btn');
    if (btn) btn.disabled = true;

    // sendMessage() ne sauvegarde PAS l'historique (évite le doublon)
    const reply = await Coach.sendMessage(msg);
    UI.removeLoadingBubble();

    // Sauvegarde la réponse et l'affiche
    Storage.addChatMessage({ role: 'assistant', content: reply, ts: Date.now() });
    UI.renderChatMessages();

    if (btn) btn.disabled = false;
  },

  chatWithCoach(msg) {
    this.showTab('coach');
    setTimeout(() => this.sendChat(msg), 300);
  },

  editProfile(section) {
    const existing = Storage.getProfile();
    this.showScreen('setup');
    Setup.start(existing);
    // Saute à la bonne section si précisée
    const stepMap = { general: 0, goal: 3, schedule: 5, prs: 6 };
    if (section && stepMap[section] !== undefined) {
      setTimeout(() => {
        Setup.stepIndex = stepMap[section];
        Setup._render();
      }, 50);
    }
  },

  disconnectStrava() {
    if (confirm('Déconnecter Strava ?')) {
      Strava.disconnect();
      Storage.saveActivities([]);
      this.activities = [];
      UI.toast('Strava déconnecté');
      this.showTab('settings');
    }
  },


  // ===== MODE SOMBRE =====
  initDark() {
    const saved = localStorage.getItem('coach_dark_mode');
    // Applique le mode sombre si sauvegardé, ou si l'OS est en dark
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'true' || (saved === null && prefersDark)) {
      document.body.classList.add('dark');
    }
  },

  toggleDark() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('coach_dark_mode', isDark);
  },

  // ── Détection et analyse du run test ────────────────────────────────────────
  async checkRunTest() {
    const profile = Storage.getProfile();
    if (!profile || profile.runTest !== 'yes') return;
    if (profile.runTestDone) return; // déjà analysé

    const activities = Storage.getActivities();
    if (!activities.length) return;

    // Cherche une course de ~45 min (15 échauffement + 20 test + 10 retour)
    // dans les 14 derniers jours, pas encore analysée
    const twoWeeksAgo = Date.now() - 14 * 24 * 3600 * 1000;
    const candidate = activities.find(function(a) {
      const dur     = a.moving_time || 0;
      const dateMs  = new Date(a.start_date_local).getTime();
      const isRecent = dateMs > twoWeeksAgo;
      const isDuration = dur >= 35 * 60 && dur <= 70 * 60; // 35-70 min
      return isRecent && isDuration && !Storage.getFeedback(a.id + '_runtest_done');
    });

    if (!candidate) return;

    // Notifie l'utilisateur
    UI.toast('Run test détecté — analyse en cours…', 4000);

    try {
      const detail = await Strava.fetchActivityDetail(candidate.id);
      await this.analyzeRunTest(candidate, detail);
    } catch(e) {
      console.error('Erreur analyse run test:', e);
    }
  },

  async analyzeRunTest(activity, detail) {
    const profile  = Storage.getProfile();
    const splits   = detail && detail.splits_metric ? detail.splits_metric : [];

    // Derive cardiaque : compare FC premier tiers vs dernier tiers de la partie test
    const testSplits = splits.slice(2, splits.length - 2);
    const third = Math.floor(testSplits.length / 3) || 1;
    const firstThird = testSplits.slice(0, third);
    const lastThird  = testSplits.slice(-third);
    const hrFirst = firstThird.filter(function(k){return k.average_heartrate;}).reduce(function(s,k){return s+k.average_heartrate;},0) / (firstThird.filter(function(k){return k.average_heartrate;}).length || 1);
    const hrLast  = lastThird.filter(function(k){return k.average_heartrate;}).reduce(function(s,k){return s+k.average_heartrate;},0) / (lastThird.filter(function(k){return k.average_heartrate;}).length || 1);
    const hrDrift = (firstThird.length && lastThird.length) ? Math.round(hrLast - hrFirst) : null;

    // Allure et FC sur la partie test
    const testSpeed = testSplits.length
      ? testSplits.reduce(function(s,k){return s+(k.average_speed||0);},0) / testSplits.length
      : activity.average_speed;
    const testHRArr = testSplits.filter(function(k){return k.average_heartrate;});
    const testHR = testHRArr.length
      ? testHRArr.reduce(function(s,k){return s+k.average_heartrate;},0) / testHRArr.length
      : activity.average_heartrate;

    // Regularite
    const speeds = testSplits.map(function(k){return k.average_speed||0;}).filter(Boolean);
    const avgSpd = speeds.reduce(function(s,v){return s+v;},0) / (speeds.length||1);
    const variance = speeds.reduce(function(s,v){return s+Math.pow(v-avgSpd,2);},0) / (speeds.length||1);
    const reg = Math.sqrt(variance);
    const regularityStr = reg < 0.1 ? 'Excellente' : reg < 0.2 ? 'Bonne' : reg < 0.3 ? 'Correcte' : 'Irreguliere';

    // Prompt pour le coach
    const lines = ['RUN TEST 20min :'];
    lines.push('Duree : ' + Strava.formatDuration(activity.moving_time));
    lines.push('Distance : ' + Strava.formatDistance(activity.distance) + ' km');
    lines.push('Allure partie test : ' + Strava.formatPace(testSpeed) + '/km');
    lines.push('FC partie test : ' + (testHR ? Math.round(testHR) + ' bpm' : 'NC'));
    lines.push('FC max : ' + (activity.max_heartrate || 'NC') + ' bpm');
    lines.push('Derive cardiaque : ' + (hrDrift !== null ? (hrDrift > 0 ? '+' : '') + hrDrift + ' bpm' : 'NC'));
    lines.push('Regularite : ' + regularityStr);
    if (splits.length) {
      lines.push('Splits : ' + splits.map(function(s,i){
        return 'K'+(i+1)+':'+Strava.formatPace(s.average_speed)+'/km'+(s.average_heartrate?'/'+Math.round(s.average_heartrate)+'bpm':'');
      }).join(', '));
    }

    const profLines = [
      'PROFIL : ' + (profile.age||'NC') + ' ans, ' + (profile.sex||'NC') + ', ' + (profile.experience||'NC') + ', FC max ' + (profile.hrMax||'NC') + ' bpm',
      '',
      'Analyse ce run test. Ne calcule PAS avec des formules theoriques. Deduis depuis les donnees reelles :',
      '1. Allure endurance fondamentale recommandee',
      '2. Allure seuil',
      '3. Allure 10 km',
      '4. Niveau actuel probable',
      '5. Points forts et points a travailler',
      '',
      'Ensuite genere le plan des 2 prochaines semaines.',
      'Inclus le JSON du plan a la fin de ta reponse.'
    ];

    const prompt = lines.concat([''], profLines).join('\n');

    // Envoie au coach
    const reply = await Coach.sendMessage(prompt);

    // Sauvegarde
    Storage.addChatMessage({ role: 'user',      content: '[Analyse automatique du run test]', ts: Date.now() });
    Storage.addChatMessage({ role: 'assistant', content: reply, ts: Date.now() });

    // Marque le run test comme analyse
    Storage.saveFeedback(String(activity.id) + '_runtest_done', { done: true, date: Date.now() });
    const updatedProfile = Object.assign({}, Storage.getProfile(), { runTestDone: true });
    Storage.saveProfile(updatedProfile);

    this.showTab('coach');
    UI.renderCoachTab();
    UI.toast('Run test analyse ! Ton plan est pret.', 4000);
  },


  resetApp() {
    if (confirm('Supprimer toutes tes données ? Cette action est irréversible.')) {
      Storage.clear();
      location.reload();
    }
  }
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => App.init());    const runTestLines = [
      'RUN TEST (20 min effort maximal soutenu) :',
      'Duree totale : ' + Strava.formatDuration(activity.moving_time),
      'Distance totale : ' + Strava.formatDistance(activity.distance) + ' km',
      'Allure partie test : ' + Strava.formatPace(testSpeed) + '/km',
      'FC partie test : ' + (testHR ? Math.round(testHR) + ' bpm' : 'NC'),
      'FC max : ' + (activity.max_heartrate || 'NC') + ' bpm',
      'Derive cardiaque : ' + (hrDrift !== null ? (hrDrift > 0 ? '+' : '') + hrDrift + ' bpm' : 'NC'),
      'Regularite : ' + regularityStr
    ];
    if (splits.length) {
      runTestLines.push('Splits : ' + splits.map(function(s, i) {
        return 'K' + (i+1) + ':' + Strava.formatPace(s.average_speed) + '/km' + (s.average_heartrate ? '/' + Math.round(s.average_heartrate) + 'bpm' : '');
      }).join(', '));
    }
    const runTestCtx = runTestLines.join('\n');
