<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  export let xml: string = '';
  export let svg: string = '';
  export let editable = true;

  const dispatch = createEventDispatcher();
  let iframe: HTMLIFrameElement;
  let isEditing = false;
  let localSvg = svg;

  const DRAWIO_URL = 'https://embed.diagrams.net/?embed=1&ui=atlas&spin=1&modified=unsavedChanges&proto=json&stealth=1';

  function openEditor() {
    isEditing = true;
  }

  function handleMessage(event: MessageEvent) {
    if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return;
    try {
      const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

      if (msg.event === 'init') {
        iframe.contentWindow?.postMessage(JSON.stringify({
          action: 'load',
          xml: xml || '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
          autosave: 1
        }), '*');
      } else if (msg.event === 'export') {
        localSvg = msg.data || '';
        dispatch('save', { xml: msg.xml, svg: localSvg });
        xml = msg.xml;
        isEditing = false;
      } else if (msg.event === 'save') {
        iframe.contentWindow?.postMessage(JSON.stringify({ action: 'export', format: 'xmlsvg', spinKey: 'export' }), '*');
      } else if (msg.event === 'exit') {
        isEditing = false;
      }
    } catch {}
  }

  onMount(() => { window.addEventListener('message', handleMessage); });
  onDestroy(() => { window.removeEventListener('message', handleMessage); });
</script>

<div class="drawio-wrapper">
  {#if isEditing}
    <!-- Full editor iframe -->
    <div class="drawio-editor-overlay">
      <div class="drawio-editor-header">
        <span><i class="bi bi-diagram-3"></i> Draw.io Diagram Editor</span>
        <button class="notes-btn notes-btn-ghost" on:click={() => isEditing = false}>
          <i class="bi bi-x-lg"></i> Close
        </button>
      </div>
      <iframe
        bind:this={iframe}
        src={DRAWIO_URL}
        class="drawio-iframe"
        title="Draw.io Editor"
        frameborder="0"
        allowfullscreen
      ></iframe>
    </div>
  {:else if xml}
    <!-- Preview mode -->
    <div class="drawio-preview">
      <div class="drawio-toolbar">
        <span class="drawio-label"><i class="bi bi-diagram-3"></i> Diagram</span>
        <div style="display:flex;gap:6px;align-items:center">
          {#if editable}
            <button class="notes-btn notes-btn-ghost" style="font-size:12px" on:click={openEditor}>
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button class="notes-btn notes-btn-ghost" style="font-size:12px;color:var(--danger-color)" on:click={() => dispatch('remove')} title="Remove diagram">
              <i class="bi bi-trash"></i>
            </button>
          {/if}
        </div>
      </div>
      <div class="drawio-svg-container">
        {#if localSvg}
          <div class="drawio-preview-img" on:click={openEditor} role="button" tabindex="0" title="Click to edit">
            <img src={localSvg} alt="Diagram" />
          </div>
        {:else}
          <div class="drawio-placeholder">
            <i class="bi bi-diagram-3" style="font-size:3rem;color:var(--text-muted)"></i>
            <p>Diagram saved</p>
            <button class="notes-btn notes-btn-ghost" on:click={openEditor}>Open Editor</button>
          </div>
        {/if}
      </div>
    </div>
  {:else if editable}
    <!-- Empty state -->
    <div class="drawio-empty" on:click={openEditor} role="button" tabindex="0">
      <i class="bi bi-diagram-3" style="font-size:2.5rem;color:var(--text-muted)"></i>
      <p>Click to create a diagram</p>
      <p class="hint">Powered by Draw.io — supports flowcharts, UML, architecture diagrams, and more</p>
      <button class="notes-btn notes-btn-primary mt-2" on:click|stopPropagation={openEditor}>
        <i class="bi bi-plus-lg"></i> Create Diagram
      </button>
    </div>
  {/if}
</div>

<style>
  .drawio-wrapper { width: 100%; }

  .drawio-editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .drawio-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    font-weight: 600;
    font-size: 14px;
  }

  .drawio-iframe {
    flex: 1;
    border: none;
  }

  .drawio-preview {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .drawio-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }

  .drawio-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; }

  .drawio-svg-container { padding: 16px; }
  .drawio-placeholder { text-align: center; padding: 24px; color: var(--text-secondary); }

  .drawio-preview-img {
    cursor: pointer;
    border-radius: var(--radius-sm);
    overflow: hidden;
    transition: opacity 0.15s;
  }
  .drawio-preview-img:hover { opacity: 0.85; }
  .drawio-preview-img img {
    width: 100%;
    height: auto;
    display: block;
    max-height: 500px;
    object-fit: contain;
    background: #fff;
  }

  .drawio-empty {
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-md);
    padding: 32px;
    text-align: center;
    cursor: pointer;
    transition: all 0.15s;
    color: var(--text-secondary);
  }
  .drawio-empty:hover { border-color: var(--accent-color); background: var(--bg-active); }
  .drawio-empty p { margin: 8px 0; font-size: 14px; }
  .drawio-empty .hint { font-size: 12px; color: var(--text-muted); }
  .mt-2 { margin-top: 8px; }
</style>
