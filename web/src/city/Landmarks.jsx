import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LANDMARKS, LOT_TOP } from './layout.js';
import { STATUS, TOOL_ICON } from '../ui/agentStyle.js';

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

/** In-scene part: invisible hover/click boxes, the highlight ring and the label tracker. */
export function Landmarks({ hover, setHover, onSelect }) {
  const enter = (lm, hit) => (e) => {
    e.stopPropagation();
    setHover({ id: lm.id, hit });
    document.body.style.cursor = 'pointer';
  };
  const leave = (hit) => () => {
    setHover((h) => (h?.hit === hit ? null : h));
    document.body.style.cursor = '';
  };
  const click = (lm) => (e) => {
    if (e.delta > 6) return; // a drag, not a click
    e.stopPropagation();
    onSelect?.({ type: 'building', id: lm.id });
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
            onClick={click(lm)}
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

const DOING = { search: 'searching…', fetch: 'fetching…', monitor: 'monitoring…', agent: 'agent running…' };

/** One short line of building state under the pill (from events only). */
function statusChip(b) {
  if (!b || b.status === 'idle') return null;
  const failed = Object.values(b.sources).filter((x) => x.status === 'failed').length;
  if (b.status === 'failed') return { cls: 'failed', text: b.retrying ? 'Source trouble · retrying ↻' : 'Source failed ✗' };
  if (b.status === 'busy') return { cls: 'busy', text: `${TOOL_ICON[b.tool] ?? '⏳'} ${DOING[b.tool] ?? 'working…'}` };
  const found = b.findings ? `✓ ${b.findings} found` : '✓ done';
  return { cls: 'done', text: failed ? `${found} · ${failed} source failed` : found, warn: failed > 0 };
}

/** Corner buildings (city v3): real counts from their agent's events, or nothing before the first one. */
export function cornerCounts(state) {
  if (!state) return {};
  const g = state.gate ?? {};
  const v = Object.values(state.verification ?? {});
  const vt = (k) => v.filter((x) => x.status === k).length;
  const checks = state.conflictChecks ?? [];
  const gateSeen = (g.hits ?? 0) + (g.misses ?? 0) + (g.rateLimited ?? 0) + (g.blocked ?? 0) + (g.fallbacks ?? 0);
  return {
    checkpoint: gateSeen ? `${g.hits} cache hits · ${g.rateLimited} backoffs · ${g.blocked} blocked · ${g.fallbacks} fallbacks` : null,
    inspection: v.length ? `${vt('verified')} re-checked · ${vt('changed')} changed · ${vt('unverified')} could not verify` : null,
    appdesk: state.kitBuilds ? `${state.kits} of ${state.kitBuilds} kits ready (read-only)` : null,
    auditor: checks.length ? `${checks.length} checks · ${checks.filter((c) => c.result === 'warning').length} may not be combinable` : null,
  };
}

/** DOM part: one pill per landmark; the hovered one expands into a name card. */
export function LandmarkLabels({ hover, buildings = {}, counts = {}, selected, onSelect }) {
  return (
    <div className="labels" aria-hidden={!hover}>
      {LANDMARKS.map((lm) => {
        const active = hover?.id === lm.id || (selected?.type === 'building' && selected.id === lm.id);
        const base = statusChip(buildings[lm.id]);
        const chip = counts[lm.id] ? { cls: base?.cls === 'busy' ? 'busy' : 'done', text: counts[lm.id] } : base;
        return (
          <div
            key={lm.id}
            ref={(el) => (el ? labelEls.set(lm.id, el) : labelEls.delete(lm.id))}
            className={`label${active ? ' label--on' : ''}`}
            data-landmark={lm.id}
          >
            <button type="button" className="label__pill" onClick={() => onSelect?.({ type: 'building', id: lm.id })}>
              <span className="label__icon" aria-hidden>{lm.icon}</span>
              <span>{lm.short}</span>
            </button>
            {chip && (
              <div className={`label__chip label__chip--${chip.cls}${chip.warn ? ' label__chip--warn' : ''}`} style={{ '--chip': STATUS[chip.cls]?.color }}>
                {chip.text}
              </div>
            )}
            {hover?.id === lm.id && (
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
