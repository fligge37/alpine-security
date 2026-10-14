import type { LastPing } from '../api/client';

// Hilfsfunktionen für den Zeitstrahl in ToursMap/Timeline: eine Tour-Historie (chronologisch
// aufsteigend, siehe getPingTrack in apps/api) in eine Position/einen Linien-Split zu einem
// beliebigen Zeitpunkt umrechnen. Interpoliert linear zwischen den beiden umliegenden Pings -
// eine Näherung (konstante Geschwindigkeit angenommen), aber für die Visualisierung ausreichend.

export function trackTimeRange(track: LastPing[]): [number, number] | null {
  const first = track[0];
  const last = track[track.length - 1];
  if (!first || !last || track.length < 2) return null;
  return [new Date(first.recordedAt).getTime(), new Date(last.recordedAt).getTime()];
}

// Callers only ever invoke this for a track with trackTimeRange(track) !== null, i.e. at least
// two pings - the [0, 0] fallback below can't be reached in practice.
export function interpolatePosition(track: LastPing[], timestampMs: number): [number, number] {
  const first = track[0];
  if (!first) return [0, 0];
  if (timestampMs <= new Date(first.recordedAt).getTime()) {
    return [first.longitude, first.latitude];
  }

  for (let i = 1; i < track.length; i++) {
    const prev = track[i - 1];
    const curr = track[i];
    if (!prev || !curr) continue;
    const prevMs = new Date(prev.recordedAt).getTime();
    const currMs = new Date(curr.recordedAt).getTime();
    if (timestampMs <= currMs) {
      const fraction = currMs === prevMs ? 0 : (timestampMs - prevMs) / (currMs - prevMs);
      return [
        prev.longitude + (curr.longitude - prev.longitude) * fraction,
        prev.latitude + (curr.latitude - prev.latitude) * fraction,
      ];
    }
  }

  const last = track[track.length - 1];
  return last ? [last.longitude, last.latitude] : [first.longitude, first.latitude];
}

interface TrackSplit {
  traversed: [number, number][];
  upcoming: [number, number][];
}

// Splittet den Track an timestampMs in "bereits zurückgelegt" und "noch bevorstehend", beide
// Seiten geteilt durch den interpolierten Punkt (sonst Lücke/Überlappung an der Schnittstelle).
export function splitTrackAt(track: LastPing[], timestampMs: number): TrackSplit {
  const point = interpolatePosition(track, timestampMs);
  const traversed: [number, number][] = [];
  const upcoming: [number, number][] = [];

  for (const p of track) {
    const ms = new Date(p.recordedAt).getTime();
    if (ms <= timestampMs) {
      traversed.push([p.longitude, p.latitude]);
    } else {
      upcoming.push([p.longitude, p.latitude]);
    }
  }

  const lastTraversed = traversed[traversed.length - 1];
  if (!lastTraversed || lastTraversed[0] !== point[0] || lastTraversed[1] !== point[1]) {
    traversed.push(point);
  }

  const firstUpcoming = upcoming[0];
  if (!firstUpcoming || firstUpcoming[0] !== point[0] || firstUpcoming[1] !== point[1]) {
    upcoming.unshift(point);
  }

  return { traversed, upcoming };
}
