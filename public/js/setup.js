// setup.js — Wizard de configuration complet
// Séparé de app.js pour la lisibilité

const Setup = {
  data: {},      // données collectées
  stepIndex: 0,  // étape courante dans la liste aplatie
  steps: [],     // liste des étapes calculée dynamiquement

  // ── Initialisation ──────────────────────────────────────────────────────────
  start(existingProfile) {
    this.data = existingProfile ? this._profileToData(existingProfile) : {};
    this._buildSteps();
    this.stepIndex = 0;
    this._render();
  },

  // Recalcule les étapes selon les données actuelles (logique conditionnelle)
  _buildSteps() {
    const d = this.data;
    this.steps = [
      'general',
      'sport_history',
      'constraints',
      'goal_main',
      d.goalMain === 'race'        ? 'goal_race'       : null,
      d.goalMain === 'fitness'     ? 'goal_fitness'     : null,
      d.goalMain === 'start'       ? 'goal_start'       : null,
      'goal_secondary',
      d.goalSecondary === 'yes'    ? 'goal_race_2'      : null,
      'schedule',
      'prs',
      'plan_prep',
      'strava',
    ].filter(Boolean);
  },

  // ── Rendu d'une étape ───────────────────────────────────────────────────────
  _render() {
    const total   = this.steps.length;
    const current = this.stepIndex + 1;
    const stepId  = this.steps[this.stepIndex];

    document.getElementById('setup-progress').style.width = (current / total * 100) + '%';
    document.getElementById('setup-step-label').textContent = `${current} / ${total}`;

    const content = document.getElementById('setup-content');
    content.innerHTML = this._renderStep(stepId);
    content.scrollTop = 0;

    // Footer
    let footer = document.querySelector('.setup-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'setup-footer';
      document.getElementById('screen-setup').appendChild(footer);
    }
    const isLast    = this.stepIndex === this.steps.length - 1;
    const isFirst   = this.stepIndex === 0;
    const hasProfile = !!Storage.getProfile();
    footer.innerHTML = `
      <button class="btn-back" onclick="${hasProfile && isFirst ? 'App.showMainApp()' : 'Setup.prev()'}">
        ${hasProfile && isFirst ? '✕' : '←'}
      </button>
      <button class="btn-next" onclick="Setup.next()">
        ${isLast ? 'Terminer →' : 'Suivant →'}
      </button>`;
  },

  _renderStep(id) {
    const d = this.data;
    const steps = {

      // ── 1. Informations générales ─────────────────────────────────────────
      general: () => `
        <h2 class="setup-title">Qui es-tu ?</h2>
        <p class="setup-sub">Ces infos aident ton coach à calibrer précisément ton entraînement.</p>

        <div class="field">
          <label class="field-label">Prénom</label>
          <input class="field-input" id="s-name" type="text" placeholder="Ton prénom" value="${d.name||''}" autocomplete="given-name">
        </div>

        <div class="field-grid">
          <div class="field">
            <label class="field-label">Âge</label>
            <input class="field-input" id="s-age" type="number" placeholder="ans" value="${d.age||''}" min="10" max="99">
          </div>
          <div class="field">
            <label class="field-label">Sexe</label>
            <select class="field-input" id="s-sex">
              <option value="">—</option>
              <option value="H" ${d.sex==='H'?'selected':''}>Homme</option>
              <option value="F" ${d.sex==='F'?'selected':''}>Femme</option>
              <option value="A" ${d.sex==='A'?'selected':''}>Autre</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Taille</label>
            <input class="field-input" id="s-height" type="number" placeholder="cm" value="${d.height||''}" min="100" max="250">
          </div>
          <div class="field">
            <label class="field-label">Poids</label>
            <input class="field-input" id="s-weight" type="number" placeholder="kg" value="${d.weight||''}" min="30" max="200">
          </div>
        </div>

        <div class="field-grid">
          <div class="field">
            <label class="field-label">FC maximale</label>
            <input class="field-input" id="s-hrmax" type="number" placeholder="bpm (si connue)" value="${d.hrMax||''}">
          </div>
          <div class="field">
            <label class="field-label">FC au repos</label>
            <input class="field-input" id="s-hrrest" type="number" placeholder="bpm (si connue)" value="${d.hrRest||''}">
          </div>
        </div>

        <div class="field">
          <label class="field-label">Commentaire libre</label>
          <textarea class="field-input field-textarea" id="s-general-note" placeholder="Infos médicales, particularités...">${d.generalNote||''}</textarea>
        </div>`,

      // ── 2. Historique sportif ─────────────────────────────────────────────
      sport_history: () => `
        <h2 class="setup-title">Ton parcours sportif</h2>
        <p class="setup-sub">Pour adapter la progression à ton niveau réel.</p>

        <div class="field">
          <label class="field-label">Expérience running</label>
          <div class="chips" id="s-exp">
            ${[['beginner','Débutant — moins d\'1 an'],['intermediate','Régulier — 1 à 3 ans'],['advanced','Confirmé — 3 à 7 ans'],['expert','Expert — 7 ans+']].map(([v,l])=>
              `<div class="chip${d.experience===v?' active':''}" onclick="Setup._pick('experience','${v}',this,'s-exp')">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field-grid">
          <div class="field">
            <label class="field-label">Km/semaine actuellement</label>
            <input class="field-input" id="s-weeklykm" type="number" placeholder="km" value="${d.weeklyKm||''}">
          </div>
          <div class="field">
            <label class="field-label">Depuis combien de temps ?</label>
            <input class="field-input" id="s-runningsince" type="text" placeholder="ex : 2 ans" value="${d.runningSince||''}">
          </div>
        </div>

        <div class="field">
          <label class="field-label">Sports pratiqués en parallèle</label>
          <div class="chips" id="s-othersports" style="flex-wrap:wrap;">
            ${[['cycling','Vélo'],['swimming','Natation'],['gym','Musculation'],['yoga','Yoga/Pilates'],['team','Sports collectifs'],['hiking','Randonnée'],['other','Autre'],['none','Aucun']].map(([v,l])=>
              `<div class="chip${(d.otherSports||[]).includes(v)?' active-soft':''}" onclick="Setup._toggle('otherSports','${v}',this)">${l}</div>`
            ).join('')}
          </div>
          <input class="field-input" id="s-othersports-note" style="margin-top:8px;" type="text" placeholder="Fréquence et détails..." value="${d.otherSportsNote||''}">
        </div>

        <div class="field">
          <label class="field-label">Historique de blessures</label>
          <div class="chips" id="s-injuries" style="flex-wrap:wrap;">
            ${[['knees','Genoux'],['ankles','Chevilles'],['calves','Mollets'],['tendons','Tendons/Achille'],['back','Dos/Hanche'],['stress','Fracture de stress'],['other','Autre'],['none','Aucune']].map(([v,l])=>
              `<div class="chip${(d.injuries||[]).includes(v)?' danger':''}" onclick="Setup._toggle('injuries','${v}',this,'danger')">${l}</div>`
            ).join('')}
          </div>
          <textarea class="field-input field-textarea" id="s-injuries-note" style="margin-top:8px;min-height:50px;" placeholder="Détails, zone fragile, blessure en cours...">${d.injuriesNote||''}</textarea>
        </div>`,

      // ── 3. Contraintes ────────────────────────────────────────────────────
      constraints: () => `
        <h2 class="setup-title">Contraintes et contexte</h2>
        <p class="setup-sub">Ton coach adapte le plan à ta vie, pas l'inverse.</p>

        <div class="field">
          <label class="field-label">Situation familiale</label>
          <div class="chips" id="s-family">
            ${[['single','Célibataire / sans enfant'],['kids_young','Enfants jeunes (< 6 ans)'],['kids_school','Enfants scolarisés'],['other','Autre']].map(([v,l])=>
              `<div class="chip${d.family===v?' active-soft':''}" onclick="Setup._pick('family','${v}',this,'s-family')">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Rythme professionnel</label>
          <div class="chips" id="s-workload">
            ${[['light','Léger / flexible'],['normal','Normal (9-18h)'],['heavy','Chargé / voyages fréquents'],['shifts','Horaires décalés / nuit']].map(([v,l])=>
              `<div class="chip${d.workload===v?' active-soft':''}" onclick="Setup._pick('workload','${v}',this,'s-workload')">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Niveau de stress général</label>
          <div class="chips" id="s-stress">
            ${[['low','Bas — je récupère bien'],['medium','Moyen'],['high','Élevé — impact sur la récup']].map(([v,l])=>
              `<div class="chip${d.stress===v?' active-soft':''}" onclick="Setup._pick('stress','${v}',this,'s-stress')">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Note libre (contraintes spécifiques)</label>
          <textarea class="field-input field-textarea" id="s-constraints-note" placeholder="Déplacements pro, gardes alternées, périodes chargées...">${d.constraintsNote||''}</textarea>
        </div>`,

      // ── 4. Objectif principal ─────────────────────────────────────────────
      goal_main: () => `
        <h2 class="setup-title">Quel est ton objectif principal ?</h2>
        <p class="setup-sub">Tout ton plan d'entraînement sera construit autour de ça.</p>

        <div class="field">
          <div class="chips" id="s-goaltype" style="flex-direction:column;gap:10px;">
            ${[
              ['race',    '🏆 Préparer une course', 'Un objectif chronométrique précis : 10 km, semi, marathon, trail...'],
              ['fitness', '💪 Maintenir ma forme', 'Courir régulièrement pour la santé et le bien-être'],
              ['start',   '🌱 Commencer le running', 'Débuter ou reprendre après une longue pause'],
            ].map(([v,title,sub])=>`
              <div class="goal-card${d.goalMain===v?' active':''}" onclick="Setup._pickGoal('${v}')">
                <div style="font-size:16px;font-weight:600;margin-bottom:2px;">${title}</div>
                <div style="font-size:13px;color:var(--text-muted);">${sub}</div>
              </div>`
            ).join('')}
          </div>
        </div>`,

      // ── 4a. Objectif course ───────────────────────────────────────────────
      goal_race: () => `
        <h2 class="setup-title">Ta course cible</h2>
        <p class="setup-sub">Donne-moi tous les détails pour construire le plan parfait.</p>

        <div class="field">
          <label class="field-label">Nom de la course</label>
          <input class="field-input" id="s-racename" type="text" placeholder="ex : Marathon de Paris" value="${d.raceName||''}">
        </div>
        <div class="field-grid">
          <div class="field">
            <label class="field-label">Distance</label>
            <select class="field-input" id="s-racedist">
              <option value="">—</option>
              ${[['5km','5 km'],['10km','10 km'],['half','Semi-marathon'],['marathon','Marathon'],['trail_short','Trail court (< 30 km)'],['trail_long','Trail long (30 km+)'],['other','Autre']].map(([v,l])=>
                `<option value="${v}" ${d.raceDist===v?'selected':''}>${l}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label">Date</label>
            <input class="field-input" id="s-racedate" type="date" value="${d.raceDate||''}">
          </div>
        </div>

        <div class="field">
          <label class="field-label">Objectif de temps</label>
          <div class="chips" id="s-racetarget-type">
            ${[['finish','Finir (pas de chrono)'],['target','Chrono précis'],['range','Fourchette (objectif A / B)']].map(([v,l])=>
              `<div class="chip${d.raceTargetType===v?' active':''}" onclick="Setup._pick('raceTargetType','${v}',this,'s-racetarget-type')">${l}</div>`
            ).join('')}
          </div>
          ${d.raceTargetType && d.raceTargetType !== 'finish' ? `
          <div class="field-grid" style="margin-top:10px;">
            <div class="field">
              <label class="field-label">${d.raceTargetType==='range'?'Objectif A (idéal)':'Chrono cible'}</label>
              <input class="field-input" id="s-racetime-a" type="text" placeholder="ex : 3h45" value="${d.raceTimeA||''}">
            </div>
            ${d.raceTargetType==='range'?`
            <div class="field">
              <label class="field-label">Objectif B (réaliste)</label>
              <input class="field-input" id="s-racetime-b" type="text" placeholder="ex : 4h00" value="${d.raceTimeB||''}">
            </div>`:''}
          </div>` : ''}
        </div>

        <div class="field">
          <label class="field-label">Terrain / profil</label>
          <div class="chips" id="s-raceterrain">
            ${[['flat','Plat'],['rolling','Vallonné'],['hilly','Montagneux'],['unknown','Je ne sais pas encore']].map(([v,l])=>
              `<div class="chip${d.raceTerrain===v?' active-soft':''}" onclick="Setup._pick('raceTerrain','${v}',this,'s-raceterrain')">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Note libre</label>
          <textarea class="field-input field-textarea" id="s-race-note" placeholder="Contexte, ambitions particulières...">${d.raceNote||''}</textarea>
        </div>`,

      // ── 4b. Objectif forme ────────────────────────────────────────────────
      goal_fitness: () => `
        <h2 class="setup-title">Maintenir ta forme</h2>
        <p class="setup-sub">Précise ce que tu recherches pour personnaliser ton suivi.</p>

        <div class="field">
          <label class="field-label">Ce qui compte le plus pour toi</label>
          <div class="chips" id="s-fitfocus" style="flex-direction:column;gap:8px;">
            ${[
              ['health',    '❤️ Santé cardiovasculaire'],
              ['weight',    '⚖️ Gestion du poids'],
              ['perf',      '📈 Progresser en endurance'],
              ['stress',    '🧘 Réduire le stress / se vider la tête'],
              ['social',    '👥 Courir en groupe / aspect social'],
            ].map(([v,l])=>
              `<div class="chip${(d.fitFocus||[]).includes(v)?' active-soft':''}" onclick="Setup._toggle('fitFocus','${v}',this)">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Niveau d'intensité souhaité</label>
          <div class="chips" id="s-fitlevel">
            ${[['easy','Tranquille — je prends mon temps'],['moderate','Modéré — je veux progresser sans me forcer'],['push','Ambitieux — je veux vraiment progresser']].map(([v,l])=>
              `<div class="chip${d.fitLevel===v?' active':''}" onclick="Setup._pick('fitLevel','${v}',this,'s-fitlevel')">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Note libre</label>
          <textarea class="field-input field-textarea" id="s-fitness-note" placeholder="Objectifs sur 6 mois, contexte...">${d.fitnessNote||''}</textarea>
        </div>`,

      // ── 4c. Débuter le running ────────────────────────────────────────────
      goal_start: () => `
        <h2 class="setup-title">Commencer le running</h2>
        <p class="setup-sub">Pas d'inquiétude — on part à ton rythme.</p>

        <div class="field">
          <label class="field-label">Ton profil sportif actuel</label>
          <div class="chips" id="s-startlevel" style="flex-direction:column;gap:8px;">
            ${[
              ['none',     '🛋️ Pas sportif — je pars de zéro'],
              ['active',   '🚶 Actif mais pas de sport régulier'],
              ['fit',      '💪 Sportif dans un autre domaine'],
              ['comeback', '🔄 Je reprends après une blessure ou longue pause'],
            ].map(([v,l])=>
              `<div class="chip${d.startLevel===v?' active':''}" onclick="Setup._pick('startLevel','${v}',this,'s-startlevel')">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Ambition à 6 mois</label>
          <div class="chips" id="s-startambition">
            ${[['30min','Courir 30 min sans s\'arrêter'],['5km','Finir un 5 km'],['10km','Finir un 10 km'],['half','Viser un semi à terme']].map(([v,l])=>
              `<div class="chip${d.startAmbition===v?' active-soft':''}" onclick="Setup._pick('startAmbition','${v}',this,'s-startambition')">${l}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">Note libre</label>
          <textarea class="field-input field-textarea" id="s-start-note" placeholder="Contexte, raison de commencer...">${d.startNote||''}</textarea>
        </div>`,

      // ── 5. Objectif secondaire ────────────────────────────────────────────
      goal_secondary: () => `
        <h2 class="setup-title">Objectif secondaire ?</h2>
        <p class="setup-sub">Une course intermédiaire peut servir de test ou de motivation.</p>

        <div class="chips" id="s-goalsec" style="margin-bottom:16px;">
          <div class="chip${d.goalSecondary==='yes'?' active':''}" onclick="Setup._pick('goalSecondary','yes',this,'s-goalsec')">✅ Oui, j'ai une course intermédiaire</div>
          <div class="chip${d.goalSecondary==='no'?' active':''}" onclick="Setup._pick('goalSecondary','no',this,'s-goalsec')">Non, pas pour l'instant</div>
        </div>`,

      // ── 5b. Course secondaire ─────────────────────────────────────────────
      goal_race_2: () => `
        <h2 class="setup-title">Ta course secondaire</h2>
        <p class="setup-sub">Elle servira de jalon dans ton plan.</p>

        <div class="field">
          <label class="field-label">Nom</label>
          <input class="field-input" id="s-race2name" type="text" placeholder="ex : Semi de Boulogne" value="${d.race2Name||''}">
        </div>
        <div class="field-grid">
          <div class="field">
            <label class="field-label">Distance</label>
            <select class="field-input" id="s-race2dist">
              <option value="">—</option>
              ${[['5km','5 km'],['10km','10 km'],['half','Semi-marathon'],['marathon','Marathon'],['trail_short','Trail court'],['other','Autre']].map(([v,l])=>
                `<option value="${v}" ${d.race2Dist===v?'selected':''}>${l}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label">Date</label>
            <input class="field-input" id="s-race2date" type="date" value="${d.race2Date||''}">
          </div>
        </div>
        <div class="field">
          <label class="field-label">Objectif</label>
          <input class="field-input" id="s-race2time" type="text" placeholder="Chrono cible ou 'Finir'" value="${d.race2Time||''}">
        </div>`,

      // ── 6. Planning hebdomadaire ──────────────────────────────────────────
      schedule: () => `
        <h2 class="setup-title">Ta semaine type</h2>
        <p class="setup-sub">Coche les jours disponibles et le type de séance idéal pour chacun.</p>

        <div id="schedule-builder">
          ${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(day => {
            const current = (d.schedule||{})[day];
            return `
            <div class="schedule-day-item${current ? ' active' : ''}" id="sched-${day}">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:${current?'8px':'0'};">
                <div class="day-toggle" onclick="Setup._toggleDay('${day}')" style="width:44px;height:26px;border-radius:13px;background:${current?'var(--orange)':'var(--bg3)'};cursor:pointer;position:relative;transition:background 0.2s;flex-shrink:0;">
                  <div style="width:20px;height:20px;border-radius:50%;background:white;position:absolute;top:3px;${current?'right:3px':'left:3px'};transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
                </div>
                <span style="font-size:15px;font-weight:${current?'600':'400'};color:${current?'var(--text)':'var(--text-muted)'};">${day}</span>
              </div>
              ${current ? `
              <div class="chips" style="padding-left:54px;">
                ${[['ef','🏃 Endurance fondamentale'],['sl','🔁 Sortie longue'],['work','⚡ Fractionné / VMA'],['free','🎯 Au choix du coach']].map(([v,l])=>
                  `<div class="chip${current===v?' active':''}" onclick="Setup._setDay('${day}','${v}',this)">${l}</div>`
                ).join('')}
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>`,

      // ── 7. Records personnels ─────────────────────────────────────────────
      prs: () => `
        <h2 class="setup-title">Tes références de niveau</h2>
        <p class="setup-sub">Permet au coach de calibrer tes allures d'entraînement précisément. Laisse vide si tu n'as pas la distance.</p>

        ${[
          ['10km','10 km','s-pr10','s-pr10date'],
          ['half','Semi-marathon','s-prhalf','s-prhalfdate'],
          ['marathon','Marathon','s-prmarathon','s-prmarathondate'],
        ].map(([key,label,id,dateid])=>`
        <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:10px;align-items:end;margin-bottom:14px;">
          <div style="font-size:14px;font-weight:600;width:70px;padding-bottom:12px;">${label}</div>
          <div class="field" style="margin:0;">
            <label class="field-label">Chrono</label>
            <input class="field-input" id="${id}" type="text" placeholder="${key==='10km'?'ex : 48:30':key==='half'?'ex : 1h52':'ex : 3h55'}" value="${d['pr_'+key]||''}">
          </div>
          <div class="field" style="margin:0;">
            <label class="field-label">Date</label>
            <input class="field-input" id="${dateid}" type="date" value="${d['prdate_'+key]||''}">
          </div>
        </div>`).join('')}

        <div class="field" style="margin-top:8px;">
          <label class="field-label">VMA estimée (si tu la connais)</label>
          <input class="field-input" id="s-vma" type="number" placeholder="km/h" value="${d.vma||''}" step="0.1">
        </div>
        <div class="field">
          <label class="field-label">Allure EF actuelle (endurance fondamentale)</label>
          <input class="field-input" id="s-efpace" type="text" placeholder="ex : 6:10 min/km" value="${d.efPace||''}">
        </div>`,

      // ── 8. Preparation du plan ───────────────────────────────────────────
      plan_prep: function() {
        const goalSummary = Setup._buildGoalSummary();
        const levelSummary = Setup._buildLevelSummary();
        const runTestYes = Setup.data.runTest === 'yes';
        const runTestNo  = Setup.data.runTest === 'no';
        return '<h2 class="setup-title">Preparation de ton plan</h2>'
          + '<p class="setup-sub">Voici ce que ton coach a retenu.</p>'
          + '<div class="card" style="margin-bottom:14px;">'
          +   '<div class="card-label">Profil detecte</div>'
          +   '<div style="font-size:14px;color:var(--text-muted);line-height:1.7;">' + goalSummary + '</div>'
          + '</div>'
          + '<div class="card" style="margin-bottom:14px;">'
          +   '<div class="card-label">Niveau estime</div>'
          +   '<div style="font-size:14px;color:var(--text-muted);line-height:1.7;">' + levelSummary + '</div>'
          + '</div>'
          + '<div class="card" style="border:1.5px solid var(--orange-mid);background:var(--orange-light);margin-bottom:14px;">'
          +   '<div class="card-label" style="color:var(--orange);">Run test recommande</div>'
          +   '<div style="font-size:14px;color:var(--text);line-height:1.6;margin-bottom:12px;">'
          +     'Un <strong>test de 20 minutes</strong> permettra de calibrer precisement tes allures sans formules theoriques.'
          +     '<div style="margin-top:10px;padding:10px;background:var(--bg);border-radius:var(--radius);font-size:13px;">'
          +       '<div style="font-weight:600;margin-bottom:6px;">Protocole :</div>'
          +       '<div>🟡 15 min echauffement progressif</div>'
          +       '<div>🔴 20 min effort maximal regulier et constant</div>'
          +       '<div>🟢 10 min retour au calme</div>'
          +       '<div style="margin-top:6px;color:var(--text-muted);font-size:12px;">Lance Strava pendant toute la seance.</div>'
          +     '</div>'
          +   '</div>'
          +   '<div class="chips" id="s-runtest">'
          +     '<div class="chip' + (runTestYes ? ' active' : '') + '" data-val="yes" onclick="Setup.pickRunTest(this.dataset.val)">✅ Oui, run test</div>'
          +     '<div class="chip' + (runTestNo  ? ' active' : '') + '" data-val="no"  onclick="Setup.pickRunTest(this.dataset.val)">⏭️ Non, plan direct</div>'
          +   '</div>'
          + '</div>'
          + '<div class="card" style="margin-bottom:0;">'
          +   '<div class="card-label">Question a ton coach</div>'
          +   '<div id="prep-chat-msgs" style="min-height:50px;max-height:180px;overflow-y:auto;margin-bottom:10px;">'
          +     '<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:10px 0;">Pose une question avant de commencer...</div>'
          +   '</div>'
          +   '<div style="display:flex;gap:8px;">'
          +     '<input type="text" id="prep-chat-input" class="field-input" placeholder="Question pour le coach..." style="flex:1;padding:10px 12px;" onkeydown="if(event.keyCode===13)Setup._sendPrepChat()">'
          +     '<button class="chat-send" onclick="Setup._sendPrepChat()" style="flex-shrink:0;">'
          +       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
          +     '</button>'
          +   '</div>'
          + '</div>';
      },

      // ── 9. Strava ─────────────────────────────────────────────────────────
      strava: () => `
        <h2 class="setup-title">Connecter Strava</h2>
        <p class="setup-sub">Pour importer tes courses et que ton coach puisse analyser tes données réelles.</p>

        ${Strava.isConnected() ? `
          <div class="strava-connected-bar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <div><strong>Strava connecté ✓</strong><br><span>Tes courses seront synchronisées automatiquement.</span></div>
          </div>
          <p style="font-size:14px;color:var(--text-muted);margin-top:12px;text-align:center;">Tu peux terminer la configuration.</p>
        ` : `
          <div style="text-align:center;padding:20px 0;">
            <button class="btn-strava" style="margin:0 auto 16px;" onclick="Setup._saveAndConnectStrava()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
              Se connecter avec Strava
            </button>
            <p style="font-size:13px;color:var(--text-hint);">Tu pourras le faire plus tard dans les paramètres.</p>
          </div>
        `}`,
    };

    return (steps[id] || (() => `<p>Étape inconnue : ${id}</p>`))();
  },

  // ── Navigation ──────────────────────────────────────────────────────────────
  next() {
    if (!this._saveCurrentStep()) return;
    const currentStepId = this.steps[this.stepIndex];
    this._buildSteps(); // recalcule les étapes selon les données actuelles
    // Retrouve l'index de l'étape courante dans la nouvelle liste
    const newIdx = this.steps.indexOf(currentStepId);
    const baseIdx = newIdx >= 0 ? newIdx : this.stepIndex;
    if (baseIdx < this.steps.length - 1) {
      this.stepIndex = baseIdx + 1;
      this._render();
    } else {
      this._finish();
    }
  },

  prev() {
    this._saveCurrentStep(true);
    if (this.stepIndex > 0) {
      this.stepIndex--;
      this._render();
    }
  },

  // ── Sauvegarde de l'étape courante ──────────────────────────────────────────
  _saveCurrentStep(silent = false) {
    const id = this.steps[this.stepIndex];
    const g  = (sel) => { const el = document.getElementById(sel); return el ? el.value.trim() : ''; };

    const saves = {
      general:      () => { this.data.name=g('s-name'); this.data.age=g('s-age'); this.data.sex=g('s-sex'); this.data.height=g('s-height'); this.data.weight=g('s-weight'); this.data.hrMax=g('s-hrmax'); this.data.hrRest=g('s-hrrest'); this.data.generalNote=g('s-general-note'); },
      sport_history:() => { this.data.weeklyKm=g('s-weeklykm'); this.data.runningSince=g('s-runningsince'); this.data.otherSportsNote=g('s-othersports-note'); this.data.injuriesNote=g('s-injuries-note'); },
      constraints:  () => { this.data.constraintsNote=g('s-constraints-note'); },
      goal_main:    () => {},
      goal_race:    () => {
        this.data.raceName=g('s-racename'); this.data.raceDist=g('s-racedist'); this.data.raceDate=g('s-racedate');
        this.data.raceTimeA=g('s-racetime-a'); this.data.raceTimeB=g('s-racetime-b'); this.data.raceNote=g('s-race-note');
        const rtEl = document.getElementById('s-racetime-a'); // raceTargetType déjà stocké via _pick
      },
      goal_fitness: () => { this.data.fitnessNote=g('s-fitness-note'); /* fitLevel stocké via _pick */ },
      goal_start:   () => { this.data.startNote=g('s-start-note'); /* startLevel/startAmbition stockés via _pick */ },
      goal_secondary:() => { if (!this.data.goalSecondary) this.data.goalSecondary = 'no'; },
      goal_race_2:  () => { this.data.race2Name=g('s-race2name'); this.data.race2Dist=g('s-race2dist'); this.data.race2Date=g('s-race2date'); this.data.race2Time=g('s-race2time'); },
      schedule:     () => {},
      prs:          () => { this.data.pr_10km=g('s-pr10'); this.data.prdate_10km=g('s-pr10date'); this.data.pr_half=g('s-prhalf'); this.data.prdate_half=g('s-prhalfdate'); this.data.pr_marathon=g('s-prmarathon'); this.data.prdate_marathon=g('s-prmarathondate'); this.data.vma=g('s-vma'); this.data.efPace=g('s-efpace'); },
      plan_prep:    () => { this.data.runTest = this.data.runTest || null; },
      strava:       () => {},
    };

    if (saves[id]) saves[id]();

    // Validation obligatoire
    if (!silent) {
      if (id === 'general' && !this.data.name) { UI.toast('Indique ton prénom pour continuer'); return false; }
      if (id === 'goal_main' && !this.data.goalMain) { UI.toast('Choisis un objectif principal'); return false; }
      if (id === 'schedule' && !Object.keys(this.data.schedule||{}).length) { UI.toast('Sélectionne au moins un jour d\'entraînement'); return false; }
    }
    return true;
  },

  // ── Finalisation ────────────────────────────────────────────────────────────
  _finish() {
    this._saveCurrentStep(true);
    const d = this.data;

    const profile = {
      name:          d.name || 'Athlète',
      age:           d.age,
      sex:           d.sex,
      height:        d.height,
      weight:        d.weight,
      hrMax:         d.hrMax,
      hrRest:        d.hrRest,
      generalNote:   d.generalNote,
      experience:    d.experience,
      weeklyKm:      d.weeklyKm,
      runningSince:  d.runningSince,
      otherSports:   d.otherSports,
      otherSportsNote: d.otherSportsNote,
      injuries:      d.injuries,
      injuriesNote:  d.injuriesNote,
      family:        d.family,
      workload:      d.workload,
      stress:        d.stress,
      constraintsNote: d.constraintsNote,
      goalMain:      d.goalMain,
      // Objectif course
      goal: d.goalMain === 'race' ? {
        name:        d.raceName,
        dist:        d.raceDist,
        date:        d.raceDate,
        targetType:  d.raceTargetType,
        targetA:     d.raceTimeA,
        targetB:     d.raceTimeB,
        terrain:     d.raceTerrain,
        note:        d.raceNote,
      } : null,
      // Objectif forme / débutant
      fitFocus:      d.fitFocus,
      fitLevel:      d.fitLevel,
      fitnessNote:   d.fitnessNote,
      startLevel:    d.startLevel,
      startAmbition: d.startAmbition,
      startNote:     d.startNote,
      // Course secondaire
      goal2: d.goalSecondary === 'yes' ? {
        name: d.race2Name, dist: d.race2Dist, date: d.race2Date, target: d.race2Time
      } : null,
      // Planning
      schedule:      d.schedule || {},
      trainingDays:  Object.keys(d.schedule || {}),
      sessionsPerWeek: Object.keys(d.schedule || {}).length,
      slDay:         Object.entries(d.schedule||{}).find(([,v])=>v==='sl')?.[0] || '',
      // Records
      prs: { km10: d.pr_10km, half: d.pr_half, marathon: d.pr_marathon },
      prdates: { km10: d.prdate_10km, half: d.prdate_half, marathon: d.prdate_marathon },
      vma:     d.vma,
      efPace:  d.efPace,
      runTest: d.runTest || 'no',
      createdAt: Date.now(),
    };

    Storage.saveProfile(profile);
    UI.toast('Profil sauvegardé ✓');
    App.showMainApp().then(function() {
      // Génère le plan automatiquement après le wizard
      setTimeout(function() { App.generatePlan(); }, 800);
    });
  },

  // ── Helpers UI ──────────────────────────────────────────────────────────────
  _pick(key, val, el, groupId) {
    // Si le chip est déjà actif et qu'on reclique : on le garde actif (pas de toggle off)
    // sauf si c'est un multi-select (pas de groupId)
    if (groupId) {
      document.querySelectorAll('#' + groupId + ' .chip').forEach(function(c) {
        c.classList.remove('active', 'active-soft');
      });
      el.classList.add('active');
      Setup.data[key] = val;
    } else {
      el.classList.toggle('active');
      Setup.data[key] = Setup.data[key] === val ? null : val;
    }
  },

  _pickGoal(val) {
    // Sauvegarde le choix
    this.data.goalMain = val;
    // Highlight visuel immédiat
    document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('active'));
    var card = document.querySelector('.goal-card[onclick*="' + val + '"]');
    if (card) card.classList.add('active');
    // Avance automatiquement vers l'étape détail après un court délai (feedback visuel)
    setTimeout(function() { Setup.next(); }, 250);
  },

  pickRunTest(val) {
    this.data.runTest = val;
    document.querySelectorAll('#s-runtest .chip').forEach(function(c) { c.classList.remove('active'); });
    var chips = document.querySelectorAll('#s-runtest .chip');
    chips.forEach(function(c) { if (c.dataset.val === val) c.classList.add('active'); });
  },

  _toggle(key, val, el, activeClass = 'active-soft') {
    if (!this.data[key]) this.data[key] = [];
    const idx = this.data[key].indexOf(val);
    if (idx > -1) {
      this.data[key].splice(idx, 1);
      el.classList.remove(activeClass, 'active', 'danger');
    } else {
      this.data[key].push(val);
      el.classList.add(activeClass);
    }
  },

  _toggleDay(day) {
    if (!this.data.schedule) this.data.schedule = {};
    if (this.data.schedule[day]) {
      delete this.data.schedule[day];
    } else {
      this.data.schedule[day] = 'free'; // défaut : au choix
    }
    this._render();
    this.stepIndex = this.steps.indexOf('schedule');
  },

  _setDay(day, type, el) {
    if (!this.data.schedule) this.data.schedule = {};
    this.data.schedule[day] = type;
    const container = el.closest('.chips');
    if (container) container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  },

  _saveAndConnectStrava() {
    this._saveCurrentStep(true);
    this._finish();
    setTimeout(() => Strava.authorize(), 300);
  },


  // ── Résumé objectif pour la page plan_prep ─────────────────────────────────
  _buildGoalSummary() {
    const d = this.data;
    const lines = [];

    if (d.goalMain === 'race' && d.raceName) {
      lines.push('🏆 Objectif : ' + d.raceName + (d.raceDist ? ' (' + d.raceDist + ')' : '') + (d.raceDate ? ' le ' + d.raceDate : ''));
      if (d.raceTimeA) lines.push('⏱️ Chrono visé : ' + d.raceTimeA + (d.raceTimeB ? ' (objectif B : ' + d.raceTimeB + ')' : ''));
    } else if (d.goalMain === 'fitness') {
      lines.push('💪 Objectif : Maintien de forme');
      if (d.fitFocus && d.fitFocus.length) lines.push('Focus : ' + d.fitFocus.join(', '));
    } else if (d.goalMain === 'start') {
      lines.push('🌱 Objectif : Commencer le running');
      if (d.startAmbition) lines.push('Ambition : ' + d.startAmbition);
    }

    if (d.experience) lines.push('📊 Expérience : ' + d.experience);
    if (d.weeklyKm)   lines.push('📍 Volume actuel : ' + d.weeklyKm + ' km/semaine');
    if (d.injuries && d.injuries.length && !d.injuries.includes('none')) {
      lines.push('⚠️ Fragilités : ' + d.injuries.join(', '));
    }

    const days = Object.keys(d.schedule || {});
    if (days.length) lines.push('📅 Jours : ' + days.join(', ') + ' (' + days.length + ' seances/sem)');

    return lines.join('<br>') || 'Profil en cours de construction…';
  },

  // ── Estimation du niveau basée sur les records et données Strava ────────────
  _buildLevelSummary() {
    const d = this.data;
    const activities = Storage.getActivities();
    const lines = [];

    // Depuis les records
    if (d.pr_10km) {
      const parts = d.pr_10km.split(':');
      const mins = parts.length === 2 ? parseInt(parts[0]) + parseInt(parts[1])/60 : null;
      if (mins) {
        if (mins < 35)      lines.push('🏅 10 km : ' + d.pr_10km + ' → niveau compétitif');
        else if (mins < 42) lines.push('🏅 10 km : ' + d.pr_10km + ' → niveau confirmé');
        else if (mins < 50) lines.push('🏅 10 km : ' + d.pr_10km + ' → niveau intermédiaire');
        else                lines.push('🏅 10 km : ' + d.pr_10km + ' → niveau débutant/intermédiaire');
      }
    }
    if (d.pr_half) lines.push('🏅 Semi : ' + d.pr_half);
    if (d.pr_marathon) lines.push('🏅 Marathon : ' + d.pr_marathon);

    // Depuis les données Strava récentes
    if (activities.length >= 3) {
      const recent = activities.slice(0, 5);
      const avgPace = recent.reduce(function(s, a) { return s + (a.average_speed || 0); }, 0) / recent.length;
      const avgHR   = recent.filter(function(a) { return a.average_heartrate; })
                           .reduce(function(s, a) { return s + a.average_heartrate; }, 0);
      const hrCount = recent.filter(function(a) { return a.average_heartrate; }).length;

      if (avgPace > 0) {
        const paceStr = Strava.formatPace(avgPace);
        lines.push('📈 Allure moyenne Strava (5 dernières courses) : ' + paceStr + '/km');
      }
      if (hrCount > 0) {
        lines.push('❤️ FC moyenne : ' + Math.round(avgHR / hrCount) + ' bpm');
      }
    } else if (activities.length > 0) {
      lines.push('📊 ' + activities.length + ' course(s) Strava analysée(s)');
    } else {
      lines.push('📊 Aucune course Strava — le run test sera essentiel pour calibrer tes allures');
    }

    if (!lines.length) lines.push('Données insuffisantes — le run test permettra de tout calibrer précisément.');

    return lines.join('<br>');
  },

  // ── Chat préparatoire dans le wizard ───────────────────────────────────────
  async _sendPrepChat() {
    const input = document.getElementById('prep-chat-input');
    if (!input || !input.value.trim()) return;
    const msg = input.value.trim();
    input.value = '';

    const container = document.getElementById('prep-chat-msgs');
    if (!container) return;

    // Affiche le message utilisateur
    container.innerHTML += '<div style="text-align:right;margin-bottom:6px;"><span style="background:var(--orange);color:white;padding:6px 12px;border-radius:16px;font-size:13px;display:inline-block;">' + msg + '</span></div>';
    container.innerHTML += '<div id="prep-typing" style="font-size:13px;color:var(--text-hint);padding:4px 0;">Coach en train d\'ecrire...</div>';
    container.scrollTop = container.scrollHeight;

    // Sauvegarde le profil courant pour que le coach en dispose
    this._saveCurrentStep(true);

    // Envoie au coach avec contexte du profil
    try {
      const profile = Storage.getProfile();
      const context = profile ? Coach.buildContext(profile) : '';
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: Coach.SYSTEM_PROMPT + (context ? '\n\n' + context : ''),
          messages: [{ role: 'user', content: msg }]
        })
      });
      const data = await res.json();
      const reply = data.content && data.content[0] ? data.content[0].text : 'Indisponible pour le moment.';

      document.getElementById('prep-typing').remove();
      container.innerHTML += '<div style="margin-bottom:8px;"><span style="background:var(--bg2);border:0.5px solid var(--border);color:var(--text);padding:8px 12px;border-radius:16px;border-bottom-left-radius:4px;font-size:13px;display:inline-block;line-height:1.5;">' + reply.split('\n').join('<br>') + '</span></div>';
      container.scrollTop = container.scrollHeight;
    } catch(e) {
      document.getElementById('prep-typing').remove();
      container.innerHTML += '<div style="font-size:13px;color:var(--red);">Erreur de connexion au coach.</div>';
    }
  },

  // ── Sauvegarde de l'étape plan_prep ────────────────────────────────────────
  _savePlanPrep() {
    // runTest déjà stocké via _pick
  },

  // ── Convertit un profil existant en données de wizard ──────────────────────
  _profileToData(p) {
    return {
      name:          p.name,
      age:           p.age,
      sex:           p.sex,
      height:        p.height,
      weight:        p.weight,
      hrMax:         p.hrMax || p.fcMax,
      hrRest:        p.hrRest || p.fcRest,
      generalNote:   p.generalNote,
      experience:    p.experience,
      weeklyKm:      p.weeklyKm,
      runningSince:  p.runningSince,
      otherSports:   p.otherSports || [],
      otherSportsNote: p.otherSportsNote,
      injuries:      p.injuries || [],
      injuriesNote:  p.injuriesNote,
      family:        p.family,
      workload:      p.workload,
      stress:        p.stress,
      constraintsNote: p.constraintsNote,
      goalMain:      p.goalMain || (p.goal ? 'race' : 'fitness'),
      raceName:      p.goal?.name,
      raceDist:      p.goal?.dist,
      raceDate:      p.goal?.date,
      raceTargetType: p.goal?.targetType || (p.goal?.target ? 'target' : null),
      raceTimeA:     p.goal?.targetA || p.goal?.target,
      raceTimeB:     p.goal?.targetB,
      raceTerrain:   p.goal?.terrain,
      raceNote:      p.goal?.note,
      fitFocus:      p.fitFocus || [],
      fitLevel:      p.fitLevel,
      startLevel:    p.startLevel,
      startAmbition: p.startAmbition,
      goalSecondary: p.goal2 ? 'yes' : 'no',
      race2Name:     p.goal2?.name,
      race2Dist:     p.goal2?.dist,
      race2Date:     p.goal2?.date,
      race2Time:     p.goal2?.target,
      schedule:      p.schedule || {},
      pr_10km:       p.prs?.km10,
      pr_half:       p.prs?.half || p.prs?.semi,
      pr_marathon:   p.prs?.marathon,
      prdate_10km:   p.prdates?.km10,
      prdate_half:   p.prdates?.half,
      prdate_marathon: p.prdates?.marathon,
      vma:           p.vma,
      efPace:        p.efPace,
    };
  }
};
