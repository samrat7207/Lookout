import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from './batch.js';
import { GEOMETRIES, MATERIALS } from './InstancedBatch.jsx';
import { LANE_OFFSET, LOOPS, ROAD_TOP } from './layout.js';

// Vehicle designs: parts are [dx, y, dz, sx, sy, sz, colour] base-anchored in vehicle
// space (+x forward). 'body' / 'trim' are replaced by the vehicle's colours.
const WHEEL_R = 0.15;
const TYPES = {
  sedan: {
    parts: [[0, 0.12, 0, 1.3, 0.34, 0.68, 'body'], [-0.08, 0.46, 0, 0.72, 0.3, 0.6, '#33475b'], [-0.08, 0.76, 0, 0.62, 0.03, 0.56, 'body']],
    lights: [[0.655, 0.28, 0.2, 0.02, 0.08, 0.12, '#fffbe6'], [0.655, 0.28, -0.2, 0.02, 0.08, 0.12, '#fffbe6'], [-0.655, 0.28, 0.22, 0.02, 0.08, 0.12, '#ff4d4d'], [-0.655, 0.28, -0.22, 0.02, 0.08, 0.12, '#ff4d4d']],
    wheels: [[0.4, 0.35], [-0.4, 0.35]],
  },
  taxi: {
    parts: [[0, 0.12, 0, 1.3, 0.34, 0.68, '#f6c445'], [0, 0.12, 0, 1.31, 0.12, 0.69, '#2b2d42'], [-0.08, 0.46, 0, 0.72, 0.3, 0.6, '#33475b'], [-0.08, 0.76, 0, 0.62, 0.03, 0.56, '#f6c445']],
    lights: [[-0.08, 0.79, 0, 0.26, 0.1, 0.14, '#fff0a0'], [0.655, 0.28, 0.2, 0.02, 0.08, 0.12, '#fffbe6'], [0.655, 0.28, -0.2, 0.02, 0.08, 0.12, '#fffbe6']],
    wheels: [[0.4, 0.35], [-0.4, 0.35]],
  },
  van: {
    parts: [[0, 0.12, 0, 1.45, 0.75, 0.74, 'body'], [0.5, 0.5, 0, 0.42, 0.28, 0.76, '#33475b'], [-0.2, 0.62, 0.375, 0.8, 0.2, 0.02, '#33475b'], [-0.2, 0.62, -0.375, 0.8, 0.2, 0.02, '#33475b']],
    lights: [[0.73, 0.3, 0.24, 0.02, 0.1, 0.12, '#fffbe6'], [0.73, 0.3, -0.24, 0.02, 0.1, 0.12, '#fffbe6'], [-0.73, 0.3, 0.26, 0.02, 0.1, 0.1, '#ff4d4d'], [-0.73, 0.3, -0.26, 0.02, 0.1, 0.1, '#ff4d4d']],
    wheels: [[0.45, 0.37], [-0.45, 0.37]],
  },
  truck: {
    parts: [[0.72, 0.14, 0, 0.62, 0.72, 0.78, 'body'], [0.86, 0.5, 0, 0.36, 0.3, 0.8, '#33475b'], [-0.38, 0.18, 0, 1.5, 0.95, 0.84, 'trim'], [-0.38, 1.13, 0, 1.52, 0.04, 0.86, '#d9dde3']],
    lights: [[1.035, 0.3, 0.26, 0.02, 0.1, 0.12, '#fffbe6'], [1.035, 0.3, -0.26, 0.02, 0.1, 0.12, '#fffbe6'], [-1.135, 0.3, 0.3, 0.02, 0.1, 0.1, '#ff4d4d'], [-1.135, 0.3, -0.3, 0.02, 0.1, 0.1, '#ff4d4d']],
    wheels: [[0.72, 0.4], [-0.15, 0.4], [-0.75, 0.4]],
  },
  rickshaw: {
    parts: [[0, 0.12, 0, 0.9, 0.36, 0.6, '#2a9d8f'], [-0.05, 0.48, 0, 0.8, 0.04, 0.6, '#2a9d8f'], [-0.08, 0.52, 0, 0.84, 0.36, 0.64, '#f6c445'], [0.2, 0.48, 0, 0.04, 0.34, 0.5, '#33475b']],
    lights: [[0.455, 0.3, 0, 0.02, 0.1, 0.12, '#fffbe6']],
    wheels: [[0.36, 0], [-0.3, 0.3]],
  },
};
const BODY_COLORS = ['#e15759', '#4e79a7', '#f28e2b', '#76b7b2', '#ffffff', '#59a14f', '#edc948', '#b07aa1', '#9c755f', '#d3d7dc'];
const TRIM_COLORS = ['#ffffff', '#f4f1ea', '#e15759', '#4e79a7'];

/** Road-centre rounded rectangle, then a keep-left lane offset, resampled every STEP metres. */
const STEP = 0.05;
function lanePath(half, radius, reverse) {
  const pts = [];
  const k = half - radius;
  const corners = [[k, k, 0], [-k, k, 0.5], [-k, -k, 1], [k, -k, 1.5]];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= 12; i++) {
      const a = (a0 + (i / 12) * 0.5) * Math.PI;
      pts.push([cx + radius * Math.cos(a), cz + radius * Math.sin(a)]);
    }
  }
  if (reverse) pts.reverse();
  pts.push(pts[0]);
  // offset to the left of travel: left = (dz, -dx)
  const lane = pts.map((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)];
    const o = pts[Math.max(i - 1, 0)];
    let dx = q[0] - o[0], dz = q[1] - o[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    return [p[0] + dz * LANE_OFFSET, p[1] - dx * LANE_OFFSET];
  });
  lane[lane.length - 1] = lane[0];
  // uniform resample
  const xs = [], zs = [];
  let carry = 0;
  for (let i = 0; i < lane.length - 1; i++) {
    const [ax, az] = lane[i], [bx, bz] = lane[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    let s = carry;
    for (; s < seg; s += STEP) {
      xs.push(ax + ((bx - ax) * s) / seg);
      zs.push(az + ((bz - az) * s) / seg);
    }
    carry = s - seg;
  }
  return { xs: Float32Array.from(xs), zs: Float32Array.from(zs), length: xs.length * STEP };
}

function makeVehicles(parked) {
  const r = rng(99);
  const moving = [];
  for (const loop of LOOPS) {
    for (const reverse of [false, true]) {
      const path = lanePath(loop.half, loop.radius, reverse);
      for (let i = 0; i < loop.perLane; i++) {
        const roll = r();
        const type = roll < 0.14 ? 'truck' : roll < 0.28 ? 'taxi' : roll < 0.4 ? 'rickshaw' : roll < 0.52 ? 'van' : 'sedan';
        moving.push({
          path,
          s0: ((i + r.range(-0.12, 0.12)) / loop.perLane) * path.length,
          speed: loop.speed,
          type,
          color: r.pick(BODY_COLORS),
          trim: r.pick(TRIM_COLORS),
        });
      }
    }
  }
  const still = parked.map((p) => ({ ...p, trim: '#ffffff' }));
  return [...moving, ...still];
}

const m4 = new THREE.Matrix4();
const local = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const col = new THREE.Color();
const WHEEL_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateX(Math.PI / 2);
const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.9, flatShading: true });

export function Traffic({ parked }) {
  const vehicles = useMemo(() => makeVehicles(parked), [parked]);
  const counts = useMemo(() => {
    let parts = 0, lights = 0, wheels = 0;
    for (const veh of vehicles) {
      const t = TYPES[veh.type];
      parts += t.parts.length;
      lights += t.lights.length;
      wheels += t.wheels.reduce((n, [, half]) => n + (half ? 2 : 1), 0);
    }
    return { parts, lights, wheels };
  }, [vehicles]);
  const bodies = useRef();
  const glows = useRef();
  const wheels = useRef();

  // colours once
  useLayoutEffect(() => {
    let p = 0, l = 0;
    for (const veh of vehicles) {
      const t = TYPES[veh.type];
      for (const part of t.parts) bodies.current.setColorAt(p++, col.set(part[6] === 'body' ? veh.color : part[6] === 'trim' ? veh.trim : part[6]));
      for (const lt of t.lights) glows.current.setColorAt(l++, col.set(lt[6]));
    }
    bodies.current.instanceColor.needsUpdate = true;
    glows.current.instanceColor.needsUpdate = true;
  }, [vehicles]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    let p = 0, l = 0, w = 0;
    for (const veh of vehicles) {
      let x, z, heading, y = veh.y ?? ROAD_TOP;
      if (veh.path) {
        const { xs, zs, length } = veh.path;
        const s = (veh.s0 + veh.speed * time) % length;
        const i = Math.floor(s / STEP) % xs.length;
        const j = (i + 6) % xs.length;
        x = xs[i]; z = zs[i];
        heading = Math.atan2(-(zs[j] - z), xs[j] - x);
      } else {
        ({ x, z, heading } = veh);
      }
      q.setFromAxisAngle(up, heading);
      m4.compose(v.set(x, y, z), q, sc.set(1, 1, 1));
      const t = TYPES[veh.type];
      for (const [dx, py, dz, sx, sy, sz] of t.parts) {
        local.makeScale(sx, sy, sz).setPosition(dx, py, dz);
        bodies.current.setMatrixAt(p++, local.premultiply(m4));
      }
      for (const [dx, py, dz, sx, sy, sz] of t.lights) {
        local.makeScale(sx, sy, sz).setPosition(dx, py, dz);
        glows.current.setMatrixAt(l++, local.premultiply(m4));
      }
      for (const [dx, half] of t.wheels) {
        for (const side of half ? [half, -half] : [0]) {
          local.makeScale(WHEEL_R * 2, WHEEL_R * 2, 0.12).setPosition(dx, WHEEL_R, side);
          wheels.current.setMatrixAt(w++, local.premultiply(m4));
        }
      }
    }
    bodies.current.instanceMatrix.needsUpdate = true;
    glows.current.instanceMatrix.needsUpdate = true;
    wheels.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[GEOMETRIES.box, MATERIALS.solid, counts.parts]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={glows} args={[GEOMETRIES.box, MATERIALS.glow, counts.lights]} frustumCulled={false} />
      <instancedMesh ref={wheels} args={[WHEEL_GEO, WHEEL_MAT, counts.wheels]} castShadow frustumCulled={false} />
    </group>
  );
}

