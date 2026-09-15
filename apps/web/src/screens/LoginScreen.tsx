import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, requestOtp, verifyOtp } from '../api/client';

interface LoginScreenProps {
  onLoggedIn: () => void;
}

function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestOtp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await requestOtp(phoneNumber);
      setStep('code');
    } catch {
      setError('Code konnte nicht angefordert werden. Bitte Nummer prüfen und erneut versuchen.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyOtp(phoneNumber, code);
      onLoggedIn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Code ist falsch oder abgelaufen.');
      } else {
        setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === 'phone') {
    return (
      <form className="screen" onSubmit={handleRequestOtp}>
        <h1>Anmelden</h1>
        <label htmlFor="phone">Handynummer</label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          placeholder="+49 151 23456789"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sende Code …' : 'Code anfordern'}
        </button>
      </form>
    );
  }

  return (
    <form className="screen" onSubmit={handleVerifyOtp}>
      <h1>Code eingeben</h1>
      <p>Wir haben einen 6-stelligen Code an {phoneNumber} gesendet.</p>
      <label htmlFor="code">Code</label>
      <input
        id="code"
        type="text"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Prüfe …' : 'Anmelden'}
      </button>
      <button type="button" className="secondary" onClick={() => setStep('phone')}>
        Andere Nummer verwenden
      </button>
    </form>
  );
}

export default LoginScreen;
