import { useEffect, useState } from 'react';
import {
  createShareLink,
  endTour,
  getActiveTour,
  revokeShareLink,
  sendPing,
  startTour,
  type Tour,
} from '../api/client';
import { getCurrentPosition } from '../geolocation';
import {
  button,
  buttonSecondary,
  card,
  errorText,
  heading,
  hintText,
  input,
  screen,
  subheading,
  successText,
} from '../ui';

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
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

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

  async function handleCreateShareLink() {
    if (!tour || tour === 'loading') return;
    setShareBusy(true);
    setShareError(null);
    try {
      const updated = await createShareLink(tour.id);
      setTour(updated);
      setShareCopied(false);
    } catch {
      setShareError('Link konnte nicht erzeugt werden.');
    } finally {
      setShareBusy(false);
    }
  }

  async function handleRevokeShareLink() {
    if (!tour || tour === 'loading') return;
    setShareBusy(true);
    setShareError(null);
    try {
      const updated = await revokeShareLink(tour.id);
      setTour(updated);
      setShareCopied(false);
    } catch {
      setShareError('Link konnte nicht widerrufen werden.');
    } finally {
      setShareBusy(false);
    }
  }

  async function handleCopyShareLink(shareToken: string) {
    const link = `${window.location.origin}/share/${shareToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }

  if (tour === 'loading') {
    return (
      <div className={screen}>
        <p>Lade …</p>
      </div>
    );
  }

  const isActive = tour !== null && tour.status === 'aktiv';

  return (
    <div className={screen}>
      <h1 className={heading}>Tour</h1>
      {error && <p className={errorText}>{error}</p>}

      {!isActive && (
        <>
          <p>Keine aktive Tour. Starte deine Tour, sobald du losgehst.</p>
          <button className={button} onClick={handleStartTour}>
            Tour starten
          </button>
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
          <p className={hintText}>
            Standort wird nicht automatisch im Hintergrund gesendet. Sende regelmäßig, wenn du Netz
            hast, damit dein letzter bekannter Standort aktuell bleibt.
          </p>
          <button
            className={button}
            onClick={handleSendPing}
            disabled={pingStatus.state === 'sending'}
          >
            {pingStatus.state === 'sending' ? 'Sende Standort …' : 'Standort jetzt senden'}
          </button>
          {pingStatus.state === 'sent' && (
            <p className={successText}>
              Standort gesendet um{' '}
              {pingStatus.at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}
          {pingStatus.state === 'error' && <p className={errorText}>{pingStatus.message}</p>}
          <button className={buttonSecondary} onClick={handleEndTour}>
            Tour beenden
          </button>
        </>
      )}

      {tour !== null && (
        <div className={card}>
          <h2 className={subheading}>Link für Angehörige</h2>
          <p className={hintText}>
            Wer diesen Link hat, sieht den bisherigen Tourverlauf – kein Live-Tracking, kein Ersatz
            für den Notruf. Der Link funktioniert während der Tour und bis 24 Stunden nach
            Tourende.
          </p>

          {tour.shareToken ? (
            <>
              <input
                className={input}
                readOnly
                value={`${window.location.origin}/share/${tour.shareToken}`}
                onFocus={(e) => e.target.select()}
              />
              <div className="flex gap-2">
                <button
                  className={button}
                  onClick={() => handleCopyShareLink(tour.shareToken as string)}
                  disabled={shareBusy}
                >
                  {shareCopied ? 'Kopiert!' : 'Link kopieren'}
                </button>
                <button className={buttonSecondary} onClick={handleRevokeShareLink} disabled={shareBusy}>
                  Widerrufen
                </button>
              </div>
            </>
          ) : (
            <button className={button} onClick={handleCreateShareLink} disabled={shareBusy}>
              Link erzeugen
            </button>
          )}
          {shareError && <p className={errorText}>{shareError}</p>}
        </div>
      )}

      <button className={buttonSecondary} onClick={onLoggedOut}>
        Abmelden
      </button>
    </div>
  );
}

export default TourScreen;
