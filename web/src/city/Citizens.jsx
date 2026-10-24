import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from './batch.js';
import { LOT_TOP } from './layout.js';
import { CROSSING_Y, SIDEWALK_Y, sidewalkGraph } from './paths.js';
import { positions as agentPositions } from './Agents.jsx';

// Ambient citizens: decoration only, never driven by events. Low-poly humanoids
// (head, hair, torso, arms, legs) with a walk cycle. Most walk the sidewalks and wait
// at crossings; some chat in small groups or sit on benches; some carry a bag or look
// at a phone. They step aside when an agent walks past.
// One InstancedMesh per body part (9 in all); matrices are rebuilt each frame.

const WALKERS = 42;
const SITTERS = 8;
const GROUPS = [
  // plaza spots for small chatting groups: [x, z, size]
  [2.0, 11.6, 3],
  [-13.0, 1.9, 2],
  [13.4, 0.5, 3],
  [12.6, 18.3, 2],
  [-2.6, -16.4, 2],
];

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d9a066', '#a86b3c'];
const SHIRTS = ['#e76f51', '#2a9d8f', '#e9c46a', '#f4a261', '#8ab17d', '#6d597a', '#457b9d', '#ffb4a2', '#b5838d', '#f7f7f2', '#3d5a80', '#ee9b00', '#94d2bd', '#ae2012'];
const PANTS = ['#2b2d42', '#3d405b', '#5c677d', '#6b4f3a', '#1d3557', '#8d99ae', '#495057'];
const HAIR = ['#1b1b1b', '#3b2a1e', '#5a3825', '#8b5a2b', '#2e2e2e', '#c9a46c', '#6e6e6e'];
const BAGS = ['#8d5524', '#264653', '#e76f51', '#6d597a', '#2b2d42'];

// body proportions (metres, before the per-person scale)
const HIP = 0.44;
const SHOULDER = 0.78;
const HEAD_Y = 0.93;

const G = {
  leg: new THREE.BoxGeometry(0.11, 0.44, 0.12).translate(0, -0.22, 0),
  arm: new THREE.BoxGeometry(0.075, 0.36, 0.085).translate(0, -0.18, 0),
  torso: new THREE.CylinderGeometry(0.155, 0.13, 0.38, 8).scale(1, 1, 0.62).translate(0, 0.19, 0),
  head: new THREE.IcosahedronGeometry(0.105, 1),
  hairCap: new THREE.SphereGeometry(0.118, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  hairBack: new THREE.BoxGeometry(0.21, 0.26, 0.07).translate(0, -0.13, 0),
  bun: new THREE.IcosahedronGeometry(0.06, 0),
  bag: new THREE.BoxGeometry(0.16, 0.2, 0.07).translate(0, -0.1, 0),
  phone: new THREE.BoxGeometry(0.05, 0.09, 0.014),
};
const MAT = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 });

function makePeople(nodes, benches) {
  const r = rng(424242);
  const looks = () => {
    const hair = r.pick(['short', 'short', 'long', 'bun', 'cap', 'bald']);
    return {
      scale: r.range(0.86, 1.12),
      skin: r.pick(SKIN),
      shirt: r.pick(SHIRTS),
      pants: r.pick(PANTS),
      hair,
      hairColor: hair === 'cap' ? r.pick(SHIRTS) : r.pick(HAIR),
      shortSleeves: r.chance(0.5),
      phase: r() * Math.PI * 2,
    };
  };
  const people = [];
  for (let i = 0; i < WALKERS; i++) {
    const from = Math.floor(r() * nodes.length);
    const link = r.pick(nodes[from].links);
    const carry = r.chance(0.22) ? 'phone' : r.chance(0.25) ? 'bag' : null;
    people.push({
      kind: 'walk', ...looks(), carry, bag: r.pick(BAGS),
      from, to: link.to, crossing: link.crossing, t: r(),
      speed: (carry === 'phone' ? 0.7 : 1) * r.range(0.8, 1.25),
      wait: 0, lane: r.range(-0.2, 0.2), dodge: 0, r,
    });
  }
  for (const [gx, gz, size] of GROUPS) {
    for (let k = 0; k < size; k++) {
      const a = (k / size) * Math.PI * 2 + r() * 0.4;
      const x = gx + Math.cos(a) * 0.42, z = gz + Math.sin(a) * 0.42;
      people.push({ kind: 'chat', ...looks(), carry: r.chance(0.3) ? 'bag' : null, bag: r.pick(BAGS), x, z, heading: Math.atan2(gx - x, gz - z), r });
    }
  }
  const seats = [...benches].sort(() => r() - 0.5).slice(0, SITTERS);
  for (const bnc of seats) {
    const f = [Math.sin(bnc.ry), Math.cos(bnc.ry)];
    people.push({ kind: 'sit', ...looks(), carry: r.chance(0.4) ? 'phone' : null, bag: r.pick(BAGS), x: bnc.x + f[0] * 0.04, z: bnc.z + f[1] * 0.04, heading: bnc.ry, seatY: bnc.seatY, r });
  }
  return people;
}

// scratch objects
const root = new THREE.Matrix4();
const local = new THREE.Matrix4();
const tmp = new THREE.Matrix4();
const out = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const shoulderL = new THREE.Matrix4();
const shoulderR = new THREE.Matrix4();

/** local transform: translate (x, y, z), then rotate about x by `rx` (a hinge) */
function hinge(x, y, z, rx) {
  return local.makeRotationX(rx).setPosition(x, y, z);
}

export function Citizens({ benches = [] }) {
  const nodes = useMemo(sidewalkGraph, []);
  const people = useMemo(() => makePeople(nodes, benches), [nodes, benches]);
  const n = people.length;
  const refs = {
    legs: useRef(), arms: useRef(), torso: useRef(), head: useRef(),
    hairCap: useRef(), hairBack: useRef(), bun: useRef(), bag: useRef(), phone: useRef(),
  };

  useLayoutEffect(() => {
    people.forEach((c, i) => {
      refs.legs.current.setColorAt(2 * i, col.set(c.pants));
      refs.legs.current.setColorAt(2 * i + 1, col.set(c.pants));
      refs.arms.current.setColorAt(2 * i, col.set(c.shortSleeves ? c.skin : c.shirt));
      refs.arms.current.setColorAt(2 * i + 1, col.set(c.shortSleeves ? c.skin : c.shirt));
      refs.torso.current.setColorAt(i, col.set(c.shirt));
      refs.head.current.setColorAt(i, col.set(c.skin));
      refs.hairCap.current.setColorAt(i, col.set(c.hairColor));
      refs.hairBack.current.setColorAt(i, col.set(c.hairColor));
      refs.bun.current.setColorAt(i, col.set(c.hairColor));
      refs.bag.current.setColorAt(i, col.set(c.bag));
      refs.phone.current.setColorAt(i, col.set('#22262b'));
    });
    for (const k of Object.keys(refs)) refs[k].current.instanceColor.needsUpdate = true;
  }, [people]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = clock.elapsedTime;
    const set = (mesh, i, m) => mesh.current.setMatrixAt(i, m);

    people.forEach((c, i) => {
      let x, z, y, heading, walking = false, sitting = false, gesture = 0;

      if (c.kind === 'walk') {
        const A0 = nodes[c.from], B0 = nodes[c.to];
        const len = Math.hypot(B0.x - A0.x, B0.z - A0.z);
        if (c.wait > 0) {
          c.wait -= dt; // waiting at the kerb, or a short stop
        } else {
          c.t += (c.speed * dt) / len;
          walking = true;
          if (c.t >= 1) {
            c.t = 0;
            const options = B0.links.filter((l) => l.to !== c.from);
            const next = c.r.pick(options.length ? options : B0.links);
            c.from = c.to;
            c.to = next.to;
            c.crossing = next.crossing;
            if (next.crossing) c.wait = c.r.range(0.6, 2.6); // look both ways
            else if (c.r.chance(0.12)) c.wait = c.r.range(0.8, 3);
          }
        }
        const A = nodes[c.from], B = nodes[c.to];
        const dx = B.x - A.x, dz = B.z - A.z;
        const L = Math.hypot(dx, dz) || 1;
        const lx = dz / L, lz = -dx / L; // left of travel
        x = A.x + dx * c.t;
        z = A.z + dz * c.t;
        // step aside for agents walking past
        let want = 0;
        for (const ap of agentPositions.values()) {
          const d = Math.hypot(ap.x - x, ap.z - z);
          if (d < 1.7) {
            const side = (ap.x - x) * lx + (ap.z - z) * lz > 0 ? -1 : 1;
            want += side * (1.7 - d) * 0.75;
          }
        }
        c.dodge += (THREE.MathUtils.clamp(want, -0.9, 0.9) - c.dodge) * Math.min(1, dt * 5);
        const off = c.lane + c.dodge;
        x += lx * off;
        z += lz * off;
        const onRoad = c.crossing && c.t > 0.12 && c.t < 0.88;
        y = onRoad ? CROSSING_Y : SIDEWALK_Y;
        heading = Math.atan2(dx, dz);
      } else if (c.kind === 'chat') {
        ({ x, z, heading } = c);
        y = LOT_TOP;
        gesture = Math.max(0, Math.sin(time * 1.3 + c.phase * 3)); // takes turns talking
      } else {
        ({ x, z, heading } = c);
        sitting = true;
        y = c.seatY - HIP * c.scale;
      }

      const k = c.scale;
      const cyc = walking ? time * 7.5 * c.speed + c.phase : 0;
      const swing = walking ? Math.sin(cyc) * 0.55 : 0;
      const bob = walking ? Math.abs(Math.sin(cyc)) * 0.025 : 0;
      q.setFromAxisAngle(up, heading);
      root.compose(p.set(x, y + bob, z), q, s.set(k, k, k));

      // legs
      const legL = sitting ? -Math.PI / 2 : swing;
      const legR = sitting ? -Math.PI / 2 : -swing;
      set(refs.legs, 2 * i, out.multiplyMatrices(root, hinge(-0.065, HIP, 0, legL)));
      set(refs.legs, 2 * i + 1, out.multiplyMatrices(root, hinge(0.065, HIP, 0, legR)));
      // arms: swing opposite to the legs; phone arm raised; chatting arm gestures
      const phone = c.carry === 'phone';
      const armL = sitting ? -0.35 : walking ? -swing * 0.8 : 0.05;
      let armR = sitting ? -0.35 : walking ? swing * 0.8 : -0.05;
      if (phone) armR = -1.25;
      else if (gesture) armR = -0.5 - gesture * 0.5;
      shoulderL.copy(hinge(-0.19, SHOULDER, 0, armL));
      shoulderR.copy(hinge(0.19, SHOULDER, 0, armR));
      set(refs.arms, 2 * i, out.multiplyMatrices(root, shoulderL));
      set(refs.arms, 2 * i + 1, out.multiplyMatrices(root, shoulderR));
      // torso, head
      set(refs.torso, i, out.multiplyMatrices(root, local.makeTranslation(0, HIP - 0.02, 0)));
      const nod = c.kind === 'chat' ? Math.sin(time * 2 + c.phase) * 0.06 : phone ? 0.25 : 0;
      const head = local.makeRotationX(nod).setPosition(0, HEAD_Y, 0);
      const headM = tmp.multiplyMatrices(root, head);
      set(refs.head, i, headM);
      // hair
      if (c.hair === 'bald') set(refs.hairCap, i, ZERO);
      else set(refs.hairCap, i, out.multiplyMatrices(headM, local.makeTranslation(0, 0.012, -0.004)));
      if (c.hair === 'long') set(refs.hairBack, i, out.multiplyMatrices(headM, local.makeTranslation(0, 0.05, -0.075)));
      else if (c.hair === 'cap') set(refs.hairBack, i, out.multiplyMatrices(headM, local.makeScale(0.9, 0.12, 2.2).setPosition(0, 0.03, 0.09)));
      else set(refs.hairBack, i, ZERO);
      if (c.hair === 'bun') set(refs.bun, i, out.multiplyMatrices(headM, local.makeTranslation(0, 0.1, -0.07)));
      else set(refs.bun, i, ZERO);
      // carried things hang from the hand (end of the arm)
      if (c.carry === 'bag') set(refs.bag, i, out.multiplyMatrices(root, tmp.multiplyMatrices(shoulderL, local.makeTranslation(-0.02, -0.34, 0))));
      else set(refs.bag, i, ZERO);
      if (phone) set(refs.phone, i, out.multiplyMatrices(root, tmp.multiplyMatrices(shoulderR, local.makeRotationX(Math.PI / 2 - 0.3).setPosition(-0.03, -0.37, 0.02))));
      else set(refs.phone, i, ZERO);
    });
    for (const k of Object.keys(refs)) refs[k].current.instanceMatrix.needsUpdate = true;
  });

  // only the big parts cast shadows: cheap shadow pass
  return (
    <group>
      <instancedMesh ref={refs.legs} args={[G.leg, MAT, 2 * n]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.arms} args={[G.arm, MAT, 2 * n]} frustumCulled={false} />
      <instancedMesh ref={refs.torso} args={[G.torso, MAT, n]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.head} args={[G.head, MAT, n]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.hairCap} args={[G.hairCap, MAT, n]} frustumCulled={false} />
      <instancedMesh ref={refs.hairBack} args={[G.hairBack, MAT, n]} frustumCulled={false} />
      <instancedMesh ref={refs.bun} args={[G.bun, MAT, n]} frustumCulled={false} />
      <instancedMesh ref={refs.bag} args={[G.bag, MAT, n]} frustumCulled={false} />
      <instancedMesh ref={refs.phone} args={[G.phone, MAT, n]} frustumCulled={false} />
    </group>
  );
}
