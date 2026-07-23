<script lang="ts">
  export let provider = 'openrouter';
  export let apiKey = '';
  export let model = '';
  export let baseUrl = '';
  export let showModel = true;
  export let providers: Array<{ value: string; label: string; baseUrl: string; keyPlaceholder: string }> = [];
  export let suggestedModels: Record<string, string[]> = {};

  $: providerInfo = providers.find(p => p.value === provider);
  $: suggestions = suggestedModels[provider] || [];

  function onProviderChange() {
    const p = providers.find(p => p.value === provider);
    if (p) baseUrl = p.baseUrl;
    model = suggestedModels[provider]?.[0] ?? model;
  }
</script>

<div class="pcb">
  <div class="pcb-row">
    <label class="pcb-label">Provider</label>
    <select class="notes-input" bind:value={provider} on:change={onProviderChange}>
      {#each providers as p}
        <option value={p.value}>{p.label}</option>
      {/each}
    </select>
  </div>

  <div class="pcb-row">
    <label class="pcb-label">API Key</label>
    <input
      class="notes-input"
      type="password"
      bind:value={apiKey}
      placeholder={providerInfo?.keyPlaceholder ?? 'API key'}
    />
  </div>

  {#if showModel}
    <div class="pcb-row">
      <label class="pcb-label">Model</label>
      <input class="notes-input" bind:value={model} placeholder="Model ID" />
      {#if suggestions.length > 0}
        <div class="pcb-chips">
          {#each suggestions as s}
            <button class="pcb-chip" type="button" on:click={() => model = s}>{s}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="pcb-row">
    <label class="pcb-label">Base URL</label>
    {#if provider === 'custom' || provider === 'ollama'}
      <input class="notes-input" bind:value={baseUrl} placeholder="https://..." />
    {:else}
      <input class="notes-input" value={baseUrl} disabled style="opacity:0.55" />
    {/if}
  </div>
</div>

<style>
  .pcb { display: flex; flex-direction: column; gap: 8px; }

  .pcb-row { display: flex; flex-direction: column; gap: 4px; }

  .pcb-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .pcb-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .pcb-chip {
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-muted);
    font-size: 11px;
    font-family: monospace;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pcb-chip:hover { border-color: var(--accent-color); color: var(--accent-color); }
</style>
