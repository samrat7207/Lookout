import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LANDMARKS, LOT_TOP } from './layout.js';

const RING_GEO = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
const RING_MAT = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

// Label DOM nodes, registered by <LandmarkLabels> (outside the Canvas) and positioned by
// <LabelTracker> (inside it). Plain DOM + one useFrame: no per-label React roots.
const labelEls = new Map();
const v = new THREE.Vector3();

function LabelTracker() {
  const size = useThree((s) => s.size);
  useFrame(({ camera }) => {
    for (const lm of LANDMARKS) {
      const el = labelEls.get(lm.id);
      if (!el) continue;
      v.set(lm.x, lm.labelY, lm.z).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

function HoverRing({ hit }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    const k = 1 + 0.05 * Math.sin(clock.elapsedTime * 4);
    const rad = (Math.max(hit.w, hit.d) / 2) * 0.95 + 0.6;
    ref.current.scale.set(rad * k, 1, rad * k);
  });
  return <mesh ref={ref} geometry={RING_GEO} material={RING_MAT} position={[hit.x, LOT_TOP + 0.04, hit.z]} renderOrder={2} />;
}

/** In-scene part: invisible hover boxes, the highlight ring and the label tracker. */
export function Landmarks({ hover, setHover }) {
  const enter = (lm, hit) => (e) => {
    e.stopPropagation();
    setHover({ id: lm.id, hit });
    document.body.style.cursor = 'pointer';
  };
  const leave = (hit) => () => {
    setHover((h) => (h?.hit === hit ? null : h));
    document.body.style.cursor = '';
  };
  return (
    <>
      {LANDMARKS.flatMap((lm) =>
        lm.hits.map((hit, i) => (
          <mesh
            key={`${lm.id}-${i}`}
            material={HIT_MAT}
            position={[hit.x, LOT_TOP + hit.h / 2, hit.z]}
            onPointerOver={enter(lm, hit)}
            onPointerOut={leave(hit)}
          >
            <boxGeometry args={[hit.w, hit.h, hit.d]} />
          </mesh>
        )),
      )}
      {hover && <HoverRing hit={hover.hit} />}
      <LabelTracker />
    </>
  );
}

/** DOM part: one pill per landmark; the hovered one expands into a name card. */
export function LandmarkLabels({ hover }) {
  return (
    <div className="labels" aria-hidden={!hover}>
      {LANDMARKS.map((lm) => {
        const active = hover?.id === lm.id;
        return (
          <div
            key={lm.id}
            ref={(el) => (el ? labelEls.set(lm.id, el) : labelEls.delete(lm.id))}
            className={`label${active ? ' label--on' : ''}`}
            data-landmark={lm.id}
          >
            <div className="label__pill">
              <span className="label__icon" aria-hidden>{lm.icon}</span>
              <span>{lm.short}</span>
            </div>
            {active && (
              <div className="label__card" role="tooltip">
                <strong>{hover.hit.name ?? lm.name}</strong>
                {hover.hit.name && <em>{lm.name}</em>}
                {lm.id === 'nsp' && !hover.hit.name && <em>National Scholarship Portal</em>}
                <span>{lm.blurb}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
