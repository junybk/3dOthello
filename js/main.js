import { BLACK, WHITE } from './othello3d.js';
import { formatStatus, OthelloCubeView } from './scene.js';

const canvas = document.querySelector('#game-canvas');
const statusEl = document.querySelector('#status');
const btnReset = document.querySelector('#btn-reset');
const turnPill = document.querySelector('#turn-pill');
const turnText = document.querySelector('#turn-text');

const victoryOverlay = document.querySelector('#victory-overlay');
const victoryTitle = document.querySelector('#victory-title');
const victoryScore = document.querySelector('#victory-score');
const victoryEmoji = document.querySelector('#victory-emoji');
const victoryClose = document.querySelector('#victory-close');
const victoryCard = document.querySelector('.victory-card');
const confettiHost = document.querySelector('#confetti-host');
const viewportFrame = document.querySelector('#viewport-frame');

let view;
let victoryDismissed = false;
let victoryShownSig = null;

function syncTurnBanner() {
  const g = view.game;
  turnPill.classList.remove('is-black', 'is-white', 'is-over');
  const endedForUi = g.isGameOver() && !g.isOpeningLayout();
  if (endedForUi) {
    turnPill.classList.add('is-over');
    turnText.textContent = '対局終了';
    return;
  }
  if (g.current === BLACK) {
    turnPill.classList.add('is-black');
    turnText.textContent = '黒の番です';
  } else {
    turnPill.classList.add('is-white');
    turnText.textContent = '白の番です';
  }
}

function hideVictory() {
  victoryOverlay.classList.add('is-hidden');
  victoryOverlay.classList.remove('is-visible');
  victoryOverlay.setAttribute('inert', '');
  confettiHost.innerHTML = '';
}

function spawnConfetti(kind) {
  confettiHost.innerHTML = '';
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const count = kind === 'draw' ? 28 : 52;
  const colors =
    kind === 'draw'
      ? ['#8b949e', '#6e7681', '#484f58', '#c9d1d9']
      : ['#58a6ff', '#f0883e', '#a371f7', '#3fb950', '#f778ba', '#ffffff', '#d29922'];

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'confetti-piece';
    el.style.left = `${Math.random() * 100}%`;
    el.style.backgroundColor = colors[i % colors.length];
    const dur = 2.4 + Math.random() * 2.2;
    const delay = Math.random() * 0.45;
    const rot = `${Math.random() * 360}deg`;
    const dxStart = `${(Math.random() - 0.5) * 28}px`;
    const dxEnd = `${(Math.random() - 0.5) * 120}px`;
    el.style.setProperty('--dur', `${dur}s`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--rot', rot);
    el.style.setProperty('--dx-start', dxStart);
    el.style.setProperty('--dx-end', dxEnd);
    el.style.animationDelay = `${delay}s`;
    confettiHost.appendChild(el);
  }
}

function showVictoryResult() {
  const g = view.game;
  const { black, white } = g.countPieces();
  let kind = 'draw';
  if (black > white) {
    victoryTitle.textContent = '黒の勝ち！';
    victoryEmoji.textContent = '🏆';
    victoryCard.classList.remove('is-draw');
    kind = 'black';
  } else if (white > black) {
    victoryTitle.textContent = '白の勝ち！';
    victoryEmoji.textContent = '🏆';
    victoryCard.classList.remove('is-draw');
    kind = 'white';
  } else {
    victoryTitle.textContent = '引き分け';
    victoryEmoji.textContent = '🤝';
    victoryCard.classList.add('is-draw');
    kind = 'draw';
  }
  victoryScore.textContent = `枚数　黒 ${black}　／　白 ${white}`;
  spawnConfetti(kind);
  victoryOverlay.classList.remove('is-hidden');
  victoryOverlay.classList.add('is-visible');
  victoryOverlay.removeAttribute('inert');
}

function updateVictoryOverlay() {
  const g = view.game;
  if (!g.isGameOver() || g.isOpeningLayout()) {
    hideVictory();
    victoryDismissed = false;
    victoryShownSig = null;
    return;
  }
  if (victoryDismissed) return;
  const { black, white } = g.countPieces();
  const sig = `${black}-${white}-${black > white ? 'b' : white > black ? 'w' : 'd'}`;
  if (victoryShownSig === sig) return;
  victoryShownSig = sig;
  showVictoryResult();
}

function syncStatus() {
  statusEl.textContent = formatStatus(view.game);
  syncTurnBanner();
  updateVictoryOverlay();
}

view = new OthelloCubeView(canvas, undefined, syncStatus);

document.querySelectorAll('.face-view-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const f = parseInt(btn.getAttribute('data-face') ?? '', 10);
    if (!Number.isNaN(f)) view.viewFace(f);
  });
});

btnReset.addEventListener('click', () => {
  view.game.reset();
  view.syncFromGame();
  victoryDismissed = false;
  victoryShownSig = null;
  hideVictory();
  syncStatus();
});

victoryClose.addEventListener('click', () => {
  victoryDismissed = true;
  hideVictory();
});

function onResize() {
  view.resize();
}

window.addEventListener('resize', onResize);
window.addEventListener('load', onResize);
requestAnimationFrame(onResize);
setTimeout(onResize, 300);
onResize();

if (typeof ResizeObserver !== 'undefined' && viewportFrame) {
  const ro = new ResizeObserver(() => {
    onResize();
  });
  ro.observe(viewportFrame);
}
syncStatus();

function loop() {
  view.tick();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
