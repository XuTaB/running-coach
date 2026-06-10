// version.js — Source de vérité pour la version de l'app
const APP_VERSION = '1.5.27';

// Force le remplacement du badge dès que le JS tourne
// (au cas où le HTML en cache aurait une vieille version)
document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('version-badge');
  if (badge) badge.textContent = 'v' + APP_VERSION;
});
