<script lang="ts">
  import { onMount } from 'svelte';
  import NotesLayout from '../components/NotesLayout.svelte';
  import { todoApi } from '../lib/api';
  import { currentWorkspace } from '../stores/notes';

  type Priority = 'low' | 'normal' | 'high';
  interface Todo { id: string; title: string; description: string; is_done: boolean; priority: Priority; due_date: string | null; done_at: string | null; created_at: string; }

  let todos: Todo[] = [];
  let loading = true;
  let adding = false;
  let newTitle = '';
  let newPriority: Priority = 'normal';
  let newDueDate = '';
  let editingId: string | null = null;
  let editTitle = '';
  let editDescription = '';
  let editPriority: Priority = 'normal';
  let editDueDate = '';
  let showDone = true;
  let inputRef: HTMLInputElement;

  $: active = todos.filter(t => !t.is_done);
  $: done   = todos.filter(t => t.is_done);

  async function load() {
    if (!$currentWorkspace) return;
    loading = true;
    try {
      const { todos: data } = await todoApi.list($currentWorkspace.id);
      todos = data || [];
    } catch {}
    loading = false;
  }

  $: if ($currentWorkspace) load();
  onMount(load);

  async function addTodo() {
    if (!newTitle.trim() || !$currentWorkspace) return;
    adding = true;
    try {
      const { todo } = await todoApi.create({
        workspace_id: $currentWorkspace.id,
        title: newTitle.trim(),
        priority: newPriority,
        due_date: newDueDate || null
      });
      todos = [todo, ...todos];
      newTitle = ''; newDueDate = ''; newPriority = 'normal';
      inputRef?.focus();
    } catch {}
    adding = false;
  }

  async function toggle(id: string) {
    const { todo } = await todoApi.toggle(id);
    todos = todos.map(t => t.id === id ? todo : t);
  }

  function startEdit(todo: Todo) {
    editingId = todo.id;
    editTitle = todo.title;
    editDescription = todo.description || '';
    editPriority = todo.priority;
    editDueDate = todo.due_date || '';
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim()) return;
    const { todo } = await todoApi.update(editingId, {
      title: editTitle.trim(), description: editDescription, priority: editPriority, due_date: editDueDate || null
    });
    todos = todos.map(t => t.id === editingId ? todo : t);
    editingId = null;
  }

  async function deleteTodo(id: string) {
    await todoApi.delete(id);
    todos = todos.filter(t => t.id !== id);
  }

  async function clearDone() {
    if (!$currentWorkspace || !done.length) return;
    if (!confirm(`Delete ${done.length} completed task${done.length > 1 ? 's' : ''}?`)) return;
    await todoApi.clearDone($currentWorkspace.id);
    todos = todos.filter(t => !t.is_done);
  }

  function priorityColor(p: Priority) {
    return p === 'high' ? '#ef4444' : p === 'low' ? '#94a3b8' : 'var(--text-muted)';
  }
  function priorityIcon(p: Priority) {
    return p === 'high' ? 'bi-flag-fill' : p === 'low' ? 'bi-flag' : 'bi-flag';
  }
  function formatDate(d: string | null) {
    if (!d) return '';
    const date = new Date(d);
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return `<span class="overdue">${Math.abs(diff)}d overdue</span>`;
    if (diff === 0) return `<span class="due-today">Today</span>`;
    if (diff === 1) return `<span class="due-soon">Tomorrow</span>`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
</script>

<NotesLayout currentPage="todos">
  <div class="todos-page">
    <div class="todos-page-header">
      <h2><i class="bi bi-check2-square"></i> To Do</h2>
    </div>

    <div class="todos-page-content">
      <!-- Add form -->
    <div class="add-form">
      <input
        bind:this={inputRef}
        bind:value={newTitle}
        class="todo-input"
        placeholder="Add a new task…"
        on:keydown={e => e.key === 'Enter' && addTodo()}
      />
      <select class="priority-select" bind:value={newPriority} title="Priority">
        <option value="low">🏳 Low</option>
        <option value="normal">🚩 Normal</option>
        <option value="high">🔴 High</option>
      </select>
      <input type="date" class="date-input" bind:value={newDueDate} title="Due date" />
      <button class="btn-primary" on:click={addTodo} disabled={adding || !newTitle.trim()}>
        {#if adding}<span class="spinner-sm" style="width:13px;height:13px;border-width:2px"></span>{:else}<i class="bi bi-plus-lg"></i>{/if}
        Add
      </button>
    </div>

    {#if loading}
      <div class="empty-state">
        <div class="spinner-sm" style="width:28px;height:28px;border-width:3px;margin:0 auto 12px"></div>
        <p>Loading…</p>
      </div>
    {:else}
      <!-- Active todos -->
      {#if active.length === 0 && done.length === 0}
        <div class="empty-state">
          <i class="bi bi-check2-circle" style="font-size:3rem;color:var(--text-muted)"></i>
          <p>No tasks yet. Add your first task above.</p>
        </div>
      {:else if active.length === 0}
        <div class="empty-state">
          <i class="bi bi-stars" style="font-size:2.5rem;color:var(--accent-color)"></i>
          <p style="font-weight:600">All done!</p>
        </div>
      {:else}
        <ul class="todo-list">
          {#each active as todo (todo.id)}
            <li class="todo-item {editingId === todo.id ? 'editing' : ''}">
              {#if editingId === todo.id}
                <!-- Edit mode -->
                <div class="edit-form">
                  <input class="todo-input" bind:value={editTitle} on:keydown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editingId = null; }} />
                  <textarea class="desc-input" bind:value={editDescription} placeholder="Description (optional)" rows="2"></textarea>
                  <div class="edit-row">
                    <select class="priority-select" bind:value={editPriority}>
                      <option value="low">🏳 Low</option>
                      <option value="normal">🚩 Normal</option>
                      <option value="high">🔴 High</option>
                    </select>
                    <input type="date" class="date-input" bind:value={editDueDate} />
                    <button class="btn-primary sm" on:click={saveEdit}><i class="bi bi-check-lg"></i> Save</button>
                    <button class="btn-ghost sm" on:click={() => editingId = null}><i class="bi bi-x"></i></button>
                  </div>
                </div>
              {:else}
                <!-- View mode -->
                <button class="todo-check" on:click={() => toggle(todo.id)} title="Mark done">
                  <i class="bi bi-circle"></i>
                </button>
                <div class="todo-body" role="button" tabindex="0" on:click={() => startEdit(todo)} on:keydown={e => e.key === 'Enter' && startEdit(todo)}>
                  <div class="todo-title-row">
                    <span class="todo-title">{todo.title}</span>
                    <i class="bi {priorityIcon(todo.priority)}" style="color:{priorityColor(todo.priority)};font-size:12px;flex-shrink:0"></i>
                  </div>
                  {#if todo.description}
                    <span class="todo-desc">{todo.description}</span>
                  {/if}
                  {#if todo.due_date}
                    <span class="todo-due">{@html formatDate(todo.due_date)}</span>
                  {/if}
                </div>
                <button class="todo-delete" on:click={() => deleteTodo(todo.id)} title="Delete">
                  <i class="bi bi-trash3"></i>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      <!-- Done section -->
      {#if done.length > 0}
        <button class="done-toggle" on:click={() => showDone = !showDone}>
          <i class="bi bi-chevron-{showDone ? 'down' : 'right'}"></i>
          Completed ({done.length})
        </button>
        {#if showDone}
          <ul class="todo-list done-list">
            {#each done as todo (todo.id)}
              <li class="todo-item done">
                <button class="todo-check done" on:click={() => toggle(todo.id)} title="Mark undone">
                  <i class="bi bi-check-circle-fill"></i>
                </button>
                <div class="todo-body">
                  <span class="todo-title">{todo.title}</span>
                  {#if todo.done_at}
                    <span class="todo-desc">Done {new Date(todo.done_at).toLocaleDateString()}</span>
                  {/if}
                </div>
                <button class="todo-delete" on:click={() => deleteTodo(todo.id)} title="Delete">
                  <i class="bi bi-trash3"></i>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    {/if}
    </div>
  </div>
</NotesLayout>

<style>
  .todos-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .todos-page-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }
  .todos-page-header h2 { margin: 0; font-size: 1.2rem; display: flex; align-items: center; gap: 10px; }

  .todos-page-content { flex: 1; overflow-y: auto; padding: 24px; max-width: 680px; margin: 0 auto; width: 100%; }

  /* Add form */
  .add-form {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 14px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .todo-input {
    flex: 1; min-width: 160px; border: none; outline: none; background: transparent;
    font-size: 14px; color: var(--text-primary); font-family: inherit;
  }
  .todo-input::placeholder { color: var(--text-muted); }
  .priority-select, .date-input {
    padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    background: var(--bg-secondary); color: var(--text-secondary); font-size: 12px;
    font-family: inherit; cursor: pointer;
  }
  .date-input { color-scheme: light dark; }
  .btn-primary {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 6px 14px; border-radius: var(--radius-sm);
    border: none; background: var(--accent-color); color: #fff;
    font-size: 13px; font-family: inherit; cursor: pointer; white-space: nowrap;
    transition: opacity 0.15s;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }
  .btn-primary.sm { padding: 4px 10px; font-size: 12px; }
  .btn-ghost {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-color); background: none;
    color: var(--text-secondary); font-size: 12px; font-family: inherit; cursor: pointer;
    transition: all 0.15s;
  }
  .btn-ghost:hover { background: var(--bg-hover); color: var(--text-primary); }
  .btn-ghost.sm { padding: 4px 8px; }

  /* Todo list */
  .todo-list { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 4px; }

  .todo-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    transition: box-shadow 0.15s;
  }
  .todo-item:hover { box-shadow: 0 1px 6px rgba(0,0,0,.07); }
  .todo-item.editing { border-color: var(--accent-color); }

  .todo-check {
    flex-shrink: 0; background: none; border: none; cursor: pointer;
    padding: 2px; color: var(--text-muted); font-size: 18px; line-height: 1;
    transition: color 0.15s;
  }
  .todo-check:hover { color: var(--accent-color); }
  .todo-check.done { color: var(--success-color, #22c55e); }
  .todo-check.done:hover { color: var(--text-muted); }

  .todo-body { flex: 1; min-width: 0; cursor: pointer; }
  .todo-title-row { display: flex; align-items: center; gap: 6px; }
  .todo-title { font-size: 14px; color: var(--text-primary); word-break: break-word; }
  .todo-desc { font-size: 12px; color: var(--text-muted); display: block; margin-top: 2px; }
  .todo-due { font-size: 11px; color: var(--text-muted); display: block; margin-top: 3px; }
  :global(.overdue) { color: #ef4444 !important; font-weight: 600; }
  :global(.due-today) { color: #f97316 !important; font-weight: 600; }
  :global(.due-soon) { color: var(--accent-color); }

  .todo-delete {
    flex-shrink: 0; background: none; border: none; cursor: pointer;
    padding: 2px 4px; color: transparent; font-size: 13px;
    border-radius: 4px; transition: all 0.15s;
  }
  .todo-item:hover .todo-delete { color: var(--text-muted); }
  .todo-delete:hover { color: #ef4444 !important; background: rgba(239,68,68,.08); }

  /* Done list */
  .done-list { opacity: 0.65; }
  .todo-item.done .todo-title { text-decoration: line-through; color: var(--text-muted); }

  .done-toggle {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600; color: var(--text-muted);
    padding: 6px 2px; margin-bottom: 4px; font-family: inherit;
    text-transform: uppercase; letter-spacing: 0.4px;
  }
  .done-toggle:hover { color: var(--text-primary); }

  /* Edit form */
  .edit-form { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .desc-input {
    width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    background: var(--bg-secondary); color: var(--text-primary); font-size: 13px;
    font-family: inherit; padding: 6px 8px; resize: vertical;
  }
  .edit-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

  /* Empty */
  .empty-state {
    text-align: center; padding: 48px 20px; color: var(--text-secondary);
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .empty-state p { margin: 0; font-size: 14px; }

  /* Mobile */
  @media (max-width: 768px) {
    .todos-page { height: auto; }
    .todos-page-header { padding: 12px 16px; border-bottom: 1px solid var(--border-color); }
    .todos-page-header h2 { font-size: 1.1rem; }

    .todos-page-content { padding: 16px; max-width: 100%; }
    .add-form { flex-direction: column; gap: 10px; align-items: stretch; padding: 10px; }
    .todo-input { min-width: auto; font-size: 14px; }
    .priority-select, .date-input { width: 100%; font-size: 13px; padding: 8px; }
    .btn-primary { width: 100%; justify-content: center; padding: 8px 12px; font-size: 13px; }
  }
</style>
