import {
  FACES,
  GRID_N,
  cellId,
  collectRayAlong,
  countNeighbors,
  ensureTopology,
  neighborAt,
} from './cubeTopology.js';

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export class OthelloCubeGame {
  constructor(n = GRID_N) {
    this.n = n;
    ensureTopology(n);
    this.cells = new Int8Array(FACES * n * n);
    this.current = BLACK;
    this.reset();
  }

  reset() {
    this.cells.fill(EMPTY);
    const c0 = (this.n >> 1) - 1;
    const c1 = this.n >> 1;
    for (let f = 0; f < FACES; f++) {
      this.#set(cellId(f, c0, c0, this.n), BLACK);
      this.#set(cellId(f, c0, c1, this.n), WHITE);
      this.#set(cellId(f, c1, c0, this.n), WHITE);
      this.#set(cellId(f, c1, c1, this.n), BLACK);
    }
    this.current = BLACK;
  }

  get board() {
    return this.cells;
  }

  at(id) {
    return this.cells[id];
  }

  #set(id, v) {
    this.cells[id] = v;
  }

  #opponent(p) {
    return p === BLACK ? WHITE : BLACK;
  }

  flipsIfPlay(cell, by) {
    if (this.at(cell) !== EMPTY) return [];
    const opp = this.#opponent(by);
    const toFlip = [];
    const seen = new Set();
    const nk = countNeighbors(cell, this.n);
    for (let k = 0; k < nk; k++) {
      const nb = neighborAt(cell, k, this.n);
      if (nb < 0 || this.at(nb) !== opp) continue;
      const ray = collectRayAlong(cell, nb, this.n);
      let j = 0;
      while (j < ray.length && this.at(ray[j]) === opp) j++;
      if (j === 0) continue;
      if (j < ray.length && this.at(ray[j]) === by) {
        for (let t = 0; t < j; t++) {
          const id = ray[t];
          if (!seen.has(id)) {
            seen.add(id);
            toFlip.push(id);
          }
        }
      }
    }
    return toFlip;
  }

  canPlay(cell, by) {
    return this.flipsIfPlay(cell, by).length > 0;
  }

  hasAnyMove(forPlayer) {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.at(i) === EMPTY && this.canPlay(i, forPlayer)) return true;
    }
    return false;
  }

  play(cell) {
    if (this.at(cell) !== EMPTY) return false;
    const fl = this.flipsIfPlay(cell, this.current);
    if (fl.length === 0) return false;
    this.#set(cell, this.current);
    for (const id of fl) this.#set(id, this.current);
    let next = this.#opponent(this.current);
    if (!this.hasAnyMove(next)) next = this.#opponent(next);
    this.current = next;
    return true;
  }

  isGameOver() {
    return !this.hasAnyMove(BLACK) && !this.hasAnyMove(WHITE);
  }

  countPieces() {
    let black = 0;
    let white = 0;
    let empty = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.at(i);
      if (v === BLACK) black++;
      else if (v === WHITE) white++;
      else empty++;
    }
    return { black, white, empty };
  }

  /**
   * 標準初期配置（各面中央 2×2、計 24 駒・空き 72）。
   * 誤った終局判定と区別するため UI で使用する。
   */
  isOpeningLayout() {
    const { black, white, empty } = this.countPieces();
    return empty === FACES * this.n * this.n - 24 && black === 12 && white === 12;
  }
}
