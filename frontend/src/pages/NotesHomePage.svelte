<script lang="ts">
  import { navigate } from 'svelte-routing';
  import { onMount } from 'svelte';
  import NotesLayout from '../components/NotesLayout.svelte';
  import SearchModal from '../components/SearchModal.svelte';
  import ImportButton from '../components/ImportButton.svelte';
  import EditNoteModal from '../components/EditNoteModal.svelte';
  import {
    documents, loadingDocs, currentWorkspace,
    createDocument, deleteDocument, saveDocument,
    activeFolder, folders
  } from '../stores/notes';
  import { user } from '../stores/auth';
  import { goToNote } from '../stores/tabs';

  let showSearch = false;
  let viewMode: 'grid' | 'list' = (localStorage.getItem('notes_view') as 'grid' | 'list') || 'grid';
  let sortBy: 'updated' | 'title' | 'created' = (localStorage.getItem('notes_sort') as any) || 'updated';
  let openMenuId: string | null = null;
  let openMenuDoc: any = null;
  let openMenuIsPinned = false;
  let menuPos = { top: 0, right: 0 };
  let showEditModal = false;
  let editingDoc: any = null;
  let activeFolderName: string | null = null;
  let folderSelectorDoc: any = null;
  let folderSelectorPos = { top: 0, left: 0 };

  function toggleMenu(e: Event, doc: any, isPinned = false) {
    e.stopPropagation();
    if (openMenuId === doc.id) { openMenuId = null; return; }
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menuPos = { top: btn.bottom + 4, right: window.innerWidth - btn.right };
    openMenuId = doc.id;
    openMenuDoc = doc;
    openMenuIsPinned = isPinned;
  }
  function closeMenu() { openMenuId = null; openMenuDoc = null; }

  function openFolderSelector(doc: any, e: Event) {
    e.stopPropagation();
    folderSelectorDoc = doc;
    const el = (e.currentTarget as HTMLElement).getBoundingClientRect();
    folderSelectorPos = { top: el.bottom + 4, left: el.left };
  }

  function closeFolderSelector() {
    folderSelectorDoc = null;
  }

  async function changeFolderForNote(doc: any, newFolderId: string | null) {
    await saveDocument(doc.id, { folder_id: newFolderId });
    closeFolderSelector();
  }

  function openEditModal(doc: any, e: Event) {
    e.stopPropagation();
    editingDoc = { ...doc };
    showEditModal = true;
    closeMenu();
  }

  $: localStorage.setItem('notes_view', viewMode);
  $: localStorage.setItem('notes_sort', sortBy);
  $: activeFolderName = $activeFolder ? $folders.find(f => f.id === $activeFolder)?.name : null;

  onMount(() => {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        showSearch = true;
      }
    });
  });

  async function newNote() {
    if (!$currentWorkspace) return;
    const doc = await createDocument($currentWorkspace.id, $activeFolder || undefined);
    goToNote(doc.id);
  }

  function getFolderName(folderId: string | null | undefined): string | null {
    if (!folderId) return null;
    return $folders.find(f => f.id === folderId)?.name || null;
  }

  async function togglePin(doc: any, e: Event) {
    e.stopPropagation();
    await saveDocument(doc.id, { is_pinned: !doc.is_pinned });
  }

  async function archiveNote(doc: any, e: Event) {
    e.stopPropagation();
    if (!confirm(`Archive "${doc.title}"?`)) return;
    await saveDocument(doc.id, { is_archived: true });
  }

  async function handleDelete(doc: any, e: Event) {
    e.stopPropagation();
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    await deleteDocument(doc.id);
  }

  function formatDate(d: string) {
    const date = new Date(d);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function getPreview(doc: any): string {
    if (!doc.content_text) return 'No content';
    return doc.content_text.slice(0, 120).replace(/\n/g, ' ') + (doc.content_text.length > 120 ? '...' : '');
  }

  function sortDocuments(docs: any[]) {
    return [...docs].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }

  $: sorted = sortBy && sortDocuments($documents.filter(d => !d.is_archived));
  $: pinned = sorted.filter(d => d.is_pinned);
  $: unpinned = sorted.filter(d => !d.is_pinned);
</script>

<svelte:window on:click={() => { closeMenu(); closeFolderSelector(); }} />
<NotesLayout currentPage="home">
  <div class="home-page">
    <!-- Header -->
    <div class="home-header">
      <div class="home-title-row">
        {#if $currentWorkspace}
          <i class="bi {$currentWorkspace.icon} workspace-icon"></i>
          <h2 class="workspace-title">{$currentWorkspace.name}</h2>
        {:else}
          <h2 class="workspace-title">My Notes</h2>
        {/if}
      </div>

      <div class="home-actions">
        <!-- Search bar -->
        <button class="search-trigger" on:click={() => showSearch = true}>
          <i class="bi bi-search"></i>
          <span>Search notes...</span>
          <kbd>⌘K</kbd>
        </button> 

        <!-- Sort -->
        <select class="notes-input sort-select" bind:value={sortBy} style="width:auto;height:36px">
          <option value="updated">Recently edited</option>
          <option value="created">Newest</option>
          <option value="title">Title A-Z</option>
        </select>

        <!-- View mode -->
        <div class="view-toggle">
          <button class="view-btn {viewMode === 'grid' ? 'active' : ''}" on:click={() => viewMode = 'grid'} title="Grid view">
            <i class="bi bi-grid"></i>
          </button>
          <button class="view-btn {viewMode === 'list' ? 'active' : ''}" on:click={() => viewMode = 'list'} title="List view">
            <i class="bi bi-list-ul"></i>
          </button>
        </div>

        <!-- Import & New note -->
        <ImportButton folderId={$activeFolder || undefined} />
        <button class="notes-btn notes-btn-primary" on:click={newNote}>
          <i class="bi bi-plus-lg"></i> New Note
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="home-content">
      {#if $loadingDocs}
        <div class="loading-state">
          <div class="spinner-sm" style="width:32px;height:32px;border-width:3px;margin:0 auto 12px"></div>
          <p>Loading notes...</p>
        </div>
      {:else if !$currentWorkspace}
        <!-- No workspace -->
        <div class="empty-state">
          <div class="empty-icon"><i class="bi bi-journals"></i></div>
          <h3>Welcome to Svaramind</h3>
          <p>Create your first workspace to start writing AI-powered notes</p>
          <button class="notes-btn notes-btn-primary" on:click={() => navigate('/')}>
            Get Started
          </button>
        </div>
      {:else if $documents.length === 0}
        <!-- Empty workspace -->
        <div class="empty-state">
          <div class="empty-icon"><i class="bi bi-pencil-square"></i></div>
          <h3>No notes yet</h3>
          <p>Create your first note and let AI help you write smarter</p>
          <button class="notes-btn notes-btn-primary" on:click={newNote}>
            <i class="bi bi-plus-lg"></i> Create your first note
          </button>
        </div>
      {:else}
        <!-- Pinned section -->
        {#if pinned.length > 0}
          <section class="note-section">
            <div class="section-header">
              <i class="bi bi-pin-fill" style="color:var(--accent-color)"></i>
              <h4>Pinned</h4>
            </div>
            <div class="notes-{viewMode}">
              {#each pinned as doc}
                <div class="note-card {viewMode}" on:click={() => goToNote(doc.id)}>
                  {#if doc.cover_image}
                    <div class="note-cover" style="background-image:url({doc.cover_image})"></div>
                  {/if}
                  <div class="note-body">
                    <div class="note-icon-title">
                      <i class="bi {doc.icon} note-icon"></i>
                      <h5 class="note-title">{doc.title}</h5>
                    </div>
                    {#if viewMode === 'grid' && doc.content_text}
                      <p class="note-preview">{getPreview(doc)}</p>
                    {/if}
                    <div class="note-meta">
                      <span class="note-date">{formatDate(doc.updated_at)}</span>
                      {#if doc.word_count > 0}
                        <span class="note-words">{doc.word_count} words</span>
                      {/if}
                      <button class="note-folder" on:click={(e) => openFolderSelector(doc, e)}>
                        📁 {getFolderName(doc.folder_id) || '-'}
                      </button>
                    </div>
                    {#if doc.notes_document_tags?.length > 0}
                      <div class="note-tags">
                        {#each (doc.notes_document_tags || []).slice(0, 2) as dt}
                          {#if dt.notes_tags}
                            <span class="note-tag" style="background:{dt.notes_tags.color}22;color:{dt.notes_tags.color}">
                              #{dt.notes_tags.name}
                            </span>
                          {/if}
                        {/each}
                        {#if doc.notes_document_tags.length > 2}
                          <span class="note-tag-more">+{doc.notes_document_tags.length - 2}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                  <!-- Actions -->
                  <div class="note-menu-wrap" on:click|stopPropagation>
                    <button class="note-menu-btn" on:click={(e) => toggleMenu(e, doc, true)} title="More">
                      <i class="bi bi-three-dots-vertical"></i>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- All notes section -->
        <section class="note-section">
          <div class="section-header">
            <i class="bi bi-journal-text"></i>
            <h4>
              {$activeFolder ? `Notes in folder: ${activeFolderName}` : 'All Notes'}
              <span class="count">{unpinned.length}</span>
            </h4>
          </div>

          {#if unpinned.length === 0}
            <div class="empty-folder">
              <i class="bi bi-journal-plus" style="font-size:2rem;color:var(--text-muted)"></i>
              <p>No notes here. <button class="link-btn" on:click={newNote}>Create one</button></p>
            </div>
          {:else}
            <div class="notes-{viewMode}">
              {#each unpinned as doc}
                <div class="note-card {viewMode}" on:click={() => goToNote(doc.id)}>
                  {#if doc.cover_image && viewMode === 'grid'}
                    <div class="note-cover" style="background-image:url({doc.cover_image})"></div>
                  {/if}
                  <div class="note-body">
                    <div class="note-icon-title">
                      <i class="bi {doc.icon} note-icon"></i>
                      <h5 class="note-title">{doc.title}</h5>
                    </div>
                    {#if viewMode === 'grid' && doc.content_text}
                      <p class="note-preview">{getPreview(doc)}</p>
                    {/if}
                    <div class="note-meta">
                      <span class="note-date">{formatDate(doc.updated_at)}</span>
                      {#if doc.word_count > 0}
                        <span class="note-words">{doc.word_count} words</span>
                      {/if}
                      <button class="note-folder" on:click={(e) => openFolderSelector(doc, e)}>
                        📁 {getFolderName(doc.folder_id) || '-'}
                      </button>
                    </div>
                    {#if doc.notes_document_tags?.length > 0}
                      <div class="note-tags">
                        {#each (doc.notes_document_tags || []).slice(0, 2) as dt}
                          {#if dt.notes_tags}
                            <span class="note-tag" style="background:{dt.notes_tags.color}22;color:{dt.notes_tags.color}">
                              #{dt.notes_tags.name}
                            </span>
                          {/if}
                        {/each}
                        {#if doc.notes_document_tags.length > 2}
                          <span class="note-tag-more">+{doc.notes_document_tags.length - 2}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                  <div class="note-menu-wrap" on:click|stopPropagation>
                    <button class="note-menu-btn" on:click={(e) => toggleMenu(e, doc, false)} title="More">
                      <i class="bi bi-three-dots-vertical"></i>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </div>

  <SearchModal bind:visible={showSearch} on:close={() => showSearch = false} />
  <EditNoteModal bind:isOpen={showEditModal} doc={editingDoc} />
</NotesLayout>

{#if openMenuDoc}
  <div
    class="note-menu-fixed"
    style="top:{menuPos.top}px;right:{menuPos.right}px"
    on:click|stopPropagation
  >
    <button on:click={(e) => openEditModal(openMenuDoc, e)}>
      <i class="bi bi-pencil"></i> Edit
    </button>
    <button on:click={(e) => { togglePin(openMenuDoc, e); closeMenu(); }}>
      <i class="bi bi-{openMenuIsPinned ? 'pin-fill' : 'pin'}" style={openMenuIsPinned ? 'color:var(--accent-color)' : ''}></i>
      {openMenuIsPinned ? 'Unpin' : 'Pin'}
    </button>
    <button on:click={(e) => { archiveNote(openMenuDoc, e); closeMenu(); }}>
      <i class="bi bi-archive"></i> Archive
    </button>
    <button class="danger" on:click={(e) => { handleDelete(openMenuDoc, e); closeMenu(); }}>
      <i class="bi bi-trash"></i> Delete
    </button>
  </div>
{/if}

{#if folderSelectorDoc}
  <div class="folder-selector-overlay" role="presentation" on:click={closeFolderSelector} on:keydown={(e) => e.key === 'Escape' && closeFolderSelector()}>
    <div class="folder-selector" style="top:{folderSelectorPos.top}px;left:{folderSelectorPos.left}px" on:click|stopPropagation>
      <button class="fs-item" on:click={() => changeFolderForNote(folderSelectorDoc, null)}>
        <i class="bi bi-folder-x"></i> No folder
      </button>
      {#each $folders as folder}
        <button class="fs-item {folderSelectorDoc.folder_id === folder.id ? 'active' : ''}" on:click={() => changeFolderForNote(folderSelectorDoc, folder.id)}>
          <i class="bi {folder.icon || 'bi-folder2'}"></i> {folder.name}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .home-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .home-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .home-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .workspace-icon { font-size: 1.5rem; flex-shrink: 0; }
  .workspace-title { font-size: 1.2rem; font-weight: 700; margin: 0; }

  .home-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .search-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    cursor: pointer;
    font-size: 13px;
    color: var(--text-muted);
    transition: all 0.15s;
  }
  .search-trigger:hover { border-color: var(--accent-color); background: var(--bg-primary); color: var(--text-primary); }
  .search-trigger kbd {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 11px;
    margin-left: 8px;
    color: var(--text-muted);
  }

  .sort-select { height: 36px; }

  .view-toggle {
    display: flex;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .view-btn {
    padding: 7px 10px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-secondary);
    transition: all 0.1s;
  }
  .view-btn:hover { background: var(--bg-hover); }
  .view-btn.active { background: var(--bg-active); color: var(--accent-color); }

  .home-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }

  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 60vh;
    text-align: center;
  }

  .empty-icon { font-size: 4rem; margin-bottom: 16px; color: var(--text-muted); line-height: 1; }
  .empty-state h3 { font-size: 1.3rem; margin-bottom: 8px; }
  .empty-state p { color: var(--text-secondary); margin-bottom: 20px; }

  .note-section { margin-bottom: 28px; }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }
  .section-header h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    background: var(--bg-secondary);
    color: var(--text-muted);
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
  }

  .notes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }

  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .note-card {
    position: relative;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s;
  }

  .note-card:hover {
    border-color: var(--accent-color);
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .note-card.list {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
  }
  .note-card.list .note-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }
  .note-card.list .note-preview { display: none; }
  .note-card.list .note-icon-title { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 0; }
  .note-card.list .note-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note-card.list .note-meta { margin-top: 0; }
  .note-card.list .note-tags { margin-top: 2px; }

  .note-cover {
    height: 100px;
    background-size: cover;
    background-position: center;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    overflow: hidden;
  }

  .note-body { padding: 14px; }

  .note-icon-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .note-icon { font-size: 1.1rem; flex-shrink: 0; }

  .note-title {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    line-height: 1.3;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .note-preview {
    font-size: 12px;
    color: var(--text-muted);
    margin: 6px 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .note-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }

  .note-date, .note-words, .note-folder { font-size: 11px; color: var(--text-muted); white-space: nowrap; }

  .note-tags {
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
    margin-top: 5px;
    overflow: hidden;
  }
  .note-tag {
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
    flex-shrink: 0;
  }
  .note-tag-more {
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
    padding: 1px 5px;
    border-radius: 10px;
    background: var(--bg-hover);
  }

  /* Kebab menu */
  .note-menu-wrap {
    position: relative;
    flex-shrink: 0;
    margin-left: auto;
  }
  .note-card.grid .note-menu-wrap {
    position: absolute;
    top: 8px; right: 8px;
    margin-left: 0;
  }

  .note-menu-btn {
    width: 28px; height: 28px;
    border-radius: var(--radius-sm);
    border: none; background: none;
    cursor: pointer;
    color: var(--text-muted);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    transition: all 0.15s;
    opacity: 0;
  }
  .note-card:hover .note-menu-btn,
  .note-menu-btn:focus { opacity: 1; }
  .note-card.list .note-menu-btn { opacity: 1; }
  .note-menu-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

  .note-menu-fixed {
    position: fixed;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    z-index: 9999;
    min-width: 130px;
    overflow: hidden;
  }
  .note-menu-fixed button {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 9px 14px;
    border: none; background: none;
    cursor: pointer; font-size: 13px;
    color: var(--text-secondary);
    font-family: inherit;
    transition: background 0.1s;
    text-align: left;
  }
  .note-menu-fixed button:hover { background: var(--bg-hover); color: var(--text-primary); }
  .note-menu-fixed button.danger:hover { background: #fee2e2; color: var(--danger-color); }

  .folder-selector-overlay {
    position: fixed;
    inset: 0;
    z-index: 9998;
  }

  .folder-selector {
    position: fixed;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    z-index: 9999;
    min-width: 160px;
    max-width: 220px;
    overflow-y: auto;
    max-height: 300px;
  }

  .fs-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 14px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    font-family: inherit;
    text-align: left;
    transition: background 0.1s;
  }

  .fs-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .fs-item.active {
    background: var(--bg-active);
    color: var(--accent-color);
    font-weight: 500;
  }

  .note-folder {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 12px;
    transition: color 0.1s;
  }

  .note-folder:hover {
    color: var(--accent-color);
  }

  .empty-folder {
    text-align: center;
    padding: 32px;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .link-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--accent-color);
    font-size: inherit;
    padding: 0;
    text-decoration: underline;
  }

  @media (max-width: 768px) {
    .home-header {
      padding: 10px 12px;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .home-title-row { gap: 8px; }
    .workspace-title { font-size: 1.05rem; }

    /* Search full-width on its own row */
    .home-actions {
      width: 100%;
      flex-wrap: wrap;
      gap: 6px;
    }

    .search-trigger {
      width: 100%;
      order: -1;
      min-width: 0;
    }
    .search-trigger kbd { display: none; }
    .search-trigger span { font-size: 13px; }

    /* Sort + view toggle on same row */
    .sort-select { flex: 1; font-size: 13px; height: 34px; }
    .view-toggle { flex-shrink: 0; }

    /* New Note button full-width */
    .home-actions .notes-btn-primary { width: 100%; justify-content: center; }

    /* Grid: single column */
    .notes-grid { grid-template-columns: 1fr; }

    .home-content { padding: 12px; }

    /* Note card: reduce padding */
    .note-card.list { padding: 8px 10px; }

    /* Note meta: hide word count on mobile */
    .note-words { display: none; }

    /* Tags even smaller on mobile */
    .note-tag { font-size: 9px; padding: 1px 5px; max-width: 80px; }
    .note-tag-more { font-size: 9px; padding: 1px 4px; }
  }
</style>
