import { useState } from 'react';
import { clearToken, getToken } from './api/client';
import LoginScreen from './screens/LoginScreen';
import TourScreen from './screens/TourScreen';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => getToken() !== null);

  function handleLoggedOut() {
    clearToken();
    setIsLoggedIn(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 text-slate-800">
      <div className="bg-slate-800 px-4 py-3 text-center text-sm text-white">
        Kein Ersatz für den Notruf. Im Notfall die 112 wählen.
      </div>
      {isLoggedIn ? (
        <TourScreen onLoggedOut={handleLoggedOut} />
      ) : (
        <LoginScreen onLoggedIn={() => setIsLoggedIn(true)} />
      )}
    </main>
  );
}

export default App;
