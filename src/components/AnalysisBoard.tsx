'use client';
import { useState, useEffect, useRef } from 'react';
import { Chess, Move } from 'chess.js';
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
  const [evalBar, setEvalBar] = useState(50);
  const [evalScore, setEvalScore] = useState<string>('0.0');
  
  const [history, setHistory] = useState<Move[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [moves, setMoves] = useState<AnalyzedMove[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  const engineRef = useRef<StockfishEngine | null>(null);
  const prevEvalRef = useRef<EngineResponse | null>(null);

  useEffect(() => {
    engineRef.current = new StockfishEngine();
    engineRef.current.evaluatePosition(game.fen()).then(res => {
      prevEvalRef.current = res;
      updateEvalBar(res);
    });
    
    return () => {
      engineRef.current?.quit();
    };
  }, []);

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

  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string, targetSquare: string | null }) => {
    if (!targetSquare) return false;
    const gameCopy = new Chess(fen);
    
    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });
      
      const newFen = gameCopy.fen();
      setFen(newFen);
      setGame(gameCopy);
      
      const newHistory = [...history.slice(0, currentMoveIndex + 1), move];
      setHistory(newHistory);
      setCurrentMoveIndex(newHistory.length - 1);
      
      const isWhiteTurn = !newFen.includes(' w ');
      if (engineRef.current && prevEvalRef.current) {
        engineRef.current.evaluatePosition(newFen).then(currEval => {
          updateEvalBar(currEval);
          const analysis = categorizeMove(prevEvalRef.current!, currEval, isWhiteTurn);
          setMoves(prev => [...prev.slice(0, currentMoveIndex + 1), { san: move.san, category: analysis.category, explanation: analysis.explanation }]);
          prevEvalRef.current = currEval;
        });
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
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
      
      const gameHistory = newGame.history({ verbose: true }) as Move[];
      setHistory(gameHistory);
      setCurrentMoveIndex(gameHistory.length - 1);
      
      setGame(newGame);
      setFen(newGame.fen());
      setMoves([]);
      
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
  
  const goToMove = (index: number) => {
     if (index < -1 || index >= history.length) return;
     
     const newGame = new Chess();
     for (let i = 0; i <= index; i++) {
        newGame.move(history[i]);
     }
     
     setCurrentMoveIndex(index);
     setGame(newGame);
     setFen(newGame.fen());
     
     if (engineRef.current) {
        engineRef.current.evaluatePosition(newGame.fen(), 10).then(res => {
          prevEvalRef.current = res;
          updateEvalBar(res);
        });
     }
  };

  const analyzeAll = async () => {
    if (!engineRef.current || history.length === 0) return;
    setIsAnalyzing(true);
    setMoves([]);
    
    const tempGame = new Chess();
    let lastEval = await engineRef.current.evaluatePosition(tempGame.fen(), 12);
    
    const newAnalyzedMoves: AnalyzedMove[] = [];
    
    for (let i = 0; i < history.length; i++) {
       const move = history[i];
       const isWhiteTurn = tempGame.turn() === 'w';
       tempGame.move(move);
       
       setFen(tempGame.fen());
       setCurrentMoveIndex(i);
       
       const currEval = await engineRef.current.evaluatePosition(tempGame.fen(), 12);
       updateEvalBar(currEval);
       
       const analysis = categorizeMove(lastEval, currEval, isWhiteTurn);
       newAnalyzedMoves.push({
           san: move.san,
           category: analysis.category,
           explanation: analysis.explanation
       });
       
       setMoves([...newAnalyzedMoves]);
       lastEval = currEval;
    }
    
    prevEvalRef.current = lastEval;
    setIsAnalyzing(false);
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
          <div style={{ width: '500px', maxWidth: '100%' }}>
            <Chessboard options={{ position: fen, onPieceDrop: onDrop }} />
          </div>
          
          <div className={styles.playbackControls}>
             <button onClick={() => goToMove(currentMoveIndex - 1)} disabled={currentMoveIndex < 0 || isAnalyzing}>
               &lt; Prev
             </button>
             <button onClick={() => goToMove(currentMoveIndex + 1)} disabled={currentMoveIndex >= history.length - 1 || isAnalyzing}>
               Next &gt;
             </button>
             <button onClick={analyzeAll} disabled={isAnalyzing || history.length === 0} className={styles.analyzeBtn}>
               {isAnalyzing ? 'Analyzing...' : 'Analyze Full PGN'}
             </button>
          </div>
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
            <div 
              key={i} 
              className={`${styles.moveItem} ${styles[m.category.toLowerCase()]} ${i === currentMoveIndex ? styles.activeMove : ''}`}
              onClick={() => goToMove(i)}
              style={{ cursor: 'pointer' }}
            >
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
