// coach.js — Appels à Gemini via le backend
const Coach = {
  SYSTEM_PROMPT: `Tu es mon coach running personnel. Tu tutoies l'athlète et tu t'appelles "Coach".

Ton objectif n'est pas seulement de donner des séances : tu construis un suivi individualisé basé sur les données réelles, les sensations, la récupération et le contexte de vie.

PHILOSOPHIE DE COACHING :
- Analyser les données avant de tirer des conclusions — la qualité de la data est reine
- Adapter le plan en fonction de la fatigue réelle, pas d'un calendrier rigide
- Tenir compte du contexte complet : météo, voyage, chaleur, sommeil, vie familiale, travail, stress
- Privilégier la progression long terme et la prévention des blessures
- Ne jamais surévaluer le niveau, ne jamais promettre des performances irréalistes
- Challenger l'athlète si ce qu'il dit n'a pas de sens, en lui expliquant pourquoi
- Toujours justifier pourquoi une séance est proposée et ce qu'elle travaille

ANALYSE DE SÉANCE — croiser systématiquement :
- Données objectives : allure, FC (moy/max/dérive cardio), splits km par km, dénivelé, cadence, zones FC
- Contexte terrain : montée, descente, trail, bord de mer, forêt, chaleur (une allure lente en côte ou chaleur peut être excellente)
- Ressentis subjectifs : effort global, cardio ressenti, jambes, mental, douleurs, sommeil, fatigue, météo
- Charge récente : km des 7 derniers jours, jours de repos, séances précédentes
- Écart prévu/réalisé : comparer avec la séance planifiée

GESTION DE LA FATIGUE — surveiller et agir si :
- Dérive cardio inhabituellement élevée
- Jambes lourdes répétées sur plusieurs séances
- Douleurs récurrentes (orienter vers médecin/kiné si persistant)
- Baisse de motivation, sommeil dégradé
→ Alléger, remplacer par un footing, ajouter du repos. La progression passe avant la charge.

FORMAT DE RÉPONSE après une analyse de séance :
1. 📊 Ce que disent les données (objectif + contexte terrain/météo)
2. ✅ Points positifs
3. ⚠️ Points d'attention
4. 🎯 Décision d'entraînement + prochaine séance détaillée

RÈGLES DE FORME :
- Réponds TOUJOURS en français
- Sois concis sur mobile (4-6 phrases max pour les messages conversationnels)
- Ne commence JAMAIS par une salutation ("Salut", "Bonjour", "Hey"...)
- Pas de formule de politesse en début ou fin de message
- Base-toi sur les données fournies, demande des précisions si les données semblent incohérentes

═══════════════════════════════════════════
RÈGLES TECHNIQUES POUR LE PLAN D'ENTRAÎNEMENT
═══════════════════════════════════════════

Quand tu proposes ou modifies un plan, TOUJOURS inclure le JSON complet à la fin de la réponse.
Format strict — sans markdown, sans backticks, juste le JSON brut.
Générer TOUJOURS exactement 2 semaines.
Types valides : ef | work | tempo | sl | recup
N'inclure QUE les jours d'entraînement, JAMAIS les jours de repos.

FORMAT du champ "detail" — deux règles strictes :

1. Séances INTENSES (work/VMA, seuil, tempo, fractionné) → 3 phases séparées par · :
   "échauffement · travail principal · retour au calme"
   Exemples :
   - VMA   : "15' échauffement allure 5:50/km · 6×400m allure 4:30/km rec 1'30 trot · 10' retour au calme"
   - Seuil : "15' échauffement · 3×8' allure 4:45/km rec 2' · 10' retour au calme"
   - Tempo : "15' échauffement · 20' allure 4:55-5:05/km · 10' retour au calme"

2. Séances FACILES (ef, sl, recup) → UNE seule ligne, SANS · SANS "échauffement" SANS "retour au calme" :
   - EF    : "10 km allure 5:50-6:10/km FC<75%, effort conversationnel"
   - SL    : "18 km allure 5:40-6:00/km, légère progression sur les 5 derniers km"
   - Récup : "6 km très facile allure 6:10-6:30/km, jambes libres"

INTERDIT : utiliser "puis" ou des virgules comme séparateur de phases — seul · est autorisé entre les phases intenses.`,

  // Envoie un message — ne sauvegarde PAS l'historique ici (géré dans app.js)
  async sendMessage(userMessage, systemOverride) {
    const profile    = Storage.getProfile();
    const contextStr = this.buildContext(profile);
    const history    = Storage.getChatHistory();

    const messages = [
      ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage }
    ];

    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: (systemOverride || this.SYSTEM_PROMPT) + '\n\n' + contextStr,
          messages
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data  = await res.json();
      const reply = data.content?.[0]?.text || 'Erreur de réponse.';

      // Détecte si la réponse contient un plan JSON et le sauvegarde automatiquement
      this.tryExtractAndSavePlan(reply);

      return reply;
    } catch(e) {
      console.error('Coach sendMessage error', e);
      return 'Je ne suis pas disponible pour le moment. Vérifie ta connexion et réessaie.';
    }
  },

  // Extrait un plan JSON de la réponse du coach et le sauvegarde si valide
  tryExtractAndSavePlan(text) {
    try {
      const start = text.indexOf('{"weeks"');
      if (start === -1) return;
      const end = text.lastIndexOf('}');
      if (end === -1) return;

      const jsonStr = text.slice(start, end + 1);
      const plan    = JSON.parse(jsonStr);

      if (!plan.weeks || !Array.isArray(plan.weeks) || plan.weeks.length === 0) return;

      // Valide la structure minimale
      const hasValidDays = plan.weeks.every(w =>
        Array.isArray(w.days) && w.days.length > 0 &&
        w.days.every(d => d.day && d.type && d.label)
      );
      if (!hasValidDays) return;

      // Filtre les repos et sauvegarde
      plan.weeks = plan.weeks.map(w => ({
        ...w,
        days: w.days.filter(d => d.type !== 'rest' && d.type !== 'recup')
      }));

      Storage.savePlan(plan);
      console.log('[Coach] ✅ Plan extrait et sauvegardé automatiquement');

      // Notifie l'app pour rafraîchir les onglets accueil et plan
      if (typeof App !== 'undefined') {
        setTimeout(() => {
          if (App.currentTab === 'home') UI.renderHome(Storage.getProfile(), App.activities, plan);
          if (App.currentTab === 'plan') UI.renderPlanTab(plan, false);
          UI.toast('Plan mis à jour ✓');
        }, 500);
      }
    } catch(e) {
      // Pas de plan dans la réponse — normal
    }
  },

  // Génère un plan — retourne le texte brut JSON
  async generatePlan() {
    const profile    = Storage.getProfile();
    const activities = Storage.getActivities().slice(0, 10);
    const prompt     = this.buildPlanPrompt(profile, activities);

    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: 'Tu es un générateur de plans running. Tu réponds UNIQUEMENT avec du JSON valide, aucun texte avant ou après, aucun bloc markdown, aucun caractère en dehors du JSON.',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) { console.error('generatePlan HTTP:', res.status); return null; }
      const data = await res.json();
      const text = data.content?.[0]?.text || null;
      console.log('[generatePlan] Brut:', text?.slice(0, 200));
      return text;
    } catch(e) {
      console.error('generatePlan exception:', e);
      return null;
    }
  },

  async analyzeActivity(activity, feedback) {
    const profile    = Storage.getProfile();
    const allActs    = Storage.getActivities();
    const actDate    = new Date(activity.start_date_local);

    // Données riches Strava (splits, zones FC, streams…)
    let richContext = '';
    try {
      const detail = await Strava.fetchActivityDetail(activity.id);
      if (detail) richContext = Strava.buildCoachContext(detail);
    } catch(e) {
      console.warn('Détail non disponible, utilise données basiques');
    }
    if (!richContext) {
      richContext = `DONNÉES DE LA COURSE :
- Date : ${Strava.formatDate(activity.start_date_local)}
- Distance : ${Strava.formatDistance(activity.distance)} km
- Durée : ${Strava.formatDuration(activity.moving_time)}
- Allure moy : ${Strava.formatPace(activity.average_speed)}/km
- FC moy/max : ${activity.average_heartrate ? Math.round(activity.average_heartrate) : 'N/A'} / ${activity.max_heartrate || 'N/A'} bpm
- Dénivelé : +${Math.round(activity.total_elevation_gain || 0)}m
- Cadence : ${activity.average_cadence ? Math.round(activity.average_cadence * 2) + ' spm' : 'N/A'}
- Calories : ${activity.calories || 'N/A'} kcal
- Suffer score : ${activity.suffer_score || 'N/A'}`;
    }

    // Séance prévue ce jour (si le plan existe)
    let plannedStr = '';
    const plan = Storage.getPlan();
    if (plan && plan.weeks) {
      const dayNames = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
      const dayKey   = dayNames[actDate.getDay()];
      plan.weeks.forEach(function(w) {
        (w.days || []).forEach(function(d) {
          if (d.day === dayKey && !plannedStr) {
            plannedStr = '\nSÉANCE PRÉVUE CE JOUR : ' + d.label + (d.detail ? ' — ' + d.detail : '');
          }
        });
      });
    }

    // Contexte de charge récente (3 dernières courses avant celle-ci)
    const prevActs = allActs.filter(a => a.id !== activity.id && new Date(a.start_date_local) < actDate).slice(0, 3);
    let chargeStr = '';
    if (prevActs.length > 0) {
      // Jours depuis la dernière sortie
      const daysSinceLast = Math.round((actDate - new Date(prevActs[0].start_date_local)) / 86400000);
      chargeStr = '\nCHARGE RÉCENTE (avant cette séance) :'
        + '\n- Repos depuis dernière course : ' + daysSinceLast + ' jour(s)'
        + '\n- 3 dernières sorties :';
      prevActs.forEach(function(a) {
        const fb = Storage.getFeedback(a.id);
        chargeStr += '\n  · ' + Strava.formatDate(a.start_date_local)
          + ' : ' + Strava.formatDistance(a.distance) + 'km '
          + Strava.formatPace(a.average_speed) + '/km'
          + (a.average_heartrate ? ' FC' + Math.round(a.average_heartrate) + 'bpm' : '')
          + (fb ? ' [ressenti ' + (fb.effort||'?') + '/5]' : '');
      });
      // Km des 7 derniers jours
      const weekKm = allActs
        .filter(a => (actDate - new Date(a.start_date_local)) < 7 * 86400000)
        .reduce(function(s, a) { return s + (a.distance || 0); }, 0) / 1000;
      chargeStr += '\n- Km sur les 7 derniers jours (incluant cette séance) : ' + weekKm.toFixed(1) + ' km';
    }

    const feedbackStr = `
RESSENTIS ATHLÈTE :
- Effort global : ${feedback.effort}/5 (1=très dur, 5=parfait)
- Cardio : ${feedback.cardio || 'non renseigné'}
- Jambes : ${feedback.legs || 'non renseigné'}
- Mental : ${feedback.mental || 'non renseigné'}
- Douleurs : ${(feedback.painAreas||[]).join(', ') || 'Aucune'}${feedback.painDetail ? ' — '+feedback.painDetail : ''}
- Sommeil avant : ${feedback.sleep || 'non renseigné'}
- Fatigue avant course : ${feedback.fatigue}/5
- Météo : ${feedback.weather || 'non renseigné'}
- Commentaire libre : ${feedback.comment || '-'}`;

    const prompt = `${richContext}${plannedStr}${chargeStr}${feedbackStr}

Analyse cette séance en croisant toutes les données objectives (allure, FC split par split, zones, dénivelé, suffer score) avec les ressentis subjectifs et le contexte de charge récente.

Structure ta réponse en 3 points concis :
1. 📊 Ce que disent les données (performance, FC, cohérence allure/effort)
2. ⚠️ Points d'attention (signes de fatigue, douleurs, écarts vs prévu)
3. 🎯 Recommandation pour la prochaine séance`;

    return this.sendMessage(prompt);
  },

  buildContext(profile) {
    if (!profile) return '';
    const p    = profile;
    const prs  = p.prs || {};
    const sched = p.schedule || {};
    const now  = new Date();

    const lines = [
      '=== CONTEXTE ATHLÈTE ===',
      '',
      'PROFIL :',
      'Nom: ' + (p.name||'NC') + ' | Age: ' + (p.age||'NC') + ' ans | Sexe: ' + (p.sex||'NC') + ' | Taille: ' + (p.height||'NC') + ' cm | Poids: ' + (p.weight||'NC') + ' kg',
      'FC max: ' + (p.hrMax||p.fcMax||'NC') + ' bpm | FC repos: ' + (p.hrRest||p.fcRest||'NC') + ' bpm',
      'Expérience: ' + (p.experience||'NC') + ' | Court depuis: ' + (p.runningSince||'NC') + ' | Volume habituel: ' + (p.weeklyKm||'NC') + ' km/sem',
      'Sports parallèles: ' + ((p.otherSports||[]).join(', ')||'aucun') + (p.otherSportsNote ? ' ('+p.otherSportsNote+')' : ''),
      'Blessures/fragilités: ' + ((p.injuries||[]).join(', ')||'aucune') + (p.injuriesNote ? ' — '+p.injuriesNote : ''),
      'Contexte vie: famille=' + (p.family||'NC') + ' | travail=' + (p.workload||'NC') + ' | stress=' + (p.stress||'NC') + (p.constraintsNote ? ' | note: '+p.constraintsNote : ''),
    ];

    // Objectif
    lines.push('');
    lines.push('OBJECTIF :');
    if (p.goalMain === 'race' && p.goal) {
      const g = p.goal;
      const weeksLeft = g.date ? Math.round((new Date(g.date) - now) / 604800000) : null;
      lines.push('Course: ' + (g.name||'NC') + ' (' + (g.dist||'NC') + ') le ' + (g.date||'NC') + (weeksLeft !== null ? ' — dans ' + weeksLeft + ' semaines' : ''));
      if (g.targetType === 'finish') lines.push('Objectif: Terminer');
      else if (g.targetType === 'target') lines.push('Chrono cible: ' + (g.targetA||'NC'));
      else if (g.targetType === 'range') lines.push('Objectif A: ' + (g.targetA||'NC') + ' | Objectif B: ' + (g.targetB||'NC'));
      if (g.terrain) lines.push('Terrain: ' + g.terrain);
      if (g.note) lines.push('Note course: ' + g.note);
    } else if (p.goalMain === 'fitness') {
      lines.push('Maintien forme | Focus: ' + ((p.fitFocus||[]).join(', ')||'NC') + ' | Intensité: ' + (p.fitLevel||'NC'));
    } else if (p.goalMain === 'start') {
      lines.push('Débutant | Profil: ' + (p.startLevel||'NC') + ' | Ambition 6 mois: ' + (p.startAmbition||'NC'));
    }
    if (p.goal2) {
      lines.push('Objectif secondaire: ' + (p.goal2.name||'NC') + ' (' + (p.goal2.dist||'NC') + ') le ' + (p.goal2.date||'NC') + ' — cible: ' + (p.goal2.target||'NC'));
    }

    // Planning hebdo
    const schedEntries = Object.entries(sched);
    if (schedEntries.length > 0) {
      const typeLabel = { ef: 'Endurance fondamentale', sl: 'Sortie longue', work: 'Fractionné/VMA', free: 'Au choix' };
      lines.push('');
      lines.push('PLANNING HEBDO :');
      schedEntries.forEach(function(e) { lines.push('- ' + e[0] + ': ' + (typeLabel[e[1]]||e[1])); });
    }

    // Références de niveau
    lines.push('');
    lines.push('RÉFÉRENCES DE NIVEAU :');
    lines.push('10km: ' + (prs.km10||prs['10km']||'NC')
      + ' | Semi: ' + (prs.half||prs.semi||'NC')
      + ' | Marathon: ' + (prs.marathon||'NC')
      + (p.vma    ? ' | VMA: '      + p.vma    + ' km/h'  : '')
      + (p.efPace ? ' | Allure EF: '+ p.efPace + '/km'    : ''));

    // Dernières courses (8 max)
    const activities = Storage.getActivities().slice(0, 8);
    if (activities.length > 0) {
      lines.push('');
      lines.push('DERNIÈRES COURSES (8 dernières) :');
      activities.forEach(function(a) {
        const fb  = Storage.getFeedback(a.id);
        const cad = a.average_cadence ? Math.round(a.average_cadence * 2) + 'spm' : '';
        const suf = a.suffer_score    ? 'suffer=' + a.suffer_score : '';
        const cal = a.calories        ? a.calories + 'kcal' : '';
        let line  = '- ' + Strava.formatDate(a.start_date_local)
          + ': ' + Strava.formatDistance(a.distance) + 'km'
          + ', allure ' + Strava.formatPace(a.average_speed) + '/km'
          + ', FC ' + (a.average_heartrate ? Math.round(a.average_heartrate) + '/' + (a.max_heartrate||'?') + ' bpm' : 'NC')
          + ', D+ ' + Math.round(a.total_elevation_gain||0) + 'm'
          + (cad ? ', ' + cad : '')
          + (suf ? ', ' + suf : '')
          + (cal ? ', ' + cal : '');
        if (fb) {
          line += ' → ressenti: effort=' + (fb.effort||'-') + '/5'
            + ' cardio=' + (fb.cardio||'-')
            + ' jambes=' + (fb.legs||'-')
            + ' mental=' + (fb.mental||'-')
            + ' sommeil=' + (fb.sleep||'-')
            + ' fatigue=' + (fb.fatigue||'-') + '/5'
            + (fb.painAreas && fb.painAreas.length ? ' douleurs=' + fb.painAreas.join(',') : '')
            + (fb.comment ? ' · "' + fb.comment + '"' : '');
        }
        lines.push(line);
      });
    }

    // Plan en cours (les 2 semaines)
    const plan = Storage.getPlan();
    if (plan && plan.weeks && plan.weeks.length > 0) {
      lines.push('');
      lines.push('PLAN EN COURS :');
      plan.weeks.forEach(function(w, wi) {
        lines.push((wi === 0 ? 'Semaine courante' : 'Semaine ' + (wi + 1)) + ' (' + (w.title||'') + ', ' + (w.volume_km||'?') + ' km) :');
        (w.days || []).forEach(function(d) {
          lines.push('  ' + d.day + ': ' + d.label + (d.detail ? ' — ' + d.detail.substring(0, 80) + (d.detail.length > 80 ? '…' : '') : ''));
        });
      });
    }

    return lines.join('\n');
  },

    buildPlanPrompt(profile, activities) {
    // Récupère le dernier run et son feedback pour personnaliser
    const lastRun = activities[0];
    const lastFb  = lastRun ? Storage.getFeedback(lastRun.id) : null;

    const lastRunStr = lastRun
      ? `Dernier run : ${Strava.formatDistance(lastRun.distance)}km, allure ${Strava.formatPace(lastRun.average_speed)}/km, FC ${lastRun.average_heartrate || 'N/A'} bpm${lastFb ? ` | ressenti ${lastFb.effort}/10, jambes: ${lastFb.legs || '-'}, cardio: ${lastFb.cardio || '-'}, douleurs: ${lastFb.pain || 'aucune'}, commentaire: ${lastFb.comment || '-'}` : ''}`
      : 'Aucun run récent';

    const historyStr = activities.slice(1, 5).map(a =>
      `- ${Strava.formatDistance(a.distance)}km allure ${Strava.formatPace(a.average_speed)}/km`
    ).join('\n') || '- Aucun historique';

    // Planning hebdo : type par jour
    const typeLabel = { ef: 'Endurance fondamentale', sl: 'Sortie longue', work: 'Fractionné/VMA', free: 'Au choix du coach' };
    const schedEntries = Object.entries(profile?.schedule || {});
    const schedLines = schedEntries.length > 0
      ? schedEntries.map(([day, type]) => `  - ${day} : ${typeLabel[type] || type}`).join('\n')
      : '  - Mar : Fractionné/VMA\n  - Jeu : Endurance fondamentale\n  - Sam : Sortie longue';

    // Semaines restantes avant la course
    const weeksLeft = profile?.goal?.date
      ? Math.round((new Date(profile.goal.date) - new Date()) / 604800000)
      : null;

    // Historique enrichi (FC + feedback pour chaque course)
    const richHistory = activities.slice(0, 8).map(a => {
      const fb = Storage.getFeedback(a.id);
      let line = '- ' + Strava.formatDate(a.start_date_local)
        + ': ' + Strava.formatDistance(a.distance) + 'km'
        + ' allure ' + Strava.formatPace(a.average_speed) + '/km'
        + (a.average_heartrate ? ' FC' + Math.round(a.average_heartrate) + 'bpm' : '')
        + ' D+' + Math.round(a.total_elevation_gain||0) + 'm'
        + (a.suffer_score ? ' suffer=' + a.suffer_score : '');
      if (fb) {
        line += ' [effort=' + (fb.effort||'-') + '/5'
          + ' jambes=' + (fb.legs||'-')
          + ' cardio=' + (fb.cardio||'-')
          + ' fatigue=' + (fb.fatigue||'-') + '/5'
          + (fb.painAreas && fb.painAreas.length ? ' douleurs=' + fb.painAreas.join(',') : '')
          + (fb.comment ? ' "' + fb.comment + '"' : '') + ']';
      }
      return line;
    }).join('\n') || '- Aucun historique';

    // Plan actuel (pour construire la progression)
    const currentPlan = Storage.getPlan();
    let currentPlanStr = '';
    if (currentPlan && currentPlan.weeks) {
      currentPlanStr = '\nPLAN ACTUEL (à faire évoluer en progression) :';
      currentPlan.weeks.forEach(function(w, i) {
        currentPlanStr += '\n  S' + (i+1) + ' (' + (w.volume_km||'?') + ' km): '
          + (w.days||[]).map(d => d.day + '=' + d.label).join(', ');
      });
    }

    return `En tant que coach running expert, génère un plan d'entraînement personnalisé sur 2 semaines.

PROFIL COMPLET :
- Age: ${profile?.age||'NC'} ans | Poids: ${profile?.weight||'NC'} kg | Sexe: ${profile?.sex||'NC'}
- Expérience: ${profile?.experience||'NC'} | Court depuis: ${profile?.runningSince||'NC'}
- Volume habituel: ${profile?.weeklyKm||'NC'} km/sem
- FC max: ${profile?.fcMax||profile?.hrMax||'NC'} bpm | FC repos: ${profile?.hrRest||profile?.fcRest||'NC'} bpm
- Blessures/fragilités: ${(profile?.injuries||[]).join(', ')||'aucune'}${profile?.injuriesNote ? ' — '+profile.injuriesNote : ''}
- Contexte: famille=${profile?.family||'NC'} | travail=${profile?.workload||'NC'} | stress=${profile?.stress||'NC'}${profile?.constraintsNote ? ' | '+profile.constraintsNote : ''}

OBJECTIF :
- Course: ${profile?.goal?.name||'NC'} (${profile?.goal?.dist||'NC'}) le ${profile?.goal?.date||'NC'}${weeksLeft !== null ? ' → ' + weeksLeft + ' semaines restantes' : ''}
- Chrono cible: ${profile?.goal?.targetA || profile?.goal?.target || 'finir'}
${profile?.goal2 ? '- Objectif secondaire: ' + profile.goal2.name + ' (' + profile.goal2.dist + ') le ' + profile.goal2.date : ''}

RÉFÉRENCES DE NIVEAU :
- 10km: ${profile?.prs?.km10||'NC'} | Semi: ${profile?.prs?.half||profile?.prs?.semi||'NC'} | Marathon: ${profile?.prs?.marathon||'NC'}
- VMA: ${profile?.vma||'NC'} km/h | Allure EF cible: ${profile?.efPace||'NC'}/km

PLANNING HEBDO IMPOSÉ (RESPECTER OBLIGATOIREMENT) :
${schedLines}
Contrainte absolue : ${schedEntries.map(([d,t])=>d+'→type="'+t+'"').join(' | ')}
${currentPlanStr}

HISTORIQUE DES 8 DERNIÈRES COURSES :
${richHistory}

CONSIGNES :
- Inclure UNIQUEMENT les jours du planning hebdo ci-dessus
- NE PAS changer le type de séance par jour — c'est une contrainte absolue
- PAS de jours de repos dans le plan
- Adapter l'intensité selon la charge récente, les ressentis et les douleurs signalées
- Si douleurs → réduire intensité ou proposer récup active
- Allures précises déduites des records et VMA
- Progression logique si un plan existe déjà
${weeksLeft !== null && weeksLeft <= 3 ? '- ATTENTION : course dans ' + weeksLeft + ' semaine(s) → phase d\'affûtage, réduire les volumes' : ''}
${weeksLeft !== null && weeksLeft > 3 && weeksLeft <= 8 ? '- Phase de préparation spécifique, travailler l\'allure cible' : ''}

RETOURNE UNIQUEMENT CE JSON (pas de texte, pas de markdown, pas de \`\`\`) avec EXACTEMENT 2 semaines.
Le champ "detail" doit OBLIGATOIREMENT utiliser le séparateur · entre les 3 phases (échauffement · travail · retour au calme). Aucun "puis" ni virgule entre les phases.

${(function() {
  const exampleDetail = {
    ef:   { type: 'ef',   label: 'Endurance fondamentale', detail: '10 km allure 5:50-6:10/km FC<75%' },
    sl:   { type: 'sl',   label: 'Sortie longue',          detail: '18 km allure 5:40-6:00/km' },
    work: { type: 'work', label: 'Fractionné VMA',         detail: "15' échauffement · 6x400m allure 4:30/km r1'30 trot · 10' retour au calme" },
    free: { type: 'ef',   label: 'Endurance fondamentale', detail: '10 km allure 5:50-6:10/km FC<75%' },
  };
  const exDays1 = schedEntries.map(([d, t]) => ({ day: d, ...(exampleDetail[t] || exampleDetail.ef) }));
  const exDays2 = schedEntries.map(([d, t]) => ({ day: d, ...(exampleDetail[t] || exampleDetail.ef) }));
  const ex = { weeks: [
    { title: 'Semaine du XX-06', volume_km: 27, days: exDays1 },
    { title: 'Semaine du YY-06', volume_km: 29, days: exDays2 }
  ]};
  return JSON.stringify(ex);
})()}

Remplace les valeurs par un plan personnalisé et adapté au profil. Règle "detail" : séances intenses (VMA/seuil/tempo) → "échauff · travail · retour au calme" avec ·. Séances faciles (EF/SL/récup) → une ligne simple sans ·.`;
  }
};
