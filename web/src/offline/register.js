// Registers the offline shell cache (dist/sw.js). Production builds only: in dev there is
// no sw.js, and a worker there could serve stale modules, so it is never registered.
export function registerOfflineShell() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {}); // offline cache is optional
  });
}
