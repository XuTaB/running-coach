// strava.js — Intégration Strava OAuth + API complète
const Strava = {

  authorize() {
    window.location.href = '/api/strava/auth';
  },

  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return false;
    window.history.replaceState({}, '', '/');
    try {
      const res  = await fetch('/api/strava/callback?code=' + code);
      const data = await res.json();
      if (data.access_token) {
        Storage.saveStravaToken(data);
        return true;
      }
    } catch(e) { console.error('Strava callback error', e); }
    return false;
  },

  async getValidToken() {
    const token = Storage.getStravaToken();
    if (!token) return null;
    if (Date.now() / 1000 < token.expires_at - 300) return token.access_token;
    try {
      const res      = await fetch('/api/strava/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: token.refresh_token })
      });
      const newToken = await res.json();
      Storage.saveStravaToken({ ...token, ...newToken });
      return newToken.access_token;
    } catch(e) { return null; }
  },

  // ── Liste des activités (données de base) ────────────────────────────────────
  async fetchActivities(limit = 30) {
    const token = await this.getValidToken();
    if (!token) return null;
    try {
      const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      if (!res.ok) throw new Error('Strava API ' + res.status);
      const activities = await res.json();
      const runs = activities.filter(a => a.type === 'Run' || a.sport_type === 'Run');
      Storage.saveActivities(runs);
      return runs;
    } catch(e) { console.error('Fetch activities error', e); return null; }
  },

  // ── Détail complet d'une activité ────────────────────────────────────────────
  async fetchActivityDetail(id) {
    const token = await this.getValidToken();
    if (!token) return null;

    // Cache local — évite de rappeler l'API à chaque ouverture
    const cacheKey = 'strava_detail_' + id;
    const cached   = localStorage.getItem(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch(e) {}
    }

    try {
      // Appel détail principal
      const [detailRes, streamsRes, zonesRes] = await Promise.all([
        fetch(`https://www.strava.com/api/v3/activities/${id}`,
          { headers: { Authorization: 'Bearer ' + token } }),
        fetch(`https://www.strava.com/api/v3/activities/${id}/streams?keys=heartrate,cadence,watts,velocity_smooth,altitude,time,distance,temp&key_by_type=true`,
          { headers: { Authorization: 'Bearer ' + token } }),
        fetch(`https://www.strava.com/api/v3/activities/${id}/zones`,
          { headers: { Authorization: 'Bearer ' + token } })
      ]);

      const detail  = await detailRes.json();
      const streams = streamsRes.ok  ? await streamsRes.json()  : null;
      const zones   = zonesRes.ok    ? await zonesRes.json()    : null;

      const full = { ...detail, streams, zones };

      // Cache 24h
      localStorage.setItem(cacheKey, JSON.stringify(full));
      setTimeout(() => localStorage.removeItem(cacheKey), 24 * 3600 * 1000);

      return full;
    } catch(e) {
      console.error('Fetch detail error', e);
      return null;
    }
  },

  // ── Profil athlète ────────────────────────────────────────────────────────────
  async fetchAthlete() {
    const token = await this.getValidToken();
    if (!token) return null;
    try {
      const res = await fetch('https://www.strava.com/api/v3/athlete',
        { headers: { Authorization: 'Bearer ' + token } });
      return await res.json();
    } catch(e) { return null; }
  },

  // ── Statistiques athlète (totaux) ─────────────────────────────────────────────
  async fetchAthleteStats(athleteId) {
    const token = await this.getValidToken();
    if (!token) return null;
    try {
      const res = await fetch(
        `https://www.strava.com/api/v3/athletes/${athleteId}/stats`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      return await res.json();
    } catch(e) { return null; }
  },

  isConnected() { return !!Storage.getStravaToken(); },
  disconnect()  { Storage.clearStravaToken(); },

  // ── Formatage ─────────────────────────────────────────────────────────────────
  formatPace(metersPerSec) {
    if (!metersPerSec) return '--:--';
    const secPerKm = 1000 / metersPerSec;
    const min = Math.floor(secPerKm / 60);
    const sec = Math.round(secPerKm % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  },

  formatDuration(seconds) {
    if (!seconds) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    return `${m}:${s.toString().padStart(2,'0')}`;
  },

  formatDistance(meters) { return (meters / 1000).toFixed(2); },

  formatDate(isoString) {
    const d      = new Date(isoString);
    const days   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const months = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${d.getHours()}h${d.getMinutes().toString().padStart(2,'0')}`;
  },

  // ── Extraction des données riches pour le coach ───────────────────────────────
  buildRichSummary(detail) {
    if (!detail) return null;

    const splits = detail.splits_metric || [];
    const zones  = detail.zones || [];
    const hrZone = zones.find(z => z.type === 'heartrate');

    // Splits km par km
    const splitsStr = splits.length > 0
      ? splits.map((s, i) =>
          `  Km ${i+1} : ${this.formatPace(s.average_speed)}/km · ${s.average_heartrate ? Math.round(s.average_heartrate) + ' bpm' : ''} · dénivelé ${s.elevation_difference > 0 ? '+' : ''}${Math.round(s.elevation_difference||0)}m`
        ).join('\n')
      : null;

    // Zones FC
    const zonesStr = hrZone?.distribution_buckets?.length > 0
      ? hrZone.distribution_buckets.map((b, i) =>
          `  Zone ${i+1} : ${Math.round(b.time / 60)} min`
        ).join('\n')
      : null;

    return {
      // Données principales
      name:            detail.name,
      date:            this.formatDate(detail.start_date_local),
      distance_km:     this.formatDistance(detail.distance),
      duration:        this.formatDuration(detail.moving_time),
      elapsed:         this.formatDuration(detail.elapsed_time),
      pace_avg:        this.formatPace(detail.average_speed),
      pace_max:        this.formatPace(detail.max_speed),
      hr_avg:          detail.average_heartrate ? Math.round(detail.average_heartrate) : null,
      hr_max:          detail.max_heartrate     ? Math.round(detail.max_heartrate)     : null,
      cadence_avg:     detail.average_cadence   ? Math.round(detail.average_cadence * 2) : null, // *2 = foulées/min
      elevation_gain:  Math.round(detail.total_elevation_gain || 0),
      elevation_loss:  Math.round(detail.elev_low  || 0),
      calories:        detail.calories           ? Math.round(detail.calories)         : null,
      suffer_score:    detail.suffer_score       || null,
      perceived_exertion: detail.perceived_exertion || null,
      training_load:   detail.weighted_average_watts || null,
      temperature:     detail.average_temp       !== undefined ? detail.average_temp + '°C' : null,
      description:     detail.description        || null,
      gear:            detail.gear?.name         || null,
      // Splits
      splits_count:    splits.length,
      splits_str:      splitsStr,
      // Zones FC
      zones_str:       zonesStr,
      // Ratios utiles
      hr_per_pace:     detail.average_heartrate && detail.average_speed
        ? Math.round(detail.average_heartrate / (1000 / detail.average_speed) * 60)
        : null,
    };
  },

  // ── Texte résumé pour le coach IA ─────────────────────────────────────────────
  buildCoachContext(detail) {
    const s = this.buildRichSummary(detail);
    if (!s) return '';

    let ctx = `DONNÉES COMPLÈTES DE LA COURSE :
- Nom : ${s.name}
- Date : ${s.date}
- Distance : ${s.distance_km} km
- Durée active : ${s.duration} (totale : ${s.elapsed})
- Allure moyenne : ${s.pace_avg}/km · Allure max : ${s.pace_max}/km
- FC moyenne : ${s.hr_avg || 'N/A'} bpm · FC max : ${s.hr_max || 'N/A'} bpm
- Cadence : ${s.cadence_avg || 'N/A'} foulées/min
- Dénivelé positif : ${s.elevation_gain}m
- Calories : ${s.calories || 'N/A'}
- Suffer score : ${s.suffer_score || 'N/A'}
- Effort perçu Strava : ${s.perceived_exertion || 'N/A'}/10
- Température : ${s.temperature || 'N/A'}
- Chaussures : ${s.gear || 'N/A'}`;

    if (s.description) ctx += `\n- Note Strava : "${s.description}"`;

    if (s.splits_str) ctx += `\n\nDÉTAIL KM PAR KM :\n${s.splits_str}`;
    if (s.zones_str)  ctx += `\n\nZONES CARDIAQUES :\n${s.zones_str}`;

    return ctx;
  }
};
