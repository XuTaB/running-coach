// coach.js — Appels à Gemini via le backend
const Coach = {
  SYSTEM_PROMPT: `Tu es un coach running expert, bienveillant et précis. Tu t'appelles "Coach" et tu tutoies l'athlète.

Ton rôle :
- Analyser les données Strava (distance, allure, FC, dénivelé, splits km par km, zones cardiaques)
- Croiser avec les ressentis subjectifs (effort perçu, jambes, mental, sommeil, douleurs)
- Proposer et ajuster la prochaine semaine d'entraînement
- Répondre aux questions running avec pédagogie
- Alerter sur les signes de surmenage ou blessure

Règles :
- Réponds TOUJOURS en français
- Sois concis sur mobile (3-5 phrases max pour les messages conversationnels)
- Ne commence JAMAIS par 'Salut', 'Bonjour', 'Hey' ou toute formule de salutation
- Pas de formule de politesse en début ou fin de message
- Si douleur persistante → recommande médecin/kiné
- Base-toi sur les données fournies avant tout

RÈGLE CRITIQUE SUR LE PLAN :
Quand tu modifies ou proposes un plan d'entraînement, tu DOIS TOUJOURS inclure le JSON complet à la fin de ta réponse (sans markdown, sans backticks).
Génère TOUJOURS au minimum 2 semaines.
Types valides : ef, tempo, vma, sl (sortie longue), recup
N'inclure QUE les jours d'entraînement, PAS les jours de repos.

FORMAT DU CHAMP "detail" — deux règles selon le type de séance :

1. Séances intenses (VMA, seuil, tempo, fractionné) → OBLIGATOIREMENT 3 phases séparées par · :
   "[échauffement] · [travail principal] · [retour au calme]"
   Exemples :
   - VMA   : "15' échauffement allure 5:50-6:10 · 6x400m allure 4:30/km r1'30 trot · 10' retour au calme"
   - Seuil : "15' échauffement allure 5:50-6:10 · 3x8' allure 4:45/km r2' · 10' retour au calme"
   - Tempo : "15' échauffement allure 5:50-6:10 · 20' allure 4:55-5:05/km · 10' retour au calme"

2. Séances faciles (EF, sortie longue, récup) → une seule ligne descriptive, PAS de phases :
   Exemples :
   - EF : "10 km allure 5:50-6:10/km FC<75%, effort conversationnel"
   - SL : "18 km allure 5:40-6:00/km, progression naturelle sur les 5 derniers km"
   - Récup : "6 km très facile allure 6:10-6:30/km, jambes légères"

INTERDIT pour les séances intenses : "puis", virgules comme séparateur de phases. Seul · est autorisé.`,

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
    const profile = Storage.getProfile();

    // Charge les données détaillées Strava (splits, zones FC, etc.)
    let richContext = '';
    try {
      const detail = await Strava.fetchActivityDetail(activity.id);
      if (detail) richContext = Strava.buildCoachContext(detail);
    } catch(e) {
      console.warn('Détail non disponible, utilise données basiques');
    }

    // Fallback si pas de détail
    if (!richContext) {
      richContext = `DONNÉES DE LA COURSE :
- Date : ${Strava.formatDate(activity.start_date_local)}
- Distance : ${Strava.formatDistance(activity.distance)} km
- Durée : ${Strava.formatDuration(activity.moving_time)}
- Allure moy : ${Strava.formatPace(activity.average_speed)} /km
- FC moy : ${activity.average_heartrate || 'N/A'} bpm
- Dénivelé : ${Math.round(activity.total_elevation_gain || 0)}m`;
    }

    const feedbackStr = `
RESSENTIS ATHLÈTE :
- Effort global : ${feedback.effort}/10 (0=très dur, 10=parfait)
- Cardio : ${feedback.cardio || 'non renseigné'}
- Jambes : ${feedback.legs || 'non renseigné'}
- Mental : ${feedback.mental || 'non renseigné'}
- Douleurs : ${(feedback.painAreas||[]).join(', ') || 'Aucune'}${feedback.painDetail ? ' — '+feedback.painDetail : ''}
- Sommeil : ${feedback.sleep || 'non renseigné'}
- Fatigue avant course : ${feedback.fatigue}/10
- Météo : ${feedback.weather || 'non renseigné'}
- Commentaire : ${feedback.comment || '-'}`;

    const prompt = `${richContext}
${feedbackStr}

MON PROFIL : objectif ${profile?.goal?.name || 'marathon'} le ${profile?.goal?.date || '-'}, niveau ${profile?.level || 'intermédiaire'}, records : 10km ${profile?.prs?.km10 || 'NC'}, semi ${profile?.prs?.semi || 'NC'}.

Analyse cette séance en croisant les données objectives (allure, FC, splits) avec mes ressentis. Donne-moi :
1. Ce que révèlent les données (points positifs et alertes)
2. Comment adapter ma prochaine séance en fonction de ça`;

    return this.sendMessage(prompt);
  },

  buildContext(profile) {
    if (!profile) return '';
    const p = profile;
    const prs = p.prs || {};
    const schedule = p.schedule || {};

    const lines = [
      'PROFIL ATHLETE :',
      'Nom: ' + (p.name||'NC') + ' | Age: ' + (p.age||'NC') + ' ans | Sexe: ' + (p.sex||'NC') + ' | Taille: ' + (p.height||'NC') + ' cm | Poids: ' + (p.weight||'NC') + ' kg',
      'FC max: ' + (p.hrMax||p.fcMax||'NC') + ' bpm | FC repos: ' + (p.hrRest||p.fcRest||'NC') + ' bpm',
      'Experience: ' + (p.experience||'NC') + ' | Court depuis: ' + (p.runningSince||'NC') + ' | Volume: ' + (p.weeklyKm||'NC') + ' km/sem',
      'Sports paralleles: ' + ((p.otherSports||[]).join(', ')||'aucun') + (p.otherSportsNote ? ' ('+p.otherSportsNote+')' : ''),
      'Blessures: ' + ((p.injuries||[]).join(', ')||'aucune') + (p.injuriesNote ? ' - '+p.injuriesNote : ''),
      'Contexte: famille=' + (p.family||'NC') + ' | travail=' + (p.workload||'NC') + ' | stress=' + (p.stress||'NC') + (p.constraintsNote ? ' | '+p.constraintsNote : ''),
    ];

    lines.push('');
    lines.push('OBJECTIF PRINCIPAL :');
    if (p.goalMain === 'race' && p.goal) {
      const g = p.goal;
      lines.push('Course: ' + (g.name||'NC') + ' (' + (g.dist||'NC') + ') le ' + (g.date||'NC'));
      if (g.targetType === 'finish') lines.push('Objectif: Finir');
      else if (g.targetType === 'target') lines.push('Chrono cible: ' + (g.targetA||'NC'));
      else if (g.targetType === 'range') lines.push('Objectif A: ' + (g.targetA||'NC') + ' | Objectif B: ' + (g.targetB||'NC'));
      if (g.terrain) lines.push('Terrain: ' + g.terrain);
      if (g.note) lines.push('Note: ' + g.note);
    } else if (p.goalMain === 'fitness') {
      lines.push('Maintien forme | Focus: ' + ((p.fitFocus||[]).join(', ')||'NC') + ' | Intensite: ' + (p.fitLevel||'NC'));
    } else if (p.goalMain === 'start') {
      lines.push('Debutant | Profil: ' + (p.startLevel||'NC') + ' | Ambition 6 mois: ' + (p.startAmbition||'NC'));
    }

    if (p.goal2) {
      lines.push('OBJECTIF SECONDAIRE: ' + (p.goal2.name||'NC') + ' (' + (p.goal2.dist||'NC') + ') le ' + (p.goal2.date||'NC') + ' - cible: ' + (p.goal2.target||'NC'));
    }

    const schedEntries = Object.entries(schedule);
    if (schedEntries.length > 0) {
      const typeLabel = { ef: 'Endurance fondamentale', sl: 'Sortie longue', work: 'Fractionne/VMA', free: 'Au choix' };
      lines.push('');
      lines.push('PLANNING HEBDO :');
      schedEntries.forEach(function(e) { lines.push('- ' + e[0] + ': ' + (typeLabel[e[1]]||e[1])); });
    }

    lines.push('');
    lines.push('REFERENCES DE NIVEAU :');
    lines.push('10km: ' + (prs.km10||prs['10km']||'NC') + ' | Semi: ' + (prs.half||prs.semi||'NC') + ' | Marathon: ' + (prs.marathon||'NC') + (p.vma ? ' | VMA: '+p.vma+' km/h' : '') + (p.efPace ? ' | Allure EF: '+p.efPace+'/km' : ''));

    const activities = Storage.getActivities().slice(0, 5);
    if (activities.length > 0) {
      lines.push('');
      lines.push('DERNIERES COURSES :');
      activities.forEach(function(a) {
        const fb  = Storage.getFeedback(a.id);
        const cad = a.average_cadence ? Math.round(a.average_cadence * 2) + '/min' : '';
        let line  = '- ' + Strava.formatDate(a.start_date_local) + ': ' + Strava.formatDistance(a.distance) + 'km, allure ' + Strava.formatPace(a.average_speed) + '/km, FC moy ' + (a.average_heartrate ? Math.round(a.average_heartrate)+'bpm' : 'NC') + '/max ' + (a.max_heartrate||'NC') + 'bpm, denivele +' + Math.round(a.total_elevation_gain||0) + 'm' + (cad ? ', cadence '+cad : '');
        if (fb) {
          line += ' | Ressenti ' + (fb.effort||'-') + '/5, cardio:' + (fb.cardio||'-') + ', jambes:' + (fb.legs||'-') + ', mental:' + (fb.mental||'-') + ', douleurs:' + ((fb.painAreas||[]).join(',')||'aucune') + ', sommeil:' + (fb.sleep||'-') + ', fatigue:' + (fb.fatigue||'-') + '/5' + (fb.comment ? ', "'+fb.comment+'"' : '');
        }
        lines.push(line);
      });
    }

    const plan = Storage.getPlan();
    if (plan && plan.weeks && plan.weeks[0]) {
      lines.push('');
      lines.push('PLAN EN COURS :');
      plan.weeks[0].days.forEach(function(d) {
        lines.push('- ' + d.day + ': ' + d.label + (d.detail ? ' - ' + d.detail : ''));
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

    return `En tant que coach running, génère la prochaine semaine d'entraînement sur mesure.

PROFIL :
- Objectif : ${profile?.goal?.name || 'marathon'} le ${profile?.goal?.date || 'non défini'}
- Chrono cible : ${profile?.goal?.target || 'finir'}
- Niveau : ${profile?.level || 'intermédiaire'}
- Records : 10km ${profile?.prs?.km10 || 'NC'}, Semi ${profile?.prs?.semi || 'NC'}, Marathon ${profile?.prs?.marathon || 'NC'}
- Jours d'entraînement : ${profile?.trainingDays?.join(', ') || 'Mar, Jeu, Sam'}
- Séances/semaine : ${profile?.sessionsPerWeek || 3}
- Jour sortie longue : ${profile?.slDay || 'Sam'}
- FC max : ${profile?.fcMax || 'NC'} bpm
- Fragilités : ${profile?.injuries?.join(', ') || 'aucune'}

${lastRunStr}

HISTORIQUE RÉCENT :
${historyStr}

CONSIGNES IMPORTANTES :
- Inclure UNIQUEMENT les jours d'entraînement (${profile?.trainingDays?.join(', ') || 'Mar, Jeu, Sam'})
- PAS de jours de repos dans le plan
- Adapter l'intensité selon le dernier run et les feedbacks
- Si douleurs signalées → réduire l'intensité ou proposer récup active
- Allures précises basées sur le niveau et les records

RETOURNE UNIQUEMENT CE JSON (pas de texte, pas de markdown, pas de \`\`\`) avec EXACTEMENT 2 semaines.
Le champ "detail" doit OBLIGATOIREMENT utiliser le séparateur · entre les 3 phases (échauffement · travail · retour au calme). Aucun "puis" ni virgule entre les phases.

{"weeks":[{"title":"Semaine du 09-06","volume_km":27,"days":[{"day":"Mar","type":"ef","label":"Endurance fondamentale","detail":"15' échauffement allure 5:50-6:10 · 10 km allure 5:40-5:55 FC<75% · 10' retour au calme"},{"day":"Jeu","type":"vma","label":"VMA","detail":"15' échauffement allure 5:50-6:10 · 6x400m allure 4:30/km r1'30 trot · 10' retour au calme"},{"day":"Sam","type":"sl","label":"Sortie longue","detail":"10' échauffement · 18 km allure 5:40-6:00 · 10' retour au calme"}]},{"title":"Semaine du 16-06","volume_km":29,"days":[{"day":"Mar","type":"ef","label":"Endurance fondamentale","detail":"15' échauffement allure 5:50-6:10 · 11 km allure 5:40-5:55 FC<75% · 10' retour au calme"},{"day":"Jeu","type":"vma","label":"VMA","detail":"15' échauffement allure 5:50-6:10 · 7x400m allure 4:30/km r1'30 trot · 10' retour au calme"},{"day":"Sam","type":"sl","label":"Sortie longue","detail":"10' échauffement · 20 km allure 5:40-6:00 · 10' retour au calme"}]}]}

Remplace les valeurs par un plan personnalisé. Règle "detail" : séances intenses (VMA/seuil/tempo) → "échauff · travail · retour au calme" avec ·. Séances faciles (EF/SL/récup) → une ligne simple sans ·.`;
  }
};
