<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { documentApi } from '../lib/api';

  export let documentId: string;
  export let visible = false;

  const dispatch = createEventDispatcher();

  let versions: any[] = [];
  let loading = false;
  let selectedVersion: any = null;

  $: if (visible && documentId) {
    loadVersions();
  }

  async function loadVersions() {
    loading = true;
    try {
      const { versions: data } = await documentApi.getVersions(documentId);
      versions = data || [];
    } catch {}
    loading = false;
  }

  async function restoreVersion(v: any) {
    if (!confirm(`Restore version ${v.version_number}? Your current content will be replaced.`)) return;
    try {
      const { document } = await documentApi.restoreVersion(documentId, v.id);
      dispatch('restore', { document });
    } catch (err: any) {
      alert(`Error restoring: ${err.message}`);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
</script>

{#if visible}
  <div class="version-panel slide-in-right">
    <div class="version-header">
      <h6><i class="bi bi-clock-history"></i> Version History</h6>
      <button class="icon-btn" on:click={() => dispatch('close')}><i class="bi bi-x-lg"></i></button>
    </div>

    <div class="version-list">
      {#if loading}
        <div class="text-center p-4"><div class="spinner-sm" style="margin:0 auto;width:24px;height:24px;border-width:3px"></div></div>
      {:else if versions.length === 0}
        <div class="empty-state">
          <i class="bi bi-clock" style="font-size:2rem;color:var(--text-muted)"></i>
          <p>No versions saved yet.</p>
          <p class="hint">Versions are saved automatically on significant changes.</p>
        </div>
      {:else}
        {#each versions as version}
          <div
            class="version-item {selectedVersion?.id === version.id ? 'selected' : ''}"
            on:click={() => selectedVersion = version}
          >
            <div class="version-badge">v{version.version_number}</div>
            <div class="version-info">
              <div class="version-title">{version.title || 'Untitled'}</div>
              <div class="version-meta">
                <span>{formatDate(version.created_at)}</span>
                {#if version.word_count}<span>· {version.word_count} words</span>{/if}
              </div>
              {#if version.change_summary}
                <div class="version-summary">{version.change_summary}</div>
              {/if}
            </div>
            <button class="restore-btn" on:click|stopPropagation={() => restoreVersion(version)}>
              Restore
            </button>
          </div>
        {/each}
      {/if}
    </div>

    {#if selectedVersion}
      <div class="version-preview">
        <div class="preview-header">Preview: v{selectedVersion.version_number}</div>
        <div class="preview-content">{selectedVersion.content_text?.slice(0, 300) || 'No preview available'}...</div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .version-panel {
    width: 300px;
    height: 100%;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .version-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color);
  }
  .version-header h6 { margin: 0; font-size: 14px; display: flex; align-items: center; gap: 6px; }

  .version-list { flex: 1; overflow-y: auto; padding: 8px; }

  .version-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.1s;
    border: 1px solid transparent;
  }
  .version-item:hover { background: var(--bg-hover); }
  .version-item.selected { border-color: var(--accent-color); background: var(--bg-active); }

  .version-badge {
    background: var(--accent-color);
    color: #fff;
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .version-info { flex: 1; min-width: 0; }
  .version-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .version-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
  .version-summary { font-size: 11px; color: var(--text-secondary); margin-top: 4px; font-style: italic; }

  .restore-btn {
    background: none;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
    color: var(--accent-color);
    flex-shrink: 0;
    white-space: nowrap;
  }
  .restore-btn:hover { background: var(--bg-active); }

  .version-preview {
    border-top: 1px solid var(--border-color);
    padding: 12px;
    background: var(--bg-primary);
  }
  .preview-header { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .preview-content { font-size: 12px; color: var(--text-secondary); line-height: 1.5; white-space: pre-wrap; }

  .empty-state { text-align: center; padding: 32px 16px; color: var(--text-secondary); }
  .empty-state p { margin: 8px 0; font-size: 13px; }
  .empty-state .hint { font-size: 11px; color: var(--text-muted); }

  .icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 4px; color: var(--text-muted); display: flex; align-items: center; }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .text-center { text-align: center; }
  .p-4 { padding: 16px; }
</style>
