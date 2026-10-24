// Reusable low-poly pieces: buildings with window grids and rooftop clutter,
// trees, lamps, benches, flower beds. Everything goes into the shared batch.

import { shade } from './batch.js';
import { LOT_TOP as G } from './layout.js';

export const FLOOR = 0.85;
const GLASS = ['#a9d6f0', '#9ccbea', '#b8def2', '#8fc3e6'];
const LIT = ['#ffe3a1', '#ffd98a', '#fff0c4'];
const GREENS = ['#6ab04c', '#58a043', '#7cc35d', '#4c9a3f', '#88c96a'];
const FLOWERS = ['#ff6b8b', '#ffd166', '#f78c6b', '#c77dff', '#ffffff', '#ff9f1c'];

/** Calls fn(u) for evenly spaced window centres along a facade of length len. */
export function alongFacade(len, fn, pitch = 0.8, margin = 0.35) {
  const n = Math.max(1, Math.floor((len - margin) / pitch));
  const step = (len - margin) / n;
  for (let i = 0; i < n; i++) fn(-len / 2 + margin / 2 + step * (i + 0.5), i);
}

/** Window grid on all four faces of a box whose base is at y0. */
export function windows(b, r, x, y0, z, w, d, floors, opts = {}) {
  const { door = true, lit = 0.14, ww = 0.38, wh = 0.46, startY = 0.32, faces = 'all' } = opts;
  const win = (wx, wy, wz, sx, sz) =>
    r.chance(lit) ? b.glow(wx, wy, wz, sx, wh, sz, r.pick(LIT)) : b.glass(wx, wy, wz, sx, wh, sz, r.pick(GLASS));
  for (let f = 0; f < floors; f++) {
    const y = y0 + startY + f * FLOOR + (FLOOR - wh) / 2;
    alongFacade(w, (u) => {
      if (!(door && f === 0 && Math.abs(u) < 0.5)) win(x + u, y, z + d / 2 + 0.005, ww, 0.05);
      if (faces === 'all') win(x + u, y, z - d / 2 - 0.005, ww, 0.05);
    });
    alongFacade(d, (u) => {
      win(x + w / 2 + 0.005, y, z + u, 0.05, ww);
      if (faces === 'all') win(x - w / 2 - 0.005, y, z + u, 0.05, ww);
    });
  }
}

/** AC units, water tanks, solar panels, antennas and stair huts on a flat roof at height y. */
export function roofProps(b, r, x, y, z, w, d, color = '#cccccc') {
  const cells = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => r() - 0.5);
  const count = Math.min(cells.length, w * d > 6 ? r.pick([2, 3, 3]) : 1);
  for (let i = 0; i < count; i++) {
    const px = x + cells[i][0] * w * 0.24;
    const pz = z + cells[i][1] * d * 0.24;
    switch (r.pick(['ac', 'ac', 'tank', 'solar', 'antenna', 'hut'])) {
      case 'ac':
        b.box(px, y, pz, 0.46, 0.3, 0.4, '#d3d7dc');
        b.cyl(px, y + 0.3, pz, 0.26, 0.03, '#8e959d');
        break;
      case 'tank':
        b.box(px, y, pz, 0.5, 0.14, 0.5, '#7d8288');
        b.cyl(px, y + 0.14, pz, 0.52, 0.55, r.pick(['#e8e1d5', '#4a6fa5', '#2b2d42']));
        b.cone(px, y + 0.69, pz, 0.52, 0.14, '#9aa0a6');
        break;
      case 'solar':
        for (let k = -1; k <= 1; k++) {
          b.box(px + k * 0.4, y, pz, 0.05, 0.14, 0.05, '#80868d');
          b.tilted(px + k * 0.4, y + 0.12, pz, 0.36, 0.03, 0.62, '#2f4f7f', -0.35);
        }
        break;
      case 'antenna':
        b.cyl(px, y, pz, 0.05, 1.1, '#8a8f96');
        b.box(px, y + 0.75, pz, 0.36, 0.03, 0.03, '#8a8f96');
        b.sphere(px, y + 1.12, pz, 0.12, '#ff5d5d', 'glow');
        break;
      case 'hut':
        b.box(px, y, pz, 0.8, 0.6, 0.7, shade(color, -0.1));
        b.box(px, y, pz + 0.36, 0.3, 0.45, 0.03, '#5a4636');
        break;
    }
  }
}

/** A filler building: plinth, body, trim, windows, optional balconies, cap and rooftop props. Returns roof height. */
export function building(b, r, { x, z, w, d, floors, color, balconies = false, trim = true, door = true }) {
  const h = floors * FLOOR + 0.35;
  b.box(x, G, z, w + 0.06, 0.32, d + 0.06, shade(color, -0.28));
  b.box(x, G, z, w, h, d, color);
  if (trim) for (let f = 1; f < floors; f++) b.box(x, G + 0.32 + f * FLOOR - 0.03, z, w + 0.04, 0.06, d + 0.04, shade(color, 0.3));
  windows(b, r, x, G, z, w, d, floors, { door });
  if (door) b.box(x, G, z + d / 2 + 0.01, 0.5, 0.64, 0.06, '#5a4636');
  if (balconies) {
    for (let f = 1; f < floors; f++) {
      const y = G + 0.32 + f * FLOOR;
      alongFacade(w, (u, i) => {
        if (i % 2) return;
        b.box(x + u, y, z + d / 2 + 0.18, 0.62, 0.07, 0.36, '#eeeeee');
        b.box(x + u, y + 0.07, z + d / 2 + 0.35, 0.62, 0.22, 0.03, '#ffffff');
      });
    }
  }
  b.box(x, G + h, z, w + 0.12, 0.14, d + 0.12, shade(color, -0.16));
  roofProps(b, r, x, G + h + 0.14, z, w - 0.4, d - 0.4, color);
  return G + h + 0.14;
}

export function tree(b, r, x, z, s = 1, kind = r.chance(0.7) ? 'round' : 'pine', y = G) {
  b.cyl(x, y, z, 0.16 * s, 0.5 * s, '#8b5e3c');
  if (kind === 'round') {
    b.dodeca(x, y + 0.5 * s + 0.36 * s, z, 0.95 * s, r.pick(GREENS), r() * 6);
    if (r.chance(0.5)) b.dodeca(x + 0.22 * s, y + 0.5 * s + 0.62 * s, z - 0.12 * s, 0.6 * s, r.pick(GREENS), r() * 6);
  } else {
    b.cone(x, y + 0.32 * s, z, 1.0 * s, 1.0 * s, '#3f8f4a');
    b.cone(x, y + 0.85 * s, z, 0.72 * s, 0.85 * s, '#4fa35a');
  }
}

export function lamp(b, x, z, y = G) {
  b.cyl(x, y, z, 0.08, 1.5, '#5b6169');
  b.cone(x, y + 1.48, z, 0.3, 0.14, '#5b6169', Math.PI);
  b.sphere(x, y + 1.46, z, 0.18, '#fff4c9', 'glow');
}

/** Every bench placed while building the city: where citizens can sit (seat at y + 0.26). */
export const BENCH_SPOTS = [];

/** Bench facing +z (ry = 0) or rotated by quarter turns. */
export function bench(b, x, z, ry = 0, y = G) {
  BENCH_SPOTS.push({ x, z, ry, seatY: y + 0.26 });
  const turn = Math.round(ry / (Math.PI / 2)) % 2 !== 0;
  const [w, d] = turn ? [0.32, 0.9] : [0.9, 0.32];
  const back = [Math.sin(ry) * -0.14, Math.cos(ry) * -0.14];
  b.box(x, y, z, turn ? 0.26 : 0.8, 0.2, turn ? 0.8 : 0.26, '#6b6f75');
  b.box(x, y + 0.2, z, w, 0.06, d, '#c48a5a');
  b.box(x + back[0], y + 0.26, z + back[1], turn ? 0.05 : 0.9, 0.24, turn ? 0.9 : 0.05, '#c48a5a');
}

export function flowerBed(b, r, x, z, w, d, y = G) {
  b.box(x, y, z, w, 0.16, d, '#8b6b4a');
  b.box(x, y + 0.16, z, w - 0.1, 0.04, d - 0.1, '#5e8c3a');
  const n = Math.round(w * d * 3);
  for (let i = 0; i < n; i++) {
    b.sphere(x + r.range(-w / 2 + 0.12, w / 2 - 0.12), y + 0.26, z + r.range(-d / 2 + 0.12, d / 2 - 0.12), 0.17, r.pick(FLOWERS));
  }
}

export function hedge(b, x, z, w, d, y = G) {
  b.box(x, y, z, w, 0.38, d, '#4f9a3f');
}

export function flagPole(b, x, z, h, color, y = G) {
  b.cyl(x, y, z, 0.07, h, '#d9dde3');
  b.box(x + 0.32, y + h - 0.42, z, 0.6, 0.36, 0.03, color);
  b.sphere(x, y + h, z, 0.12, '#f2c14e');
}
