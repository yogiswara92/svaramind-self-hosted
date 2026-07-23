<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let html = '';
  const dispatch = createEventDispatcher();

  function download() {
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'presentation.html';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openNewTab() {
    const w = window.open('', '_blank');
    w?.document.write(html);
    w?.document.close();
  }
</script>

<div class="pres-overlay" on:click|self={() => dispatch('close')} role="dialog">
  <div class="pres-modal">
    <div class="pres-toolbar">
      <span class="pres-title"><i class="bi bi-easel2"></i> Presentation Preview</span>
      <div class="pres-actions">
        <button class="pres-btn" on:click={openNewTab} title="Open fullscreen in new tab">
          <i class="bi bi-box-arrow-up-right"></i> Fullscreen
        </button>
        <button class="pres-btn" on:click={download} title="Download HTML">
          <i class="bi bi-download"></i> Download
        </button>
        <button class="pres-btn pres-close" on:click={() => dispatch('close')} title="Close">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </div>
    <div class="pres-frame-wrap">
      <iframe
        class="pres-frame"
        srcdoc={html}
        sandbox="allow-scripts allow-same-origin"
        title="Presentation Preview"
      ></iframe>
    </div>
  </div>
</div>

<style>
  .pres-overlay {
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    backdrop-filter: blur(4px);
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .pres-modal {
    width: 100%; max-width: 1100px; height: 90vh;
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 80px rgba(0,0,0,0.4);
    animation: slideUp 0.25s ease;
  }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }

  .pres-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }
  .pres-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 7px; color: var(--text-primary); }
  .pres-actions { display: flex; align-items: center; gap: 6px; }
  .pres-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-color); background: var(--bg-primary);
    color: var(--text-secondary); font-size: 12px; cursor: pointer;
    transition: all 0.15s; font-family: inherit;
  }
  .pres-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .pres-close { border-color: transparent; }
  .pres-close:hover { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,.08); }

  .pres-frame-wrap { flex: 1; overflow: hidden; }
  .pres-frame { width: 100%; height: 100%; border: none; display: block; }

  @media (max-width: 768px) {
    .pres-overlay { padding: 0; }
    .pres-modal { border-radius: 0; height: 100vh; max-width: 100%; }
  }
</style>
