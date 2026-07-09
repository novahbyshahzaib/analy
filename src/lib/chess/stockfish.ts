export type EngineResponse = {
  bestMove: string | null;
  evaluation: number | null; // centipawns. Positive for white, negative for black
  mate: number | null; // moves to mate. Positive for white, negative for black
  pv: string[]; // principal variation
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

  async evaluatePosition(fen: string, depth: number = 12): Promise<EngineResponse> {
    await this.init();
    
    return new Promise((resolve) => {
      if (!this.worker) return resolve({ bestMove: null, evaluation: null, mate: null, pv: [] });
      
      let currentEval: number | null = null;
      let currentMate: number | null = null;
      let currentPv: string[] = [];
      let bestMove: string | null = null;
      
      const onMessage = (event: MessageEvent) => {
        const line = event.data;
        
        // Parse evaluation
        if (line.includes('info depth') && line.includes('score')) {
          const scoreMatch = line.match(/score cp (-?\d+)/);
          const mateMatch = line.match(/score mate (-?\d+)/);
          const pvMatch = line.match(/pv (.+)/);
          
          if (scoreMatch) currentEval = parseInt(scoreMatch[1], 10);
          if (mateMatch) currentMate = parseInt(mateMatch[1], 10);
          if (pvMatch) currentPv = pvMatch[1].split(' ');
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
            pv: currentPv
          });
        }
      };
      
      this.worker.addEventListener('message', onMessage);
      
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }
  
  quit() {
    this.worker?.postMessage('quit');
  }
}
