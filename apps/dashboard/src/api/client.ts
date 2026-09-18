const API_BASE = '/api';
const TOKEN_KEY = 'alpine-security-rescue:token';

export class ApiError extends Error {
  status: number;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

export type TourStatus = 'aktiv' | 'beendet';

export interface LastPing {
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
}

export interface RescueTour {
  id: string;
  status: TourStatus;
  startedAt: string;
  endedAt: string | null;
  retentionHoldAt: string | null;
  phoneNumber: string;
  displayName: string | null;
  lastPing: LastPing | null;
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

  return (await res.json()) as T;
}

export async function login(email: string, password: string): Promise<void> {
  const { token } = await apiFetch<{ token: string }>('/rescue/login', {
    method: 'POST',
    body: { email, password },
  });
  setToken(token);
}

export async function getTours(status: TourStatus): Promise<RescueTour[]> {
  return apiFetch<RescueTour[]>(`/rescue/tours?status=${status}`, { auth: true });
}

// Nimmt eine Tour von der automatischen Löschung ihres Standortverlaufs aus
// (ADR 0008, "Ernstfall"-Fall) bzw. hebt das wieder auf.
export async function holdTour(id: string): Promise<RescueTour> {
  return apiFetch<RescueTour>(`/rescue/tours/${id}/hold`, { method: 'POST', auth: true });
}

export async function releaseTourHold(id: string): Promise<RescueTour> {
  return apiFetch<RescueTour>(`/rescue/tours/${id}/hold`, { method: 'DELETE', auth: true });
}
