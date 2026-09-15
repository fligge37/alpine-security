import { useState } from 'react';
import { Refine } from '@refinedev/core';
import { clearToken, getToken } from './api/client';
import LoginScreen from './screens/LoginScreen';
import ToursScreen from './screens/ToursScreen';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => getToken() !== null);

  function handleLoggedOut() {
    clearToken();
    setIsLoggedIn(false);
  }

  return (
    <Refine resources={[]}>
      <div className="min-h-screen bg-slate-100 text-slate-800">
        {isLoggedIn ? (
          <ToursScreen onLoggedOut={handleLoggedOut} />
        ) : (
          <LoginScreen onLoggedIn={() => setIsLoggedIn(true)} />
        )}
      </div>
    </Refine>
  );
}

export default App;
