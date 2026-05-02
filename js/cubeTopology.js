import * as THREE from 'three';

export const FACES = 6;
export const FACE_NAMES = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'];
export const GRID_N = 4;

/** 面内対角に対する倍率。稜またぎの隣接セル距離がこれより僅かに大きいため余裕を持たせる */
const EDGE_NEIGHBOR_DIST_MULT = 1.18;

let _cellWorld = null;
let _cellFaceRowCol = null;
/** @type {number[][] | null} */
let _neighborLists = null;

export function cellId(face, row, col, n = GRID_N) {
  return face * n * n + row * n + col;
}

export function parseCellId(id, n = GRID_N) {
  const q = n * n;
  const face = (id / q) | 0;
  const rem = id % q;
  return { face, row: (rem / n) | 0, col: rem % n };
}

export function cellWorldPosition(face, row, col, n, out = new THREE.Vector3()) {
  const fx = (c) => -1 + (2 * c + 1) / n;
  const fy = (r) => 1 - (2 * r + 1) / n;

  switch (face) {
    case 0:
      return out.set(fx(col), fy(row), 1);
    case 1:
      return out.set(-fx(col), fy(row), -1);
    case 2:
      return out.set(1, fy(row), -fx(col));
    case 3:
      return out.set(-1, fy(row), fx(col));
    case 4:
      return out.set(fx(col), 1, -fx(row));
    case 5:
      return out.set(fx(col), -1, fx(row));
    default:
      return out.set(0, 0, 0);
  }
}

export function faceOutwardNormal(face, out = new THREE.Vector3()) {
  switch (face) {
    case 0:
      return out.set(0, 0, 1);
    case 1:
      return out.set(0, 0, -1);
    case 2:
      return out.set(1, 0, 0);
    case 3:
      return out.set(-1, 0, 0);
    case 4:
      return out.set(0, 1, 0);
    case 5:
      return out.set(0, -1, 0);
    default:
      return out.set(0, 1, 0);
  }
}

const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _proj = new THREE.Vector3();

function tangentBasis(face, e1, e2) {
  const n = faceOutwardNormal(face);
  if (Math.abs(n.y) > 0.9) {
    e1.set(1, 0, 0).cross(n).normalize();
    if (e1.lengthSq() < 1e-8) e1.set(0, 0, 1).cross(n).normalize();
    e2.copy(n).cross(e1).normalize();
  } else {
    e2.set(0, 1, 0).cross(n).normalize();
    if (e2.lengthSq() < 1e-8) e2.set(0, 0, 1).cross(n).normalize();
    e1.copy(e2).cross(n).normalize();
  }
}

function buildTopology(n) {
  const total = FACES * n * n;
  _cellWorld = new Float32Array(total * 3);
  _cellFaceRowCol = new Int8Array(total * 3);

  const tmp = new THREE.Vector3();
  for (let f = 0; f < FACES; f++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const id = cellId(f, r, c, n);
        const base = id * 3;
        cellWorldPosition(f, r, c, n, tmp);
        _cellWorld[base] = tmp.x;
        _cellWorld[base + 1] = tmp.y;
        _cellWorld[base + 2] = tmp.z;
        _cellFaceRowCol[id * 3] = f;
        _cellFaceRowCol[id * 3 + 1] = r;
        _cellFaceRowCol[id * 3 + 2] = c;
      }
    }
  }

  const sets = Array.from({ length: total }, () => new Set());

  // 各面のマス目上でキング移動（縦横斜め）の隣を必ず含める。
  // 旧実装の角度ビンは「1ビン1マス」のため、斜めと四鄰が同じビンに入り東西南北が欠ける事故があった。
  for (let f = 0; f < FACES; f++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const id = cellId(f, r, c, n);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < n && nc >= 0 && nc < n) {
              sets[id].add(cellId(f, nr, nc, n));
            }
          }
        }
      }
    }
  }

  // 稜をまたぐ隣接：接線方向へ 8 ビンし、各ビンで最も近いマスを追加。
  const maxDist = ((2 * Math.sqrt(2)) / n) * EDGE_NEIGHBOR_DIST_MULT;
  const maxD = maxDist * maxDist;

  for (let i = 0; i < total; i++) {
    const fi = _cellFaceRowCol[i * 3];
    const piBase = i * 3;
    const px = _cellWorld[piBase];
    const py = _cellWorld[piBase + 1];
    const pz = _cellWorld[piBase + 2];
    tangentBasis(fi, _e1, _e2);

    const binIds = new Array(8).fill(-1);
    const used = new Array(8).fill(Infinity);

    for (let j = 0; j < total; j++) {
      if (i === j) continue;
      const pjBase = j * 3;
      const qx = _cellWorld[pjBase] - px;
      const qy = _cellWorld[pjBase + 1] - py;
      const qz = _cellWorld[pjBase + 2] - pz;
      const d2 = qx * qx + qy * qy + qz * qz;
      if (d2 > maxD) continue;

      _delta.set(qx, qy, qz);
      const nn = faceOutwardNormal(fi);
      _proj.copy(_delta).addScaledVector(nn, -_delta.dot(nn));

      if (_proj.lengthSq() < 1e-12) continue;

      const ang = Math.atan2(_proj.dot(_e2), _proj.dot(_e1));
      let k = Math.round((ang + Math.PI) / ((2 * Math.PI) / 8));
      k = ((k % 8) + 8) % 8;
      if (d2 < used[k]) {
        used[k] = d2;
        binIds[k] = j;
      }
    }

    for (let k = 0; k < 8; k++) {
      if (binIds[k] >= 0) sets[i].add(binIds[k]);
    }
  }

  _neighborLists = new Array(total);
  for (let i = 0; i < total; i++) {
    _neighborLists[i] = Array.from(sets[i]).sort((a, b) => a - b);
  }
}

export function ensureTopology(n = GRID_N) {
  if (_neighborLists && _neighborLists.length === FACES * n * n) return;
  buildTopology(n);
}

export function neighborAt(cell, dirIndex, n = GRID_N) {
  ensureTopology(n);
  const list = _neighborLists[cell];
  return dirIndex < list.length ? list[dirIndex] : -1;
}

export function countNeighbors(cell, n = GRID_N) {
  ensureTopology(n);
  return _neighborLists[cell].length;
}

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _fromStart = new THREE.Vector3();
const _step = new THREE.Vector3();

/**
 * 着手マス中心を通る直線に沿ってマスを進む。
 *
 * 次マスの選び方:
 * 1) 始点からの射影 proj = dot(pos(n)-pos(start), rayDir) を前に進める（cur より大きい）
 * 2) proj がほぼ同じ候補が複数あるとき（横の次マスと斜めなど）、
 *    一歩ベクトルと rayDir の内積 align が大きい方を選ぶ。
 *    旧実装は proj 最大のみで、射影が同値のとき誤って斜めへ進み挟み判定が常に失敗していた。
 */
export function collectRayAlong(start, firstNeighbor, n = GRID_N) {
  ensureTopology(n);
  const total = FACES * n * n;
  const w = _cellWorld;
  const read = (id, o) => o.set(w[id * 3], w[id * 3 + 1], w[id * 3 + 2]);

  read(start, _p0);
  read(firstNeighbor, _p1);
  _rayDir.copy(_p1).sub(_p0).normalize();
  if (_rayDir.lengthSq() < 1e-12) return [];

  // 1 手で進める最大距離（稜またぎ含む）。buildTopology の maxDist と揃える。
  const maxStepLen = ((2 * Math.sqrt(2)) / n) * EDGE_NEIGHBOR_DIST_MULT + 1e-3;

  const out = [];
  let prev = start;
  let cur = firstNeighbor;
  const maxSteps = FACES * n * n + 4;
  const eps = 1e-5;
  const tieProj = 1e-4;

  function collectForward(curProj, curPos) {
    const nbr = _neighborLists[cur];
    /** @type {{ nid: number; proj: number; align: number }[]} */
    const forward = [];
    for (let k = 0; k < nbr.length; k++) {
      const nid = nbr[k];
      if (nid === prev) continue;
      read(nid, _p2);
      _fromStart.copy(_p2).sub(_p0);
      const proj = _fromStart.dot(_rayDir);
      if (proj <= curProj + eps) continue;

      _step.copy(_p2).sub(curPos);
      const slen = _step.length();
      if (slen < 1e-12 || slen > maxStepLen) continue;
      _step.multiplyScalar(1 / slen);
      const align = _step.dot(_rayDir);
      forward.push({ nid, proj, align });
    }
    // 近傍グラフの穴で稜またぎが欠ける場合のフォールバック：直線前方かつ 1 手の距離内のマスを探索
    if (forward.length === 0) {
      for (let nid = 0; nid < total; nid++) {
        if (nid === prev || nid === cur) continue;
        read(nid, _p2);
        _fromStart.copy(_p2).sub(_p0);
        const proj = _fromStart.dot(_rayDir);
        if (proj <= curProj + eps) continue;

        _step.copy(_p2).sub(curPos);
        const slen = _step.length();
        if (slen < 1e-12 || slen > maxStepLen) continue;
        _step.multiplyScalar(1 / slen);
        const align = _step.dot(_rayDir);
        if (align < 0.2) continue;
        forward.push({ nid, proj, align });
      }
    }
    return forward;
  }

  for (let s = 0; s < maxSteps; s++) {
    out.push(cur);
    read(cur, _p1);
    _fromStart.copy(_p1).sub(_p0);
    const curProj = _fromStart.dot(_rayDir);

    const forward = collectForward(curProj, _p1);
    if (forward.length === 0) break;

    let mp = -Infinity;
    for (let f = 0; f < forward.length; f++) {
      if (forward[f].proj > mp) mp = forward[f].proj;
    }
    const near = forward.filter((c) => c.proj >= mp - tieProj);
    near.sort((a, b) => b.align - a.align);
    const best = near[0].nid;
    prev = cur;
    cur = best;
  }

  return out;
}
