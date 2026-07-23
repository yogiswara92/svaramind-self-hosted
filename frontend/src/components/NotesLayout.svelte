<script lang="ts">
  import { onMount } from 'svelte';
  import NotesSidebar from './NotesSidebar.svelte';
  import GlobalAIChat from './GlobalAIChat.svelte';
  import { loadWorkspaces, currentWorkspace, loadFolders, loadDocuments, loadTags } from '../stores/notes';
  import { settings } from '../stores/settings';

  const COLLAPSED_W = 48; // icon-only width

  export let currentPage = 'home';

  // ── Mobile sidebar state ───────────────────────────────────────────────────
  let sidebarOpen = false;

  function toggleSidebar() { sidebarOpen = !sidebarOpen; }
  function closeSidebar() { sidebarOpen = false; }

  // ── Resizable + collapsible sidebar ─────────────────────────────────────────
  const MIN_W = 180;
  const MAX_W = 480;
  let sidebarWidth = parseInt(localStorage.getItem('notes_sidebar_w') || '260');
  let resizing = false;

  $: collapsed = $settings.sidebar_collapsed;

  function toggleCollapse() {
    // Update store directly for instant response, no API round-trip
    settings.update(s => ({ ...s, sidebar_collapsed: !s.sidebar_collapsed }));
  }

  function startResize(e: MouseEvent) {
    if (collapsed) return;
    e.preventDefault();
    resizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onMouseMove(e: MouseEvent) {
    if (!resizing) return;
    sidebarWidth = Math.max(MIN_W, Math.min(MAX_W, e.clientX));
  }

  function stopResize() {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('notes_sidebar_w', String(sidebarWidth));
  }

  let lastLoadedWorkspaceId: string | null = null;

  onMount(async () => {
    await loadWorkspaces();
    // loadWorkspaces() sets currentWorkspace from localStorage
    // Reactive statement below will handle loading folders/documents
  });

  $: if ($currentWorkspace?.id && $currentWorkspace.id !== lastLoadedWorkspaceId) {
    lastLoadedWorkspaceId = $currentWorkspace.id;
    Promise.all([
      loadFolders($currentWorkspace.id),
      loadDocuments($currentWorkspace.id),
      loadTags($currentWorkspace.id)
    ]);
  }
</script>

<svelte:window on:mousemove={onMouseMove} on:mouseup={stopResize} />

<div class="notes-app-layout">
  <!-- Mobile backdrop -->
  {#if sidebarOpen}
    <button class="mobile-backdrop" on:click={closeSidebar} aria-label="Close sidebar"></button>
  {/if}

  <!-- Sidebar with dynamic width (fixed on mobile) -->
  <div
    class="sidebar-wrapper {collapsed ? 'collapsed' : ''}"
    class:mobile-open={sidebarOpen}
    style={collapsed ? `width:${COLLAPSED_W}px;min-width:${COLLAPSED_W}px` : `width:${sidebarWidth}px;min-width:${sidebarWidth}px`}
  >
    <NotesSidebar {currentPage} on:navigate={closeSidebar} />
  </div>

  <!-- Resize/collapse handle (desktop only) -->
  <div
    class="resize-handle {resizing ? 'active' : ''} {collapsed ? 'collapsed-handle' : ''}"
    on:mousedown={startResize}
    title={collapsed ? 'Expand sidebar' : 'Drag to resize'}
  >
    <button class="collapse-btn" on:click={toggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      <i class="bi bi-chevron-{collapsed ? 'right' : 'left'}"></i>
    </button>
  </div>

  <main class="main-content">
    <!-- Mobile header bar -->
    <div class="mobile-header">
      <button class="hamburger-btn" on:click={toggleSidebar} title="Toggle sidebar" aria-label="Toggle sidebar">
        <i class="bi bi-list"></i>
      </button>
      <div class="mobile-logo">
        <img src="/SvaraMind Logo.png" alt="Svaramind" class="svaramind-logo" />
      </div>
      <div class="mobile-spacer"></div>
    </div>

    <slot />
  </main>
</div>

{#if !['editor', 'admin', 'settings'].includes(currentPage)}
  <GlobalAIChat />
{/if}

<style>
  .notes-app-layout {
    display: flex;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .sidebar-wrapper {
    height: 100%;
    flex-shrink: 0;
    overflow: hidden;
    transition: width 0.2s ease, min-width 0.2s ease;
  }

  /* Allow popups to escape the 48px collapsed sidebar */
  .sidebar-wrapper.collapsed {
    overflow: visible;
  }

  /* Make NotesSidebar fill the wrapper width */
  .sidebar-wrapper :global(.sidebar) {
    width: 100% !important;
    min-width: 100% !important;
  }

  .resize-handle {
    width: 4px;
    height: 100%;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    position: relative;
    z-index: 10;
    transition: background 0.15s, width 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    inset: 0;
    width: 8px;
    left: -2px;
  }
  .resize-handle:hover,
  .resize-handle.active {
    background: var(--accent-color);
  }

  /* Collapsed handle: same thin width, just no drag cursor */
  .resize-handle.collapsed-handle {
    width: 4px;
    cursor: default;
    background: var(--border-color);
  }

  /* Collapse toggle button — small pill floating on the handle */
  .collapse-btn {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 18px;
    height: 36px;
    border: 1px solid var(--border-color);
    border-radius: 9px;
    background: var(--bg-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    z-index: 11;
    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
    white-space: nowrap;
  }
  .resize-handle:hover .collapse-btn,
  .resize-handle.collapsed-handle:hover .collapse-btn {
    opacity: 1;
  }
  .collapse-btn:hover {
    color: var(--accent-color);
    border-color: var(--accent-color);
  }

  .main-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg-primary);
    position: relative;
  }

  /* Mobile header bar: hidden on desktop */
  .mobile-header {
    display: none;
  }

  /* Hamburger: hidden on desktop */
  .hamburger-btn {
    display: none;
  }

  /* Mobile backdrop */
  .mobile-backdrop {
    display: none;
    border: none;
    padding: 0;
    cursor: default;
  }

  /* ── Mobile styles ───────────────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .mobile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 48px;
      padding: 0 12px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-primary);
      flex-shrink: 0;
      z-index: 100;
    }

    .hamburger-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: var(--bg-secondary);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 18px;
      color: var(--text-primary);
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .hamburger-btn:hover { background: var(--bg-hover); }

    .mobile-logo {
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      height: 36px;
    }
    .mobile-logo img {
      height: 32px;
      width: auto;
      object-fit: contain;
    }

    .mobile-spacer {
      width: 36px;
      flex-shrink: 0;
    }

    .sidebar-wrapper {
      position: fixed;
      left: 0;
      top: 0;
      height: 100vh;
      height: 100dvh;
      width: 260px !important;
      min-width: 260px !important;
      z-index: 200;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
    }

    .sidebar-wrapper.mobile-open {
      transform: translateX(0);
    }

    .resize-handle {
      display: none;
    }

    .mobile-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      width: 100%;
      background: rgba(0, 0, 0, 0.4);
      z-index: 199;
    }
  }
</style>
