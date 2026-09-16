import { useState } from 'react';
import { clearToken, getToken } from './api/client';
import LoginScreen from './screens/LoginScreen';
import ShareScreen from './screens/ShareScreen';
import TourScreen from './screens/TourScreen';
import './App.css';

// Kein Router nötig für die eine öffentliche Route: Angehörige rufen den Link
// ohne Login auf, alles andere bleibt der bestehende eingeloggt/nicht-eingeloggt-Flow.
function getShareTokenFromPath(): string | null {
  const [, token] = window.location.pathname.match(/^\/share\/([^/]+)$/) ?? [];
  return token ? decodeURIComponent(token) : null;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => getToken() !== null);
  const shareToken = getShareTokenFromPath();

  function handleLoggedOut() {
    clearToken();
    setIsLoggedIn(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 text-slate-800">
      <div className="bg-slate-800 px-4 py-3 text-center text-sm text-white">
        Kein Ersatz für den Notruf. Im Notfall die 112 wählen.
      </div>
      {shareToken ? (
        <ShareScreen token={shareToken} />
      ) : isLoggedIn ? (
        <TourScreen onLoggedOut={handleLoggedOut} />
      ) : (
        <LoginScreen onLoggedIn={() => setIsLoggedIn(true)} />
      )}
    </main>
  );
}

export default App;
