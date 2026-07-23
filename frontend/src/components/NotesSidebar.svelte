<script lang="ts">
  import { navigate } from 'svelte-routing';
  import {
    workspaces, currentWorkspace, folderTree,
    activeFolder, selectWorkspace, createWorkspace, createFolder,
    deleteFolder, loadDocuments, createDocument
  } from '../stores/notes';
  import { workspaceApi, folderApi } from '../lib/api';
  import { user, signOut } from '../stores/auth';
  import { settings } from '../stores/settings';
  import { tabs, activeTabId, goToNote } from '../stores/tabs';

  export let currentPage = 'home';

  // ── Workspace dropdown ──────────────────────────────────────────────────────
  let showWorkspaceDropdown = false;
  let showNewWorkspaceModal = false;
  let showEditWorkspaceModal = false;
  let newWs = { name: '', icon: 'bi-journals', color: '#132578' };
  let editWs = { name: '', icon: 'bi-journals', color: '#132578' };

  // ── Folder state ─────────────────────────────────────────────────────────────
  let expandedFolders: Set<string> = new Set();
  let renamingFolderId: string | null = null;
  let renameFolderInput = '';
  let showNewFolderInput: string | null = null;
  let newFolderName = '';

  const WS_ICONS = [
    'bi-journals','bi-robot','bi-safe','bi-briefcase','bi-house','bi-cpu',
    'bi-flask','bi-palette','bi-rocket','bi-mortarboard','bi-building',
    'bi-globe','bi-star','bi-heart','bi-lightning','bi-shield'
  ];

  const ACCENT_COLORS = ['#132578','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#6b7280'];

  // ── Workspace ────────────────────────────────────────────────────────────────
  function toggleDropdown(e: MouseEvent) {
    e.stopPropagation();
    showWorkspaceDropdown = !showWorkspaceDropdown;
  }

  async function handleCreateWorkspace() {
    if (!newWs.name.trim()) return;
    const ws = await createWorkspace(newWs.name, newWs.icon, newWs.color);
    selectWorkspace(ws);
    showNewWorkspaceModal = false;
    newWs = { name: '', icon: 'bi-journals', color: '#132578' };
  }

  async function handleEditWorkspace() {
    if (!$currentWorkspace || !editWs.name.trim()) return;
    const { workspace } = await workspaceApi.update($currentWorkspace.id, editWs);
    workspaces.update(ws => ws.map(w => w.id === workspace.id ? { ...w, ...workspace } : w));
    currentWorkspace.set({ ...$currentWorkspace, ...workspace });
    showEditWorkspaceModal = false;
  }

  async function handleDeleteWorkspace() {
    if (!$currentWorkspace) return;
    if (!confirm(`Delete workspace "${$currentWorkspace.name}"? All notes will be permanently deleted.`)) return;
    await workspaceApi.delete($currentWorkspace.id);
    workspaces.update(ws => ws.filter(w => w.id !== $currentWorkspace?.id));
    const remaining = $workspaces.filter(w => w.id !== $currentWorkspace?.id);
    if (remaining.length > 0) selectWorkspace(remaining[0]);
    else currentWorkspace.set(null);
    showWorkspaceDropdown = false;
  }

  function openEdit() {
    editWs = { name: $currentWorkspace.name, icon: $currentWorkspace.icon || 'bi-journals', color: $currentWorkspace.color || '#132578' };
    showEditWorkspaceModal = true;
    showWorkspaceDropdown = false;
  }

  // ── Folders ──────────────────────────────────────────────────────────────────
  function toggleFolder(id: string) {
    if (expandedFolders.has(id)) expandedFolders.delete(id);
    else expandedFolders.add(id);
    expandedFolders = expandedFolders;
  }

  async function handleCreateFolder(parentId: string | null) {
    if (!newFolderName.trim() || !$currentWorkspace) return;
    await createFolder($currentWorkspace.id, newFolderName, parentId || undefined);
    showNewFolderInput = null;
    newFolderName = '';
  }

  async function handleRenameFolder(id: string) {
    if (!renameFolderInput.trim()) { renamingFolderId = null; return; }
    await folderApi.update(id, { name: renameFolderInput });
    renamingFolderId = null;
    if ($currentWorkspace) {
      const { folders: data } = await folderApi.list($currentWorkspace.id);
      const notesStores = await import('../stores/notes');
      notesStores.folders.set(data);
    }
  }

  async function handleDeleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}"?`)) return;
    await deleteFolder(id);
  }

  async function createNoteInFolder(folderId: string) {
    if (!$currentWorkspace) return;
    const doc = await createDocument($currentWorkspace.id, folderId);
    goToNote(doc.id);
  }

  function startRename(folder: any, e: Event) {
    e.stopPropagation();
    renamingFolderId = folder.id;
    renameFolderInput = folder.name;
  }

  function filterByFolder(folderId: string | null) {
    activeFolder.set(folderId);
    if ($currentWorkspace) loadDocuments($currentWorkspace.id, folderId ? { folder_id: folderId } : {});
    activeTabId.set(null);
    navigate('/');
  }

  const menuItems = [
    { id: 'home',      label: 'All Notes',         icon: 'bi-journal-text',    path: '/' },
    { id: 'todos',     label: 'To Do',             icon: 'bi-check2-square',   path: '/todos' },
    { id: 'search',    label: 'Search',             icon: 'bi-search',          path: '/search' },
    { id: 'graph',     label: 'Knowledge Graph',    icon: 'bi-diagram-3',       path: '/graph' },
    { id: 'templates', label: 'Templates',          icon: 'bi-grid-3x3-gap',    path: '/templates' }
  ];

  let showUserMenu = false;
  let showFolderPopup = false;
  let isMobile = false;
  if (typeof window !== 'undefined') {
    isMobile = window.innerWidth <= 768;
    window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });
  }

  // On mobile, always treat sidebar as expanded regardless of setting
  $: isCollapsed = $settings.sidebar_collapsed && !isMobile;

  function toggleUserMenu(e: MouseEvent) {
    e.stopPropagation();
    showUserMenu = !showUserMenu;
    showWorkspaceDropdown = false;
  }
</script>

<svelte:window on:click={() => { showWorkspaceDropdown = false; showUserMenu = false; showFolderPopup = false; }} />

<aside class="sidebar {isCollapsed ? 'collapsed' : ''}">

  <!-- ── Logo ── -->
  <div class="sidebar-logo">
    {#if isCollapsed}
      <img src="/SvaraMind%20ico.png" alt="Svaramind" class="svaramind-logo logo-icon" />
    {:else}
      <img src="/SvaraMind%20Logo.png" alt="Svaramind" class="svaramind-logo logo-full" />
    {/if}
  </div>

  <!-- ── Workspace selector dropdown ── -->
  <div class="ws-area" on:click|stopPropagation>
    {#if $currentWorkspace}
      <button class="ws-trigger" on:click={toggleDropdown}
        title={isCollapsed ? $currentWorkspace.name : undefined}>
        <i class="bi {$currentWorkspace.icon || 'bi-journals'} ws-icon"
           style="color:{$currentWorkspace.color || 'var(--accent-color)'}"></i>
        {#if !isCollapsed}
          <span class="ws-name">{$currentWorkspace.name}</span>
          <i class="bi bi-chevron-{showWorkspaceDropdown ? 'up' : 'down'} ws-chevron"></i>
        {/if}
      </button>
    {:else}
      <button class="ws-trigger" on:click={() => showNewWorkspaceModal = true}>
        <i class="bi bi-plus-circle ws-icon"></i>
        {#if !isCollapsed}<span class="ws-name">New Workspace</span>{/if}
      </button>
    {/if}

    {#if showWorkspaceDropdown}
      <div class="ws-dropdown">
        <div class="ws-dropdown-list">
          {#each $workspaces as ws}
            <button class="ws-opt {ws.id === $currentWorkspace?.id ? 'active' : ''}"
              on:click={() => { selectWorkspace(ws); showWorkspaceDropdown = false; }}>
              <i class="bi {ws.icon || 'bi-journals'}" style="color:{ws.color || 'var(--accent-color)'}"></i>
              <span>{ws.name}</span>
              {#if ws.id === $currentWorkspace?.id}<i class="bi bi-check" style="margin-left:auto;color:var(--accent-color)"></i>{/if}
            </button>
          {/each}
        </div>
        <div class="ws-dropdown-sep"></div>
        <div class="ws-dropdown-list">
          <button class="ws-opt" on:click={() => { showNewWorkspaceModal = true; showWorkspaceDropdown = false; }}>
            <i class="bi bi-plus-circle"></i><span>New Workspace</span>
          </button>
          <button class="ws-opt" on:click={openEdit}>
            <i class="bi bi-pencil"></i><span>Edit Workspace</span>
          </button>
          <button class="ws-opt danger" on:click={handleDeleteWorkspace}>
            <i class="bi bi-trash"></i><span>Delete Workspace</span>
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- ── Navigation ── -->
  <nav class="sidebar-nav">
    {#each menuItems as item}
      <button class="nav-item {currentPage === item.id ? 'active' : ''}"
        on:click={() => { activeTabId.set(null); navigate(item.path); }}
        title={isCollapsed ? item.label : undefined}>
        <i class="bi {item.icon}"></i>
        {#if !isCollapsed}<span>{item.label}</span>{/if}
      </button>
    {/each}
  </nav>

  <!-- ── Folder icon (collapsed mode only) ── -->
  {#if isCollapsed && $currentWorkspace}
    <div class="collapsed-folder-wrap">
      <button
        class="nav-item {showFolderPopup ? 'active' : ''}"
        title="Folders"
        on:click|stopPropagation={() => showFolderPopup = !showFolderPopup}>
        <i class="bi bi-folder2"></i>
      </button>
      {#if showFolderPopup}
        <div class="folder-popup" on:click|stopPropagation>
          <div class="folder-popup-title">Folders</div>
          <button class="fp-item {$activeFolder === null ? 'active' : ''}"
            on:click={() => { filterByFolder(null); showFolderPopup = false; }}>
            <i class="bi bi-journal-text"></i> All Notes
          </button>
          {#each $folderTree as folder}
            <button class="fp-item {$activeFolder === folder.id ? 'active' : ''}"
              on:click={() => { filterByFolder(folder.id); showFolderPopup = false; }}>
              <i class="bi bi-folder2"></i> {folder.name}
            </button>
            {#each (folder.children || []) as child}
              <button class="fp-item fp-item-child {$activeFolder === child.id ? 'active' : ''}"
                on:click={() => { filterByFolder(child.id); showFolderPopup = false; }}>
                <i class="bi bi-folder2"></i> {child.name}
              </button>
            {/each}
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- ── Folders ── -->
  {#if !isCollapsed && $currentWorkspace}
    <div class="folders-area">
      <div class="folders-head">
        <span class="folders-label">Folders</span>
        <button class="icon-btn" title="New folder"
          on:click={() => { showNewFolderInput = 'root'; newFolderName = ''; }}>
          <i class="bi bi-folder-plus"></i>
        </button>
      </div>

      {#if showNewFolderInput === 'root'}
        <form class="inline-form" on:submit|preventDefault={() => handleCreateFolder(null)}>
          <i class="bi bi-folder2" style="font-size:12px;color:var(--text-muted);flex-shrink:0"></i>
          <input class="inline-input" bind:value={newFolderName} placeholder="Folder name..." autofocus />
          <button type="submit" class="ic-ok"><i class="bi bi-check"></i></button>
          <button type="button" class="ic-cancel" on:click={() => showNewFolderInput = null}><i class="bi bi-x"></i></button>
        </form>
      {/if}

      <div class="folder-list">
        <!-- All Notes root -->
        <button class="f-item {$activeFolder === null ? 'active' : ''}" on:click={() => filterByFolder(null)}>
          <span class="f-expand-spacer"></span>
          <i class="bi bi-journal-text f-icon"></i>
          <span class="f-name">All Notes</span>
        </button>

        {#each $folderTree as folder}
          {@const expanded = expandedFolders.has(folder.id)}
          {@const hasKids = (folder.children?.length ?? 0) > 0}

          <!-- Folder row -->
          {#if renamingFolderId === folder.id}
            <form class="inline-form" style="padding-left:6px" on:submit|preventDefault={() => handleRenameFolder(folder.id)}>
              <input class="inline-input" bind:value={renameFolderInput} autofocus
                on:blur={() => handleRenameFolder(folder.id)}
                on:keydown={e => e.key === 'Escape' && (renamingFolderId = null)} />
            </form>
          {:else}
            <button class="f-item {$activeFolder === folder.id ? 'active' : ''}"
              on:click={() => filterByFolder(folder.id)}
              on:dblclick={e => startRename(folder, e)}>
              <button class="f-expand" on:click|stopPropagation={() => toggleFolder(folder.id)} style={!hasKids ? 'visibility:hidden;pointer-events:none' : ''}>
                {#if hasKids}
                  <i class="bi {expanded ? 'bi-chevron-down' : 'bi-chevron-right'}" style="font-size:9px;color:var(--text-muted)"></i>
                {/if}
              </button>
              <i class="bi {folder.icon || 'bi-folder2'} f-icon"></i>
              <span class="f-name">{folder.name}</span>
              <span class="f-actions">
                <button class="f-act" title="New note" on:click|stopPropagation={() => createNoteInFolder(folder.id)}>
                  <i class="bi bi-plus-lg"></i>
                </button>
                <button class="f-act" title="Rename" on:click|stopPropagation={e => startRename(folder, e)}>
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="f-act" title="New subfolder"
                  on:click|stopPropagation={() => { showNewFolderInput = folder.id; newFolderName = ''; }}>
                  <i class="bi bi-folder-plus"></i>
                </button>
                <button class="f-act danger" title="Delete" on:click|stopPropagation={() => handleDeleteFolder(folder.id, folder.name)}>
                  <i class="bi bi-trash"></i>
                </button>
              </span>
            </button>
          {/if}

          {#if showNewFolderInput === folder.id}
            <form class="inline-form" style="padding-left:28px" on:submit|preventDefault={() => handleCreateFolder(folder.id)}>
              <i class="bi bi-folder2" style="font-size:11px;color:var(--text-muted);flex-shrink:0"></i>
              <input class="inline-input" bind:value={newFolderName} placeholder="Subfolder..." autofocus />
              <button type="submit" class="ic-ok"><i class="bi bi-check"></i></button>
              <button type="button" class="ic-cancel" on:click={() => showNewFolderInput = null}><i class="bi bi-x"></i></button>
            </form>
          {/if}

          {#if expanded && hasKids}
            <div class="subfolders">
              {#each folder.children as child}
                {#if renamingFolderId === child.id}
                  <form class="inline-form" style="padding-left:24px" on:submit|preventDefault={() => handleRenameFolder(child.id)}>
                    <input class="inline-input" bind:value={renameFolderInput} autofocus
                      on:blur={() => handleRenameFolder(child.id)}
                      on:keydown={e => e.key === 'Escape' && (renamingFolderId = null)} />
                  </form>
                {:else}
                  <button class="f-item subfolder {$activeFolder === child.id ? 'active' : ''}"
                    on:click={() => filterByFolder(child.id)}
                    on:dblclick={e => startRename(child, e)}>
                    <button class="f-expand" style="visibility:hidden;pointer-events:none"></button>
                    <i class="bi {child.icon || 'bi-folder2'} f-icon"></i>
                    <span class="f-name">{child.name}</span>
                    <span class="f-actions">
                      <button class="f-act" title="New note" on:click|stopPropagation={() => createNoteInFolder(child.id)}><i class="bi bi-plus-lg"></i></button>
                      <button class="f-act" on:click|stopPropagation={e => startRename(child, e)} title="Rename"><i class="bi bi-pencil"></i></button>
                      <button class="f-act danger" on:click|stopPropagation={() => handleDeleteFolder(child.id, child.name)} title="Delete"><i class="bi bi-trash"></i></button>
                    </span>
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Footer — user menu ── -->
  <div class="sidebar-footer" on:click|stopPropagation>
    <!-- Popup menu (opens upward) -->
    {#if showUserMenu}
      <div class="user-popup">
        <!-- Profile header -->
        <div class="user-popup-profile">
          <div class="user-avatar-lg">
            {#if $user?.user_metadata?.avatar_url}
              <img src={$user.user_metadata.avatar_url} alt="" class="user-avatar-img" />
            {:else}
              {($user?.user_metadata?.full_name || $user?.email || '?')[0].toUpperCase()}
            {/if}
          </div>
          <div class="user-popup-info">
            <span class="user-popup-name">{$user?.user_metadata?.full_name || $user?.email?.split('@')[0]}</span>
            <span class="user-popup-email">{$user?.email}</span>
          </div>
        </div>
        <div class="user-popup-sep"></div>
        <button class="user-popup-item" on:click={() => { activeTabId.set(null); navigate('/settings'); showUserMenu = false; }}>
          <i class="bi bi-gear"></i>
          <span>Settings</span>
        </button>
        {#if $user?.role === 'admin'}
          <button class="user-popup-item" on:click={() => { activeTabId.set(null); navigate('/admin'); showUserMenu = false; }}>
            <i class="bi bi-shield-lock"></i>
            <span>Admin</span>
          </button>
        {/if}
        <button class="user-popup-item" on:click={() => { activeTabId.set(null); navigate('/about'); showUserMenu = false; }}>
          <i class="bi bi-info-circle"></i>
          <span>About</span>
        </button>
        <div class="user-popup-sep"></div>
        <button class="user-popup-item danger" on:click={signOut}>
          <i class="bi bi-box-arrow-right"></i>
          <span>Sign out</span>
        </button>
      </div>
    {/if}

    <!-- Clickable user row trigger -->
    <button class="user-trigger {showUserMenu ? 'active' : ''}" on:click={toggleUserMenu}
      title={isCollapsed ? ($user?.email || '') : undefined}>
      <div class="user-avatar">
        {#if $user?.user_metadata?.avatar_url}
          <img src={$user.user_metadata.avatar_url} alt="" class="user-avatar-img" />
        {:else}
          {($user?.user_metadata?.full_name || $user?.email || '?')[0].toUpperCase()}
        {/if}
      </div>
      {#if !isCollapsed}
        <div class="user-meta">
          <span class="user-name">{$user?.user_metadata?.full_name || $user?.email?.split('@')[0]}</span>
          <span class="user-email">{$user?.email}</span>
        </div>
        <i class="bi bi-chevron-{showUserMenu ? 'down' : 'up'} user-chevron"></i>
      {/if}
    </button>
  </div>
</aside>

<!-- ── New Workspace Modal ── -->
{#if showNewWorkspaceModal}
  <div class="modal-bg" on:click|self={() => showNewWorkspaceModal = false} role="dialog">
    <div class="modal-box">
      <div class="modal-hdr"><h5>New Workspace</h5>
        <button class="icon-btn" on:click={() => showNewWorkspaceModal = false}><i class="bi bi-x-lg"></i></button>
      </div>
      <form on:submit|preventDefault={handleCreateWorkspace}>
        <label class="notes-label">Icon</label>
        <div class="icon-grid mb-3">
          {#each WS_ICONS as ic}
            <button type="button" class="icon-pick {newWs.icon === ic ? 'sel' : ''}" on:click={() => newWs.icon = ic}>
              <i class="bi {ic}"></i>
            </button>
          {/each}
        </div>
        <label class="notes-label">Color</label>
        <div class="color-row mb-3">
          {#each ACCENT_COLORS as c}
            <button type="button" class="clr-dot {newWs.color === c ? 'sel' : ''}" style="background:{c}" on:click={() => newWs.color = c}></button>
          {/each}
        </div>
        <label class="notes-label">Name</label>
        <input class="notes-input mb-3" bind:value={newWs.name} placeholder="e.g. Work Notes" autofocus required />
        <div class="modal-actions">
          <button type="submit" class="notes-btn notes-btn-primary">Create</button>
          <button type="button" class="notes-btn notes-btn-ghost" on:click={() => showNewWorkspaceModal = false}>Cancel</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- ── Edit Workspace Modal ── -->
{#if showEditWorkspaceModal}
  <div class="modal-bg" on:click|self={() => showEditWorkspaceModal = false} role="dialog">
    <div class="modal-box">
      <div class="modal-hdr"><h5>Edit Workspace</h5>
        <button class="icon-btn" on:click={() => showEditWorkspaceModal = false}><i class="bi bi-x-lg"></i></button>
      </div>
      <form on:submit|preventDefault={handleEditWorkspace}>
        <label class="notes-label">Icon</label>
        <div class="icon-grid mb-3">
          {#each WS_ICONS as ic}
            <button type="button" class="icon-pick {editWs.icon === ic ? 'sel' : ''}" on:click={() => editWs.icon = ic}>
              <i class="bi {ic}"></i>
            </button>
          {/each}
        </div>
        <label class="notes-label">Color</label>
        <div class="color-row mb-3">
          {#each ACCENT_COLORS as c}
            <button type="button" class="clr-dot {editWs.color === c ? 'sel' : ''}" style="background:{c}" on:click={() => editWs.color = c}></button>
          {/each}
        </div>
        <label class="notes-label">Name</label>
        <input class="notes-input mb-3" bind:value={editWs.name} required />
        <div class="modal-actions">
          <button type="submit" class="notes-btn notes-btn-primary">Save</button>
          <button type="button" class="notes-btn notes-btn-ghost" on:click={() => showEditWorkspaceModal = false}>Cancel</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    height: 100%;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.2s, min-width 0.2s;
  }
  .sidebar.collapsed {
    width: 48px;
    min-width: 48px;
    overflow: visible;
  }

  /* logo */
  .sidebar-logo {
    display: flex; align-items: center; justify-content: center;
    padding: 16px 14px; flex-shrink: 0;
  }
  .logo-full { height: 38px; width: auto; object-fit: contain; }
  .logo-icon { height: 30px; width: 30px; object-fit: contain; }
  .sidebar.collapsed .sidebar-logo { padding: 14px 8px; }

  /* workspace */
  .ws-area { position: relative; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }

  .ws-trigger {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 12px 14px;
    border: none; background: none; cursor: pointer; text-align: left;
    transition: background 0.15s;
  }
  .ws-trigger:hover { background: var(--bg-hover); }
  .ws-icon { font-size: 16px; flex-shrink: 0; }
  .ws-name { flex: 1; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); }
  .ws-chevron { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }

  .ws-dropdown {
    position: absolute; top: 100%; left: 0; right: 0;
    min-width: 220px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color); border-top: none;
    box-shadow: var(--shadow-md); z-index: 200;
    animation: fadeIn 0.12s ease;
  }
  .ws-dropdown-list { padding: 4px; }
  .ws-opt {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 8px 10px;
    border: none; border-radius: var(--radius-sm); background: none;
    cursor: pointer; font-size: 13px; color: var(--text-primary); text-align: left;
    transition: background 0.1s;
  }
  .ws-opt:hover { background: var(--bg-hover); }
  .ws-opt.active { background: var(--bg-active); color: var(--accent-color); font-weight: 500; }
  .ws-opt.danger { color: var(--danger-color); }
  .ws-opt.danger:hover { background: #fee2e2; }
  .ws-dropdown-sep { border-top: 1px solid var(--border-color); }

  /* nav */
  .sidebar-nav { padding: 8px; display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: var(--radius-sm);
    border: none; background: none; color: var(--text-secondary);
    cursor: pointer; font-size: 13px; font-weight: 500;
    transition: all 0.15s; text-align: left; width: 100%;
  }
  .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .nav-item.active { background: var(--bg-active); color: var(--accent-color); font-weight: 600; }
  .nav-item i { font-size: 15px; flex-shrink: 0; }

  /* collapsed: center icons */
  .sidebar.collapsed .nav-item {
    justify-content: center;
    padding: 10px;
    gap: 0;
    position: relative;
  }
  .sidebar.collapsed .nav-item i { font-size: 17px; }

  .collapsed-folder-wrap { position: relative; padding: 0 8px; }

  .folder-popup {
    position: absolute;
    left: calc(100% + 6px);
    top: 0;
    width: 200px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 200;
    padding: 6px;
    animation: modal-in 0.15s ease;
  }
  .folder-popup-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 8px 6px;
  }
  .fp-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    text-align: left;
    transition: background 0.1s;
  }
  .fp-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .fp-item.active { background: var(--bg-active); color: var(--accent-color); font-weight: 600; }
  .fp-item-child { padding-left: 26px; font-size: 12px; }

  .sidebar.collapsed .ws-trigger {
    justify-content: center;
    padding: 12px 8px;
  }

  /* folders */
  .folders-area {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; border-top: 1px solid var(--border-color);
    min-height: 0;
  }
  .folders-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px 4px; flex-shrink: 0;
  }
  .folders-label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.7px; }
  .folder-list { flex: 1; overflow-y: auto; padding: 2px 6px 8px; display: flex; flex-direction: column; }

  .f-expand-spacer { width: 0; flex-shrink: 0; }

  .f-item {
    display: flex; align-items: center; gap: 3px;
    width: 100%; padding: 5px 6px;
    border: none; border-radius: var(--radius-sm); background: none;
    cursor: pointer; font-size: 13px; color: var(--text-secondary);
    text-align: left; transition: background 0.1s; position: relative; min-width: 0;
  }
  .f-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .f-item:hover .f-actions { opacity: 1; pointer-events: auto; }
  .f-item.active { background: var(--bg-active); color: var(--accent-color); font-weight: 500; }
  .f-item.active .f-icon { color: var(--accent-color); }
  .f-item.subfolder { padding-left: 20px; font-size: 12px; }

  .f-expand {
    display: flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; flex-shrink: 0;
    border: none; background: none; cursor: pointer; color: var(--text-muted);
    padding: 0;
  }
  .f-expand[style*="visibility:hidden"] { width: 0; }
  .f-icon { font-size: 13px; flex-shrink: 0; color: var(--text-muted); }
  .f-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .f-item:hover .f-name { max-width: calc(100% - 110px); }
  .folder-list > .f-item:first-child:hover .f-name { max-width: none; }

  .f-actions { display: flex; gap: 1px; opacity: 0; transition: opacity 0.15s; flex-shrink: 0; position: absolute; right: 6px; pointer-events: none; }
  .f-act {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border: none; border-radius: 3px;
    background: none; cursor: pointer; font-size: 10px; color: var(--text-muted);
    transition: all 0.1s;
  }
  .f-act:hover { background: var(--bg-secondary); color: var(--text-primary); }
  .f-act.danger:hover { background: #fee2e2; color: var(--danger-color); }

  .subfolders { display: flex; flex-direction: column; }

  .inline-form {
    display: flex; align-items: center; gap: 4px;
    padding: 3px 6px; margin: 1px 0;
  }
  .inline-input {
    flex: 1; min-width: 0;
    padding: 3px 7px; border: 1px solid var(--accent-color);
    border-radius: 4px; background: var(--bg-primary);
    color: var(--text-primary); font-size: 12px; outline: none;
  }
  .ic-ok, .ic-cancel {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border: none; border-radius: 3px;
    cursor: pointer; font-size: 11px; flex-shrink: 0;
  }
  .ic-ok { background: var(--accent-color); color: #fff; }
  .ic-cancel { background: var(--bg-hover); color: var(--text-secondary); }

  /* footer */
  .sidebar-footer {
    margin-top: auto;
    border-top: 1px solid var(--border-color);
    flex-shrink: 0;
    position: relative;
  }

  .sidebar.collapsed .user-trigger { justify-content: center; padding: 10px 8px; }

  .user-trigger {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 10px 12px;
    border: none; background: none; cursor: pointer; text-align: left;
    transition: background 0.15s;
    min-width: 0;
  }
  .user-trigger:hover { background: var(--bg-hover); }
  .user-trigger.active { background: var(--bg-active); }

  .user-avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; flex-shrink: 0;
    overflow: hidden;
  }
  .user-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
  .user-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .user-name { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); }
  .user-email { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .user-chevron { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }

  /* user popup — opens upward */
  .user-popup {
    position: absolute;
    bottom: 100%;
    left: 0; right: 0;
    min-width: 220px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-bottom: none;
    box-shadow: 0 -4px 16px rgba(0,0,0,0.1);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    overflow: hidden;
    animation: slideUpIn 0.15s ease;
    z-index: 200;
  }

  /* When sidebar is collapsed, open popup to the right instead */
  .sidebar.collapsed .user-popup {
    bottom: 0;
    left: 100%;
    right: auto;
    top: auto;
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    border-bottom: 1px solid var(--border-color);
    border-left: none;
    box-shadow: 4px 4px 16px rgba(0,0,0,0.1);
  }

  /* Mobile: popup fixed to bottom of viewport so it never goes off-screen */
  @media (max-width: 768px) {
    .user-popup {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      border-bottom: none;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.15);
      padding-bottom: env(safe-area-inset-bottom);
    }
  }

  @keyframes slideUpIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .user-popup-profile {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 14px 12px;
    background: var(--bg-secondary);
  }

  .user-avatar-lg {
    width: 36px; height: 36px; border-radius: 50%;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 700; flex-shrink: 0;
    overflow: hidden;
  }

  .user-popup-info { display: flex; flex-direction: column; min-width: 0; }
  .user-popup-name { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .user-popup-email { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .user-popup-sep { border-top: 1px solid var(--border-color); }

  .user-popup-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 10px 14px;
    border: none; background: none; cursor: pointer;
    font-size: 13px; color: var(--text-primary); text-align: left;
    transition: background 0.1s;
  }
  .user-popup-item:hover { background: var(--bg-hover); }
  .user-popup-item.danger { color: var(--danger-color); }
  .user-popup-item.danger:hover { background: #fee2e2; }

  /* icon btn */
  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    padding: 6px; border-radius: 4px; color: var(--text-muted);
    transition: all 0.15s; flex-shrink: 0;
  }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

  /* modal */
  .modal-bg {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    z-index: 1000; display: flex; align-items: center; justify-content: center;
    padding: 16px; backdrop-filter: blur(2px);
  }
  .modal-box {
    background: var(--bg-primary); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg); width: 100%; max-width: 400px;
    padding: 24px; animation: modal-in 0.2s ease;
  }
  .modal-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .modal-hdr h5 { margin: 0; font-size: 15px; font-weight: 700; }

  .icon-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .icon-pick {
    width: 34px; height: 34px; border: 1px solid var(--border-color);
    border-radius: var(--radius-sm); background: var(--bg-secondary);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 15px; color: var(--text-secondary); transition: all 0.15s;
  }
  .icon-pick:hover { border-color: var(--accent-color); color: var(--accent-color); }
  .icon-pick.sel { border-color: var(--accent-color); background: var(--bg-active); color: var(--accent-color); box-shadow: 0 0 0 2px rgba(19,37,120,0.2); }

  .color-row { display: flex; gap: 8px; }
  .clr-dot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform 0.1s; }
  .clr-dot:hover { transform: scale(1.15); }
  .clr-dot.sel { border-color: var(--text-primary); box-shadow: 0 0 0 2px var(--bg-primary); }

  .modal-actions { display: flex; gap: 8px; }

  .mb-3 { margin-bottom: 14px; }

  /* On mobile the sidebar is always full-width — ignore collapsed mode */
  @media (max-width: 768px) {
    .sidebar.collapsed {
      width: 100% !important;
      min-width: 100% !important;
      overflow: hidden !important;
      overflow-x: hidden !important;
    }
    /* Show all labels/folders as if not collapsed */
    .sidebar.collapsed .nav-item {
      justify-content: flex-start;
      padding: 8px 10px;
      gap: 10px;
    }
    .sidebar.collapsed .nav-item i { font-size: 15px; }
    .sidebar.collapsed .ws-trigger { justify-content: flex-start; padding: 12px 14px; }
    .sidebar.collapsed .user-trigger { justify-content: flex-start; padding: 10px 12px; }
    .sidebar.collapsed .user-popup {
      bottom: 100%; left: 0; right: 0;
      top: auto;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      border-bottom: none;
      border-left: 1px solid var(--border-color);
      box-shadow: 0 -4px 16px rgba(0,0,0,0.1);
    }
    /* Tighter mobile spacing */
    .ws-trigger { padding: 10px 12px; }
    .ws-name { font-size: 12px; }
    .sidebar-nav { padding: 6px; gap: 1px; }
    .nav-item { padding: 7px 9px; font-size: 12px; gap: 8px; }
    .nav-item i { font-size: 14px; }
    .folders-head { padding: 6px 12px 3px; }
    .folders-label { font-size: 9px; }
    .f-item { padding: 4px 5px; font-size: 12px; gap: 4px; }
    .f-item.subfolder { padding-left: 18px; }
    .f-icon { font-size: 12px; }
    .f-expand { width: 14px; height: 14px; }
    .f-act { width: 18px; height: 18px; font-size: 9px; }
    .user-trigger { padding: 9px 10px; }
    .user-avatar { width: 26px; height: 26px; font-size: 11px; }
    .user-name { font-size: 11px; }
    .user-email { font-size: 10px; }
    .sidebar-footer { padding-bottom: env(safe-area-inset-bottom); }
  }
</style>
