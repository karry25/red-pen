// Registers the service worker and offers a polite, dismissible install prompt (never repeats once dismissed).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
const bar = document.getElementById('install-bar'); let deferred = null;
const dismissed = () => { try { return localStorage.getItem('redpen_install_dismissed') === '1'; } catch (e) { return false; } };
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferred = e; if (dismissed()) return;
  document.getElementById('install-msg').textContent = 'Add Red Pen to your home screen (free, no app store).';
  document.getElementById('install-btn').hidden = false; bar.hidden = false;
});
document.getElementById('install-btn').onclick = async () => { if (deferred) { deferred.prompt(); deferred = null; } bar.hidden = true; };
document.getElementById('install-x').onclick = () => { bar.hidden = true; try { localStorage.setItem('redpen_install_dismissed', '1'); } catch (e) {} };
const ios = /iphone|ipad/i.test(navigator.userAgent) && !window.navigator.standalone;
if (ios && !dismissed()) { document.getElementById('install-msg').textContent = 'On iPhone: tap Share, then "Add to Home Screen".'; bar.hidden = false; }
