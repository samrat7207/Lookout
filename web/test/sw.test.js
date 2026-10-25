import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Loads the service worker template with a fake `self` and checks which requests it answers.
function loadWorker() {
  const src = readFileSync(new URL('../src/offline/sw-template.js', import.meta.url), 'utf8')
    .replace('__VERSION__', 'test').replace('__SHELL__', '["/", "/index.html"]');
  const handlers = {};
  const self = { location: { origin: 'http://localhost:4173' }, addEventListener: (k, fn) => (handlers[k] = fn), skipWaiting() {}, clients: { claim() {} } };
  new Function('self', 'caches', 'fetch', src)(self, { match: async () => null }, async () => ({}));
  return handlers;
}
const req = (url, { method = 'GET', accept = '', mode = 'cors' } = {}) => ({ url, method, mode, headers: { get: (h) => (h === 'accept' ? accept : null) } });
const answers = (h, r) => { let used = false; h.fetch({ request: r, respondWith: () => (used = true) }); return used; };

test('service worker: API calls and the SSE stream are never cached', () => {
  const h = loadWorker();
  assert.equal(answers(h, req('http://localhost:4173/api/health')), false);
  assert.equal(answers(h, req('http://localhost:4173/api/runs/r1/events', { accept: 'text/event-stream' })), false);
  assert.equal(answers(h, req('http://localhost:4173/api/runs', { method: 'POST' })), false);
  assert.equal(answers(h, req('http://localhost:4173/anything', { accept: 'text/event-stream' })), false);
  assert.equal(answers(h, req('https://other.example/x.js')), false);
});

test('service worker: the page and built assets come from the shell cache', () => {
  const h = loadWorker();
  assert.equal(answers(h, req('http://localhost:4173/', { mode: 'navigate', accept: 'text/html' })), true);
  assert.equal(answers(h, req('http://localhost:4173/assets/index-abc.js')), true);
});
