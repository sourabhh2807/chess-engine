import chess
import time

# Piece values for evaluation (centipawns)
PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000,
}


def evaluate(board):
    """Simple evaluation: material balance + small mobility bonus."""
    score = 0
    for piece, value in PIECE_VALUES.items():
        score += len(board.pieces(piece, chess.WHITE)) * value
        score -= len(board.pieces(piece, chess.BLACK)) * value

    # mobility bonus (legal moves count)
    try:
        score += 2 * len(list(board.legal_moves)) if board.turn == chess.WHITE else -2 * len(list(board.legal_moves))
    except Exception:
        pass

    return score


def negamax(board, depth, alpha, beta, color, time_start=None, max_time=None):
    # time check
    if time_start and max_time and (time.time() - time_start) > max_time:
        raise TimeoutError()

    if depth == 0 or board.is_game_over():
        return color * evaluate(board)

    max_score = -999999

    # move ordering: try captures and promotions first
    moves = list(board.legal_moves)
    def move_key(m):
        score = 0
        # capture value (higher first)
        if board.is_capture(m):
            captured = board.piece_at(m.to_square)
            if captured:
                score += PIECE_VALUES.get(captured.piece_type, 0)
        # promotion bonus
        if m.promotion:
            score += 800
        return -score

    moves.sort(key=move_key)

    for move in moves:
        board.push(move)
        try:
            score = -negamax(board, depth - 1, -beta, -alpha, -color, time_start, max_time)
        except TimeoutError:
            board.pop()
            raise
        board.pop()

        if score > max_score:
            max_score = score

        alpha = max(alpha, score)
        if alpha >= beta:
            break

    return max_score


def get_best_move(fen, depth=3, max_time=1.5):
    """Return best move UCI for given FEN using iterative deepening negamax + alpha-beta.

    To avoid very long response times at high depths, this function performs
    iterative deepening up to `depth` but will stop early if `max_time` seconds
    have elapsed and return the best move found so far.
    """
    board = chess.Board(fen)

    time_start = time.time()
    best_move = None
    best_score = -999999
    color = 1 if board.turn == chess.WHITE else -1

    # iterative deepening
    try:
        for d in range(1, depth + 1):
            # if we've run out of time, break
            if (time.time() - time_start) > max_time:
                break

            current_best = None
            current_best_score = -999999

            # order root moves as well
            root_moves = list(board.legal_moves)
            def root_key(m):
                s = 0
                if board.is_capture(m):
                    captured = board.piece_at(m.to_square)
                    if captured:
                        s += PIECE_VALUES.get(captured.piece_type, 0)
                if m.promotion:
                    s += 800
                return -s

            root_moves.sort(key=root_key)

            for move in root_moves:
                board.push(move)
                try:
                    score = -negamax(board, d - 1, -999999, 999999, -color, time_start, max_time)
                except TimeoutError:
                    board.pop()
                    raise
                board.pop()

                if current_best is None or score > current_best_score:
                    current_best = move
                    current_best_score = score

            # adopt current_best as best_move found so far
            if current_best is not None:
                best_move = current_best
                best_score = current_best_score

    except TimeoutError:
        # time ran out — return best found so far
        pass

    return best_move.uci() if best_move else None
