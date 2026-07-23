<script lang="ts">
  import { onMount } from 'svelte';
  import { tabs, activeTabId, goToNote, closeTab } from '../stores/tabs';
  import { navigate } from 'svelte-routing';

  let showSwitcher = false;
  let isMobile = false;

  function checkMobile() { isMobile = window.innerWidth <= 768; }

  onMount(() => {
    checkMobile();
  });

  function handleTabClick(id: string) {
    goToNote(id);
    showSwitcher = false;
  }

  function handleClose(e: Event, id: string) {
    e.stopPropagation();
    e.preventDefault();
    closeTab(id);
  }

  function goHome() {
    activeTabId.set(null);
    navigate('/');
    showSwitcher = false;
  }

  function openSwitcher() {
    showSwitcher = true;
  }

  function closeSwitcher() {
    showSwitcher = false;
  }
</script>

<svelte:window on:resize={checkMobile} />

{#if $tabs.length > 0}
  <!-- Desktop: horizontal scrollable tab bar -->
  {#if !isMobile}
    <div class="tab-bar">
      <div class="tabs-container">
        {#each $tabs as tab (tab.id)}
          <button
            class="tab-item {tab.id === $activeTabId ? 'active' : ''}"
            on:click={() => handleTabClick(tab.id)}
            title={tab.title}
          >
            <i class="bi {tab.icon}"></i>
            <span class="tab-title">{tab.title}</span>
            <span class="tab-close" on:click={(e) => handleClose(e, tab.id)} role="button" tabindex="0">
              <i class="bi bi-x"></i>
            </span>
          </button>
        {/each}
      </div>
      <button class="home-btn" on:click={goHome} title="Go to Home">
        <i class="bi bi-house"></i>
      </button>
    </div>

  <!-- Mobile: tab count button + switcher overlay -->
  {:else}
    <div class="tab-bar-mobile">
      <button class="tab-count-btn" on:click={openSwitcher}>
        <i class="bi bi-tabs"></i>
        <span>{$tabs.length} tab{$tabs.length !== 1 ? 's' : ''}</span>
      </button>
      <button class="home-btn" on:click={goHome}>
        <i class="bi bi-house"></i>
      </button>
    </div>

    <!-- Tab Switcher Overlay (Chrome Android style) -->
    {#if showSwitcher}
      <div class="switcher-overlay" on:click|self={closeSwitcher} role="dialog" aria-modal="true">
        <div class="switcher-header">
          <span class="switcher-title">{$tabs.length} open tab{$tabs.length !== 1 ? 's' : ''}</span>
          <button class="switcher-close" on:click={closeSwitcher}>
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="switcher-grid">
          {#each $tabs as tab (tab.id)}
            <button
              class="switcher-card {tab.id === $activeTabId ? 'active' : ''}"
              on:click={() => handleTabClick(tab.id)}
            >
              <div class="switcher-card-icon">
                <i class="bi {tab.icon}"></i>
              </div>
              <div class="switcher-card-info">
                <span class="switcher-card-title">{tab.title}</span>
              </div>
              <button
                class="switcher-card-close"
                on:click={(e) => { e.stopPropagation(); handleClose(e, tab.id); }}
                title="Close tab"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </button>
          {/each}
        </div>
        <div class="switcher-footer">
          <button class="switcher-new" on:click={() => { goHome(); }}>
            <i class="bi bi-plus-lg"></i>
            <span>New note</span>
          </button>
        </div>
      </div>
    {/if}
  {/if}
{/if}

<style>
  .tab-bar {
    display: flex;
    align-items: center;
    height: 34px;
    background: var(--bg-secondary, #f8f9fa);
    border-bottom: 1px solid var(--border-color, #dee2e6);
    padding: 0 8px;
    gap: 4px;
    overflow: hidden;
  }

  .tabs-container {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 2px;
    scrollbar-width: none;
  }

  .tabs-container::-webkit-scrollbar {
    display: none;
  }

  .tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 30px;
    min-width: 0;
    max-width: 200px;
    background: transparent;
    border: none;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary, #6c757d);
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
    position: relative;
  }

  .tab-item:hover {
    background: var(--bg-hover, rgba(0,0,0,0.05));
    color: var(--text-primary, #212529);
  }

  .tab-item.active {
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #212529);
    border-top: 2px solid var(--accent-color, #132578);
  }

  .tab-item.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-color, #132578);
  }

  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    margin-left: 2px;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
  }

  .tab-close:hover {
    opacity: 1;
    background: var(--bg-hover, rgba(0,0,0,0.1));
  }

  .home-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary, #6c757d);
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .home-btn:hover {
    background: var(--bg-hover, rgba(0,0,0,0.05));
    color: var(--text-primary, #212529);
  }

  /* Mobile tab bar */
  .tab-bar-mobile {
    display: flex;
    align-items: center;
    height: 34px;
    background: var(--bg-secondary, #f8f9fa);
    border-bottom: 1px solid var(--border-color, #dee2e6);
    padding: 0 8px;
    gap: 4px;
  }

  .tab-count-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    height: 28px;
    padding: 0 12px;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-primary, #212529);
    font-weight: 500;
  }

  .tab-count-btn:hover {
    background: var(--bg-hover, rgba(0,0,0,0.05));
  }

  /* Tab Switcher Overlay */
  .switcher-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: var(--bg-primary, #fff);
    display: flex;
    flex-direction: column;
  }

  .switcher-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #dee2e6);
    background: var(--bg-secondary, #f8f9fa);
  }

  .switcher-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #212529);
  }

  .switcher-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 18px;
    color: var(--text-secondary, #6c757d);
  }

  .switcher-close:hover {
    background: var(--bg-hover, rgba(0,0,0,0.08));
  }

  .switcher-grid {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    align-content: start;
  }

  .switcher-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 12px;
    background: var(--bg-secondary, #f8f9fa);
    border: 2px solid var(--border-color, #dee2e6);
    border-radius: 10px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    position: relative;
    min-height: 100px;
  }

  .switcher-card:hover {
    border-color: var(--accent-color, #132578);
    background: var(--bg-primary, #fff);
  }

  .switcher-card.active {
    border-color: var(--accent-color, #132578);
    background: var(--bg-primary, #fff);
  }

  .switcher-card-icon {
    font-size: 28px;
    color: var(--accent-color, #132578);
  }

  .switcher-card-info {
    text-align: center;
    width: 100%;
  }

  .switcher-card-title {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-primary, #212529);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.3;
  }

  .switcher-card-close {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 50%;
    cursor: pointer;
    font-size: 11px;
    color: var(--text-secondary, #6c757d);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .switcher-card:hover .switcher-card-close,
  .switcher-card.active .switcher-card-close {
    opacity: 1;
  }

  .switcher-card-close:hover {
    background: #fee2e2;
    color: #ef4444;
    border-color: #fca5a5;
  }

  .switcher-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border-color, #dee2e6);
    background: var(--bg-secondary, #f8f9fa);
  }

  .switcher-new {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 44px;
    background: var(--accent-color, #132578);
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  }

  .switcher-new:hover {
    opacity: 0.9;
  }
</style>