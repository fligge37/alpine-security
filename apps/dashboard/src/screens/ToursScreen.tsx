import { useEffect, useState } from 'react';
import { getTours, type RescueTour, type TourStatus } from '../api/client';
import { formatRelativeTime } from '../relativeTime';
import { button, buttonSecondary, errorText, heading, hintText, screen } from '../ui';

interface ToursScreenProps {
  onLoggedOut: () => void;
}

function formatDateTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ToursScreen({ onLoggedOut }: ToursScreenProps) {
  const [status, setStatus] = useState<TourStatus>('aktiv');
  const [tours, setTours] = useState<RescueTour[] | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);

  function loadTours(nextStatus: TourStatus) {
    setTours('loading');
    setError(null);
    getTours(nextStatus)
      .then(setTours)
      .catch(() => {
        setTours([]);
        setError('Touren konnten nicht geladen werden.');
      });
  }

  useEffect(() => {
    loadTours(status);
  }, [status]);

  return (
    <div className={screen}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className={heading}>Touren-Suche</h1>
          <p className={hintText}>
            Suchwerkzeug für einen konkreten Anlass (z. B. Vermisstenmeldung) – kein automatisches
            Alarmsystem. Standorte sind zuletzt bekannte Check-ins, kein Live-Track.
          </p>
        </div>
        <button className={buttonSecondary} onClick={onLoggedOut}>
          Abmelden
        </button>
      </div>

      <div className="flex gap-2">
        <button
          className={status === 'aktiv' ? button : buttonSecondary}
          onClick={() => setStatus('aktiv')}
        >
          Aktiv
        </button>
        <button
          className={status === 'beendet' ? button : buttonSecondary}
          onClick={() => setStatus('beendet')}
        >
          Beendet
        </button>
        <button className={buttonSecondary} onClick={() => loadTours(status)}>
          Aktualisieren
        </button>
      </div>

      {error && <p className={errorText}>{error}</p>}

      {tours === 'loading' && <p>Lade …</p>}

      {tours !== 'loading' && tours.length === 0 && !error && (
        <p className={hintText}>Keine {status === 'aktiv' ? 'aktiven' : 'beendeten'} Touren.</p>
      )}

      {tours !== 'loading' && tours.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tours.map((t) => (
            <li key={t.id} className="rounded-lg border border-slate-300 bg-white p-4">
              <p className="font-semibold text-slate-800">
                {t.displayName ?? 'Ohne Namen hinterlegt'}
              </p>
              <p className={hintText}>{t.phoneNumber}</p>
              <p className="mt-2 text-sm text-slate-700">
                Gestartet: {formatDateTime(t.startedAt)}
                {t.endedAt && <> · Beendet: {formatDateTime(t.endedAt)}</>}
              </p>
              {t.lastPing ? (
                <p className="mt-1 text-sm text-slate-700">
                  Letzter bekannter Standort: {t.lastPing.latitude.toFixed(5)},{' '}
                  {t.lastPing.longitude.toFixed(5)} ({formatRelativeTime(t.lastPing.recordedAt)})
                  {' · '}
                  <a
                    className="text-slate-800 underline"
                    href={`https://www.google.com/maps?q=${t.lastPing.latitude},${t.lastPing.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    In Karte öffnen
                  </a>
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Noch kein Standort empfangen.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ToursScreen;
