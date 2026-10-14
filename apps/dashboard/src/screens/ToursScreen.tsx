import { useCallback, useEffect, useState } from 'react';
import {
  getTours,
  holdTour,
  releaseTourHold,
  type RescueTour,
  type TourStatus,
} from '../api/client';
import { formatRelativeTime } from '../relativeTime';
import { button, buttonSecondary, errorText, heading, hintText } from '../ui';
import ToursMap from '../components/ToursMap';
import Timeline from '../components/Timeline';
import { trackTimeRange } from '../components/trackTime';

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
  const [holdBusyId, setHoldBusyId] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);

  // Erneuter Klick auf dieselbe Tour (Liste oder Marker) hebt die Auswahl wieder auf; eine neue
  // Auswahl setzt den Zeitstrahl zurück auf "jetzt" (kompletter bisheriger Verlauf).
  const selectTour = useCallback((id: string) => {
    setHoverMs(null);
    setSelectedTourId((prev) => (prev === id ? null : id));
  }, []);

  async function toggleHold(t: RescueTour) {
    setHoldBusyId(t.id);
    try {
      const updated = t.retentionHoldAt ? await releaseTourHold(t.id) : await holdTour(t.id);
      setTours((prev) =>
        prev === 'loading'
          ? prev
          : prev.map((x) =>
              x.id === t.id ? { ...x, retentionHoldAt: updated.retentionHoldAt } : x,
            ),
      );
    } catch {
      setError('Halten/Freigeben ist fehlgeschlagen.');
    } finally {
      setHoldBusyId(null);
    }
  }

  function loadTours(nextStatus: TourStatus) {
    setTours('loading');
    setError(null);
    setSelectedTourId(null);
    setHoverMs(null);
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
    <div className="flex min-h-screen flex-col gap-4 p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
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
      </div>

      {/* Bewusst außerhalb des max-w-4xl-Containers: die Karte soll die ganze Seitenbreite
          nutzen, um Touren/Routen besser erkennbar zu machen. */}
      <ToursMap
        tours={tours === 'loading' ? [] : tours}
        selectedTourId={selectedTourId}
        onSelectTour={selectTour}
        hoverTimestampMs={hoverMs}
      />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {(() => {
          const selectedTour =
            tours !== 'loading' ? (tours.find((t) => t.id === selectedTourId) ?? null) : null;
          const range = selectedTour ? trackTimeRange(selectedTour.track) : null;
          if (!selectedTour || !range) return null;
          return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  Zeitstrahl: {selectedTour.displayName ?? 'Ohne Namen hinterlegt'}
                </p>
                <button className={buttonSecondary} onClick={() => selectTour(selectedTour.id)}>
                  Auswahl aufheben
                </button>
              </div>
              <Timeline
                track={selectedTour.track}
                valueMs={hoverMs ?? range[1]}
                onHover={setHoverMs}
              />
            </div>
          );
        })()}

        {tours === 'loading' && <p>Lade …</p>}

        {tours !== 'loading' && tours.length === 0 && !error && (
          <p className={hintText}>Keine {status === 'aktiv' ? 'aktiven' : 'beendeten'} Touren.</p>
        )}

        {tours !== 'loading' && tours.length > 0 && (
          <ul className="flex flex-col gap-3">
            {tours.map((t) => (
              <li
                key={t.id}
                onClick={() => selectTour(t.id)}
                className={`cursor-pointer rounded-lg border bg-white p-4 ${
                  t.id === selectedTourId
                    ? 'border-blue-600 ring-1 ring-blue-600'
                    : 'border-slate-300'
                }`}
              >
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
                      onClick={(e) => e.stopPropagation()}
                    >
                      In Karte öffnen
                    </a>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Noch kein Standort empfangen.</p>
                )}
                <div className="mt-3 flex items-center gap-3 border-t border-slate-200 pt-3">
                  {t.retentionHoldAt ? (
                    <p className="text-sm text-amber-700">
                      Für Ernstfall gehalten seit {formatDateTime(t.retentionHoldAt)} – von der
                      automatischen Löschung ausgenommen.
                    </p>
                  ) : (
                    <p className={hintText}>
                      Standortverlauf wird nach der regulären Frist automatisch gelöscht.
                    </p>
                  )}
                  <button
                    className={`${buttonSecondary} ml-auto px-3 py-1.5 text-xs`}
                    disabled={holdBusyId === t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHold(t);
                    }}
                  >
                    {t.retentionHoldAt ? 'Hold aufheben' : 'Für Ernstfall halten'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ToursScreen;
