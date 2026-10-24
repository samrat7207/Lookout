import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

// Unit geometries, base-anchored (y from 0 to 1) unless noted.
function prismGeometry() {
  // triangle in the xy plane, extruded along z; flat-shaded (non-indexed)
  const A = [-0.5, 0], B = [0.5, 0], C = [0, 1];
  const f = 0.5, b = -0.5;
  const v = (p, z) => [p[0], p[1], z];
  const tris = [
    [v(A, f), v(B, f), v(C, f)],
    [v(B, b), v(A, b), v(C, b)],
    [v(A, b), v(B, b), v(B, f)], [v(A, b), v(B, f), v(A, f)],
    [v(B, b), v(C, b), v(C, f)], [v(B, b), v(C, f), v(B, f)],
    [v(C, b), v(A, b), v(A, f)], [v(C, b), v(A, f), v(C, f)],
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  g.computeVertexNormals();
  return g;
}

export const GEOMETRIES = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0),
  taper: new THREE.CylinderGeometry(0.36, 0.5, 1, 10).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0),
  pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  dome: new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  sphere: new THREE.IcosahedronGeometry(0.5, 1),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  prism: prismGeometry(),
};

export const MATERIALS = {
  solid: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, metalness: 0 }),
  glass: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.2, metalness: 0.05 }),
  glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
};
MATERIALS.flat = MATERIALS.solid;

const tmp = {
  m: new THREE.Matrix4(),
  q: new THREE.Quaternion(),
  e: new THREE.Euler(),
  p: new THREE.Vector3(),
  s: new THREE.Vector3(),
  c: new THREE.Color(),
};

function Group({ geo, mat, items }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    items.forEach((it, i) => {
      tmp.e.set(it.r[0], it.r[1], it.r[2]);
      tmp.q.setFromEuler(tmp.e);
      tmp.m.compose(tmp.p.fromArray(it.p), tmp.q, tmp.s.fromArray(it.s));
      mesh.setMatrixAt(i, tmp.m);
      mesh.setColorAt(i, tmp.c.set(it.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  return (
    <instancedMesh
      ref={ref}
      args={[GEOMETRIES[geo], MATERIALS[mat], items.length]}
      castShadow={mat === 'solid'}
      receiveShadow={mat !== 'glow'}
    />
  );
}

/** Renders a batch from createBatch(): one draw call per geometry+material pair. */
export function InstancedBatch({ batch }) {
  const groups = useMemo(() => [...batch.groups.entries()], [batch]);
  return groups.map(([key, items]) => {
    const [geo, mat] = key.split('|');
    return <Group key={key} geo={geo} mat={mat} items={items} />;
  });
}
