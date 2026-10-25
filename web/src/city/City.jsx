import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import * as THREE from 'three';
import { buildCity } from './buildCity.js';
import { InstancedBatch } from './InstancedBatch.jsx';
import { LandmarkLabels, Landmarks } from './Landmarks.jsx';
import { Beacon } from './Beacon.jsx';
import { AgentTags, Agents, BuildingEffects } from './Agents.jsx';
import { Signs } from './Signs.jsx';
import { LANDMARKS } from './layout.js';
import { MATERIALS } from './InstancedBatch.jsx';

const PAN_LIMIT = 16;
// the view centre sits a little behind the middle, so the run bar never covers the back landmarks
const HOME_TARGET = new THREE.Vector3(-2, 1.5, -2);
const DAY_FOG = new THREE.Color('#e4edf6');
const DUSK_FOG = new THREE.Color('#6f6a8f');

/** Orthographic isometric camera that fits the diorama to the viewport, with orbit/zoom/pan limits.
 *  Clicking a building glides the view to it and zooms in; the glide stops as soon as it arrives. */
function CameraRig({ focusId }) {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const fit = Math.min(size.width / 64, size.height / 44);
  const glide = useRef(null);

  useEffect(() => {
    const lm = LANDMARKS.find((l) => l.id === focusId);
    if (!lm) return;
    glide.current = { target: new THREE.Vector3(lm.x, 1.5, lm.z), zoom: fit * 2.1 };
  }, [focusId, fit]);

  useFrame((_, delta) => {
    const g = glide.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-delta * 4);
    const t = controls.target;
    const dx = (g.target.x - t.x) * k, dz = (g.target.z - t.z) * k;
    t.x += dx;
    t.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
    camera.zoom += (g.zoom - camera.zoom) * k;
    camera.updateProjectionMatrix();
    controls.update();
    if (Math.hypot(g.target.x - t.x, g.target.z - t.z) < 0.02 && Math.abs(g.zoom - camera.zoom) < 0.01) glide.current = null;
  });

  useLayoutEffect(() => {
    camera.zoom = fit;
    camera.updateProjectionMatrix();
  }, [camera, fit]);

  const clampPan = (e) => {
    const controls = e?.target;
    if (!controls) return;
    const t = controls.target;
    const x = THREE.MathUtils.clamp(t.x, -PAN_LIMIT, PAN_LIMIT);
    const z = THREE.MathUtils.clamp(t.z, -PAN_LIMIT, PAN_LIMIT);
    if (x !== t.x || z !== t.z) {
      controls.object.position.x += x - t.x;
      controls.object.position.z += z - t.z;
      t.x = x;
      t.z = z;
    }
  };

  return (
    <OrbitControls
      makeDefault
      target={HOME_TARGET.toArray()}
      enableDamping
      dampingFactor={0.08}
      minZoom={fit * 0.75}
      maxZoom={fit * 4.5}
      minPolarAngle={0.55}
      maxPolarAngle={1.18}
      screenSpacePanning={false}
      onChange={clampPan}
    />
  );
}

/** Shared with the lamp halos: 0 = day, 1 = dusk. */
export const atmosphere = { dusk: 0 };

/** Sun, sky light and haze. The theme (day, dusk or a slow day-to-dusk cycle) sets `dusk`:
 *  the warm key light drops and reddens, the cool sky fill dims, windows and lamps light up,
 *  the haze deepens. Nothing is re-rendered by React. */
function Atmosphere({ theme }) {
  const sun = useRef();
  const sky = useRef();
  const scene = useThree((s) => s.scene);
  const lastCss = useRef(-1);
  const c = useMemo(() => ({
    sunDay: new THREE.Color('#ffe2bd'),
    sunDusk: new THREE.Color('#ff8a4c'),
    skyDay: new THREE.Color('#cfe0ff'),
    skyDusk: new THREE.Color('#7f84c9'),
    glassDusk: new THREE.Color('#ffc870'),
  }), []);

  useEffect(() => {
    scene.fog = new THREE.Fog(DAY_FOG.clone(), 85, 170);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame(({ clock }, delta) => {
    const want = theme === 'dusk' ? 1 : theme === 'cycle' ? (1 - Math.cos((clock.elapsedTime * Math.PI * 2) / 80)) / 2 : 0;
    atmosphere.dusk += (want - atmosphere.dusk) * Math.min(1, delta * (theme === 'cycle' ? 4 : 1.6));
    const d = atmosphere.dusk;
    sun.current.intensity = 3.3 - 2.1 * d;
    sun.current.color.copy(c.sunDay).lerp(c.sunDusk, d);
    sky.current.intensity = 1.9 - 1.0 * d;
    sky.current.color.copy(c.skyDay).lerp(c.skyDusk, d);
    MATERIALS.glass.emissive.copy(c.glassDusk);
    MATERIALS.glass.emissiveIntensity = d * 0.9;
    scene.fog?.color.copy(DAY_FOG).lerp(DUSK_FOG, d);
    if (Math.abs(d - lastCss.current) > 0.01) {
      lastCss.current = d;
      document.documentElement.style.setProperty('--dusk', d.toFixed(3));
    }
  });

  return (
    <>
      <hemisphereLight ref={sky} args={['#cfe0ff', '#bfae94', 1.9]} />
      <directionalLight
        ref={sun}
        position={[22, 38, 14]}
        intensity={3.3}
        color="#ffe2bd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={3}
      />
    </>
  );
}

/** Warm halos on every street lamp, faded in with dusk (one instanced draw call). */
const HALO_GEO = new THREE.IcosahedronGeometry(0.34, 1);
function LampHalos({ lamps }) {
  const ref = useRef();
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffcf73', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  useEffect(() => {
    const m = new THREE.Matrix4();
    lamps.forEach((l, i) => ref.current.setMatrixAt(i, m.makeTranslation(l.x, l.y, l.z)));
    ref.current.instanceMatrix.needsUpdate = true;
    return () => mat.dispose();
  }, [lamps, mat]);
  useFrame(() => {
    mat.opacity = 0.75 * atmosphere.dusk;
    ref.current.visible = atmosphere.dusk > 0.03;
  });
  return <instancedMesh ref={ref} args={[HALO_GEO, mat, lamps.length]} frustumCulled={false} renderOrder={3} />;
}

/** Compass: keeps an "N" needle pointing at world north (-z) as the camera orbits. */
const compassEls = { needle: null };
const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
function CompassTracker() {
  const controls = useThree((s) => s.controls);
  useFrame(({ camera }) => {
    if (!compassEls.needle) return;
    const t = controls?.target ?? HOME_TARGET;
    v0.copy(t).project(camera);
    v1.set(t.x, t.y, t.z - 10).project(camera);
    const ang = Math.atan2(v1.x - v0.x, v1.y - v0.y); // screen angle of north from straight up
    compassEls.needle.style.transform = `rotate(${(ang * 180) / Math.PI}deg)`;
  });
  return null;
}
export function Compass() {
  return (
    <div className="compass" aria-hidden title="North">
      <div className="compass__needle" ref={(el) => (compassEls.needle = el)}><span>N</span></div>
    </div>
  );
}

/** Soft procedural drop shadow under the floating tile (canvas gradient, no image assets). */
function TileShadow() {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, 'rgba(40,52,70,0.35)');
    grad.addColorStop(1, 'rgba(40,52,70,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2, -3.2, 2]}>
      <planeGeometry args={[82, 82]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** `?stats`: FPS panel plus draw calls and triangles from the renderer. */
function RenderStats() {
  const el = useRef(null);
  useEffect(() => {
    const div = document.createElement('div');
    div.className = 'render-stats';
    document.body.appendChild(div);
    el.current = div;
    return () => div.remove();
  }, []);
  const last = useRef(0);
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    window.__lookout = { gl, scene, camera }; // for render benchmarks in DevTools
    return () => delete window.__lookout;
  }, [gl, scene, camera]);
  useFrame(({ gl, clock }) => {
    if (!el.current || clock.elapsedTime - last.current < 0.5) return;
    last.current = clock.elapsedTime;
    const { calls, triangles } = gl.info.render;
    el.current.textContent = `draw calls ${calls} · triangles ${(triangles / 1000).toFixed(1)}k`;
  });
  return <Stats />;
}

/** The 3D city plus its DOM overlays. All run-driven visuals come from `state` (the reducer). */
export default function City({ state, playback, selected, onSelect, theme = 'day' }) {
  const { batch, lamps } = useMemo(buildCity, []);
  const showStats = useMemo(() => new URLSearchParams(window.location.search).has('stats'), []);
  const [hover, setHover] = useState(null);

  return (
    <>
      <Canvas
        shadows="percentage"
        orthographic
        onCreated={({ gl }) => {
          // filmic grade: ACES tone mapping with a slightly lifted exposure
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [42, 40, 42], zoom: 14, near: 0.1, far: 400 }}
      >
        <Atmosphere theme={theme} />
        <LampHalos lamps={lamps} />
        <CompassTracker />
        <InstancedBatch batch={batch} />
        <Signs />
        <Beacon />
        <TileShadow />
        <BuildingEffects state={state} playback={playback} />
        <Agents state={state} playback={playback} selected={selected} onSelect={onSelect} />
        <Landmarks hover={hover} setHover={setHover} onSelect={onSelect} />
        <CameraRig focusId={selected?.type === 'building' ? selected.id : null} />
        {showStats && <RenderStats />}
      </Canvas>
      <LandmarkLabels hover={hover} buildings={state.buildings} selected={selected} onSelect={onSelect} />
      <AgentTags state={state} playback={playback} selected={selected} onSelect={onSelect} />
      <Compass />
      <div className="vignette" aria-hidden />
    </>
  );
}
