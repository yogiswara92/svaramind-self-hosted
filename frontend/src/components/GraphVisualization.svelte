<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { documentApi } from '../lib/api';
  import { settings } from '../stores/settings';
  import { currentWorkspace, loadDocuments } from '../stores/notes';
  import { goToNote } from '../stores/tabs';

  export let nodes: any[] = [];
  export let edges: any[] = [];
  export { resetLayout };

  const dispatch = createEventDispatcher();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let animFrame: number;
  let simNodes: any[] = [];
  let simEdges: any[] = [];
  let hoveredNode: any = null;
  let selectedNode: any = null;
  let isDragging = false;
  let dragNode: any = null;
  let offsetX = 0, offsetY = 0;
  let transform = { x: 0, y: 0, scale: 1 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  const NODE_RADIUS = 28;
  const FONT_SIZE = 11;
  const COLORS = {
    node: '#132578',
    nodeHover: '#1e3a9e',
    nodeSelected: '#8b5cf6',
    edgeWikilink: '#132578',
    edgeRelated: '#f59e0b',
    edgeFolder: '#94a3b8',
    edge: '#94a3b8',
    text: '#1e1b4b',
    bg: '#f8fafc'
  };

  function getSavedPositions(): Record<string, {x: number, y: number}> {
    try { return JSON.parse(localStorage.getItem('notes_graph_pos') || '{}'); } catch { return {}; }
  }

  function savePositions() {
    const pos: Record<string, {x: number, y: number}> = {};
    for (const n of simNodes) pos[n.id] = { x: Math.round(n.x), y: Math.round(n.y) };
    localStorage.setItem('notes_graph_pos', JSON.stringify(pos));
    localStorage.setItem('notes_graph_transform', JSON.stringify(transform));
  }

  function initSimulation() {
    const saved = getSavedPositions();
    simNodes = nodes.map((n, i) => ({
      ...n,
      x: saved[n.id]?.x ?? (300 + Math.cos(i * 2 * Math.PI / nodes.length) * 200),
      y: saved[n.id]?.y ?? (300 + Math.sin(i * 2 * Math.PI / nodes.length) * 200),
      vx: 0, vy: 0,
      radius: NODE_RADIUS + Math.min(10, (n.word_count || 0) / 100)
    }));
    // Restore pan/zoom if saved
    try {
      const t = JSON.parse(localStorage.getItem('notes_graph_transform') || 'null');
      if (t) transform = t;
    } catch {}
    simEdges = edges.map(e => ({
      ...e,
      source: simNodes.find(n => n.id === e.source),
      target: simNodes.find(n => n.id === e.target)
    })).filter(e => e.source && e.target);
    runSimulation();
  }

  function runSimulation() {
    const ITERATIONS = 200;
    for (let iter = 0; iter < ITERATIONS; iter++) {
      const alpha = 1 - iter / ITERATIONS;
      // Repulsion
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i], b = simNodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          const force = (alpha * 2000) / (dist * dist);
          a.vx += dx * force / dist;
          a.vy += dy * force / dist;
          b.vx -= dx * force / dist;
          b.vy -= dy * force / dist;
        }
      }
      // Attraction (edges)
      for (const edge of simEdges) {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const force = alpha * 0.05 * (dist - 150);
        edge.source.vx += dx / dist * force;
        edge.source.vy += dy / dist * force;
        edge.target.vx -= dx / dist * force;
        edge.target.vy -= dy / dist * force;
      }
      // Center gravity
      for (const n of simNodes) {
        n.vx += (400 - n.x) * alpha * 0.02;
        n.vy += (300 - n.y) * alpha * 0.02;
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.8;
        n.vy *= 0.8;
      }
    }
  }

  function draw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Draw edges
    for (const edge of simEdges) {
      if (!edge.source || !edge.target) continue;
      const sx = edge.source.x, sy = edge.source.y;
      const tx = edge.target.x, ty = edge.target.y;
      const angle = Math.atan2(ty - sy, tx - sx);
      const r = (edge.target.radius || NODE_RADIUS) + 3;
      // End point at node circumference
      const ex = tx - Math.cos(angle) * r;
      const ey = ty - Math.sin(angle) * r;

      const color = edge.type === 'wikilink' ? COLORS.edgeWikilink
        : edge.type === 'related' ? COLORS.edgeRelated
        : COLORS.edgeFolder;
      const width = edge.type === 'wikilink' ? 2 : edge.type === 'related' ? 1.5 : 1;

      // Check if edge is connected to hovered node
      const isConnectedToHovered = hoveredNode && (
        edge.source.id === hoveredNode.id || edge.target.id === hoveredNode.id
      );

      // Set opacity based on hover state
      if (hoveredNode) {
        // Folder edges stay subtle even when highlighted, others get full opacity
        ctx.globalAlpha = isConnectedToHovered ? (edge.type === 'folder' ? 0.45 : 1) : 0.15;
      } else {
        ctx.globalAlpha = edge.type === 'folder' ? 0.3 : 0.75;
      }

      ctx.strokeStyle = isConnectedToHovered && hoveredNode ? '#8b5cf6' : color;
      ctx.lineWidth = isConnectedToHovered && hoveredNode ? (edge.type === 'folder' ? width : width + 1) : width;
      ctx.setLineDash(edge.type === 'related' ? [5, 3] : []);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Arrow head for wikilink and related
      if (edge.type !== 'folder') {
        ctx.setLineDash([]);
        ctx.fillStyle = isConnectedToHovered && hoveredNode ? '#8b5cf6' : color;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 10 * Math.cos(angle - 0.4), ey - 10 * Math.sin(angle - 0.4));
        ctx.lineTo(ex - 10 * Math.cos(angle + 0.4), ey - 10 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      }

      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Draw nodes
    for (const node of simNodes) {
      const r = node.radius || NODE_RADIUS;
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;

      // Shadow
      if (isHovered || isSelected) {
        ctx.shadowColor = COLORS.node;
        ctx.shadowBlur = 15;
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(node.x - r/4, node.y - r/4, 1, node.x, node.y, r);
      gradient.addColorStop(0, isSelected ? '#1e3a9e' : isHovered ? '#8b5cf6' : '#3a5fd4');
      gradient.addColorStop(1, isSelected ? '#132578' : isHovered ? '#132578' : '#0e1c5e');
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // First letter of title (canvas can't render BI CSS icons)
      const initials = (node.label || '?').slice(0, 2).toUpperCase();
      ctx.font = `600 ${Math.round(r * 0.55)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(initials, node.x, node.y);

      // Label below
      ctx.font = `${FONT_SIZE}px Inter, sans-serif`;
      ctx.fillStyle = COLORS.text;
      ctx.textBaseline = 'top';
      const label = node.label?.length > 18 ? node.label.slice(0, 16) + '…' : node.label;
      ctx.fillText(label, node.x, node.y + r + 4);

      // Tags badges
      if (node.tags?.length > 0 && (isHovered || isSelected)) {
        const tag = node.tags[0];
        if (tag) {
          ctx.font = '9px Inter, sans-serif';
          ctx.fillStyle = tag.color || '#6c757d';
          ctx.fillText(`#${tag.name}`, node.x, node.y + r + 18);
        }
      }
    }

    ctx.restore();
    animFrame = requestAnimationFrame(draw);
  }

  function getNodeAt(x: number, y: number) {
    const wx = (x - transform.x) / transform.scale;
    const wy = (y - transform.y) / transform.scale;
    return simNodes.find(n => {
      const dx = wx - n.x, dy = wy - n.y;
      return Math.sqrt(dx*dx + dy*dy) < (n.radius || NODE_RADIUS) + 4;
    });
  }

  function handleMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    if (isPanning) {
      transform.x = panStart.x + (e.clientX - offsetX);
      transform.y = panStart.y + (e.clientY - offsetY);
      return;
    }
    if (dragNode) {
      dragNode.x = (x - transform.x) / transform.scale;
      dragNode.y = (y - transform.y) / transform.scale;
      return;
    }
    const node = getNodeAt(x, y);
    hoveredNode = node || null;
    canvas.style.cursor = node ? 'pointer' : 'default';
  }

  function handleMouseDown(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const node = getNodeAt(x, y);

    if (node) {
      dragNode = node;
      isDragging = false;
    } else {
      isPanning = true;
      panStart = { x: transform.x, y: transform.y };
      offsetX = e.clientX;
      offsetY = e.clientY;
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (dragNode && !isDragging) {
      if (selectedNode?.id === dragNode.id) {
        goToNote(dragNode.id);
      } else {
        selectedNode = dragNode;
        dispatch('nodeSelect', dragNode);
      }
    }
    dragNode = null;
    isDragging = false;
    isPanning = false;
    savePositions();
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    transform.scale = Math.max(0.3, Math.min(3, transform.scale * delta));
  }

  // ── Touch support ─────────────────────────────────────────────────────────
  let lastTouchDist = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;

  function getTouchPos(touch: Touch) {
    const rect = canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      const { x, y } = getTouchPos(e.touches[0]);
      const node = getNodeAt(x, y);
      if (node) {
        dragNode = node;
        isDragging = false;
      } else {
        isPanning = true;
        panStart = { x: transform.x, y: transform.y };
        offsetX = e.touches[0].clientX;
        offsetY = e.touches[0].clientY;
      }
    } else if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 1) {
      const { x, y } = getTouchPos(e.touches[0]);
      if (dragNode) {
        isDragging = true;
        dragNode.x = (x - transform.x) / transform.scale;
        dragNode.y = (y - transform.y) / transform.scale;
        dragNode.vx = 0; dragNode.vy = 0;
      } else if (isPanning) {
        transform.x = panStart.x + (e.touches[0].clientX - offsetX);
        transform.y = panStart.y + (e.touches[0].clientY - offsetY);
      }
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist / lastTouchDist;
      transform.scale = Math.max(0.3, Math.min(3, transform.scale * delta));
      lastTouchDist = dist;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (dragNode && !isDragging) {
      if (selectedNode?.id === dragNode.id) goToNote(dragNode.id);
      else { selectedNode = dragNode; dispatch('nodeSelect', dragNode); }
    }
    dragNode = null;
    isDragging = false;
    isPanning = false;
    savePositions();
  }

  function resetView() {
    transform = { x: 0, y: 0, scale: 1 };
    savePositions();
  }

  function resetLayout() {
    localStorage.removeItem('notes_graph_pos');
    localStorage.removeItem('notes_graph_transform');
    transform = { x: 0, y: 0, scale: 1 };
    initSimulation();
  }

  export function expandNodes() {
    // Push all nodes away from center with extra repulsion burst
    const cx = canvas.width / 2, cy = canvas.height / 2;
    for (const n of simNodes) {
      const dx = n.x - cx, dy = n.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const push = 200 / dist;
      n.vx += dx * push;
      n.vy += dy * push;
    }
    // Re-run a short simulation pass to settle
    for (let iter = 0; iter < 80; iter++) {
      const alpha = 1 - iter / 80;
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i], b = simNodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 180) {
            const f = (alpha * 3000) / (dist * dist);
            a.vx += dx * f / dist; a.vy += dy * f / dist;
            b.vx -= dx * f / dist; b.vy -= dy * f / dist;
          }
        }
      }
      for (const n of simNodes) {
        n.x += n.vx * 0.6; n.y += n.vy * 0.6;
        n.vx *= 0.5;       n.vy *= 0.5;
      }
    }
    savePositions();
  }

  // Re-run whenever nodes OR edges change
  $: nodes, edges, (() => { if (nodes.length > 0) initSimulation(); })();

  onMount(() => {
    ctx = canvas.getContext('2d')!;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    if (nodes.length > 0) initSimulation();
    animFrame = requestAnimationFrame(draw);

    const resizeObserver = new ResizeObserver(() => {
      if (canvas) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      }
    });
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  });

  onDestroy(() => {
    cancelAnimationFrame(animFrame);
  });
</script>

<div class="graph-container">
  <canvas
    bind:this={canvas}
    class="graph-canvas"
    on:mousemove={handleMouseMove}
    on:mousedown={handleMouseDown}
    on:mouseup={handleMouseUp}
    on:mouseleave={() => { hoveredNode = null; dragNode = null; isPanning = false; }}
    on:wheel|nonpassive={handleWheel}
    on:touchstart|nonpassive={handleTouchStart}
    on:touchmove|nonpassive={handleTouchMove}
    on:touchend={handleTouchEnd}
  ></canvas>

  <!-- Controls -->
  <div class="graph-controls">
    <button class="graph-btn" on:click={resetView} title="Reset view"><i class="bi bi-arrows-fullscreen"></i></button>
    <button class="graph-btn" on:click={() => transform.scale = Math.min(3, transform.scale * 1.2)} title="Zoom in"><i class="bi bi-zoom-in"></i></button>
    <button class="graph-btn" on:click={() => transform.scale = Math.max(0.3, transform.scale / 1.2)} title="Zoom out"><i class="bi bi-zoom-out"></i></button>
  </div>

  <!-- Node tooltip -->
  {#if hoveredNode}
    <div class="graph-tooltip" style="left:{(hoveredNode.x * transform.scale + transform.x + 40)}px;top:{(hoveredNode.y * transform.scale + transform.y - 20)}px">
      <div class="tooltip-title"><i class="bi {hoveredNode.icon || 'bi-file-text'}"></i> {hoveredNode.label}</div>
      {#if hoveredNode.word_count}<div class="tooltip-meta">{hoveredNode.word_count} words</div>{/if}
      {#if hoveredNode.tags?.length > 0}
        <div class="tooltip-tags">
          {#each hoveredNode.tags.slice(0, 3) as tag}
            <span>#{tag.name}</span>
          {/each}
        </div>
      {/if}
      <div class="tooltip-hint">Click to select · Double-click to open</div>
    </div>
  {/if}

  <!-- Legend -->
  <div class="graph-legend">
    <div class="legend-item"><span class="legend-dot" style="background:#132578"></span> Wikilink [[...]]</div>
    <div class="legend-item"><span class="legend-dot legend-dashed" style="background:#f59e0b"></span> AI Related</div>
    <div class="legend-item"><span class="legend-dot" style="background:#94a3b8;opacity:0.5"></span> Same folder</div>
    <div class="legend-item"><i class="bi bi-info-circle"></i> {nodes.length} notes, {edges.length} connections</div>
  </div>
</div>

<style>
  .graph-container {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .graph-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .graph-controls {
    position: absolute;
    bottom: 60px;
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .graph-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--text-secondary);
    box-shadow: var(--shadow-sm);
    transition: all 0.15s;
  }
  .graph-btn:hover { background: var(--bg-hover); color: var(--accent-color); }

  .graph-tooltip {
    position: absolute;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    box-shadow: var(--shadow-md);
    pointer-events: none;
    z-index: 10;
    min-width: 160px;
    max-width: 220px;
    font-size: 12px;
  }

  .tooltip-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .tooltip-meta { color: var(--text-muted); }
  .tooltip-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .tooltip-tags span { font-size: 11px; color: var(--accent-color); background: var(--bg-active); padding: 1px 6px; border-radius: 10px; }
  .tooltip-hint { font-size: 10px; color: var(--text-muted); margin-top: 6px; }

  .graph-legend {
    position: absolute;
    bottom: 16px;
    left: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .legend-item { display: flex; align-items: center; gap: 5px; }
  .legend-dot { width: 16px; height: 3px; border-radius: 2px; display: block; flex-shrink: 0; }
  .legend-dashed { background: repeating-linear-gradient(90deg, #f59e0b 0 5px, transparent 5px 8px) !important; }
</style>
