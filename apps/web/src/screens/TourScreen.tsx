import { Capacitor } from '@capacitor/core';
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
import {
  getTrackingStatus,
  HEARTBEAT_INTERVAL_MS,
  startBackgroundTracking,
  stopBackgroundTracking,
  type TrackingStatus,
} from '../backgroundTracking';
import LiveIndicator from '../components/LiveIndicator';
import Spinner from '../components/Spinner';
import { getCurrentPosition } from '../geolocation';
import { formatCountdown, formatRelativeTime } from '../relativeTime';
import {
  button,
  buttonDanger,
  buttonSecondary,
  card,
  errorText,
  heading,
  hintText,
  input,
  screen,
  subheading,
  warningText,
} from '../ui';

// Puffer über dem Heartbeat-Intervall, damit eine normale Pause keine Warnung
// auslöst, aber eng genug, um eine nur "bei Nutzung" erteilte
// Standortberechtigung zu erkennen, die Hintergrund-Pings lautlos stoppen
// lässt, ohne dass ein Fehler auftritt.
const BACKGROUND_PING_STALE_MS = HEARTBEAT_INTERVAL_MS + 2 * 60 * 1000;
const BACKGROUND_PING_STALE_MINUTES = Math.round(BACKGROUND_PING_STALE_MS / 60_000);

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
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>(getTrackingStatus());
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  const isActive = tour !== null && tour !== 'loading' && tour.status === 'aktiv';

  useEffect(() => {
    getActiveTour()
      .then((loaded) => {
        setTour(loaded);
        if (loaded && loaded.status === 'aktiv') {
          void startBackgroundTracking(loaded.id);
        }
      })
      .catch(() => setError('Tour-Status konnte nicht geladen werden.'));
  }, []);

  useEffect(() => {
    if (!isActive) {
      setTrackingStatus(getTrackingStatus());
      return;
    }
    // Läuft unabhängig von der Plattform, damit die relative Zeitangabe
    // ("vor X Min.") auch im Browser-Fallback ohne automatisches Tracking
    // regelmäßig neu gerendert wird.
    setTrackingStatus(getTrackingStatus());
    const interval = setInterval(() => {
      setTrackingStatus(getTrackingStatus());
    }, 15_000);
    return () => clearInterval(interval);
  }, [isActive]);

  async function handleStartTour() {
    setError(null);
    try {
      const created = await startTour();
      setTour(created);
      setPingStatus({ state: 'idle' });
      await startBackgroundTracking(created.id);
    } catch {
      setError('Tour konnte nicht gestartet werden.');
    }
  }

  async function handleEndTour() {
    if (!tour || tour === 'loading') return;
    setConfirmingEnd(false);
    setError(null);
    try {
      const ended = await endTour(tour.id);
      setTour(ended);
      await stopBackgroundTracking();
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
        <Spinner />
      </div>
    );
  }

  const isNative = Capacitor.isNativePlatform();
  const trackingReferenceTime = trackingStatus.lastSentAt ?? trackingStatus.startedAt;
  const isTrackingStale =
    isActive &&
    isNative &&
    trackingReferenceTime !== null &&
    Date.now() - trackingReferenceTime > BACKGROUND_PING_STALE_MS;

  const manualSentAt = pingStatus.state === 'sent' ? pingStatus.at.getTime() : null;
  const lastSentAt =
    manualSentAt !== null && trackingStatus.lastSentAt !== null
      ? Math.max(manualSentAt, trackingStatus.lastSentAt)
      : (manualSentAt ?? trackingStatus.lastSentAt);

  return (
    <div className={screen}>
      <h1 className={heading}>Tour</h1>
      <p className={hintText}>
        Solange deine Tour läuft, kann die Bergwacht deinen letzten Standort einsehen – auch
        automatisch im Hintergrund bei geschlossener App – und Angehörige mit deinem Link sehen ihn
        ebenfalls. Aktiv wird die Bergwacht damit nicht automatisch, sondern nur im Vermisstenfall
        oder um örtliche Gegebenheiten abzuklären.
      </p>
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
          {isNative && <LiveIndicator />}
          <p className={hintText}>
            {lastSentAt
              ? `Letzter Standort gesendet: ${formatRelativeTime(new Date(lastSentAt).toISOString())}.`
              : 'Noch kein Standort gesendet.'}
            {isNative &&
              trackingStatus.nextExpectedAt &&
              ` Nächster automatischer Standort ${formatCountdown(trackingStatus.nextExpectedAt)}.`}
          </p>
          {!isNative && (
            <p className={hintText}>
              Standort wird nicht automatisch im Hintergrund gesendet. Sende regelmäßig, wenn du
              Netz hast, damit dein letzter bekannter Standort aktuell bleibt.
            </p>
          )}
          {isTrackingStale && (
            <p className={warningText}>
              Seit über {BACKGROUND_PING_STALE_MINUTES} Minuten kein automatischer Standort
              gesendet. Prüfe, ob die Standortberechtigung auf „Immer erlauben“ steht und ob du
              Empfang hast.
            </p>
          )}
          <button
            className={button}
            onClick={handleSendPing}
            disabled={pingStatus.state === 'sending'}
          >
            {pingStatus.state === 'sending' ? 'Sende Standort …' : 'Standort jetzt senden'}
          </button>
          {pingStatus.state === 'error' && <p className={errorText}>{pingStatus.message}</p>}
          {confirmingEnd ? (
            <div className={card}>
              <p>
                Tour wirklich beenden? Dein Standort wird danach nicht mehr aktualisiert – die
                Bergwacht kann den bisherigen Verlauf weiterhin einsehen, bis er automatisch
                gelöscht wird.
              </p>
              <div className="flex gap-2">
                <button className={buttonDanger} onClick={handleEndTour}>
                  Ja, Tour beenden
                </button>
                <button className={buttonSecondary} onClick={() => setConfirmingEnd(false)}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button className={buttonSecondary} onClick={() => setConfirmingEnd(true)}>
              Tour beenden
            </button>
          )}
        </>
      )}

      {tour !== null && (
        <div className={card}>
          <h2 className={subheading}>Link für Angehörige</h2>
          <p className={hintText}>
            Wer diesen Link hat, sieht den bisherigen Tourverlauf – kein Live-Tracking, kein Ersatz
            für den Notruf. Der Link funktioniert während der Tour und bis 24 Stunden nach Tourende.
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
                <button
                  className={buttonSecondary}
                  onClick={handleRevokeShareLink}
                  disabled={shareBusy}
                >
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
