'use client';
import { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { StockfishEngine, EngineResponse } from '@/lib/chess/stockfish';
import { categorizeMove, MoveCategory } from '@/lib/chess/analyzer';
import styles from './AnalysisBoard.module.css';

type AnalyzedMove = {
  san: string;
  category: MoveCategory;
  explanation: string;
};

export default function AnalysisBoard() {
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [evalBar, setEvalBar] = useState(50); // 0 to 100 percentage
  const [evalScore, setEvalScore] = useState<string>('0.0');
  const [moves, setMoves] = useState<AnalyzedMove[]>([]);
  
  const engineRef = useRef<StockfishEngine | null>(null);
  const prevEvalRef = useRef<EngineResponse | null>(null);

  useEffect(() => {
    engineRef.current = new StockfishEngine();
    // Initial evaluation
    engineRef.current.evaluatePosition(game.fen()).then(res => {
      prevEvalRef.current = res;
      updateEvalBar(res);
    });
    
    return () => {
      engineRef.current?.quit();
    };
  }, [game]);

  const updateEvalBar = (res: EngineResponse) => {
    if (res.mate !== null) {
      setEvalScore(`M${Math.abs(res.mate)}`);
      setEvalBar(res.mate > 0 ? 100 : 0);
    } else if (res.evaluation !== null) {
      const score = res.evaluation / 100;
      setEvalScore((score > 0 ? '+' : '') + score.toFixed(1));
      
      // Calculate percentage for bar. A score of +5 (or -5) is 100% (or 0%)
      const percentage = 50 + (Math.max(-5, Math.min(5, score)) / 5) * 50;
      setEvalBar(percentage);
    }
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    const gameCopy = new Chess(game.fen());
    const isWhiteTurn = gameCopy.turn() === 'w';
    
    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });
      
      setGame(gameCopy);
      setFen(gameCopy.fen());
      
      // Evaluate new position
      if (engineRef.current && prevEvalRef.current) {
        engineRef.current.evaluatePosition(gameCopy.fen()).then(currEval => {
          updateEvalBar(currEval);
          
          const analysis = categorizeMove(prevEvalRef.current!, currEval, isWhiteTurn);
          setMoves(prev => [...prev, { san: move.san, category: analysis.category, explanation: analysis.explanation }]);
          
          prevEvalRef.current = currEval;
        });
      }
      return true;
    } catch (e) {
      return false; // Illegal move
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.boardSection}>
        <div className={styles.evalBarContainer}>
          <div 
            className={styles.evalBarFill} 
            style={{ height: `${evalBar}%`, backgroundColor: evalBar > 50 ? '#fff' : '#333' }}
          />
          <div className={styles.evalScore}>{evalScore}</div>
        </div>
        <div className={styles.boardWrapper}>
          <Chessboard position={fen} onPieceDrop={onDrop} boardWidth={500} />
        </div>
      </div>
      
      <div className={styles.sidebar}>
        <h2>Game Analysis</h2>
        <div className={styles.movesList}>
          {moves.map((m, i) => (
            <div key={i} className={`${styles.moveItem} ${styles[m.category.toLowerCase()]}`}>
              <strong>{i % 2 === 0 ? Math.floor(i/2) + 1 + '.' : ''} {m.san}</strong>
              <span className={styles.categoryBadge}>{m.category}</span>
              <p>{m.explanation}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
