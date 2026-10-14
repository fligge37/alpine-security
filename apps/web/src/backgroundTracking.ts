import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  BackgroundGeolocationPlugin,
  Location,
} from '@capacitor-community/background-geolocation';
import { sendPing } from './api/client';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

const QUEUE_KEY = 'alpine-security:ping-queue';
const QUEUE_MAX_SIZE = 50;
// Throttle für bewegungsausgelöste Pings (distanceFilter-Callback des Plugins).
const MIN_PING_INTERVAL_MS = 2 * 60 * 1000;
// Zeitbasierte Untergrenze: sendet auch ohne Bewegung (z.B. während einer Rast)
// spätestens alle 5 Minuten den zuletzt bekannten Standort, da das Plugin sonst
// bei Stillstand gar keinen Callback auslöst.
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_CHECK_INTERVAL_MS = 30 * 1000;

interface QueuedPing {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
}

let watcherId: string | null = null;
let activeTourId: string | null = null;
let lastSentAt: number | null = null;
let watcherStartedAt: number | null = null;
let lastKnownLocation: Location | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export interface TrackingStatus {
  active: boolean;
  startedAt: number | null;
  lastSentAt: number | null;
  nextExpectedAt: number | null;
}

export function getTrackingStatus(): TrackingStatus {
  const referenceTime = lastSentAt ?? watcherStartedAt;
  return {
    active: watcherId !== null,
    startedAt: watcherStartedAt,
    lastSentAt,
    nextExpectedAt: referenceTime !== null ? referenceTime + HEARTBEAT_INTERVAL_MS : null,
  };
}

function readQueue(): QueuedPing[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedPing[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedPing[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-QUEUE_MAX_SIZE)));
}

function enqueue(ping: QueuedPing): void {
  writeQueue([...readQueue(), ping]);
}

async function flushQueue(tourId: string): Promise<void> {
  const queue = readQueue();
  while (queue.length > 0) {
    const next = queue[0] as QueuedPing;
    try {
      await sendPing(tourId, {
        latitude: next.latitude,
        longitude: next.longitude,
        accuracyMeters: next.accuracyMeters ?? undefined,
      });
      queue.shift();
      writeQueue(queue);
    } catch {
      // Noch kein Netz - Rest der Warteschlange bleibt für den nächsten Versuch stehen.
      return;
    }
  }
}

async function trySend(tourId: string, ping: QueuedPing): Promise<void> {
  try {
    await sendPing(tourId, {
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracyMeters: ping.accuracyMeters ?? undefined,
    });
    lastSentAt = Date.now();
  } catch {
    enqueue(ping);
  }
}

async function handleLocation(tourId: string, location: Location): Promise<void> {
  lastKnownLocation = location;
  await flushQueue(tourId);

  const now = Date.now();
  if (lastSentAt !== null && now - lastSentAt < MIN_PING_INTERVAL_MS) {
    return;
  }

  await trySend(tourId, {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracy,
    recordedAt: new Date(location.time ?? now).toISOString(),
  });
}

async function sendHeartbeatIfDue(tourId: string): Promise<void> {
  if (!lastKnownLocation) {
    return;
  }

  const now = Date.now();
  if (lastSentAt !== null && now - lastSentAt < HEARTBEAT_INTERVAL_MS) {
    return;
  }

  await flushQueue(tourId);
  await trySend(tourId, {
    latitude: lastKnownLocation.latitude,
    longitude: lastKnownLocation.longitude,
    accuracyMeters: lastKnownLocation.accuracy,
    recordedAt: new Date(now).toISOString(),
  });
}

export async function startBackgroundTracking(tourId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  if (watcherId !== null && activeTourId === tourId) {
    return;
  }
  if (watcherId !== null) {
    await stopBackgroundTracking();
  }

  activeTourId = tourId;
  lastSentAt = null;
  lastKnownLocation = null;
  watcherStartedAt = Date.now();

  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Deine Tour läuft. Zum Beenden die Tour in der App stoppen.',
      backgroundTitle: 'Alpine Security verfolgt deinen Standort',
      requestPermissions: true,
      distanceFilter: 50,
    },
    (location, error) => {
      if (error || !location) {
        return;
      }
      void handleLocation(tourId, location);
    },
  );

  heartbeatTimer = setInterval(() => {
    void sendHeartbeatIfDue(tourId);
  }, HEARTBEAT_CHECK_INTERVAL_MS);
}

export async function stopBackgroundTracking(): Promise<void> {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (!Capacitor.isNativePlatform() || watcherId === null) {
    return;
  }
  await BackgroundGeolocation.removeWatcher({ id: watcherId });
  watcherId = null;
  activeTourId = null;
  lastSentAt = null;
  lastKnownLocation = null;
  watcherStartedAt = null;
}
