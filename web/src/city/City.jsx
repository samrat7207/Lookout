import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import * as THREE from 'three';
import { buildCity } from './buildCity.js';
import { InstancedBatch } from './InstancedBatch.jsx';
import { LandmarkLabels, Landmarks } from './Landmarks.jsx';
import { Beacon } from './Beacon.jsx';
import { Citizens } from './Citizens.jsx';
import { AgentTags, Agents, BuildingEffects } from './Agents.jsx';

const PAN_LIMIT = 16;

/** Orthographic isometric camera that fits the diorama to the viewport, with orbit/zoom/pan limits. */
function CameraRig() {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const fit = Math.min(size.width / 64, size.height / 44);

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
      target={[0, 1.5, 0]}
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

function Lights() {
  return (
    <>
        <hemisphereLight args={['#eef6ff', '#d6c7ae', 2.2]} />
        <directionalLight
          position={[22, 38, 14]}
          intensity={3.4}
          color="#fff1dc"
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
        />
    </>
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
export default function City({ state, playback, selected, onSelect }) {
  const { batch } = useMemo(buildCity, []);
  const showStats = useMemo(() => new URLSearchParams(window.location.search).has('stats'), []);
  const [hover, setHover] = useState(null);

  return (
    <>
      <Canvas
        shadows="percentage"
        orthographic
        flat
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [42, 40, 42], zoom: 14, near: 0.1, far: 400 }}
      >
        <Lights />
        <InstancedBatch batch={batch} />
        <Citizens />
        <Beacon />
        <TileShadow />
        <BuildingEffects state={state} playback={playback} />
        <Agents state={state} playback={playback} selected={selected} onSelect={onSelect} />
        <Landmarks hover={hover} setHover={setHover} onSelect={onSelect} />
        <CameraRig />
        {showStats && <RenderStats />}
      </Canvas>
      <LandmarkLabels hover={hover} buildings={state.buildings} selected={selected} onSelect={onSelect} />
      <AgentTags state={state} playback={playback} selected={selected} onSelect={onSelect} />
    </>
  );
}
