import { writable, derived } from 'svelte/store';
import * as auth from '../lib/auth';
import { clearTabs, restoreTabsForUser } from './tabs';
import { clearNotesState } from './notes';

export const user = writable<any>(null);
export const loading = writable(true);
export const authError = writable<string | null>(null);
export const showLoginPage = writable(false);

export async function initAuth() {
  try {
    const session = auth.getSession();
    if (session) {
      // Show cached user immediately, then revalidate against the backend.
      restoreTabsForUser(session.user.id);
      localStorage.setItem('notes_active_user', session.user.id);
      user.set(session.user);

      const freshUser = await auth.fetchCurrentUser();
      if (freshUser) {
        user.set(freshUser);
      } else {
        // Token expired/invalid.
        clearTabs();
        clearNotesState();
        localStorage.removeItem('notes_active_user');
        user.set(null);
      }
    }
  } catch (err) {
    console.error('[Auth] initAuth error:', err);
  } finally {
    loading.set(false);
  }
}

export async function signInWithEmail(email: string, password: string) {
  authError.set(null);
  try {
    const signedInUser = await auth.signInWithEmail(email, password);
    const lastUserId = localStorage.getItem('notes_active_user');
    if (lastUserId && lastUserId !== signedInUser.id) {
      clearTabs();
      clearNotesState();
    }
    restoreTabsForUser(signedInUser.id);
    localStorage.setItem('notes_active_user', signedInUser.id);
    user.set(signedInUser);
    return signedInUser;
  } catch (err: any) {
    authError.set(err.message);
    throw err;
  }
}

export async function signUpWithEmail(email: string, password: string) {
  authError.set(null);
  try {
    const newUser = await auth.signUpWithEmail(email, password);
    localStorage.setItem('notes_active_user', newUser.id);
    user.set(newUser);
    return newUser;
  } catch (err: any) {
    authError.set(err.message);
    throw err;
  }
}

export async function updatePassword(newPassword: string) {
  authError.set(null);
  try {
    await auth.changePassword(newPassword);
  } catch (err: any) {
    authError.set(err.message);
    throw err;
  }
}

export async function signOut() {
  await auth.signOut();
  clearTabs();
  clearNotesState();
  localStorage.removeItem('notes_active_user');
  user.set(null);
  showLoginPage.set(false);
}

export const isAuthenticated = derived(user, $user => !!$user);
