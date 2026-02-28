const BOARD_SIZE = 7;
const AI_THINK_DELAY_MS = 650;
const AI_APPLY_DELAY_MS = 750;

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

const state = {
  board: [],
  deck: [],
  turn: 'player',
  phase2: false,
  score: { player: 0, ai: 0 },
  difficulty: 'standard',
  card: null,
  rotation: 0,
  cursor: { x: 1, y: 1 },
  aiIntent: null,
  gameOver: false,
};

const boardEl = document.getElementById('board');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const rotateBtn = document.getElementById('rotate-btn');
const placeBtn = document.getElementById('place-btn');
const difficultyEl = document.getElementById('difficulty');
const aiBannerEl = document.getElementById('ai-banner');

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
    if (state.board[y].every((v) => v === player)) clearRows.push(y);
  }

  for (let x = 0; x < BOARD_SIZE; x++) {
    let full = true;
    for (let y = 0; y < BOARD_SIZE; y++) if (state.board[y][x] !== player) full = false;
    if (full) clearCols.push(x);
  }

  state.score[player] += clearRows.length + clearCols.length;
  for (const y of clearRows) for (let x = 0; x < BOARD_SIZE; x++) state.board[y][x] = null;
  for (const x of clearCols) for (let y = 0; y < BOARD_SIZE; y++) state.board[y][x] = null;
}

function countPieces(player) {
  return state.board.flat().filter((value) => value === player).length;
}

function evaluateMove(move, player, difficulty) {
  const opponent = player === 'player' ? 'ai' : 'player';
  const snapshot = state.board.map((row) => [...row]);
  const scoreBefore = { ...state.score };

  applyMove(move, player);
  const gained = state.score[player] - scoreBefore[player];
  const pieceAdv = countPieces(player) - countPieces(opponent);

  state.board = snapshot;
  state.score = scoreBefore;

  if (difficulty === 'easy') return Math.random() * 10;
  if (difficulty === 'standard') return gained * 10 + pieceAdv + Math.random() * 4;
  return gained * 15 + pieceAdv * 2;
}

function drawCardForTurn() {
  if (state.deck.length === 0) {
    finishGame();
    return false;
  }

  state.card = state.deck.pop();
  state.rotation = 0;
  state.cursor = { x: 1, y: 1 };
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

  const scored = moves.map((m) => ({ move: m, score: evaluateMove(m, 'ai', state.difficulty) }));
  scored.sort((a, b) => b.score - a.score);
  const pick = state.difficulty === 'easy'
    ? scored[Math.floor(Math.random() * Math.min(5, scored.length))]
    : scored[0];

  state.aiIntent = pick.move;
  render();

  setTimeout(() => {
    if (state.gameOver) return;
    applyMove(pick.move, 'ai');
    state.aiIntent = null;
    setAIThinking(false);
    endTurn();
  }, AI_APPLY_DELAY_MS);
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
    setTimeout(doAITurn, AI_THINK_DELAY_MS);
  }
}

function finishGame() {
  state.gameOver = true;
  setAIThinking(false);
  state.aiIntent = null;
  document.getElementById('game').classList.add('hidden');
  const result = document.getElementById('result');
  const resultText = document.getElementById('result-text');

  let outcome = '';
  if (state.score.player !== state.score.ai) {
    outcome = state.score.player > state.score.ai ? 'You win by score.' : 'Digital opponent wins by score.';
  } else {
    const p = countPieces('player');
    const a = countPieces('ai');
    if (p === a) outcome = 'It is a tie (same score and same pieces on board).';
    else outcome = p > a ? 'You win on tie-break (more pieces on board).' : 'Digital opponent wins on tie-break (more pieces on board).';
  }

  resultText.textContent = `Final score ${state.score.player} - ${state.score.ai}. ${outcome}`;
  result.classList.remove('hidden');
}

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
  if (cellOwner === null) return player;
  if (cellOwner === player) return opponent;
  return player;
}

function renderBoard() {
  boardEl.innerHTML = '';

  const playerOverlay = state.turn === 'player' && state.card
    ? getPlacedCells(state.card, state.rotation, state.cursor.x, state.cursor.y)
    : null;
  const playerOverlaySet = playerOverlay ? new Set(playerOverlay.map(([x, y]) => `${x},${y}`)) : null;
  const playerOverlayLegality = playerOverlay ? checkMove(playerOverlay, 'player', state.phase2) : { legal: false };
  const aiIntentSet = state.aiIntent ? new Set(state.aiIntent.cells.map(([x, y]) => `${x},${y}`)) : null;

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
  document.getElementById('turn-label').textContent = state.turn === 'player' ? 'Player' : 'Digital Opponent';
  document.getElementById('phase-label').textContent = state.phase2 ? 'Phase 2 (Overlap Enabled)' : 'Phase 1 (No Overlap)';
  document.getElementById('cards-left').textContent = state.deck.length;
  document.getElementById('player-score').textContent = state.score.player;
  document.getElementById('ai-score').textContent = state.score.ai;

  const playerTurn = state.turn === 'player';
  rotateBtn.disabled = !playerTurn;
  placeBtn.disabled = !playerTurn;

  if (state.card) updatePreview();
  renderBoard();
}

function startGame() {
  state.difficulty = difficultyEl.value;
  state.deck = buildDeck();
  state.turn = 'player';
  state.phase2 = false;
  state.score = { player: 0, ai: 0 };
  state.card = null;
  state.rotation = 0;
  state.cursor = { x: 1, y: 1 };
  state.gameOver = false;
  state.aiIntent = null;

  initBoard();
  document.getElementById('setup').classList.add('hidden');
  document.getElementById('result').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');

  drawCardForTurn();
  setAIThinking(false);
  render();
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
  document.getElementById('setup').classList.remove('hidden');
  document.getElementById('result').classList.add('hidden');
  document.getElementById('game').classList.add('hidden');
  setAIThinking(false);
});

rotateBtn.addEventListener('click', () => {
  if (state.turn !== 'player') return;
  state.rotation = (state.rotation + 1) % 4;
  render();
});

placeBtn.addEventListener('click', tryPlacePlayerMove);

boardEl.addEventListener('pointermove', (event) => {
  const target = event.target.closest('.cell');
  if (!target || state.turn !== 'player' || state.gameOver) return;
  const x = Number(target.dataset.x);
  const y = Number(target.dataset.y);
  if (Number.isNaN(x) || Number.isNaN(y)) return;
  if (x === state.cursor.x && y === state.cursor.y) return;
  state.cursor = { x, y };
  renderBoard();
});

boardEl.addEventListener('click', (event) => {
  const target = event.target.closest('.cell');
  if (!target || state.turn !== 'player' || state.gameOver) return;
  const x = Number(target.dataset.x);
  const y = Number(target.dataset.y);
  if (Number.isNaN(x) || Number.isNaN(y)) return;
  state.cursor = { x, y };
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
  state.rotation = (state.rotation + 1) % 4;
  render();
});

document.getElementById('move-up').addEventListener('click', () => state.turn === 'player' && moveCursor(0, -1));
document.getElementById('move-down').addEventListener('click', () => state.turn === 'player' && moveCursor(0, 1));
document.getElementById('move-left').addEventListener('click', () => state.turn === 'player' && moveCursor(-1, 0));
document.getElementById('move-right').addEventListener('click', () => state.turn === 'player' && moveCursor(1, 0));

initBoard();
renderBoard();
