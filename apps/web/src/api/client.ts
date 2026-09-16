const API_BASE = '/api';
const TOKEN_KEY = 'alpine-security:token';

export class ApiError extends Error {
  status: number;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

export interface Tour {
  id: string;
  userId: string;
  status: 'aktiv' | 'beendet';
  startedAt: string;
  endedAt: string | null;
  shareToken: string | null;
  createdAt: string;
}

export interface TrackPoint {
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
}

export interface SharedTour {
  id: string;
  status: 'aktiv' | 'beendet';
  startedAt: string;
  endedAt: string | null;
  displayName: string | null;
  track: TrackPoint[];
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.auth) {
    const token = getToken();
    if (!token) {
      throw new ApiError(401, 'not_authenticated');
    }
    headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
  }

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const code = (body as { error?: string }).error ?? `http_${res.status}`;
    throw new ApiError(res.status, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function requestOtp(phoneNumber: string): Promise<void> {
  await apiFetch('/auth/request-otp', { method: 'POST', body: { phoneNumber } });
}

export async function verifyOtp(phoneNumber: string, code: string): Promise<void> {
  const { token } = await apiFetch<{ token: string }>('/auth/verify-otp', {
    method: 'POST',
    body: { phoneNumber, code },
  });
  setToken(token);
}

export async function getActiveTour(): Promise<Tour | null> {
  try {
    return await apiFetch<Tour>('/tours/active', { auth: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function startTour(): Promise<Tour> {
  return apiFetch<Tour>('/tours', { method: 'POST', auth: true });
}

export async function endTour(tourId: string): Promise<Tour> {
  return apiFetch<Tour>(`/tours/${tourId}/end`, { method: 'POST', auth: true });
}

export interface PingInput {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export async function sendPing(tourId: string, input: PingInput): Promise<void> {
  await apiFetch(`/tours/${tourId}/pings`, {
    method: 'POST',
    auth: true,
    body: { ...input, recordedAt: new Date().toISOString() },
  });
}

export async function createShareLink(tourId: string): Promise<Tour> {
  return apiFetch<Tour>(`/tours/${tourId}/share`, { method: 'POST', auth: true });
}

export async function revokeShareLink(tourId: string): Promise<Tour> {
  return apiFetch<Tour>(`/tours/${tourId}/share`, { method: 'DELETE', auth: true });
}

export async function getSharedTour(token: string): Promise<SharedTour> {
  return apiFetch<SharedTour>(`/share/${token}`);
}
