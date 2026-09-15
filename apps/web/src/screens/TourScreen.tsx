import { useEffect, useState } from 'react';
import { endTour, getActiveTour, sendPing, startTour, type Tour } from '../api/client';
import { getCurrentPosition } from '../geolocation';

interface TourScreenProps {
  onLoggedOut: () => void;
}

type PingStatus =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent'; at: Date }
  | { state: 'error'; message: string };

function TourScreen({ onLoggedOut }: TourScreenProps) {
  const [tour, setTour] = useState<Tour | null | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<PingStatus>({ state: 'idle' });

  useEffect(() => {
    getActiveTour()
      .then(setTour)
      .catch(() => setError('Tour-Status konnte nicht geladen werden.'));
  }, []);

  async function handleStartTour() {
    setError(null);
    try {
      const created = await startTour();
      setTour(created);
      setPingStatus({ state: 'idle' });
    } catch {
      setError('Tour konnte nicht gestartet werden.');
    }
  }

  async function handleEndTour() {
    if (!tour || tour === 'loading') return;
    setError(null);
    try {
      const ended = await endTour(tour.id);
      setTour(ended);
    } catch {
      setError('Tour konnte nicht beendet werden.');
    }
  }

  async function handleSendPing() {
    if (!tour || tour === 'loading') return;
    setPingStatus({ state: 'sending' });
    try {
      const position = await getCurrentPosition();
      await sendPing(tour.id, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
      });
      setPingStatus({ state: 'sent', at: new Date() });
    } catch {
      setPingStatus({
        state: 'error',
        message:
          'Standort konnte nicht gesendet werden. Standortfreigabe prüfen und erneut versuchen.',
      });
    }
  }

  if (tour === 'loading') {
    return (
      <div className="screen">
        <p>Lade …</p>
      </div>
    );
  }

  const isActive = tour !== null && tour.status === 'aktiv';

  return (
    <div className="screen">
      <h1>Tour</h1>
      {error && <p className="error">{error}</p>}

      {!isActive && (
        <>
          <p>Keine aktive Tour. Starte deine Tour, sobald du losgehst.</p>
          <button onClick={handleStartTour}>Tour starten</button>
        </>
      )}

      {isActive && tour !== null && (
        <>
          <p>
            Tour aktiv seit{' '}
            {new Date(tour.startedAt).toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </p>
          <p className="hint">
            Standort wird nicht automatisch im Hintergrund gesendet. Sende regelmäßig, wenn du Netz
            hast, damit dein letzter bekannter Standort aktuell bleibt.
          </p>
          <button onClick={handleSendPing} disabled={pingStatus.state === 'sending'}>
            {pingStatus.state === 'sending' ? 'Sende Standort …' : 'Standort jetzt senden'}
          </button>
          {pingStatus.state === 'sent' && (
            <p className="success">
              Standort gesendet um{' '}
              {pingStatus.at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}
          {pingStatus.state === 'error' && <p className="error">{pingStatus.message}</p>}
          <button className="secondary" onClick={handleEndTour}>
            Tour beenden
          </button>
        </>
      )}

      <button className="secondary" onClick={onLoggedOut}>
        Abmelden
      </button>
    </div>
  );
}

export default TourScreen;
