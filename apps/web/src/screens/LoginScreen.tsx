import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, requestOtp, verifyOtp } from '../api/client';
import { button, buttonSecondary, errorText, heading, input, label, screen } from '../ui';

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
      <form className={screen} onSubmit={handleRequestOtp}>
        <h1 className={heading}>Anmelden</h1>
        <label htmlFor="phone" className={label}>
          Handynummer
        </label>
        <input
          id="phone"
          className={input}
          type="tel"
          inputMode="tel"
          placeholder="+49 151 23456789"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          required
        />
        {error && <p className={errorText}>{error}</p>}
        <button type="submit" className={button} disabled={isSubmitting}>
          {isSubmitting ? 'Sende Code …' : 'Code anfordern'}
        </button>
      </form>
    );
  }

  return (
    <form className={screen} onSubmit={handleVerifyOtp}>
      <h1 className={heading}>Code eingeben</h1>
      <p>Wir haben einen 6-stelligen Code an {phoneNumber} gesendet.</p>
      <label htmlFor="code" className={label}>
        Code
      </label>
      <input
        id="code"
        className={input}
        type="text"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        autoFocus
      />
      {error && <p className={errorText}>{error}</p>}
      <button type="submit" className={button} disabled={isSubmitting}>
        {isSubmitting ? 'Prüfe …' : 'Anmelden'}
      </button>
      <button type="button" className={buttonSecondary} onClick={() => setStep('phone')}>
        Andere Nummer verwenden
      </button>
    </form>
  );
}

export default LoginScreen;
