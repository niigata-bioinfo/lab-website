/**
 * helix テーマの背景: 回転する DNA 二重らせんと漂う粒子 (Three.js)。
 * start() で <canvas id="helix-canvas"> を body に追加し、戻り値の関数で完全に破棄する。
 * prefers-reduced-motion のときは 1 フレームだけ描いて止まる。タブが非表示の間は描画しない。
 */
import * as THREE from 'three';

const STRAND_A = new THREE.Color('#22d3ee');
const STRAND_B = new THREE.Color('#a78bfa');
const RUNG = new THREE.Color('#5eead4');

export function start(): () => void {
  const canvas = document.createElement('canvas');
  canvas.id = 'helix-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050b14, 0.03);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 22);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const keyLight = new THREE.PointLight(0x22d3ee, 60, 80);
  keyLight.position.set(8, 6, 10);
  const fillLight = new THREE.PointLight(0xa78bfa, 50, 80);
  fillLight.position.set(-8, -4, 8);
  scene.add(keyLight, fillLight);

  // ---- 二重らせん ----
  const helix = new THREE.Group();
  const pairs = 44;            // 塩基対の数
  const rise = 0.55;           // 1 対あたりの上昇量
  const radius = 2.6;
  const turn = (Math.PI * 2) / 10.5; // 1 対あたりの回転角 (10.5 対で 1 回転)
  const sphereGeo = new THREE.SphereGeometry(0.28, 20, 20);
  const strandMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, emissiveIntensity: 0.6 });
  const strandA = new THREE.InstancedMesh(sphereGeo, strandMat.clone(), pairs);
  const strandB = new THREE.InstancedMesh(sphereGeo, strandMat.clone(), pairs);
  (strandA.material as THREE.MeshStandardMaterial).color.copy(STRAND_A);
  (strandA.material as THREE.MeshStandardMaterial).emissive.copy(STRAND_A).multiplyScalar(0.55);
  (strandB.material as THREE.MeshStandardMaterial).color.copy(STRAND_B);
  (strandB.material as THREE.MeshStandardMaterial).emissive.copy(STRAND_B).multiplyScalar(0.55);
  const rungGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 8, 1);
  const rungMat = new THREE.MeshStandardMaterial({ color: RUNG, emissive: RUNG, emissiveIntensity: 0.25, transparent: true, opacity: 0.75, roughness: 0.5 });
  const rungs = new THREE.InstancedMesh(rungGeo, rungMat, pairs);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const yOffset = -((pairs - 1) * rise) / 2;
  for (let i = 0; i < pairs; i++) {
    const a = i * turn;
    const y = yOffset + i * rise;
    const pa = new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
    const pb = new THREE.Vector3(Math.cos(a + Math.PI) * radius, y, Math.sin(a + Math.PI) * radius);
    strandA.setMatrixAt(i, m.makeTranslation(pa.x, pa.y, pa.z));
    strandB.setMatrixAt(i, m.makeTranslation(pb.x, pb.y, pb.z));
    const dir = pb.clone().sub(pa);
    const len = dir.length();
    q.setFromUnitVectors(up, dir.normalize());
    m.compose(pa.clone().add(pb).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
    rungs.setMatrixAt(i, m);
  }
  helix.add(strandA, strandB, rungs);
  helix.rotation.z = 0.45; // 少し傾ける
  helix.position.set(6, 0, -4); // 本文の邪魔にならないよう右へ寄せる
  scene.add(helix);

  // ---- 漂う粒子 ----
  const isSmall = window.innerWidth < 992;
  const count = isSmall ? 180 : 420;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30 - 5;
    speeds[i] = 0.2 + Math.random() * 0.8;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0x9fe8ff, size: 0.12, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // ---- 描画ループ ----
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let running = true;
  const clock = new THREE.Clock();
  let pointerX = 0;
  let pointerY = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    helix.position.x = w < 992 ? 2 : 6;
  }

  function frame() {
    if (!running) return;
    const t = clock.getElapsedTime();
    helix.rotation.y = t * 0.25;
    helix.rotation.x = Math.sin(t * 0.15) * 0.08;
    const pos = particleGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) + speeds[i] * 0.01;
      if (y > 20) y = -20;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    particles.rotation.y = t * 0.02;
    camera.position.x += (pointerX * 1.2 - camera.position.x) * 0.03;
    camera.position.y += (pointerY * 0.8 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    if (!reduceMotion) raf = requestAnimationFrame(frame);
  }

  const onPointer = (e: PointerEvent) => {
    pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerY = -(e.clientY / window.innerHeight - 0.5) * 2;
  };
  const onVisibility = () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!running) { running = true; clock.getDelta(); frame(); }
  };
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  frame();

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    sphereGeo.dispose(); rungGeo.dispose(); particleGeo.dispose();
    (strandA.material as THREE.Material).dispose(); (strandB.material as THREE.Material).dispose();
    rungMat.dispose(); particleMat.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
