import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN_PLACES, route, spotFor, pathLength } from '../src/city/paths.js';

test('corner buildings are reachable from Town Hall along the roads', () => {
  for (const place of ['checkpoint', 'inspection', 'appdesk', 'auditor']) {
    assert.ok(KNOWN_PLACES.includes(place));
    const pts = route([0, 1.2], 'townhall', spotFor(place, 0), place);
    assert.ok(pts.length > 3, `${place}: walks the roads, not a straight line`);
    assert.ok(pathLength(pts) > 30 && pathLength(pts) < 90, `${place}: sensible length`);
  }
});

test('inner routes are unchanged by the outer roads', () => {
  const pts = route([0, 1.2], 'townhall', spotFor('nsp', 0), 'nsp');
  assert.ok(pts.every(([x, z]) => Math.abs(x) <= 15 && Math.abs(z) <= 15));
});
