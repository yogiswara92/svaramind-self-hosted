<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { aiApi } from '../lib/api';
  import { currentWorkspace } from '../stores/notes';
  import { settings } from '../stores/settings';
  import PresentationPreview from './PresentationPreview.svelte';

  type Source = { id: string; title: string; icon?: string; score?: number | null };
  type Message = {
    role: 'user' | 'assistant';
    content: string;
    toolsUsed?: string[];
    sources?: Source[];
    presentation?: string;
    error?: boolean;
  };

  let open = false;
  let loading = false;
  let input = '';
  let messages: Message[] = [];
  let scrollEl: HTMLElement;
  let inputEl: HTMLTextAreaElement;
  let presentation: string | null = null;
  let openSources: Set<number> = new Set();
  let isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });
  }
  let selectedLlmConfigId = '';
  $: if (!selectedLlmConfigId && $settings.default_llm_config) {
    selectedLlmConfigId = $settings.default_llm_config;
  }

  const TOOL_LABELS: Record<string, string> = {
    search_notes:          '🔍 Searching notes',
    list_todos:            '📋 Listing todos',
    create_todo:           '✅ Creating todo',
    toggle_todo:           '🔄 Updating todo',
    delete_todo:           '🗑 Deleting todo',
    generate_presentation: '🎨 Generating presentation'
  };

  function toggle() {
    open = !open;
    if (open) tick().then(() => inputEl?.focus());
  }

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    input = '';

    messages = [...messages, { role: 'user', content: q }];
    loading = true;
    await scrollBottom();

    try {
      const history = messages.slice(-12).slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      const res = await aiApi.globalChat(q, history, $currentWorkspace?.id, selectedLlmConfigId || undefined);

      const msg: Message = {
        role: 'assistant',
        content: res.answer || '',
        toolsUsed: res.toolsUsed || [],
        sources: res.sources || [],
        presentation: res.presentation || null
      };
      messages = [...messages, msg];
      if (res.presentation) presentation = res.presentation;
    } catch (err: any) {
      messages = [...messages, { role: 'assistant', content: `Error: ${err.message}`, error: true }];
    }
    loading = false;
    await scrollBottom();
    inputEl?.focus();
  }

  async function scrollBottom() {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function handleKey(e: KeyboardEvent) {
    // On mobile: Enter = new line (use send button). On desktop: Enter = send, Shift+Enter = new line.
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) { e.preventDefault(); send(); }
  }

  function autoResize(e: Event) {
    const t = e.target as HTMLTextAreaElement;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
  }

  function clearChat() { messages = []; presentation = null; }

  // Suggestions
  const suggestions = [
    '📝 What are my recent notes about?',
    '✅ Show my todo list',
    '🎯 Create a todo: review project plan',
    '📊 Make a presentation about productivity'
  ];

  // Format text with basic markdown
  function formatText(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }
</script>

<!-- Floating toggle button -->
<button
  class="gc-fab {open ? 'open' : ''}"
  on:click={toggle}
  title="{open ? 'Close' : 'Open'} AI Assistant"
  aria-label="AI Assistant"
>
  {#if open}
    <i class="bi bi-x-lg"></i>
  {:else}
    <i class="bi bi-stars"></i>
    {#if messages.length > 0}
      <span class="gc-fab-badge">{messages.filter(m => m.role === 'assistant').length}</span>
    {/if}
  {/if}
</button>

<!-- Mobile backdrop -->
{#if open}
  <button class="gc-backdrop" on:click={toggle} aria-label="Close AI Assistant"></button>
{/if}

<!-- Chat panel -->
{#if open}
  <div class="gc-panel" role="dialog" aria-label="AI Assistant">
    <!-- Header -->
    <div class="gc-header">
      <div class="gc-header-left">
        <i class="bi bi-stars gc-logo"></i>
        <div>
          <span class="gc-title">AI Assistant</span>
          <span class="gc-subtitle">All notes · Todos · Presentations</span>
        </div>
      </div>
      <div class="gc-header-right">
        {#if $settings.llm_configs?.length > 0}
          <select class="gc-model-picker" bind:value={selectedLlmConfigId} title="Select model">
            {#each $settings.llm_configs as cfg}
              <option value={cfg.id}>{cfg.name}</option>
            {/each}
          </select>
        {/if}
        {#if messages.length > 0}
          <button class="gc-icon-btn" on:click={clearChat} title="Clear chat">
            <i class="bi bi-trash3"></i>
          </button>
        {/if}
        <button class="gc-icon-btn" on:click={toggle} title="Close">
          <i class="bi bi-chevron-down"></i>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div class="gc-messages" bind:this={scrollEl}>
      {#if messages.length === 0}
        <div class="gc-welcome">
          <div class="gc-welcome-icon"><i class="bi bi-stars"></i></div>
          <p class="gc-welcome-text">Hi! I can search your notes, manage todos, and create presentations.</p>
          <div class="gc-suggestions">
            {#each suggestions as s}
              <button class="gc-suggestion" on:click={() => { input = s.replace(/^[^\s]+\s/, ''); send(); }}>
                {s}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        {#each messages as msg}
          <div class="gc-msg gc-msg-{msg.role} {msg.error ? 'error' : ''}">
            {#if msg.role === 'assistant'}
              <div class="gc-msg-avatar"><i class="bi bi-stars"></i></div>
            {/if}
            <div class="gc-msg-body">
              {#if msg.toolsUsed?.length}
                <div class="gc-tools-used">
                  {#each msg.toolsUsed as t}
                    <span class="gc-tool-chip">{TOOL_LABELS[t] || t}</span>
                  {/each}
                </div>
              {/if}
              <div class="gc-msg-text">
                {#if msg.role === 'assistant'}
                  <p>{@html formatText(msg.content)}</p>
                {:else}
                  <span class="gc-user-text">{msg.content}</span>
                {/if}
              </div>
              {#if msg.sources?.length}
                {@const idx = messages.indexOf(msg)}
                <div class="gc-sources">
                  <button class="gc-sources-toggle" on:click={() => {
                    if (openSources.has(idx)) openSources.delete(idx);
                    else openSources.add(idx);
                    openSources = openSources;
                  }}>
                    <i class="bi bi-journals"></i>
                    {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''}
                    <i class="bi bi-chevron-{openSources.has(idx) ? 'up' : 'down'}"></i>
                  </button>
                  {#if openSources.has(idx)}
                    <div class="gc-sources-list">
                      {#each msg.sources as src}
                        <a class="gc-source-item" href="/doc/{src.id}" target="_blank" rel="noopener">
                          <i class="bi {src.icon || 'bi-file-text'}"></i>
                          <span class="gc-source-title">{src.title}</span>
                          {#if src.score != null}
                            <span class="gc-source-score">{src.score}%</span>
                          {/if}
                        </a>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              {#if msg.presentation}
                <button class="gc-pres-btn" on:click={() => presentation = msg.presentation || null}>
                  <i class="bi bi-easel2"></i> View Presentation
                </button>
              {/if}
            </div>
          </div>
        {/each}

        {#if loading}
          <div class="gc-msg gc-msg-assistant">
            <div class="gc-msg-avatar"><i class="bi bi-stars"></i></div>
            <div class="gc-msg-body">
              <div class="gc-typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Input -->
    <div class="gc-input-area">
      <textarea
        bind:this={inputEl}
        bind:value={input}
        class="gc-input"
        placeholder="Ask anything about your notes…"
        rows="1"
        on:keydown={handleKey}
        on:input={autoResize}
      ></textarea>
      <button class="gc-send-btn" on:click={send} disabled={loading || !input.trim()} title="Send (Enter)">
        {#if loading}
          <span class="gc-spinner"></span>
        {:else}
          <i class="bi bi-send-fill"></i>
        {/if}
      </button>
    </div>
  </div>
{/if}

<!-- Presentation preview modal -->
{#if presentation}
  <PresentationPreview html={presentation} on:close={() => presentation = null} />
{/if}

<style>
  /* ── FAB button ── */
  .gc-fab {
    position: fixed;
    bottom: 24px; right: 24px;
    width: 52px; height: 52px;
    border-radius: 50%;
    border: none;
    background: var(--accent-color);
    color: #fff;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(19,37,120,.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 1500;
    transition: all 0.2s;
  }
  .gc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(19,37,120,.55); }
  .gc-fab.open { background: var(--bg-secondary); color: var(--text-secondary); box-shadow: 0 2px 10px rgba(0,0,0,.15); }

  .gc-fab-badge {
    position: absolute; top: -3px; right: -3px;
    background: #ef4444; color: #fff;
    font-size: 10px; font-weight: 700;
    min-width: 18px; height: 18px;
    border-radius: 9px; padding: 0 4px;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--bg-primary);
  }

  /* ── Panel ── */
  .gc-panel {
    position: fixed;
    bottom: 88px; right: 24px;
    width: 380px; max-width: calc(100vw - 48px);
    height: 560px; max-height: calc(100vh - 120px);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 56px rgba(0,0,0,.18);
    display: flex; flex-direction: column;
    z-index: 1499;
    animation: gc-rise 0.22s ease;
  }
  @keyframes gc-rise { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: none; } }

  /* ── Header ── */
  .gc-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }
  .gc-header-left { display: flex; align-items: center; gap: 10px; }
  .gc-logo { font-size: 20px; color: var(--accent-color); }
  .gc-title { font-size: 14px; font-weight: 700; color: var(--text-primary); display: block; line-height: 1.2; }
  .gc-subtitle { font-size: 11px; color: var(--text-muted); display: block; }
  .gc-header-right { display: flex; gap: 4px; align-items: center; }

  .gc-model-picker {
    padding: 3px 7px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: none;
    color: var(--text-muted);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gc-model-picker:hover, .gc-model-picker:focus { border-color: var(--accent-color); color: var(--accent-color); }
  .gc-icon-btn {
    background: none; border: none; cursor: pointer; padding: 5px;
    color: var(--text-muted); border-radius: 6px; font-size: 14px;
    transition: all 0.15s;
  }
  .gc-icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

  /* ── Messages ── */
  .gc-messages {
    flex: 1; overflow-y: auto; padding: 14px;
    display: flex; flex-direction: column; gap: 14px;
    scroll-behavior: smooth;
  }

  .gc-welcome {
    text-align: center; padding: 20px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }
  .gc-welcome-icon { font-size: 2.5rem; color: var(--accent-color); opacity: 0.8; }
  .gc-welcome-text { font-size: 13px; color: var(--text-secondary); margin: 0; line-height: 1.5; }
  .gc-suggestions { display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .gc-suggestion {
    text-align: left; padding: 8px 12px;
    border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    background: var(--bg-secondary); color: var(--text-secondary);
    font-size: 12px; cursor: pointer; font-family: inherit;
    transition: all 0.15s;
  }
  .gc-suggestion:hover { border-color: var(--accent-color); color: var(--accent-color); background: var(--bg-active); }

  /* ── Message bubbles ── */
  .gc-msg { display: flex; gap: 8px; align-items: flex-start; }
  .gc-msg-user { flex-direction: row-reverse; }

  .gc-msg-avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--accent-color); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; flex-shrink: 0;
  }

  .gc-msg-body { max-width: 85%; display: flex; flex-direction: column; gap: 4px; }

  .gc-msg-user .gc-msg-body {
    background: var(--accent-color); color: #fff;
    padding: 9px 12px; border-radius: 14px 14px 4px 14px;
    font-size: 13px; line-height: 1.5;
  }
  .gc-msg-assistant .gc-msg-body {
    background: var(--bg-secondary);
    padding: 9px 12px; border-radius: 4px 14px 14px 14px;
    font-size: 13px; line-height: 1.5;
  }
  .gc-msg.error .gc-msg-body { background: rgba(239,68,68,.1); color: #ef4444; }

  .gc-msg-text p { margin: 0 0 6px; }
  .gc-msg-text p:last-child { margin: 0; }
  .gc-msg-text :global(code) { background: rgba(0,0,0,.1); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  .gc-msg-text :global(strong) { font-weight: 600; }
  .gc-user-text { white-space: pre-wrap; word-break: break-word; }

  .gc-tools-used { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .gc-tool-chip {
    font-size: 10px; padding: 2px 7px;
    border-radius: 10px; background: rgba(19,37,120,.12);
    color: var(--accent-color); border: 1px solid rgba(19,37,120,.2);
  }

  /* Sources */
  .gc-sources { margin-top: 8px; }
  .gc-sources-toggle {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 8px; border-radius: 20px;
    border: 1px solid var(--border-color); background: var(--bg-primary);
    color: var(--text-muted); font-size: 11px; cursor: pointer;
    font-family: inherit; transition: all 0.15s;
  }
  .gc-sources-toggle:hover { border-color: var(--accent-color); color: var(--accent-color); }
  .gc-sources-list { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
  .gc-source-item {
    display: flex; align-items: center; gap: 7px;
    padding: 5px 8px; border-radius: var(--radius-sm);
    background: var(--bg-primary); border: 1px solid var(--border-color);
    text-decoration: none; color: var(--text-secondary);
    font-size: 11.5px; transition: all 0.15s;
  }
  .gc-source-item:hover { border-color: var(--accent-color); color: var(--accent-color); background: var(--bg-active); }
  .gc-source-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gc-source-score { font-size: 10px; color: var(--text-muted); flex-shrink: 0; background: var(--bg-secondary); padding: 1px 5px; border-radius: 8px; }

  .gc-pres-btn {
    display: inline-flex; align-items: center; gap: 5px;
    margin-top: 8px; padding: 6px 12px;
    border: 1px solid var(--accent-color); border-radius: var(--radius-sm);
    background: rgba(19,37,120,.08); color: var(--accent-color);
    font-size: 12px; cursor: pointer; font-family: inherit;
    transition: all 0.15s;
  }
  .gc-pres-btn:hover { background: rgba(19,37,120,.18); }

  /* ── Typing indicator ── */
  .gc-typing {
    display: flex; gap: 4px; align-items: center; padding: 4px 0;
  }
  .gc-typing span {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--text-muted);
    animation: gc-bounce 1.2s infinite;
  }
  .gc-typing span:nth-child(2) { animation-delay: 0.2s; }
  .gc-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes gc-bounce {
    0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* ── Input ── */
  .gc-input-area {
    display: flex; align-items: flex-end; gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--border-color);
    flex-shrink: 0;
  }
  .gc-input {
    flex: 1; border: 1px solid var(--border-color);
    border-radius: 8px; padding: 8px 12px;
    font-size: 13px; font-family: inherit;
    background: var(--bg-primary); color: var(--text-primary);
    resize: none; outline: none; line-height: 1.4;
    transition: border-color 0.15s;
  }
  .gc-input:focus { border-color: var(--accent-color); }
  .gc-input::placeholder { color: var(--text-muted); }

  .gc-send-btn {
    width: 34px; height: 34px; border-radius: 8px;
    border: none; background: var(--accent-color); color: #fff;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; font-size: 13px; flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .gc-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .gc-send-btn:not(:disabled):hover { opacity: 0.85; }

  .gc-spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: gc-spin 0.65s linear infinite;
  }
  @keyframes gc-spin { to { transform: rotate(360deg); } }

  .gc-backdrop {
    display: none;
  }

  /* ── Mobile ── */
  @media (max-width: 768px) {
    .gc-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.35);
      z-index: 1498;
      border: none;
      padding: 0;
      cursor: default;
    }
    .gc-fab { bottom: 16px; right: 16px; width: 48px; height: 48px; font-size: 18px; }
    .gc-fab.open { display: none; }
    .gc-panel {
      bottom: 0; right: 0; left: 0;
      width: 100%; max-width: 100%;
      max-height: 50vh;
      height: auto;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      border-left: none; border-right: none; border-bottom: none;
    }
    .gc-header {
      padding: 10px 12px;
    }
    .gc-header-left { gap: 8px; }
    .gc-logo { font-size: 18px; }
    .gc-title { font-size: 13px; }
    .gc-subtitle { font-size: 10px; }
    .gc-header-right { gap: 3px; }
    .gc-model-picker {
      padding: 2px 6px;
      font-size: 10px;
      max-width: 100px;
    }
    .gc-icon-btn {
      padding: 4px;
      font-size: 13px;
    }
    .gc-messages {
      padding: 10px;
      gap: 10px;
    }
    .gc-welcome { padding: 16px 10px; gap: 10px; }
    .gc-welcome-icon { font-size: 2rem; }
    .gc-welcome-text { font-size: 12px; }
    .gc-suggestions { gap: 5px; }
    .gc-suggestion { padding: 7px 10px; font-size: 11px; }
    .gc-input-area {
      padding: 8px 10px;
      gap: 6px;
    }
    .gc-input {
      padding: 7px 10px;
      font-size: 16px; /* ≥16px prevents iOS auto-zoom on focus */
      border-radius: 8px;
    }
    .gc-send-btn {
      width: 32px; height: 32px;
      border-radius: 8px;
      font-size: 13px;
    }
    .gc-msg { gap: 6px; }
    .gc-msg-body { max-width: 90%; gap: 3px; }
    .gc-msg-user .gc-msg-body {
      padding: 8px 10px;
      font-size: 13px;
    }
    .gc-msg-assistant .gc-msg-body {
      padding: 8px 10px;
      font-size: 13px;
    }
    .gc-msg-avatar {
      width: 24px; height: 24px;
      font-size: 12px;
    }
    .gc-tool-chip { font-size: 9px; padding: 1px 6px; }
    .gc-sources-toggle { padding: 2px 6px; font-size: 10px; }
    .gc-source-item {
      padding: 4px 6px;
      font-size: 11px;
    }
    .gc-pres-btn {
      padding: 5px 10px;
      font-size: 11px;
      margin-top: 6px;
    }
  }
</style>
