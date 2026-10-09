/**
 * helix テーマの背景: 回転する DNA 二重らせんと漂う粒子 (Three.js)。
 * start() で <canvas id="helix-canvas"> を body に追加し、戻り値の関数で完全に破棄する。
 * prefers-reduced-motion のときは 1 フレームだけ描いて止まる。タブが非表示の間は描画しない。
 *
 * - 塩基 (球) は環境マップ + 指向性ライトで陰影と反射ハイライトを付けている。
 * - 塩基対の水素結合は点線のシリンダーで表し、らせんの端から端へ明るさのパルスが周期的に伝播する。
 *   パルスが通過中の塩基対は球もわずかに明るくなる。
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const STRAND_A = new THREE.Color('#22d3ee');
const STRAND_B = new THREE.Color('#a78bfa');
const BOND_DIM = new THREE.Color('#2a6f78');
const BOND_BRIGHT = new THREE.Color('#d9fffb');

/** パルスの周期 (秒) と幅 (らせん全長に対する比率)。 */
const PULSE_PERIOD = 6;
const PULSE_WIDTH = 0.12;

const bondVertexShader = /* glsl */ `
  attribute float aIndex;
  varying vec2 vUv;
  varying float vIndex;
  void main() {
    vUv = uv;
    vIndex = aIndex;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const bondFragmentShader = /* glsl */ `
  uniform float uPulse;      // 0..1 パルスの位置 (らせん全長に対する比率)
  uniform float uWidth;      // パルスの幅
  uniform float uCount;      // 塩基対の数
  uniform vec3 uDim;
  uniform vec3 uBright;
  varying vec2 vUv;
  varying float vIndex;

  // 端で折り返さず、端まで進んだら次の周期で再び始端から始まる (端から端へ伝播)
  float pulseAt(float pos) {
    float d = (pos - uPulse) / uWidth;
    return exp(-d * d * 2.0);
  }

  void main() {
    // 結合の長さ方向 (vUv.y) に 5 つの点を並べ、水素結合らしい点線にする
    float dots = 5.0;
    float seg = fract(vUv.y * dots);
    float dot = smoothstep(0.18, 0.30, seg) * (1.0 - smoothstep(0.70, 0.82, seg));
    // 円柱の縁を少し暗くして丸みを出す
    float rim = 0.75 + 0.25 * (1.0 - abs(vUv.x - 0.5) * 2.0);

    float pos = vIndex / max(uCount - 1.0, 1.0);
    float p = pulseAt(pos);
    vec3 color = mix(uDim, uBright, p) * rim;
    float alpha = dot * mix(0.55, 1.0, p);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function start(): () => void {
  const canvas = document.createElement('canvas');
  canvas.id = 'helix-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050b14, 0.028);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 22);

  // 環境マップ: 球に反射ハイライトを与え、立体感を出す
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.35;

  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(6, 8, 10);
  const rimLight = new THREE.DirectionalLight(0xa78bfa, 1.2);
  rimLight.position.set(-8, -3, -6);
  const fillLight = new THREE.PointLight(0x22d3ee, 40, 60);
  fillLight.position.set(-6, 4, 8);
  scene.add(keyLight, rimLight, fillLight);

  // ---- 二重らせん ----
  const helix = new THREE.Group();
  const pairs = 44;            // 塩基対の数
  const rise = 0.55;           // 1 対あたりの上昇量
  const radius = 2.6;
  const turn = (Math.PI * 2) / 10.5; // 1 対あたりの回転角 (10.5 対で 1 回転)
  const sphereGeo = new THREE.SphereGeometry(0.3, 28, 28);
  const makeStrandMat = (color: THREE.Color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.28,
      metalness: 0.05,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      emissive: color.clone().multiplyScalar(0.12),
    });
  const strandA = new THREE.InstancedMesh(sphereGeo, makeStrandMat(STRAND_A), pairs);
  const strandB = new THREE.InstancedMesh(sphereGeo, makeStrandMat(STRAND_B), pairs);

  // 水素結合: 点線シリンダー + 伝播するパルス
  const rungGeo = new THREE.CylinderGeometry(0.075, 0.075, 1, 10, 1, true);
  const bondUniforms = {
    uPulse: { value: 0 },
    uWidth: { value: PULSE_WIDTH },
    uCount: { value: pairs },
    uDim: { value: BOND_DIM },
    uBright: { value: BOND_BRIGHT },
  };
  const rungMat = new THREE.ShaderMaterial({
    uniforms: bondUniforms,
    vertexShader: bondVertexShader,
    fragmentShader: bondFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const rungs = new THREE.InstancedMesh(rungGeo, rungMat, pairs);
  const indices = new Float32Array(pairs);
  for (let i = 0; i < pairs; i++) indices[i] = i;
  rungGeo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(indices, 1));

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
    strandA.setColorAt(i, STRAND_A);
    strandB.setColorAt(i, STRAND_B);
    // 球の表面同士の間だけを結ぶ (球に埋まる部分を除く)
    const dir = pb.clone().sub(pa);
    const len = dir.length() - 0.6;
    q.setFromUnitVectors(up, dir.clone().normalize());
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
  const tmpColor = new THREE.Color();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    helix.position.x = w < 992 ? 2 : 6;
  }

  /** パルスの位置 (0..1)。周期ごとに始端から終端へ進み、少し余白を置いて次の周期に入る。 */
  function pulsePosition(t: number): number {
    const phase = (t % PULSE_PERIOD) / PULSE_PERIOD;
    return -PULSE_WIDTH * 2 + phase * (1 + PULSE_WIDTH * 4);
  }

  function updateBaseGlow(pulse: number) {
    for (let i = 0; i < pairs; i++) {
      const d = (i / (pairs - 1) - pulse) / PULSE_WIDTH;
      const p = Math.exp(-d * d * 2);
      strandA.setColorAt(i, tmpColor.copy(STRAND_A).lerp(BOND_BRIGHT, p * 0.55));
      strandB.setColorAt(i, tmpColor.copy(STRAND_B).lerp(BOND_BRIGHT, p * 0.55));
    }
    strandA.instanceColor!.needsUpdate = true;
    strandB.instanceColor!.needsUpdate = true;
  }

  function frame() {
    if (!running) return;
    const t = clock.getElapsedTime();
    helix.rotation.y = t * 0.25;
    helix.rotation.x = Math.sin(t * 0.15) * 0.08;
    const pulse = pulsePosition(t);
    bondUniforms.uPulse.value = pulse;
    updateBaseGlow(pulse);
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
    envTexture.dispose(); pmrem.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
