<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { aiApi } from '../lib/api';
  import { settings } from '../stores/settings';
  import { goToNote } from '../stores/tabs';
  import { folders, workspaces, loadFolders, loadWorkspaces } from '../stores/notes';
  import PresentationPreview from './PresentationPreview.svelte';

  export let document: any = null;
  export let contentText = '';
  export let diagramsXml = '';
  export let getDiagramXml: (() => string) | null = null;
  export let visible = true;

  const dispatch = createEventDispatcher();

  onDestroy(() => { if (_insightsPollTimer) clearTimeout(_insightsPollTimer); });

  let selectedLlmConfigId = '';
  $: if (!selectedLlmConfigId && $settings.default_llm_config) {
    selectedLlmConfigId = $settings.default_llm_config;
  }

  interface Source { documentId: string; title?: string; chunkText: string; score: number; isCrossNote: boolean; isWeb?: boolean; url?: string; }
  interface Message { role: 'user' | 'assistant'; content: string; sources?: Source[]; }
  let messages: Message[] = [];
  let input = '';
  let loading = false;
  let openSources: Message | null = null;
  let webSearchEnabled = false;
  let isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });
  }
  let activeTab: 'chat' | 'insights' | 'tools' = 'chat';

  // ── Knowledge scope ─────────────────────────────────────────────────────
  // note = current note only | folder = all notes in same folder (default)
  // folders = user-selected folders | workspaces = user-selected workspaces
  type ScopeMode = 'note' | 'folder' | 'folders' | 'workspaces';
  let scopeMode: ScopeMode = 'folder';
  let selectedFolderIds: string[] = [];
  let selectedWorkspaceIds: string[] = [];
  let showScopePopup = false;

  const SCOPE_OPTIONS: { mode: ScopeMode; label: string; icon: string; hint: string }[] = [
    { mode: 'note', label: 'Current note only', icon: 'bi-file-earmark-text', hint: 'AI only uses this note' },
    { mode: 'folder', label: 'Same folder', icon: 'bi-folder', hint: 'All notes in this note\'s folder' },
    { mode: 'folders', label: 'Select folders', icon: 'bi-folder-check', hint: 'Pick one or more folders' },
    { mode: 'workspaces', label: 'Select workspaces', icon: 'bi-collection', hint: 'Pick one or more workspaces' }
  ];

  $: scopeLabel =
    scopeMode === 'note' ? 'This note' :
    scopeMode === 'folders' && selectedFolderIds.length ? `${selectedFolderIds.length} folder${selectedFolderIds.length > 1 ? 's' : ''}` :
    scopeMode === 'workspaces' && selectedWorkspaceIds.length ? `${selectedWorkspaceIds.length} workspace${selectedWorkspaceIds.length > 1 ? 's' : ''}` :
    'Same folder';

  // Flatten folder tree into an indented list, plus a root pseudo-folder
  function flattenFolders(all: any[]) {
    const out: any[] = [];
    const walk = (parentId: string | null, depth: number) => {
      all.filter(f => (f.parent_id || null) === parentId).forEach(f => {
        out.push({ ...f, depth });
        walk(f.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  }
  $: folderOptions = [{ id: '__root__', name: 'Root (no folder)', depth: 0 }, ...flattenFolders($folders)];

  function toggleScopePopup() {
    showScopePopup = !showScopePopup;
    if (showScopePopup) {
      if (!$workspaces.length) loadWorkspaces();
      if (!$folders.length && document?.workspace_id) loadFolders(document.workspace_id);
    }
  }

  function buildKnowledgeScope(): { mode: string; folder_ids?: string[]; workspace_ids?: string[] } {
    if (scopeMode === 'note') return { mode: 'note' };
    if (scopeMode === 'folders' && selectedFolderIds.length) return { mode: 'folders', folder_ids: selectedFolderIds };
    if (scopeMode === 'workspaces' && selectedWorkspaceIds.length) return { mode: 'workspaces', workspace_ids: selectedWorkspaceIds };
    return { mode: 'folder' }; // default: same folder, resolved server-side
  }
  let insights: any = null;
  let loadingInsights = false;
  let insightsStatus: string = '';
  let _insightsPollTimer: ReturnType<typeof setTimeout> | null = null;
  let _insightsPolling = false;  // guard against concurrent calls
  let _insightsRetries = 0;
  const MAX_INSIGHT_RETRIES = 3;

  const QUICK_ACTIONS = [
    { label: 'Summarize', icon: 'bi-list-columns-reverse', prompt: 'Summarize this note in 3-4 key points' },
    { label: 'Action Items', icon: 'bi-check2-circle', prompt: 'Extract all action items and tasks from this note' },
    { label: 'Key Insights', icon: 'bi-lightbulb', prompt: 'What are the most important insights from this note?' },
    { label: 'Generate FAQ', icon: 'bi-question-circle', prompt: 'Generate an FAQ from this note' },
    { label: 'Slide Outline', icon: 'bi-easel', prompt: 'Create a slide deck outline from this note' },
    { label: 'Improve Writing', icon: 'bi-pencil-square', prompt: 'Improve the clarity and structure of this note' }
  ];

  const TRANSFORM_ACTIONS = [
    { label: 'Summarize to Note', icon: 'bi-layout-text-sidebar-reverse', action: 'summarize-structured' },
    { label: 'Create FAQ', icon: 'bi-question-circle', action: 'faq' },
    { label: 'Slide Deck Outline', icon: 'bi-easel', action: 'slides' },
    { label: 'Extract Action Items', icon: 'bi-check2-square', action: 'actions' },
    { label: 'Suggest Tags', icon: 'bi-tags', action: 'tags' },
    { label: 'Expand Content', icon: 'bi-arrows-angle-expand', action: 'expand' }
  ];

  const STRUCTURED_SUMMARY_PROMPT = `You are a professional note analyst. Create a DETAILED and COMPREHENSIVE structured summary of this note. Match the language of the note exactly. Output ONLY the formatted markdown below — no preamble, no explanation, no code fences.

Rules:
- Be thorough and specific — do NOT give generic or vague summaries
- Each bullet point must be a complete, meaningful sentence explaining the point in detail
- Extract ALL important information, decisions, and context from the note
- If the note contains names, numbers, dates, organizations — include them
- Minimum 3 bullet points per section, more if the content warrants it

## Summary
[Write 3–5 detailed sentences covering: what this note is about, the main context, key decisions or discussions, and the overall goal or outcome. Be specific, not generic.]

## Key Points
- [Detailed point 1 — explain the what AND the why/how]
- [Detailed point 2 — include specific facts, numbers, or names from the note]
- [Detailed point 3]
- [Add more points — cover every significant topic mentioned in the note]

## [Topic Section 1 — use the actual topic name from the note]
[If the note has distinct subtopics, create a separate H2 section for each. Inside each section, elaborate with bullet points or a table. Include specific details, not just labels. Skip entirely if the note has no distinct subtopics.]

## Next Action:
- [Specific action item 1 — who does what, by when if mentioned]
- [Specific action item 2]
- [Add all action items, tasks, or follow-ups mentioned or implied in the note]
[Include this section always — if no explicit actions, infer logical next steps from the context]`;

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const question = input.trim();
    input = '';
    messages = [...messages, { role: 'user', content: question }];
    loading = true;

    // Always read fresh from live editor at send-time
    const diagramXml = (getDiagramXml ? getDiagramXml() : '') || diagramsXml || document?.diagram_xml || '';
    console.log('[AI] diagramXml length:', diagramXml.length, 'preview:', diagramXml.slice(0, 80));

    try {
      const { answer, sources, presentation, diagram_xml } = await aiApi.chat(
        contentText,
        document?.title || 'Note',
        question,
        messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        document?.id,
        diagramXml,
        document?.workspace_id,
        webSearchEnabled,
        selectedLlmConfigId || undefined,
        buildKnowledgeScope()
      );
      // Chat can trigger creator tools — show the presentation / insert the diagram
      if (presentation) {
        presentationHtml = presentation;
        showPresentation = true;
      }
      if (diagram_xml) {
        dispatch('insertDiagram', { xml: diagram_xml });
      }
      // Strip [REF]...[/REF] citations from response text — show in sources instead
      const cleanAnswer = answer.replace(/\s*\[REF\][^\[]*\[\/REF\]/gi, '').trim();
      messages = [...messages, { role: 'assistant', content: cleanAnswer, sources: sources?.length ? sources : undefined }];
    } catch (err: any) {
      messages = [...messages, { role: 'assistant', content: `Sorry, I encountered an error: ${err.message}` }];
    }
    loading = false;
    scrollToBottom();
  }

  async function quickAction(prompt: string) {
    input = prompt;
    await sendMessage();
  }

  async function handleTransform(action: string) {
    loading = true;
    try {
      let result = '';
      if (action === 'summarize-structured') {
        const { answer } = await aiApi.chat(
          contentText,
          document?.title || 'Note',
          STRUCTURED_SUMMARY_PROMPT,
          [],
          document?.id,
          '',
          document?.workspace_id,
          false,
          selectedLlmConfigId || undefined,
          { mode: 'note' }
        );
        // Strip code fences the AI sometimes wraps output in
        const cleaned = answer
          .replace(/^```[\w]*\n?/m, '')
          .replace(/\n?```\s*$/m, '')
          .trim();
        dispatch('insertContent', { content: parseMarkdown(cleaned) });
        result = '✓ Structured summary inserted into your note.';
      } else if (action === 'faq') {
        const { faq } = await aiApi.generateFAQ(contentText, document?.title || '');
        result = faq.map((item: any) => `**Q: ${item.question}**\nA: ${item.answer}`).join('\n\n');
      } else if (action === 'slides') {
        const { slides } = await aiApi.generateSlides(contentText, document?.title || '');
        result = slides.map((s: any, i: number) => `## Slide ${i+1}: ${s.title}\n${s.content.map((b: string) => `- ${b}`).join('\n')}\n\n*Notes: ${s.notes}*`).join('\n\n---\n\n');
      } else if (action === 'actions') {
        const { action_items } = await aiApi.extractActionItems(contentText);
        result = action_items.map((item: any) => `- [ ] **${item.task}**${item.assignee ? ` → @${item.assignee}` : ''}${item.due_date ? ` (Due: ${item.due_date})` : ''} [${item.priority}]`).join('\n');
      } else if (action === 'tags') {
        const { tags } = await aiApi.suggestTags(document?.title || '', contentText);
        result = `Suggested tags: ${tags.join(', ')}`;
        dispatch('suggestTags', { tags });
      } else if (action === 'expand') {
        const selected = window.getSelection()?.toString();
        if (!selected) { result = 'Please select some text first to expand.'; }
        else {
          const { expanded } = await aiApi.expand(selected, 'elaborate');
          dispatch('insertContent', { content: parseMarkdown(expanded) });
          result = 'Content expanded and inserted into your note.';
        }
      }
      messages = [...messages, { role: 'user', content: `Transform: ${action}` }, { role: 'assistant', content: result }];
      activeTab = 'chat';
    } catch (err: any) {
      messages = [...messages, { role: 'assistant', content: `Error: ${err.message}` }];
    }
    loading = false;
    scrollToBottom();
  }

  function insightsHasContent(d: any) {
    if (!d) return false;
    return d.summary || d.key_points?.length || d.action_items?.length || d.key_entities?.length || d.auto_tags?.length;
  }

  function applyInlineFormatting(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/`([^`]+?)`/g, '<code>$1</code>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
  }

  function normalizeMarkdown(md: string): string {
    const lines = md.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prev = out[out.length - 1] ?? '';
      const next = lines[i + 1] ?? '';
      // Blank line before heading
      if (/^#{1,3}\s/.test(line) && prev !== '') out.push('');
      out.push(line);
      // Blank line after heading
      if (/^#{1,3}\s/.test(line) && next !== '') out.push('');
    }
    return out.join('\n');
  }

  function parseMarkdown(text: string): string {
    if (!text) return '';

    // Normalize: ensure blank lines around headings so bullets aren't swallowed
    let html = normalizeMarkdown(text);

    // Split by double newlines to preserve paragraphs
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(para => {
      let p = para.trim();
      if (!p) return '';

      // Headers (block level) — apply inline formatting and take only the first line
      if (/^#{1,3}\s/.test(p)) {
        const firstLine = p.split('\n')[0];
        return firstLine
          .replace(/^### (.+)$/, (_, t) => `<h3>${applyInlineFormatting(t)}</h3>`)
          .replace(/^## (.+)$/, (_, t) => `<h2>${applyInlineFormatting(t)}</h2>`)
          .replace(/^# (.+)$/, (_, t) => `<h1>${applyInlineFormatting(t)}</h1>`);
      }

      // Ordered lists
      if (/^\d+\.\s/.test(p)) {
        const items = p.split('\n').map(line => line.replace(/^\d+\.\s+/, '').trim());
        return '<ol>' + items.map(item => `<li>${applyInlineFormatting(item)}</li>`).join('') + '</ol>';
      }

      // Bullet lists — join wrapped continuation lines into the same item
      if (/^-\s/.test(p)) {
        const lines = p.split('\n');
        const items: string[] = [];
        let cur = '';
        for (const line of lines) {
          if (/^-\s/.test(line)) {
            if (cur) items.push(cur.trim());
            cur = line.replace(/^-\s+/, '');
          } else {
            cur += ' ' + line.trim();
          }
        }
        if (cur) items.push(cur.trim());
        return '<ul>' + items.filter(Boolean).map(item => `<li>${applyInlineFormatting(item)}</li>`).join('') + '</ul>';
      }

      // Tables
      if (/^\|.+\|/.test(p)) {
        const lines = p.split('\n');
        if (lines.length < 2) return p;

        const rows = lines.map(line =>
          line.split('|').slice(1, -1).map(cell => applyInlineFormatting(cell.trim()))
        );

        let table = '<table>';
        rows.forEach((row, idx) => {
          if (idx === 1 && row.every(cell => /^-+$/.test(cell))) return;
          const tag = idx === 0 ? 'th' : 'td';
          table += '<tr>' + row.map(cell => `<${tag}>${cell}</${tag}>`).join('') + '</tr>';
        });
        table += '</table>';
        return table;
      }

      // Regular paragraph - apply inline formatting
      p = applyInlineFormatting(p).replace(/\n/g, '<br>');

      return `<p>${p}</p>`;
    }).join('');

    return html;
  }

  // Sentinel — set when we give up, prevents reactive from restarting cycle
  const INSIGHTS_GAVE_UP = { _gave_up: true, processing_status: 'failed' };

  function _schedulePoll(ms: number) {
    // Keep _insightsPolling = true throughout the session; just delay the next call
    _insightsPollTimer = setTimeout(_pollTick, ms);
  }

  async function _pollTick() {
    if (!document?.id) { _giveUp(''); return; }
    loadingInsights = true;
    try {
      const { insights: data } = await aiApi.getInsights(document.id);

      if (!data || data.processing_status === 'pending') {
        insightsStatus = 'Waiting for analysis...';
        if (_insightsRetries === 0) await aiApi.processInsights(document.id);
        _insightsRetries++;
        if (_insightsRetries <= MAX_INSIGHT_RETRIES) { _schedulePoll(5000); return; }
        _giveUp('Could not generate insights. Try refreshing.'); return;
      }

      if (data.processing_status === 'processing') {
        insightsStatus = 'Analyzing your note...';
        _insightsRetries++;
        if (_insightsRetries <= MAX_INSIGHT_RETRIES * 4) { _schedulePoll(3000); return; }
        _giveUp('Analysis is taking too long. Try again later.'); return;
      }

      if (data.processing_status === 'failed') {
        _giveUp('Analysis failed. Click refresh to retry.'); return;
      }

      // Done but AI returned empty content — retry once, then show empty
      if (!insightsHasContent(data)) {
        _insightsRetries++;
        if (_insightsRetries <= 1) {
          insightsStatus = 'Waiting for analysis...';
          await aiApi.processInsights(document.id);
          _schedulePoll(5000); return;
        }
        insights = data;
        insightsStatus = '';
        _done(); return;
      }

      insights = data;
      insightsStatus = '';
      _done();
    } catch {
      _giveUp('');
    }
  }

  function _done() {
    if (_insightsPollTimer) { clearTimeout(_insightsPollTimer); _insightsPollTimer = null; }
    _insightsPolling = false;
    _insightsRetries = 0;
    loadingInsights = false;
  }

  function _giveUp(msg: string) {
    if (msg) insightsStatus = msg;
    loadingInsights = false;
    insights = INSIGHTS_GAVE_UP;   // non-null → reactive $: won't restart
    _done();
  }

  async function loadInsights() {
    if (!document?.id) return;
    if (_insightsPolling) return;
    _insightsPolling = true;
    _insightsRetries = 0;
    await _pollTick();
  }

  // Only trigger when insights is truly unloaded (null, not the gave-up sentinel)
  $: if (activeTab === 'insights' && document?.id && insights === null && !_insightsPolling) {
    loadInsights();
  }

  let chatBottom: HTMLDivElement;
  function scrollToBottom() {
    setTimeout(() => chatBottom?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  // ── Create with AI: presentation, instagram post, diagram ────────────────
  let creating: 'presentation' | 'instagram' | 'diagram' | null = null;
  let presentationHtml: string | null = null;
  let showPresentation = false;
  let presentationStyle: 'modern' | 'minimal' | 'dark' | 'gradient' = 'modern';
  let presentationSlides = 6;
  let igSize: 'square' | 'portrait' | 'story' = 'square';
  let igTheme: 'purple' | 'ocean' | 'sunset' | 'forest' | 'dark' | 'mono' = 'purple';
  let igSlides = 6;
  let diagramPrompt = '';

  async function createPresentation() {
    if (creating) return;
    creating = 'presentation';
    try {
      const { presentation } = await aiApi.generatePresentation(
        contentText, document?.title || 'Presentation', presentationStyle, presentationSlides, selectedLlmConfigId || undefined
      );
      presentationHtml = presentation;
      showPresentation = true;
      messages = [...messages, { role: 'user', content: 'Create: Presentation' }, { role: 'assistant', content: '✓ Presentation generated — preview opened. Reopen it anytime from the Tools tab.' }];
    } catch (err: any) {
      messages = [...messages, { role: 'assistant', content: `Error generating presentation: ${err.message}` }];
      activeTab = 'chat';
    }
    creating = null;
  }

  async function createInstagramPost() {
    if (creating) return;
    creating = 'instagram';
    try {
      const { html } = await aiApi.generateInstagram(contentText, document?.title || '', {
        size: igSize, theme: igTheme, slides: igSlides, llm_config_id: selectedLlmConfigId || undefined
      });
      presentationHtml = html;
      showPresentation = true;
      messages = [...messages, { role: 'user', content: 'Create: Instagram Post' }, { role: 'assistant', content: '✓ Instagram post generated — preview opened. Use the copy buttons there for the caption & hashtags.' }];
    } catch (err: any) {
      messages = [...messages, { role: 'assistant', content: `Error generating Instagram post: ${err.message}` }];
      activeTab = 'chat';
    }
    creating = null;
    scrollToBottom();
  }

  async function createDiagram() {
    if (creating) return;
    const p = diagramPrompt.trim() || 'Visualize the main concepts and their relationships in this note as a clear diagram';
    creating = 'diagram';
    try {
      const { xml } = await aiApi.generateDiagram(p, contentText, document?.title || '', selectedLlmConfigId || undefined);
      dispatch('insertDiagram', { xml });
      messages = [...messages, { role: 'user', content: `Create diagram: ${p}` }, { role: 'assistant', content: '✓ Diagram inserted into your note. Click "Open Editor" on the diagram block to render and fine-tune it in draw.io.' }];
      diagramPrompt = '';
      activeTab = 'chat';
    } catch (err: any) {
      messages = [...messages, { role: 'assistant', content: `Error generating diagram: ${err.message}` }];
      activeTab = 'chat';
    }
    creating = null;
    scrollToBottom();
  }
</script>

{#if visible}
  <div class="ai-panel slide-in-right">
    <!-- Panel header -->
    <div class="ai-panel-header">
      <div class="ai-panel-title">
        <i class="bi bi-stars" style="color: var(--accent-color)"></i>
        <span>AI Assistant</span>
      </div>
      <button class="icon-btn" on:click={() => dispatch('close')} title="Close">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <!-- Tabs -->
    <div class="ai-tabs">
      <button class="ai-tab {activeTab === 'chat' ? 'active' : ''}" on:click={() => activeTab = 'chat'}>
        <i class="bi bi-chat-dots"></i> Chat
      </button>
      <button class="ai-tab {activeTab === 'tools' ? 'active' : ''}" on:click={() => activeTab = 'tools'}>
        <i class="bi bi-tools"></i> Tools
      </button>
      <button class="ai-tab {activeTab === 'insights' ? 'active' : ''}" on:click={() => activeTab = 'insights'}>
        <i class="bi bi-lightbulb"></i> Insights
      </button>
    </div>

    <!-- Chat tab -->
    {#if activeTab === 'chat'}
      <div class="ai-chat-container">
        <!-- Quick actions -->
        {#if messages.length === 0}
          <div class="quick-actions">
            <p class="hint-text">Ask me anything about your note, or try:</p>
            {#each QUICK_ACTIONS as qa}
              <button class="quick-action-btn" on:click={() => quickAction(qa.prompt)}>
                <i class="bi {qa.icon}"></i>
                <span>{qa.label}</span>
              </button>
            {/each}
          </div>
        {/if}

        <!-- Messages -->
        <div class="chat-messages">
          {#each messages as msg}
            <div class="chat-message {msg.role}">
              {#if msg.role === 'assistant'}
                <div class="ai-avatar"><i class="bi bi-stars"></i></div>
              {/if}
              <div class="message-bubble">
                <div class="message-content" style="line-height: {$settings.editor_line_height || 1.6}">
                  {#if msg.role === 'assistant'}
                    {@html parseMarkdown(msg.content)}
                  {:else}
                    <span class="user-text">{msg.content}</span>
                  {/if}
                </div>
                {#if msg.role === 'assistant'}
                  <div class="msg-actions">
                    <button class="insert-btn" on:click={() => dispatch('insertContent', { content: parseMarkdown(msg.content) })} title="Insert into note">
                      <i class="bi bi-arrow-bar-down"></i> Insert
                    </button>
                    {#if msg.sources?.length}
                      <button class="sources-toggle" on:click={() => openSources = openSources === msg ? null : msg}>
                        <i class="bi bi-journal-bookmark"></i>
                        {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''}
                        <i class="bi bi-chevron-{openSources === msg ? 'up' : 'down'}"></i>
                      </button>
                    {/if}
                  </div>
                  {#if msg.sources?.length && openSources === msg}
                    <div class="sources-popup">
                      <div class="sources-header">
                        <i class="bi bi-journal-bookmark-fill"></i> RAG Sources
                      </div>
                      {#each msg.sources as src, i}
                        <div class="source-item">
                          <div class="source-meta">
                            <span class="source-num">{i + 1}</span>
                            {#if src.isWeb}
                              <a class="source-title cross" href={src.url} target="_blank" rel="noopener">
                                <i class="bi bi-globe2"></i> {src.title}
                                <i class="bi bi-arrow-up-right-square"></i>
                              </a>
                            {:else if src.isCrossNote}
                              <button class="source-title cross" on:click={() => goToNote(src.documentId)}>
                                <i class="bi bi-file-text"></i> {src.title}
                                <i class="bi bi-arrow-up-right-square"></i>
                              </button>
                            {:else}
                              <span class="source-title current">
                                <i class="bi bi-file-earmark-text"></i> Current note
                              </span>
                            {/if}
                            <span class="source-score">{Math.round(src.score * 100)}%</span>
                          </div>
                          <p class="source-chunk">{src.chunkText.slice(0, 180)}{src.chunkText.length > 180 ? '…' : ''}</p>
                        </div>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
          {#if loading}
            <div class="chat-message assistant">
              <div class="ai-avatar"><i class="bi bi-stars"></i></div>
              <div class="message-bubble">
                <div class="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          {/if}
          <div bind:this={chatBottom}></div>
        </div>
      </div>

      <!-- Input -->
      <div class="ai-input-area">
        <div class="ai-input-toolbar">
          <div class="scope-wrapper">
            <button
              class="web-search-toggle {scopeMode !== 'folder' ? 'active' : ''}"
              type="button"
              on:click={toggleScopePopup}
              title="Knowledge scope — which notes the AI can use"
            >
              <i class="bi bi-journal-bookmark"></i>
              <span>{scopeLabel}</span>
              <i class="bi bi-chevron-{showScopePopup ? 'down' : 'up'}"></i>
            </button>

            {#if showScopePopup}
              <div class="scope-overlay" on:click={() => showScopePopup = false}></div>
              <div class="scope-popup">
                <div class="scope-popup-header">
                  <i class="bi bi-journal-bookmark-fill"></i> Knowledge Scope
                </div>
                {#each SCOPE_OPTIONS as opt}
                  <label class="scope-option {scopeMode === opt.mode ? 'selected' : ''}">
                    <input type="radio" bind:group={scopeMode} value={opt.mode} />
                    <i class="bi {opt.icon}"></i>
                    <span class="scope-option-text">
                      <span class="scope-option-label">{opt.label}{opt.mode === 'folder' ? ' (default)' : ''}</span>
                      <span class="scope-option-hint">{opt.hint}</span>
                    </span>
                  </label>

                  {#if opt.mode === 'folders' && scopeMode === 'folders'}
                    <div class="scope-picker">
                      {#if folderOptions.length <= 1}
                        <p class="scope-empty">No folders in this workspace.</p>
                      {/if}
                      {#each folderOptions as f}
                        <label class="scope-check" style="padding-left: {10 + f.depth * 14}px">
                          <input type="checkbox" bind:group={selectedFolderIds} value={f.id} />
                          <i class="bi {f.id === '__root__' ? 'bi-house' : 'bi-folder'}"></i>
                          <span>{f.name}</span>
                        </label>
                      {/each}
                      {#if !selectedFolderIds.length}
                        <p class="scope-empty">Nothing selected — falls back to same folder.</p>
                      {/if}
                    </div>
                  {/if}

                  {#if opt.mode === 'workspaces' && scopeMode === 'workspaces'}
                    <div class="scope-picker">
                      {#each $workspaces as ws}
                        <label class="scope-check">
                          <input type="checkbox" bind:group={selectedWorkspaceIds} value={ws.id} />
                          <i class="bi {ws.icon || 'bi-journals'}" style="color:{ws.color || 'var(--accent-color)'}"></i>
                          <span>{ws.name}</span>
                        </label>
                      {/each}
                      {#if !selectedWorkspaceIds.length}
                        <p class="scope-empty">Nothing selected — falls back to same folder.</p>
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
          <button
            class="web-search-toggle {webSearchEnabled ? 'active' : ''}"
            type="button"
            on:click={() => webSearchEnabled = !webSearchEnabled}
            title={webSearchEnabled ? 'Web search ON — click to disable' : 'Enable web search'}
          >
            <i class="bi bi-globe2"></i>
            <span>Web</span>
          </button>
          {#if $settings.llm_configs?.length > 0}
            <select class="model-picker" bind:value={selectedLlmConfigId} title="Select model">
              {#each $settings.llm_configs as cfg}
                <option value={cfg.id}>{cfg.name}</option>
              {/each}
            </select>
          {/if}
        </div>
        <form on:submit|preventDefault={sendMessage}>
          <div class="ai-input-wrapper">
            <textarea
              class="ai-input"
              bind:value={input}
              placeholder={webSearchEnabled ? 'Ask anything — will search the web...' : 'Ask about this note...'}
              rows="2"
              on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isMobile) { e.preventDefault(); sendMessage(); } }}
            ></textarea>
            <button type="submit" class="ai-send-btn" title="Send (Enter)" disabled={loading || !input.trim()}>
              {#if loading}<span class="spinner-sm"></span>{:else}<i class="bi bi-send-fill"></i>{/if}
            </button>
          </div>
        </form>
        {#if messages.length > 0}
          <button class="clear-btn" on:click={() => messages = []}>
            <i class="bi bi-trash"></i> Clear chat
          </button>
        {/if}
      </div>

    <!-- Tools tab -->
    {:else if activeTab === 'tools'}
      <div class="tools-container">
        <p class="notes-label">Create with AI</p>

        <!-- Presentation -->
        <div class="create-card">
          <button class="tool-btn create-main" on:click={createPresentation} disabled={!!creating}>
            <div class="tool-icon"><i class="bi bi-easel2"></i></div>
            <div class="tool-info">
              <span class="tool-label">Presentation</span>
              <span class="tool-sub">HTML slide deck from this note</span>
            </div>
            {#if creating === 'presentation'}
              <span class="spinner-sm"></span>
            {:else}
              <i class="bi bi-chevron-right text-muted"></i>
            {/if}
          </button>
          <div class="create-extra">
            <select class="style-picker" bind:value={presentationStyle} disabled={!!creating} title="Presentation style">
              <option value="modern">Modern</option>
              <option value="minimal">Minimal</option>
              <option value="dark">Dark</option>
              <option value="gradient">Gradient</option>
            </select>
            <select class="style-picker" bind:value={presentationSlides} disabled={!!creating} title="Number of slides">
              {#each [4, 5, 6, 7, 8, 10] as nOpt}
                <option value={nOpt}>{nOpt} slides</option>
              {/each}
            </select>
            {#if presentationHtml}
              <button class="view-last-btn" on:click={() => showPresentation = true}>
                <i class="bi bi-eye"></i> View last
              </button>
            {/if}
          </div>
        </div>

        <!-- Instagram post -->
        <div class="create-card">
          <button class="tool-btn create-main" on:click={createInstagramPost} disabled={!!creating}>
            <div class="tool-icon"><i class="bi bi-instagram"></i></div>
            <div class="tool-info">
              <span class="tool-label">Instagram Post</span>
              <span class="tool-sub">Designed carousel + caption & hashtags</span>
            </div>
            {#if creating === 'instagram'}
              <span class="spinner-sm"></span>
            {:else}
              <i class="bi bi-chevron-right text-muted"></i>
            {/if}
          </button>
          <div class="create-extra">
            <select class="style-picker" bind:value={igSize} disabled={!!creating} title="Post size">
              <option value="square">Square 1:1</option>
              <option value="portrait">Portrait 4:5</option>
              <option value="story">Story 9:16</option>
            </select>
            <select class="style-picker" bind:value={igTheme} disabled={!!creating} title="Color theme">
              <option value="purple">Purple</option>
              <option value="ocean">Ocean</option>
              <option value="sunset">Sunset</option>
              <option value="forest">Forest</option>
              <option value="dark">Dark</option>
              <option value="mono">Mono</option>
            </select>
            <select class="style-picker" bind:value={igSlides} disabled={!!creating} title="Number of slides">
              {#each [4, 5, 6, 7, 8] as nOpt}
                <option value={nOpt}>{nOpt} slides</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Diagram from prompt -->
        <div class="create-card">
          <div class="tool-btn create-main" style="cursor:default">
            <div class="tool-icon"><i class="bi bi-diagram-3"></i></div>
            <div class="tool-info">
              <span class="tool-label">Diagram</span>
              <span class="tool-sub">draw.io diagram inserted into the note</span>
            </div>
          </div>
          <div class="create-extra diagram-extra">
            <textarea
              class="diagram-prompt"
              bind:value={diagramPrompt}
              rows="2"
              placeholder="Describe the diagram… (empty = visualize this note)"
              disabled={!!creating}
            ></textarea>
            <button class="notes-btn notes-btn-primary diagram-go" on:click={createDiagram} disabled={!!creating}>
              {#if creating === 'diagram'}
                <span class="spinner-sm" style="width:12px;height:12px;border-width:2px"></span> Generating…
              {:else}
                <i class="bi bi-magic"></i> Generate & Insert
              {/if}
            </button>
          </div>
        </div>

        <p class="notes-label" style="margin-top:16px">Transform your note into different formats:</p>
        {#each TRANSFORM_ACTIONS as action}
          <button class="tool-btn" on:click={() => handleTransform(action.action)} disabled={loading}>
            <div class="tool-icon"><i class="bi {action.icon}"></i></div>
            <div class="tool-info">
              <span class="tool-label">{action.label}</span>
            </div>
            {#if loading}
              <span class="spinner-sm"></span>
            {:else}
              <i class="bi bi-chevron-right text-muted"></i>
            {/if}
          </button>
        {/each}

        <div class="improve-section">
          <p class="notes-label">Improve Writing</p>
          {#each ['Make it clearer', 'Make it more concise', 'Make it more formal', 'Make it more engaging', 'Fix grammar'] as instruction}
            <button class="quick-action-btn" on:click={() => {
              aiApi.improve(contentText, instruction).then(({ improved }) => {
                dispatch('replaceContent', { content: parseMarkdown(improved) });
                messages = [...messages, { role: 'user', content: `Improve: ${instruction}` }, { role: 'assistant', content: 'Content improved. Applied to editor.' }];
                activeTab = 'chat';
              });
            }}>
              {instruction}
            </button>
          {/each}
        </div>
      </div>

    <!-- Insights tab -->
    {:else if activeTab === 'insights'}
      <div class="insights-container">
        {#if loadingInsights}
          <div class="text-center p-4">
            <div class="spinner-sm" style="margin: 0 auto 12px; width:24px;height:24px;border-width:3px"></div>
            <p class="text-muted" style="font-size:13px">{insightsStatus || 'Analyzing your note...'}</p>
          </div>
        {:else if insights && !insights._gave_up}
          {#if insights.summary}
            <div class="insight-card">
              <div class="insight-title"><i class="bi bi-list-columns-reverse"></i> Summary</div>
              <div class="insight-content">{@html parseMarkdown(insights.summary)}</div>
            </div>
          {/if}

          {#if insights.key_points?.length > 0}
            <div class="insight-card">
              <div class="insight-title"><i class="bi bi-star"></i> Key Points</div>
              <ul class="insight-list">
                {#each insights.key_points as point}
                  <li>{@html applyInlineFormatting(point)}</li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if insights.action_items?.length > 0}
            <div class="insight-card">
              <div class="insight-title"><i class="bi bi-check2-circle"></i> Action Items</div>
              <ul class="insight-list">
                {#each insights.action_items as item}
                  <li>
                    {@html applyInlineFormatting(item.task)}
                    {#if item.assignee}<span class="text-muted"> → @{item.assignee}</span>{/if}
                    {#if item.priority}<span class="badge-{item.priority}"> [{item.priority}]</span>{/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if insights.key_entities?.length > 0}
            <div class="insight-card">
              <div class="insight-title"><i class="bi bi-tag"></i> Entities</div>
              <div class="entity-chips">
                {#each insights.key_entities as entity}
                  <span class="entity-chip {entity.type}">{entity.value}</span>
                {/each}
              </div>
            </div>
          {/if}

          {#if insights.auto_tags?.length > 0}
            <div class="insight-card">
              <div class="insight-title"><i class="bi bi-tags"></i> Suggested Tags</div>
              <div class="tag-chips">
                {#each insights.auto_tags as tag}
                  <span class="tag-chip">{tag}</span>
                {/each}
              </div>
              <button class="notes-btn notes-btn-ghost" style="width:100%;margin-top:8px;font-size:12px"
                on:click={() => dispatch('applyTags', { tags: insights.auto_tags })}>
                Apply these tags
              </button>
            </div>
          {/if}

          <button class="notes-btn notes-btn-ghost w-100 mt-2" on:click={() => { insights = null; loadInsights(); }} style="font-size:12px">
            <i class="bi bi-arrow-clockwise"></i> Re-analyze Note
          </button>
        {:else}
          <div class="text-center p-4">
            {#if insights?._gave_up}
              <i class="bi bi-exclamation-circle" style="font-size:2rem;color:var(--text-muted)"></i>
              <p class="text-muted" style="font-size:13px;margin-top:8px">{insightsStatus || 'Could not generate insights.'}</p>
            {:else}
              <i class="bi bi-lightbulb" style="font-size:2rem;color:var(--text-muted)"></i>
              <p class="text-muted" style="font-size:13px;margin-top:8px">AI insights will appear here after your note has enough content.</p>
            {/if}
            <button
              class="notes-btn notes-btn-primary mt-3"
              on:click={() => { insights = null; loadInsights(); }}
              disabled={loadingInsights}
              style="opacity:{loadingInsights ? 0.6 : 1};cursor:{loadingInsights ? 'not-allowed' : 'pointer'}"
            >
              {#if loadingInsights}
                <span class="spinner-sm" style="width:12px;height:12px;border-width:2px;display:inline-block;margin-right:6px"></span>
                Analyzing...
              {:else}
                Analyze Note
              {/if}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if showPresentation && presentationHtml}
  <PresentationPreview html={presentationHtml} on:close={() => showPresentation = false} />
{/if}

<style>
  .ai-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    overflow: hidden;
  }

  .ai-panel-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .ai-panel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
  }

  .ai-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .ai-tab {
    flex: 1;
    padding: 10px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    transition: all 0.15s;
  }
  .ai-tab:hover { color: var(--text-primary); background: var(--bg-hover); }
  .ai-tab.active { color: var(--accent-color); border-bottom-color: var(--accent-color); background: none; }

  .ai-chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .quick-actions {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .hint-text {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .quick-action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: left;
    transition: all 0.15s;
  }
  .quick-action-btn:hover { border-color: var(--accent-color); color: var(--accent-color); background: var(--bg-active); }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .chat-message {
    display: flex;
    gap: 8px;
  }

  .chat-message.user { flex-direction: row-reverse; }

  .ai-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
  }

  .message-bubble {
    max-width: 85%;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
  }

  .chat-message.user .message-bubble {
    background: var(--accent-color);
    color: #fff;
    border-radius: 12px 12px 2px 12px;
  }

  .chat-message.assistant .message-bubble {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px 12px 12px 2px;
  }

  .message-content {
    word-break: break-word;
  }
  .user-text { white-space: pre-wrap; word-break: break-word; }

  .message-content p {
    margin: 0;
  }

  /* :global needed — content injected via innerHTML, Svelte can't detect usage */
  :global(.message-content h1) { margin: 0; font-size: 1.3em; font-weight: 700; }
  :global(.message-content h2) { margin: 0; font-size: 1.1em; font-weight: 700; }
  :global(.message-content h3) { margin: 0; font-size: 1em; font-weight: 700; }
  :global(.message-content strong) { font-weight: 700; }
  :global(.message-content em) { font-style: italic; }
  :global(.message-content code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }
  :global(.message-content ul), :global(.message-content ol) {
    margin: 0; padding: 0; padding-left: 20px; list-style-position: outside;
  }
  :global(.message-content li) { margin: 0; padding: 0; display: list-item; }
  :global(.message-content table) { border-collapse: collapse; margin: 8px 0; font-size: 0.95em; }
  :global(.message-content table), :global(.message-content th), :global(.message-content td) {
    border: 1px solid rgba(0, 0, 0, 0.15);
  }
  :global(.message-content th) {
    background: rgba(0, 0, 0, 0.05); padding: 6px 8px; font-weight: 600; text-align: left;
  }
  :global(.message-content td) { padding: 5px 8px; }
  :global(.message-content a) { color: var(--accent-color); text-decoration: underline; }
  :global(.message-content a:hover) { opacity: 0.8; }
  :global(.message-content br) { display: block; content: ''; height: 0.5em; }

  .msg-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .insert-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--accent-color);
  }
  .insert-btn:hover { background: var(--bg-active); }

  /* Sources */
  .sources-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--text-muted);
    transition: all 0.15s;
  }
  .sources-toggle:hover { background: var(--bg-hover); color: var(--text-primary); }

  .sources-popup {
    margin-top: 6px;
    width: 100%;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;
    animation: fadeIn 0.15s ease;
  }

  .sources-header {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-secondary);
  }

  .source-item {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-color);
  }
  .source-item:last-child { border-bottom: none; }

  .source-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
  }

  .source-num {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent-color);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .source-title {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source-title.cross {
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
    color: var(--accent-color);
    text-align: left;
  }
  .source-title.cross:hover { text-decoration: underline; }
  .source-title.current { color: var(--text-secondary); }

  .source-score {
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg-secondary);
    padding: 1px 5px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .source-chunk {
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
    font-style: italic;
  }

  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: 4px 0;
  }
  .typing-indicator span {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: typing 1.2s ease-in-out infinite;
  }
  .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
  .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing {
    0%, 100% { transform: translateY(0); opacity: 0.5; }
    50% { transform: translateY(-4px); opacity: 1; }
  }

  .ai-input-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 0 8px;
    flex-wrap: wrap;
  }

  .model-picker {
    flex: 1; min-width: 0;
    padding: 3px 6px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: none;
    color: var(--text-muted);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .model-picker:hover, .model-picker:focus { border-color: var(--accent-color); color: var(--accent-color); }

  .web-search-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--text-muted);
    transition: all 0.15s;
  }
  .web-search-toggle:hover { border-color: var(--accent-color); color: var(--accent-color); }
  .web-search-toggle.active {
    background: rgba(19,37,120,0.1);
    border-color: var(--accent-color);
    color: var(--accent-color);
    font-weight: 600;
  }

  /* Knowledge scope popup */
  .scope-wrapper { position: relative; }

  .scope-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .scope-popup {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 41;
    width: 260px;
    max-height: 340px;
    overflow-y: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    animation: fadeIn 0.15s ease;
  }

  .scope-popup-header {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 6px;
    position: sticky;
    top: 0;
    background: var(--bg-primary);
  }

  .scope-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    transition: background 0.15s;
  }
  .scope-option:hover { background: var(--bg-hover); }
  .scope-option.selected { color: var(--accent-color); }
  .scope-option input { accent-color: var(--accent-color); flex-shrink: 0; margin: 0; }
  .scope-option i { flex-shrink: 0; }

  .scope-option-text { display: flex; flex-direction: column; min-width: 0; }
  .scope-option-label { font-weight: 500; }
  .scope-option-hint { font-size: 10px; color: var(--text-muted); }

  .scope-picker {
    border-top: 1px dashed var(--border-color);
    border-bottom: 1px dashed var(--border-color);
    background: var(--bg-secondary);
    padding: 4px 0;
    max-height: 150px;
    overflow-y: auto;
  }

  .scope-check {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .scope-check:hover { background: var(--bg-hover); }
  .scope-check input { accent-color: var(--accent-color); flex-shrink: 0; margin: 0; }
  .scope-check span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .scope-empty {
    padding: 4px 12px;
    margin: 0;
    font-size: 11px;
    font-style: italic;
    color: var(--text-muted);
  }

  .ai-input-area {
    padding: 12px;
    border-top: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .ai-input-wrapper {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .ai-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 13px;
    resize: none;
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s;
  }
  .ai-input:focus { border-color: var(--accent-color); }

  @media (max-width: 768px) {
    .ai-input { font-size: 16px; } /* ≥16px prevents iOS auto-zoom on focus */
  }

  .ai-send-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--accent-color);
    border: none;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .ai-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .clear-btn {
    width: 100%;
    margin-top: 6px;
    padding: 4px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .clear-btn:hover { color: var(--danger-color); }

  .tools-container {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    cursor: pointer;
    text-align: left;
    margin-bottom: 6px;
    transition: all 0.15s;
  }
  .tool-btn:hover { border-color: var(--accent-color); background: var(--bg-active); }
  .tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .tool-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--bg-active);
    color: var(--accent-color);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tool-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .tool-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
  .tool-sub { font-size: 11px; color: var(--text-muted); }

  /* Create with AI */
  .create-card {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    margin-bottom: 6px;
    overflow: hidden;
  }
  .create-card .create-main {
    border: none;
    border-radius: 0;
    margin-bottom: 0;
    width: 100%;
  }

  .create-extra {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 12px 10px;
    border-top: 1px dashed var(--border-color);
  }

  .style-picker {
    padding: 3px 8px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: none;
    color: var(--text-muted);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    outline: none;
  }
  .style-picker:hover, .style-picker:focus { border-color: var(--accent-color); color: var(--accent-color); }

  .view-last-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--accent-color);
  }
  .view-last-btn:hover { background: var(--bg-active); }

  .diagram-extra { flex-direction: column; align-items: stretch; }

  .diagram-prompt {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
    resize: none;
    outline: none;
  }
  .diagram-prompt:focus { border-color: var(--accent-color); }

  .diagram-go {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    padding: 6px;
  }
  .diagram-go:disabled { opacity: 0.6; cursor: not-allowed; }

  .improve-section { margin-top: 16px; }

  .insights-container {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .insight-card {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 12px;
  }

  .insight-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-color);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .insight-content { font-size: 13px; line-height: 1.5; color: var(--text-primary); }

  .insight-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .insight-list li::before { content: '•'; color: var(--accent-color); margin-right: 6px; }

  .entity-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .entity-chip {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }
  .entity-chip.person { background: #dbeafe; color: #1d4ed8; }
  .entity-chip.organization { background: #dcfce7; color: #15803d; }
  .entity-chip.date { background: #fef9c3; color: #854d0e; }
  .entity-chip.project { background: #f3e8ff; color: #7e22ce; }
  .entity-chip.technology { background: #fee2e2; color: #b91c1c; }
  .entity-chip.concept { background: #e0f2fe; color: #0369a1; }
  .entity-chip.location { background: #fef3c7; color: #92400e; }

  .tag-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag-chip {
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--bg-secondary);
  }

  .icon-btn {
    background: none; border: none; cursor: pointer;
    padding: 6px; border-radius: 4px; color: var(--text-muted);
    display: flex; align-items: center; transition: all 0.15s;
  }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

  .w-100 { width: 100%; }
  .mt-2 { margin-top: 8px; }
  .mt-3 { margin-top: 12px; }
  .mb-3 { margin-bottom: 12px; }
  .text-muted { color: var(--text-muted); }
  .text-center { text-align: center; }
  .p-4 { padding: 16px; }
</style>
