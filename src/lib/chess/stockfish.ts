export type EngineResponse = {
  bestMove: string | null;
  evaluation: number | null; // centipawns from WHITE's perspective (always)
  mate: number | null; // moves to mate from WHITE's perspective (positive = white wins)
  pv: string[]; // principal variation
  depth: number;
};

export class StockfishEngine {
  private worker: Worker | null = null;
  private isReady: boolean = false;
  private resolveReady: (() => void) | null = null;
  
  constructor() {
    if (typeof window !== 'undefined') {
      this.worker = new Worker('/stockfish.js');
      
      this.worker.onmessage = (event) => {
        const line = event.data;
        if (line === 'readyok') {
          this.isReady = true;
          if (this.resolveReady) {
            this.resolveReady();
            this.resolveReady = null;
          }
        }
      };
      
      this.worker.postMessage('uci');
    }
  }
  
  async init() {
    if (this.isReady) return;
    return new Promise<void>((resolve) => {
      this.resolveReady = resolve;
      this.worker?.postMessage('isready');
    });
  }

  /**
   * Evaluate a position. Returns eval always from WHITE's perspective.
   * This is critical — Stockfish returns eval from the side-to-move's perspective,
   * so we flip it when it's black's turn.
   */
  async evaluatePosition(fen: string, depth: number = 18): Promise<EngineResponse> {
    await this.init();
    
    // Determine whose turn it is from the FEN
    const isBlackToMove = fen.split(' ')[1] === 'b';
    
    return new Promise((resolve) => {
      if (!this.worker) return resolve({ bestMove: null, evaluation: null, mate: null, pv: [], depth: 0 });
      
      let currentEval: number | null = null;
      let currentMate: number | null = null;
      let currentPv: string[] = [];
      let bestMove: string | null = null;
      let maxDepth = 0;
      
      const onMessage = (event: MessageEvent) => {
        const line: string = typeof event.data === 'string' ? event.data : String(event.data);
        
        // Parse evaluation info lines — only use the highest depth
        if (line.includes('info depth') && line.includes('score') && !line.includes('upperbound') && !line.includes('lowerbound')) {
          const depthMatch = line.match(/info depth (\d+)/);
          const lineDepth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
          
          // Only use the latest (deepest) search result
          if (lineDepth >= maxDepth) {
            maxDepth = lineDepth;
            
            const scoreMatch = line.match(/score cp (-?\d+)/);
            const mateMatch = line.match(/score mate (-?\d+)/);
            const pvMatch = line.match(/ pv (.+)/);
            
            if (scoreMatch) {
              let cp = parseInt(scoreMatch[1], 10);
              // Stockfish reports from side-to-move perspective.
              // We normalize to WHITE's perspective.
              currentEval = isBlackToMove ? -cp : cp;
              currentMate = null; // clear mate if we get a cp score
            }
            if (mateMatch) {
              let mate = parseInt(mateMatch[1], 10);
              currentMate = isBlackToMove ? -mate : mate;
              currentEval = null; // clear cp if we get a mate score
            }
            if (pvMatch) currentPv = pvMatch[1].split(' ');
          }
        }
        
        // Parse best move (end of search)
        if (line.startsWith('bestmove')) {
          const match = line.match(/bestmove (\S+)/);
          if (match) bestMove = match[1];
          
          this.worker?.removeEventListener('message', onMessage);
          
          resolve({
            bestMove,
            evaluation: currentEval,
            mate: currentMate,
            pv: currentPv,
            depth: maxDepth,
          });
        }
      };
      
      this.worker.addEventListener('message', onMessage);
      
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }
  
  quit() {
    this.worker?.postMessage('quit');
  }
}
