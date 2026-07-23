import { writable } from 'svelte/store';
import { navigate } from 'svelte-routing';

export interface Tab {
  id: string;
  title: string;
  icon: string;
}

const STORAGE_KEY = 'notes_open_tabs';
const MAX_TABS = 10;

function saveTabs(tabs: Tab[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.slice(-MAX_TABS)));
}

// Always start empty — tabs are restored lazily after user identity is confirmed.
// This prevents another user's tabs from leaking into a new session.
export const tabs = writable<Tab[]>([]);
export const activeTabId = writable<string | null>(null);

tabs.subscribe(saveTabs);

// Called by auth store after confirming the logged-in user matches the stored user.
export function restoreTabsForUser(userId: string) {
  const lastUserId = localStorage.getItem('notes_active_user');
  if (lastUserId !== userId) return; // different user — do not restore
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) tabs.set(JSON.parse(saved));
  } catch {}
}

export function openTab(id: string, title = 'Loading...', icon = 'bi-file-text') {
  tabs.update(t => {
    if (t.find(x => x.id === id)) return t;
    return [...t, { id, title, icon }];
  });
  activeTabId.set(id);
}

export function closeTab(id: string) {
  let nextId: string | null = null;
  tabs.update(t => {
    const idx = t.findIndex(x => x.id === id);
    if (idx === -1) return t;
    const result = t.filter((_, i) => i !== idx);
    if (result.length > 0) {
      nextId = result[Math.min(idx, result.length - 1)].id;
    }
    return result;
  });

  if (nextId) {
    activeTabId.set(nextId);
    navigate(`/doc/${nextId}`);
  } else {
    activeTabId.set(null);
    navigate('/');
  }
}

export function updateTab(id: string, patch: Partial<Tab>) {
  tabs.update(t => t.map(tab => (tab.id === id ? { ...tab, ...patch } : tab)));
}

export function goToNote(id: string, title?: string, icon?: string) {
  openTab(id, title, icon);
  navigate(`/doc/${id}`);
}

export function clearTabs() {
  tabs.set([]);
  activeTabId.set(null);
  localStorage.removeItem(STORAGE_KEY);
}
