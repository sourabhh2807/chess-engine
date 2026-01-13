// =====================
// GLOBAL STATE
// =====================
const API_URL = "https://chess-engine-fkdy.onrender.com/move";
const boardDiv = document.getElementById("board");
const statusDiv = document.getElementById("status");

const game = new Chess();
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

let selectedSquare = null;
let gameMode = "offline"; // offline | ai
let lastMove = null; // { from, to }
let redoStack = [];
let selectedMoves = new Set();

const movesDiv = document.getElementById("moves");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");


if (undoBtn) undoBtn.addEventListener("click", () => handleUndo());
if (redoBtn) redoBtn.addEventListener("click", () => handleRedo());

const offlineBtnEl = document.getElementById("offlineBtn");
const aiEasyBtn = document.getElementById("aiEasyBtn");
const aiMediumBtn = document.getElementById("aiMediumBtn");
const aiHardBtn = document.getElementById("aiHardBtn");
if (offlineBtnEl) offlineBtnEl.addEventListener("click", startOffline);
if (aiEasyBtn) aiEasyBtn.addEventListener("click", () => startAI('easy'));
if (aiMediumBtn) aiMediumBtn.addEventListener("click", () => startAI('medium'));
if (aiHardBtn) aiHardBtn.addEventListener("click", () => startAI('hard'));

// modal event wiring moved to init (after functions defined)

// (online play removed)

// Zoom / pinch state
let boardScale = 1;
let pinchStartDist = null;
let pinchStartScale = 1;


// =====================
// GAME MODES
// =====================
function startOffline() {
  game.reset();
  selectedSquare = null;
  gameMode = "offline";
  statusDiv.textContent = "Offline mode: Play with friend";
  drawBoard();
}

// aiDepth: controls backend search depth (1..6+). Default medium.
let aiDepth = 3;

function startAI(level) {
  console.log("🔥 AI MODE CLICKED", level);
  // map level to depth
  if (level === 'easy') aiDepth = 1;
  else if (level === 'medium') aiDepth = 3;
  else if (level === 'hard') aiDepth = 5;
  else aiDepth = Number(level) || 3;

  game.reset();
  selectedSquare = null;
  gameMode = "ai";
  statusDiv.textContent = `AI mode: You vs Computer (${level || 'medium'})`;
  drawBoard();
}

// expose for buttons
window.startOffline = startOffline;
window.startAI = startAI;

// =====================
// DRAW BOARD
// =====================
function drawBoard() {
  boardDiv.innerHTML = "";

  const isInCheck = game.in_check();
  const checkColor = isInCheck ? game.turn() : null;

  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const square = files[file] + (rank + 1);
      const piece = game.get(square);

      const div = document.createElement("div");
      div.className = "square " + ((rank + file) % 2 ? "black" : "white");
      div.style.position = "relative";

      // ✅ Selected square highlight (ONLY this)
      if (square === selectedSquare) {
        div.style.outline = "1px solid black";
      }

      // Draw piece
      if (piece) {
  const symbols = {
    p: "♟",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚"
  };

  div.textContent = symbols[piece.type];
  div.style.color = piece.color === "w" ? "#fff" : "#000";

  // ✅ animate piece
  div.classList.add("piece-animate");
}

// (online play functionality removed)

      // Highlight last move source and destination
      if (lastMove) {
        if (square === lastMove.from) div.classList.add("last-move-from");
        if (square === lastMove.to) div.classList.add("last-move-to");
      }

      // Show move-dot for valid destinations of the selected piece
      if (selectedMoves && selectedMoves.has(square)) {
        div.classList.add('move-dot');
      }

      // Highlight king in check (red)
      if (
        piece &&
        piece.type === "k" &&
        checkColor &&
        piece.color === checkColor
      ) {
        div.classList.add("in-check");
      }


      div.onclick = () => onSquareClick(square);
      boardDiv.appendChild(div);
    }
  }

  // update move list UI after board draws
  updateMoveList();
}

// =====================
// CLICK HANDLING
// =====================
function onSquareClick(square) {
  const piece = game.get(square);

  // ⛔ Prevent player from moving Black in AI mode
  if (
    gameMode === "ai" &&
    !selectedSquare &&
    piece &&
    piece.color === "b"
  ) {
    return; // ignore click
  }

  // First click → select
  if (!selectedSquare) {
    // only allow selecting a square with a piece
    if (!piece) return;
    selectedSquare = square;
    // compute legal moves for this square
    const moves = game.moves({ square: selectedSquare, verbose: true }) || [];
    selectedMoves = new Set(moves.map(m => m.to));
    drawBoard();
    return;
  }

  // clicking the selected square again deselects
  if (selectedSquare === square) {
    selectedSquare = null;
    selectedMoves = new Set();
    drawBoard();
    return;
  }

  // Second click → try move
  // (no online turn enforcement)

  const move = game.move({
    from: selectedSquare,
    to: square,
    promotion: "q"
  });

  // Always clear selection
  selectedSquare = null;
  selectedMoves = new Set();

  // Invalid move
  if (!move) {
    drawBoard();
    return;
  }

  // ✅ Player move applied
  lastMove = move;
  drawBoard();

  // If player delivered checkmate, show popup
  if (game.in_checkmate()) {
    const winner = game.turn() === "w" ? "Black" : "White";
    showCheckmateModal(winner);
  }

  // Trigger AI ONLY if it's now Black's turn
  if (gameMode === "ai" && game.turn() === "b") {
    setTimeout(aiMove, 300);
  }
  // local moves only (offline / AI)
}



// =====================
// AI MOVE
// =====================
function aiMove() {
  console.log("🤖 AI MOVE CALLED");

  fetch("http://127.0.0.1:5000/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // send configured depth from UI
    body: JSON.stringify({ fen: game.fen(), depth: aiDepth })
  })
    .then(res => res.json())
    .then(data => {
      console.log("🤖 AI RESPONSE:", data);

      if (!data.move) return;

      // Backend returns UCI (e.g. "e7e5") — chess.js expects SAN string or
      // an object like { from, to, promotion } for exact moves. Parse UCI
      // into a move object so the move is applied and rendered.
      const aiMoveStr = data.move;
      let moveObj = aiMoveStr;
      const uciRegex = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

      if (typeof aiMoveStr === "string" && uciRegex.test(aiMoveStr)) {
        moveObj = {
          from: aiMoveStr.slice(0, 2),
          to: aiMoveStr.slice(2, 4)
        };

        if (aiMoveStr.length === 5) {
          moveObj.promotion = aiMoveStr[4];
        }
      }

      const move = game.move(moveObj);
      if (move) {
        lastMove = move;
        drawBoard();
        // If AI delivered checkmate, show popup
        if (game.in_checkmate()) {
          const winner = game.turn() === "w" ? "Black" : "White";
          showCheckmateModal(winner);
        }
        // clear redo stack when a new move is made
        redoStack = [];
        // clear selected moves after AI move
        selectedMoves = new Set();
      }
    })
    .catch(err => {
      console.error("AI ERROR:", err);
    });
}

// socket-based online play removed

// =====================
// PINCH / ZOOM HANDLERS
// =====================
function getTouchDist(t1, t2) {
  const dx = t2.clientX - t1.clientX;
  const dy = t2.clientY - t1.clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

boardDiv.style.transformOrigin = 'center center';
boardDiv.style.transition = 'transform 80ms linear';

boardDiv.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
    pinchStartScale = boardScale;
  }
});

boardDiv.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && pinchStartDist) {
    e.preventDefault();
    const d = getTouchDist(e.touches[0], e.touches[1]);
    let next = pinchStartScale * (d / pinchStartDist);
    next = Math.max(0.6, Math.min(1.6, next));
    boardScale = next;
    boardDiv.style.transform = `scale(${boardScale})`;
  }
}, { passive: false });

boardDiv.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) pinchStartDist = null;
});

// wheel zoom with ctrl/meta
window.addEventListener('wheel', (e)=>{
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const delta = -e.deltaY * 0.0012;
    let next = boardScale + delta;
    next = Math.max(0.6, Math.min(1.6, next));
    boardScale = next;
    boardDiv.style.transform = `scale(${boardScale})`;
  }
}, { passive: false });

// =====================
// MOVE LIST / UNDO / REDO
// =====================
function updateMoveList() {
  if (!movesDiv) return;

  const history = game.history({ verbose: true });
  movesDiv.innerHTML = "";

  for (let i = 0; i < history.length; i += 2) {
    const moveNumber = (i / 2) + 1;
    const white = history[i];
    const black = history[i + 1];

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.alignItems = "center";

    const num = document.createElement("div");
    num.style.width = "28px";
    num.style.color = "#9fb6d9";
    num.textContent = moveNumber + ".";

    const whiteSpan = document.createElement("div");
    whiteSpan.style.flex = "1";
    whiteSpan.textContent = white ? white.san : "";

    const blackSpan = document.createElement("div");
    blackSpan.style.flex = "1";
    blackSpan.textContent = black ? black.san : "";

    row.appendChild(num);
    row.appendChild(whiteSpan);
    row.appendChild(blackSpan);

    movesDiv.appendChild(row);
  }

  // buttons enabled state
  undoBtn.disabled = game.history().length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function handleUndo() {
  // close any modal
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();

  const mv = game.undo();
  if (!mv) return;

  // push undone move onto redo stack (store SAN)
  redoStack.push(mv.san || mv);

  // if last move was black (AI) and there is a previous white move, leave as single undo.
  lastMove = null;
  drawBoard();
}

function handleRedo() {
  if (redoStack.length === 0) return;
  const san = redoStack.pop();
  // apply SAN move
  const mv = game.move(san);
  if (mv) {
    lastMove = mv;
    drawBoard();
  }
}


// =====================
// INIT
// =====================
statusDiv.textContent = "Choose a game mode";
drawBoard();


// =====================
// CHECKMATE MODAL
// =====================
function showCheckmateModal(winner) {
  // create overlay
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const card = document.createElement("div");
  card.className = "modal-card";

  const h2 = document.createElement("h2");
  h2.textContent = "Checkmate";
  const p = document.createElement("p");
  p.textContent = `${winner} wins! Congratulations.`;

  const playAgain = document.createElement("button");
  playAgain.textContent = "Play again (AI)";
  playAgain.onclick = () => {
    document.body.removeChild(overlay);
    startAI();
  };

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.className = "secondary";
  closeBtn.onclick = () => {
    document.body.removeChild(overlay);
    // keep board as-is but clear selection
    selectedSquare = null;
    drawBoard();
  };

  card.appendChild(h2);
  card.appendChild(p);
  card.appendChild(playAgain);
  card.appendChild(closeBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

