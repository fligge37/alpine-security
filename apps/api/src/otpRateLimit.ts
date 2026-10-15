// Schutz gegen SMS-Bombing auf /auth/request-otp (siehe ADR 0005, "Rate-Limiting ...
// ist notwendig, aber nicht Teil des ersten Entwurfs"). In-Memory statt Redis/DB, weil
// das Deployment (ADR 0009) aus einem einzelnen API-Prozess auf einem VPS besteht -
// bei mehreren Instanzen müsste das durch einen gemeinsamen Store ersetzt werden.
const WINDOW_MS = 10 * 60 * 1000;
const PHONE_LIMIT = 3;
const IP_LIMIT = 5;

const requestsByPhone = new Map<string, number[]>();
const requestsByIp = new Map<string, number[]>();

let callsSincePrune = 0;

function recordAndCheck(
  store: Map<string, number[]>,
  key: string,
  limit: number,
  now: number,
): boolean {
  const recent = (store.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (recent.length >= limit) {
    store.set(key, recent);
    return true;
  }

  recent.push(now);
  store.set(key, recent);
  return false;
}

function pruneExpired(store: Map<string, number[]>, now: number): void {
  for (const [key, timestamps] of store) {
    if (timestamps.every((timestamp) => now - timestamp >= WINDOW_MS)) {
      store.delete(key);
    }
  }
}

// Gibt true zurück, wenn die Anfrage (nach Telefonnummer ODER IP) abgelehnt werden soll.
// Zählt in jedem Fall für beide Grenzwerte, auch wenn bereits einer von beiden greift -
// sonst könnte man den IP-Grenzwert umgehen, indem man nach einer geblockten Nummer
// einfach weiter neue Nummern von derselben IP durchprobiert.
export function isOtpRequestRateLimited(phoneNumber: string, ip: string): boolean {
  const now = Date.now();

  const phoneLimited = recordAndCheck(requestsByPhone, phoneNumber, PHONE_LIMIT, now);
  const ipLimited = recordAndCheck(requestsByIp, ip, IP_LIMIT, now);

  callsSincePrune += 1;
  if (callsSincePrune >= 500) {
    callsSincePrune = 0;
    pruneExpired(requestsByPhone, now);
    pruneExpired(requestsByIp, now);
  }

  return phoneLimited || ipLimited;
}
