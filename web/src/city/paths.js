// Walkable paths. Citizens use the sidewalk graph (block corners plus crosswalks);
// agents use the road graph (inner road lines) between Town Hall and the landmarks.
// Pure data and maths, no three.js, so it can be unit tested.

import { BLOCK_CENTERS, KERB_H, LOT_TOP, ROAD_TOP } from './layout.js';

// ---------- sidewalks (citizens) ----------

export const SIDEWALK_E = 5.2; // sidewalk centre line, from the block centre
export const SIDEWALK_Y = KERB_H;
export const CROSSING_Y = ROAD_TOP;

/** Nodes are block corners; edges run around each block and across the inner roads at the crosswalks. */
export function sidewalkGraph() {
  const nodes = [];
  const index = new Map();
  const key = (x, z) => `${x},${z}`;
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = bx + sx * SIDEWALK_E, z = bz + sz * SIDEWALK_E;
        index.set(key(x, z), nodes.length);
        nodes.push({ x, z, links: [] });
      }
    }
  }
  const link = (a, b, crossing) => {
    nodes[a].links.push({ to: b, crossing });
    nodes[b].links.push({ to: a, crossing });
  };
  const at = (x, z) => index.get(key(x, z));
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const e = SIDEWALK_E;
      const c = [at(bx - e, bz - e), at(bx + e, bz - e), at(bx + e, bz + e), at(bx - e, bz + e)];
      for (let i = 0; i < 4; i++) link(c[i], c[(i + 1) % 4], false);
    }
  }
  // crosswalks: corner to the facing corner of the neighbouring block (inner roads only)
  for (const n of nodes) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const gap = 14 - 2 * SIDEWALK_E;
      const j = at(n.x + dx * gap, n.z + dz * gap);
      if (j !== undefined) link(nodes.indexOf(n), j, true);
    }
  }
  return nodes;
}

// ---------- roads (agents) ----------

// Each place: where an agent stands to work (spot), the sidewalk point in front of
// it, and the point on an inner road line it joins. Spots face the camera (+x / +z).
// Town Hall has two exits and one slot per agent on the plaza in front of the hall.
const PLACE_DEFS = {
  nsp: { spot: [-13.2, -9.7], walk: [-13.2, -8.8], road: [-13.2, -7] },
  mahadbt: { spot: [14.8, -9.9], walk: [14.8, -8.8], road: [14.8, -7] },
  watchtower: { spot: [0.6, -11.1], walk: [0.8, -8.8], road: [0.8, -7] },
  foundations: { spot: [-10.0, 16.5], walk: [-8.8, 16.5], road: [-7, 16.5] },
  opportunities: { spot: [12.6, 14.2], walk: [8.8, 14.2], road: [7, 14.2] },
};
const TOWNHALL_EXITS = [
  { walk: [-5.2, 1.2], road: [-7, 1.2] },
  { walk: [5.2, 1.2], road: [7, 1.2] },
];
const TOWNHALL_Z = 1.2;
const TOWNHALL_SLOTS = [-1.9, 1.9, -2.8, 2.8, -3.6, 3.6, -4.4, 4.4];
export const MAYOR_SPOT = [0, 0.85];

export const AGENT_Y = LOT_TOP;

/** Where agent number `slot` stands at a place. The mayor always stands at the hall door. */
export function spotFor(place, slot, isMayor = false) {
  if (place === 'townhall') {
    if (isMayor) return MAYOR_SPOT;
    return [TOWNHALL_SLOTS[slot % TOWNHALL_SLOTS.length], TOWNHALL_Z];
  }
  const def = PLACE_DEFS[place];
  return def ? def.spot : MAYOR_SPOT;
}

export const KNOWN_PLACES = ['townhall', ...Object.keys(PLACE_DEFS)];

function roadGraph() {
  const nodes = new Map(); // id -> { x, z, links: Map<id, dist> }
  const add = (id, [x, z]) => nodes.set(id, { id, x, z, links: new Map() });
  const link = (a, b) => {
    const A = nodes.get(a), B = nodes.get(b);
    const d = Math.hypot(A.x - B.x, A.z - B.z);
    A.links.set(b, d);
    B.links.set(a, d);
  };
  for (const ix of [-7, 7]) for (const iz of [-7, 7]) add(`x${ix},${iz}`, [ix, iz]);
  for (const [id, def] of Object.entries(PLACE_DEFS)) {
    add(`${id}:walk`, def.walk);
    add(`${id}:road`, def.road);
    link(`${id}:walk`, `${id}:road`);
  }
  TOWNHALL_EXITS.forEach((ex, i) => {
    add(`townhall:walk${i}`, ex.walk);
    add(`townhall:road${i}`, ex.road);
    link(`townhall:walk${i}`, `townhall:road${i}`);
  });
  // connect consecutive road points along each inner road line
  const roadIds = [...nodes.values()].filter((n) => n.id.startsWith('x') || n.id.includes(':road'));
  for (const c of [-7, 7]) {
    const alongZ = roadIds.filter((n) => n.x === c).sort((a, b) => a.z - b.z);
    const alongX = roadIds.filter((n) => n.z === c).sort((a, b) => a.x - b.x);
    for (const line of [alongZ, alongX]) for (let i = 1; i < line.length; i++) link(line[i - 1].id, line[i].id);
  }
  return nodes;
}

const ROADS = roadGraph();

function accessNodes(place) {
  if (place === 'townhall') return TOWNHALL_EXITS.map((_, i) => `townhall:walk${i}`);
  return PLACE_DEFS[place] ? [`${place}:walk`] : [];
}

/**
 * Shortest walk from `fromP` ([x, z, y?]) at place `from` to the spot `toXZ` at place `to`,
 * as [[x, z, y], ...]: lot level at the ends, kerb level on sidewalks, road level on roads.
 * `lane` shifts the road part sideways so agents on the same road don't overlap.
 */
export function route(fromP, from, toXZ, to, lane = 0) {
  const fromXZ = [fromP[0], fromP[1], fromP[2] ?? LOT_TOP];
  toXZ = [toXZ[0], toXZ[1], LOT_TOP];
  const starts = accessNodes(from);
  const ends = new Set(accessNodes(to));
  if (!starts.length || !ends.size || from === to) return [fromXZ, toXZ];

  // Dijkstra from a virtual start linked to every access node of `from`
  const dist = new Map();
  const prev = new Map();
  const todo = new Set(ROADS.keys());
  for (const id of starts) {
    const n = ROADS.get(id);
    dist.set(id, Math.hypot(n.x - fromXZ[0], n.z - fromXZ[1]));
  }
  let best = null;
  while (todo.size) {
    let u = null;
    for (const id of todo) if (dist.has(id) && (u === null || dist.get(id) < dist.get(u))) u = id;
    if (u === null) break;
    todo.delete(u);
    if (ends.has(u)) {
      const n = ROADS.get(u);
      const total = dist.get(u) + Math.hypot(n.x - toXZ[0], n.z - toXZ[1]);
      if (!best || total < best.total) best = { id: u, total };
    }
    for (const [v, d] of ROADS.get(u).links) {
      const nd = dist.get(u) + d;
      if (!dist.has(v) || nd < dist.get(v)) {
        dist.set(v, nd);
        prev.set(v, u);
      }
    }
  }
  if (!best) return [fromXZ, toXZ];
  const ids = [];
  for (let id = best.id; id; id = prev.get(id)) ids.unshift(id);
  const off = lane * 0.35;
  const pts = ids.map((id) => {
    const n = ROADS.get(id);
    const onRoad = id.startsWith('x') || id.includes(':road');
    return onRoad ? [n.x + off, n.z + off, ROAD_TOP] : [n.x, n.z, KERB_H];
  });
  return [fromXZ, ...pts, toXZ];
}

export function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}
