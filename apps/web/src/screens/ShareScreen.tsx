import { useEffect, useState } from 'react';
import { getSharedTour, type SharedTour } from '../api/client';
import ShareMap from '../components/ShareMap';
import { formatRelativeTime } from '../relativeTime';
import { errorText, heading, hintText, screen, subheading } from '../ui';

interface ShareScreenProps {
  token: string;
}

function ShareScreen({ token }: ShareScreenProps) {
  const [tour, setTour] = useState<SharedTour | 'loading' | 'not_found'>('loading');

  useEffect(() => {
    getSharedTour(token)
      .then(setTour)
      .catch(() => setTour('not_found'));
  }, [token]);

  if (tour === 'loading') {
    return (
      <div className={screen}>
        <p>Lade …</p>
      </div>
    );
  }

  if (tour === 'not_found') {
    return (
      <div className={screen}>
        <h1 className={heading}>Link ungültig</h1>
        <p className={errorText}>
          Dieser Link ist ungültig oder abgelaufen. Links funktionieren nur während einer aktiven
          Tour und bis 24 Stunden nach Tourende.
        </p>
      </div>
    );
  }

  const lastPoint = tour.track[tour.track.length - 1];

  return (
    <div className={screen}>
      <h1 className={heading}>{tour.displayName ? `Tour von ${tour.displayName}` : 'Tour'}</h1>
      <p className={hintText}>
        Kein Live-Tracking, kein Ersatz für den Notruf – nur die von der Person gesendeten
        Standort-Pings. Im Notfall die 112 wählen.
      </p>

      <p className={subheading}>{tour.status === 'aktiv' ? 'Tour aktiv' : 'Tour beendet'}</p>
      <p className={hintText}>
        Gestartet um{' '}
        {new Date(tour.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        {tour.endedAt &&
          ` – beendet um ${new Date(tour.endedAt).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
          })}`}
        .
      </p>

      {lastPoint ? (
        <>
          <p className={hintText}>Letzter bekannter Standort: {formatRelativeTime(lastPoint.recordedAt)}.</p>
          <ShareMap track={tour.track} />
        </>
      ) : (
        <p className={hintText}>Noch kein Standort gesendet.</p>
      )}
    </div>
  );
}

export default ShareScreen;
