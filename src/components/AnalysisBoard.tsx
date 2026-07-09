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
  const [fen, setFen] = useState(new Chess().fen());
  const [evalBar, setEvalBar] = useState(50); // 0 to 100 percentage
  const [evalScore, setEvalScore] = useState<string>('0.0');
  const [moves, setMoves] = useState<AnalyzedMove[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  const engineRef = useRef<StockfishEngine | null>(null);
  const prevEvalRef = useRef<EngineResponse | null>(null);
  const gameRef = useRef(new Chess());

  useEffect(() => {
    engineRef.current = new StockfishEngine();
    // Initial evaluation
    engineRef.current.evaluatePosition(gameRef.current.fen()).then(res => {
      prevEvalRef.current = res;
      updateEvalBar(res);
    });
    
    return () => {
      engineRef.current?.quit();
    };
  }, []); // Run only once on mount

  const updateEvalBar = (res: EngineResponse) => {
    if (res.mate !== null) {
      setEvalScore(`M${Math.abs(res.mate)}`);
      setEvalBar(res.mate > 0 ? 100 : 0);
    } else if (res.evaluation !== null) {
      const score = res.evaluation / 100;
      setEvalScore((score > 0 ? '+' : '') + score.toFixed(1));
      
      const percentage = 50 + (Math.max(-5, Math.min(5, score)) / 5) * 50;
      setEvalBar(percentage);
    }
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    const isWhiteTurn = gameRef.current.turn() === 'w';
    
    try {
      const move = gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });
      
      const newFen = gameRef.current.fen();
      setFen(newFen);
      
      if (engineRef.current && prevEvalRef.current) {
        engineRef.current.evaluatePosition(newFen).then(currEval => {
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

  const handleLoad = () => {
    try {
      const newGame = new Chess();
      if (inputValue.includes('[')) {
         newGame.loadPgn(inputValue);
      } else {
         newGame.load(inputValue);
      }
      
      gameRef.current = newGame;
      setFen(newGame.fen());
      setMoves([]);
      
      // Re-evaluate
      if (engineRef.current) {
        engineRef.current.evaluatePosition(newGame.fen()).then(res => {
          prevEvalRef.current = res;
          updateEvalBar(res);
        });
      }
      setInputValue('');
    } catch(e) {
      alert("Invalid FEN or PGN string");
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
        <div className={styles.inputControls}>
           <input 
             type="text" 
             placeholder="Paste FEN or PGN here..." 
             value={inputValue}
             onChange={(e) => setInputValue(e.target.value)}
             className={styles.inputField}
           />
           <button onClick={handleLoad} className={styles.loadBtn}>Load</button>
        </div>
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
