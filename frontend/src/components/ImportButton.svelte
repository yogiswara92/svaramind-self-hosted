<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { documentApi } from '../lib/api';
  import { currentWorkspace } from '../stores/notes';
  import { goToNote } from '../stores/tabs';

  export let folderId: string | undefined = undefined;

  const dispatch = createEventDispatcher();

  let importing = false;
  let error = '';
  let fileInput: HTMLInputElement;

  function openPicker() {
    error = '';
    fileInput.click();
  }

  async function handleFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !$currentWorkspace) return;

    importing = true;
    error = '';
    try {
      const { document } = await documentApi.import(file, $currentWorkspace.id, folderId);
      dispatch('imported', document);
      goToNote(document.id);
    } catch (err: any) {
      error = err.message || 'Import failed';
    } finally {
      importing = false;
      fileInput.value = '';
    }
  }
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.md,.markdown"
  style="display:none"
  on:change={handleFile}
/>

<button
  class="import-btn"
  on:click={openPicker}
  disabled={importing}
  title="Import PDF, Word, Excel, PowerPoint, or Markdown"
>
  {#if importing}
    <span class="spinner-sm" style="width:14px;height:14px;border-width:2px"></span>
    Importing...
  {:else}
    <i class="bi bi-upload"></i>
    Import
  {/if}
</button>

{#if error}
  <div class="import-error"><i class="bi bi-exclamation-circle"></i> {error}</div>
{/if}

<style>
  .import-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .import-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--accent-color); }
  .import-btn:disabled { opacity: 0.6; cursor: default; }

  .import-error {
    font-size: 12px;
    color: var(--danger-color, #e74c3c);
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
</style>
