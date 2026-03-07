const BOARD_SIZE = 7;
const AI_THINK_DELAY_MS = 900;
const AI_INTENT_DELAY_MS = 3000;

/* ── Piece shapes ── */
const SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  L: [[0, 0], [0, 1], [0, 2], [1, 2]],
  J: [[1, 0], [1, 1], [1, 2], [0, 2]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};

const CARD_DISTRIBUTION = { I: 6, O: 8, T: 8, L: 8, J: 8, S: 8, Z: 8 };

/* ── AI Personality system ──
   Each difficulty has 3 personalities assigned randomly at game start.
   They change evaluation weights so every game feels different even at
   the same difficulty setting.
*/
const PERSONALITIES = {
  easy:     ['scatter',    'clustered',  'edge'],
  standard: ['balanced',   'aggressive', 'territorial'],
  expert:   ['optimizer',  'blocker',    'expansionist'],
};

const PERSONALITY_NAMES = {
  scatter:     'Wanderer',
  clustered:   'Gravitator',
  edge:        'Edger',
  balanced:    'Tactician',
  aggressive:  'Scorer',
  territorial: 'Builder',
  optimizer:   'Optimizer',
  blocker:     'Defender',
  expansionist:'Expander',
};

/* ── Game state ── */
const state = {
  board: [],
  deck: [],
  turn: 'player',
  phase2: false,
  score: { player: 0, ai: 0 },
  difficulty: 'standard',
  personality: null,
  card: null,
  rotation: 0,
  cursor: { x: 1, y: 1 },
  aiIntent: null,
  gameOver: false,
  playerPreviewActive: false,
};

/* ── DOM references ── */
const boardEl      = document.getElementById('board');
const startBtn     = document.getElementById('start-btn');
const restartBtn   = document.getElementById('restart-btn');
const rotateBtn    = document.getElementById('rotate-btn');
const placeBtn     = document.getElementById('place-btn');
const difficultyEl = document.getElementById('difficulty');
const aiBannerEl   = document.getElementById('ai-banner');
const gameEl       = document.getElementById('game');
const heroEl       = document.getElementById('hero');

/* ── Board helpers ── */
function initBoard() {
  state.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function buildDeck() {
  const cards = [];
  Object.entries(CARD_DISTRIBUTION).forEach(([shape, count]) => {
    for (let i = 0; i < count; i++) cards.push(shape);
  });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function rotatePoint([x, y], rot) {
  if (rot === 0) return [x, y];
  if (rot === 1) return [y, -x];
  if (rot === 2) return [-x, -y];
  return [-y, x];
}

function getRotatedCells(shape, rotation) {
  const cells = SHAPES[shape].map((pt) => rotatePoint(pt, rotation));
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

function getPlacedCells(shape, rotation, originX, originY) {
  return getRotatedCells(shape, rotation).map(([dx, dy]) => [originX + dx, originY + dy]);
}

function checkMove(cells, player, phase2) {
  let oppOverlaps = 0;
  const opponent = player === 'player' ? 'ai' : 'player';

  for (const [x, y] of cells) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return { legal: false };
    const slot = state.board[y][x];
    if (!phase2 && slot !== null) return { legal: false };
    if (phase2 && slot === opponent && ++oppOverlaps > 3) return { legal: false };
  }

  return { legal: true };
}

function legalMoves(shape, player, phase2) {
  const moves = [];
  for (let rot = 0; rot < 4; rot++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const cells = getPlacedCells(shape, rot, x, y);
        if (checkMove(cells, player, phase2).legal) moves.push({ x, y, rot, cells });
      }
    }
  }
  return moves;
}

function maybeUnlockPhase2(player) {
  if (!state.phase2 && state.card && legalMoves(state.card, player, false).length === 0) state.phase2 = true;
}

function applyMove(move, player) {
  const opponent = player === 'player' ? 'ai' : 'player';
  for (const [x, y] of move.cells) {
    const slot = state.board[y][x];
    if (slot === null) state.board[y][x] = player;
    else if (slot === player) state.board[y][x] = opponent;
    else state.board[y][x] = player;
  }

  const clearRows = [];
  const clearCols = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    const owner = state.board[y][0];
    if (owner && state.board[y].every((v) => v === owner)) {
      clearRows.push({ index: y, owner });
      state.score[owner] += 1;
    }
  }

  for (let x = 0; x < BOARD_SIZE; x++) {
    const owner = state.board[0][x];
    if (!owner) continue;
    let full = true;
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (state.board[y][x] !== owner) { full = false; break; }
    }
    if (full) {
      clearCols.push({ index: x, owner });
      state.score[owner] += 1;
    }
  }

  for (const { index } of clearRows) {
    for (let x = 0; x < BOARD_SIZE; x++) state.board[index][x] = null;
  }
  for (const { index } of clearCols) {
    for (let y = 0; y < BOARD_SIZE; y++) state.board[y][index] = null;
  }
}

function countPieces(player) {
  return state.board.flat().filter((v) => v === player).length;
}

/* Count lines (rows or cols) where `player` occupies all but ≤1 cells.
   Used by the 'blocker' personality to penalise moves that leave the
   opponent close to scoring. Called while the board has a move applied. */
function countNearCompleteLines(player) {
  let count = 0;
  for (let y = 0; y < BOARD_SIZE; y++) {
    if (state.board[y].filter((v) => v === player).length >= BOARD_SIZE - 1) count++;
  }
  for (let x = 0; x < BOARD_SIZE; x++) {
    let n = 0;
    for (let y = 0; y < BOARD_SIZE; y++) if (state.board[y][x] === player) n++;
    if (n >= BOARD_SIZE - 1) count++;
  }
  return count;
}

/* ── AI evaluation ──
   Each personality has different weights so the AI genuinely plays
   a different style every game, not just different levels of randomness.

   Easy personalities  – mostly random, small strategic flavour
   Standard            – strategic weights + a little noise, occasionally picks 2nd best
   Expert              – pure weights, no noise, rarely picks 2nd/3rd best
*/
function evaluateMove(move, player, difficulty, personality) {
  const opponent = player === 'player' ? 'ai' : 'player';
  const snapshot  = state.board.map((row) => [...row]);
  const scoreBefore = { ...state.score };

  applyMove(move, player);
  const gainedSelf = state.score[player]   - scoreBefore[player];
  const gainedOpp  = state.score[opponent] - scoreBefore[opponent];
  const pieceAdv   = countPieces(player) - countPieces(opponent);

  // Blocker: how many opponent lines are near-complete after this move?
  const opponentThreats = (personality === 'blocker') ? countNearCompleteLines(opponent) : 0;

  state.board = snapshot;
  state.score = scoreBefore;

  /* ── Easy personalities: mostly random, spatial flavour only ── */
  if (difficulty === 'easy') {
    const center = (BOARD_SIZE - 1) / 2;

    if (personality === 'clustered') {
      // Prefers moves near the centre of the board
      const proximity = move.cells.reduce(
        (s, [x, y]) => s + (7 - Math.abs(x - center) - Math.abs(y - center)),
        0
      ) / move.cells.length;
      return Math.random() * 8 + proximity * 0.5;
    }

    if (personality === 'edge') {
      // Prefers moves close to board edges
      const edginess = move.cells.reduce(
        (s, [x, y]) => s + Math.min(x, BOARD_SIZE - 1 - x, y, BOARD_SIZE - 1 - y),
        0
      ) / move.cells.length;
      return Math.random() * 8 + (3 - edginess); // lower edginess = closer to edge = better
    }

    // 'scatter': pure random
    return Math.random() * 10;
  }

  /* ── Standard / Expert: strategic evaluation ── */

  // Never give the opponent points unless you win now or they'd win anyway
  let strategicPenalty = 0;
  const winsNow       = scoreBefore[player]   + gainedSelf >= 5;
  const opponentWouldWin = scoreBefore[opponent] + gainedOpp  >= 5;
  if (gainedOpp > 0 && !winsNow && !opponentWouldWin) {
    strategicPenalty = gainedOpp * 20;
  }

  // Expert has zero noise (near-optimal); standard gets a small random nudge
  const noise = difficulty === 'expert' ? 0 : Math.random() * 5;

  if (personality === 'aggressive') {
    // Scores lines at all costs, ignores territory
    return gainedSelf * 15 + pieceAdv * 0.3 + noise - strategicPenalty;
  }

  if (personality === 'territorial') {
    // Maximises cells on the board; scoring is secondary
    return gainedSelf * 6 + pieceAdv * 3 + noise - strategicPenalty;
  }

  if (personality === 'optimizer') {
    // Expert: balanced high-weight scorer
    return gainedSelf * 15 + pieceAdv * 2 - strategicPenalty;
  }

  if (personality === 'blocker') {
    // Expert: punishes positions that leave opponent close to completing lines
    return gainedSelf * 12 + pieceAdv * 2 - opponentThreats * 5 - strategicPenalty;
  }

  if (personality === 'expansionist') {
    // Expert: dominates the board, scores when opportunities arise
    return gainedSelf * 8 + pieceAdv * 4 - strategicPenalty;
  }

  // 'balanced' (standard default)
  return gainedSelf * 10 + pieceAdv + noise - strategicPenalty;
}

/* ── Turn management ── */
function drawCardForTurn() {
  if (state.deck.length === 0) {
    finishGame();
    return false;
  }
  state.card = state.deck.pop();
  state.rotation = 0;
  state.cursor = { x: 1, y: 1 };
  state.playerPreviewActive = false;
  maybeUnlockPhase2(state.turn);
  return true;
}

function currentPlayerMove() {
  return {
    x: state.cursor.x,
    y: state.cursor.y,
    rot: state.rotation,
    cells: getPlacedCells(state.card, state.rotation, state.cursor.x, state.cursor.y),
  };
}

function tryPlacePlayerMove() {
  if (state.turn !== 'player' || state.gameOver || !state.card) return;
  const move = currentPlayerMove();
  if (!checkMove(move.cells, 'player', state.phase2).legal) return;
  applyMove(move, 'player');
  endTurn();
}

function setAIThinking(isThinking) {
  aiBannerEl.classList.toggle('hidden', !isThinking);
}

/* ── AI turn ──
   Move selection by difficulty:
   · Easy    — random pick from the top 5 scored moves
   · Standard — picks best move 80 % of the time, 2nd best 20 %
   · Expert   — picks best 80 %, 2nd best 15 %, 3rd best 5 %
   The evaluation weights already differ by personality, so the
   occasional sub-optimal pick is genuinely unpredictable.
*/
function doAITurn() {
  if (state.gameOver) return;

  let moves = legalMoves(state.card, 'ai', state.phase2);
  if (!state.phase2 && moves.length === 0) {
    state.phase2 = true;
    moves = legalMoves(state.card, 'ai', true);
  }

  if (moves.length === 0) {
    setAIThinking(false);
    state.aiIntent = null;
    endTurn();
    return;
  }

  const scored = moves.map((m) => ({
    move: m,
    score: evaluateMove(m, 'ai', state.difficulty, state.personality),
  }));
  scored.sort((a, b) => b.score - a.score);

  let pick;
  if (state.difficulty === 'easy') {
    // Random from top 5
    pick = scored[Math.floor(Math.random() * Math.min(5, scored.length))];
  } else if (state.difficulty === 'standard') {
    // Mostly optimal, occasionally chooses 2nd best
    const r = Math.random();
    pick = (r < 0.80 || scored.length <= 1) ? scored[0] : scored[1];
  } else {
    // Expert: near-optimal with very rare sub-optimal choices
    const r = Math.random();
    if      (r < 0.80 || scored.length <= 1) pick = scored[0];
    else if (r < 0.95 || scored.length <= 2) pick = scored[1];
    else                                      pick = scored[2];
  }

  state.aiIntent = pick.move;
  aiBannerEl.textContent = 'Opponent will place here...';
  render();

  setTimeout(() => {
    if (state.gameOver) return;
    applyMove(pick.move, 'ai');
    state.aiIntent = null;
    setAIThinking(false);
    endTurn();
  }, AI_INTENT_DELAY_MS);
}

function endTurn() {
  if (state.score.player >= 5 || state.score.ai >= 5) {
    finishGame();
    return;
  }

  state.turn = state.turn === 'player' ? 'ai' : 'player';
  if (!drawCardForTurn()) return;
  render();

  if (state.turn === 'ai') {
    setAIThinking(true);
    aiBannerEl.textContent = 'Opponent is choosing a move...';
    setTimeout(doAITurn, AI_THINK_DELAY_MS);
  }
}

function finishGame() {
  state.gameOver = true;
  setAIThinking(false);
  state.aiIntent = null;
  heroEl.classList.remove('hidden');
  document.body.classList.remove('phase2-mode');
  document.getElementById('player-score').textContent = state.score.player;
  document.getElementById('ai-score').textContent = state.score.ai;
  const result       = document.getElementById('result');
  const resultWinner = document.getElementById('result-winner');
  const resultText   = document.getElementById('result-text');

  let outcome = '';
  let winnerLabel = '';
  const reachedFive = state.score.player >= 5 || state.score.ai >= 5;

  if (reachedFive && state.score.player !== state.score.ai) {
    if (state.score.player > state.score.ai) {
      winnerLabel = 'Winner: You';
      outcome = 'Reason: first player to 5 points.';
    } else {
      winnerLabel = 'Winner: Digital Opponent';
      outcome = 'Reason: first player to 5 points.';
    }
  } else if (state.score.player !== state.score.ai) {
    if (state.score.player > state.score.ai) {
      winnerLabel = 'Winner: You';
      outcome = 'Reason: deck ended and you had the higher score.';
    } else {
      winnerLabel = 'Winner: Digital Opponent';
      outcome = 'Reason: deck ended and opponent had the higher score.';
    }
  } else {
    const p = countPieces('player');
    const a = countPieces('ai');
    if (p === a) {
      winnerLabel = 'Result: Tie';
      outcome = 'Reason: score tied and both players had the same number of pieces on board.';
    } else if (p > a) {
      winnerLabel = 'Winner: You';
      outcome = 'Reason: score tied, winner had the most pieces on the board.';
    } else {
      winnerLabel = 'Winner: Digital Opponent';
      outcome = 'Reason: score tied, winner had the most pieces on the board.';
    }
  }

  resultWinner.textContent = winnerLabel;
  resultText.textContent   = `Final score ${state.score.player}–${state.score.ai}. ${outcome}`;
  result.classList.remove('hidden');
}

/* ── Rendering ── */
function updatePreview() {
  const preview = document.getElementById('card-preview');
  preview.innerHTML = '';
  const fillSet = new Set(getRotatedCells(state.card, state.rotation).map(([x, y]) => `${x},${y}`));

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const div = document.createElement('div');
      if (fillSet.has(`${x},${y}`)) div.classList.add('filled');
      preview.appendChild(div);
    }
  }
}

function moveCursor(dx, dy) {
  state.cursor.x = Math.max(0, Math.min(BOARD_SIZE - 1, state.cursor.x + dx));
  state.cursor.y = Math.max(0, Math.min(BOARD_SIZE - 1, state.cursor.y + dy));
  renderBoard();
}

function getProjectedOwner(cellOwner, player) {
  const opponent = player === 'player' ? 'ai' : 'player';
  if (cellOwner === null)    return player;
  if (cellOwner === player)  return opponent;
  return player;
}

function renderBoard() {
  boardEl.innerHTML = '';

  const playerOverlay = state.turn === 'player' && state.card && state.playerPreviewActive
    ? getPlacedCells(state.card, state.rotation, state.cursor.x, state.cursor.y)
    : null;
  const playerOverlaySet      = playerOverlay ? new Set(playerOverlay.map(([x, y]) => `${x},${y}`)) : null;
  const playerOverlayLegality = playerOverlay ? checkMove(playerOverlay, 'player', state.phase2) : { legal: false };
  const aiIntentSet           = state.aiIntent ? new Set(state.aiIntent.cells.map(([x, y]) => `${x},${y}`)) : null;

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);

      const owner = state.board[y][x];
      if (owner) cell.classList.add(owner);

      const key = `${x},${y}`;

      if (aiIntentSet && aiIntentSet.has(key)) {
        cell.classList.add('ai-intent');
        const projected = getProjectedOwner(owner, 'ai');
        cell.classList.add(projected === 'ai' ? 'ghost-ai' : 'ghost-player');
      }

      if (playerOverlaySet && playerOverlaySet.has(key)) {
        const projected = getProjectedOwner(owner, 'player');
        cell.classList.add(projected === 'player' ? 'ghost-player' : 'ghost-ai');
        cell.classList.add(playerOverlayLegality.legal ? 'ghost-legal' : 'ghost-illegal');
      }

      boardEl.appendChild(cell);
    }
  }
}

function render() {
  if (state.gameOver) return;
  document.getElementById('turn-label').textContent  = state.turn === 'player' ? 'Player' : 'Digital Opponent';
  document.getElementById('phase-label').textContent = state.phase2 ? 'Phase 2 (Overlap)' : 'Phase 1';
  gameEl.classList.toggle('phase2', state.phase2);
  document.body.classList.toggle('phase2-mode', state.phase2);
  document.getElementById('cards-left').textContent  = state.deck.length;
  document.getElementById('player-score').textContent = state.score.player;
  document.getElementById('ai-score').textContent     = state.score.ai;

  // Show the AI's assigned personality name inside the opponent pill
  const aiPillSpan = document.querySelector('.ai-pill > span');
  if (aiPillSpan && state.personality) {
    const name = PERSONALITY_NAMES[state.personality] ?? '';
    aiPillSpan.innerHTML = `Opponent<span class="ai-pill-personality">${name}</span>`;
  }

  const playerTurn = state.turn === 'player';
  rotateBtn.disabled = !playerTurn;
  placeBtn.disabled  = !playerTurn;

  if (state.card) updatePreview();
  renderBoard();
}

/* ── Game lifecycle ── */
function startGame() {
  state.difficulty = difficultyEl.value;

  // Assign a random personality from the pool for this difficulty
  const pool = PERSONALITIES[state.difficulty];
  state.personality = pool[Math.floor(Math.random() * pool.length)];

  state.deck    = buildDeck();
  state.turn    = 'player';
  state.phase2  = false;
  state.score   = { player: 0, ai: 0 };
  state.card    = null;
  state.rotation = 0;
  state.cursor  = { x: 1, y: 1 };
  state.gameOver = false;
  state.aiIntent = null;

  initBoard();
  document.getElementById('setup').classList.add('hidden');
  document.getElementById('result').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  heroEl.classList.add('hidden');

  drawCardForTurn();
  setAIThinking(false);
  aiBannerEl.textContent = 'Opponent is planning move…';
  render();
}

/* ── Event listeners ── */
startBtn.addEventListener('click', startGame);

restartBtn.addEventListener('click', () => {
  document.getElementById('setup').classList.remove('hidden');
  document.getElementById('result').classList.add('hidden');
  heroEl.classList.remove('hidden');
  document.body.classList.remove('phase2-mode');
  document.getElementById('player-score').textContent = state.score.player;
  document.getElementById('ai-score').textContent     = state.score.ai;
  setAIThinking(false);
});

rotateBtn.addEventListener('click', () => {
  if (state.turn !== 'player') return;
  state.rotation = (state.rotation + 1) % 4;
  render();
});

placeBtn.addEventListener('click', tryPlacePlayerMove);

boardEl.addEventListener('pointermove', (event) => {
  if (event.pointerType && event.pointerType !== 'mouse') return;
  const target = event.target.closest('.cell');
  if (!target || state.turn !== 'player' || state.gameOver) return;
  const x = Number(target.dataset.x);
  const y = Number(target.dataset.y);
  if (Number.isNaN(x) || Number.isNaN(y)) return;
  if (x === state.cursor.x && y === state.cursor.y) return;
  state.cursor = { x, y };
  state.playerPreviewActive = true;
  renderBoard();
});

boardEl.addEventListener('click', (event) => {
  const target = event.target.closest('.cell');
  if (!target || state.turn !== 'player' || state.gameOver) return;
  const x = Number(target.dataset.x);
  const y = Number(target.dataset.y);
  if (Number.isNaN(x) || Number.isNaN(y)) return;
  state.cursor = { x, y };
  state.playerPreviewActive = true;
  tryPlacePlayerMove();
});

boardEl.addEventListener('contextmenu', (event) => {
  const target = event.target.closest('.cell');
  if (!target) return;
  event.preventDefault();
  if (state.turn !== 'player' || state.gameOver) return;
  const x = Number(target.dataset.x);
  const y = Number(target.dataset.y);
  if (Number.isNaN(x) || Number.isNaN(y)) return;
  state.cursor = { x, y };
  state.playerPreviewActive = true;
  state.rotation = (state.rotation + 1) % 4;
  render();
});

document.getElementById('move-up').addEventListener('click',    () => { if (state.turn !== 'player') return; state.playerPreviewActive = true; moveCursor(0, -1); });
document.getElementById('move-down').addEventListener('click',  () => { if (state.turn !== 'player') return; state.playerPreviewActive = true; moveCursor(0, 1); });
document.getElementById('move-left').addEventListener('click',  () => { if (state.turn !== 'player') return; state.playerPreviewActive = true; moveCursor(-1, 0); });
document.getElementById('move-right').addEventListener('click', () => { if (state.turn !== 'player') return; state.playerPreviewActive = true; moveCursor(1, 0); });

/* ── Boot ── */
initBoard();
renderBoard();
