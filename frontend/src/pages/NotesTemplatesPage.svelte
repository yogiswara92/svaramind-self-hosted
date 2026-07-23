<script lang="ts">
  import { navigate } from 'svelte-routing';
  import NotesLayout from '../components/NotesLayout.svelte';
  import { templateApi, aiApi } from '../lib/api';
  import { currentWorkspace, createDocument } from '../stores/notes';

  let templates: any[] = [];
  let loading = false;
  let showCreateModal = false;
  let showGenerateModal = false;
  let showEditModal = false;
  let generatingContent = false;
  let selectedCategory = 'All';
  let savingTemplate = false;

  const TEMPLATE_ICONS = [
    'bi-file-text','bi-people','bi-kanban','bi-calendar3','bi-cpu','bi-search',
    'bi-briefcase','bi-mortarboard','bi-journal','bi-card-checklist','bi-lightning','bi-star'
  ];

  let newTemplate = { name: '', description: '', category: 'General', icon: 'bi-file-text', is_public: false };
  let editTemplate: any = null;
  let generatePrompt = '';
  let generateContext = '';
  let generatedContent = '';

  const CATEGORIES = ['All', 'Meeting', 'Project', 'Personal', 'Technical', 'Business', 'Research', 'General'];

  const BUILT_IN_TEMPLATES = [
    {
      id: 'meeting', name: 'Meeting Notes', icon: 'bi-people', category: 'Meeting',
      description: 'Structured template for recording meeting outcomes',
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Meeting Notes' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Date: ' }, { type: 'text', text: new Date().toLocaleDateString() }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Attendees: ' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📋 Agenda' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📝 Discussion' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '✅ Action Items' }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Action item 1 @assignee' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🗓️ Next Steps' }] },
        { type: 'paragraph' }
      ] }
    },
    {
      id: 'project-plan', name: 'Project Plan', icon: 'bi-kanban', category: 'Project',
      description: 'Comprehensive project planning template',
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Plan' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🎯 Objectives' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📅 Timeline' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '👥 Team' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Team member - Role' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '⚠️ Risks & Mitigations' }] },
        { type: 'paragraph' }
      ] }
    },
    {
      id: 'daily-journal', name: 'Daily Journal', icon: 'bi-calendar3', category: 'Personal',
      description: 'Daily reflection and planning',
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: `Daily Journal — ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🌅 Morning Intentions' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Today I want to...' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '✅ Top 3 Priorities' }] },
        { type: 'taskList', content: [1,2,3].map(i => ({ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: `Priority ${i}` }] }] })) },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🌙 Evening Reflection' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Today I accomplished...' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'I am grateful for...' }] }
      ] }
    },
    {
      id: 'tech-spec', name: 'Technical Spec', icon: 'bi-cpu', category: 'Technical',
      description: 'Software design and technical specification',
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Technical Specification' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📋 Overview' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🏗️ Architecture' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🔌 API Design' }] },
        { type: 'codeBlock', attrs: { language: 'json' }, content: [{ type: 'text', text: '{\n  "endpoint": "",\n  "method": "GET",\n  "response": {}\n}' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🔒 Security Considerations' }] },
        { type: 'paragraph' }
      ] }
    },
    {
      id: 'research-notes', name: 'Research Notes', icon: 'bi-search', category: 'Research',
      description: 'Structured research documentation',
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Research: [Topic]' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '❓ Research Questions' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Question 1' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📚 Sources' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📊 Key Findings' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '💡 Conclusions' }] },
        { type: 'paragraph' }
      ] }
    }
  ];

  async function loadTemplates() {
    loading = true;
    try {
      const { templates: data } = await templateApi.list($currentWorkspace?.id);
      templates = data || [];
    } catch {}
    loading = false;
  }

  async function useTemplate(template: any) {
    if (!$currentWorkspace) return;
    const doc = await createDocument($currentWorkspace.id, undefined, template);
    // Increment use_count
    if (template.id && !BUILT_IN_TEMPLATES.some(t => t.id === template.id)) {
      templateApi.update(template.id, { use_count: (template.use_count || 0) + 1 }).catch(() => {});
    }
    navigate(`/doc/${doc.id}`);
  }

  async function handleCreateTemplate() {
    if (!newTemplate.name.trim() || !$currentWorkspace) return;
    savingTemplate = true;
    try {
      const { template } = await templateApi.create({
        ...newTemplate,
        workspace_id: $currentWorkspace.id,
        content: { type: 'doc', content: [{ type: 'paragraph' }] }
      });
      templates = [template, ...templates];
      showCreateModal = false;
      newTemplate = { name: '', description: '', category: 'General', icon: 'bi-file-text', is_public: false };
    } catch {}
    savingTemplate = false;
  }

  function openEditModal(template: any, e: Event) {
    e.stopPropagation();
    editTemplate = { ...template };
    showEditModal = true;
  }

  async function handleUpdateTemplate() {
    if (!editTemplate || !editTemplate.name.trim()) return;
    savingTemplate = true;
    try {
      const { template } = await templateApi.update(editTemplate.id, {
        name: editTemplate.name,
        description: editTemplate.description,
        icon: editTemplate.icon,
        category: editTemplate.category,
        is_public: editTemplate.is_public
      });
      templates = templates.map(t => t.id === template.id ? template : t);
      showEditModal = false;
      editTemplate = null;
    } catch {}
    savingTemplate = false;
  }

  async function handleDeleteTemplate(template: any, e: Event) {
    e.stopPropagation();
    if (!confirm(`Delete template "${template.name}"?`)) return;
    await templateApi.delete(template.id);
    templates = templates.filter(t => t.id !== template.id);
  }

  async function generateFromAI() {
    if (!generatePrompt) return;
    generatingContent = true;
    try {
      const { content } = await aiApi.generate(generatePrompt, generateContext);
      generatedContent = content;
    } catch {}
    generatingContent = false;
  }

  async function createNoteFromGenerated() {
    if (!$currentWorkspace || !generatedContent) return;
    const doc = await createDocument($currentWorkspace.id, undefined, {
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: generatedContent }] }] }
    });
    navigate(`/doc/${doc.id}`);
  }

  $: filteredBuiltIn = selectedCategory === 'All' ? BUILT_IN_TEMPLATES : BUILT_IN_TEMPLATES.filter(t => t.category === selectedCategory);
  $: filteredCustom = templates.filter(t => selectedCategory === 'All' || t.category === selectedCategory);

  loadTemplates();
</script>

<NotesLayout currentPage="templates">
  <div class="templates-page">
    <div class="templates-header">
      <div>
        <h2><i class="bi bi-grid-3x3-gap"></i> Templates</h2>
        <p>Start with a template or generate one with AI</p>
      </div>
      <div class="header-actions">
        <button class="notes-btn notes-btn-ghost" on:click={() => showGenerateModal = true}>
          <i class="bi bi-stars"></i> AI Generate
        </button>
        <button class="notes-btn notes-btn-primary" on:click={() => showCreateModal = true}>
          <i class="bi bi-plus-lg"></i> Save Template
        </button>
      </div>
    </div>

    <!-- Category filter -->
    <div class="category-filter">
      {#each CATEGORIES as cat}
        <button class="cat-btn {selectedCategory === cat ? 'active' : ''}" on:click={() => selectedCategory = cat}>
          {cat}
        </button>
      {/each}
    </div>

    <div class="templates-content">
      <!-- Built-in templates -->
      {#if filteredBuiltIn.length > 0}
        <section class="template-section">
          <h4 class="section-label">Starter Templates</h4>
          <div class="templates-grid">
            {#each filteredBuiltIn as template}
              <button class="template-card" on:click={() => useTemplate(template)}>
                <div class="template-icon"><i class="bi {template.icon}"></i></div>
                <div class="template-info">
                  <h5>{template.name}</h5>
                  <p>{template.description}</p>
                  <span class="template-category">{template.category}</span>
                </div>
                <div class="template-use">Use template →</div>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Custom templates -->
      {#if filteredCustom.length > 0}
        <section class="template-section">
          <h4 class="section-label">Your Templates</h4>
          <div class="templates-grid">
            {#each filteredCustom as template}
              <div class="template-card" on:click={() => useTemplate(template)} role="button" tabindex="0">
                <div class="template-card-top">
                  <div class="template-icon"><i class="bi {template.icon}"></i></div>
                  <div class="template-card-actions" on:click|stopPropagation>
                    <button class="tpl-action-btn" title="Edit" on:click={e => openEditModal(template, e)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="tpl-action-btn danger" title="Delete" on:click={e => handleDeleteTemplate(template, e)}>
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
                <div class="template-info">
                  <h5>{template.name}</h5>
                  <p>{template.description}</p>
                  <div class="tpl-footer">
                    <span class="template-category">{template.category}</span>
                    {#if template.is_public}<span class="tpl-public"><i class="bi bi-globe"></i> Public</span>{/if}
                  </div>
                </div>
                <div class="template-use">Use template →</div>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </div>

  <!-- Create Template Modal -->
  {#if showCreateModal}
    <div class="notes-modal-overlay" on:click|self={() => showCreateModal = false} role="dialog">
      <div class="notes-modal" style="max-width:460px;padding:28px">
        <div class="modal-header-row">
          <h5><i class="bi bi-file-earmark-plus"></i> Save as Template</h5>
          <button class="icon-btn-sm" on:click={() => showCreateModal = false}><i class="bi bi-x-lg"></i></button>
        </div>
        <form on:submit|preventDefault={handleCreateTemplate}>
          <div class="mb-3">
            <label class="notes-label">Icon</label>
            <div class="tpl-icon-grid">
              {#each TEMPLATE_ICONS as ic}
                <button type="button" class="icon-pick-btn {newTemplate.icon === ic ? 'sel' : ''}" on:click={() => newTemplate.icon = ic}>
                  <i class="bi {ic}"></i>
                </button>
              {/each}
            </div>
          </div>
          <div class="mb-3">
            <label class="notes-label">Name <span class="req">*</span></label>
            <input class="notes-input" bind:value={newTemplate.name} placeholder="Template name" required autofocus />
          </div>
          <div class="mb-3">
            <label class="notes-label">Description</label>
            <input class="notes-input" bind:value={newTemplate.description} placeholder="Brief description..." />
          </div>
          <div class="mb-3 d-flex gap-2">
            <div style="flex:1">
              <label class="notes-label">Category</label>
              <select class="notes-input" bind:value={newTemplate.category}>
                {#each ['General','Meeting','Project','Personal','Technical','Business','Research'] as cat}
                  <option>{cat}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="notes-label">Public</label>
              <label class="toggle" style="display:flex;align-items:center;gap:8px;padding-top:10px">
                <input type="checkbox" bind:checked={newTemplate.is_public} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          <div class="modal-actions">
            <button type="submit" class="notes-btn notes-btn-primary" disabled={savingTemplate}>
              {#if savingTemplate}<span class="spinner-sm"></span>{/if} Save Template
            </button>
            <button type="button" class="notes-btn notes-btn-ghost" on:click={() => showCreateModal = false}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Edit Template Modal -->
  {#if showEditModal && editTemplate}
    <div class="notes-modal-overlay" on:click|self={() => showEditModal = false} role="dialog">
      <div class="notes-modal" style="max-width:460px;padding:28px">
        <div class="modal-header-row">
          <h5><i class="bi bi-pencil"></i> Edit Template</h5>
          <button class="icon-btn-sm" on:click={() => showEditModal = false}><i class="bi bi-x-lg"></i></button>
        </div>
        <form on:submit|preventDefault={handleUpdateTemplate}>
          <div class="mb-3">
            <label class="notes-label">Icon</label>
            <div class="tpl-icon-grid">
              {#each TEMPLATE_ICONS as ic}
                <button type="button" class="icon-pick-btn {editTemplate.icon === ic ? 'sel' : ''}" on:click={() => editTemplate.icon = ic}>
                  <i class="bi {ic}"></i>
                </button>
              {/each}
            </div>
          </div>
          <div class="mb-3">
            <label class="notes-label">Name</label>
            <input class="notes-input" bind:value={editTemplate.name} required />
          </div>
          <div class="mb-3">
            <label class="notes-label">Description</label>
            <input class="notes-input" bind:value={editTemplate.description} placeholder="Brief description..." />
          </div>
          <div class="mb-3 d-flex gap-2">
            <div style="flex:1">
              <label class="notes-label">Category</label>
              <select class="notes-input" bind:value={editTemplate.category}>
                {#each ['General','Meeting','Project','Personal','Technical','Business','Research'] as cat}
                  <option>{cat}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="notes-label">Public</label>
              <label class="toggle" style="display:flex;align-items:center;gap:8px;padding-top:10px">
                <input type="checkbox" bind:checked={editTemplate.is_public} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          <div class="modal-actions">
            <button type="submit" class="notes-btn notes-btn-primary" disabled={savingTemplate}>
              {#if savingTemplate}<span class="spinner-sm"></span>{/if} Save
            </button>
            <button type="button" class="notes-btn notes-btn-ghost" on:click={() => showEditModal = false}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- AI Generate Modal -->
  {#if showGenerateModal}
    <div class="notes-modal-overlay" on:click|self={() => showGenerateModal = false} role="dialog">
      <div class="notes-modal" style="max-width:500px;padding:28px">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h5 style="margin:0"><i class="bi bi-stars"></i> AI Note Generator</h5>
          <button class="icon-btn" on:click={() => showGenerateModal = false}><i class="bi bi-x-lg"></i></button>
        </div>

        <div class="mb-3">
          <label class="notes-label">What do you want to write about?</label>
          <textarea class="notes-input" rows="3" bind:value={generatePrompt} placeholder="e.g., Technical architecture for a microservices e-commerce platform"></textarea>
        </div>

        <div class="mb-3">
          <label class="notes-label">Additional context (optional)</label>
          <textarea class="notes-input" rows="2" bind:value={generateContext} placeholder="Any specific requirements, audience, format..."></textarea>
        </div>

        {#if generatedContent}
          <div class="generated-preview">
            <label class="notes-label">Preview (first 300 chars)</label>
            <p class="preview-text">{generatedContent.slice(0, 300)}...</p>
          </div>
          <div class="d-flex gap-2 mt-3">
            <button class="notes-btn notes-btn-primary flex-fill" on:click={createNoteFromGenerated}>
              <i class="bi bi-check-lg"></i> Create Note
            </button>
            <button class="notes-btn notes-btn-ghost" on:click={() => generatedContent = ''}>Regenerate</button>
          </div>
        {:else}
          <button class="notes-btn notes-btn-primary w-100" on:click={generateFromAI} disabled={generatingContent || !generatePrompt}>
            {#if generatingContent}<span class="spinner-sm"></span> Generating...{:else}<i class="bi bi-stars"></i> Generate with AI{/if}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</NotesLayout>

<style>
  .templates-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .templates-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .templates-header h2 { margin: 0 0 4px; font-size: 1.2rem; display: flex; align-items: center; gap: 10px; }
  .templates-header p { margin: 0; font-size: 13px; color: var(--text-muted); }
  .header-actions { display: flex; gap: 10px; flex-shrink: 0; }

  .category-filter {
    padding: 12px 24px;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
    scrollbar-width: none;
  }
  .category-filter::-webkit-scrollbar { display: none; }

  .cat-btn {
    padding: 6px 14px;
    border-radius: 14px;
    border: 1px solid var(--border-color);
    background: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    transition: all 0.15s;
  }
  .cat-btn:hover { border-color: var(--accent-color); color: var(--accent-color); }
  .cat-btn.active { background: var(--accent-color); color: #fff; border-color: transparent; }

  .templates-content { flex: 1; overflow-y: auto; padding: 20px 24px; }

  .template-section { margin-bottom: 28px; }

  .section-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 14px;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .template-card {
    display: flex;
    flex-direction: column;
    padding: 18px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }
  .template-card:hover { border-color: var(--accent-color); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
  .template-card:hover .template-use { opacity: 1; }
  .template-card:hover .template-card-actions { opacity: 1; }

  .template-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }

  .template-card-actions { display: flex; gap: 3px; opacity: 0; transition: opacity 0.15s; }
  .tpl-action-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border: none; border-radius: 4px;
    background: var(--bg-secondary); cursor: pointer; font-size: 12px; color: var(--text-secondary); transition: all 0.1s;
  }
  .tpl-action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .tpl-action-btn.danger:hover { background: #fee2e2; color: var(--danger-color); }

  .template-icon { font-size: 1.8rem; }
  .template-info { flex: 1; }
  .template-info h5 { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
  .template-info p { font-size: 12px; color: var(--text-muted); margin: 0 0 8px; }
  .template-category {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--bg-secondary);
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .template-use {
    font-size: 12px;
    color: var(--accent-color);
    margin-top: 12px;
    opacity: 0;
    transition: opacity 0.15s;
    font-weight: 500;
  }

  .generated-preview {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 12px;
    margin-bottom: 4px;
  }
  .preview-text { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0; white-space: pre-wrap; }

  .tpl-footer { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .tpl-public { font-size: 10px; color: var(--success-color); display: flex; align-items: center; gap: 3px; }

  .modal-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .modal-header-row h5 { margin: 0; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .icon-btn-sm { background: none; border: none; cursor: pointer; padding: 5px; border-radius: 4px; color: var(--text-muted); display: flex; align-items: center; }
  .icon-btn-sm:hover { background: var(--bg-hover); color: var(--text-primary); }

  .tpl-icon-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
  .icon-pick-btn {
    width: 32px; height: 32px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    background: var(--bg-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 14px; color: var(--text-secondary); transition: all 0.15s;
  }
  .icon-pick-btn:hover { border-color: var(--accent-color); color: var(--accent-color); }
  .icon-pick-btn.sel { border-color: var(--accent-color); background: var(--bg-active); color: var(--accent-color); }

  .modal-actions { display: flex; gap: 8px; margin-top: 16px; }

  .req { color: var(--danger-color); }

  /* toggle (reuse from settings) */
  .toggle { position: relative; display: inline-block; width: 38px; height: 21px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider { position: absolute; inset: 0; background: var(--border-color); border-radius: 21px; cursor: pointer; transition: 0.2s; }
  .toggle-slider::before { content: ''; position: absolute; width: 15px; height: 15px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
  .toggle input:checked + .toggle-slider { background: var(--accent-color); }
  .toggle input:checked + .toggle-slider::before { transform: translateX(17px); }

  .icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 4px; color: var(--text-muted); display: flex; align-items: center; }
  .w-100 { width: 100%; }
  .mb-3 { margin-bottom: 12px; }
  .mt-3 { margin-top: 12px; }
  .d-flex { display: flex; }
  .gap-2 { gap: 8px; }
  .flex-fill { flex: 1; }

  @media (max-width: 768px) {
    .templates-header {
      padding: 12px 12px;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    .templates-header h2 { font-size: 1.05rem; }
    .templates-header p { font-size: 12px; }
    .header-actions { flex-direction: column; width: 100%; }
    .header-actions .notes-btn { width: 100%; justify-content: center; }
    .category-filter { padding: 8px 12px; gap: 6px; }
    .cat-btn { padding: 5px 12px; font-size: 12px; }
    .templates-content { padding: 16px 12px; }
    .templates-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .template-card { padding: 14px; }
    .template-icon { font-size: 1.5rem; }
    .template-info h5 { font-size: 13px; }
    .template-info p { font-size: 11px; }
    .template-use { font-size: 11px; margin-top: 8px; }
  }
</style>
