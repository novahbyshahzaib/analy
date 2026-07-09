import { EngineResponse } from './stockfish';

/**
 * Move classification categories, matching chess.com's system.
 * 
 * How chess.com-style analysis works:
 * 1. Evaluate the position BEFORE the move (what's the best eval achievable?)
 * 2. Evaluate the position AFTER the move (what eval did we end up with?)
 * 3. Since both evals are normalized to WHITE's perspective, we can directly compare.
 * 4. For WHITE moves: loss = evalBefore - evalAfter (good white moves keep/increase eval)
 * 5. For BLACK moves: loss = evalAfter - evalBefore (good black moves decrease the eval, since lower = better for black)
 * 6. Classify based on centipawn loss.
 */
export type MoveCategory = 'Brilliant' | 'Great' | 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Book';

export type AnalysisResult = {
  category: MoveCategory;
  explanation: string;
  bestMove: string | null;
  evalBefore: number | null; // cp from white's perspective
  evalAfter: number | null;  // cp from white's perspective
  cpLoss: number;
};

/**
 * Convert an engine response to a single numeric value from WHITE's perspective
 * for comparison purposes. Mates are converted to large cp values.
 */
function evalToNumber(res: EngineResponse): number {
  if (res.mate !== null) {
    // Mate in N for white = very high positive value
    // Mate in -N (black wins) = very high negative value
    // Closer mates are more extreme
    if (res.mate > 0) return 100000 - res.mate * 100; // White winning
    if (res.mate < 0) return -100000 - res.mate * 100; // Black winning (mate value negative)
    return 0; // mate === 0 means checkmate already happened
  }
  if (res.evaluation !== null) return res.evaluation;
  return 0;
}

/**
 * Categorize a move by comparing the position evaluation before and after.
 * Both evaluations MUST be from WHITE's perspective (our StockfishEngine handles this).
 * 
 * @param evalBefore - Engine eval of position BEFORE the move was played
 * @param evalAfter  - Engine eval of position AFTER the move was played
 * @param wasWhiteMove - true if the move being analyzed was made by White
 * @param bestMoveBefore - the best move the engine suggested before the move was played
 * @param actualMove - the move that was actually played (in UCI notation like "e2e4")
 */
export function categorizeMove(
  evalBefore: EngineResponse,
  evalAfter: EngineResponse,
  wasWhiteMove: boolean,
  bestMoveBefore?: string | null,
  actualMove?: string | null,
): AnalysisResult {
  const before = evalToNumber(evalBefore);
  const after = evalToNumber(evalAfter);
  
  // Calculate centipawn loss FROM THE MOVING PLAYER'S PERSPECTIVE
  // For White: positive eval is good, so loss = before - after
  // For Black: negative eval is good, so loss = after - before
  const cpLoss = wasWhiteMove ? (before - after) : (after - before);
  
  const result: AnalysisResult = {
    category: 'Best',
    explanation: '',
    bestMove: bestMoveBefore ?? null,
    evalBefore: before,
    evalAfter: after,
    cpLoss: Math.max(0, cpLoss), // Don't report negative loss (move was better than expected)
  };

  // Check if the player found a forced mate that didn't exist before
  if (evalAfter.mate !== null && evalBefore.mate === null) {
    const foundMateForSelf = wasWhiteMove ? evalAfter.mate > 0 : evalAfter.mate < 0;
    if (foundMateForSelf) {
      result.category = 'Brilliant';
      result.explanation = `Found a forced checkmate in ${Math.abs(evalAfter.mate)}!`;
      return result;
    }
  }
  
  // Check if the player played the engine's top choice
  const playedBestMove = bestMoveBefore && actualMove && bestMoveBefore === actualMove;
  
  // Classify based on centipawn loss thresholds (chess.com style)
  if (cpLoss <= 0) {
    // Move was as good or better than expected (possibly engine's top choice or even better)
    if (playedBestMove) {
      result.category = 'Best';
      result.explanation = 'This was the engine\'s top choice.';
    } else {
      // Improved the position but played a different move than engine — could be brilliant
      // or just equally good
      result.category = 'Best';
      result.explanation = 'An equally strong alternative.';
    }
  } else if (cpLoss <= 10) {
    result.category = playedBestMove ? 'Best' : 'Excellent';
    result.explanation = playedBestMove 
      ? 'This was the engine\'s top choice.'
      : 'A very strong move, nearly the best.';
  } else if (cpLoss <= 25) {
    result.category = 'Good';
    result.explanation = 'A solid, playable move.';
  } else if (cpLoss <= 50) {
    result.category = 'Good';
    result.explanation = 'An acceptable move.';
  } else if (cpLoss <= 100) {
    result.category = 'Inaccuracy';
    result.explanation = `A slightly imprecise move. Lost ~${(cpLoss / 100).toFixed(1)} pawns of advantage.`;
  } else if (cpLoss <= 250) {
    result.category = 'Mistake';
    result.explanation = `A significant error. Lost ~${(cpLoss / 100).toFixed(1)} pawns of advantage.`;
  } else {
    result.category = 'Blunder';
    result.explanation = `A severe mistake. Lost ~${(cpLoss / 100).toFixed(1)} pawns of advantage.`;
  }
  
  // Special: if we went from not-mate to allowing mate against us
  if (evalBefore.mate === null && evalAfter.mate !== null) {
    const allowedMateAgainst = wasWhiteMove ? evalAfter.mate < 0 : evalAfter.mate > 0;
    if (allowedMateAgainst) {
      result.category = 'Blunder';
      result.explanation = `Allowed a forced mate in ${Math.abs(evalAfter.mate)}!`;
    }
  }
  
  // Special: if we had mate and lost it
  if (evalBefore.mate !== null && evalAfter.mate === null) {
    const hadMate = wasWhiteMove ? evalBefore.mate > 0 : evalBefore.mate < 0;
    if (hadMate && cpLoss > 100) {
      result.category = 'Blunder';
      result.explanation = 'Lost a forced checkmate sequence!';
    } else if (hadMate) {
      result.category = 'Mistake';
      result.explanation = 'Missed the fastest checkmate continuation.';
    }
  }
  
  return result;
}
