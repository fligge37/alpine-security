import { useRef } from 'react';
import type { LastPing } from '../api/client';
import { trackTimeRange } from './trackTime';
import { hintText } from '../ui';

interface TimelineProps {
  track: LastPing[];
  valueMs: number;
  onHover: (timestampMs: number | null) => void;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Zeitstrahl zum Ziehen: Klick/Drag auf die Leiste setzt den Zeitpunkt, der Punkt bleibt dort
// stehen, bis erneut gezogen wird oder die Tour-Auswahl wechselt - anders als ein reiner
// Hover-Handler springt die Anzeige beim Verlassen der Leiste NICHT zurück ans Ende (das wirkte
// störend, da man den gerade untersuchten Zeitpunkt sonst nicht "festhalten" konnte).
function Timeline({ track, valueMs, onHover }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const range = trackTimeRange(track);
  if (!range) return null;
  const [startMs, endMs] = range;
  const span = endMs - startMs;

  function timestampFromClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el || span <= 0) return startMs;
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return startMs + fraction * span;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onHover(timestampFromClientX(event.clientX));
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    onHover(timestampFromClientX(event.clientX));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const fraction = span > 0 ? Math.min(1, Math.max(0, (valueMs - startMs) / span)) : 1;

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className={hintText}>{formatTime(startMs)}</span>
        <span className="font-semibold text-slate-900">{formatTime(valueMs)} Uhr</span>
        <span className={hintText}>{formatTime(endMs)}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-6 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-slate-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-600"
          style={{ width: `${fraction * 100}%` }}
        />
        {track.map((p) => {
          const t = new Date(p.recordedAt).getTime();
          const f = span > 0 ? (t - startMs) / span : 0;
          return (
            <div
              key={p.recordedAt}
              className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 bg-slate-400"
              style={{ left: `${f * 100}%` }}
            />
          );
        })}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
          style={{ left: `${fraction * 100}%` }}
        />
      </div>
      <p className={`mt-2 ${hintText}`}>
        Auf die Leiste ziehen, um den Standort zum jeweiligen Zeitpunkt zu sehen.
      </p>
    </div>
  );
}

export default Timeline;
