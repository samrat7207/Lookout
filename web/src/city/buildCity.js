// Builds the whole static city into one batch (deterministic). There are no vehicles and
// no ambient people: the only people are the agents, and they move only on events.
// Everything here is instanced by material, so a bigger city costs triangles, not draw calls.

import { createBatch, rng } from './batch.js';
import {
  ASPHALT, BASE, BLOCK, BLOCK_CENTERS, KERB_H, LOT_TOP as G, ROAD_LINES, ROAD_TOP, ROAD_W,
} from './layout.js';
import { BENCH_SPOTS, LAMP_SPOTS, bench, building, flowerBed, hedge, lamp, tree } from './props.js';
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
// outer districts: offices (north), campus (south), homes (west), market (east), parks (corners)
function districtOf(bx, bz) {
  if (Math.abs(bx) === 28 && Math.abs(bz) === 28) return 'park';
  if (bz === -28) return 'offices';
  if (bz === 28) return 'campus';
  if (bx === -28) return 'homes';
  if (bx === 28) return 'market';
  return null;
}
const DISTRICT_LOT = { offices: '#d5dbe3', campus: '#b7dc9f', homes: '#c9e4b4', market: '#eadfcf', park: '#9fd38a' };

function ground(b) {
  b.box(0, -0.5, 0, BASE, 0.5, BASE, '#d3d7dd');
  b.box(0, -1.1, 0, BASE - 0.8, 0.6, BASE - 0.8, '#9ea5ae');
  b.flat(0, 0, 0, ASPHALT, ROAD_TOP, ASPHALT, '#5a6069');
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      b.box(bx, 0, bz, BLOCK, KERB_H, BLOCK, '#e6e8ec');
      b.flat(bx, KERB_H, bz, BLOCK - 1.2, G - KERB_H, BLOCK - 1.2, LOT[`${bx},${bz}`] ?? DISTRICT_LOT[districtOf(bx, bz)]);
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
      const kind = bx === 0 ? 'blossom' : bx < 0 ? 'poplar' : 'round';
      tree(b, r, bx + u, bz + e, 0.62, kind, KERB_H);
      tree(b, r, bx + e, bz + u, 0.62, kind, KERB_H);
      tree(b, r, bx - e, bz + u, 0.62, kind, KERB_H);
    }
  }
  // bins beside the mid-side lamps
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      for (const [x, z] of [[bx + 0.45, bz + e], [bx + e, bz + 0.45]]) {
        b.cyl(x, KERB_H, z, 0.24, 0.38, '#2f6b4f');
        b.cyl(x, KERB_H + 0.38, z, 0.27, 0.04, '#24533d');
      }
    }
  }
}

/** Bus stop on the shops block, facing the inner road at x = 7. */
function busStop(b) {
  const x = 9.65, z = -2.5;
  for (const dz of [-1.0, 1.0]) b.box(x + 0.3, G, z + dz, 0.06, 1.8, 0.06, '#5b6169');
  b.box(x, G + 1.8, z, 0.9, 0.08, 2.3, '#1d4e89');
  b.glass(x + 0.33, G + 0.15, z, 0.03, 1.5, 2.0, '#cfeaf7');
  b.box(x + 0.15, G, z, 0.3, 0.42, 1.5, '#8a8f96');
  b.box(x + 0.15, G + 0.42, z, 0.34, 0.05, 1.6, '#c48a5a');
  b.cyl(x - 0.3, G, z - 1.4, 0.06, 2.0, '#5b6169');
  b.box(x - 0.3, G + 1.75, z - 1.4, 0.05, 0.36, 0.36, '#1d4e89');
}

/** Two small market stalls on the watchtower plaza: striped canopies, goods on the counter. */
function stalls(b, r) {
  const goods = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#8ab17d', '#ffffff'];
  for (const [x, z, c] of [[-3.0, -9.8, '#e15759'], [3.0, -9.8, '#4e79a7']]) {
    for (const [dx, dz] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) b.cyl(x + dx, G, z + dz, 0.06, 1.4, '#8a8f96');
    b.box(x, G, z + 0.1, 1.2, 0.7, 0.55, '#c48a5a');
    for (let k = 0; k < 6; k++) b.box(x - 0.45 + k * 0.18, G + 0.7, z + 0.15, 0.13, 0.1 + r() * 0.08, 0.2, r.pick(goods));
    for (let k = 0; k < 5; k++) b.tilted(x - 0.56 + k * 0.28, G + 1.38, z, 0.28, 0.05, 1.0, k % 2 ? '#ffffff' : c, 0.18);
  }
}

/** Library block: a reading hall with columns and a book-spine frieze, plus two homes behind. */
function library(b, r) {
  const cx = -14.6, cz = -0.4;
  // plinth, hall, columns, roof
  b.box(cx, G, cz, 7.4, 0.3, 5.2, '#d8cfbd');
  b.box(cx, G + 0.3, cz - 0.4, 6.6, 3.2, 3.8, '#e9dcc0');
  for (let i = 0; i < 6; i++) b.cyl(cx - 2.75 + i * 1.1, G + 0.3, cz + 1.9, 0.2, 2.9, '#fbf6ea');
  b.box(cx, G + 3.2, cz + 1.9, 6.9, 0.3, 0.7, '#fbf6ea');
  b.box(cx, G + 3.5, cz - 0.1, 7.0, 0.35, 4.6, '#7a4e2d');
  b.tilted(cx, G + 3.85, cz - 0.1, 7.0, 0.1, 4.6, '#8c5a33', 0);
  // book spines along the frieze
  const spines = ['#e15759', '#4e79a7', '#59a14f', '#f28e2b', '#b07aa1', '#edc948'];
  for (let i = 0; i < 22; i++) b.box(cx - 3.15 + i * 0.3, G + 3.25, cz + 2.27, 0.22, 0.24 + r() * 0.1, 0.05, spines[i % spines.length]);
  // tall windows and a door
  for (let i = 0; i < 4; i++) b.glass(cx - 2.4 + i * 1.6, G + 1.0, cz + 1.51, 0.7, 1.6, 0.05, '#cfe3f2');
  b.box(cx, G + 0.3, cz + 1.53, 1.0, 1.8, 0.06, '#5b3a21');
  b.flat(cx + 4.0, G, cz + 1.0, 1.2, 0.02, 3.0, '#e8dfcc');
  building(b, r, { x: -14 - 2.6, z: 3.4, w: 3.0, d: 2.2, floors: 3, color: '#f4a6a6', balconies: true });
  building(b, r, { x: -14 + 2.4, z: 3.5, w: 3.0, d: 2.0, floors: 2, color: '#c3b1e1', balconies: true });
  tree(b, r, -18.6, 4.0, 0.7, 'round');
  bench(b, -10.4, -3.4, PI / 2);
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

/** Paving on the Town Hall plaza: a light grid of stone tiles (flat, no shadows). */
function plazaPaving(b) {
  for (let i = -4; i <= 4; i++) {
    b.flat(i * 1.05, G + 0.005, 3.2, 0.04, 0.01, 3.2, '#d9ccb1');
    if (i >= -1 && i <= 1) b.flat(0, G + 0.005, 1.8 + i * 1.05, 9.0, 0.01, 0.04, '#d9ccb1');
  }
}

/** Offices: glass-and-steel towers in cool greys and blues. */
function offices(b, r, cx, cz) {
  const blues = ['#8fb3d9', '#a7b8c9', '#7f9db9', '#b8c4d0'];
  building(b, r, { x: cx - 2.4, z: cz - 2.2, w: 3.6, d: 3.4, floors: 7 + Math.floor(r() * 4), color: r.pick(blues) });
  building(b, r, { x: cx + 2.5, z: cz - 2.0, w: 3.2, d: 3.6, floors: 5 + Math.floor(r() * 4), color: r.pick(blues) });
  building(b, r, { x: cx + 0.2, z: cz + 2.6, w: 6.4, d: 2.6, floors: 3, color: '#c7ced6' });
  b.flat(cx, G, cz + 0.6, 9.0, 0.02, 1.0, '#e2e5ea');
}

/** Campus: red-brick halls around a green quad with a clock turret. */
function campus(b, r, cx, cz) {
  building(b, r, { x: cx - 2.6, z: cz - 2.4, w: 3.4, d: 3.0, floors: 3, color: '#c0674f' });
  building(b, r, { x: cx + 2.6, z: cz - 2.4, w: 3.4, d: 3.0, floors: 4, color: '#b35a44' });
  b.box(cx, G, cz - 3.2, 1.4, 4.6, 1.4, '#a24f3b');
  b.cone(cx, G + 4.6, cz - 3.2, 1.7, 1.2, '#4b5d67');
  b.flat(cx, G, cz + 1.6, 8.4, 0.02, 4.4, '#8fcf7a');
  b.flat(cx, G + 0.02, cz + 1.6, 0.8, 0.02, 4.4, '#e8dfcc');
  tree(b, r, cx - 3.0, cz + 2.6, 0.75, 'round');
  tree(b, r, cx + 3.0, cz + 2.6, 0.75, 'round');
  bench(b, cx - 1.4, cz + 0.6);
}

/** Homes: small pastel houses with pitched roofs and gardens. */
function homesDistrict(b, r, cx, cz) {
  const pastel = ['#f7c59f', '#9ad1d4', '#f4a6a6', '#c3b1e1', '#fbe7a1'];
  for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
    const x = cx + dx, z = cz + dz;
    b.box(x, G, z, 2.6, 1.8, 2.4, r.pick(pastel));
    b.tilted(x, G + 1.95, z - 0.55, 2.8, 0.12, 1.4, '#9c4f3d', 0.55);
    b.tilted(x, G + 1.95, z + 0.55, 2.8, 0.12, 1.4, '#9c4f3d', -0.55);
    b.box(x, G, z + 1.21, 0.5, 1.0, 0.04, '#6b4a2f');
  }
  tree(b, r, cx, cz, 0.8, 'round');
  hedge(b, cx, cz + 0.1, 0.4, 3.0);
}

/** Market: low halls with striped awnings and a warehouse. */
function market(b, r, cx, cz) {
  const awnings = [['#e15759', '#ffffff'], ['#2a9d8f', '#ffffff'], ['#f28e2b', '#ffffff']];
  for (let i = 0; i < 3; i++) {
    const x = cx - 3.0 + i * 3.0, z = cz + 2.4;
    building(b, r, { x, z, w: 2.7, d: 2.4, floors: 1, color: r.pick(['#ffd6a5', '#caffbf', '#ffc6ff']), trim: false });
    for (let k = 0; k < 5; k++) b.tilted(x - 1.0 + k * 0.5, G + 0.95, z + 1.45, 0.5, 0.05, 0.7, awnings[i][k % 2], 0.45);
  }
  b.box(cx, G, cz - 2.4, 8.0, 2.6, 4.0, '#9aa5b1');
  b.tilted(cx, G + 2.6, cz - 2.4, 8.2, 0.12, 4.2, '#6c7a89', 0.08);
}

/** Corner parks: lawns, a running track ring and trees. */
function cornerPark(b, r, cx, cz) {
  b.disc(cx, G, cz, 8.0, 0.02, 8.0, '#c97b55');
  b.disc(cx, G + 0.02, cz, 6.6, 0.02, 6.6, '#7cc46a');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    tree(b, r, cx + Math.cos(a) * 4.7, cz + Math.sin(a) * 4.7, 0.7, i % 2 ? 'pine' : 'round');
  }
}

function outerDistricts(b, r) {
  const make = { offices, campus, homes: homesDistrict, market, park: cornerPark };
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    const d = districtOf(bx, bz);
    if (d) make[d](b, r, bx, bz);
  }
}

export function buildCity() {
  BENCH_SPOTS.length = 0; // filled by bench() below
  LAMP_SPOTS.length = 0; // filled by lamp() below
  const b = createBatch();
  const r = rng(20261024);
  ground(b);
  markings(b);
  centralHall(b, r);
  stateOffice(b, r);
  foundationTowers(b, r);
  watchtower(b, r);
  townHall(b, r);
  opportunitiesDistrict(b, r);
  library(b, r);
  shops(b, r);
  park(b, r);
  outerDistricts(b, r);
  streetFurniture(b, r);
  busStop(b);
  plazaPaving(b);
  stalls(b, r);
  return { batch: b, benches: [...BENCH_SPOTS], lamps: [...LAMP_SPOTS] };
}
