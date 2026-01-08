const SESSION_KEY = 'family_tree_auth';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

interface Session {
  authenticated: boolean;
  timestamp: number;
}

export function createSession(): void {
  if (typeof window === 'undefined') return;

  const session: Session = {
    authenticated: true,
    timestamp: Date.now()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function checkSession(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return false;

    const session: Session = JSON.parse(stored);
    if (!session.authenticated) return false;

    const age = Date.now() - session.timestamp;
    if (age > SESSION_DURATION) {
      clearSession();
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export function refreshSession(): void {
  if (checkSession()) {
    createSession();
  }
}
