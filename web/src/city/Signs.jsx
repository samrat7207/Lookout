import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOT_TOP as G } from './layout.js';

// Readable signs on the source buildings and shops: text drawn once into one canvas
// atlas (no font or image assets), all signs merged into one mesh: one draw call.
// Only NSP is named as a portal; no real brand names or logos anywhere.

const SIGNS = [
  { text: 'NATIONAL SCHOLARSHIP PORTAL', x: -14, y: G + 3.32, z: -12.39, h: 0.3, bg: '#f4f1ea', fg: '#2F4B7C' },
  { text: 'STATE SCHOLARSHIPS', x: 14, y: G + 2.2, z: -13.27, h: 0.42, bg: '#2b2d42', fg: '#ffd166' },
  { text: 'PRIVATE & FOUNDATION SCHOLARSHIPS', x: -15.8, y: G + 1.55, z: 14.95, h: 0.2, bg: '#1f3d33', fg: '#ffffff' },
  { text: 'WATCHTOWER', x: 0, y: G + 0.93, z: -12.68, h: 0.17, bg: '#4a4d52', fg: '#ffe3a1' },
  { text: 'TOWN HALL', x: 0, y: G + 2.12, z: 0.66, h: 0.22, bg: '#ffffff', fg: '#8a2c1b' },
  { text: 'HACKATHON GARAGE', x: 11.4, y: G + 2.12, z: 13.36, h: 0.26, bg: '#2b2d42', fg: '#ff9de2' },
  { text: 'TECH EVENTS', x: 16.4, y: G + 0.98, z: 14.68, h: 0.17, bg: '#e86a92', fg: '#ffffff' },
  { text: 'CAFE', x: 10.8, y: G + 1.62, z: 3.96, h: 0.3, bg: '#fff4e6', fg: '#c0392b' },
  { text: 'BOOKS', x: 14, y: G + 1.62, z: 3.96, h: 0.3, bg: '#fff4e6', fg: '#2a9d8f' },
  { text: 'STATIONERY', x: 17.2, y: G + 1.62, z: 3.96, h: 0.26, bg: '#fff4e6', fg: '#4e79a7' },
  { text: 'BUS STOP', x: 9.65, y: G + 1.86, z: -1.37, h: 0.16, bg: '#1d4e89', fg: '#ffffff' },
];

const ROW = 96; // px per sign in the atlas
const ATLAS_W = 2048;

function buildSigns() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = THREE.MathUtils.ceilPowerOfTwo(ROW * SIGNS.length);
  const g = canvas.getContext('2d');
  g.font = `800 ${Math.round(ROW * 0.56)}px "Segoe UI", system-ui, sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';

  const geos = SIGNS.map((sg, i) => {
    const pad = ROW * 0.4;
    const w = Math.min(ATLAS_W, g.measureText(sg.text).width + 2 * pad);
    const y0 = i * ROW;
    g.fillStyle = sg.bg;
    g.fillRect(0, y0 + 4, w, ROW - 8);
    g.fillStyle = sg.fg;
    g.fillText(sg.text, w / 2, y0 + ROW / 2 + 2);
    // plane sized so the text keeps its aspect ratio
    const height = sg.h;
    const width = (height * w) / (ROW - 8);
    const geo = new THREE.PlaneGeometry(width, height);
    const uv = geo.getAttribute('uv');
    const H = canvas.height;
    const u1 = w / ATLAS_W;
    const vTop = 1 - (y0 + 4) / H;
    const vBot = 1 - (y0 + ROW - 4) / H;
    // PlaneGeometry uv order: (0,1) (1,1) (0,0) (1,0)
    uv.setXY(0, 0, vTop);
    uv.setXY(1, u1, vTop);
    uv.setXY(2, 0, vBot);
    uv.setXY(3, u1, vBot);
    geo.rotateY(sg.ry ?? 0);
    geo.translate(sg.x, sg.y, sg.z);
    return geo;
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { geometry: mergeGeometries(geos), texture };
}

export function Signs() {
  const { geometry, texture } = useMemo(buildSigns, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);
  useEffect(() => () => {
    geometry.dispose();
    texture.dispose();
    material.dispose();
  }, [geometry, texture, material]);
  return <mesh geometry={geometry} material={material} renderOrder={1} />;
}
