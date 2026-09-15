import { Refine } from '@refinedev/core';

function App() {
  return (
    <Refine resources={[]}>
      <main className="min-h-screen bg-slate-100 p-8 text-slate-800">
        <h1 className="mb-2 text-2xl font-bold">Alpine Security – Bergwacht-Dashboard</h1>
        <p>Grundgerüst läuft (Refine initialisiert, noch ohne Ressourcen).</p>
      </main>
    </Refine>
  );
}

export default App;
