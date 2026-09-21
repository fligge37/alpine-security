import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';
import { sendPing } from './api/client';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

const QUEUE_KEY = 'alpine-security:ping-queue';
const QUEUE_MAX_SIZE = 50;
const MIN_PING_INTERVAL_MS = 2 * 60 * 1000;

interface QueuedPing {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
}

let watcherId: string | null = null;
let activeTourId: string | null = null;
let lastSentAt: number | null = null;

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

async function handleLocation(tourId: string, location: Location): Promise<void> {
  await flushQueue(tourId);

  const now = Date.now();
  if (lastSentAt !== null && now - lastSentAt < MIN_PING_INTERVAL_MS) {
    return;
  }

  const ping: QueuedPing = {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracy,
    recordedAt: new Date(location.time ?? now).toISOString(),
  };

  try {
    await sendPing(tourId, {
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracyMeters: ping.accuracyMeters ?? undefined,
    });
    lastSentAt = now;
  } catch {
    enqueue(ping);
  }
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
}

export async function stopBackgroundTracking(): Promise<void> {
  if (!Capacitor.isNativePlatform() || watcherId === null) {
    return;
  }
  await BackgroundGeolocation.removeWatcher({ id: watcherId });
  watcherId = null;
  activeTourId = null;
  lastSentAt = null;
}
