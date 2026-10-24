// The six landmarks (CITY_DESIGN §2), procedural and original. Fronts face +z,
// toward the default isometric camera. Positions match LANDMARKS in layout.js.

import { shade } from './batch.js';
import { LOT_TOP as G } from './layout.js';
import { FLOOR, alongFacade, bench, building, flagPole, flowerBed, hedge, lamp, roofProps, tree, windows } from './props.js';

const PI = Math.PI;

/** Central Scholarships Hall (NSP): civic hall on a stepped plinth, columned portico, gold dome. */
export function centralHall(b, r) {
  const cx = -14, cz = -14;
  const navy = '#2F4B7C', white = '#f4f1ea', gold = '#e9b949';
  // stepped plinth
  b.box(cx, G, cz - 0.6, 9.2, 0.22, 7.2, '#d6dae0');
  b.box(cx, G + 0.22, cz - 0.7, 8.7, 0.22, 6.7, '#e1e4e8');
  b.box(cx, G + 0.44, cz - 0.8, 8.2, 0.22, 6.2, '#eceef1');
  const F = G + 0.66;
  // hall body with side wings
  b.box(cx, F, cz - 1.7, 6.2, 3.0, 3.8, navy);
  b.box(cx - 3.5, F, cz - 1.7, 1.2, 2.2, 3.4, shade(navy, 0.12));
  b.box(cx + 3.5, F, cz - 1.7, 1.2, 2.2, 3.4, shade(navy, 0.12));
  b.box(cx, F + 3.0, cz - 1.7, 6.4, 0.18, 4.0, white);
  b.box(cx - 3.5, F + 2.2, cz - 1.7, 1.3, 0.14, 3.5, white);
  b.box(cx + 3.5, F + 2.2, cz - 1.7, 1.3, 0.14, 3.5, white);
  // tall windows on the sides and wings
  for (const side of [-1, 1]) {
    alongFacade(3.8, (u) => b.glass(cx + side * 3.105, F + 0.6, cz - 1.7 + u, 0.05, 1.5, 0.42, '#9ccbea'), 1.1);
    b.glass(cx + side * 4.105, F + 0.5, cz - 1.7, 0.05, 1.2, 0.5, '#9ccbea');
  }
  for (const wx of [-3.5, 3.5]) b.glass(cx + wx, F + 0.5, cz + 0.005, 0.5, 1.2, 0.05, '#9ccbea');
  // front facade behind the columns: door and windows
  b.box(cx, F, cz + 0.21, 1.1, 1.9, 0.06, '#5a4636');
  for (const wx of [-2.1, -1.2, 1.2, 2.1]) b.glass(cx + wx, F + 0.7, cz + 0.205, 0.5, 1.3, 0.05, '#b8def2');
  // portico: columns, entablature, pediment
  for (let i = 0; i < 6; i++) {
    const px = cx - 2.5 + i;
    b.cyl(px, F, cz + 1.5, 0.42, 0.12, white);
    b.cyl(px, F + 0.12, cz + 1.5, 0.34, 2.5, white);
  }
  b.box(cx, F + 2.62, cz + 0.65, 6.2, 0.38, 1.9, white);
  b.box(cx, F + 2.62, cz + 1.56, 6.2, 0.1, 0.08, gold);
  b.prism(cx, F + 3.0, cz + 0.65, 6.4, 0.95, 1.95, white);
  b.box(cx, F + 3.1, cz + 1.62, 1.0, 0.36, 0.04, gold);
  // front steps
  b.box(cx, G, cz + 2.9, 5, 0.22, 0.8, '#d6dae0');
  b.box(cx, G + 0.22, cz + 2.55, 5, 0.22, 0.5, '#e1e4e8');
  // dome on a drum
  b.cyl(cx, F + 3.18, cz - 1.7, 2.5, 0.75, white);
  alongFacade(2.0, (u) => b.glass(cx + u, F + 3.3, cz - 0.45, 0.3, 0.45, 0.05, '#9ccbea'), 0.6);
  b.cyl(cx, F + 3.93, cz - 1.7, 2.7, 0.12, gold);
  b.dome(cx, F + 4.05, cz - 1.7, 2.5, 1.5, gold);
  b.cyl(cx, F + 5.45, cz - 1.7, 0.3, 0.45, white);
  b.sphere(cx, F + 6.0, cz - 1.7, 0.28, gold);
  // grounds
  hedge(b, cx - 3.4, cz + 3.9, 2.4, 0.5);
  hedge(b, cx + 3.4, cz + 3.9, 2.4, 0.5);
  for (const [fx, c] of [[-4.3, '#ff9933'], [-3.6, '#ffffff'], [-2.9, '#138808']]) flagPole(b, cx + fx, cz + 3.0, 3.2, c);
  tree(b, r, cx + 4.2, cz + 3.2, 1.0, 'round');
  tree(b, r, cx - 4.3, cz - 4.3, 0.9, 'pine');
  tree(b, r, cx + 4.3, cz - 4.3, 0.9, 'pine');
  bench(b, cx + 2.8, cz + 4.2);
}

/** State Scholarships: 3-storey saffron office, central tower with terracotta pyramid roof, parking. */
export function stateOffice(b, r, parked) {
  const cx = 14, cz = -14;
  const saffron = '#F28E2B', cream = '#fbe9d0', terracotta = '#c4572e';
  const bz = cz - 1.4;
  const top = building(b, r, { x: cx, z: bz, w: 8.2, d: 4.2, floors: 3, color: saffron, door: false });
  // central tower
  const tw = 2.3, ty = top;
  b.box(cx, ty, bz + 0.3, tw, 2.0, 2.4, shade(saffron, -0.08));
  windows(b, r, cx, ty, bz + 0.3, tw, 2.4, 2, { door: false, startY: 0.15, lit: 0.3 });
  b.box(cx, ty + 2.0, bz + 0.3, tw + 0.2, 0.14, 2.6, cream);
  b.pyramid(cx, ty + 2.14, bz + 0.3, tw + 0.3, 1.5, 2.7, terracotta);
  b.cyl(cx, ty + 3.6, bz + 0.3, 0.06, 0.6, '#5b6169');
  b.sphere(cx, ty + 4.2, bz + 0.3, 0.16, '#ffd166', 'glow');
  // entrance porch
  b.box(cx, G, bz + 2.55, 2.6, 1.5, 1.0, cream);
  b.box(cx, G + 1.5, bz + 2.55, 2.8, 0.14, 1.15, terracotta);
  b.glass(cx, G, bz + 3.06, 1.2, 1.1, 0.05, '#8fc3e6');
  b.glow(cx, G + 1.22, bz + 3.065, 1.6, 0.2, 0.04, '#fff4c9');
  // parking lot with stall lines
  const pz = cz + 3.3;
  b.flat(cx, G, pz, 8.4, 0.02, 2.6, '#8d939b');
  for (let i = 0; i <= 5; i++) b.flat(cx - 3.6 + i * 1.44, G + 0.02, pz, 0.06, 0.01, 2.2, '#f4f1e8');
  const colors = ['#4e79a7', '#e15759', '#ffffff', '#59a14f'];
  [0, 1, 3, 4].forEach((slot, i) => parked.push({ x: cx - 2.88 + slot * 1.44, z: pz, y: G + 0.02, heading: i % 2 ? PI / 2 : -PI / 2, type: 'sedan', color: colors[i] }));
  // trees and lamps
  for (const tx of [-4.3, 4.3]) tree(b, r, cx + tx, bz + 2.3, 0.85, 'round');
  lamp(b, cx - 4.4, pz + 1.6);
  lamp(b, cx + 4.4, pz + 1.6);
}

/** Private & Foundation Scholarships: two glass towers, sky bridge, rooftop garden, helipad. */
export function foundationTowers(b, r) {
  const cx = -14, cz = 14;
  const teal = '#3f8f72', green = '#59A14F';
  const bands = (x, z, w, d, floors, color, glass) => {
    b.box(x, G, z, w, floors * FLOOR + 0.3, d, color);
    for (let f = 0; f < floors; f++) {
      b.glass(x, G + 0.3 + f * FLOOR + 0.12, z, w + 0.06, FLOOR - 0.28, d + 0.06, glass);
    }
    const top = G + floors * FLOOR + 0.3;
    b.box(x, top, z, w + 0.12, 0.16, d + 0.12, shade(color, -0.15));
    return top + 0.16;
  };
  // tower A (tall)
  const ax = cx - 1.8, az = cz - 1.4;
  const aTop = bands(ax, az, 3.2, 3.2, 8, teal, '#8fd3e8');
  b.cyl(ax, aTop, az, 2.2, 0.06, '#3d434b');
  b.flat(ax - 0.3, aTop + 0.06, az, 0.14, 0.01, 0.9, '#ffffff');
  b.flat(ax + 0.3, aTop + 0.06, az, 0.14, 0.01, 0.9, '#ffffff');
  b.flat(ax, aTop + 0.06, az, 0.6, 0.01, 0.14, '#ffffff');
  b.cyl(ax + 1.3, aTop, az + 1.3, 0.05, 0.8, '#8a8f96');
  b.sphere(ax + 1.3, aTop + 0.8, az + 1.3, 0.12, '#ff5d5d', 'glow');
  // tower B (shorter) with rooftop garden
  const bx = cx + 2.0, bzz = cz + 0.4;
  const bTop = bands(bx, bzz, 2.8, 2.8, 5, green, '#a9e0d0');
  b.box(bx, bTop, bzz, 2.5, 0.16, 2.5, '#6b4f3a');
  b.box(bx, bTop + 0.16, bzz, 2.4, 0.04, 2.4, '#7cc35d');
  tree(b, r, bx - 0.6, bzz - 0.6, 0.5, 'round', bTop + 0.2);
  tree(b, r, bx + 0.6, bzz + 0.5, 0.45, 'round', bTop + 0.2);
  tree(b, r, bx + 0.6, bzz - 0.6, 0.45, 'pine', bTop + 0.2);
  // sky bridge
  b.glass(cx + 0.2, G + 2.9, cz - 0.3, 0.9, 0.7, 1.0, '#8fd3e8');
  b.box(cx + 0.2, G + 2.8, cz - 0.3, 0.95, 0.1, 1.05, '#e8eef2');
  // lobby canopy and entrance
  b.box(ax, G + 1.2, az + 1.9, 2.2, 0.1, 0.8, '#e8eef2');
  b.box(ax, G, az + 1.62, 1.2, 1.0, 0.04, '#2d3e50');
  // plaza sculpture and seating
  const sx = cx - 2.4, sz = cz + 3.0;
  b.box(sx, G, sz, 0.9, 0.3, 0.9, '#d9dde3');
  b.box(sx, G + 0.3, sz, 0.6, 0.6, 0.6, '#ff6b8b', 0.5);
  b.box(sx, G + 0.9, sz, 0.45, 0.45, 0.45, '#ffd166', 1.1);
  b.box(sx, G + 1.35, sz, 0.3, 0.3, 0.3, '#4e79a7', 0.2);
  bench(b, cx + 0.2, cz + 3.6);
  bench(b, cx + 1.6, cz + 3.6);
  flowerBed(b, r, cx + 3.6, cz + 3.6, 1.4, 0.8);
  tree(b, r, cx - 4.2, cz + 4.0, 0.9, 'round');
  tree(b, r, cx + 4.2, cz - 3.8, 0.9, 'round');
  tree(b, r, cx - 4.3, cz - 4.2, 0.8, 'pine');
}

/** Watchtower: tapered stone tower, balcony, glass lantern room, red roof. The beacon is animated in Beacon.jsx. */
export const WATCHTOWER_BEACON = { x: 0, y: G + 11.45, z: -14 };

export function watchtower(b, r) {
  const cx = 0, cz = -14;
  const stone = '#a3a6ab', dark = '#86898e';
  b.disc(cx, G, cz, 7.2, 0.03, 7.2, '#efe6d2');
  b.disc(cx, G + 0.03, cz, 4.4, 0.02, 4.4, '#e3d6bb');
  b.box(cx, G, cz, 2.6, 1.1, 2.6, dark);
  b.box(cx, G + 1.1, cz, 2.8, 0.14, 2.8, '#75787d');
  b.box(cx, G, cz + 1.31, 0.6, 0.85, 0.05, '#5a4636');
  b.taper(cx, G + 1.24, cz, 1.9, 6.8, stone);
  for (const y of [3.1, 5.4]) b.cyl(cx, G + y, cz, 1.9 - (y - 1.24) * 0.075 + 0.12, 0.14, dark);
  for (const y of [2.2, 4.3, 6.4]) {
    const rr = (1.9 - (y - 1.24) * 0.075) / 2;
    b.glow(cx, G + y, cz + rr - 0.02, 0.18, 0.42, 0.06, '#ffe3a1');
    b.glass(cx + rr - 0.02, G + y + 0.9, cz, 0.06, 0.42, 0.18, '#9ccbea');
  }
  // balcony with railing posts
  const by = G + 8.04;
  b.cyl(cx, by, cz, 2.5, 0.2, '#75787d');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    b.cyl(cx + Math.cos(a) * 1.15, by + 0.2, cz + Math.sin(a) * 1.15, 0.06, 0.45, '#5b6169');
  }
  b.cyl(cx, by + 0.62, cz, 2.4, 0.05, '#5b6169');
  // lantern room and roof
  b.cyl(cx, by + 0.2, cz, 1.25, 0.14, dark);
  b.cyl(cx, by + 0.34, cz, 1.2, 1.0, '#cfe9f5', 'glass');
  b.cyl(cx, by + 1.34, cz, 1.5, 0.12, dark);
  b.cone(cx, by + 1.46, cz, 1.6, 1.25, '#d1495b');
  b.cyl(cx, by + 2.71, cz, 0.06, 0.5, '#5b6169');
  // plaza ring: trees, benches, flower beds
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.5;
    tree(b, r, cx + Math.cos(a) * 3.9, cz + Math.sin(a) * 3.9, 0.85, i % 2 ? 'pine' : 'round');
  }
  bench(b, cx - 2.3, cz + 2.6);
  bench(b, cx + 2.3, cz + 2.6);
  flowerBed(b, r, cx - 3.6, cz - 3.6, 1.0, 1.0);
  flowerBed(b, r, cx + 3.6, cz - 3.6, 1.0, 1.0);
  lamp(b, cx - 1.6, cz + 3.6);
  lamp(b, cx + 1.6, cz + 3.6);
}

/** Town Hall: cream hall with a clock tower and red roof, plaza with fountain and briefing board. */
export function townHall(b, r) {
  const cx = 0, cz = 0;
  const cream = '#F4E9D8', red = '#c8553d', trim = '#ffffff';
  const hz = cz - 1.8;
  b.box(cx, G, hz, 7.6, 0.2, 4.0, '#d8cdb8');
  const F = G + 0.2;
  b.box(cx, F, hz, 7.2, 2.4, 3.4, cream);
  windows(b, r, cx, F, hz, 7.2, 3.4, 2, { door: false, startY: 0.3, lit: 0.2 });
  b.box(cx, F + 2.4, hz, 7.4, 0.12, 3.6, trim);
  b.prism(cx, F + 2.52, hz, 3.7, 1.15, 7.5, red, PI / 2);
  // portico
  for (let i = 0; i < 4; i++) b.cyl(cx - 1.2 + i * 0.8, F, hz + 2.3, 0.28, 1.9, trim);
  b.box(cx, F + 1.9, hz + 1.95, 3.0, 0.24, 1.0, trim);
  b.prism(cx, F + 2.14, hz + 1.95, 3.1, 0.7, 1.05, red);
  b.box(cx, F, hz + 1.71, 1.0, 1.5, 0.06, '#5a4636');
  // clock tower
  const ty = F + 2.52;
  b.box(cx, ty, hz, 1.5, 2.6, 1.5, cream);
  b.box(cx, ty + 2.6, hz, 1.65, 0.14, 1.65, trim);
  b.pyramid(cx, ty + 2.74, hz, 1.8, 1.3, 1.8, '#5b8c85');
  b.cyl(cx, ty + 4.0, hz, 0.06, 0.8, '#5b6169');
  b.box(cx + 0.3, ty + 4.42, hz, 0.55, 0.32, 0.03, '#e15759');
  for (const [dx, dz, rot] of [[0, 0.76, 'z'], [0.76, 0, 'x']]) {
    const px = cx + dx, pz = hz + dz, py = ty + 1.5;
    if (rot === 'z') {
      b.add('cyl', 'solid', px, py, pz, 1.0, 0.06, 1.0, '#fffdf5', 0, PI / 2);
      b.box(px, py, pz + 0.05, 0.06, 0.38, 0.03, '#2b2d42');
      b.box(px + 0.12, py - 0.03, pz + 0.05, 0.28, 0.06, 0.03, '#2b2d42');
    } else {
      b.add('cyl', 'solid', px, py, pz, 1.0, 0.06, 1.0, '#fffdf5', 0, 0, -PI / 2);
      b.box(px + 0.05, py, pz, 0.03, 0.38, 0.06, '#2b2d42');
      b.box(px + 0.05, py - 0.03, pz - 0.12, 0.03, 0.06, 0.28, '#2b2d42');
    }
  }
  // fountain
  const fz = cz + 2.6;
  b.cyl(cx, G, fz, 3.0, 0.42, '#cfc8b8');
  b.disc(cx, G + 0.42, fz, 2.6, 0.02, 2.6, '#7cc6e8');
  b.cyl(cx, G + 0.42, fz, 0.5, 0.8, '#d8d1c1');
  b.cyl(cx, G + 1.22, fz, 1.3, 0.14, '#cfc8b8');
  b.disc(cx, G + 1.36, fz, 1.1, 0.02, 1.1, '#7cc6e8');
  b.sphere(cx, G + 1.55, fz, 0.32, '#bfe6f7');
  // briefing board
  b.box(cx + 3.3, G, fz - 0.4, 0.1, 1.6, 0.1, '#7a5a3c');
  b.box(cx + 4.5, G, fz - 0.4, 0.1, 1.6, 0.1, '#7a5a3c');
  b.box(cx + 3.9, G + 0.7, fz - 0.4, 1.4, 1.0, 0.08, '#7a5a3c');
  b.box(cx + 3.9, G + 0.78, fz - 0.35, 1.25, 0.84, 0.04, '#fffdf5');
  for (let i = 0; i < 3; i++) b.box(cx + 3.65 + i * 0.25, G + 1.15 - i * 0.12, fz - 0.32, 0.5, 0.12, 0.02, ['#4e79a7', '#f28e2b', '#59a14f'][i]);
  // seating, flowers, trees, lamps
  bench(b, cx - 2.2, fz + 1.7);
  bench(b, cx + 2.2, fz + 1.7);
  bench(b, cx - 2.4, fz - 0.2, PI / 2);
  flowerBed(b, r, cx - 4.0, cz + 4.0, 1.2, 1.2);
  flowerBed(b, r, cx + 4.0, cz + 4.0, 1.2, 1.2);
  tree(b, r, cx - 4.3, hz - 0.2, 0.9, 'round');
  tree(b, r, cx + 4.3, hz - 0.2, 0.9, 'round');
  lamp(b, cx - 1.6, cz + 4.3);
  lamp(b, cx + 1.6, cz + 4.3);
}

/** Opportunities district: Hackathon Garage, Tech Events Arena, Meetup Kiosk, billboard and bunting. */
export function opportunitiesDistrict(b, r) {
  const cx = 14, cz = 14;
  // Hackathon Garage
  const gx = cx - 2.6, gz = cz - 2.2;
  b.box(gx, G, gz, 3.4, 2.4, 3.0, '#8e5ea2');
  b.box(gx, G + 2.4, gz, 3.55, 0.14, 3.15, '#6d4580');
  b.box(gx, G, gz + 1.51, 2.1, 1.5, 0.05, '#c9ccd1');
  for (let i = 1; i < 6; i++) b.box(gx, G + i * 0.25, gz + 1.54, 2.1, 0.03, 0.02, '#9aa0a6');
  b.glow(gx, G + 1.8, gz + 1.53, 2.6, 0.3, 0.05, '#ff4fd8');
  b.glow(gx, G + 1.86, gz + 1.56, 2.2, 0.18, 0.03, '#ffffff');
  windows(b, r, gx, G, gz, 3.4, 3.0, 2, { door: false, startY: 0.5, lit: 0.5, faces: 'front' });
  b.dome(gx - 0.8, G + 2.54, gz - 0.6, 1.0, 0.4, '#e8eef2', -0.7);
  b.cyl(gx + 1.1, G + 2.54, gz - 0.9, 0.05, 1.0, '#8a8f96');
  roofProps(b, r, gx + 0.6, G + 2.54, gz + 0.5, 1.6, 1.4);
  // Tech Events Arena
  const ax = cx + 2.4, az = cz - 1.8;
  b.cyl(ax, G, az, 4.2, 1.0, '#ff9da7');
  b.cyl(ax, G + 1.0, az, 4.35, 0.12, '#7af5ff', 'glow');
  b.dome(ax, G + 1.12, az, 4.2, 1.9, '#ffd1dc');
  b.cyl(ax, G + 3.0, az, 0.6, 0.2, '#ff9da7');
  b.box(ax, G, az + 2.0, 1.4, 0.9, 0.9, '#e86a92');
  b.glass(ax, G, az + 2.46, 0.8, 0.75, 0.05, '#8fd3e8');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    b.glow(ax + Math.cos(a) * 2.11, G + 0.45, az + Math.sin(a) * 2.11, 0.22, 0.3, 0.22, i % 2 ? '#ffe066' : '#7af5ff');
  }
  // Meetup Kiosk
  const kx = cx - 2.4, kz = cz + 2.6;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl(kx + dx * 0.95, G, kz + dz * 0.95, 0.1, 1.6, '#f4f1ea');
  b.pyramid(kx, G + 1.6, kz, 2.5, 0.9, 2.5, '#f6c445');
  b.box(kx, G, kz, 1.6, 0.75, 0.6, '#ffffff');
  b.box(kx, G + 0.75, kz, 1.7, 0.06, 0.7, '#f28e2b');
  b.glow(kx, G + 1.25, kz + 1.0, 1.2, 0.26, 0.04, '#ffe066');
  // billboard screen
  const sx = cx + 3.2, sz = cz + 3.1;
  b.box(sx - 1.0, G, sz, 0.12, 1.4, 0.12, '#5b6169');
  b.box(sx + 1.0, G, sz, 0.12, 1.4, 0.12, '#5b6169');
  b.box(sx, G + 1.2, sz, 2.5, 1.4, 0.16, '#2b2d42');
  ['#7af5ff', '#ff4fd8', '#ffe066'].forEach((c, i) => b.glow(sx - 0.78 + i * 0.78, G + 1.3, sz + 0.09, 0.72, 1.2, 0.03, c));
  // bunting across the plaza
  const p0 = [cx - 4.3, cz + 0.6], p1 = [cx + 4.3, cz + 0.6];
  b.cyl(p0[0], G, p0[1], 0.08, 2.4, '#5b6169');
  b.cyl(p1[0], G, p1[1], 0.08, 2.4, '#5b6169');
  const flags = ['#ff6b8b', '#ffd166', '#7af5ff', '#9b5de5', '#59a14f'];
  for (let i = 1; i < 16; i++) {
    const t = i / 16;
    const sag = 0.55 * Math.sin(t * PI);
    b.cone(p0[0] + (p1[0] - p0[0]) * t, G + 2.35 - sag, p0[1], 0.26, 0.32, flags[i % flags.length], PI);
  }
  // bean bags and trees
  for (const [dx, dz, c] of [[0.8, 2.2, '#ff6b8b'], [1.4, 1.6, '#4e79a7'], [0.3, 1.4, '#ffd166']]) b.dodeca(cx + dx, G + 0.15, cz + dz, 0.5, c, dx, 0.6);
  tree(b, r, cx + 4.3, cz + 0.2, 0.8, 'round');
  tree(b, r, cx - 4.3, cz - 4.3, 0.8, 'pine');
  lamp(b, cx + 0.2, cz + 4.4);
}
