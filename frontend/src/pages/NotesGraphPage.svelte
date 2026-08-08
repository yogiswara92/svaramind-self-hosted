<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import NotesLayout from '../components/NotesLayout.svelte';
  import GraphVisualization from '../components/GraphVisualization.svelte';
  import { graphApi } from '../lib/api';
  import { currentWorkspace } from '../stores/notes';
  import { goToNote } from '../stores/tabs';

  const ENTITY_ICONS: Record<string, string> = {
    person: 'bi-person',
    organization: 'bi-building',
    date: 'bi-calendar-event',
    project: 'bi-kanban',
    technology: 'bi-cpu',
    location: 'bi-geo-alt',
    concept: 'bi-lightbulb'
  };

  let nodes: any[] = [];
  let edges: any[] = [];
  let loading = false;
  let selectedNode: any = null;
  let graphRef: any;

  // Entity nodes aren't documents - selecting one shows which notes mention
  // it instead of a single "Open Note" action.
  let entityDocs: any[] = [];
  let loadingEntityDocs = false;

  async function loadGraph() {
    if (!$currentWorkspace) return;
    loading = true;
    try {
      const { nodes: n, edges: e } = await graphApi.get($currentWorkspace.id);
      nodes = n || [];
      edges = e || [];
    } catch {}
    loading = false;
  }

  $: if ($currentWorkspace) loadGraph();

  onMount(() => loadGraph());

  async function handleNodeSelect(e: CustomEvent) {
    selectedNode = e.detail;
    entityDocs = [];
    if (selectedNode.type === 'entity' && $currentWorkspace) {
      const entityId = String(selectedNode.id).replace(/^entity:/, '');
      loadingEntityDocs = true;
      try {
        const result = await graphApi.getEntityDocuments($currentWorkspace.id, entityId);
        entityDocs = result?.documents || [];
      } catch {}
      loadingEntityDocs = false;
    }
  }
</script>

<NotesLayout currentPage="graph">
  <div class="graph-page">
    <div class="graph-header">
      <div class="graph-title">
        <h2><i class="bi bi-diagram-3"></i> Knowledge Graph</h2>
        {#if $currentWorkspace}
          <span class="graph-subtitle">{$currentWorkspace.name}</span>
        {/if}
      </div>
      <div class="graph-meta">
        <span class="meta-badge"><i class="bi bi-circle-fill" style="color:var(--accent-color)"></i> {nodes.filter(n => n.type !== 'entity').length} notes</span>
        <span class="meta-badge"><i class="bi bi-tag-fill" style="color:#b45309"></i> {nodes.filter(n => n.type === 'entity').length} entities</span>
        <span class="meta-badge"><i class="bi bi-dash-lg"></i> {edges.length} connections</span>
        <button class="notes-btn notes-btn-ghost" on:click={loadGraph}>
          <i class="bi bi-arrow-clockwise"></i> Refresh
        </button>
        <button class="notes-btn notes-btn-ghost" on:click={() => graphRef?.expandNodes()} title="Spread nodes apart to avoid overlap">
          <i class="bi bi-fullscreen"></i> Expand
        </button>
        <button class="notes-btn notes-btn-ghost" on:click={() => graphRef?.resetLayout()} title="Reset node positions">
          <i class="bi bi-arrows-fullscreen"></i> Reset Layout
        </button>
      </div>
    </div>

    <div class="graph-container-wrapper">
      {#if loading}
        <div class="graph-loading">
          <div class="spinner-sm" style="width:32px;height:32px;border-width:3px;margin:0 auto 16px"></div>
          <p>Building knowledge graph...</p>
        </div>
      {:else if nodes.length === 0}
        <div class="graph-empty">
          <i class="bi bi-diagram-3" style="font-size:4rem;color:var(--text-muted)"></i>
          <h3>No notes to visualize</h3>
          <p>Create some notes first to see your knowledge graph</p>
          <button class="notes-btn notes-btn-primary" on:click={() => navigate('/')}>
            <i class="bi bi-plus-lg"></i> Create Notes
          </button>
        </div>
      {:else}
        <GraphVisualization bind:this={graphRef} {nodes} {edges} on:nodeSelect={handleNodeSelect} />
      {/if}
    </div>

    <!-- Selected node panel -->
    {#if selectedNode && selectedNode.type === 'entity'}
      <div class="node-detail-panel">
        <div class="node-detail-header">
          <i class="bi {ENTITY_ICONS[selectedNode.entityType] || 'bi-tag'} node-icon entity-icon"></i>
          <div class="node-title-info">
            <h5>{selectedNode.label}</h5>
            <span class="node-words">{selectedNode.entityType} · mentioned in {selectedNode.mention_count || 1} note{selectedNode.mention_count === 1 ? '' : 's'}</span>
          </div>
          <button class="icon-btn" on:click={() => { selectedNode = null; entityDocs = []; }}><i class="bi bi-x"></i></button>
        </div>
        {#if loadingEntityDocs}
          <div class="entity-docs-loading"><span class="spinner-sm" style="width:16px;height:16px;border-width:2px"></span></div>
        {:else if entityDocs.length === 0}
          <p class="entity-docs-empty">No notes found for this entity.</p>
        {:else}
          <div class="entity-docs-list">
            {#each entityDocs as doc}
              <button class="entity-doc-item" on:click={() => goToNote(doc.id)}>
                <i class="bi {doc.icon || 'bi-file-text'}"></i>
                <span>{doc.title || 'Untitled'}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else if selectedNode}
      <div class="node-detail-panel">
        <div class="node-detail-header">
          <i class="bi {selectedNode.icon || 'bi-file-text'} node-icon"></i>
          <div class="node-title-info">
            <h5>{selectedNode.label}</h5>
            {#if selectedNode.word_count}<span class="node-words">{selectedNode.word_count} words</span>{/if}
          </div>
          <button class="icon-btn" on:click={() => selectedNode = null}><i class="bi bi-x"></i></button>
        </div>
        {#if selectedNode.tags?.length > 0}
          <div class="node-tags">
            {#each selectedNode.tags as tag}
              <span class="node-tag">#{tag.name}</span>
            {/each}
          </div>
        {/if}
        <div class="node-connections">
          <span>{edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} connections</span>
        </div>
        <button class="notes-btn notes-btn-primary" style="width:100%;margin-top:8px" on:click={() => goToNote(selectedNode.id)}>
          <i class="bi bi-pencil"></i> Open Note
        </button>
      </div>
    {/if}
  </div>
</NotesLayout>

<style>
  .graph-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .graph-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .graph-title { display: flex; align-items: center; gap: 12px; }
  .graph-title h2 { margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; }
  .graph-subtitle { font-size: 13px; color: var(--text-muted); }

  .graph-meta { display: flex; align-items: center; gap: 12px; }
  .meta-badge { font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 5px; }

  .graph-container-wrapper {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .graph-loading, .graph-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--text-secondary);
    gap: 12px;
  }

  .graph-empty h3 { font-size: 1.2rem; margin: 0; }
  .graph-empty p { font-size: 13px; color: var(--text-muted); margin: 0; }

  .node-detail-panel {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 260px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 14px;
    box-shadow: var(--shadow-md);
    animation: modal-in 0.2s ease;
    z-index: 10;
  }

  .node-detail-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
  .node-icon { font-size: 1.5rem; flex-shrink: 0; color: var(--accent-color); }
  .node-title-info { flex: 1; }
  .node-title-info h5 { margin: 0; font-size: 14px; font-weight: 600; }
  .node-words { font-size: 11px; color: var(--text-muted); }

  .node-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .node-tag { font-size: 11px; color: var(--accent-color); background: var(--bg-active); padding: 2px 8px; border-radius: 10px; }

  .node-connections { font-size: 12px; color: var(--text-muted); }

  .entity-icon { color: #b45309; }
  .entity-docs-loading { display: flex; justify-content: center; padding: 12px 0; }
  .entity-docs-empty { font-size: 12px; color: var(--text-muted); margin: 0; }
  .entity-docs-list { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; }
  .entity-doc-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 7px 8px; border: none; border-radius: var(--radius-sm);
    background: none; cursor: pointer; font-size: 13px; text-align: left;
    color: var(--text-primary); transition: background 0.1s;
  }
  .entity-doc-item:hover { background: var(--bg-hover); }
  .entity-doc-item i { color: var(--text-muted); flex-shrink: 0; }
  .entity-doc-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .icon-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: var(--text-muted); display: flex; align-items: center; margin-left: auto; }

  @media (max-width: 768px) {
    .graph-header {
      padding: 10px 12px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .graph-title h2 { font-size: 1.05rem; }
    .graph-subtitle { display: none; }
    .graph-meta { gap: 8px; flex-wrap: wrap; }
    .meta-badge { font-size: 11px; }
    .notes-btn-ghost span { display: none; } /* hide button labels, keep icons */

    /* Node detail panel: full width at bottom on mobile */
    .node-detail-panel {
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
    }
  }
</style>
