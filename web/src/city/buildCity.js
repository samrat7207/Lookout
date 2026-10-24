// Builds the whole static city into one batch (deterministic), plus the list of
// parked vehicles for Traffic.jsx.

import { createBatch, rng } from './batch.js';
import {
  ASPHALT, BASE, BLOCK, BLOCK_CENTERS, KERB_H, LOT_TOP as G, ROAD_LINES, ROAD_TOP, ROAD_W,
} from './layout.js';
import { bench, building, flowerBed, hedge, lamp, tree } from './props.js';
import { centralHall, foundationTowers, opportunitiesDistrict, stateOffice, townHall, watchtower } from './landmarks.js';

const PI = Math.PI;
const MARK = '#f4f1e8';
const HALF_ROAD = ROAD_W / 2;

const LOT = {
  '-14,-14': '#a5d68f', // NSP lawn
  '0,-14': '#e2d8c3', // watchtower plaza
  '14,-14': '#d9d4c7', // state office forecourt
  '-14,0': '#a8d58f', // homes
  '0,0': '#eadfc8', // town hall plaza
  '14,0': '#dcdfe4', // shops
  '-14,14': '#cfe7d6', // foundations plaza
  '0,14': '#9fd38a', // park
  '14,14': '#e6ddf0', // opportunities plaza
};

function ground(b) {
  b.box(0, -0.5, 0, BASE, 0.5, BASE, '#d3d7dd');
  b.box(0, -1.1, 0, BASE - 0.8, 0.6, BASE - 0.8, '#9ea5ae');
  b.flat(0, 0, 0, ASPHALT, ROAD_TOP, ASPHALT, '#5a6069');
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      b.box(bx, 0, bz, BLOCK, KERB_H, BLOCK, '#e6e8ec');
      b.flat(bx, KERB_H, bz, BLOCK - 1.2, G - KERB_H, BLOCK - 1.2, LOT[`${bx},${bz}`]);
    }
  }
}

/** Dashed centre lines between intersections, crosswalks at every non-corner intersection. */
function markings(b) {
  const y = ROAD_TOP;
  for (const c of ROAD_LINES) {
    for (let i = 0; i < ROAD_LINES.length - 1; i++) {
      const from = ROAD_LINES[i] + HALF_ROAD + 1.15;
      const to = ROAD_LINES[i + 1] - HALF_ROAD - 1.15;
      for (let t = from; t + 0.8 <= to; t += 1.4) {
        b.flat(c, y, t + 0.4, 0.12, 0.012, 0.8, MARK); // road along z at x = c
        b.flat(t + 0.4, y, c, 0.8, 0.012, 0.12, MARK); // road along x at z = c
      }
    }
  }
  const edge = ROAD_LINES.at(-1);
  for (const ix of ROAD_LINES) {
    for (const iz of ROAD_LINES) {
      if (Math.abs(ix) === edge && Math.abs(iz) === edge) continue; // ring corners
      const arms = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([ax, az]) => Math.abs(ix + ax * ROAD_W) < edge + 0.1 && Math.abs(iz + az * ROAD_W) < edge + 0.1);
      for (const [ax, az] of arms) {
        const ox = ix + ax * (HALF_ROAD + 0.55);
        const oz = iz + az * (HALF_ROAD + 0.55);
        for (let k = 0; k < 6; k++) {
          const u = -1.25 + k * 0.5;
          if (az) b.flat(ox + u, y, oz, 0.28, 0.012, 0.9, MARK);
          else b.flat(ox, y, oz + u, 0.9, 0.012, 0.28, MARK);
        }
      }
    }
  }
}

/** Lamps on every block corner and side, plus street trees on the residential blocks. */
function streetFurniture(b, r) {
  const e = BLOCK / 2 - 0.3;
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lamp(b, bx + dx * e, bz + dz * e, KERB_H);
      for (const [dx, dz] of [[0, 1], [1, 0]]) lamp(b, bx + dx * e, bz + dz * e, KERB_H);
    }
  }
  for (const [bx, bz] of [[-14, 0], [14, 0], [0, 14]]) {
    for (const u of [-2.6, 2.6]) {
      tree(b, r, bx + u, bz + e, 0.62, 'round', KERB_H);
      tree(b, r, bx + e, bz + u, 0.62, 'round', KERB_H);
      tree(b, r, bx - e, bz + u, 0.62, 'round', KERB_H);
    }
  }
}

/** Homes block: four apartment buildings with balconies around a courtyard. */
function homes(b, r) {
  const cx = -14, cz = 0;
  building(b, r, { x: cx - 2.5, z: cz - 2.5, w: 3.2, d: 3.0, floors: 6, color: '#f7c59f', balconies: true });
  building(b, r, { x: cx + 2.5, z: cz - 2.6, w: 3.0, d: 2.8, floors: 4, color: '#9ad1d4', balconies: true });
  building(b, r, { x: cx - 2.6, z: cz + 2.6, w: 3.0, d: 2.8, floors: 3, color: '#f4a6a6', balconies: true });
  building(b, r, { x: cx + 2.5, z: cz + 2.5, w: 3.2, d: 2.8, floors: 5, color: '#c3b1e1', balconies: true });
  b.flat(cx, G, cz, 1.0, 0.02, 9.0, '#e8dfcc');
  b.flat(cx, G, cz, 9.0, 0.02, 1.0, '#e8dfcc');
  tree(b, r, cx + 0.9, cz - 0.9, 0.7, 'round');
  bench(b, cx - 0.9, cz + 0.9, PI / 2);
}

/** Shops block: three shopfronts with striped awnings, an office tower and a cafe terrace. */
function shops(b, r) {
  const cx = 14, cz = 0;
  const units = [
    { x: cx - 3.2, color: '#ffb4a2', awning: ['#e15759', '#ffffff'] },
    { x: cx, color: '#b5e48c', awning: ['#2a9d8f', '#ffffff'] },
    { x: cx + 3.2, color: '#ffd166', awning: ['#4e79a7', '#ffffff'] },
  ];
  const sz = cz + 2.7;
  for (const u of units) {
    building(b, r, { x: u.x, z: sz, w: 2.9, d: 2.5, floors: 2, color: u.color, trim: false });
    b.glass(u.x - 0.75, G + 0.12, sz + 1.255, 0.9, 0.62, 0.05, '#cfeaf7');
    b.glass(u.x + 0.75, G + 0.12, sz + 1.255, 0.9, 0.62, 0.05, '#cfeaf7');
    for (let k = 0; k < 6; k++) b.tilted(u.x - 1.2 + k * 0.48, G + 1.0, sz + 1.55, 0.48, 0.05, 0.75, u.awning[k % 2], 0.45);
    b.glow(u.x, G + 1.25, sz + 1.27, 1.6, 0.22, 0.04, '#fff4c9');
  }
  building(b, r, { x: cx + 2.4, z: cz - 2.4, w: 3.4, d: 3.4, floors: 8, color: '#8fb3d9' });
  // cafe terrace with umbrellas
  b.flat(cx - 2.4, G, cz - 2.4, 4.0, 0.02, 4.0, '#efe6d2');
  b.box(cx - 3.6, G, cz - 3.6, 1.4, 1.1, 1.2, '#ff9f1c');
  b.box(cx - 3.6, G + 1.1, cz - 3.6, 1.5, 0.08, 1.3, '#ffffff');
  for (const [dx, dz, c] of [[-1.6, -0.6, '#e15759'], [-0.5, -1.6, '#4e79a7'], [-0.6, -0.4, '#59a14f']]) {
    const x = cx + dx, z = cz + dz;
    b.cyl(x, G, z, 0.55, 0.42, '#ffffff');
    b.cyl(x, G, z, 0.05, 1.3, '#8a8f96');
    b.cone(x, G + 1.15, z, 1.3, 0.38, c);
  }
}

/** Park block: pond with ducks, paths, gazebo, trees and benches. */
function park(b, r) {
  const cx = 0, cz = 14;
  b.flat(cx, G, cz + 2.2, 9.6, 0.02, 0.9, '#e8dfcc');
  b.flat(cx + 2.0, G, cz, 0.9, 0.02, 9.6, '#e8dfcc');
  b.disc(cx - 1.6, G, cz - 1.4, 4.8, 0.05, 3.4, '#cfc8b8');
  b.disc(cx - 1.6, G + 0.05, cz - 1.4, 4.3, 0.02, 2.9, '#6fbde3');
  b.dodeca(cx - 2.4, G + 0.13, cz - 1.6, 0.26, '#ffd166', 0, 0.8);
  b.dodeca(cx - 1.0, G + 0.13, cz - 0.9, 0.24, '#ffffff', 0, 0.8);
  // gazebo
  const gx = cx + 3.2, gz = cz - 3.0;
  b.cyl(gx, G, gz, 2.2, 0.16, '#d8d1c1');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    b.cyl(gx + Math.cos(a) * 0.9, G + 0.16, gz + Math.sin(a) * 0.9, 0.1, 1.2, '#ffffff');
  }
  b.cone(gx, G + 1.36, gz, 2.5, 0.95, '#e15759');
  // trees avoiding the pond, paths and gazebo
  const spots = [[-4.2, 1.0], [-3.8, 4.2], [-1.4, 4.0], [0.4, 0.8], [3.8, 0.6], [4.1, 4.0], [3.6, -0.9], [-4.3, -4.0], [0.6, -4.2], [-0.4, 3.9]];
  spots.forEach(([dx, dz], i) => tree(b, r, cx + dx, cz + dz, r.range(0.75, 1.05), i % 3 ? 'round' : 'pine'));
  bench(b, cx - 2.0, cz + 3.0);
  bench(b, cx + 1.0, cz + 3.0);
  bench(b, cx + 3.0, cz + 1.4, -PI / 2);
  flowerBed(b, r, cx + 0.8, cz - 0.9, 0.9, 0.9);
  hedge(b, cx - 4.4, cz + 2.2, 0.5, 0.9);
}

/** Parked cars along the kerbs of the spoke roads (the roads without through traffic). */
function spokeParking(r) {
  const out = [];
  const palette = ['#e15759', '#4e79a7', '#f28e2b', '#76b7b2', '#ffffff', '#59a14f', '#edc948', '#b07aa1', '#9c755f'];
  for (const c of [-7, 7]) {
    for (const sign of [-1, 1]) {
      for (const side of [-1, 1]) {
        const slots = [10.4, 12.6, 14.8, 17.2].filter(() => r.chance(0.55));
        for (const s of slots) {
          const type = r.chance(0.2) ? 'van' : r.chance(0.2) ? 'taxi' : 'sedan';
          // road along z at x = c: kerb at x = c + side * 1.05; keep-left facing
          out.push({ x: c + side * 1.05, z: sign * s, heading: side > 0 ? -PI / 2 : PI / 2, type, color: r.pick(palette) });
          // road along x at z = c
          out.push({ x: sign * (s + 0.6), z: c + side * 1.05, heading: side > 0 ? PI : 0, type: r.chance(0.3) ? 'van' : 'sedan', color: r.pick(palette) });
        }
      }
    }
  }
  return out;
}

export function buildCity() {
  const b = createBatch();
  const r = rng(20261024);
  const parked = [];
  ground(b);
  markings(b);
  centralHall(b, r);
  stateOffice(b, r, parked);
  foundationTowers(b, r);
  watchtower(b, r);
  townHall(b, r);
  opportunitiesDistrict(b, r);
  homes(b, r);
  shops(b, r);
  park(b, r);
  streetFurniture(b, r);
  parked.push(...spokeParking(r));
  return { batch: b, parked };
}
