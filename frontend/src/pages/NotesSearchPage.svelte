<script lang="ts">
  import { navigate } from 'svelte-routing';
  import NotesLayout from '../components/NotesLayout.svelte';
  import { searchApi, aiApi } from '../lib/api';
  import { currentWorkspace, tags } from '../stores/notes';
  import { goToNote } from '../stores/tabs';

  let query = '';
  let results: any[] = [];
  let loading = false;
  let searched = false;
  let selectedTags: string[] = [];
  let searchMode: 'fulltext' | 'semantic' = 'fulltext';
  let semanticFallback = false;
  let filtersOpen = false;

  async function search() {
    if (!query.trim() || !$currentWorkspace) return;
    loading = true;
    searched = true;
    semanticFallback = false;

    try {
      if (searchMode === 'semantic') {
        const { results: data, fallback } = await aiApi.semanticSearch(query, $currentWorkspace.id, 20);
        if (fallback || data === null) {
          // Embedding unavailable — fall back to FTS
          semanticFallback = true;
          const { results: ftsData } = await searchApi.search({ q: query, workspace_id: $currentWorkspace.id, limit: 20 });
          results = ftsData || [];
        } else {
          results = data || [];
        }
      } else {
        const { results: data } = await searchApi.search({ q: query, workspace_id: $currentWorkspace.id, limit: 30 });
        results = data || [];
      }
    } catch {}
    loading = false;
  }

  function highlightMatch(text: string, q: string): string {
    if (!q || !text) return text || '';
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }
</script>

<NotesLayout currentPage="search">
  <div class="search-page">
    <div class="search-page-header">
      <h2><i class="bi bi-search"></i> Advanced Search</h2>
    </div>

    <div class="search-page-content">
      <!-- Search form -->
      <div class="search-form">
        <!-- Mode toggle -->
        <div class="search-mode-toggle">
          <button class="mode-btn {searchMode === 'fulltext' ? 'active' : ''}" on:click={() => searchMode = 'fulltext'}>
            <i class="bi bi-fonts"></i> Full-text
          </button>
          <button class="mode-btn {searchMode === 'semantic' ? 'active' : ''}" on:click={() => searchMode = 'semantic'}>
            <i class="bi bi-stars"></i> Semantic (AI)
          </button>
        </div>
        {#if searchMode === 'semantic'}
          <p class="mode-hint">
            <i class="bi bi-info-circle"></i>
            Semantic search uses AI embeddings to find conceptually related notes — not just exact keywords.
            {#if semanticFallback}<span class="fallback-notice"> (Fell back to full-text — embeddings not available)</span>{/if}
          </p>
        {/if}

        <div class="search-input-row">
          <i class="bi bi-search search-icon"></i>
          <input
            class="search-main-input"
            bind:value={query}
            placeholder={searchMode === 'semantic' ? 'Describe what you\'re looking for...' : 'Search across all your notes...'}
            on:keydown={(e) => e.key === 'Enter' && search()}
            autofocus
          />
          <button class="notes-btn notes-btn-primary" on:click={search} disabled={loading || !query.trim()}>
            {#if loading}<span class="spinner-sm"></span>{:else}<i class="bi bi-search"></i>{/if}
            Search
          </button>
        </div>

        <!-- Filter pills - Tags (collapsible) -->
        {#if $tags.length > 0}
          <div class="filter-toggle-row">
            <button class="filter-toggle-btn" on:click={() => filtersOpen = !filtersOpen}>
              <i class="bi bi-funnel"></i>
              Filter by tag
              {#if selectedTags.length > 0}<span class="filter-badge">{selectedTags.length}</span>{/if}
              <i class="bi bi-chevron-{filtersOpen ? 'up' : 'down'}" style="margin-left:auto;font-size:11px"></i>
            </button>
          </div>
          {#if filtersOpen}
            <div class="filter-row">
              {#each $tags as tag}
                <button
                  class="filter-tag {selectedTags.includes(tag.id) ? 'selected' : ''}"
                  style="--tag-color: {tag.color}"
                  on:click={() => {
                    selectedTags = selectedTags.includes(tag.id)
                      ? selectedTags.filter(t => t !== tag.id)
                      : [...selectedTags, tag.id];
                  }}
                >
                  #{tag.name}
                </button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Results -->
      {#if loading}
        <div class="search-loading">
          <div class="spinner-sm" style="width:28px;height:28px;border-width:3px;margin:0 auto 12px"></div>
          <p>Searching...</p>
        </div>
      {:else if searched && results.length === 0}
        <div class="no-results">
          <i class="bi bi-search" style="font-size:3rem;color:var(--text-muted)"></i>
          <h4>No results for "{query}"</h4>
          <p>Try different keywords or check spelling</p>
        </div>
      {:else if results.length > 0}
        <div class="results-summary">
          Found <strong>{results.length}</strong> result{results.length !== 1 ? 's' : ''} for "<strong>{query}</strong>"
        </div>
        <div class="search-results">
          {#each results as result}
            <button class="result-card" on:click={() => goToNote(result.id)}>
              <div class="result-icon"><i class="bi {result.icon || 'bi-file-text'}"></i></div>
              <div class="result-main">
                <h4 class="result-title">{@html highlightMatch(result.title, query)}</h4>
                {#if result.content_text}
                  <p class="result-excerpt">{@html highlightMatch(result.content_text.slice(0, 200), query)}...</p>
                {/if}
                <div class="result-meta">
                  <span class="result-date"><i class="bi bi-calendar3"></i> {formatDate(result.updated_at)}</span>
                  {#if result.rank}
                    <span class="result-relevance">
                      <i class="bi bi-graph-up"></i> {(result.rank * 100).toFixed(0)}% match
                    </span>
                  {/if}
                </div>
              </div>
              <i class="bi bi-arrow-right result-arrow"></i>
            </button>
          {/each}
        </div>
      {:else if !searched}
        <div class="search-hint">
          <div class="hint-grid">
            <div class="hint-card notes-card">
              <i class="bi bi-file-text" style="font-size:1.5rem;color:var(--accent-color)"></i>
              <h5>Full-text search</h5>
              <p>Search by keywords across all note content</p>
            </div>
            <div class="hint-card notes-card">
              <i class="bi bi-tags" style="font-size:1.5rem;color:var(--success-color)"></i>
              <h5>Filter by tags</h5>
              <p>Narrow results by selecting tags above</p>
            </div>
            <div class="hint-card notes-card">
              <i class="bi bi-sort-down" style="font-size:1.5rem;color:var(--info-color)"></i>
              <h5>Ranked results</h5>
              <p>Results sorted by relevance score</p>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</NotesLayout>

<style>
  .search-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .search-page-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }
  .search-page-header h2 { margin: 0; font-size: 1.2rem; display: flex; align-items: center; gap: 10px; }

  .search-page-content { flex: 1; overflow-y: auto; padding: 24px; max-width: 800px; }

  .search-mode-toggle {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 14px;
    border: 1px solid var(--border-color);
    background: none;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    transition: all 0.15s;
  }
  .mode-btn:hover { border-color: var(--accent-color); color: var(--accent-color); }
  .mode-btn.active { background: var(--accent-color); color: #fff; border-color: transparent; }

  .mode-hint {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 12px;
    display: flex;
    align-items: flex-start;
    gap: 5px;
  }

  .fallback-notice { color: var(--warning-color); font-style: italic; }

  .search-form {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 20px;
    margin-bottom: 24px;
  }

  .search-input-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .search-icon { font-size: 18px; color: var(--text-muted); }

  .search-main-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 16px;
    color: var(--text-primary);
    font-family: inherit;
  }
  .search-main-input::placeholder { color: var(--text-muted); }

  .filter-toggle-row {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border-color);
  }
  .filter-toggle-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    padding: 0;
    width: 100%;
    transition: color 0.15s;
  }
  .filter-toggle-btn:hover { color: var(--text-primary); }
  .filter-badge {
    background: var(--accent-color);
    color: #fff;
    border-radius: 10px;
    padding: 0 6px;
    font-size: 10px;
    font-weight: 700;
  }

  .filter-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .filter-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }

  .filter-tag {
    padding: 4px 10px;
    border-radius: 14px;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    transition: all 0.15s;
  }
  .filter-tag:hover { border-color: var(--tag-color, var(--accent-color)); color: var(--tag-color, var(--accent-color)); }
  .filter-tag.selected { background: var(--tag-color, var(--accent-color)); color: #fff; border-color: transparent; }

  .search-loading, .no-results, .search-hint {
    text-align: center;
    padding: 40px;
    color: var(--text-secondary);
  }

  .no-results h4 { font-size: 1.1rem; margin: 12px 0 6px; }
  .no-results p { font-size: 13px; color: var(--text-muted); }

  .results-summary {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  .search-results { display: flex; flex-direction: column; gap: 10px; }

  .result-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 16px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    width: 100%;
  }
  .result-card:hover { border-color: var(--accent-color); box-shadow: var(--shadow-sm); }

  .result-icon { font-size: 1.2rem; flex-shrink: 0; color: var(--accent-color); display: flex; align-items: center; }

  .result-main { flex: 1; min-width: 0; }

  .result-title { font-size: 15px; font-weight: 600; margin: 0 0 6px; color: var(--text-primary); }
  .result-title :global(mark) { background: #fef08a; border-radius: 2px; padding: 0 2px; font-weight: inherit; }

  .result-excerpt { font-size: 13px; color: var(--text-secondary); margin: 0 0 8px; line-height: 1.5; }
  .result-excerpt :global(mark) { background: #fef08a; border-radius: 2px; padding: 0 2px; }

  .result-meta { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); }
  .result-relevance { color: var(--success-color); }

  .result-arrow { color: var(--text-muted); font-size: 16px; flex-shrink: 0; margin-top: 4px; }

  .hint-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    text-align: left;
  }

  .hint-card {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint-card h5 { font-size: 14px; font-weight: 600; margin: 4px 0 0; }
  .hint-card p { font-size: 12px; color: var(--text-muted); margin: 0; }

  @media (max-width: 768px) {
    .search-page { height: auto; }
    .search-page-header { padding: 12px 16px; border-bottom: 1px solid var(--border-color); }
    .search-page-header h2 { font-size: 1.1rem; }

    .search-page-content { padding: 16px; max-width: 100%; }

    .search-form { padding: 14px; margin-bottom: 16px; }

    .search-mode-toggle { gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
    .mode-btn { padding: 5px 11px; font-size: 11px; }

    .mode-hint { font-size: 11px; margin-bottom: 10px; }

    .search-input-row { gap: 8px; flex-wrap: wrap; }
    .search-icon { display: none; }

    .search-main-input { font-size: 15px; }

    .filter-row { gap: 6px; margin-top: 10px; padding-top: 10px; }
    .filter-label { font-size: 11px; }
    .filter-tag { padding: 3px 8px; font-size: 11px; }

    .search-loading, .no-results, .search-hint { padding: 24px 16px; }

    .result-card { padding: 12px; gap: 10px; }
    .result-title { font-size: 14px; }
    .result-excerpt { font-size: 12px; }
    .result-meta { gap: 10px; font-size: 11px; }

    .hint-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .hint-card { padding: 14px; gap: 6px; }
    .hint-card h5 { font-size: 13px; }
    .hint-card p { font-size: 11px; }
  }
</style>
