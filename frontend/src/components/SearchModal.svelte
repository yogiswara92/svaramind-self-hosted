<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { searchApi } from '../lib/api';
  import { currentWorkspace } from '../stores/notes';
  import { goToNote } from '../stores/tabs';

  export let visible = false;

  const dispatch = createEventDispatcher();

  let query = '';
  let results: any[] = [];
  let loading = false;
  let searchTimeout: any;

  $: if (visible) {
    setTimeout(() => document.getElementById('search-input')?.focus(), 50);
  }

  function handleInput() {
    clearTimeout(searchTimeout);
    if (!query.trim() || !$currentWorkspace) { results = []; return; }
    searchTimeout = setTimeout(doSearch, 300);
  }

  async function doSearch() {
    if (!query.trim() || !$currentWorkspace) return;
    loading = true;
    try {
      const { results: data } = await searchApi.search({ q: query, workspace_id: $currentWorkspace.id, limit: 20 });
      results = data || [];
    } catch {}
    loading = false;
  }

  function openDoc(id: string) {
    goToNote(id);
    close();
  }

  function close() {
    visible = false;
    query = '';
    results = [];
    dispatch('close');
  }

  function highlightMatch(text: string, q: string): string {
    if (!q || !text) return text || '';
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

{#if visible}
  <div class="search-overlay" on:click|self={close} role="dialog" aria-modal="true">
    <div class="search-modal">
      <!-- Input -->
      <div class="search-input-row">
        <i class="bi bi-search search-icon"></i>
        <input
          id="search-input"
          class="search-input"
          bind:value={query}
          on:input={handleInput}
          on:keydown={(e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter') doSearch(); }}
          placeholder="Search your notes..."
          autocomplete="off"
          spellcheck="false"
        />
        {#if loading}
          <span class="spinner-sm"></span>
        {:else if query}
          <button class="clear-search" on:click={() => { query = ''; results = []; }}>
            <i class="bi bi-x-circle"></i>
          </button>
        {/if}
      </div>

      <!-- Results -->
      <div class="search-results">
        {#if results.length > 0}
          <div class="results-header">
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          </div>
          {#each results as result}
            <button class="result-item" on:click={() => openDoc(result.id)}>
              <div class="result-icon"><i class="bi {result.icon || 'bi-file-text'}"></i></div>
              <div class="result-content">
                <div class="result-title">{@html highlightMatch(result.title, query)}</div>
                {#if result.content_text}
                  <div class="result-excerpt">{@html highlightMatch(result.content_text.slice(0, 120), query)}...</div>
                {/if}
                <div class="result-meta">
                  <span>{formatDate(result.updated_at)}</span>
                  {#if result.rank}
                    <span class="relevance">Relevance: {(result.rank * 100).toFixed(0)}%</span>
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        {:else if query && !loading}
          <div class="no-results">
            <i class="bi bi-search" style="font-size:2rem;color:var(--text-muted)"></i>
            <p>No notes found for "<strong>{query}</strong>"</p>
            <p class="hint">Try different keywords or check spelling</p>
          </div>
        {:else if !query}
          <div class="search-tips">
            <p class="tips-title"><i class="bi bi-lightbulb"></i> Search tips</p>
            <ul>
              <li>Search by title, content, or tags</li>
              <li>Use quotes for exact phrases: <code>"meeting notes"</code></li>
              <li>Press <kbd>↑↓</kbd> to navigate results</li>
              <li>Press <kbd>Enter</kbd> to open</li>
            </ul>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="search-footer">
        <span class="kbd-hint"><kbd>↵</kbd> to open</span>
        <span class="kbd-hint"><kbd>Esc</kbd> to close</span>
        <button class="advanced-search-link" on:click={() => { close(); navigate('/search'); }}>
          Advanced Search →
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .search-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 80px 16px 16px;
    backdrop-filter: blur(3px);
  }

  .search-modal {
    width: 100%;
    max-width: 600px;
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    animation: modal-in 0.2s ease;
  }

  .search-input-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);
  }

  .search-icon { font-size: 18px; color: var(--text-muted); flex-shrink: 0; }

  .search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 16px;
    color: var(--text-primary);
    font-family: inherit;
  }
  .search-input::placeholder { color: var(--text-muted); }

  .clear-search {
    background: none; border: none; cursor: pointer;
    color: var(--text-muted); padding: 4px;
    display: flex; align-items: center;
  }

  .search-results {
    max-height: 60vh;
    overflow-y: auto;
  }

  .results-header {
    padding: 10px 20px 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .result-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 20px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.1s;
  }
  .result-item:hover { background: var(--bg-hover); }

  .result-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 2px; color: var(--accent-color); }

  .result-content { flex: 1; min-width: 0; }

  .result-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .result-title :global(mark) { background: #fef08a; border-radius: 2px; padding: 0 2px; }

  .result-excerpt {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 2px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .result-excerpt :global(mark) { background: #fef08a; border-radius: 2px; padding: 0 2px; }

  .result-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .relevance { color: var(--success-color); }

  .no-results {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-secondary);
  }
  .no-results p { margin: 8px 0; }
  .no-results .hint { font-size: 12px; color: var(--text-muted); }

  .search-tips {
    padding: 20px;
    color: var(--text-secondary);
    font-size: 13px;
  }
  .tips-title { font-weight: 600; color: var(--text-primary); margin-bottom: 10px; display: flex; gap: 6px; align-items: center; }
  .search-tips ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .search-tips li::before { content: '→'; margin-right: 6px; color: var(--accent-color); }
  code { background: var(--bg-secondary); padding: 1px 5px; border-radius: 3px; font-family: monospace; }
  kbd {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 11px;
    font-family: inherit;
    color: var(--text-secondary);
  }

  .search-footer {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    border-top: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .kbd-hint { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }

  .advanced-search-link {
    margin-left: auto;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 12px;
    color: var(--accent-color);
  }
  .advanced-search-link:hover { text-decoration: underline; }
</style>
