const { db } = require('../config/db');
const { decrypt } = require('../services/encryptionService');
const { semanticSearch } = require('../services/notesEmbeddingService');
const { getAdminDefaultLLM, toChatConfig } = require('../services/adminLLMService');

const OPENROUTER_BASE  = 'https://openrouter.ai/api/v1';
const APILOGY_LLM_BASE = 'https://telkom-ai-dag.api.apilogy.id/Telkom-LLM/0.0.4/llm';
const OLLAMA_DEFAULT_BASE = 'http://localhost:11434/v1';

async function getAIConfig(userId, configId = null) {
  // ── Admin lock: force everyone onto the org-wide default, no exceptions ───
  const admin = await getAdminDefaultLLM();
  if (admin.locked && admin.defaultConfig) {
    return toChatConfig(admin.defaultConfig);
  }

  try {
    const data = await db('notes_settings').where({ user_id: userId }).first();
    if (!data) throw new Error('no settings');

    const language = data.ai_default_language || 'auto';

    // ── Multi-model: resolve from llm_configs array ───────────────────────────
    const configs = Array.isArray(data.llm_configs) ? data.llm_configs : [];
    if (configs.length > 0) {
      const target = configId
        ? configs.find(c => c.id === configId)
        : configs.find(c => c.id === data.default_llm_config) || configs[0];

      if (target?.api_key || target?.provider === 'ollama') {
        const provider = target.provider || 'openrouter';
        return {
          model:    target.model,
          apiKey:   provider === 'apilogy' ? (data.apilogy_api_key || target.api_key) : (target.api_key || ''),
          baseUrl:  provider === 'apilogy' ? APILOGY_LLM_BASE : provider === 'ollama' ? (target.base_url || OLLAMA_DEFAULT_BASE) : (target.base_url || OPENROUTER_BASE),
          provider,
          language
        };
      }
    }

    // ── Legacy single-config fallback ─────────────────────────────────────────
    if (data.ai_provider === 'apilogy' && data.apilogy_api_key) {
      return { model: data.ai_model || 'telkom-ai', apiKey: data.apilogy_api_key, baseUrl: APILOGY_LLM_BASE, provider: 'apilogy', language };
    }
    if (data.ai_provider === 'ollama') {
      return { model: data.ai_model || 'llama3.1', apiKey: data.ai_api_key || '', baseUrl: data.ai_base_url || OLLAMA_DEFAULT_BASE, provider: 'ollama', language };
    }
    if (data.ai_api_key) {
      return { model: data.ai_model || 'mistralai/mistral-small-3.2-24b-instruct', apiKey: data.ai_api_key, baseUrl: data.ai_base_url || OPENROUTER_BASE, provider: 'openrouter', language };
    }
  } catch {}

  // ── Admin default (org-wide, unlocked - used only when the user hasn't configured anything) ──
  if (admin.defaultConfig) return toChatConfig(admin.defaultConfig);

  // ── Env fallback ───────────────────────────────────────────────────────────
  return { model: 'mistralai/mistral-small-3.2-24b-instruct', apiKey: process.env.OPENROUTER_API_KEY, baseUrl: OPENROUTER_BASE, provider: 'openrouter', language: 'auto' };
}

function buildHeaders(config) {
  if (config.provider === 'apilogy') {
    return { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' };
  }
  if (config.provider === 'ollama' && !config.apiKey) {
    return { 'Content-Type': 'application/json' };
  }
  return { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://yesvara.com' };
}

// ── Current date/time context ─────────────────────────────────────────────────

function getNowContext() {
  const now = new Date();
  return `Current date and time: ${now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`;
}

// ── Cross-workspace RAG ───────────────────────────────────────────────────────

async function searchAllNotes(query, userId, limit = 6) {
  try {
    const workspaces = await db('notes_workspaces').where({ owner_id: userId }).select('id');
    if (!workspaces?.length) return { context: '', sources: [] };

    const results = [];
    for (const ws of workspaces) {
      const hits = await semanticSearch(query, ws.id, userId, 3);
      if (hits?.length) results.push(...hits);
    }

    if (!results.length) {
      // Text search fallback
      const docs = await db('notes_documents')
        .where({ created_by: userId, is_archived: false })
        .select('id', 'title', 'content_text', 'updated_at', 'icon');

      const lower = query.toLowerCase();
      const matches = (docs || [])
        .map(d => ({ ...d, title: decrypt(d.title), content_text: decrypt(d.content_text) }))
        .filter(d => d.title.toLowerCase().includes(lower) || d.content_text.toLowerCase().includes(lower))
        .slice(0, limit);

      if (!matches.length) return { context: '', sources: [] };
      return {
        context: matches.map(d => `[Note: "${d.title}"]\n${d.content_text.slice(0, 500)}`).join('\n\n---\n\n'),
        sources: matches.map(d => ({ id: d.id, title: d.title, icon: d.icon, score: null }))
      };
    }

    const top = results.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
    return {
      context: top.map(r => `[Note: "${r.title}"]\n${r.chunk_text || r.content_text?.slice(0, 500) || ''}`).join('\n\n---\n\n'),
      sources: top.map(r => ({ id: r.id, title: r.title, icon: r.icon, score: Math.round((r.score || 0) * 100) }))
    };
  } catch (err) {
    console.warn('[GlobalChat] searchAllNotes error:', err.message);
    return { context: '', sources: [] };
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: 'Search across all the user\'s notes using semantic search. Use this when the user asks about content in their notes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_recent_notes',
      description: 'List the user\'s most recently updated notes, ordered newest first. Use this when the user asks about their latest/last/most recent note(s), or wants a quick overview of recent activity - NOT for questions about note content (use search_notes for that). Omit workspace_id to search across all workspaces.',
      parameters: {
        type: 'object',
        properties: {
          workspace_id: { type: 'string', description: 'Workspace name or ID (optional - omit to list across all workspaces)' },
          limit: { type: 'number', description: 'Max notes to return (default 5)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_todos',
      description: 'List all todos/tasks. Omit workspace_id to use the default workspace.',
      parameters: {
        type: 'object',
        properties: {
          workspace_id: { type: 'string', description: 'Workspace name or ID (optional — defaults to user\'s default workspace)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_todo',
      description: 'Create a new todo/task. Choose the most relevant workspace based on the task content and context.',
      parameters: {
        type: 'object',
        properties: {
          title:        { type: 'string', description: 'Task title' },
          priority:     { type: 'string', enum: ['low', 'normal', 'high'], description: 'Priority level' },
          due_date:     { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
          workspace_id: { type: 'string', description: 'Workspace name or ID (optional — pick the most relevant workspace, or omit for default)' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_todo',
      description: 'Mark a todo as done or undone (toggle)',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Todo ID' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: 'Delete a todo',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Todo ID' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_presentation',
      description: 'Generate a beautiful HTML presentation/slides on a topic. Use when user asks to create slides, presentation, or visual content.',
      parameters: {
        type: 'object',
        properties: {
          topic:   { type: 'string', description: 'Presentation topic or title' },
          content: { type: 'string', description: 'Key points or content to include' },
          style:   { type: 'string', enum: ['modern', 'minimal', 'dark', 'gradient'], description: 'Visual style' },
          slides:  { type: 'number', description: 'Number of slides (3-10)' }
        },
        required: ['topic']
      }
    }
  }
];

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(name, args, userId, workspaceId, sourcesCollector = []) {
  switch (name) {
    case 'search_notes': {
      const { context, sources } = await searchAllNotes(args.query, userId);
      if (sources?.length) sourcesCollector.push(...sources);
      return context || 'No relevant notes found.';
    }
    case 'list_recent_notes': {
      const limit = Math.min(Math.max(args.limit || 5, 1), 20);
      let q = db('notes_documents')
        .where({ created_by: userId, is_archived: false })
        .select('id', 'title', 'workspace_id', 'folder_id', 'updated_at', 'word_count')
        .orderBy('updated_at', 'desc')
        .limit(limit);
      if (args.workspace_id) q = q.where({ workspace_id: args.workspace_id });

      const docs = await q;
      if (!docs.length) return 'No notes found.';
      return docs.map(d => {
        const title = decrypt(d.title) || 'Untitled';
        const when = new Date(d.updated_at).toISOString().slice(0, 16).replace('T', ' ');
        return `"${title}" - updated ${when} (${d.word_count || 0} words) | id: ${d.id}`;
      }).join('\n');
    }
    case 'list_todos': {
      const wsId = args.workspace_id || workspaceId;
      const data = await db('notes_todos').where({ workspace_id: wsId, created_by: userId }).orderBy([{ column: 'is_done' }, { column: 'created_at', order: 'desc' }]);
      if (!data?.length) return 'No todos found.';
      return data.map(t => `[${t.is_done ? '✓' : '○'}] ${t.title} (${t.priority}) ${t.due_date ? `| due: ${t.due_date}` : ''} | id: ${t.id}`).join('\n');
    }
    case 'create_todo': {
      const wsId = args.workspace_id || workspaceId;
      const [data] = await db('notes_todos').insert({
        workspace_id: wsId, created_by: userId,
        title: args.title, priority: args.priority || 'normal', due_date: args.due_date || null
      }).returning('*');
      return `Created todo: "${data.title}" (id: ${data.id})`;
    }
    case 'toggle_todo': {
      const cur = await db('notes_todos').where({ id: args.id, created_by: userId }).select('is_done').first();
      if (!cur) return 'Todo not found.';
      const isDone = !cur.is_done;
      await db('notes_todos').where({ id: args.id }).update({ is_done: isDone, done_at: isDone ? db.fn.now() : null });
      return `Todo marked as ${isDone ? 'done ✓' : 'not done ○'}.`;
    }
    case 'delete_todo': {
      await db('notes_todos').where({ id: args.id, created_by: userId }).delete();
      return 'Todo deleted.';
    }
    case 'generate_presentation': {
      // Return a signal to the LLM to generate HTML — handled in prompt
      return `GENERATE_HTML_PRESENTATION:${JSON.stringify(args)}`;
    }
    default:
      return 'Unknown tool.';
  }
}

// ── HTML Presentation generator ───────────────────────────────────────────────

async function generatePresentationHTML(args, config) {
  const { topic, content = '', style = 'modern', slides = 6 } = args;

  const themes = {
    modern:   { bg: '#ffffff', slide: '#ffffff', accent: '#6c63ff', text: '#1a1a2e', muted: '#64748b', card: '#f8f7ff', border: '#e2e0ff' },
    minimal:  { bg: '#f8f9fa', slide: '#ffffff', accent: '#1e293b', text: '#1e293b', muted: '#64748b', card: '#f1f5f9', border: '#e2e8f0' },
    dark:     { bg: '#0f0f1a', slide: '#1a1a2e', accent: '#a78bfa', text: '#e8e6f0', muted: '#94a3b8', card: '#252540', border: '#312e5c' },
    gradient: { bg: '#6c63ff', slide: 'rgba(255,255,255,0.05)', accent: '#fbbf24', text: '#ffffff', muted: 'rgba(255,255,255,0.7)', card: 'rgba(255,255,255,0.12)', border: 'rgba(255,255,255,0.2)' }
  };
  const t = themes[style] || themes.modern;

  const prompt = `Generate a professional ${slides}-slide HTML presentation about: "${topic}"
${content ? `\nContent to cover:\n${content}` : ''}

CRITICAL REQUIREMENTS:
1. Return ONLY a complete self-contained HTML file — NO markdown, NO explanation, NO code fences.
2. Slide dimensions: exactly 1280×720px (16:9, standard PowerPoint size). Center slides in viewport.
3. Each slide is a div.slide, only one visible at a time via JS.
4. Use Bootstrap Icons via CDN: <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
5. Include per-slide a variety of layouts — NOT all bullet lists. Mix these:
   - Title slide: large centered title + subtitle + decorative element
   - Icon grid: 3-4 cards each with a bi-* icon + title + short text
   - Two-column: text left + visual/table right
   - Stats/numbers: large highlighted numbers with labels
   - Table slide: properly styled HTML table with data
   - Quote/highlight: large pull quote or key insight
   - Timeline or process steps: numbered steps with icons
   - Conclusion: key takeaways with checkmarks
6. Colors: bg=${t.bg}, slide=${t.slide}, accent=${t.accent}, text=${t.text}, muted=${t.muted}, card=${t.card}
7. Navigation: FIXED POSITION at bottom center: ← PREV | "N / ${slides}" | NEXT → buttons, z-index 1000, visible + NOT overlapped by slides
8. Arrow keys (left/right) + mouse click navigation working
9. Smooth CSS transition between slides (opacity + slight translateY)
10. Font: import Inter from Google Fonts
11. NO external images — use CSS shapes, gradients, icons instead
12. Make it genuinely beautiful and professional — this replaces PowerPoint

Return ONLY the raw HTML starting with <!DOCTYPE html>`;

  const endpoint = '/chat/completions';
  const url = `${config.baseUrl}${endpoint}`;
  console.log('[GlobalChat] Presentation API endpoint:', url, 'provider:', config.provider);

  const payload = { model: config.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4000 };

  console.log('[GlobalChat] Presentation payload model:', payload.model);

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(payload),
    timeout: 60000
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[GlobalChat] Presentation generation API error:', res.status, errorText);
    throw new Error(`Presentation generation failed: ${res.status} - ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  console.log('[GlobalChat] Presentation response received, content length:', data.choices?.[0]?.message?.content?.length || 0);

  let html = data.choices?.[0]?.message?.content || '';
  if (!html) {
    console.error('[GlobalChat] No content in response:', JSON.stringify(data).slice(0, 500));
    throw new Error('Presentation generation returned empty content');
  }

  html = html.replace(/^```html?\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
  console.log('[GlobalChat] Presentation HTML generated, length:', html.length);
  return html;
}

// ── Main chat handler ─────────────────────────────────────────────────────────

async function globalChat(req, res) {
  try {
    const userId = req.user.id;
    const { question, history = [], workspace_id, llm_config_id } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });

    const config = await getAIConfig(userId, llm_config_id || null);
    if (!config.apiKey) return res.status(400).json({ error: 'No API key configured' });

    const toolsUsed = [];
    const sources = [];

    // Fetch all workspaces so AI knows names + IDs
    const workspaces = await db('notes_workspaces').where({ owner_id: userId }).select('id', 'name', 'description');

    const defaultWsId = workspace_id || workspaces?.[0]?.id;
    const wsMap = Object.fromEntries((workspaces || []).map(w => [w.id, w.name]));
    const wsNameToId = Object.fromEntries((workspaces || []).map(w => [w.name.toLowerCase(), w.id]));

    const wsContext = workspaces?.length
      ? `\nUser's workspaces:\n${workspaces.map(w => `- "${w.name}" (id: ${w.id})${w.description ? ` — ${w.description}` : ''}`).join('\n')}\nDefault workspace: "${wsMap[defaultWsId]}" (id: ${defaultWsId})`
      : '';

    const langHint = config.language && config.language !== 'auto' ? `Always respond in ${config.language}.` : '';

    const systemPrompt = `You are a helpful AI assistant integrated into Yesvara Notes — a personal knowledge management app.
You have access to the user's notes (via search_notes and list_recent_notes), their todo list (via list/create/toggle/delete todos), and can generate HTML presentations.
${getNowContext()}
${wsContext}

When creating todos, intelligently pick the most relevant workspace based on context. NEVER ask the user for a workspace ID — pick the best match yourself. If unsure, use the default workspace.
When the user asks about their notes' CONTENT (what's in a note, information stored, etc.), ALWAYS use search_notes first.
When the user asks about their LATEST/LAST/MOST RECENT note(s), or a recency-based overview, use list_recent_notes instead - search_notes will not find those, since it matches by meaning, not by date.
When asked to create/manage tasks, use the todo functions.
When asked for presentations or slides: FIRST use search_notes to gather relevant context from their notes, then use generate_presentation with that content to make it intelligent and grounded in their knowledge.
${langHint}
Be concise, friendly, and helpful.`;

    // Resolve workspace_id from tool args — support name or id
    function resolveWsId(args) {
      if (!args.workspace_id) return defaultWsId;
      // Already a valid UUID
      if (wsMap[args.workspace_id]) return args.workspace_id;
      // Try matching by name (case-insensitive)
      const byName = wsNameToId[args.workspace_id.toLowerCase()];
      return byName || defaultWsId;
    }

    // Apilogy/Telkom AI does not support function calling — pre-fetch RAG context
    const supportsTools = config.provider !== 'apilogy';

    let ragContext = '';
    if (!supportsTools) {
      // For non-function-calling providers: auto-search notes and inject context
      const { context, sources: ragSources } = await searchAllNotes(question, userId);
      if (context) {
        ragContext = `\n\nRelevant notes from user's knowledge base:\n---\n${context}\n---`;
        sources.push(...ragSources);
        toolsUsed.push('search_notes');
      }
      // Also fetch todos for the default workspace
      const todosData = await db('notes_todos')
        .where({ workspace_id: defaultWsId, created_by: userId, is_done: false })
        .select('id', 'title', 'is_done', 'priority', 'due_date')
        .orderBy('created_at', 'desc')
        .limit(20);
      if (todosData?.length) {
        ragContext += `\n\nUser's active todos:\n${todosData.map(t => `- [${t.priority}] ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ''}`).join('\n')}`;
      }
    }

    const messages = [
      { role: 'system', content: systemPrompt + ragContext },
      ...(history || []).slice(-10),
      { role: 'user', content: question }
    ];

    // ── Simple path for providers without function calling (e.g. Apilogy) ──────
    let presentation = null;

    if (!supportsTools) {
      const endpoint = '/chat/completions';
      const payload = { model: config.model, messages, temperature: 0.7 };
      const response = await fetch(`${config.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: buildHeaders(config),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`AI error ${response.status}: ${err.slice(0, 300)}`);
      }
      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || '';
      return res.json({ answer, toolsUsed, sources, presentation: null });
    }

    // ── Function calling loop for providers that support it (OpenRouter etc) ──
    for (let iter = 0; iter < 3; iter++) {
      const payload = {
        model: config.model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.7
      };

      const endpoint = '/chat/completions';
      const response = await fetch(`${config.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: buildHeaders(config),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`AI error ${response.status}: ${err.slice(0, 200)}`);
      }

      const data = await response.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) break;

      messages.push(msg);

      // No tool calls — done (also Apilogy never has tool_calls)
      if (!msg.tool_calls?.length) {
        return res.json({ answer: msg.content || '', presentation, toolsUsed, sources });
      }

      // Execute all tool calls
      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name;
        let fnArgs;
        try { fnArgs = JSON.parse(tc.function.arguments); } catch { fnArgs = {}; }

        toolsUsed.push(fnName);

        // Presentation is special — generate HTML then continue
        if (fnName === 'generate_presentation') {
          try {
            console.log('[GlobalChat] Generating presentation with args:', fnArgs);
            presentation = await generatePresentationHTML(fnArgs, config);
            console.log('[GlobalChat] Presentation generated successfully');
            messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Presentation generated successfully.' });
          } catch (err) {
            console.error('[GlobalChat] Presentation generation error:', err.message, err.stack);
            messages.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${err.message}` });
          }
          continue;
        }

        // Resolve workspace by name or id before executing
        if (fnArgs.workspace_id !== undefined) fnArgs.workspace_id = resolveWsId(fnArgs);
        const result = await executeTool(fnName, fnArgs, userId, defaultWsId, sources);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: String(result) });
      }
    }

    // Fallback
    const last = messages[messages.length - 1];
    res.json({ answer: last?.content || 'I ran into an issue. Please try again.', toolsUsed, presentation });
  } catch (err) {
    console.error('[GlobalChat]', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { globalChat };
