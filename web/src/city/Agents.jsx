import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shade } from './batch.js';
import { LANDMARKS, LOT_TOP } from './layout.js';
import { pathLength, route, spotFor } from './paths.js';
import { STATUS, TOOL_ICON, placeName, roleColor } from '../ui/agentStyle.js';

// Agent characters. Everything they do comes from the reducer state (agent.status,
// agent.target), which comes only from events: a new target starts a walk along the
// roads, arrival is visual only, and the next event decides what happens next.

const RING_GEO = new THREE.RingGeometry(0.42, 0.56, 32).rotateX(-Math.PI / 2);
const SKIN = '#e8b98f';
const AGENT_SCALE = 1.55; // citizens are about 1 m tall; agents about 1.6 m

// Jobs decide the uniform and the prop (CITY_DESIGN §3).
const JOB = {
  'nsp-scout': 'researcher',
  'foundations-scout': 'researcher',
  'opps-scout': 'researcher',
  'deep-diver': 'researcher',
  'mahadbt-scout': 'verifier',
  watchman: 'verifier',
  verifier: 'verifier',
  profiler: 'researcher',
  mayor: 'orchestrator',
  gatekeeper: 'warden',
};
export const jobOf = (id) => JOB[id] ?? 'researcher';

// limbs hinge at the top (hip or shoulder), in citizen units
const LEG_GEO = new THREE.BoxGeometry(0.115, 0.44, 0.125).translate(0, -0.22, 0);
const ARM_GEO = new THREE.BoxGeometry(0.08, 0.36, 0.09).translate(0, -0.18, 0);
const HIP = 0.44;
const SHOULDER = 0.78;

function coloured(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  return g;
}

/** Upper body (torso, head, hair, uniform details, prop) merged into one mesh, plus limb colours. */
function agentLook(id) {
  const color = roleColor(id);
  const job = jobOf(id);
  const parts = [];
  const add = (geo, hex) => parts.push(coloured(geo, hex));
  const box = (w, h, d, x, y, z, hex, rx = 0) => add(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), hex);
  const torso = (hex) => add(new THREE.CylinderGeometry(0.16, 0.135, 0.38, 8).scale(1, 1, 0.64).translate(0, HIP - 0.02 + 0.19, 0), hex);

  let sleeve = color;
  let pants = '#2f3542';
  if (job === 'orchestrator') {
    sleeve = '#24324a';
    pants = '#24324a';
    torso('#24324a'); // dark suit
    box(0.07, 0.2, 0.01, 0, 0.7, 0.1, '#ffffff'); // shirt
    box(0.03, 0.17, 0.012, 0, 0.69, 0.106, color); // tie in the role colour
    box(0.2, 0.26, 0.016, 0.06, 0.6, 0.17, '#1c1f24', -0.5); // tablet
    box(0.17, 0.22, 0.004, 0.06, 0.605, 0.18, '#5fb3f0', -0.5); // tablet screen
  } else if (job === 'warden') {
    sleeve = '#2b2d42';
    pants = '#2b2d42';
    torso('#2b2d42');
    box(0.29, 0.32, 0.135, 0, 0.63, 0.008, '#d4f000'); // hi-vis vest
    box(0.29, 0.03, 0.137, 0, 0.6, 0.009, '#e0e0e0'); // reflective stripe
    box(0.03, 0.3, 0.03, 0.12, 0.55, 0.16, '#5b6169', -0.2); // stop paddle handle
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12).rotateX(Math.PI / 2 - 0.2).translate(0.12, 0.74, 0.19), '#e63946'); // paddle
  } else if (job === 'verifier') {
    sleeve = '#f4f6f8';
    pants = '#26324a';
    torso('#f4f6f8'); // white shirt
    box(0.27, 0.3, 0.13, 0, 0.63, 0.012, color); // vest in the role colour
    box(0.05, 0.035, 0.012, -0.07, 0.72, 0.085, '#ffd166'); // badge
    box(0.17, 0.23, 0.015, 0.07, 0.6, 0.17, '#8b5a2b', -0.35); // clipboard
    box(0.14, 0.18, 0.004, 0.07, 0.6, 0.179, '#ffffff', -0.35); // paper
    box(0.06, 0.02, 0.02, 0.07, 0.71, 0.14, '#9aa0a6', -0.35); // clip
  } else {
    torso(color); // researcher sweater
    box(0.13, 0.04, 0.12, 0, 0.8, 0.0, '#ffffff'); // collar
    box(0.3, 0.018, 0.21, 0.06, 0.55, 0.15, '#aab2bd', 0.25); // laptop base
    box(0.3, 0.2, 0.012, 0.06, 0.64, 0.05, '#c3c9d1', 0.25); // laptop lid
  }
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 8).translate(0, 0.83, 0), SKIN); // neck
  add(new THREE.IcosahedronGeometry(0.105, 1).translate(0, 0.93, 0), SKIN); // head
  if (job === 'verifier' || job === 'warden') {
    add(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 12).translate(0, 1.0, 0), job === 'warden' ? '#d4f000' : color); // uniform cap
    box(0.16, 0.012, 0.09, 0, 0.975, 0.1, shade(color, -0.3)); // brim
  } else {
    add(new THREE.SphereGeometry(0.118, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.945, -0.006), job === 'orchestrator' ? '#3a3a3a' : '#2b1d14');
  }
  if (job === 'researcher') {
    for (const sx of [-0.042, 0.042]) box(0.06, 0.035, 0.008, sx, 0.94, 0.104, '#1c1f24'); // glasses
    box(0.03, 0.008, 0.008, 0, 0.945, 0.106, '#1c1f24');
  }
  return { upper: mergeGeometries(parts), sleeve, pants };
}
const FACE_CAMERA = Math.PI / 4; // the iso camera looks from +x +z

/** Live positions, shared with the DOM tag tracker and the citizens (who step aside). id -> THREE.Vector3 */
export const positions = new Map();
const tagEls = new Map();
const tmp = new THREE.Vector3();

function Character({ agent, playback, selected, onSelect, lane }) {
  const group = useRef();
  const body = useRef();
  const ring = useRef();
  const isMayor = agent.id === 'mayor';
  const look = useMemo(() => agentLook(agent.id), [agent.id]);
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }),
    sleeve: new THREE.MeshStandardMaterial({ color: look.sleeve, flatShading: true, roughness: 0.8 }),
    pants: new THREE.MeshStandardMaterial({ color: look.pants, flatShading: true, roughness: 0.85 }),
    ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  }), [look]);
  useEffect(() => () => {
    look.upper.dispose();
    Object.values(mats).forEach((m) => m.dispose());
  }, [look, mats]);
  const legL = useRef();
  const legR = useRef();
  const armL = useRef();
  const armR = useRef();

  // walk simulation (visual only)
  const sim = useRef(null);
  if (!sim.current) {
    const at = agent.status === 'walking' && agent.target !== 'townhall' ? 'townhall' : agent.target;
    const [x, z] = spotFor(at, agent.slot, isMayor, agent.id);
    sim.current = { pos: new THREE.Vector3(x, LOT_TOP, z), place: at, target: at, path: null, seg: 1, speed: 4, heading: FACE_CAMERA, born: -1 };
    positions.set(agent.id, sim.current.pos);
  }
  useEffect(() => () => positions.delete(agent.id), [agent.id]);

  const statusRef = useRef(agent.status);
  statusRef.current = agent.status;
  const playRef = useRef(playback);
  playRef.current = playback;

  useFrame(({ clock }, delta) => {
    const s = sim.current;
    const time = clock.elapsedTime;
    const { paused, speed } = playRef.current;
    // large dt is allowed so agents catch up after a throttled or hidden tab
    const dt = paused ? 0 : Math.min(delta, 1) * speed;
    if (s.born < 0) s.born = time;

    // a new target from the events: plan a route from wherever we are now
    if (agent.target !== s.target) {
      const [tx, tz] = spotFor(agent.target, agent.slot, isMayor, agent.id);
      const path = route([s.pos.x, s.pos.z, s.pos.y], s.place, [tx, tz], agent.target, lane);
      // brisk toy walk: a trip takes about 3 s of run time whatever its length
      s.speed = THREE.MathUtils.clamp(pathLength(path) / 3, 3.5, 9);
      s.path = path;
      s.seg = 1;
      s.target = agent.target;
      s.place = agent.target;
    }

    let moving = false;
    if (s.path && s.seg < s.path.length) {
      let step = s.speed * dt;
      while (step > 0 && s.seg < s.path.length) {
        const [x, z, y] = s.path[s.seg];
        const dx = x - s.pos.x, dz = z - s.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4) s.heading = Math.atan2(dx, dz);
        if (d <= step) {
          s.pos.set(x, y, z);
          step -= d;
          s.seg++;
        } else {
          s.pos.x += (dx / d) * step;
          s.pos.z += (dz / d) * step;
          s.pos.y += ((y - s.pos.y) * step) / d;
          step = 0;
        }
      }
      moving = dt > 0;
      if (s.seg >= s.path.length) s.path = null;
    } else if (!s.path) {
      // standing: face the building we work at, or the camera at Town Hall
      const lm = LANDMARKS.find((l) => l.id === s.place);
      const want = s.place !== 'townhall' && lm ? Math.atan2(lm.x - s.pos.x, lm.z - s.pos.z) : FACE_CAMERA;
      s.heading += Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading)) * Math.min(1, dt * 6 + (paused ? 0 : 0.02));
    }

    const g = group.current;
    const st = statusRef.current;
    const pop = Math.min(1, (time - s.born) / 0.45);
    g.scale.setScalar(pop < 1 ? 1 - (1 - pop) ** 3 * 1.0 : 1);
    g.position.copy(s.pos);
    g.rotation.y = s.heading;
    const t = paused ? 0 : time;
    // walk with purpose: quick, even strides; the prop hand stays in front
    const cyc = t * 9;
    const swing = moving ? Math.sin(cyc) * 0.6 : 0;
    legL.current.rotation.x = swing;
    legR.current.rotation.x = -swing;
    armL.current.rotation.x = moving ? -swing * 0.8 : st === 'working' ? -0.4 + Math.sin(t * 6) * 0.25 : 0.05;
    armR.current.rotation.x = -0.95; // holds the laptop, clipboard or tablet
    body.current.position.y = moving ? Math.abs(Math.sin(cyc)) * 0.025 : st === 'done' ? Math.max(0, Math.sin(t * 3)) * 0.03 : 0;
    body.current.rotation.x = moving ? 0.06 : st === 'working' ? 0.1 : 0;
    // failed: a small shake so it reads at a glance
    if (st === 'failed' && !moving) body.current.position.x = Math.sin(t * 40) * 0.02;
    else body.current.position.x = 0;

    mats.ring.color.set(STATUS[st]?.color ?? '#ffffff');
    const k = selected ? 1.25 + Math.sin(time * 5) * 0.08 : 1;
    ring.current.scale.set(k, 1, k);
    mats.body.emissive.set(st === 'failed' ? '#7a0010' : '#000000');
    mats.sleeve.emissive.set(st === 'failed' ? '#7a0010' : '#000000');
  });

  const click = (e) => {
    if (e.delta > 6) return; // a drag, not a click
    e.stopPropagation();
    onSelect({ type: 'agent', id: agent.id });
  };
  const hover = (on) => (e) => {
    e.stopPropagation();
    document.body.style.cursor = on ? 'pointer' : '';
  };

  return (
    <group ref={group}>
      <mesh ref={ring} geometry={RING_GEO} material={mats.ring} position={[0, 0.03, 0]} renderOrder={2} />
      <group ref={body} scale={AGENT_SCALE} onClick={click} onPointerOver={hover(true)} onPointerOut={hover(false)}>
        <mesh geometry={look.upper} material={mats.body} castShadow />
        <mesh ref={legL} geometry={LEG_GEO} material={mats.pants} position={[-0.068, HIP, 0]} castShadow />
        <mesh ref={legR} geometry={LEG_GEO} material={mats.pants} position={[0.068, HIP, 0]} castShadow />
        <mesh ref={armL} geometry={ARM_GEO} material={mats.sleeve} position={[-0.2, SHOULDER, 0]} />
        <mesh ref={armR} geometry={ARM_GEO} material={mats.sleeve} position={[0.2, SHOULDER, 0]} />
      </group>
    </group>
  );
}

/** Projects every agent's tag (DOM) above its head, once per frame. */
function TagTracker() {
  const size = useThree((s) => s.size);
  useFrame(({ camera }) => {
    for (const [id, el] of tagEls) {
      const pos = positions.get(id);
      if (!pos) {
        el.style.visibility = 'hidden';
        continue;
      }
      tmp.set(pos.x, pos.y + 1.85, pos.z).project(camera);
      el.style.visibility = 'visible';
      el.style.transform = `translate(${(((tmp.x + 1) / 2) * size.width).toFixed(1)}px, ${(((1 - tmp.y) / 2) * size.height).toFixed(1)}px) translate(-50%, -100%)`;
    }
  });
  return null;
}

/** In-scene part: one character per agent in the run. */
export function Agents({ state, playback, selected, onSelect }) {
  return (
    <>
      {state.agentOrder.map((id, i) => (
        <Character
          key={`${state.runId}:${id}`}
          agent={state.agents[id]}
          playback={playback}
          selected={selected?.type === 'agent' && selected.id === id}
          onSelect={onSelect}
          lane={(i % 5) - 2}
        />
      ))}
      <TagTracker />
    </>
  );
}

/** DOM part: name tag, status and speech bubble above each agent. */
export function AgentTags({ state, playback, selected, onSelect }) {
  const bubbleMs = 2800 / (playback.speed || 1);
  return (
    <div className="tags">
      {state.agentOrder.map((id) => {
        const a = state.agents[id];
        const st = STATUS[a.status] ?? STATUS.idle;
        const isSel = selected?.type === 'agent' && selected.id === id;
        // agents resting at Town Hall shrink to a dot so the plaza stays readable
        const compact = !isSel && a.target === 'townhall' && (a.status === 'done' || (a.status === 'idle' && id !== 'mayor'));
        const where = a.status === 'walking' ? `→ ${placeName(a.target)}` : a.status === 'working' && a.tool ? `${TOOL_ICON[a.tool] ?? ''} ${a.tool}` : st.label;
        return (
          <div
            key={`${state.runId}:${id}`}
            ref={(el) => (el ? tagEls.set(id, el) : tagEls.delete(id))}
            className={`tag tag--${a.status}${compact ? ' tag--compact' : ''}${isSel ? ' tag--selected' : ''}`}
          >
            {a.bubble && a.status !== 'failed' && (
              <div key={a.bubble.seq} className="tag__bubble" style={{ animationDuration: `${bubbleMs}ms` }}>
                {a.bubble.text}
              </div>
            )}
            {a.status === 'failed' && a.lastEvent?.kind === 'agent.error' && (
              <div className="tag__bubble tag__bubble--error">{a.retrying ? 'Site trouble, retrying ↻' : 'Source failed ✗'}</div>
            )}
            <button type="button" className="tag__pill" onClick={() => onSelect({ type: 'agent', id })}>
              <span className="tag__dot" style={{ background: roleColor(id) }} />
              <strong>{a.name}</strong>
              <span className="tag__status" style={{ color: st.color }}>
                {where}
                {a.status === 'failed' && (a.retrying ? ' ↻' : ' ✗')}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- building effects ----------

const ARC_GEO = new THREE.RingGeometry(0.92, 1, 48, 1, 0, Math.PI * 1.35).rotateX(-Math.PI / 2);
const FULL_GEO = new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2);
const SPARK_GEO = new THREE.OctahedronGeometry(0.13);
const SPARKS = 10;
const BFX_COLOR = { busy: '#f4a261', failed: '#e63946', done: '#43aa8b' };

function BuildingFx({ lm, building, playback }) {
  const ring = useRef();
  const sparks = useRef();
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }), []);
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const status = building.status;
  const hits = lm.hits;
  const cx = hits.reduce((n, h) => n + h.x, 0) / hits.length;
  const cz = hits.reduce((n, h) => n + h.z, 0) / hits.length;
  const rad = Math.max(...hits.map((h) => Math.hypot(h.x - cx, h.z - cz) + Math.max(h.w, h.d) / 2)) * 0.95 + 0.7;
  const top = Math.max(...hits.map((h) => h.h)) + LOT_TOP;

  useEffect(() => () => { mat.dispose(); sparkMat.dispose(); }, [mat, sparkMat]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const run = playback.paused ? 0 : 1;
    mat.color.set(BFX_COLOR[status] ?? '#ffffff');
    if (status === 'busy') {
      ring.current.rotation.y -= 0.03 * run * (playback.speed || 1);
      mat.opacity = 0.85;
    } else if (status === 'failed') {
      mat.opacity = 0.55 + 0.4 * Math.abs(Math.sin(t * 5));
    } else {
      mat.opacity = 0.7;
    }
    if (sparks.current) {
      sparkMat.color.set(status === 'failed' ? '#e63946' : '#ffd166');
      for (let i = 0; i < SPARKS; i++) {
        const phase = (t * 0.6 * (playback.speed || 1) * run + i / SPARKS) % 1;
        const a = i * 2.4;
        const r = 0.6 + (i % 3) * 0.35;
        m4.makeRotationY(t * 2 + i);
        m4.setPosition(cx + Math.cos(a) * r, top + 0.3 + phase * 2.2, cz + Math.sin(a) * r);
        const s = 1 - phase;
        m4.scale(tmp.set(s, s, s));
        sparks.current.setMatrixAt(i, m4);
      }
      sparks.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh
        ref={ring}
        geometry={status === 'busy' ? ARC_GEO : FULL_GEO}
        material={mat}
        position={[cx, LOT_TOP + 0.05, cz]}
        scale={[rad, 1, rad]}
        renderOrder={2}
      />
      {(status === 'busy' || status === 'failed') && (
        <instancedMesh ref={sparks} args={[SPARK_GEO, sparkMat, SPARKS]} frustumCulled={false} />
      )}
    </group>
  );
}

/** Progress ring and sparkles over every building that has work going on. */
export function BuildingEffects({ state, playback }) {
  return LANDMARKS.map((lm) => {
    const b = state.buildings[lm.id];
    if (!b || b.status === 'idle') return null;
    return <BuildingFx key={lm.id} lm={lm} building={b} playback={playback} />;
  });
}
