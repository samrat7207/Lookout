import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from './batch.js';
import { CROSSING_Y, SIDEWALK_Y, sidewalkGraph } from './paths.js';

// Ambient citizens: decoration only, never driven by events. Small pastel people walk
// the sidewalks, cross at the crosswalks, turn at corners and pause now and then.
// Two InstancedMeshes (bodies, heads), one matrix update per citizen per frame.

const COUNT = 52;
const PASTELS = ['#ffb5a7', '#fcd5ce', '#b8e0d2', '#d6eadf', '#eac4d5', '#c9e4de', '#f7d9c4', '#faedcb', '#c6def1', '#dbcdf0', '#f2c6de', '#bde0fe', '#cdeac0', '#ffd6a5'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d9a066'];

const BODY_GEO = new THREE.CapsuleGeometry(0.115, 0.24, 3, 8).translate(0, 0.235, 0);
const HEAD_GEO = new THREE.IcosahedronGeometry(0.11, 1);
const MAT = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 });

function makeCitizens(nodes) {
  const r = rng(424242);
  return Array.from({ length: COUNT }, () => {
    const from = Math.floor(r() * nodes.length);
    const link = r.pick(nodes[from].links);
    return {
      from,
      to: link.to,
      crossing: link.crossing,
      t: r(), // progress along the current edge, 0..1
      speed: r.range(0.75, 1.25),
      pause: 0,
      lane: r.range(-0.22, 0.22), // sideways offset so people don't walk in single file
      phase: r() * Math.PI * 2,
      body: r.pick(PASTELS),
      skin: r.pick(SKIN),
      r,
    };
  });
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);
const up = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

export function Citizens() {
  const nodes = useMemo(sidewalkGraph, []);
  const people = useMemo(() => makeCitizens(nodes), [nodes]);
  const bodies = useRef();
  const heads = useRef();

  useLayoutEffect(() => {
    people.forEach((c, i) => {
      bodies.current.setColorAt(i, col.set(c.body));
      heads.current.setColorAt(i, col.set(c.skin));
    });
    bodies.current.instanceColor.needsUpdate = true;
    heads.current.instanceColor.needsUpdate = true;
  }, [people]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = clock.elapsedTime;
    people.forEach((c, i) => {
      const a = nodes[c.from], b = nodes[c.to];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (c.pause > 0) {
        c.pause -= dt;
      } else {
        c.t += (c.speed * dt) / len;
        if (c.t >= 1) {
          // arrived at a corner: maybe stop for a chat, then pick a new way (rarely straight back)
          c.t = 0;
          const options = b.links.filter((l) => l.to !== c.from);
          const next = c.r.pick(options.length ? options : b.links);
          c.from = c.to;
          c.to = next.to;
          c.crossing = next.crossing;
          if (c.r.chance(0.18)) c.pause = c.r.range(0.8, 3.5);
        }
      }
      const A = nodes[c.from], B = nodes[c.to];
      const dx = B.x - A.x, dz = B.z - A.z;
      const L = Math.hypot(dx, dz) || 1;
      // keep to one side of the walk line: left of travel = (dz, -dx)
      const ox = (dz / L) * c.lane, oz = (-dx / L) * c.lane;
      const walking = c.pause <= 0;
      const onRoad = c.crossing && c.t > 0.12 && c.t < 0.88;
      const bob = walking ? Math.abs(Math.sin(time * 9 * c.speed + c.phase)) * 0.035 : 0;
      p.set(A.x + dx * c.t + ox, (onRoad ? CROSSING_Y : SIDEWALK_Y) + bob, A.z + dz * c.t + oz);
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      m4.compose(p, q, one);
      bodies.current.setMatrixAt(i, m4);
      p.y += 0.69;
      m4.compose(p, q, one);
      heads.current.setMatrixAt(i, m4);
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[BODY_GEO, MAT, COUNT]} castShadow frustumCulled={false} />
      <instancedMesh ref={heads} args={[HEAD_GEO, MAT, COUNT]} castShadow frustumCulled={false} />
    </group>
  );
}
