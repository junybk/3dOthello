import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  FACES,
  GRID_N,
  cellId,
  cellWorldPosition,
  ensureTopology,
  faceOutwardNormal,
} from './cubeTopology.js';
import { BLACK, EMPTY, OthelloCubeGame } from './othello3d.js';

const HOVER_EMPHASIS = 1.08;

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export class OthelloCubeView {
  constructor(canvas, game, onBoardChange) {
    this.n = GRID_N;
    ensureTopology(this.n);
    this.game = game ?? new OthelloCubeGame(this.n);
    this.onBoardChange = onBoardChange;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x10131c);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(3.2, 2.4, 4.2);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hoveredCell = -1;

    this.cellMeshes = [];
    this.diskMeshes = [];
    this.baseCellColors = new Map();

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(4, 6, 5);
    dir.castShadow = true;
    this.scene.add(dir);

    this.diskMatBlack = new THREE.MeshStandardMaterial({
      color: 0x1a1a1e,
      roughness: 0.35,
      metalness: 0.15,
    });
    this.diskMatWhite = new THREE.MeshStandardMaterial({
      color: 0xf2f2f7,
      roughness: 0.28,
      metalness: 0.08,
    });
    this.cellMatEmpty = new THREE.MeshStandardMaterial({
      color: 0x2d333b,
      roughness: 0.85,
      metalness: 0,
    });

    this.root = new THREE.Group();
    this.scene.add(this.root);

    /** @type {{ t0: number; dur: number; from: THREE.Vector3; to: THREE.Vector3 } | null} */
    this._faceViewAnim = null;

    this.#buildBoard();
    this.syncFromGame();

    const scheduleResize = () => this.resize();
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleResize);
      window.visualViewport.addEventListener('scroll', scheduleResize);
    }

    canvas.addEventListener('pointerdown', (e) => this.#onPointerMove(e, canvas));
    canvas.addEventListener('pointermove', (e) => this.#onPointerMove(e, canvas));
    canvas.addEventListener('click', (e) => this.#onClick(e, canvas));
  }

  #faceTint(face) {
    const tints = [0x3a4f5c, 0x4a3f52, 0x3f4a48, 0x5c4a3a, 0x3a4c5c, 0x4c4a3a];
    return new THREE.Color(tints[face] ?? 0x333333);
  }

  #buildBoard() {
    const cellSize = 2 / this.n;
    const inset = 0.02 * cellSize;
    const plateGeom = new THREE.PlaneGeometry(cellSize - inset, cellSize - inset);
    const diskGeom = new THREE.CylinderGeometry(cellSize * 0.38, cellSize * 0.38, cellSize * 0.22, 40);
    diskGeom.rotateX(Math.PI / 2);

    const normal = new THREE.Vector3();
    const posCell = new THREE.Vector3();
    const posDisk = new THREE.Vector3();

    for (let f = 0; f < FACES; f++) {
      for (let r = 0; r < this.n; r++) {
        for (let c = 0; c < this.n; c++) {
          const id = cellId(f, r, c, this.n);
          cellWorldPosition(f, r, c, this.n, posCell);
          faceOutwardNormal(f, normal);

          const cellMesh = new THREE.Mesh(plateGeom);
          cellMesh.userData.cellId = id;
          const tint = this.#faceTint(f);
          const mat = this.cellMatEmpty.clone();
          mat.color.copy(tint);
          mat.emissive.copy(tint).multiplyScalar(0.06);
          cellMesh.material = mat;
          this.baseCellColors.set(cellMesh, tint.clone());

          posCell.addScaledVector(normal, 0.004);
          cellMesh.position.copy(posCell);
          cellMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
          cellMesh.receiveShadow = true;
          this.root.add(cellMesh);
          this.cellMeshes.push(cellMesh);

          const disk = new THREE.Mesh(diskGeom, this.diskMatBlack);
          disk.userData.cellId = id;
          disk.castShadow = true;
          disk.receiveShadow = true;
          disk.visible = false;
          posDisk.copy(posCell).addScaledVector(normal, cellSize * 0.14);
          disk.position.copy(posDisk);
          disk.quaternion.copy(cellMesh.quaternion);
          this.root.add(disk);
          this.diskMeshes.push(disk);
        }
      }
    }

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.02, 2.02, 2.02)),
      new THREE.LineBasicMaterial({ color: 0x8b949e, transparent: true, opacity: 0.45 })
    );
    this.root.add(edge);
  }

  resize() {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    if (w === 0 || h === 0) return;
    const aspect = w / h;
    this.camera.aspect = aspect;
    const baseFov = 50;
    if (aspect < 1) {
      const t = Math.min(1, (1 - aspect) / 0.58);
      this.camera.fov = THREE.MathUtils.lerp(baseFov, 34, t);
    } else {
      this.camera.fov = baseFov;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  #pickCell(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.cellMeshes, false);
    if (hits.length === 0) return -1;
    const m = hits[0].object;
    return typeof m.userData.cellId === 'number' ? m.userData.cellId : -1;
  }

  #onPointerMove(evt, canvas) {
    const id = this.#pickCell(canvas, evt);
    if (id === this.hoveredCell) return;
    if (this.hoveredCell >= 0) this.#applyHoverStyle(this.hoveredCell, false);
    this.hoveredCell = id;
    if (this.hoveredCell >= 0) this.#applyHoverStyle(this.hoveredCell, true);
  }

  #applyHoverStyle(cell, on) {
    const mesh = this.cellMeshes[cell];
    if (!mesh) return;
    const base = this.baseCellColors.get(mesh);
    if (!base) return;
    const mat = mesh.material;
    if (on && this.game.at(cell) === EMPTY && this.game.canPlay(cell, this.game.current)) {
      mat.color.setHex(0x3d5a4a);
      mat.emissive.setHex(0x1a3328);
      mat.emissiveIntensity = 0.35;
      mesh.scale.setScalar(HOVER_EMPHASIS);
    } else {
      mat.color.copy(base);
      mat.emissive.copy(base).multiplyScalar(0.06);
      mat.emissiveIntensity = 1;
      mesh.scale.setScalar(1);
    }
  }

  #onClick(evt, canvas) {
    const id = this.#pickCell(canvas, evt);
    if (id < 0) return;
    const played = this.game.play(id);
    this.syncFromGame();
    if (played) this.onBoardChange?.();
  }

  /**
   * 指定した面が正面（カメラから真に見える）になるよう視点を移動する。
   * @param {number} face 0..5（cubeTopology の面インデックス）
   */
  viewFace(face) {
    if (face < 0 || face >= FACES) return;
    const normal = new THREE.Vector3();
    faceOutwardNormal(face, normal);
    const dist = this.camera.position.distanceTo(this.controls.target);
    const d = Math.max(2.2, Math.min(dist, 14));
    const end = normal.multiplyScalar(d);
    const dur = prefersReducedMotion() ? 0 : 420;
    this.controls.enabled = false;
    this._faceViewAnim = {
      t0: performance.now(),
      dur,
      from: this.camera.position.clone(),
      to: end,
    };
    if (dur === 0) {
      this.camera.position.copy(end);
      this.controls.target.set(0, 0, 0);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
      this.controls.enabled = true;
      this._faceViewAnim = null;
    }
  }

  syncFromGame() {
    for (let i = 0; i < this.diskMeshes.length; i++) {
      const v = this.game.at(i);
      const disk = this.diskMeshes[i];
      if (!disk) continue;
      if (v === EMPTY) {
        disk.visible = false;
      } else {
        disk.visible = true;
        disk.material = v === BLACK ? this.diskMatBlack : this.diskMatWhite;
      }
    }
    if (this.hoveredCell >= 0) this.#applyHoverStyle(this.hoveredCell, true);
  }

  tick() {
    if (this._faceViewAnim) {
      const a = this._faceViewAnim;
      const t = Math.min(1, (performance.now() - a.t0) / a.dur);
      const k = easeOutCubic(t);
      this.camera.position.lerpVectors(a.from, a.to, k);
      this.controls.target.set(0, 0, 0);
      this.camera.lookAt(this.controls.target);
      if (t >= 1) {
        this.camera.position.copy(a.to);
        this.camera.lookAt(this.controls.target);
        this.controls.update();
        this.controls.enabled = true;
        this._faceViewAnim = null;
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function formatStatus(game) {
  const { black, white } = game.countPieces();
  const showEnd = game.isGameOver() && !game.isOpeningLayout();
  if (showEnd) {
    let msg = `終局 — 黒 ${black}　白 ${white}`;
    if (black > white) msg += '　黒の勝ち';
    else if (white > black) msg += '　白の勝ち';
    else msg += '　引き分け';
    return msg;
  }
  return `枚数：黒 ${black}　白 ${white}`;
}
