import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WATCHTOWER_BEACON } from './landmarks.js';

const CORE_GEO = new THREE.IcosahedronGeometry(0.3, 1);
// cone with its tip at the origin, opening along +x (tilted slightly down)
const BEAM_GEO = new THREE.ConeGeometry(0.6, 6.5, 20, 1, true).translate(0, -3.25, 0).rotateZ(Math.PI / 2 - 0.1);
const BEAM_MAT = new THREE.MeshBasicMaterial({
  color: '#fff3b0',
  transparent: true,
  opacity: 0.08,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

/** The Watchtower's pulsing beacon with two sweeping beams. Stage 5 drives its colour from events. */
export function Beacon() {
  const core = useRef();
  const halo = useRef();
  const beams = useRef();
  const light = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    core.current.scale.setScalar(0.95 + 0.12 * pulse);
    halo.current.scale.setScalar(1.6 + 0.5 * pulse);
    halo.current.material.opacity = 0.18 + 0.14 * pulse;
    light.current.intensity = 6 + 6 * pulse;
    beams.current.rotation.y = t * 0.8;
  });
  const { x, y, z } = WATCHTOWER_BEACON;
  return (
    <group position={[x, y, z]}>
      <mesh ref={core} geometry={CORE_GEO}>
        <meshBasicMaterial color="#ffd166" toneMapped={false} />
      </mesh>
      <mesh ref={halo} geometry={CORE_GEO}>
        <meshBasicMaterial color="#ffd166" transparent opacity={0.25} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color="#ffcf6b" distance={12} decay={1.6} />
      <group ref={beams}>
        <mesh geometry={BEAM_GEO} material={BEAM_MAT} />
        <mesh geometry={BEAM_GEO} material={BEAM_MAT} rotation={[0, Math.PI, 0]} />
      </group>
    </group>
  );
}
