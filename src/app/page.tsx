import AnalysisBoard from '@/components/AnalysisBoard';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#121212', padding: '2rem' }}>
      <h1 style={{ textAlign: 'center', color: '#fff', marginBottom: '2rem' }}>
        Stockfish Chess Analysis
      </h1>
      <AnalysisBoard />
    </main>
  );
}
