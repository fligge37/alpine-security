import { Refine } from '@refinedev/core';

function App() {
  return (
    <Refine resources={[]}>
      <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
        <h1>Alpine Security – Bergwacht-Dashboard</h1>
        <p>Grundgerüst läuft (Refine initialisiert, noch ohne Ressourcen).</p>
      </main>
    </Refine>
  );
}

export default App;
