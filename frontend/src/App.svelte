<script lang="ts">
  import { onMount } from 'svelte';
  import { Router, Route, navigate } from 'svelte-routing';
  import { user, loading, initAuth, showLoginPage } from './stores/auth';
  import { loadSettings, applyTheme } from './stores/settings';
  import { tabs, activeTabId, openTab } from './stores/tabs';
  import NoteEditorPage from './pages/NoteEditorPage.svelte';
  import LoginPage from './pages/LoginPage.svelte';
  import LandingPage from './pages/LandingPage.svelte';
  import NotesHomePage from './pages/NotesHomePage.svelte';
  import NotesSettingsPage from './pages/NotesSettingsPage.svelte';
  import NotesSearchPage from './pages/NotesSearchPage.svelte';
  import NotesGraphPage from './pages/NotesGraphPage.svelte';
  import NotesTemplatesPage from './pages/NotesTemplatesPage.svelte';
  import TodosPage from './pages/TodosPage.svelte';
  import NoteTabBar from './components/NoteTabBar.svelte';
  import DocRoute from './components/DocRoute.svelte';
  import BlogListPage from './pages/BlogListPage.svelte';
  import BlogPostPage from './pages/BlogPostPage.svelte';
  import AdminSettingsPage from './pages/admin/AdminSettingsPage.svelte';
  import AboutPage from './pages/AboutPage.svelte';

  export let url = '';

  // Reserved app paths that are never treated as blog routes
  const RESERVED = new Set(['', 'login', 'search', 'graph', 'settings', 'templates', 'todos', 'doc', 'admin', 'about']);

  function isBlogRoute(path: string): boolean {
    const clean = path.split('?')[0].replace(/^\//, '');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length === 0) return false;
    if (RESERVED.has(parts[0])) return false;
    return parts.length <= 2;
  }

  function isAppRoute(path: string): boolean {
    const first = path.split('?')[0].replace(/^\//, '').split('/')[0];
    return RESERVED.has(first);
  }

  // Use window.location.pathname (not the url prop, which is '' when App is root)
  let currentPath = window.location.pathname;
  function syncPath() { currentPath = window.location.pathname; }

  let lastUrl = '';

  // On direct load at /login (e.g. after nginx serves index.html for /login),
  // immediately show login page without needing a click.
  if (typeof window !== 'undefined' && window.location.pathname === '/login') {
    showLoginPage.set(true);
  }

  function syncActiveTabFromUrl() {
    const path = window.location.pathname;
    if (path.startsWith('/doc/')) {
      const docId = path.split('/doc/')[1];
      if (docId) activeTabId.set(docId);
    } else {
      activeTabId.set(null);
    }
  }

  onMount(async () => {
    await initAuth();
    window.addEventListener('popstate', () => { syncActiveTabFromUrl(); syncPath(); });
    return () => window.removeEventListener('popstate', syncActiveTabFromUrl);
  });

  // Watch URL changes to sync activeTabId with current route
  $: if ($user && url !== lastUrl) {
    lastUrl = url;
    if (url.startsWith('/doc/')) {
      // Ensure this doc is open as a tab
      const docId = url.split('/doc/')[1];
      if (docId && !$tabs.find(t => t.id === docId)) {
        openTab(docId);
      }
      activeTabId.set(docId || null);
    } else {
      // Non-doc page — hide editor overlay but keep tabs alive
      activeTabId.set(null);
    }
  }

  $: if ($user) {
    loadSettings();
    const pathname = window.location.pathname;
    if (!isAppRoute(pathname) && !isBlogRoute(pathname)) {
      navigate('/');
    }
  }
</script>

{#if isBlogRoute(currentPath)}
  {@const blogParts = currentPath.replace(/^\//, '').split('/')}
  {#if blogParts.length === 2}
    <BlogPostPage username={blogParts[0]} slug={blogParts[1]} />
  {:else}
    <BlogListPage username={blogParts[0]} />
  {/if}

{:else if $loading}
  <div class="notes-loading-screen">
    <div class="notes-logo">
      <img src="/SvaraMind%20Logo.png" alt="Svaramind" class="svaramind-logo" style="height:36px;object-fit:contain" />
    </div>
    <div class="spinner-sm" style="width:28px;height:28px;border-width:3px;margin-top:24px"></div>
  </div>

{:else if !$user}
  {#if $showLoginPage}
    <LoginPage />
  {:else}
    <LandingPage />
  {/if}
{:else}
  <!-- Tab Editor Overlay: rendered as fixed layer above everything -->
  <!-- Only the active tab is visible; switching tabs is instant CSS toggle -->
  {#each $tabs as tab (tab.id)}
    <div style="display:{tab.id === $activeTabId ? 'block' : 'none'};position:fixed;inset:0;z-index:10;overflow:auto;background:var(--bg-primary);">
      <NoteEditorPage docId={tab.id} />
    </div>
  {/each}

  <!-- Router for non-editor pages (home, search, graph, settings, etc.) -->
  <!-- When on these pages, $activeTabId is null so all editor overlays are hidden -->
  <Router {url}>
    <Route path="/" component={NotesHomePage} />
    <Route path="/search" component={NotesSearchPage} />
    <Route path="/graph" component={NotesGraphPage} />
    <Route path="/settings" component={NotesSettingsPage} />
    <Route path="/templates" component={NotesTemplatesPage} />
    <Route path="/todos" component={TodosPage} />
    <Route path="/admin" component={AdminSettingsPage} />
    <Route path="/about" component={AboutPage} />
    <Route path="/doc/:id" component={DocRoute} />
  </Router>
{/if}

<style>
  .notes-loading-screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    gap: 0;
  }

  .notes-logo {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .notes-logo-text {
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .reset-overlay {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
    padding: 20px;
  }
  .reset-card {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 40px 48px;
    width: 100%; max-width: 400px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.08);
    display: flex; flex-direction: column; align-items: center;
  }
  .reset-title {
    font-size: 20px; font-weight: 700;
    color: var(--text-primary); margin-bottom: 20px;
  }
  .reset-error {
    font-size: 13px; color: #ef476f;
    background: rgba(239,71,111,0.1); border: 1px solid rgba(239,71,111,0.2);
    border-radius: 8px; padding: 10px 14px;
    width: 100%; margin-bottom: 16px;
  }
  .reset-input {
    width: 100%; padding: 11px 14px;
    border: 1.5px solid var(--border-color); border-radius: 10px;
    background: var(--bg-secondary); color: var(--text-primary);
    font-size: 14px; font-family: inherit; outline: none;
    margin-bottom: 12px; transition: border-color 0.2s;
  }
  .reset-input:focus { border-color: var(--accent-color); }
  .reset-btn {
    width: 100%; padding: 12px;
    background: var(--accent-color); color: #fff;
    border: none; border-radius: 10px;
    font-size: 14px; font-weight: 600;
    cursor: pointer; font-family: inherit;
    margin-top: 4px; transition: opacity 0.2s;
  }
  .reset-btn:hover { opacity: 0.88; }
</style>
