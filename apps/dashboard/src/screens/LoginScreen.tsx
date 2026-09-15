import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, login } from '../api/client';
import { button, errorText, heading, input, label, screen } from '../ui';

interface LoginScreenProps {
  onLoggedIn: () => void;
}

function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      onLoggedIn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('E-Mail oder Passwort ist falsch.');
      } else if (err instanceof ApiError && err.status === 403) {
        setError('Dieser Account ist noch nicht verifiziert.');
      } else {
        setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={screen} onSubmit={handleSubmit}>
      <h1 className={heading}>Bergwacht-Anmeldung</h1>
      <label htmlFor="email" className={label}>
        E-Mail
      </label>
      <input
        id="email"
        className={input}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
      />
      <label htmlFor="password" className={label}>
        Passwort
      </label>
      <input
        id="password"
        className={input}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className={errorText}>{error}</p>}
      <button type="submit" className={button} disabled={isSubmitting}>
        {isSubmitting ? 'Prüfe …' : 'Anmelden'}
      </button>
    </form>
  );
}

export default LoginScreen;
