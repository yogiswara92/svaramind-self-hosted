<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { shareApi } from '../lib/api';

  export let documentId: string;
  export let documentTitle = '';

  const dispatch = createEventDispatcher();

  let collaborators: any[] = [];
  let loading = false;
  let inviteEmail = '';
  let inviteRole = 'editor';
  let inviting = false;
  let copied = false;
  let error = '';

  async function load() {
    loading = true;
    try {
      const { collaborators: data } = await shareApi.getCollaborators(documentId);
      collaborators = data || [];
    } catch {}
    loading = false;
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    inviting = true;
    error = '';
    try {
      const { collaborator } = await shareApi.addCollaborator(documentId, { email: inviteEmail, role: inviteRole });
      collaborators = [...collaborators, collaborator];
      inviteEmail = '';
    } catch (err: any) {
      error = err.message;
    }
    inviting = false;
  }

  async function removeCollaborator(c: any) {
    if (!confirm(`Remove ${c.email} from this note?`)) return;
    try {
      await shareApi.removeCollaborator(documentId, c.id);
      collaborators = collaborators.filter(x => x.id !== c.id);
    } catch {}
  }

  async function copyLink() {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  const ROLE_LABELS: Record<string, string> = {
    viewer: 'Can view',
    commenter: 'Can comment',
    editor: 'Can edit',
    owner: 'Owner'
  };

  load();
</script>

<div class="notes-modal-overlay" on:click|self={() => dispatch('close')} role="dialog">
  <div class="notes-modal" style="max-width:500px;padding:28px">
    <div class="modal-header">
      <h5><i class="bi bi-share"></i> Share "{documentTitle}"</h5>
      <button class="icon-btn" on:click={() => dispatch('close')}><i class="bi bi-x-lg"></i></button>
    </div>

    <!-- Invite -->
    <div class="invite-section">
      <label class="notes-label">Invite People</label>
      <div class="invite-row">
        <input class="notes-input" bind:value={inviteEmail} placeholder="Email address" type="email" />
        <select class="notes-input role-select" bind:value={inviteRole}>
          <option value="viewer">Viewer</option>
          <option value="commenter">Commenter</option>
          <option value="editor">Editor</option>
        </select>
        <button class="notes-btn notes-btn-primary" on:click={invite} disabled={inviting || !inviteEmail.trim()}>
          {#if inviting}<span class="spinner-sm"></span>{:else}Invite{/if}
        </button>
      </div>
      {#if error}<p class="error-text">{error}</p>{/if}
    </div>

    <!-- Collaborators list -->
    {#if loading}
      <div class="text-center p-3"><div class="spinner-sm" style="margin:0 auto"></div></div>
    {:else if collaborators.length > 0}
      <div class="collab-list">
        <label class="notes-label">People with access</label>
        {#each collaborators as c}
          <div class="collab-item">
            <div class="collab-avatar">{(c.email || '?')[0].toUpperCase()}</div>
            <div class="collab-info">
              <span class="collab-name">{c.profiles?.full_name || c.email}</span>
              <span class="collab-email">{c.email}</span>
            </div>
            <span class="role-badge">{ROLE_LABELS[c.role] || c.role}</span>
            {#if c.role !== 'owner'}
              <button class="icon-btn" on:click={() => removeCollaborator(c)} title="Remove">
                <i class="bi bi-x"></i>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="no-collab">Only you have access.</p>
    {/if}

    <!-- Copy link -->
    <div class="copy-link-row">
      <button class="notes-btn notes-btn-ghost" on:click={copyLink} style="width:100%">
        {#if copied}
          <i class="bi bi-check-circle"></i> Link copied!
        {:else}
          <i class="bi bi-link-45deg"></i> Copy link to note
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .modal-header h5 { margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }

  .invite-section { margin-bottom: 20px; }

  .invite-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .role-select { width: 120px; flex-shrink: 0; }

  .error-text { color: var(--danger-color); font-size: 12px; margin-top: 4px; }

  .collab-list { margin-bottom: 16px; }

  .collab-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-color);
  }
  .collab-item:last-child { border-bottom: none; }

  .collab-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .collab-info { flex: 1; min-width: 0; }
  .collab-name { display: block; font-size: 13px; font-weight: 500; }
  .collab-email { display: block; font-size: 11px; color: var(--text-muted); }

  .role-badge {
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
  }

  .no-collab { font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px 0; }

  .copy-link-row { margin-top: 12px; }

  .icon-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: var(--text-muted); display: flex; align-items: center; }
  .icon-btn:hover { background: var(--bg-hover); color: var(--danger-color); }

  .text-center { text-align: center; }
  .p-3 { padding: 12px; }
</style>
