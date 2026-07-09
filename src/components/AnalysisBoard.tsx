'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Chess, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { StockfishEngine, EngineResponse } from '@/lib/chess/stockfish';
import { categorizeMove, MoveCategory, AnalysisResult } from '@/lib/chess/analyzer';
import styles from './AnalysisBoard.module.css';

type AnalyzedMove = {
  move: Move;
  result: AnalysisResult;
};

// Category icons matching chess.com
const CATEGORY_ICONS: Record<MoveCategory, string> = {
  Brilliant: '💎',
  Great: '🌟',
  Best: '✅',
  Excellent: '🔵',
  Good: '🟢',
  Inaccuracy: '🟡',
  Mistake: '🟠',
  Blunder: '🔴',
  Book: '📖',
};

export default function AnalysisBoard() {
  const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [evalBar, setEvalBar] = useState(50);
  const [evalScore, setEvalScore] = useState<string>('0.0');
  
  const [history, setHistory] = useState<Move[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  
  const [analyzedMoves, setAnalyzedMoves] = useState<AnalyzedMove[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [engineDepth, setEngineDepth] = useState(18);
  
  const engineRef = useRef<StockfishEngine | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    engineRef.current = new StockfishEngine();
    return () => { engineRef.current?.quit(); };
  }, []);

  const updateEvalBar = useCallback((res: EngineResponse) => {
    if (res.mate !== null) {
      setEvalScore(`M${Math.abs(res.mate)}`);
      setEvalBar(res.mate > 0 ? 100 : 0);
    } else if (res.evaluation !== null) {
      // evaluation is already from WHITE's perspective
      const score = res.evaluation / 100;
      setEvalScore((score > 0 ? '+' : '') + score.toFixed(1));
      const percentage = 50 + (Math.max(-5, Math.min(5, score)) / 5) * 50;
      setEvalBar(percentage);
    }
  }, []);

  const onDrop = useCallback(({ sourceSquare, targetSquare }: { sourceSquare: string, targetSquare: string | null }) => {
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
      
      const newHistory = [...history.slice(0, currentMoveIndex + 1), move];
      setHistory(newHistory);
      setCurrentMoveIndex(newHistory.length - 1);
      
      // Clear analysis since the game has changed
      setAnalyzedMoves(prev => prev.slice(0, currentMoveIndex + 1));
      
      if (engineRef.current) {
        engineRef.current.evaluatePosition(newFen, engineDepth).then(res => {
          updateEvalBar(res);
        });
      }
      return true;
    } catch {
      return false;
    }
  }, [fen, history, currentMoveIndex, engineDepth, updateEvalBar]);

  const handleLoad = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    
    try {
      const newGame = new Chess();
      
      // Detect PGN vs FEN
      if (trimmed.includes('[') || trimmed.includes('1.') || /^\d+\./.test(trimmed)) {
        // Try as PGN
        newGame.loadPgn(trimmed);
      } else {
        // Try as FEN
        newGame.load(trimmed);
      }
      
      const gameHistory = newGame.history({ verbose: true }) as Move[];
      setHistory(gameHistory);
      
      // Go to the START of the game, not the end — user should navigate
      setCurrentMoveIndex(-1);
      setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      setAnalyzedMoves([]);
      setEvalBar(50);
      setEvalScore('0.0');
      setInputValue('');
    } catch {
      alert("Invalid FEN or PGN. Make sure you paste the full text.");
    }
  }, [inputValue]);
  
  const goToMove = useCallback((index: number) => {
    if (index < -1 || index >= history.length) return;
    
    const newGame = new Chess();
    for (let i = 0; i <= index; i++) {
      newGame.move(history[i]);
    }
    
    setCurrentMoveIndex(index);
    setFen(newGame.fen());
    
    // Show eval from analysis if available, otherwise re-evaluate
    if (index >= 0 && analyzedMoves[index]) {
      const evalAfter = analyzedMoves[index].result.evalAfter;
      if (evalAfter !== null) {
        const score = evalAfter / 100;
        setEvalScore((score > 0 ? '+' : '') + score.toFixed(1));
        const percentage = 50 + (Math.max(-5, Math.min(5, score)) / 5) * 50;
        setEvalBar(percentage);
      }
    } else if (engineRef.current) {
      engineRef.current.evaluatePosition(newGame.fen(), engineDepth).then(res => {
        updateEvalBar(res);
      });
    }
  }, [history, analyzedMoves, engineDepth, updateEvalBar]);

  const analyzeAll = useCallback(async () => {
    if (!engineRef.current || history.length === 0) return;
    setIsAnalyzing(true);
    setAnalyzedMoves([]);
    setCurrentMoveIndex(-1);
    setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    
    const tempGame = new Chess();
    const newAnalyzedMoves: AnalyzedMove[] = [];
    
    // Evaluate the starting position FIRST
    setAnalysisProgress('Evaluating starting position...');
    let prevEval = await engineRef.current.evaluatePosition(tempGame.fen(), engineDepth);
    
    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const wasWhiteMove = tempGame.turn() === 'w';
      
      setAnalysisProgress(`Analyzing move ${i + 1}/${history.length}: ${move.san}...`);
      
      // The eval BEFORE the move includes the best move suggestion
      const bestMoveBefore = prevEval.bestMove;
      
      // Make the move
      tempGame.move(move);
      const posAfter = tempGame.fen();
      
      // Evaluate position AFTER the move
      const currEval = await engineRef.current.evaluatePosition(posAfter, engineDepth);
      
      // Convert the played move to UCI format for comparison with engine's best move
      const actualMoveUCI = move.from + move.to + (move.promotion || '');
      
      // Classify
      const result = categorizeMove(prevEval, currEval, wasWhiteMove, bestMoveBefore, actualMoveUCI);
      
      newAnalyzedMoves.push({ move, result });
      
      // Update UI progressively
      setAnalyzedMoves([...newAnalyzedMoves]);
      setFen(posAfter);
      setCurrentMoveIndex(i);
      updateEvalBar(currEval);
      
      // Yield to let React render
      await new Promise(r => setTimeout(r, 10));
      
      // Use current eval as previous for next iteration
      prevEval = currEval;
    }
    
    setAnalysisProgress('');
    setIsAnalyzing(false);
  }, [history, engineDepth, updateEvalBar]);

  // Build move pairs for chess.com-style display
  const movePairs: { moveNumber: number; white?: AnalyzedMove; black?: AnalyzedMove; whiteIndex: number; blackIndex: number }[] = [];
  for (let i = 0; i < analyzedMoves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: analyzedMoves[i],
      black: analyzedMoves[i + 1],
      whiteIndex: i,
      blackIndex: i + 1,
    });
  }

  // Count categories for summary
  const categoryCounts: Partial<Record<MoveCategory, number>> = {};
  analyzedMoves.forEach(m => {
    categoryCounts[m.result.category] = (categoryCounts[m.result.category] || 0) + 1;
  });

  return (
    <div className={styles.container}>
      <div className={styles.boardSection}>
        <div className={styles.evalBarContainer}>
          <div className={styles.evalBarWhite} style={{ height: `${evalBar}%` }} />
          <div className={styles.evalScore}>{evalScore}</div>
        </div>
        <div className={styles.boardWrapper}>
          <div style={{ width: '500px', maxWidth: '100%' }}>
            <Chessboard options={{ position: fen, onPieceDrop: onDrop }} />
          </div>
          
          <div className={styles.playbackControls}>
            <button onClick={() => goToMove(-1)} disabled={currentMoveIndex < 0 || isAnalyzing} title="Go to start">
              ⏮
            </button>
            <button onClick={() => goToMove(currentMoveIndex - 1)} disabled={currentMoveIndex < 0 || isAnalyzing} title="Previous move">
              ◀
            </button>
            <button onClick={() => goToMove(currentMoveIndex + 1)} disabled={currentMoveIndex >= history.length - 1 || isAnalyzing} title="Next move">
              ▶
            </button>
            <button onClick={() => goToMove(history.length - 1)} disabled={currentMoveIndex >= history.length - 1 || isAnalyzing} title="Go to end">
              ⏭
            </button>
            <button 
              onClick={analyzeAll} 
              disabled={isAnalyzing || history.length === 0} 
              className={styles.analyzeBtn}
            >
              {isAnalyzing ? '⟳ Analyzing...' : '⚡ Analyze'}
            </button>
          </div>
        </div>
      </div>
      
      <div className={styles.sidebar}>
        {/* Input Area */}
        <div className={styles.inputControls}>
          <textarea 
            placeholder={"Paste PGN or FEN here...\n\nExample: 1. e4 e5 2. Nf3 Nc6 ..."}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className={styles.inputField}
            rows={3}
          />
          <button onClick={handleLoad} className={styles.loadBtn}>Load</button>
        </div>
        
        {/* Game Info */}
        {history.length > 0 && (
          <div className={styles.gameInfo}>
            <span>{history.length} moves loaded</span>
            {analyzedMoves.length > 0 && (
              <span> • Depth {engineDepth}</span>
            )}
          </div>
        )}
        
        {/* Analysis Progress */}
        {isAnalyzing && (
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ width: `${(analyzedMoves.length / history.length) * 100}%` }}
            />
            <span className={styles.progressText}>{analysisProgress}</span>
          </div>
        )}
        
        {/* Category Summary */}
        {analyzedMoves.length > 0 && !isAnalyzing && (
          <div className={styles.summary}>
            {(['Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'] as MoveCategory[]).map(cat => {
              const count = categoryCounts[cat];
              if (!count) return null;
              return (
                <span key={cat} className={`${styles.summaryItem} ${styles[cat.toLowerCase()]}`}>
                  {CATEGORY_ICONS[cat]} {count}
                </span>
              );
            })}
          </div>
        )}
        
        {/* Move List — chess.com style paired */}
        <div className={styles.movesList} ref={moveListRef}>
          {movePairs.map((pair) => (
            <div key={pair.moveNumber} className={styles.movePair}>
              <span className={styles.moveNumber}>{pair.moveNumber}.</span>
              
              {pair.white && (
                <div 
                  className={`${styles.moveCell} ${styles[pair.white.result.category.toLowerCase()]} ${pair.whiteIndex === currentMoveIndex ? styles.activeMove : ''}`}
                  onClick={() => goToMove(pair.whiteIndex)}
                  title={pair.white.result.explanation}
                >
                  <span className={styles.moveIcon}>{CATEGORY_ICONS[pair.white.result.category]}</span>
                  <span className={styles.moveSan}>{pair.white.move.san}</span>
                </div>
              )}
              
              {pair.black && (
                <div 
                  className={`${styles.moveCell} ${styles[pair.black.result.category.toLowerCase()]} ${pair.blackIndex === currentMoveIndex ? styles.activeMove : ''}`}
                  onClick={() => goToMove(pair.blackIndex)}
                  title={pair.black.result.explanation}
                >
                  <span className={styles.moveIcon}>{CATEGORY_ICONS[pair.black.result.category]}</span>
                  <span className={styles.moveSan}>{pair.black.move.san}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Selected Move Detail */}
        {currentMoveIndex >= 0 && analyzedMoves[currentMoveIndex] && (
          <div className={`${styles.moveDetail} ${styles[analyzedMoves[currentMoveIndex].result.category.toLowerCase()]}`}>
            <div className={styles.moveDetailHeader}>
              <span className={styles.moveDetailIcon}>{CATEGORY_ICONS[analyzedMoves[currentMoveIndex].result.category]}</span>
              <strong>{analyzedMoves[currentMoveIndex].move.san}</strong>
              <span className={styles.categoryLabel}>{analyzedMoves[currentMoveIndex].result.category}</span>
            </div>
            <p className={styles.moveDetailExplanation}>{analyzedMoves[currentMoveIndex].result.explanation}</p>
            {analyzedMoves[currentMoveIndex].result.cpLoss > 0 && (
              <p className={styles.moveDetailCpLoss}>
                Centipawn loss: {analyzedMoves[currentMoveIndex].result.cpLoss}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
