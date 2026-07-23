<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { LLMConfig } from '../stores/settings';

  export let configs: LLMConfig[] = [];
  export let defaultId: string = '';

  const dispatch = createEventDispatcher();

  const PROVIDERS = [
    { value: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyPlaceholder: 'sk-or-v1-...' },
    { value: 'apilogy',    label: 'Apilogy (Telkom AI)', baseUrl: 'https://telkom-ai-dag.api.apilogy.id/Telkom-LLM/0.0.4/llm', keyPlaceholder: 'Apilogy API key' },
    { value: 'openai',     label: 'OpenAI Direct',    baseUrl: 'https://api.openai.com/v1', keyPlaceholder: 'sk-...' },
    { value: 'ollama',     label: 'Ollama (Local)',   baseUrl: 'http://localhost:11434/v1', keyPlaceholder: '(not required for local Ollama)' },
    { value: 'custom',     label: 'Custom (OpenAI-compatible)', baseUrl: '', keyPlaceholder: 'API key' }
  ];

  const SUGGESTED: Record<string, string[]> = {
    openrouter: ['mistralai/mistral-small-3.2-24b-instruct', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
    apilogy:    ['Qwen/Qwen2.5-32B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'telkom-ai-instruct', 'meta-llama/Llama-3.3-70B-Instruct'],
    openai:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
    ollama:     ['llama3.1', 'llama3.2', 'mistral', 'qwen2.5'],
    custom:     []
  };

  let editing: Partial<LLMConfig> | null = null;
  let isNew = false;

  function startAdd() {
    isNew = true;
    editing = { id: crypto.randomUUID(), name: '', provider: 'openrouter', model: '', api_key: '', base_url: 'https://openrouter.ai/api/v1' };
  }

  function startEdit(c: LLMConfig) {
    isNew = false;
    editing = { ...c };
  }

  function cancelEdit() { editing = null; }

  function saveEdit() {
    if (!editing?.name?.trim() || !editing?.model?.trim()) return;
    if (isNew) {
      configs = [...configs, editing as LLMConfig];
      if (configs.length === 1) defaultId = editing.id!;
    } else {
      configs = configs.map(c => c.id === editing!.id ? editing as LLMConfig : c);
    }
    editing = null;
    dispatch('change', { configs, defaultId });
  }

  function remove(id: string) {
    if (!confirm('Remove this model?')) return;
    configs = configs.filter(c => c.id !== id);
    if (defaultId === id) defaultId = configs[0]?.id || '';
    dispatch('change', { configs, defaultId });
  }

  function setDefault(id: string) {
    defaultId = id;
    dispatch('change', { configs, defaultId });
  }

  function onProviderChange() {
    if (!editing) return;
    const p = PROVIDERS.find(p => p.value === editing!.provider);
    editing.base_url = p?.baseUrl || '';
  }

  $: providerInfo = PROVIDERS.find(p => p.value === editing?.provider);
  $: suggestions = SUGGESTED[editing?.provider || 'openrouter'] || [];
</script>

<div class="lcm">
  <!-- Config list -->
  {#if configs.length === 0}
    <div class="lcm-empty">
      <i class="bi bi-robot"></i>
      <p>No models configured yet. Add one to get started.</p>
    </div>
  {:else}
    <div class="lcm-list">
      {#each configs as c}
        <div class="lcm-item {defaultId === c.id ? 'default' : ''}">
          <div class="lcm-item-main">
            <div class="lcm-item-name">
              {c.name}
              {#if defaultId === c.id}
                <span class="lcm-default-badge">Default</span>
              {/if}
            </div>
            <div class="lcm-item-meta">
              <span class="lcm-provider-tag">{c.provider}</span>
              <span class="lcm-model-id">{c.model}</span>
            </div>
          </div>
          <div class="lcm-item-actions">
            {#if defaultId !== c.id}
              <button class="lcm-btn-ghost" on:click={() => setDefault(c.id)} title="Set as default">
                <i class="bi bi-star"></i>
              </button>
            {/if}
            <button class="lcm-btn-ghost" on:click={() => startEdit(c)} title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="lcm-btn-danger" on:click={() => remove(c.id)} title="Remove">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if !editing}
    <button class="lcm-add-btn" on:click={startAdd}>
      <i class="bi bi-plus-lg"></i> Add Model
    </button>
  {/if}

  <!-- Edit/Add form -->
  {#if editing}
    <div class="lcm-form">
      <h4>{isNew ? 'Add Model' : 'Edit Model'}</h4>

      <div class="lcm-form-row">
        <label>Display Name</label>
        <input class="notes-input" bind:value={editing.name} placeholder="e.g. GPT-4o Fast" />
      </div>

      <div class="lcm-form-row">
        <label>Provider</label>
        <select class="notes-input" bind:value={editing.provider} on:change={onProviderChange}>
          {#each PROVIDERS as p}
            <option value={p.value}>{p.label}</option>
          {/each}
        </select>
      </div>

      <div class="lcm-form-row">
        <label>Model ID</label>
        <input class="notes-input" bind:value={editing.model} placeholder="e.g. openai/gpt-4o" />
        {#if suggestions.length > 0}
          <div class="lcm-chips">
            {#each suggestions as s}
              <button class="lcm-chip" on:click|preventDefault={() => editing && (editing.model = s)}>{s}</button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="lcm-form-row">
        <label>API Key {editing.provider === 'ollama' ? '(optional)' : ''}</label>
        <input class="notes-input" type="password" bind:value={editing.api_key} placeholder={providerInfo?.keyPlaceholder || 'API key'} />
      </div>

      {#if editing.provider === 'custom' || editing.provider === 'openai' || editing.provider === 'ollama'}
        <div class="lcm-form-row">
          <label>Base URL</label>
          <input class="notes-input" bind:value={editing.base_url} placeholder="https://..." />
        </div>
      {:else}
        <div class="lcm-form-row">
          <label>Base URL</label>
          <input class="notes-input" value={editing.base_url} disabled style="opacity:0.6" />
        </div>
      {/if}

      <div class="lcm-form-actions">
        <button class="lcm-btn-primary" on:click={saveEdit} disabled={!editing.name?.trim() || !editing.model?.trim()}>
          <i class="bi bi-check-lg"></i> {isNew ? 'Add' : 'Save'}
        </button>
        <button class="lcm-btn-ghost" on:click={cancelEdit}>Cancel</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .lcm { display: flex; flex-direction: column; gap: 8px; }

  .lcm-empty {
    text-align: center; padding: 24px; color: var(--text-muted);
    border: 1px dashed var(--border-color); border-radius: var(--radius-md);
    display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 13px;
  }
  .lcm-empty i { font-size: 1.8rem; }

  .lcm-list { display: flex; flex-direction: column; gap: 6px; }

  .lcm-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: var(--radius-md);
    border: 1px solid var(--border-color); background: var(--bg-primary);
    transition: border-color 0.15s;
  }
  .lcm-item.default { border-color: var(--accent-color); background: var(--bg-active); }

  .lcm-item-main { flex: 1; min-width: 0; }
  .lcm-item-name { font-size: 13px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 7px; }
  .lcm-default-badge { font-size: 10px; padding: 1px 7px; border-radius: 10px; background: var(--accent-color); color: #fff; font-weight: 500; }
  .lcm-item-meta { display: flex; gap: 8px; margin-top: 3px; }
  .lcm-provider-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--border-color); }
  .lcm-model-id { font-size: 11px; color: var(--text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .lcm-item-actions { display: flex; gap: 3px; flex-shrink: 0; }
  .lcm-btn-ghost, .lcm-btn-danger, .lcm-btn-primary {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 8px; border-radius: var(--radius-sm); font-size: 12px;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
  }
  .lcm-btn-ghost { border: 1px solid var(--border-color); background: none; color: var(--text-muted); }
  .lcm-btn-ghost:hover { background: var(--bg-hover); color: var(--text-primary); }
  .lcm-btn-danger { border: 1px solid transparent; background: none; color: var(--text-muted); }
  .lcm-btn-danger:hover { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,.08); }
  .lcm-btn-primary { border: none; background: var(--accent-color); color: #fff; padding: 6px 14px; }
  .lcm-btn-primary:disabled { opacity: 0.5; cursor: default; }
  .lcm-btn-primary:not(:disabled):hover { opacity: 0.88; }

  .lcm-add-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: var(--radius-sm);
    border: 1px dashed var(--accent-color); background: none;
    color: var(--accent-color); font-size: 13px; cursor: pointer;
    font-family: inherit; transition: all 0.15s; align-self: flex-start;
  }
  .lcm-add-btn:hover { background: var(--bg-active); }

  .lcm-form {
    border: 1px solid var(--border-color); border-radius: var(--radius-md);
    padding: 14px; background: var(--bg-secondary);
    display: flex; flex-direction: column; gap: 10px;
  }
  .lcm-form h4 { margin: 0; font-size: 13px; font-weight: 700; }
  .lcm-form-row { display: flex; flex-direction: column; gap: 5px; }
  .lcm-form-row label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
  .lcm-form-actions { display: flex; gap: 8px; margin-top: 4px; }

  .lcm-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .lcm-chip {
    padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border-color);
    background: var(--bg-primary); color: var(--text-muted);
    font-size: 11px; font-family: monospace; cursor: pointer; transition: all 0.15s;
  }
  .lcm-chip:hover { border-color: var(--accent-color); color: var(--accent-color); }
</style>
