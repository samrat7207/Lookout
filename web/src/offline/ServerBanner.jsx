import { useEffect, useState } from 'react';

// Shows a banner while the API server cannot be reached (checked against /api/health,
// which is never cached). The page itself may still be open from the offline shell cache.
const EVERY_MS = 10000;

export function ServerBanner() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch('/api/health', { cache: 'no-store', signal: ctl.signal });
        clearTimeout(t);
        if (alive) setDown(r.status >= 500); // a dev or preview proxy answers 5xx when the server is gone
      } catch {
        if (alive) setDown(true);
      }
    };
    check();
    const id = setInterval(check, EVERY_MS);
    window.addEventListener('online', check);
    return () => { alive = false; clearInterval(id); window.removeEventListener('online', check); };
  }, []);
  if (!down) return null;
  return (
    <div className="server-banner" role="status">
      Server unreachable. Showing the cached page. Live runs need the server.
    </div>
  );
}
