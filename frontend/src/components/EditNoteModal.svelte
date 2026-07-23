<script lang="ts">
  import { onMount } from 'svelte';
  import { tags, folders, loadDocuments, currentWorkspace } from '../stores/notes';
  import { tagApi, documentApi } from '../lib/api';

  export let isOpen = false;
  export let doc: any = null;
  let selectedTagIds: string[] = [];
  let selectedFolderId: string = '';
  let isSaving = false;

  onMount(() => {
    if (doc?.notes_document_tags) {
      selectedTagIds = doc.notes_document_tags
        .map((dt: any) => dt.tag_id || dt.notes_tags?.id)
        .filter((id: any) => id);
    }
    selectedFolderId = doc?.folder_id || '';
  });

  $: if (doc) {
    if (doc?.notes_document_tags) {
      selectedTagIds = doc.notes_document_tags
        .map((dt: any) => dt.tag_id || dt.notes_tags?.id)
        .filter((id: any) => id);
    }
    selectedFolderId = doc?.folder_id || '';
  }

  function toggleTag(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      selectedTagIds = selectedTagIds.filter(id => id !== tagId);
    } else {
      selectedTagIds = [...selectedTagIds, tagId];
    }
  }

  async function handleSave() {
    if (!doc) return;
    isSaving = true;

    try {
      // Get original tag IDs for comparison
      const originalTagIds = (doc?.notes_document_tags || [])
        .map((dt: any) => dt.tag_id || dt.notes_tags?.id)
        .filter((id: any) => id);

      // Update tags if changed
      const tagsChanged =
        selectedTagIds.length !== originalTagIds.length ||
        selectedTagIds.some((id: string) => !originalTagIds.includes(id));

      if (tagsChanged) {
        await tagApi.setDocumentTags(doc.id, selectedTagIds);
      }

      // Update folder if changed
      const newFolderId = selectedFolderId || null;
      if (doc.folder_id !== newFolderId) {
        await documentApi.update(doc.id, { folder_id: newFolderId });
      }

      // Reload documents
      if ($currentWorkspace) {
        await loadDocuments($currentWorkspace.id);
      }

      isOpen = false;
    } catch (err) {
      console.error('Error saving changes:', err);
      alert('Failed to save changes');
    } finally {
      isSaving = false;
    }
  }

  function handleClose() {
    isOpen = false;
  }
</script>

{#if isOpen && doc}
  <div class="modal-overlay" on:click={handleClose}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Edit Note</h3>
        <button class="modal-close" on:click={handleClose} title="Close">
          <i class="bi bi-x"></i>
        </button>
      </div>

      <div class="modal-body">
        <!-- Tags Section -->
        <div class="edit-section">
          <label class="section-label">Tags</label>
          <div class="tags-list">
            {#if $tags.length === 0}
              <p class="empty-text">No tags available</p>
            {:else}
              {#each $tags as tag}
                <button
                  class="tag-checkbox {selectedTagIds.includes(tag.id) ? 'selected' : ''}"
                  on:click={() => toggleTag(tag.id)}
                  style="border-color: {tag.color}22; background: {selectedTagIds.includes(tag.id) ? tag.color + '22' : 'transparent'}"
                >
                  <input
                    type="checkbox"
                    checked={selectedTagIds.includes(tag.id)}
                    on:change={() => toggleTag(tag.id)}
                    style="accent-color: {tag.color}"
                  />
                  <span style="color: {tag.color}">{tag.name}</span>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Folder Section -->
        <div class="edit-section">
          <label class="section-label">Folder</label>
          <select value={selectedFolderId} on:change={(e) => selectedFolderId = e.currentTarget.value} class="folder-select">
            <option value="">No folder</option>
            {#each $folders as folder}
              <option value={folder.id}>{folder.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" on:click={handleClose}>Cancel</button>
        <button class="btn-save" on:click={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }

  .modal-content {
    background: var(--bg-primary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-lg);
    max-width: 400px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .modal-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 18px;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .modal-close:hover {
    color: var(--text-primary);
  }

  .modal-body {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
  }

  .edit-section {
    margin-bottom: 20px;
  }

  .edit-section:last-child {
    margin-bottom: 0;
  }

  .section-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
  }

  .tags-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-text {
    color: var(--text-muted);
    font-size: 13px;
    margin: 0;
    padding: 8px;
  }

  .tag-checkbox {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary);
    font-family: inherit;
    transition: all 0.15s;
    text-align: left;
  }

  .tag-checkbox:hover {
    border-color: var(--text-secondary);
  }

  .tag-checkbox.selected {
    border-width: 1.5px;
  }

  .tag-checkbox input {
    cursor: pointer;
    flex-shrink: 0;
  }

  .tag-checkbox span {
    font-weight: 500;
  }

  .folder-select {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-secondary);
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .folder-select:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .modal-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border-color);
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  .btn-cancel {
    padding: 10px 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s;
  }

  .btn-cancel:hover {
    background: var(--bg-hover);
  }

  .btn-save {
    padding: 10px 16px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent-color);
    color: white;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s;
  }

  .btn-save:hover:not(:disabled) {
    background: var(--accent-hover, #0091b9);
  }

  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
