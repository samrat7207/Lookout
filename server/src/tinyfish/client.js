// Thin TinyFish REST client (TINYFISH_INTEGRATION §1–2). Server-only: this is the
// ONLY file that reads TINYFISH_API_KEY, and the key never appears in events or logs.
// Agent and Monitor calls arrive in M3.

const SEARCH_URL = 'https://api.search.tinyfish.ai';
const FETCH_URL = 'https://api.fetch.tinyfish.ai';
const SEARCH_TIMEOUT_MS = 20_000;
const FETCH_TIMEOUT_MS = 150_000;

export class TinyFishError extends Error {
  constructor({ code, message, status = null, requestId = null }) {
    super(message);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

/** For /api/health: whether a key is configured. Never returns the key. */
export function hasApiKey() {
  return Boolean(process.env.TINYFISH_API_KEY);
}

function apiKey() {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new TinyFishError({ code: 'NO_API_KEY', message: 'TINYFISH_API_KEY is not set (server/.env)' });
  return key;
}

async function call(url, init, timeoutMs) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError';
    throw new TinyFishError({ code: timedOut ? 'TIMEOUT' : 'NETWORK', message: timedOut ? `timed out after ${timeoutMs} ms` : err.message });
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new TinyFishError({
      code: body?.error?.code ?? `HTTP_${res.status}`,
      message: body?.error?.message ?? res.statusText,
      status: res.status,
      requestId: body?.request_id ?? res.headers.get('x-request-id'),
    });
  }
  return body;
}

/**
 * @param {{ query: string, include_domains?: string, exclude_domains?: string, location?: string,
 *   language?: string, purpose?: string, page?: number }} params
 * @returns {Promise<{ query: string, results: Array<{ position: number, title: string, snippet: string, url: string, site_name?: string, date?: string }> }>}
 */
export function search({ location = 'IN', language = 'en', ...params }) {
  const qs = new URLSearchParams(
    Object.entries({ location, language, ...params }).filter(([, v]) => v !== undefined && v !== null),
  );
  return call(`${SEARCH_URL}?${qs}`, { headers: { 'X-API-Key': apiKey() } }, SEARCH_TIMEOUT_MS);
}

/**
 * Up to 10 URLs per request. Per-URL failures come back in `errors[]` inside a 200.
 * @param {{ urls: string[], format?: 'markdown'|'html'|'json', links?: boolean, per_url_timeout_ms?: number,
 *   include_selectors?: string[], exclude_selectors?: string[], ttl?: number, purpose?: string }} body
 * @returns {Promise<{ results: Array<{ url: string, final_url: string, title: string|null, text: string, links?: string[], latency_ms: number }>,
 *   errors: Array<{ url: string, error: string, status?: number }> }>}
 */
export async function fetchPages({ urls, format = 'markdown', per_url_timeout_ms = 60_000, ...rest }) {
  if (!urls?.length || urls.length > 10) throw new TinyFishError({ code: 'BAD_REQUEST', message: 'fetchPages takes 1 to 10 URLs' });
  const out = await call(
    FETCH_URL,
    {
      method: 'POST',
      headers: { 'X-API-Key': apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, format, per_url_timeout_ms, ...rest }),
    },
    FETCH_TIMEOUT_MS,
  );
  return { results: out?.results ?? [], errors: out?.errors ?? [] };
}
