<script lang="ts">
  import { linksApi } from '../lib/api';
  import { goToNote } from '../stores/tabs';

  export let documentId: string;

  let backlinks: any[] = [];
  let loading = false;
  let expanded = false;
  let loaded = false;

  async function loadBacklinks() {
    if (loaded) return;
    loading = true;
    try {
      const { backlinks: data } = await linksApi.getBacklinks(documentId);
      backlinks = data || [];
      loaded = true;
    } catch {}
    loading = false;
  }

  function toggle() {
    expanded = !expanded;
    if (expanded && !loaded) loadBacklinks();
  }

  function refresh() {
    loaded = false;
    loadBacklinks();
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
</script>

<div class="backlinks-wrap">
  <!-- Expandable list -->
  {#if expanded}
    <div class="backlinks-body">
      {#if loading}
        <div class="bl-empty">
          <div class="spinner-sm" style="width:16px;height:16px;border-width:2px;margin:0 auto"></div>
        </div>
      {:else if backlinks.length === 0}
        <div class="bl-empty">
          <i class="bi bi-arrow-left-right"></i>
          <span>No backlinks yet. Link here from another note using <code>[[{documentId.slice(0,8)}…]]</code></span>
        </div>
      {:else}
        {#each backlinks as link}
          <button class="bl-item" on:click={() => goToNote(link.id)}>
            <i class="bi {link.icon || 'bi-file-text'} bl-icon"></i>
            <span class="bl-title">{link.title}</span>
            <span class="bl-date">{formatDate(link.updated_at)}</span>
            <i class="bi bi-arrow-right bl-arrow"></i>
          </button>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Toggle bar -->
  <button class="bl-bar" on:click={toggle}>
    <div class="bl-bar-left">
      <i class="bi bi-arrow-left-right"></i>
      <span>Backlinks</span>
      {#if loaded && backlinks.length > 0}
        <span class="bl-count">{backlinks.length}</span>
      {/if}
    </div>
    <div class="bl-bar-right">
      {#if loading}
        <span class="spinner-sm" style="width:12px;height:12px;border-width:2px"></span>
      {:else if expanded}
        <button class="bl-refresh" on:click|stopPropagation={refresh} title="Refresh">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      {/if}
      <i class="bi bi-chevron-{expanded ? 'down' : 'up'}"></i>
    </div>
  </button>
</div>

<style>
  .backlinks-wrap {
    border-top: 1px solid var(--border-color);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  /* ── Toggle bar ── */
  .bl-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 7px 64px;
    border: none;
    background: none;
    cursor: pointer;
    transition: background 0.1s;
  }
  .bl-bar:hover { background: var(--bg-hover); }

  .bl-bar-left {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .bl-bar-left i { font-size: 12px; }

  .bl-count {
    background: var(--accent-color);
    color: #fff;
    font-size: 10px;
    padding: 0px 5px;
    border-radius: 8px;
    font-weight: 700;
    line-height: 1.6;
  }

  .bl-bar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .bl-refresh {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    font-size: 11px;
  }
  .bl-refresh:hover { color: var(--accent-color); }

  /* ── Expanded list ── */
  .backlinks-body {
    max-height: 200px;
    overflow-y: auto;
    border-bottom: 1px solid var(--border-color);
    animation: slideDown 0.15s ease;
  }

  @keyframes slideDown {
    from { opacity: 0; max-height: 0; }
    to   { opacity: 1; max-height: 200px; }
  }

  .bl-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 64px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .bl-empty i { flex-shrink: 0; }
  code { background: var(--bg-primary); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 11px; }

  .bl-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 64px;
    border: none;
    border-bottom: 1px solid var(--border-color);
    background: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }
  .bl-item:last-child { border-bottom: none; }
  .bl-item:hover { background: var(--bg-hover); }
  .bl-item:hover .bl-arrow { opacity: 1; }

  .bl-icon  { font-size: 13px; color: var(--accent-color); flex-shrink: 0; }
  .bl-title { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bl-date  { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
  .bl-arrow { font-size: 11px; color: var(--text-muted); opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
</style>
