// ui.js — Rendu des composants UI
const UI = {
  toast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
  },

  modal(html, onClose) {
    const overlay = document.getElementById('modal-overlay');
    const box = document.getElementById('modal-box');
    box.innerHTML = '<div class="modal-handle"></div>' + html;
    overlay.classList.remove('hidden');
    this._onModalClose = onClose;
    overlay.onclick = (e) => { if (e.target === overlay) this.closeModal(); };
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    if (this._onModalClose) this._onModalClose();
  },

  // ===== HOME =====
  renderHome(profile, activities, plan) {
    const el = document.getElementById('home-content');
    const now = new Date();

    // weekKm en scope global de renderHome (utilisé aussi dans le bloc plan)
    // Début de la semaine ISO en cours (lundi 00:00:00 local)
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekKm = activities
      .filter(a => new Date(a.start_date_local) >= weekStart)
      .reduce((s, a) => s + a.distance, 0) / 1000;

    // Stats annuelles depuis le cache local (si dispo)
    let metricsHtml = '';
    if (activities.length > 0) {
      let yearStatsInner = '';
      try {
        const currentYear = now.getFullYear();
        const years = [currentYear, currentYear - 1, currentYear - 2];
        const stored = Storage.getYearlyStats();
        const statsArr = years.map(y => stored[y]).filter(Boolean);
        if (statsArr.length) yearStatsInner = this.renderYearStats(statsArr);
      } catch(e) {}

      const yearStatsBlock = yearStatsInner
        ? `<div id="year-stats-block" style="margin-top:10px;">${yearStatsInner}</div>`
        : `<div id="year-stats-block" style="margin-top:10px;">
            <button class="btn-ghost" style="width:100%;font-size:13px;padding:9px 0;" onclick="App.loadYearStats(this)">
              📊 Charger les stats des 3 dernières années
            </button>
           </div>`;

      metricsHtml = yearStatsBlock;
    }

    // This week plan + next week
    let planHtml = '';
    if (plan?.weeks?.[0]) {
      const weekDates0 = this._getWeekDates(0);
      const weekDates1 = this._getWeekDates(1);

      const renderHomeWeek = (week, weekDates, skipPast, isCurrentWeek) => {
        const daysHtml = this._sortDays(week.days)
          .filter(d => d.type !== 'rest' && d.type !== 'recup')
          .map(d => this._renderPlanDay(d, weekDates, now, skipPast))
          .filter(Boolean)
          .join('');
        if (!daysHtml && skipPast) return ''; // semaine en cours déjà passée
        let header;
        if (isCurrentWeek) {
          const doneKm = weekKm.toFixed(0);
          const plannedKm = week.volume_km || 0;
          header = '<div class="section-header">'
            + '<div class="section-title">Semaine en cours'
            + ' <span style="font-weight:400;font-size:13px;color:var(--text-muted);">' + doneKm + ' / ' + plannedKm + ' km</span>'
            + '</div>'
            + '<button class="btn-ghost" style="font-size:12px;padding:5px 10px;" onclick="App.generatePlan()">↻ Recalculer</button>'
            + '</div>';
        } else {
          header = '<div class="section-header"><div class="section-title">Semaine prochaine</div><span class="volume-badge">' + week.volume_km + ' km</span></div>';
        }
        return header + '<div class="card" style="padding: 8px 14px;">' + (daysHtml || '<div style="padding:8px 0;font-size:13px;color:var(--text-hint);text-align:center;">Aucune séance</div>') + '</div>';
      };

      planHtml = renderHomeWeek(plan.weeks[0], weekDates0, true, true);
      if (plan.weeks[1]) planHtml += renderHomeWeek(plan.weeks[1], weekDates1, false, false);
    } else {
      planHtml = `
        <div class="section-header"><div class="section-title">Plan d'entraînement</div></div>
        <div class="card">
          <div class="empty-state" style="padding:20px 0;">
            <div class="empty-state-title">Pas encore de plan</div>
            <div class="empty-state-sub">Connecte Strava et configure ton profil pour générer ton premier plan.</div>
            <button class="btn-ghost" style="margin-top:12px;" onclick="App.generatePlan()">Générer mon plan →</button>
          </div>
        </div>`;
    }

    // Last activity
    let lastActHtml = '';
    if (activities.length > 0) {
      const a = activities[0];
      lastActHtml = `
        <div class="section-header" style="margin-top:4px;"><div class="section-title">Dernière course</div></div>
        ${this.renderActivityCard(a, true)}`;
    }

    el.innerHTML = metricsHtml + planHtml + lastActHtml;
    // Initialise la carte Leaflet de la dernière course (lazy)
    requestAnimationFrame(() => this.initMapObserver());
  },

  // ===== STRAVA TAB =====
  renderStravaTab(isConnected, activities) {
    const el = document.getElementById('strava-content');
    const connectBanner = isConnected
      ? `<div class="strava-connected-bar">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
           <div><strong>Strava connecté</strong><br><span>${activities.length} courses synchronisées</span></div>
         </div>`
      : `<div class="strava-banner">
           <svg class="strava-logo" viewBox="0 0 40 40" fill="white"><path d="M15 28.5l5-9.7 5 9.7h-3.1l-1.9-3.8-1.9 3.8H15zm-5-9.7l2 3.8H8L15 8l7 14.6h-4l-3-6.2-3 6.2H8.5l1.5-3.8z"/></svg>
           <div class="strava-text"><strong>Connecte Strava</strong><span>Importe tes courses automatiquement</span></div>
           <button class="strava-connect-btn" onclick="Strava.authorize()">Connecter</button>
         </div>`;

    const activityList = activities.length > 0
      ? activities.map(a => this.renderActivityCard(a, true)).join('')
      : `<div class="empty-state"><div class="empty-state-icon">🏃</div><div class="empty-state-title">Aucune course</div><div class="empty-state-sub">${isConnected ? 'Synchronise Strava pour importer tes courses.' : 'Connecte ton compte Strava pour commencer.'}</div></div>`;

    el.innerHTML = `
      ${connectBanner}
      <div class="section-header" style="margin-top:4px;">
        <div class="section-title">Courses récentes</div>
        ${isConnected ? `<button class="btn-ghost" onclick="App.syncStrava()">↻ Sync</button>` : ''}
      </div>
      ${activityList}`;

    // Initialise les cartes Leaflet au scroll (lazy)
    requestAnimationFrame(() => this.initMapObserver());
  },

  renderActivityCard(activity, withFeedback) {
    const fb           = Storage.getFeedback(activity.id);
    const feedbackHtml = withFeedback ? this.renderFeedbackForm(activity, fb) : '';
    const hasFb        = !!fb;
    const suffer       = activity.suffer_score || null;
    const cadence      = activity.average_cadence ? Math.round(activity.average_cadence * 2) : null;

    // Calories & chaussures : absents de la liste Strava → lire le cache détail si dispo
    let calDisplay  = activity.calories      ? Math.round(activity.calories) + ' kcal' : '--';
    let gearDisplay = activity.gear?.name    ? activity.gear.name.slice(0, 10)          : '--';
    try {
      const cached = localStorage.getItem('strava_detail_v3_' + activity.id);
      if (cached) {
        const d = JSON.parse(cached);
        if (d.calories)    calDisplay  = Math.round(d.calories) + ' kcal';
        if (d.gear?.name)  gearDisplay = d.gear.name.slice(0, 10);
      }
    } catch(e) {}

    return `
      <div class="act-card${hasFb ? ' has-feedback' : ''}" id="act-${activity.id}">
        <div class="act-card-header" onclick="UI.toggleActivity(${activity.id})">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:6px;">
              <div class="act-card-title">${activity.name || 'Course'}</div>
              ${hasFb ? '<span style="font-size:10px;background:var(--orange-light);color:var(--orange);padding:2px 6px;border-radius:10px;font-weight:600;">✓ Ressenti</span>' : ''}
            </div>
            <div class="act-card-date">${Strava.formatDate(activity.start_date_local)}</div>
          </div>
          <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        <!-- Stats principales -->
        <div class="act-stats">
          <div><div class="act-stat-val">${Strava.formatDistance(activity.distance)}</div><div class="act-stat-label">km</div></div>
          <div><div class="act-stat-val">${Strava.formatDuration(activity.moving_time)}</div><div class="act-stat-label">durée</div></div>
          <div><div class="act-stat-val">${Strava.formatPace(activity.average_speed)}</div><div class="act-stat-label">/km</div></div>
          <div><div class="act-stat-val">${activity.average_heartrate ? Math.round(activity.average_heartrate) : '--'}</div><div class="act-stat-label">bpm moy</div></div>
        </div>

        <!-- Stats secondaires ligne 1 -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);padding:0 16px 8px;gap:4px;">
          <div><div class="act-stat-val" style="font-size:13px;">${activity.total_elevation_gain ? Math.round(activity.total_elevation_gain)+'m' : '--'}</div><div class="act-stat-label">dénivelé</div></div>
          <div><div class="act-stat-val" style="font-size:13px;">${activity.max_heartrate || '--'}</div><div class="act-stat-label">FC max</div></div>
          <div><div class="act-stat-val" style="font-size:13px;">${cadence ? cadence+'/min' : '--'}</div><div class="act-stat-label">cadence</div></div>
          <div><div id="act-cal-${activity.id}" class="act-stat-val" style="font-size:13px;">${calDisplay}</div><div class="act-stat-label">calories</div></div>
        </div>
        <!-- Stats secondaires ligne 2 -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);padding:0 16px 12px;gap:4px;border-bottom:0.5px solid var(--border);">
          <div><div class="act-stat-val" style="font-size:13px;">${Strava.formatPace(activity.max_speed)}</div><div class="act-stat-label">allure max</div></div>
          <div><div class="act-stat-val" style="font-size:13px;">${suffer || '--'}</div><div class="act-stat-label">suffer</div></div>
          <div><div class="act-stat-val" style="font-size:13px;">${activity.average_temp !== undefined ? activity.average_temp+'°C' : '--'}</div><div class="act-stat-label">temp.</div></div>
          <div><div id="act-gear-${activity.id}" class="act-stat-val" style="font-size:13px;">${gearDisplay}</div><div class="act-stat-label">chaussures</div></div>
        </div>

        <!-- Carte OSM (lazy-init Leaflet au scroll) -->
        ${activity.map && activity.map.summary_polyline ? `<div class="act-leafmap" id="leafmap-${activity.id}" data-polyline="${activity.map.summary_polyline}"></div>` : ''}

        <!-- Détails étendus (chargés au clic) -->
        <div id="detail-${activity.id}" style="display:none;padding:12px 16px;border-bottom:0.5px solid var(--border);">
          <div style="font-size:12px;color:var(--text-hint);text-align:center;">Chargement des données détaillées...</div>
        </div>

        ${feedbackHtml}
      </div>`;
  },

  // Charge et affiche les données détaillées d'une activité
  // ── Graphique Allure + FC + Dénivelé ─────────────────────────────────────────
  // Utilitaire : moyenne glissante sur un tableau (ignore les null)
  _movingAvg(arr, win) {
    return arr.map(function(_, i) {
      var sum = 0, count = 0, j;
      for (j = Math.max(0, i - win); j <= Math.min(arr.length - 1, i + win); j++) {
        if (arr[j] !== null && arr[j] !== undefined) { sum += arr[j]; count++; }
      }
      return count > 0 ? sum / count : null;
    });
  },

  // Utilitaire : dénivelé SVG commun aux deux graphiques
  _elevSvg(streams, totalDist, PAD, cW, cH, W, H) {
    var altData  = (streams.altitude && streams.altitude.data)  || [];
    var distData = (streams.distance && streams.distance.data)  || [];
    if (altData.length < 6 || distData.length < 6) return '';
    var step = Math.max(1, Math.floor(altData.length / 200));
    var altPts = [];
    for (var i = 0; i < altData.length; i += step) {
      if (distData[i] !== undefined) altPts.push({ d: distData[i], a: altData[i] });
    }
    if (altPts.length < 3) return '';
    var aMin = Math.min.apply(null, altPts.map(function(p) { return p.a; }));
    var aMax = Math.max.apply(null, altPts.map(function(p) { return p.a; }));
    var aRange = aMax - aMin || 1;
    var elevH  = cH * 0.5;
    var bottom = PAD.top + cH;
    var xOf    = function(d) { return PAD.left + (Math.min(d, totalDist) / totalDist) * cW; };
    var pathD  = altPts.map(function(p, idx) {
      var x = xOf(p.d).toFixed(1);
      var y = (PAD.top + cH - ((p.a - aMin) / aRange) * elevH).toFixed(1);
      return (idx === 0 ? 'M' : 'L') + x + ',' + y;
    }).join(' ');
    var lastX  = xOf(altPts[altPts.length - 1].d).toFixed(1);
    var firstX = xOf(altPts[0].d).toFixed(1);
    return '<path d="' + pathD + ' L' + lastX + ',' + bottom + ' L' + firstX + ',' + bottom + ' Z"'
      + ' fill="rgba(90,140,200,0.22)" stroke="rgba(90,140,200,0.60)" stroke-width="1.2"/>';
  },

  // Routeur principal
  renderStreamsChart(detail) {
    var streams = detail.streams;
    if (!streams) return '';
    var velData = (streams.velocity_smooth && streams.velocity_smooth.data) || [];
    if (velData.length < 20) return '';

    // Détection fractionné : workout_type===3 OU haute variance de vitesse sur laps manuels
    var laps = (detail.laps || []).filter(function(l) { return l.distance > 50 && l.elapsed_time > 5; });
    var isInterval = false;
    if (detail.workout_type === 3 && laps.length >= 2) {
      isInterval = true;
    } else if (laps.length >= 4) {
      // Variance des vitesses moyennes : si stddev > 0.5 m/s → fractionné
      var speeds = laps.map(function(l) { return l.average_speed || 0; }).filter(Boolean);
      var avg    = speeds.reduce(function(a, b) { return a + b; }, 0) / speeds.length;
      var stddev = Math.sqrt(speeds.reduce(function(a, b) { return a + Math.pow(b - avg, 2); }, 0) / speeds.length);
      if (stddev > 0.5) isInterval = true;
    }

    return isInterval
      ? this._renderLapChart(detail, laps, streams)
      : this._renderContinuousChart(detail, streams);
  },

  // ── Vue continue : allure lissée + FC + dénivelé ──────────────────────────
  _renderContinuousChart(detail, streams) {
    var velData  = (streams.velocity_smooth && streams.velocity_smooth.data) || [];
    var hrData   = (streams.heartrate        && streams.heartrate.data)       || [];
    var distData = (streams.distance         && streams.distance.data)        || [];

    // Downsampling → ~250 points
    var step = Math.max(1, Math.floor(velData.length / 250));
    var raw  = [];
    for (var i = 0; i < velData.length; i += step) {
      var v = velData[i];
      raw.push({
        d:    distData[i] || 0,
        pace: (v > 0.5) ? 1000 / v : null,
        hr:   hrData[i]  || null
      });
    }

    // Lissage allure (fenêtre 6) + écrêtage des artefacts (3:00–12:00/km)
    var rawPaces = raw.map(function(p) { return p.pace; });
    var smPaces  = this._movingAvg(rawPaces, 6);
    var pts = raw.map(function(p, idx) {
      var sp = smPaces[idx];
      return {
        d:    p.d,
        pace: (sp && sp >= 180 && sp <= 720) ? sp : null,
        hr:   p.hr
      };
    });

    var W = 600, H = 130;
    var PAD = { top: 10, right: 38, bottom: 22, left: 40 };
    var cW = W - PAD.left - PAD.right;
    var cH = H - PAD.top  - PAD.bottom;

    var maxDist = (pts[pts.length - 1] && pts[pts.length - 1].d) ? pts[pts.length - 1].d : 1;
    var xOf = function(d) { return PAD.left + (d / maxDist) * cW; };

    // Allure
    var validPaces = pts.map(function(p) { return p.pace; }).filter(Boolean);
    if (!validPaces.length) return '';
    var pMin   = Math.min.apply(null, validPaces);
    var pMax   = Math.max.apply(null, validPaces);
    var pRange = pMax - pMin || 30;
    var yPace  = function(p) { return PAD.top + ((p - pMin) / pRange) * cH; };

    // FC
    var validHR = pts.map(function(p) { return p.hr; }).filter(Boolean);
    var hrMin   = validHR.length ? Math.max(80,  Math.min.apply(null, validHR) - 5) : 100;
    var hrMax   = validHR.length ? Math.min(220, Math.max.apply(null, validHR) + 5) : 200;
    var hrRange = hrMax - hrMin || 100;
    var yHR     = function(h) { return PAD.top + cH - ((h - hrMin) / hrRange) * cH; };

    // Dénivelé
    var elevSvg = this._elevSvg(streams, maxDist, PAD, cW, cH, W, H);

    // Grille km
    var totalKm = maxDist / 1000;
    var kmStep  = totalKm > 25 ? 5 : totalKm > 12 ? 2 : 1;
    var gridSvg = '', xLabelSvg = '';
    for (var km = 0; km <= Math.ceil(totalKm); km += kmStep) {
      var xk = xOf(km * 1000).toFixed(1);
      gridSvg   += '<line x1="' + xk + '" y1="' + PAD.top + '" x2="' + xk + '" y2="' + (PAD.top + cH) + '"'
        + ' stroke="rgba(128,128,128,0.12)" stroke-width="1"/>';
      xLabelSvg += '<text x="' + xk + '" y="' + (H - 5) + '" text-anchor="middle"'
        + ' font-size="9" fill="rgba(128,128,128,0.7)">' + km + 'km</text>';
    }

    // Helpers arrondi propre
    var fmtPaceR = function(sec) {
      var r = Math.round(sec / 5) * 5;
      var m = Math.floor(r / 60), s = r % 60;
      return m + ':' + (s < 10 ? '0' + s : '' + s);
    };
    var fmtHRR = function(bpm) { return Math.round(bpm / 5) * 5; };

    // Labels allure (gauche)
    var pLabelSvg = '';
    [pMin, (pMin + pMax) / 2, pMax].forEach(function(p) {
      var y = yPace(p).toFixed(1);
      pLabelSvg += '<text x="' + (PAD.left - 3) + '" y="' + y + '" text-anchor="end"'
        + ' dominant-baseline="middle" font-size="8" fill="rgba(249,115,22,0.9)">'
        + fmtPaceR(p) + '</text>';
    });

    // Labels FC (droite)
    var hrLabelSvg = '';
    if (validHR.length) {
      [hrMin, Math.round((hrMin + hrMax) / 2), hrMax].forEach(function(h) {
        var y = yHR(h).toFixed(1);
        hrLabelSvg += '<text x="' + (W - PAD.right + 4) + '" y="' + y + '"'
          + ' dominant-baseline="middle" font-size="8" fill="rgba(239,68,68,0.9)">' + fmtHRR(h) + '</text>';
      });
    }

    // Courbe allure (segments continus séparés aux trous)
    var pacePts  = pts.filter(function(p) { return p.pace; });
    var paceSvg  = '';
    if (pacePts.length > 1) {
      var prevIdx = -2, paceD = '';
      pts.forEach(function(p, idx) {
        if (!p.pace) { prevIdx = -2; return; }
        var cmd = (prevIdx === idx - 1) ? 'L' : 'M';
        paceD  += cmd + xOf(p.d).toFixed(1) + ',' + yPace(p.pace).toFixed(1) + ' ';
        prevIdx = idx;
      });
      paceSvg = '<path d="' + paceD + '" fill="none" stroke="rgba(249,115,22,0.9)"'
        + ' stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>';
    }

    // Courbe FC
    var hrPts = pts.filter(function(p) { return p.hr; });
    var hrSvg = '';
    if (hrPts.length > 1) {
      var hrD = hrPts.map(function(p, idx) {
        return (idx === 0 ? 'M' : 'L') + xOf(p.d).toFixed(1) + ',' + yHR(p.hr).toFixed(1);
      }).join(' ');
      hrSvg = '<path d="' + hrD + '" fill="none" stroke="rgba(239,68,68,0.8)"'
        + ' stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="4,2"/>';
    }

    // Légende
    var legendParts = ['<span style="color:rgba(249,115,22,0.95);font-weight:600;">— Allure</span>'];
    if (hrPts.length  > 1)  legendParts.push('<span style="color:rgba(239,68,68,0.9);font-weight:600;">--- FC</span>');
    if (elevSvg)             legendParts.push('<span style="color:rgba(90,140,200,0.8);">▨ Dénivelé</span>');
    var legend = '<div style="display:flex;gap:14px;margin-bottom:5px;font-size:11px;">' + legendParts.join('') + '</div>';

    return '<div style="margin-bottom:14px;">'
      + '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;'
      + 'text-transform:uppercase;letter-spacing:0.05em;">Analyse graphique</div>'
      + legend
      + '<div style="background:var(--bg2);border-radius:8px;padding:6px;overflow:hidden;">'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;display:block;" preserveAspectRatio="xMidYMid meet">'
      + elevSvg + gridSvg + hrSvg + paceSvg + pLabelSvg + hrLabelSvg + xLabelSvg
      + '</svg>'
      + '</div>'
      + '</div>';
  },

  // ── Vue fractionné : bâtons par tour + courbe FC stream + dénivelé ─────────
  _renderLapChart(detail, laps, streams) {
    if (laps.length < 2) return this._renderContinuousChart(detail, streams);

    var W = 600, H = 148;
    var PAD = { top: 18, right: 38, bottom: 22, left: 40 };  // top=18 pour numéros de tour
    var cW = W - PAD.left - PAD.right;
    var cH = H - PAD.top  - PAD.bottom;

    var totalDist = laps.reduce(function(s, l) { return s + (l.distance || 0); }, 0) || 1;
    var xOf = function(d) { return PAD.left + (Math.min(d, totalDist) / totalDist) * cW; };

    // Vitesses et allures par tour
    var lapSpeeds = laps.map(function(l) { return l.average_speed || 0; });
    var lapPaces  = lapSpeeds.map(function(v) { return v > 0.3 ? 1000 / v : null; });

    var validSpeeds = lapSpeeds.filter(Boolean);
    if (!validSpeeds.length) return this._renderContinuousChart(detail, streams);
    var sMin    = Math.min.apply(null, validSpeeds);
    var sMax    = Math.max.apply(null, validSpeeds);
    var sRange  = sMax - sMin || 0.1;
    var avgSpd  = (sMin + sMax) / 2;

    // Détection échauffement : premiers tours sous la moyenne avant le 1er tour rapide
    var firstWorkIdx = -1;
    for (var k = 0; k < lapSpeeds.length; k++) {
      if (lapSpeeds[k] > avgSpd) { firstWorkIdx = k; break; }
    }
    var hasWarmup = firstWorkIdx > 0;

    // FC depuis le stream continu (bien plus de détail que les moyennes par tour)
    var hrStreamData = (streams.heartrate && streams.heartrate.data) || [];
    var hrDistData   = (streams.distance  && streams.distance.data)  || [];
    var validHRS = hrStreamData.filter(Boolean);
    var hrMin = validHRS.length ? Math.max(80,  Math.min.apply(null, validHRS) - 5)  : 100;
    var hrMax = validHRS.length ? Math.min(220, Math.max.apply(null, validHRS) + 5)  : 200;
    var hrRange = hrMax - hrMin || 100;
    var yHR = function(h) { return PAD.top + cH - ((h - hrMin) / hrRange) * cH; };

    // Helpers arrondi propre
    var fmtPaceR = function(sec) {
      var r = Math.round(sec / 5) * 5;
      var m = Math.floor(r / 60), s = r % 60;
      return m + ':' + (s < 10 ? '0' + s : '' + s);
    };
    var fmtHRR = function(bpm) { return Math.round(bpm / 5) * 5; };

    // Dénivelé en fond
    var elevSvg = this._elevSvg(streams, totalDist, PAD, cW, cH, W, H);

    // ── Bâtons ────────────────────────────────────────────────────────────────
    var GUTTER  = 3;
    var BARSCALE = 0.82;  // fraction de cH utilisée pour le bâton le plus haut
    var barsSvg = '', labelsSvg = '';
    var xCursor = 0;

    laps.forEach(function(lap, idx) {
      var speed  = lapSpeeds[idx];
      var pace   = lapPaces[idx];
      var barX   = xOf(xCursor);
      var barW   = (lap.distance / totalDist) * cW;
      var barInW = Math.max(1, barW - GUTTER);

      var barH = sRange > 0 ? ((speed - sMin) / sRange) * cH * BARSCALE : cH * 0.4;
      barH = Math.max(3, barH);
      var barY = PAD.top + cH - barH;

      // Couleur : échauffement=bleu / travail=orange / récup=gris
      var color;
      if (hasWarmup && idx < firstWorkIdx) {
        color = 'rgba(59,130,246,0.68)';
      } else if (speed > avgSpd) {
        color = 'rgba(249,115,22,0.85)';
      } else {
        color = 'rgba(150,150,160,0.48)';
      }

      barsSvg += '<rect x="' + (barX + GUTTER / 2).toFixed(1) + '" y="' + barY.toFixed(1) + '"'
        + ' width="' + barInW.toFixed(1) + '" height="' + barH.toFixed(1) + '"'
        + ' rx="2" fill="' + color + '"/>';

      // Allure dans le bâton (centré, si assez large et haut)
      if (barW > 20 && pace && barH > 14) {
        var py = (barY + Math.min(barH * 0.55, 12) + 4).toFixed(1);
        labelsSvg += '<text x="' + (barX + barW / 2).toFixed(1) + '" y="' + py + '"'
          + ' text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.93)">' + fmtPaceR(pace) + '</text>';
      }

      // Numéro de tour EN HAUT (ligne fixe au-dessus de la zone graphique)
      if (barW > 10) {
        labelsSvg += '<text x="' + (barX + barW / 2).toFixed(1) + '" y="' + (PAD.top - 5) + '"'
          + ' text-anchor="middle" font-size="8" fill="rgba(128,128,128,0.85)">' + (idx + 1) + '</text>';
      }

      xCursor += lap.distance;
    });

    // ── Axe km en bas : graduation tous les 500m, label tous les 1km ──────────
    var xAxisSvg = '';
    var totalKm   = totalDist / 1000;
    var axisY     = PAD.top + cH;
    for (var km500 = 0; km500 <= Math.ceil(totalKm * 2); km500++) {
      var distM  = km500 * 500;
      if (distM > totalDist + 50) break;
      var tickX  = xOf(distM);
      var isKm   = km500 % 2 === 0;
      // Petite graduation verticale
      xAxisSvg += '<line x1="' + tickX.toFixed(1) + '" y1="' + axisY
        + '" x2="' + tickX.toFixed(1) + '" y2="' + (axisY + (isKm ? 4 : 2)) + '"'
        + ' stroke="rgba(128,128,128,' + (isKm ? '0.5' : '0.25') + ')" stroke-width="1"/>';
      // Label km (pas le 0)
      if (isKm && km500 > 0) {
        xAxisSvg += '<text x="' + tickX.toFixed(1) + '" y="' + (H - 4) + '"'
          + ' text-anchor="middle" font-size="9" fill="rgba(128,128,128,0.75)">'
          + (km500 / 2) + 'km</text>';
      }
    }

    // ── Courbe FC stream continu ───────────────────────────────────────────────
    var hrStreamSvg = '';
    if (hrStreamData.length > 5 && hrDistData.length > 5) {
      var hStep = Math.max(1, Math.floor(hrStreamData.length / 350));
      var hrPath = '', prevOk = false;
      for (var i = 0; i < hrStreamData.length; i += hStep) {
        var hv = hrStreamData[i], hd = hrDistData[i];
        if (!hv || hd === undefined) { prevOk = false; continue; }
        var hx = xOf(hd).toFixed(1);
        var hy = yHR(hv).toFixed(1);
        hrPath += (prevOk ? 'L' : 'M') + hx + ',' + hy + ' ';
        prevOk = true;
      }
      if (hrPath) {
        hrStreamSvg = '<path d="' + hrPath + '" fill="none" stroke="rgba(239,68,68,0.88)"'
          + ' stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>';
      }
    }

    // ── Labels Y allure (gauche) ───────────────────────────────────────────────
    var pLabelSvg = '';
    var speedToY = function(sp) {
      var h = sRange > 0 ? ((sp - sMin) / sRange) * cH * BARSCALE : cH * 0.4;
      return PAD.top + cH - Math.max(3, h);
    };
    [sMin, (sMin + sMax) / 2, sMax].forEach(function(sp) {
      if (!sp) return;
      var y = speedToY(sp).toFixed(1);
      pLabelSvg += '<text x="' + (PAD.left - 3) + '" y="' + y + '" text-anchor="end"'
        + ' dominant-baseline="middle" font-size="8" fill="rgba(249,115,22,0.9)">'
        + fmtPaceR(1000 / sp) + '</text>';
    });

    // ── Labels Y FC (droite) ───────────────────────────────────────────────────
    var hrLabelSvg = '';
    if (hrStreamSvg) {
      [hrMin, Math.round((hrMin + hrMax) / 2), hrMax].forEach(function(h) {
        var y = yHR(h).toFixed(1);
        hrLabelSvg += '<text x="' + (W - PAD.right + 4) + '" y="' + y + '"'
          + ' dominant-baseline="middle" font-size="8" fill="rgba(239,68,68,0.9)">' + fmtHRR(h) + '</text>';
      });
    }

    // ── Légende ────────────────────────────────────────────────────────────────
    var legendParts = [];
    if (hasWarmup) legendParts.push('<span style="color:rgba(59,130,246,0.9);font-weight:600;">█ Échauff.</span>');
    legendParts.push('<span style="color:rgba(249,115,22,0.95);font-weight:600;">█ Travail</span>');
    legendParts.push('<span style="color:rgba(150,150,160,0.85);">█ Récup</span>');
    if (hrStreamSvg) legendParts.push('<span style="color:rgba(239,68,68,0.9);font-weight:600;">— FC</span>');
    if (elevSvg)     legendParts.push('<span style="color:rgba(90,140,200,0.8);">▨ Dénivelé</span>');
    var legend = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:5px;font-size:11px;">' + legendParts.join('') + '</div>';

    return '<div style="margin-bottom:14px;">'
      + '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px;'
      + 'text-transform:uppercase;letter-spacing:0.05em;">Analyse par tour</div>'
      + legend
      + '<div style="background:var(--bg2);border-radius:8px;padding:6px;overflow:hidden;">'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;display:block;" preserveAspectRatio="xMidYMid meet">'
      + elevSvg + barsSvg + hrStreamSvg + xAxisSvg + pLabelSvg + hrLabelSvg + labelsSvg
      + '</svg>'
      + '</div>'
      + '</div>';
  },

  async loadActivityDetail(id) {
    const detailDiv = document.getElementById('detail-' + id);
    if (!detailDiv) return;

    // Évite de recharger si déjà affiché
    if (detailDiv.dataset.loaded === '1') return;
    detailDiv.style.display = 'block';

    const detail = await Strava.fetchActivityDetail(id);
    if (!detail) {
      detailDiv.innerHTML = '<div style="font-size:12px;color:var(--text-hint);text-align:center;">Données détaillées non disponibles</div>';
      return;
    }

    const splits = detail.splits_metric || [];
    const zones  = detail.zones || [];
    const hrZone = zones.find(z => z.type === 'heartrate');
    const zoneColors = ['#3B82F6','#22C55E','#EAB308','#F97316','#EF4444'];
    const zoneNames  = ['Z1 Récup','Z2 Endurance','Z3 Tempo','Z4 Seuil','Z5 Max'];

    // Splits
    const splitsHtml = splits.length > 0 ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Km par km</div>
        ${splits.map((s, i) => {
          const paceVal = s.average_speed ? 1000 / s.average_speed : 0;
          const paceStr = paceVal > 0 ? Math.floor(paceVal/60) + ':' + String(Math.round(paceVal%60)).padStart(2,'0') : '--:--';
          const elev    = s.elevation_difference || 0;
          const elevStr = elev > 0 ? '+'+Math.round(elev)+'m' : Math.round(elev)+'m';
          return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--border);">
            <div style="width:28px;font-size:12px;font-weight:700;color:var(--orange);">K${i+1}</div>
            <div style="flex:1;font-size:13px;font-weight:500;">${paceStr}<span style="font-size:11px;color:var(--text-muted);">/km</span></div>
            <div style="font-size:12px;color:var(--text-muted);">${s.average_heartrate ? Math.round(s.average_heartrate)+' bpm' : ''}</div>
            <div style="font-size:11px;color:${elev > 0 ? 'var(--red)' : 'var(--green)'};">${elevStr}</div>
          </div>`;
        }).join('')}
      </div>` : '';

    // Zones FC
    const zonesHtml = hrZone?.distribution_buckets?.length > 0 ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Zones cardiaques</div>
        ${hrZone.distribution_buckets.map((b, i) => {
          const totalTime = hrZone.distribution_buckets.reduce((s, bb) => s + bb.time, 0);
          const pct = totalTime > 0 ? Math.round(b.time / totalTime * 100) : 0;
          const mins = Math.round(b.time / 60);
          return `<div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
              <span style="font-size:12px;color:${zoneColors[i]};">${zoneNames[i] || 'Zone '+(i+1)}</span>
              <span style="font-size:12px;color:var(--text-muted);">${mins} min · ${pct}%</span>
            </div>
            <div style="height:4px;background:var(--bg3);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${zoneColors[i]};border-radius:4px;"></div>
            </div>
          </div>`;
        }).join('')}
      </div>` : '';

    // Description Strava
    const descHtml = detail.description ? `
      <div style="margin-bottom:12px;padding:10px;background:var(--bg2);border-radius:var(--radius);">
        <div style="font-size:11px;color:var(--text-hint);margin-bottom:4px;">NOTE STRAVA</div>
        <div style="font-size:13px;color:var(--text);">${detail.description}</div>
      </div>` : '';

    // Patch calories + chaussures dans le header (non dispo dans la liste Strava)
    const calEl  = document.getElementById('act-cal-'  + id);
    const gearEl = document.getElementById('act-gear-' + id);
    if (calEl  && detail.calories)              calEl.textContent  = Math.round(detail.calories) + ' kcal';
    if (gearEl && detail.gear && detail.gear.name) gearEl.textContent = detail.gear.name.slice(0, 10);

    var chartHtml = this.renderStreamsChart(detail);
    var mapHtml   = '';  // carte OSM déjà dans la card via Leaflet (summary_polyline)
    detailDiv.innerHTML = chartHtml + mapHtml + splitsHtml + zonesHtml + descHtml ||
      '<div style="font-size:12px;color:var(--text-hint);text-align:center;">Pas de données détaillées disponibles</div>';
    detailDiv.dataset.loaded = '1';
  },

  // ── Stats annuelles ───────────────────────────────────────────────────────────
  renderYearStats(statsArr) {
    // Accepte un tableau de stats (ordre : année la plus récente en premier)
    if (!Array.isArray(statsArr)) {
      // Rétrocompatibilité si appelé avec les anciens paramètres (s2025, s2026)
      statsArr = [arguments[1], arguments[0]].filter(Boolean);
    }
    const fmtKm  = km  => km.toFixed(0) + ' km';
    const fmtDur = sec => {
      const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
      return h + 'h' + (m < 10 ? '0' : '') + m;
    };
    const fmtPace = sec => {
      if (!sec) return '--';
      const m = Math.floor(sec / 60), s = Math.round(sec % 60);
      return m + ':' + (s < 10 ? '0' + s : '' + s) + '/km';
    };
    const fmtElev = m => '+' + m.toLocaleString('fr-FR') + ' m';

    const row = (s) => {
      if (!s) return '';
      const longestStr = s.longestKm ? s.longestKm.toFixed(1) + ' km' : '--';
      const stat = (val, lbl) => `<div style="min-width:0;">
        <div style="font-size:15px;font-weight:700;color:var(--text);white-space:nowrap;">${val}</div>
        <div style="font-size:10px;color:var(--text-hint);margin-top:1px;">${lbl}</div>
      </div>`;
      return `
        <div class="year-stats-row" style="padding:8px 0;border-bottom:0.5px solid var(--border);">
          <div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:6px;">${s.year}</div>
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;text-align:center;">
            ${stat(s.count, 'courses')}
            ${stat(fmtKm(s.totalKm), 'distance')}
            ${stat(fmtDur(s.totalSeconds), 'temps')}
            ${stat(fmtElev(s.totalElevation), 'D+')}
            ${stat(fmtPace(s.avgPace), 'allure')}
            ${stat(longestStr, 'max')}
          </div>
        </div>`;
    };

    return statsArr.map(s => row(s)).join('');
  },

  // ── Carte OSM Leaflet (lazy via IntersectionObserver) ────────────────────────
  initMapObserver() {
    var self = this;
    if (!window.L) {
      // Leaflet pas encore chargé → réessayer dans 500ms
      setTimeout(function() { self.initMapObserver(); }, 500);
      return;
    }
    var maps = document.querySelectorAll('.act-leafmap[data-polyline]:not([data-inited])');
    if (!maps.length) return;

    if (!this._mapObs) {
      this._mapObs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          if (el.dataset.inited) return;
          el.dataset.inited = '1';
          self._initLeafletMap(el);
          self._mapObs.unobserve(el);
        });
      }, { rootMargin: '200px', threshold: 0 });
    }
    maps.forEach(function(el) { self._mapObs.observe(el); });
  },

  _initLeafletMap(el) {
    var coords = this._decodePolyline(el.dataset.polyline || '');
    if (coords.length < 2) { el.style.display = 'none'; return; }

    var map = L.map(el, {
      zoomControl:       false,
      dragging:          false,
      scrollWheelZoom:   false,
      doubleClickZoom:   false,
      touchZoom:         false,
      boxZoom:           false,
      keyboard:          false,
      attributionControl: false,
      tap:               false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    }).addTo(map);

    var line = L.polyline(coords, { color: '#f97316', weight: 3, opacity: 0.95 }).addTo(map);

    // Point de départ (vert) et d'arrivée (rouge)
    var startIcon = L.divIcon({ className: '', html: '<div style="width:10px;height:10px;background:#22C55E;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>', iconSize: [10,10], iconAnchor: [5,5] });
    var endIcon   = L.divIcon({ className: '', html: '<div style="width:10px;height:10px;background:#EF4444;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>', iconSize: [10,10], iconAnchor: [5,5] });
    L.marker(coords[0],              { icon: startIcon }).addTo(map);
    L.marker(coords[coords.length-1],{ icon: endIcon   }).addTo(map);

    // Attribution minuscule en bas à droite
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);

    map.fitBounds(line.getBounds(), { padding: [14, 14] });
  },

  _decodePolyline(encoded) {
    // Décodeur Google Encoded Polyline Algorithm
    var pts = [], idx = 0, lat = 0, lng = 0;
    while (idx < encoded.length) {
      var b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      pts.push([lat / 1e5, lng / 1e5]);
    }
    return pts;
  },

  // ── Carte GPS avec tracé SVG (legacy — conservé mais non appelé) ─────────────
  _renderMapTrace(detail) {
    var stream = detail.streams && detail.streams.latlng;
    if (!stream || !stream.data || stream.data.length < 10) return '';

    var coords = stream.data;
    // Downsampling → ~600 pts max
    var step = Math.max(1, Math.floor(coords.length / 600));
    var pts  = [];
    for (var i = 0; i < coords.length; i += step) pts.push(coords[i]);

    // Bounding box
    var lats   = pts.map(function(p) { return p[0]; });
    var lngs   = pts.map(function(p) { return p[1]; });
    var latMin = Math.min.apply(null, lats), latMax = Math.max.apply(null, lats);
    var lngMin = Math.min.apply(null, lngs), lngMax = Math.max.apply(null, lngs);
    var latMid = (latMin + latMax) / 2;
    var latRange = latMax - latMin || 0.0001;
    var lngRange = lngMax - lngMin || 0.0001;

    // Correction Mercator : 1° lng ≠ 1° lat en distance
    var lngCorr = lngRange * Math.cos(latMid * Math.PI / 180);

    var VW = 400, VH = 400, PAD = 24;
    var avW = VW - PAD * 2, avH = VH - PAD * 2;
    var sc  = Math.min(avW / lngCorr, avH / latRange);
    var usedW = lngCorr * sc, usedH = latRange * sc;
    var ox = PAD + (avW - usedW) / 2;
    var oy = PAD + (avH - usedH) / 2;
    var cosLat = Math.cos(latMid * Math.PI / 180);

    var toX = function(lng) { return ox + (lng - lngMin) * cosLat * sc; };
    var toY = function(lat) { return oy + usedH - (lat - latMin) * sc; };

    var pathD = pts.map(function(p, i) {
      return (i === 0 ? 'M' : 'L') + toX(p[1]).toFixed(1) + ',' + toY(p[0]).toFixed(1);
    }).join(' ');

    var sx = toX(pts[0][1]).toFixed(1),             sy = toY(pts[0][0]).toFixed(1);
    var ex = toX(pts[pts.length-1][1]).toFixed(1),  ey = toY(pts[pts.length-1][0]).toFixed(1);
    var mid = pts.length > 1 ? pts[Math.floor(pts.length / 2)] : pts[0];
    var mx = toX(mid[1]).toFixed(1), my = toY(mid[0]).toFixed(1);
    var mapId = 'gpsmap-' + detail.id;

    return '<div style="margin-bottom:14px;">'
      + '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;'
      + 'text-transform:uppercase;letter-spacing:0.05em;">Tracé GPS</div>'
      + '<div id="' + mapId + '" onclick="UI.toggleMap(\'' + mapId + '\')" '
      + 'style="background:var(--bg3);border-radius:10px;overflow:hidden;cursor:pointer;'
      + 'height:180px;transition:height 0.35s ease;position:relative;">'
      + '<svg viewBox="0 0 ' + VW + ' ' + VH + '" style="width:100%;height:100%;display:block;"'
      + ' preserveAspectRatio="xMidYMid meet">'
      // Fond très léger
      + '<rect width="' + VW + '" height="' + VH + '" fill="rgba(0,0,0,0.0)"/>'
      // Tracé
      + '<path d="' + pathD + '" fill="none" stroke="rgba(249,115,22,0.9)" stroke-width="3"'
      + ' stroke-linejoin="round" stroke-linecap="round"/>'
      // Point de départ (vert)
      + '<circle cx="' + sx + '" cy="' + sy + '" r="9" fill="#22C55E" stroke="var(--bg3)" stroke-width="2.5"/>'
      // Point d'arrivée (rouge)
      + '<circle cx="' + ex + '" cy="' + ey + '" r="9" fill="#EF4444" stroke="var(--bg3)" stroke-width="2.5"/>'
      + '</svg>'
      + '<div id="' + mapId + '-hint" style="position:absolute;bottom:8px;right:10px;'
      + 'font-size:10px;color:var(--text-hint);background:var(--bg2);'
      + 'padding:2px 6px;border-radius:4px;">↕ agrandir</div>'
      + '</div>'
      + '</div>';
  },

  toggleMap(mapId) {
    var el   = document.getElementById(mapId);
    var hint = document.getElementById(mapId + '-hint');
    if (!el) return;
    var expanded = el.dataset.expanded === '1';
    el.style.height       = expanded ? '180px' : '360px';
    el.dataset.expanded   = expanded ? '0'     : '1';
    if (hint) hint.textContent = expanded ? '↕ agrandir' : '↕ réduire';
  },

  renderFeedbackForm(activity, existing) {
    const v   = existing || {};
    const aid = activity.id;

    // chip avec sauvegarde auto immédiate
    const chip = (group, val, label, danger) => {
      const isActive = v[group] === val;
      const cls = isActive ? (danger ? ' danger' : ' active-soft') : '';
      return `<div class="chip${cls}" onclick="UI.setFeedback(${aid},'${group}','${val}',this,${!!danger})">${label}</div>`;
    };

    return `
      <div class="feedback-form" id="fb-${aid}">
        <div class="feedback-title">📝 Ressenti de la séance</div>

        <!-- Ressenti global -->
        <div class="fb-section">
          <span class="fb-label">Ressenti global</span>
          <div class="chips" id="effort-chips-${aid}" style="margin-top:6px;">
            ${[[1,'😣 Très mauvaise'],[2,'😕 Difficile'],[3,'🙂 Correcte'],[4,'😊 Bonne'],[5,'🌟 Excellente']].map(([val,label]) =>
              `<div class="chip${v.effort===val?' active-soft':''}" onclick="UI.setFeedback(${aid},'effort',${val},this,false);UI.setFeedbackVal(${aid},'effort',${val})">${label}</div>`
            ).join('')}
          </div>
        </div>

        <!-- Cardio -->
        <div class="fb-section">
          <span class="fb-label">Ressenti cardio</span>
          <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px;">À quel point ton cœur travaillait ?</div>
          <div class="chips">
            ${chip('cardio','easy','😌 Facile')}
            ${chip('cardio','normal','🙂 Normal')}
            ${chip('cardio','high','😤 Haut')}
            ${chip('cardio','exploded','🔥 Explosé',true)}
          </div>
        </div>

        <!-- Jambes -->
        <div class="fb-section">
          <span class="fb-label">État des jambes</span>
          <div class="chips">
            ${chip('legs','fresh','✨ Fraîches')}
            ${chip('legs','normal','👌 Normales')}
            ${chip('legs','heavy','🧱 Lourdes')}
            ${chip('legs','pain','⚠️ Douleur',true)}
          </div>
        </div>

        <!-- Douleurs localisées -->
        <div class="fb-section">
          <span class="fb-label">Douleurs / gênes ?</span>
          <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px;">Sélectionne tout ce qui s'applique</div>
          <div class="chips" id="pain-chips-${aid}">
            <div class="chip${(v.painAreas||[]).includes('knees') ? ' danger' : ''}"    onclick="UI.togglePainArea(${aid},'knees',this)">🦵 Genoux</div>
            <div class="chip${(v.painAreas||[]).includes('calves') ? ' danger' : ''}"   onclick="UI.togglePainArea(${aid},'calves',this)">💪 Mollets</div>
            <div class="chip${(v.painAreas||[]).includes('tendons') ? ' danger' : ''}"  onclick="UI.togglePainArea(${aid},'tendons',this)">🦶 Tendons</div>
            <div class="chip${(v.painAreas||[]).includes('back') ? ' danger' : ''}"     onclick="UI.togglePainArea(${aid},'back',this)">🔙 Dos</div>
            <div class="chip${(v.painAreas||[]).includes('hips') ? ' danger' : ''}"     onclick="UI.togglePainArea(${aid},'hips',this)">🍑 Hanches</div>
            <div class="chip${(v.painAreas||[]).includes('sick') ? ' danger' : ''}"      onclick="UI.togglePainArea(${aid},'sick',this)">🤒 Malade</div>
            <div class="chip${(v.painAreas||[]).includes('none') ? ' active-soft' : ''}" onclick="UI.togglePainArea(${aid},'none',this)">✅ Aucune</div>
          </div>
          ${(v.painAreas||[]).filter(p => p !== 'none').length > 0 ? `
          <textarea class="field-input field-textarea" style="margin-top:8px;min-height:50px;" placeholder="Décris la douleur (intensité, moment dans la course...)"
            oninput="UI.setFeedbackVal(${aid},'painDetail',this.value)">${v.painDetail||''}</textarea>` : ''}
        </div>

        <!-- Mental -->
        <div class="fb-section">
          <span class="fb-label">État mental</span>
          <div class="chips">
            ${chip('mental','easy','😎 Facile')}
            ${chip('mental','motivated','💪 Motivé')}
            ${chip('mental','hard','😣 Dur')}
            ${chip('mental','struggling','😤 En lutte')}
          </div>
        </div>

        <!-- Conditions -->
        <div class="fb-section">
          <span class="fb-label">Conditions</span>
          <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px;">Météo</div>
          <div class="chips" style="margin-bottom:10px;">
            ${chip('weather','sunny','☀️ Beau')}
            ${chip('weather','hot','🌡️ Chaud')}
            ${chip('weather','cloudy','🌥 Nuageux')}
            ${chip('weather','rain','🌧 Pluie')}
            ${chip('weather','humid','💧 Humide/Lourd')}
            ${chip('weather','wind','💨 Vent')}
            ${chip('weather','cold','🥶 Froid')}
          </div>

          <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px;">Sommeil la nuit précédente</div>
          <div class="chips" style="margin-bottom:12px;">
            ${chip('sleep','bad','😴 Mauvais',true)}
            ${chip('sleep','ok','😐 Moyen')}
            ${chip('sleep','good','😊 Bon')}
            ${chip('sleep','great','🌟 Excellent')}
          </div>

          <div class="fb-section" style="margin-bottom:0;">
            <span class="fb-label" style="font-size:13px;">Fatigue avant la course</span>
            <div class="chips" id="fatigue-chips-${aid}" style="margin-top:6px;">
              ${[[1,'✨ Reposé'],[2,'👌 Ok'],[3,'😐 Moyen'],[4,'😓 Fatigué'],[5,'💀 Épuisé']].map(([val,label]) =>
                `<div class="chip${v.fatigue===val?' active-soft':''}" onclick="UI.setFeedback(${aid},'fatigue',${val},this,false);UI.setFeedbackVal(${aid},'fatigue',${val})">${label}</div>`
              ).join('')}
            </div>
          </div>
        </div>

        <!-- Commentaire -->
        <div class="fb-section">
          <span class="fb-label">Commentaire libre</span>
          <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px;">Nutrition, contexte, sensations particulières, ce qui s'est passé...</div>
          <textarea class="field-input field-textarea" placeholder="Tout ce qui peut aider le coach à comprendre cette séance..."
            oninput="UI.setFeedbackVal(${aid},'comment',this.value)">${v.comment || ''}</textarea>
        </div>

        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn-secondary" style="flex:1;" onclick="UI.saveFeedbackOnly(${aid})">💾 Sauvegarder</button>
          <button class="btn-primary" style="flex:1;" onclick="App.analyzeActivity(${aid})">Analyser →</button>
        </div>
      </div>`;
  },

  saveFeedbackOnly(actId) {
    const fb = Storage.getFeedback(actId);
    if (fb) {
      Storage.saveFeedback(actId, fb);
      UI.toast('Ressenti sauvegardé ✓');
      // Met à jour le badge sur la card
      const card = document.getElementById('act-' + actId);
      if (card) card.classList.add('has-feedback');
    }
  },

  toggleActivity(id) {
    const card = document.getElementById('act-' + id);
    if (!card) return;
    const isOpen = card.classList.contains('open');
    if (isOpen) {
      card.classList.remove('open');
      // Cache le détail ET le feedback
      const detailDiv = document.getElementById('detail-' + id);
      const fbDiv     = document.getElementById('fb-' + id);
      if (detailDiv) detailDiv.style.display = 'none';
      if (fbDiv)     fbDiv.style.display = 'none';
    } else {
      card.classList.add('open');
      // Réaffiche le feedback s'il existait
      const fbDiv = document.getElementById('fb-' + id);
      if (fbDiv) fbDiv.style.display = 'block';
      this.loadActivityDetail(id);
    }
  },

  _pendingFeedbacks: {},
  setFeedback(actId, group, val, el, isDanger) {
    const container = el.closest('.chips');
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('active-soft','danger','active'));
    el.classList.add(isDanger ? 'danger' : 'active-soft');
    this.setFeedbackVal(actId, group, val);
  },

  togglePainArea(actId, area, el) {
    if (!this._pendingFeedbacks[actId]) {
      this._pendingFeedbacks[actId] = { ...(Storage.getFeedback(actId) || {}) };
    }
    const fb = this._pendingFeedbacks[actId];
    if (!fb.painAreas) fb.painAreas = [];

    if (area === 'none') {
      // Sélectionne "Aucune" et désélectionne tout le reste
      fb.painAreas = ['none'];
      document.querySelectorAll(`#pain-chips-${actId} .chip`).forEach(c => c.classList.remove('danger','active-soft'));
      el.classList.add('active-soft');
    } else {
      // Retire "Aucune" si on sélectionne une zone
      fb.painAreas = fb.painAreas.filter(p => p !== 'none');
      document.querySelector(`#pain-chips-${actId} .chip:last-child`)?.classList.remove('active-soft');

      const idx = fb.painAreas.indexOf(area);
      if (idx > -1) {
        fb.painAreas.splice(idx, 1);
        el.classList.remove('danger');
      } else {
        fb.painAreas.push(area);
        el.classList.add('danger');
      }
    }

    Storage.saveFeedback(actId, fb);

    // Affiche/masque le textarea de détail douleur
    const formEl = document.getElementById('fb-' + actId);
    const hasPain = fb.painAreas.some(p => p !== 'none');
    const existingTA = formEl?.querySelector('.pain-detail-ta');
    if (hasPain && !existingTA) {
      const ta = document.createElement('textarea');
      ta.className = 'field-input field-textarea pain-detail-ta';
      ta.style.marginTop = '8px';
      ta.style.minHeight = '50px';
      ta.placeholder = 'Décris la douleur (intensité, moment dans la course...)';
      ta.value = fb.painDetail || '';
      ta.oninput = () => this.setFeedbackVal(actId, 'painDetail', ta.value);
      document.getElementById('pain-chips-' + actId)?.after(ta);
    } else if (!hasPain && existingTA) {
      existingTA.remove();
    }
  },

  setFeedbackVal(actId, key, val) {
    if (!this._pendingFeedbacks[actId]) {
      this._pendingFeedbacks[actId] = { ...(Storage.getFeedback(actId) || {}) };
    }
    this._pendingFeedbacks[actId][key] = val;
    Storage.saveFeedback(actId, this._pendingFeedbacks[actId]);
  },

  // ===== HELPERS PLAN =====

  // Trie les jours d'un plan dans l'ordre calendaire Lun→Dim
  _sortDays(days) {
    var order = {Lun:0,Mar:1,Mer:2,Jeu:3,Ven:4,Sam:5,Dim:6};
    return days.slice().sort(function(a, b) {
      var oa = order[a.day] !== undefined ? order[a.day] : 7;
      var ob = order[b.day] !== undefined ? order[b.day] : 7;
      return oa - ob;
    });
  },

  // Retourne un map {Lun: Date, Mar: Date, ...} pour la semaine décalée de weekOffset
  _getWeekDates(weekOffset) {
    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset + weekOffset * 7);
    const dayNames = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const map = {};
    dayNames.forEach(function(name, i) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      map[name] = d;
    });
    return map;
  },

  // Types de séances sans phases (ligne simple)
  _SIMPLE_TYPES: {'ef':1,'sl':1,'recup':1,'rest':1},

  // Résout le type réel d'une séance (corrige les erreurs IA via le label)
  _resolveType(d) {
    var t = d.type || 'ef';
    var lbl = (d.label || '').toLowerCase();
    if (/sortie.{0,12}long|long.{0,12}run/.test(lbl)) return 'sl';
    if (/fraction|vma|interval|speed|rapide/.test(lbl)) return 'work';
    if (/seuil|tempo|threshold/.test(lbl)) return 'tempo';
    if (/r[ée]cup|recovery|repos/.test(lbl)) return 'recup';
    return t;
  },

  // Génère le HTML d'une ligne de séance
  // Extrait le sous-type court d'une séance intense (VMA, Seuil, Tempo…)
  _getIntensityBadge(d, resolvedType) {
    if (resolvedType !== 'work' && resolvedType !== 'vma' && resolvedType !== 'tempo') return null;
    const lbl = (d.label || '').toLowerCase();
    if (/\bvma\b/.test(lbl))                         return 'VMA';
    if (/seuil|threshold/.test(lbl))                 return 'Seuil';
    if (/tempo/.test(lbl))                           return 'Tempo';
    if (/court|short|rapide/.test(lbl))              return 'VMA';
    if (resolvedType === 'tempo')                    return 'Seuil';
    return 'VMA'; // work sans précision → VMA par défaut
  },

  _renderPlanDay(d, weekDates, now, skipPast) {
    const typeClass = {ef:'pill-ef',tempo:'pill-tempo',vma:'pill-vma',work:'pill-vma',sl:'pill-sl',rest:'pill-rest',recup:'pill-rest',free:'pill-ef',test:'pill-test',seuil:'pill-tempo',threshold:'pill-tempo'};
    const resolvedType = this._resolveType(d);
    const date = weekDates[d.day];
    if (skipPast && date) {
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59);
      if (dayEnd < now) return '';
    }
    const isToday = date && date.toDateString() === now.toDateString();
    const dateNum = date ? date.getDate() : '';
    const dayLabel = d.day + (dateNum ? ' ' + dateNum : '');
    const intensityBadge = this._getIntensityBadge(d, resolvedType);
    // Corrige le label si incohérent avec le type résolu (ex: label "EF" mais type sl)
    const _typeDefaultLabel = { ef:'Endurance fondamentale', sl:'Sortie longue', tempo:'Séance seuil', work:'Fractionné', recup:'Récupération', free: d.label };
    const _labelOk = (() => {
      const l = (d.label||'').toLowerCase();
      if (resolvedType==='sl')    return /sortie|long/.test(l);
      if (resolvedType==='work')  return /fraction|vma|interval/.test(l);
      if (resolvedType==='tempo') return /seuil|tempo|threshold/.test(l);
      if (resolvedType==='ef')    return /endurance|fonda|footing|ef\b/.test(l);
      return true;
    })();
    const displayLabel = _labelOk ? d.label : (_typeDefaultLabel[resolvedType] || d.label);
    const pillLabel = intensityBadge ? ('⚡ ' + intensityBadge) : displayLabel;
    // Pour les séances intenses avec badge : afficher le label complet dans le détail
    const detailHtml = this._SIMPLE_TYPES[resolvedType]
      ? (d.detail ? '<div class="session-detail" style="margin-top:3px;">' + this._extractWorkPart(d.detail) + '</div>' : '')
      : (intensityBadge
          ? '<div class="session-detail" style="margin-top:2px;font-size:12px;color:var(--text-muted);">' + d.label + '</div>'
            + this._renderSessionPhases(d.detail, d.label)
          : this._renderSessionPhases(d.detail, d.label));
    return '<div class="day-row">' +
      '<div class="day-name' + (isToday ? ' today' : '') + '">' + dayLabel + '</div>' +
      '<div style="flex:1;">' +
      '<span class="session-pill ' + (typeClass[resolvedType] || 'pill-ef') + '">' + pillLabel + '</span>' +
      detailHtml +
      '</div>' +
      '</div>';
  },

  // Découpe le detail en phases (échauffement · travail · récup) et ajoute le titre Strava
  _renderSessionPhases(detail, label) {
    if (!detail) return '';

    // Tentative 1 : séparateur · (format cible)
    let parts = detail.split('·').map(function(p) { return p.trim(); }).filter(Boolean);

    // Tentative 2 : si pas de ·, essaie de détecter les phases par mots-clés
    if (parts.length <= 1) {
      parts = this._detectPhases(detail);
    }

    // Pas de phases détectées → affichage simple
    if (parts.length <= 1) {
      return '<div class="session-detail" style="margin-top:3px;">' + detail + '</div>';
    }

    const workParts = parts.length > 2 ? parts.slice(1, parts.length - 1) : [parts[0]];
    const stravaTitle = label + ' — ' + workParts.join(' + ');
    const safeTitle = stravaTitle.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    let html = '';
    parts.forEach(function(p, i) {
      const icon = (i === 0) ? '🟡' : (i === parts.length - 1) ? '🟢' : '🔴';
      html += '<div class="session-phase">' + icon + ' ' + p + '</div>';
    });
    html += '<div class="session-strava-title" onclick="navigator.clipboard.writeText(\'' + safeTitle + '\').then(function(){UI.toast(\'📋 Copié !\')}).catch(function(){UI.toast(\'Copie manuelle\')})">📋 <span>' + stravaTitle + '</span></div>';
    return html;
  },

  // Pour EF/SL/récup : si Gemini a quand même mis des ·, extrait uniquement la partie travail
  _extractWorkPart(detail) {
    var parts = detail.split('·').map(function(p) { return p.trim(); }).filter(Boolean);
    if (parts.length === 3) return parts[1]; // échauffement · TRAVAIL · récup → garde le milieu
    if (parts.length === 2) return parts[0]; // TRAVAIL · récup → garde le début
    return detail; // pas de · → affiche tel quel
  },

  // Détecte les phases dans du texte libre (quand pas de séparateur ·)
  _detectPhases(detail) {
    // Split sur "puis" — séparateur naturel utilisé par Gemini
    var parts = detail.split(/,?\s+puis\s+/i).map(function(p) { return p.trim(); }).filter(Boolean);

    if (parts.length >= 2) {
      // Retire le préfixe "X km : " du premier bloc (ex: "7 km : 2 km échauffement...")
      parts[0] = parts[0].replace(/^[\d\.]+\s*km\s*:\s*/i, '').trim();
      // Retire les phrases de conseil en fin du dernier bloc (ex: "... Écoute bien tes hanches.")
      var last = parts[parts.length - 1];
      last = last.replace(/\.\s+[A-ZÀ-Ü][^.]{5,80}\.$/, '.').trim();
      parts[parts.length - 1] = last;
      return parts;
    }

    return [detail];
  },

  // ===== PLAN TAB =====
  renderPlanTab(plan, isLoading) {
    const el = document.getElementById('plan-content');
    if (isLoading) {
      el.innerHTML = `<div class="loading-state"><div class="spinner"></div><div class="loading-text">Génération du plan en cours...</div></div>`;
      return;
    }
    if (!plan?.weeks) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <div class="empty-state-title">Pas encore de plan</div>
          <div class="empty-state-sub">Configure ton profil et connecte Strava pour que ton coach génère un plan personnalisé.</div>
          <button class="btn-primary" style="margin: 20px auto 0; max-width: 280px;" onclick="App.generatePlan()">Générer mon plan →</button>
        </div>`;
      return;
    }

    const now = new Date();
    const weekDates0 = this._getWeekDates(0);
    const weekDates1 = this._getWeekDates(1);

    const renderWeekBlock = (week, weekDates, skipPast, forceTitle) => {
      const daysHtml = this._sortDays(week.days)
        .filter(d => d.type !== 'rest' && d.type !== 'recup')
        .map(d => this._renderPlanDay(d, weekDates, now, skipPast))
        .filter(Boolean)
        .join('');
      const title = forceTitle || week.title;
      return '<div><div class="week-header"><div class="week-title">' + title + '</div><span class="volume-badge">' + week.volume_km + ' km</span></div>' +
        '<div class="card" style="padding: 8px 14px;">' + (daysHtml || '<div style="padding:8px 0;font-size:13px;color:var(--text-hint);text-align:center;">Aucune séance cette semaine</div>') + '</div></div>';
    };

    let weeksHtml = '';
    // Semaine courante (jours restants avec dates réelles)
    if (plan.weeks[0]) weeksHtml += renderWeekBlock(plan.weeks[0], weekDates0, true, 'Cette semaine');
    // Semaine suivante complète (avec dates réelles)
    if (plan.weeks[1]) weeksHtml += renderWeekBlock(plan.weeks[1], weekDates1, false, 'Semaine prochaine');
    // Semaines suivantes sans filtrage de date
    for (let i = 2; i < plan.weeks.length; i++) {
      const wDates = this._getWeekDates(i);
      weeksHtml += renderWeekBlock(plan.weeks[i], wDates, false, null);
    }

    el.innerHTML = `
      <div class="section-header">
        <div class="section-title">Plan d'entraînement</div>
        <button class="btn-ghost" onclick="App.generatePlan()">↻ Recalculer</button>
      </div>
      ${weeksHtml}
      <button class="btn-ghost" style="width:100%;margin-top:8px;text-align:center;" onclick="App.chatWithCoach('Explique-moi les détails de mon plan et les objectifs de chaque séance.')">Explications du plan →</button>`;
  },

  // ===== COACH TAB =====
  renderCoachTab() {
    const el = document.getElementById('coach-content');
    const suggestions = [
      '🎯 Quelle est mon allure cible ?',
      '📊 Analyse ma charge récente',
      '🫀 Explique mes zones cardiaques',
      '⚠️ Suis-je en surmenage ?',
      '🍌 Nutrition avant une longue sortie',
      '🦵 Étirements après l\'effort'
    ];

    el.innerHTML = `
      <div class="chat-wrap">
        <div class="chat-messages" id="chat-messages"></div>
        <div>
          <div class="chat-suggestions">
            ${suggestions.map(s => `<button class="suggestion-btn" onclick="App.sendChat('${s.replace(/'/g,"\\'")}')">${s}</button>`).join('')}
          </div>
          <div class="chat-input-area">
            <textarea class="chat-input" id="chat-input" rows="1" placeholder="Pose une question à ton coach..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();App.sendChat();}"></textarea>
            <button class="chat-send" id="chat-send-btn" onclick="App.sendChat()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>`;

    this.renderChatMessages();
  },

  renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const history = Storage.getChatHistory();

    if (history.length === 0) {
      container.innerHTML = `
        <div class="msg-row">
          <div class="msg-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>
          <div class="msg-bubble coach">👋 Je suis ton coach running personnel. Je peux analyser tes séances Strava, ajuster ton plan selon ta fatigue et ton contexte, et répondre à toutes tes questions. Par quoi on commence ?</div>
        </div>`;
    } else {
      container.innerHTML = history.map(m => m.role === 'user'
        ? `<div class="msg-row user"><div class="msg-bubble user">${this.escapeHtml(m.content)}</div></div>`
        : `<div class="msg-row">
             <div class="msg-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>
             <div class="msg-bubble coach">${this.formatCoachMessage(m.content)}</div>
           </div>`
      ).join('');
    }
    container.scrollTop = container.scrollHeight;
  },

  addLoadingBubble() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'msg-row';
    el.id = 'loading-bubble';
    el.innerHTML = `
      <div class="msg-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>
      <div class="msg-bubble coach loading"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  },

  removeLoadingBubble() {
    document.getElementById('loading-bubble')?.remove();
  },

  formatCoachMessage(text) {
    try {
      // 1. Supprime les blocs code markdown (```...```) autour du JSON
      text = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, function(_, inner) { return inner.trim(); });

      // 2. Extrait tous les blocs JSON ({..} ou [..]) — rendu plan si {"weeks":}, sinon supprimé
      var planHtml = '';
      var self2    = this;

      function findJsonEnd(txt, start, openC, closeC) {
        var d = 0;
        for (var k = start; k < txt.length; k++) {
          if (txt[k] === openC) d++;
          else if (txt[k] === closeC) { d--; if (d === 0) return k; }
        }
        return -1;
      }

      var cleaned2 = '', pos2 = 0;
      while (pos2 < text.length) {
        var bi = text.indexOf('{', pos2);
        var ai = text.indexOf('[', pos2);
        var si = -1, oc = '', cc = '';
        if (bi !== -1 && (ai === -1 || bi < ai)) { si = bi; oc = '{'; cc = '}'; }
        else if (ai !== -1)                       { si = ai; oc = '['; cc = ']'; }
        if (si === -1) { cleaned2 += text.slice(pos2); break; }
        cleaned2 += text.slice(pos2, si);
        var ei = findJsonEnd(text, si, oc, cc);
        if (ei === -1) { cleaned2 += text.slice(si); break; }
        try {
          var parsed = JSON.parse(text.slice(si, ei + 1));
          if (parsed && parsed.weeks && Array.isArray(parsed.weeks)) {
            planHtml = self2._renderInlinePlan(parsed);
          }
          // Autre JSON valide → supprimé silencieusement
        } catch(e) {
          cleaned2 += text.slice(si, ei + 1); // Pas du JSON → conservé
        }
        pos2 = ei + 1;
      }
      text = cleaned2.trim();

      // 3. Traitement ligne par ligne
      var self    = this;
      var lines   = text.split('\n');
      var parts   = [];
      var listBuf = [];
      var numBuf  = [];

      function flushList() {
        if (listBuf.length) { parts.push('<ul class="coach-list">' + listBuf.join('') + '</ul>'); listBuf = []; }
        if (numBuf.length)  { parts.push('<ol class="coach-list">'  + numBuf.join('')  + '</ol>'); numBuf = []; }
      }

      // Détecte si une ligne commence par un emoji (code point > 0x2000)
      function startsWithEmoji(s) {
        if (!s) return false;
        var code = s.codePointAt(0);
        return code > 0x2000;
      }

      lines.forEach(function(raw) {
        var line = raw.trim();
        if (!line) { flushList(); parts.push('<div class="coach-spacer"></div>'); return; }

        // Titre de section : commence par emoji OU ##/### OU ligne **Texte** seul
        var isHeading = startsWithEmoji(line)
          || /^#{1,3}\s/.test(line)
          || /^\*\*[^*]+\*\*\s*:?\s*$/.test(line);

        if (isHeading) {
          flushList();
          var cleaned = line.replace(/^#{1,3}\s/, '').replace(/\*\*/g, '');
          parts.push('<div class="coach-section-title">' + self.escapeHtml(cleaned) + '</div>');
          return;
        }

        // Liste à puces (- ou •)
        var bulletMatch = line.match(/^[-•]\s+(.+)/);
        if (bulletMatch) {
          if (numBuf.length) flushList();
          listBuf.push('<li>' + self._formatInline(bulletMatch[1]) + '</li>');
          return;
        }

        // Liste numérotée (1. 2. etc.)
        var numMatch = line.match(/^(\d+)[.)]\s+(.+)/);
        if (numMatch) {
          if (listBuf.length) flushList();
          numBuf.push('<li>' + self._formatInline(numMatch[2]) + '</li>');
          return;
        }

        // Ligne normale
        flushList();
        parts.push('<p class="coach-p">' + self._formatInline(line) + '</p>');
      });

      flushList();
      if (planHtml) parts.push(planHtml);

      return parts.join('') || this.escapeHtml(text).replace(/\n/g, '<br>');

    } catch(e) {
      // Fallback si erreur inattendue
      return this.escapeHtml(text).replace(/\n/g, '<br>');
    }
  },

  // Formatte le texte inline : **gras**, allures en orange, FC en rouge
  _formatInline(text) {
    var s = this.escapeHtml(text);
    // **gras**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // `code`
    s = s.replace(/`([^`]+)`/g, '<code class="coach-code">$1</code>');
    // Allures ex: 5:30/km ou 5:10-5:30/km
    s = s.replace(/(\d:\d{2}(?:-\d:\d{2})?\/km)/g, '<span class="coach-pace">$1</span>');
    // FC : "FC 145bpm", "145 bpm", "145bpm" — après escapeHtml, < devient &lt;
    s = s.replace(/(FC\s*(?:&lt;|&gt;|<|>)?\s*\d+\s*%?(?:\s*bpm)?|\d{2,3}\s*bpm)/gi, '<span class="coach-hr">$1</span>');
    return s;
  },

  // Rendu compact d'un plan JSON dans le chat
  _renderInlinePlan(plan) {
    var typeClass = {ef:'pill-ef',work:'pill-vma',vma:'pill-vma',sl:'pill-sl',tempo:'pill-tempo',recup:'pill-rest',free:'pill-ef'};
    var self = this;
    var html = '<div class="coach-plan-block">';
    plan.weeks.forEach(function(week, wi) {
      html += '<div class="coach-plan-week">'
        + '<div class="coach-plan-week-title">'
        + self.escapeHtml(week.title || ('Semaine ' + (wi + 1)))
        + ' <span class="volume-badge">' + (week.volume_km || '?') + ' km</span></div>';
      var order = {Lun:0,Mar:1,Mer:2,Jeu:3,Ven:4,Sam:5,Dim:6};
      var days  = (week.days || []).slice().sort(function(a, b) {
        return (order[a.day] !== undefined ? order[a.day] : 7) - (order[b.day] !== undefined ? order[b.day] : 7);
      });
      days.forEach(function(d) {
        var resolvedType = self._resolveType(d);
        var tc     = typeClass[resolvedType] || 'pill-ef';
        // Pour EF/SL/récup : affiche tout le détail. Pour les intenses : juste la phase travail
        var detail = '';
        if (d.detail) {
          var phases = d.detail.split('·');
          detail = (phases.length > 1) ? phases[1].trim() : d.detail;
        }
        html += '<div class="coach-plan-day">'
          + '<span class="coach-plan-dayname">' + self.escapeHtml(d.day) + '</span>'
          + '<div style="flex:1;">'
          + '<span class="session-pill ' + tc + '" style="font-size:11px;padding:2px 8px;">' + self.escapeHtml(d.label) + '</span>'
          + (detail ? '<div class="coach-plan-detail">' + self.escapeHtml(detail) + '</div>' : '')
          + '</div></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  },

  escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  // ===== SETTINGS TAB =====
  renderSettings(profile) {
    const el = document.getElementById('settings-content');
    const arrow = `<svg class="settings-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;

    // Objectif principal : nom + distance
    const goalVal = profile?.goal
      ? [profile.goal.name, profile.goal.dist].filter(Boolean).join(' · ')
      : (profile?.fitFocus || '—');

    // Records personnels : affiche tous ceux qui existent
    const prs = profile?.prs || {};
    const prParts = [
      prs.km10    ? `10km ${prs.km10}`    : null,
      prs.half    ? `Semi ${prs.half}`    : null,
      prs.marathon? `Marathon ${prs.marathon}` : null,
    ].filter(Boolean);
    const prsVal = prParts.length ? prParts.join(' · ') : '—';

    // Jours triés lun→dim
    const DAY_ORDER = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const sortedDays = (profile?.trainingDays || [])
      .slice().sort((a,b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

    el.innerHTML = `
      <div class="settings-section">
        <div class="settings-group-label">Objectifs</div>
        <div class="settings-row" onclick="App.editProfile('goal')">
          <span class="settings-label">Objectif principal</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="settings-value">${goalVal}</span>
            ${arrow}
          </div>
        </div>
        <div class="settings-row" onclick="App.editProfile('prs')">
          <span class="settings-label">Records personnels</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="settings-value" style="font-size:12px;">${prsVal}</span>
            ${arrow}
          </div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-group-label">Planning</div>
        <div class="settings-row" onclick="App.editProfile('schedule')">
          <span class="settings-label">Jours d'entraînement</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="settings-value">${sortedDays.join(', ') || '—'}</span>
            ${arrow}
          </div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-group-label">Strava</div>
        <div class="settings-row">
          <span class="settings-label">Connexion Strava</span>
          <span class="settings-value" style="color:${Strava.isConnected() ? 'var(--green)' : 'var(--orange)'};">${Strava.isConnected() ? '✓ Connecté' : 'Non connecté'}</span>
        </div>
        ${Strava.isConnected() ? `<div class="settings-row" onclick="App.disconnectStrava()"><span class="settings-label" style="color:var(--red);">Déconnecter Strava</span></div>` : `<div class="settings-row" onclick="Strava.authorize()"><span class="settings-label" style="color:var(--orange);">Connecter Strava</span></div>`}
      </div>
      <div class="settings-section">
        <div class="settings-group-label">Compte</div>
        <div class="settings-row" onclick="App.editProfile()">
          <span class="settings-label">Modifier mon profil complet</span>
          <svg class="settings-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="settings-row" onclick="App.logout()">
          <span class="settings-label" style="color:var(--red);">Se déconnecter</span>
        </div>
      </div>`;
  }
};
