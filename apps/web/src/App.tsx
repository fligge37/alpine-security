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
    <main className="app">
      <div className="notice">Kein Ersatz für den Notruf. Im Notfall die 112 wählen.</div>
      {isLoggedIn ? (
        <TourScreen onLoggedOut={handleLoggedOut} />
      ) : (
        <LoginScreen onLoggedIn={() => setIsLoggedIn(true)} />
      )}
    </main>
  );
}

export default App;
