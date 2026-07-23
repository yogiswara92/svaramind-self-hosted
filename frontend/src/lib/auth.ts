// Standalone auth client: talks to this app's own backend (/api/auth/*)
// instead of a Svarabase/Supabase-style external auth server. Replaces
// src/lib/supabase.ts entirely.

const SESSION_KEY = 'svaramind_local_session';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  user_metadata: { full_name?: string; username?: string; avatar_url?: string };
}

interface Session {
  access_token: string;
  user: SessionUser;
}

function getApiBase(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return 'http://localhost:3002/api';
}

const API_BASE = getApiBase();

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(session: Session | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export function getAccessToken(): string | null {
  return getSession()?.access_token || null;
}

async function authFetch(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Auth error ${res.status}`);
  return body;
}

export async function signUpWithEmail(email: string, password: string): Promise<SessionUser> {
  const { user, access_token } = await authFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
  setSession({ user, access_token });
  return user;
}

export async function signInWithEmail(email: string, password: string): Promise<SessionUser> {
  const { user, access_token } = await authFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  setSession({ user, access_token });
  return user;
}

export async function signOut(): Promise<void> {
  try { await authFetch('/auth/logout', { method: 'POST' }); } catch { /* ignore - clearing local session regardless */ }
  setSession(null);
}

export async function fetchCurrentUser(): Promise<SessionUser | null> {
  if (!getAccessToken()) return null;
  try {
    const { user } = await authFetch('/auth/me');
    const session = getSession();
    if (session) setSession({ ...session, user });
    return user;
  } catch {
    setSession(null);
    return null;
  }
}

export async function updateProfile(updates: { full_name?: string; username?: string; avatar_url?: string }): Promise<SessionUser> {
  const { user } = await authFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify(updates) });
  const session = getSession();
  if (session) setSession({ ...session, user });
  return user;
}

export async function changePassword(newPassword: string): Promise<void> {
  await authFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ new_password: newPassword }) });
}

export async function getProfileByUsername(username: string): Promise<{ id: string; username: string; full_name: string; avatar_url: string } | null> {
  try {
    const { profile } = await authFetch(`/auth/profile/${encodeURIComponent(username)}`);
    return profile;
  } catch {
    return null;
  }
}

export async function uploadFile(path: string, file: Blob): Promise<string> {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  form.append('path', path);
  const res = await fetch(`${API_BASE}/storage/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Upload error ${res.status}`);
  // <img src> can't send an Authorization header, so the token rides along
  // as a query param - the backend's /api/storage/file/* route accepts both.
  const base = `${API_BASE.replace(/\/api$/, '')}${body.publicUrl}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
