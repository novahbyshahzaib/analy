import { EngineResponse } from './stockfish';

export type MoveCategory = 'Brilliant' | 'Great' | 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Book';

export function categorizeMove(
  prevEval: EngineResponse, 
  currEval: EngineResponse, 
  isWhiteTurn: boolean
): { category: MoveCategory; explanation: string } {
  // If there's a mate, handle it
  if (currEval.mate !== null) {
      if (prevEval.mate !== null) {
          // both have mate, compare distance
          const improved = isWhiteTurn ? (currEval.mate > 0 && currEval.mate <= prevEval.mate) : (currEval.mate < 0 && currEval.mate >= prevEval.mate);
          return improved ? { category: 'Best', explanation: 'Found the fastest mate.' } : { category: 'Inaccuracy', explanation: 'Missed a faster mate.' };
      } else {
          // Went from no mate to mate
          const isWinning = isWhiteTurn ? currEval.mate > 0 : currEval.mate < 0;
          if (isWinning) {
             return { category: 'Great', explanation: 'Found a forced checkmate.' };
          } else {
             return { category: 'Blunder', explanation: 'Allowed a forced checkmate.' };
          }
      }
  }
  
  // Normal eval calculation
  let cpLoss = 0;
  if (prevEval.evaluation !== null && currEval.evaluation !== null) {
     const before = isWhiteTurn ? prevEval.evaluation : -prevEval.evaluation;
     const after = isWhiteTurn ? currEval.evaluation : -currEval.evaluation;
     cpLoss = before - after;
  }
  
  if (cpLoss < 20) return { category: 'Best', explanation: 'The strongest move.' };
  if (cpLoss < 50) return { category: 'Excellent', explanation: 'A very strong move.' };
  if (cpLoss < 100) return { category: 'Good', explanation: 'A solid, playable move.' };
  if (cpLoss < 300) return { category: 'Inaccuracy', explanation: 'A slightly suboptimal move.' };
  if (cpLoss < 500) return { category: 'Mistake', explanation: 'A poor move that worsens your position.' };
  
  return { category: 'Blunder', explanation: 'A severe error.' };
}
