// Collects primitive instances for the whole static city. Every primitive is a
// unit shape anchored at its base (y = bottom), except sphere/dodeca (centred).
// InstancedBatch renders one InstancedMesh per geometry+material pair, so the
// whole city costs a handful of draw calls.

/** Material flavours. `flat` = solid but casts no shadow (road markings, decals). */
export const MATS = ['solid', 'flat', 'glass', 'glow'];

export function createBatch() {
  /** @type {Map<string, Array<{p:number[], s:number[], r:number[], c:string}>>} */
  const groups = new Map();

  function add(geo, mat, x, y, z, sx, sy, sz, c, ry = 0, rx = 0, rz = 0) {
    const key = `${geo}|${mat}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push({ p: [x, y, z], s: [sx, sy, sz], r: [rx, ry, rz], c });
  }

  return {
    groups,
    add,
    box: (x, y, z, w, h, d, c, ry = 0) => add('box', 'solid', x, y, z, w, h, d, c, ry),
    flat: (x, y, z, w, h, d, c, ry = 0) => add('box', 'flat', x, y, z, w, h, d, c, ry),
    glass: (x, y, z, w, h, d, c, ry = 0) => add('box', 'glass', x, y, z, w, h, d, c, ry),
    glow: (x, y, z, w, h, d, c, ry = 0) => add('box', 'glow', x, y, z, w, h, d, c, ry),
    tilted: (x, y, z, w, h, d, c, rx = 0, ry = 0, rz = 0) => add('box', 'solid', x, y, z, w, h, d, c, ry, rx, rz),
    /** diameter, height */
    cyl: (x, y, z, dia, h, c, mat = 'solid') => add('cyl', mat, x, y, z, dia, h, dia, c),
    disc: (x, y, z, dx, h, dz, c, mat = 'flat') => add('cyl', mat, x, y, z, dx, h, dz, c),
    taper: (x, y, z, dia, h, c) => add('taper', 'solid', x, y, z, dia, h, dia, c),
    cone: (x, y, z, dia, h, c, rx = 0, rz = 0) => add('cone', 'solid', x, y, z, dia, h, dia, c, 0, rx, rz),
    pyramid: (x, y, z, w, h, d, c, ry = 0) => add('pyramid', 'solid', x, y, z, w, h, d, c, ry),
    /** gable with the ridge along z; pass ry = PI/2 for a ridge along x (then w is the z extent) */
    prism: (x, y, z, w, h, d, c, ry = 0) => add('prism', 'solid', x, y, z, w, h, d, c, ry),
    dome: (x, y, z, dia, h, c, rx = 0) => add('dome', 'solid', x, y, z, dia, h, dia, c, 0, rx),
    sphere: (x, y, z, dia, c, mat = 'solid') => add('sphere', mat, x, y, z, dia, dia, dia, c),
    dodeca: (x, y, z, dia, c, ry = 0, sy = 1) => add('dodeca', 'solid', x, y, z, dia, dia * sy, dia, c, ry),
  };
}

/** Darken (amt < 0) or lighten (amt > 0) an sRGB hex colour. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Small deterministic PRNG so the city is the same on every load. */
export function rng(seed = 7) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}
