const { db } = require('../config/db');
const { getRelevantChunks, getCrossNoteChunks } = require('./notesEmbeddingService');
const { decrypt } = require('./encryptionService');
const { getAdminDefaultLLM, toChatConfig } = require('./adminLLMService');
const { upsertEntitiesForDocument, recordRelations, getEntityContextForQuery } = require('./notesEntityService');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const APILOGY_LLM_BASE    = 'https://telkom-ai-dag.api.apilogy.id/Telkom-LLM/0.0.4/llm';
const APILOGY_EMBED_BASE  = 'https://telkom-ai-dag.api.apilogy.id/Text_Embedding/0.0.1';
const OLLAMA_DEFAULT_BASE = 'http://localhost:11434/v1';

async function getUserSettings(userId) {
  const data = await db('notes_settings').where({ user_id: userId }).first();
  return data || {};
}

// Resolve LLM config: by configId (from llm_configs array) or fall back to legacy single config
async function getAIConfig(userId, configId = null) {
  const s = await getUserSettings(userId);
  const language = s.ai_default_language || 'auto';

  // ── Admin lock: force everyone onto the org-wide default, no exceptions ───
  const admin = await getAdminDefaultLLM();
  if (admin.locked && admin.defaultConfig) {
    return toChatConfig(admin.defaultConfig, language);
  }

  // ── Try llm_configs array first ──────────────────────────────────────────
  const configs = s.llm_configs || [];
  if (configs.length > 0) {
    const target = configId
      ? configs.find(c => c.id === configId)
      : configs.find(c => c.id === s.default_llm_config) || configs[0];

    if (target) {
      const isApilogy = target.provider === 'apilogy';
      const isOllama = target.provider === 'ollama';
      return {
        model: target.model,
        baseUrl: isApilogy ? APILOGY_LLM_BASE : isOllama ? (target.base_url || OLLAMA_DEFAULT_BASE) : (target.base_url || OPENROUTER_BASE),
        apiKey: isApilogy ? (s.apilogy_api_key || target.api_key) : (target.api_key || ''),
        provider: target.provider || 'openrouter',
        language,
        configName: target.name
      };
    }
  }

  // ── Legacy single-config fallback ────────────────────────────────────────
  const isApilogy = s.ai_provider === 'apilogy' && s.apilogy_api_key;
  if (isApilogy) return { model: s.ai_model || 'Qwen/Qwen2.5-32B-Instruct', baseUrl: APILOGY_LLM_BASE, apiKey: s.apilogy_api_key, provider: 'apilogy', language };
  if (s.ai_provider === 'ollama') return { model: s.ai_model || 'llama3.1', baseUrl: s.ai_base_url || OLLAMA_DEFAULT_BASE, apiKey: s.ai_api_key || '', provider: 'ollama', language };
  if (s.ai_api_key) return { model: s.ai_model || 'mistralai/mistral-small-3.2-24b-instruct', baseUrl: s.ai_base_url || OPENROUTER_BASE, apiKey: s.ai_api_key, provider: 'openrouter', language };

  // ── Admin default (org-wide, unlocked - used only when the user hasn't configured anything) ──
  if (admin.defaultConfig) return toChatConfig(admin.defaultConfig, language);

  // ── Last resort: env var ──────────────────────────────────────────────────
  return { model: 'mistralai/mistral-small-3.2-24b-instruct', baseUrl: OPENROUTER_BASE, apiKey: process.env.OPENROUTER_API_KEY, provider: 'openrouter', language };
}

function buildAuthHeaders(config) {
  if (config.provider === 'apilogy') {
    return { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' };
  }
  // Ollama's local OpenAI-compatible endpoint needs no API key by default.
  if (config.provider === 'ollama' && !config.apiKey) {
    return { 'Content-Type': 'application/json' };
  }
  return {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://yesvara.com',
    'X-Title': 'Yesvara Notes AI'
  };
}

module.exports.APILOGY_EMBED_BASE = APILOGY_EMBED_BASE;

function getNowContext() {
  const now = new Date();
  return now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

function buildLanguageInstruction(language) {
  if (!language || language === 'auto') return '';
  return `\n\nIMPORTANT: Always respond in ${language}, regardless of the language used in the input or note content.`;
}

async function callLLM(messages, userId, opts = {}) {
  const config = await getAIConfig(userId, opts.configId || null);

  // Inject language + date/time into first system message
  const langInstruction = buildLanguageInstruction(config.language);
  const dateContext = `\n\nCurrent date and time: ${getNowContext()}`;
  if (messages.length > 0 && messages[0].role === 'system') {
    messages = [
      { ...messages[0], content: messages[0].content + dateContext + langInstruction },
      ...messages.slice(1)
    ];
  }

  const payload = {
    model: opts.model || config.model,
    messages,
    temperature: opts.temperature || 0.3,
    max_tokens: opts.maxTokens || 2000,
    stream: false
  };

  // Add tools if provided
  if (opts.tools?.length) {
    payload.tools = opts.tools;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const message = data.choices[0].message;

  // Return full message if tools are being used (includes tool_calls)
  if (opts.tools?.length) {
    return message;
  }

  return message.content;
}

// ── Core AI operations ────────────────────────────────────────────────────────

async function summarizeDocument(content, userId, opts = {}) {
  const length = opts.length || 'medium'; // short | medium | detailed
  const lengthGuide = { short: '2-3 sentences', medium: '1 paragraph', detailed: '3-4 paragraphs' };

  const messages = [
    {
      role: 'system',
      content: `You are an expert note summarizer. Create clear, concise summaries that capture the key points and main ideas. Length: ${lengthGuide[length]}.`
    },
    {
      role: 'user',
      content: `Please summarize the following note:\n\n${content}`
    }
  ];

  return callLLM(messages, userId, { temperature: 0.3, maxTokens: 1000 });
}

async function extractEntities(content, userId) {
  const messages = [
    {
      role: 'system',
      content: `Extract key entities from the text. Return ONLY valid JSON array with objects having "type" (person|organization|date|project|technology|location|concept) and "value" fields. Example: [{"type":"person","value":"John Smith"},{"type":"date","value":"Q3 2024"}]`
    },
    {
      role: 'user',
      content: `Extract entities from:\n\n${content.slice(0, 3000)}`
    }
  ];

  const result = await callLLM(messages, userId, { temperature: 0.1, maxTokens: 800 });
  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

// Phase 4 of the knowledge-graph RAG: simple subject-relation-object triples
// between entities already extracted for this note (entityNames used as a
// hint so the model reuses the same names rather than paraphrasing them,
// which would break entity-matching downstream). Kept intentionally light -
// this is not meant to capture every nuance, just the clear, stated facts.
async function extractRelations(content, entityNames, userId) {
  if (!entityNames || entityNames.length < 2) return [];
  const hint = entityNames.slice(0, 30).join(', ');
  const messages = [
    {
      role: 'system',
      content: `Extract simple factual relationships stated in the text, between the entities listed below. Return ONLY a valid JSON array of objects with "subject", "relation", "object" fields (all short strings). "relation" should be a short present-tense verb phrase (e.g. "works at", "leads", "reports to", "located in"). Use the entity names exactly as given below wherever possible. Skip anything not clearly and directly stated - do not guess or infer. Entities: ${hint}. Example: [{"subject":"Jane Doe","relation":"works at","object":"Acme Corp"}]`
    },
    { role: 'user', content: `Extract relationships from:\n\n${content.slice(0, 3000)}` }
  ];

  const result = await callLLM(messages, userId, { temperature: 0.1, maxTokens: 600 });
  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

async function extractActionItems(content, userId) {
  const messages = [
    {
      role: 'system',
      content: `Extract action items, todos, and tasks from the text. Return ONLY valid JSON array with objects having "task" (string), "assignee" (string or null), "due_date" (string or null), and "priority" (high|medium|low) fields.`
    },
    {
      role: 'user',
      content: `Extract action items from:\n\n${content}`
    }
  ];

  const result = await callLLM(messages, userId, { temperature: 0.2, maxTokens: 1000 });
  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

async function suggestTags(title, content, userId) {
  const messages = [
    {
      role: 'system',
      content: `Suggest 3-7 relevant tags for the given note. Return ONLY a JSON array of lowercase strings. Example: ["project-management","meeting-notes","q3-planning"]`
    },
    {
      role: 'user',
      content: `Note title: ${title}\n\nContent: ${content.slice(0, 2000)}`
    }
  ];

  const result = await callLLM(messages, userId, { temperature: 0.3, maxTokens: 300 });
  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

async function extractKeyPoints(content, userId) {
  const messages = [
    {
      role: 'system',
      content: `Extract the 3-7 most important key points from the note. Return ONLY a JSON array of strings.`
    },
    {
      role: 'user',
      content: `Extract key points from:\n\n${content}`
    }
  ];

  const result = await callLLM(messages, userId, { temperature: 0.2, maxTokens: 800 });
  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

async function generateFAQ(content, title, userId) {
  const messages = [
    {
      role: 'system',
      content: `Generate a comprehensive FAQ based on the provided notes. Return ONLY a JSON array with objects having "question" and "answer" fields. Generate 5-10 Q&A pairs.`
    },
    {
      role: 'user',
      content: `Title: ${title}\n\n${content}`
    }
  ];

  const result = await callLLM(messages, userId, { temperature: 0.5, maxTokens: 2000 });
  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

async function generateSlideOutline(content, title, userId) {
  if (!content || content.trim().length < 100) {
    console.warn('[Notes AI] Content too short for slides:', content.length);
    return [{
      title: title || 'Slide 1',
      content: ['Content too short. Please add more details to your note.'],
      notes: ''
    }];
  }

  const messages = [
    {
      role: 'system',
      content: `You are a presentation expert. Create a slide deck outline from notes.
Return ONLY a valid JSON array. Each object must have exactly:
- "title": slide title (string)
- "content": bullet points (array of strings)
- "notes": presenter notes (string)

Example format:
[{"title":"Introduction","content":["Point 1","Point 2"],"notes":"Talk about context"}]

Do not include any text before or after the JSON array.`
    },
    {
      role: 'user',
      content: `Create 4-5 slides from this note:
Title: ${title}

Content:
${content.slice(0, 2500)}`
    }
  ];

  try {
    const result = await callLLM(messages, userId, { temperature: 0.5, maxTokens: 3000 });
    console.log('[Notes AI] Raw slide response length:', result.length);

    if (!result || result.trim().length === 0) {
      console.error('[Notes AI] Empty response from LLM');
      return [{
        title: title || 'Slide 1',
        content: ['No content generated'],
        notes: ''
      }];
    }

    // Try to extract JSON array - be more flexible
    let jsonMatch = result.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.error('[Notes AI] No JSON array found. Response:', result.slice(0, 300));
      return [{
        title: title || 'Slide 1',
        content: [result.slice(0, 100)],
        notes: ''
      }];
    }

    let jsonStr = jsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (parseErr) {
      console.error('[Notes AI] JSON parse error:', parseErr.message, 'JSON:', jsonStr.slice(0, 200));
    }

    return [{
      title: title || 'Slide 1',
      content: ['Failed to parse slides. Please try again.'],
      notes: ''
    }];
  } catch (err) {
    console.error('[Notes AI] generateSlideOutline error:', err.message);
    throw err;
  }
}

function extractDrawioLabels(diagramContext) {
  // diagramContext is already plain text from the frontend (extracted from SVG)
  // e.g. "Diagram 1: contains elements: Actor, Ngantuk"
  if (!diagramContext || !diagramContext.trim()) return '';
  return `\n\n[Diagrams in this note:\n${diagramContext}\nUse these elements to answer questions about the diagrams.]`;
}

async function chatWithNote(content, title, question, history, userId, documentId, diagramXml, workspaceId, webContext = '', configId = null) {
  let contextContent = content.slice(0, 4000);
  let allSources = [];
  let ragUsed = false;

  // 1. RAG from current note's indexed chunks
  if (documentId) {
    try {
      const result = await getRelevantChunks(question, documentId, undefined, userId);
      if (result) {
        contextContent = result.context;
        allSources = result.sources;
        ragUsed = true;
      }
    } catch {}
  }

  // 2. Cross-note RAG
  let crossNoteContext = '';
  if (workspaceId && documentId) {
    try {
      const result = await getCrossNoteChunks(question, workspaceId, userId, documentId);
      if (result) {
        crossNoteContext = result.context;
        allSources = [...allSources, ...result.sources];
      }
    } catch {}
  }

  // 2.5. Knowledge-graph RAG: structured entity lookup, complementing the
  // chunk-similarity search above. A question naming a specific person/
  // project/etc doesn't always score high enough on embedding similarity to
  // surface via getCrossNoteChunks, but a plain name match against the
  // entity table catches it exactly. Skip notes chunk-RAG already pulled in.
  if (workspaceId) {
    try {
      const entityResult = await getEntityContextForQuery(question, workspaceId, userId, documentId);
      if (entityResult) {
        const alreadyIncluded = new Set(allSources.map(s => s.documentId));
        const newSources = entityResult.sources.filter(s => !alreadyIncluded.has(s.documentId));
        if (newSources.length) {
          crossNoteContext += (crossNoteContext ? '\n\n---\n\n' : '') + entityResult.context;
          allSources = [...allSources, ...newSources];
        }
      }
    } catch {}
  }

  // 3. Diagram labels
  const diagramContext = diagramXml ? extractDrawioLabels(diagramXml) : '';
  console.log('[Chat] diagramXml len:', diagramXml?.length ?? 0, '| diagramContext len:', diagramContext.length);
  if (diagramContext) console.log('[Chat] diagramContext preview:', diagramContext.slice(0, 200));

  // Build full context
  let fullContext = contextContent;
  if (diagramContext) fullContext += diagramContext;
  if (crossNoteContext) fullContext += `\n\n---\n[Related notes from your workspace]\n${crossNoteContext}`;
  if (webContext) fullContext += `\n\n---\n${webContext}`;

  const hasRelated = allSources.some(s => s.isCrossNote);
  const hasDiagram = !!diagramContext;
  const hasWeb = !!webContext;

  const messages = [
    {
      role: 'system',
      content: `You are an intelligent AI assistant helping the user work with their personal knowledge base. You have access to:
- Current note: "${title}"
${hasRelated ? `- Related notes from the workspace (automatically retrieved by semantic search)` : ''}
${hasDiagram ? `- An embedded diagram in the note` : ''}
${hasWeb ? `- Live web search results` : ''}

Your approach:
1. REASON about what you find in the context. If related notes provide relevant information, use them to give better answers.
2. SYNTHESIZE information from multiple sources (current note, related notes, diagrams, web results) when applicable.
3. ACKNOWLEDGE sources naturally in your response (e.g., "Your other note on X mentions..." or "The diagram shows...").
4. PROVIDE insights that connect information across the user's knowledge base, not just answer from current note alone.
5. Be conversational, helpful, and thorough. Ask follow-up questions if needed to clarify what the user wants.
${hasDiagram ? '\nIMPORTANT: The note includes a diagram — reference it when relevant to answer questions.' : ''}
${hasWeb ? '\nIMPORTANT: Web results are included for timely, factual answers. Do NOT use [1] or [REF] markers — cite naturally instead.' : ''}

Context from your knowledge base:
${fullContext}`
    },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: question }
  ];

  const answer = await callLLM(messages, userId, { temperature: 0.7, maxTokens: 1500, configId });

  // Add web search results as sources
  if (webContext && allSources !== undefined) {
    const webLines = webContext.split('\n').filter(l => l.match(/^\d+\./));
    // Parse titles and URLs from context
    const webResults = [];
    const resultBlocks = webContext.split(/\n(?=\d+\.)/);
    for (const block of resultBlocks) {
      const titleMatch = block.match(/^\d+\.\s+(.+)/);
      const urlMatch = block.match(/Source:\s+(https?:\/\/\S+)/);
      const snippetMatch = block.match(/^\d+\.\s+.+\n\s+(.+)/);
      if (titleMatch) {
        webResults.push({
          documentId: null,
          title: titleMatch[1].trim(),
          chunkText: snippetMatch?.[1]?.trim() || '',
          url: urlMatch?.[1] || '',
          score: 1,
          isCrossNote: false,
          isWeb: true
        });
      }
    }
    allSources = [...allSources, ...webResults];
  }

  const sortedSources = allSources.sort((a, b) => b.score - a.score);
  return { answer, sources: sortedSources };
}

// Tool calling version of chat — AI can search scoped knowledge, generate presentations/diagrams
// knowledgeScope: { mode: 'note' } | { mode: 'folders', folderIds } | { mode: 'workspaces', workspaceIds } | null (whole workspace)
async function chatWithNoteAgentic(content, title, question, history, userId, documentId, diagramXml, workspaceId, webContext = '', configId = null, knowledgeScope = null) {
  let allSources = [];
  let presentationHtml = null;
  let generatedDiagramXml = null;
  const messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: question }];

  // Extract diagram context if available
  const diagramContext = diagramXml ? extractDrawioLabels(diagramXml) : '';

  const noteContext = content.slice(0, 3000) + (diagramContext ? `\n\n[Diagram in note]:\n${diagramContext}` : '');

  const noteOnly = knowledgeScope?.mode === 'note';
  const searchScopeLabel =
    knowledgeScope?.mode === 'folders' ? 'the selected folder(s)' :
    knowledgeScope?.mode === 'workspaces' ? 'the selected workspace(s)' :
    'the workspace';

  // Tool definitions for editor chat
  const tools = [];

  if (!noteOnly) {
    tools.push({
      type: 'function',
      function: {
        name: 'search_workspace',
        description: `Search OTHER notes in ${searchScopeLabel}. Only call this when the current note does not contain enough information to answer the question, or the user is explicitly asking about other notes. Do NOT call this if the answer can be found in the current note content already provided.`,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query to find related notes' }
          },
          required: ['query']
        }
      }
    });
  }

  tools.push(
    {
      type: 'function',
      function: {
        name: 'generate_presentation',
        description: 'Generate a real, visual HTML slide presentation that opens in a preview window for the user. ALWAYS call this when the user asks to create/make slides or a presentation (e.g. "buatkan slidenya", "make a presentation"). NEVER write slides as plain text instead of calling this.',
        parameters: {
          type: 'object',
          properties: {
            topic:   { type: 'string', description: 'Presentation title/topic' },
            content: { type: 'string', description: 'The full material to cover in the slides. Include ALL key points — pull them from the conversation and/or the note, in the same language as the user.' },
            style:   { type: 'string', enum: ['modern', 'minimal', 'dark', 'gradient'], description: 'Visual style (default modern)' },
            slides:  { type: 'number', description: 'Number of slides (3-10, default 6)' }
          },
          required: ['topic', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'generate_diagram',
        description: 'Generate a draw.io diagram and insert it into the user\'s note. ALWAYS call this when the user asks to create/draw a diagram, flowchart, architecture visual, or mind map (e.g. "buatkan diagramnya", "draw the architecture"). NEVER describe the diagram as text instead of calling this.',
        parameters: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Detailed description of the diagram: what nodes/components, how they connect, labels. Pull details from the conversation and/or the note, in the same language as the user.' }
          },
          required: ['description']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'generate_instagram_post',
        description: 'Create a visual Instagram carousel post (designed slides + caption + hashtags) that opens in a preview window. ALWAYS call this when the user asks for an Instagram/social media post (e.g. "buatkan post instagramnya"). NEVER write the post as plain text instead.',
        parameters: {
          type: 'object',
          properties: {
            topic:   { type: 'string', description: 'Post topic' },
            content: { type: 'string', description: 'Key material for the post — pull from the conversation and/or the note, in the user\'s language' },
            size:    { type: 'string', enum: ['square', 'portrait', 'story'], description: 'Post size: square 1:1 (default), portrait 4:5, story 9:16 — use what the user asks for' },
            theme:   { type: 'string', enum: ['purple', 'ocean', 'sunset', 'forest', 'dark', 'mono'], description: 'Color theme (default purple)' },
            slides:  { type: 'number', description: 'Total slides 3-10 (default 6)' }
          },
          required: ['topic', 'content']
        }
      }
    }
  );

  const systemPrompt = `You are an intelligent AI assistant helping the user work with their note: "${title}".

The full content of this note is already provided below — use it to answer directly.
${diagramContext ? 'A diagram embedded in the note is also included.' : ''}
${webContext ? 'Live web search results are included.' : ''}
${noteOnly ? '\nKnowledge scope is limited to this note only.' : `
TOOL USAGE RULE — search_workspace:
Only call search_workspace when the question CANNOT be answered from the current note alone, for example:
- The user explicitly asks about other notes or their workspace
- The question references something not covered in this note
- You need context from related notes to give a complete answer

Do NOT call search_workspace for:
- Summarizing, analyzing, or explaining this note's content
- Questions that are fully answerable from the content below
- General writing help, rewording, formatting requests

When in doubt: answer from the note first. Only search if truly needed.`}

CREATOR TOOLS:
- generate_presentation: when the user wants slides/presentation, call this tool — a real visual slide deck is shown to the user. Do not write a text outline as a substitute.
- generate_diagram: when the user wants a diagram/flowchart/architecture drawing, call this tool — the diagram is inserted directly into their note. Do not describe it in text as a substitute.
- generate_instagram_post: when the user wants an Instagram/social media post, call this tool — a designed carousel with caption is shown to the user. Do not write the post as text as a substitute.
After a creator tool succeeds, reply with a short confirmation in the user's language (1-2 sentences), not the full content.
${diagramContext ? '\nIMPORTANT: Reference the diagram when relevant to the question.' : ''}
${webContext ? '\nIMPORTANT: Web results are included — cite sources naturally, not with [REF] markers.' : ''}

Current note content:
${noteContext}
${webContext ? `\nWeb search results:\n${webContext}` : ''}`;

  let currentMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  let maxIterations = 3; // e.g. search → create → final answer
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    const response = await callLLM(currentMessages, userId, { tools, temperature: 0.7, maxTokens: 1500, configId });

    // No tool calls — we have the final answer
    if (!response.tool_calls?.length) {
      return { answer: response.content || '', sources: allSources, presentation: presentationHtml, diagramXml: generatedDiagramXml };
    }

    // Execute tool calls
    const toolResults = [];
    for (const tc of response.tool_calls) {
      let fnArgs;
      try { fnArgs = JSON.parse(tc.function.arguments); } catch { fnArgs = {}; }

      if (tc.function.name === 'search_workspace') {
        try {
          const searchQuery = fnArgs.query || question;
          console.log('[EditorChat] Tool call - search_workspace:', searchQuery, '| scope:', knowledgeScope?.mode || 'workspace');
          const searchResults = await getCrossNoteChunks(searchQuery, workspaceId, userId, documentId, 4, knowledgeScope);

          // Knowledge-graph RAG: structured entity lookup alongside the
          // chunk-similarity search above. Catches exact named-entity
          // questions ("where does X work") that don't always score high
          // enough on embedding similarity to surface otherwise.
          let entityContext = '';
          try {
            const entityResult = await getEntityContextForQuery(searchQuery, workspaceId, userId, documentId);
            if (entityResult) {
              const already = new Set([...allSources, ...(searchResults?.sources || [])].map(s => s.documentId));
              const newSources = entityResult.sources.filter(s => !already.has(s.documentId));
              if (newSources.length) {
                entityContext = entityResult.context;
                allSources = [...allSources, ...newSources];
              }
            }
          } catch {}

          if (searchResults || entityContext) {
            if (searchResults) allSources = [...allSources, ...searchResults.sources];
            const combined = [searchResults?.context, entityContext].filter(Boolean).join('\n\n---\n\n');
            toolResults.push({ tool_call_id: tc.id, result: combined || 'No related notes found.' });
          } else {
            toolResults.push({ tool_call_id: tc.id, result: 'No related notes found.' });
          }
        } catch (err) {
          console.error('[ChatAgentic] search_workspace error:', err.message);
          toolResults.push({ tool_call_id: tc.id, result: `Error: ${err.message}` });
        }
      } else if (tc.function.name === 'generate_presentation') {
        try {
          console.log('[EditorChat] Tool call - generate_presentation:', fnArgs.topic);
          presentationHtml = await generatePresentation(
            fnArgs.topic || title,
            fnArgs.content || content.slice(0, 4000),
            userId,
            { style: fnArgs.style, slides: fnArgs.slides, configId }
          );
          toolResults.push({ tool_call_id: tc.id, result: 'Presentation generated successfully — it is now open in a preview window for the user. Confirm briefly; do NOT repeat the slides as text.' });
        } catch (err) {
          console.error('[ChatAgentic] generate_presentation error:', err.message);
          toolResults.push({ tool_call_id: tc.id, result: `Error generating presentation: ${err.message}` });
        }
      } else if (tc.function.name === 'generate_diagram') {
        try {
          console.log('[EditorChat] Tool call - generate_diagram:', (fnArgs.description || '').slice(0, 80));
          generatedDiagramXml = await generateDiagramXML(
            fnArgs.description || question,
            title,
            content,
            userId,
            configId
          );
          toolResults.push({ tool_call_id: tc.id, result: 'Diagram generated and inserted into the user\'s note. Tell them to click "Open Editor" on the diagram block to render/adjust it. Confirm briefly; do NOT describe the whole diagram in text.' });
        } catch (err) {
          console.error('[ChatAgentic] generate_diagram error:', err.message);
          toolResults.push({ tool_call_id: tc.id, result: `Error generating diagram: ${err.message}` });
        }
      } else if (tc.function.name === 'generate_instagram_post') {
        try {
          console.log('[EditorChat] Tool call - generate_instagram_post:', fnArgs.topic);
          const ig = await generateInstagramPost(
            fnArgs.topic || title,
            fnArgs.content || content.slice(0, 4000),
            userId,
            { configId, size: fnArgs.size, theme: fnArgs.theme, slides: fnArgs.slides }
          );
          presentationHtml = ig.html;
          toolResults.push({ tool_call_id: tc.id, result: 'Instagram post generated — the designed carousel with caption is now open in a preview window for the user. Confirm briefly; do NOT repeat the caption in full.' });
        } catch (err) {
          console.error('[ChatAgentic] generate_instagram_post error:', err.message);
          toolResults.push({ tool_call_id: tc.id, result: `Error generating Instagram post: ${err.message}` });
        }
      } else {
        toolResults.push({ tool_call_id: tc.id, result: 'Unknown tool.' });
      }
    }

    // Continue conversation with tool results
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content || '', tool_calls: response.tool_calls },
      ...toolResults.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.result }))
    ];
  }

  // Fallback if max iterations reached
  const fallbackAnswer = (presentationHtml || generatedDiagramXml)
    ? '✓ Done — the generated result is ready.'
    : 'I reached the maximum tool iterations. Please try a more specific question.';
  return { answer: fallbackAnswer, sources: allSources, presentation: presentationHtml, diagramXml: generatedDiagramXml };
}

// ── Creator tools: presentation, instagram post, diagram ─────────────────────

// LLM produces compact slide JSON; we render the HTML deck ourselves so the
// output is never truncated and navigation/scaling always works.
async function generatePresentation(title, content, userId, opts = {}) {
  const style = opts.style || 'modern';
  const slideCount = Math.min(Math.max(opts.slides || 6, 3), 10);

  const messages = [
    { role: 'system', content: 'You are a top-tier presentation designer. Return ONLY valid JSON — no markdown, no code fences, no explanation.' },
    {
      role: 'user',
      content: `Create a ${slideCount}-slide presentation about: "${title}"

Material to cover (match its language exactly):
${content.slice(0, 4000)}

Return ONLY this JSON structure: {"slides":[ ...${slideCount} slide objects... ]}

Available slide layouts — VARY them, do not use bullets for everything:
- {"layout":"title","title":"main title","subtitle":"short subtitle","date":"optional date"} — slide 1 only
- {"layout":"cards","title":"...","cards":[{"icon":"bi-lightbulb","title":"...","text":"1-2 sentences"}]} — 3-4 cards, real Bootstrap Icons names (bi-*)
- {"layout":"bullets","title":"...","bullets":["specific point 1","specific point 2"]} — 3-6 points
- {"layout":"two_col","title":"...","leftTitle":"...","left":["..."],"rightTitle":"...","right":["..."]} — comparison / before-after
- {"layout":"stats","title":"...","stats":[{"value":"85%","label":"what it measures"}]} — 2-4 big numbers, only if the material has real numbers
- {"layout":"table","title":"...","headers":["col1","col2"],"rows":[["a","b"],["c","d"]]}
- {"layout":"steps","title":"...","steps":[{"title":"...","text":"..."}]} — process/timeline/phases, 3-5 steps
- {"layout":"quote","quote":"the single key insight","attribution":"optional source"}
- {"layout":"closing","title":"...","takeaways":["..."],"cta":"optional closing line"} — last slide only

Rules:
- Slide 1 = title layout; last slide = closing layout
- Be SPECIFIC: use actual names, components, numbers, and decisions from the material — no generic filler
- Every text field is plain text (no markdown)`
    }
  ];

  const raw = await callLLM(messages, userId, { temperature: 0.5, maxTokens: 3500, configId: opts.configId });
  const slides = extractSlidesJson(raw);
  if (!slides?.length) throw new Error('Presentation generation returned no valid slides');
  return buildPresentationHTML(slides, style, title);
}

// Tolerant slide extractor: pulls complete top-level objects out of the slides
// array via bracket counting, so a truncated final slide is dropped, not fatal.
function extractSlidesJson(raw) {
  const m = raw.match(/"slides"\s*:\s*\[/);
  if (!m) return null;
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = raw.indexOf(m[0]) + m[0].length; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try { out.push(JSON.parse(raw.slice(start, i + 1))); } catch {}
        start = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return out.length ? out : null;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPresentationHTML(slides, style = 'modern', deckTitle = 'Presentation') {
  const themes = {
    modern:   { bg: '#f4f4fb', slide: '#ffffff', accent: '#6c63ff', text: '#1a1a2e', muted: '#64748b', card: '#f8f7ff', border: '#e2e0ff' },
    minimal:  { bg: '#eef0f3', slide: '#ffffff', accent: '#1e293b', text: '#1e293b', muted: '#64748b', card: '#f1f5f9', border: '#e2e8f0' },
    dark:     { bg: '#0f0f1a', slide: '#1a1a2e', accent: '#a78bfa', text: '#e8e6f0', muted: '#94a3b8', card: '#252540', border: '#312e5c' },
    gradient: { bg: 'linear-gradient(135deg,#5b54e0,#7c3aed)', slide: 'rgba(255,255,255,0.08)', accent: '#fbbf24', text: '#ffffff', muted: 'rgba(255,255,255,0.75)', card: 'rgba(255,255,255,0.12)', border: 'rgba(255,255,255,0.25)' }
  };
  const t = themes[style] || themes.modern;

  const R = {
    title: s => `<div class="center">
      <div class="deco"></div>
      <h1>${escHtml(s.title)}</h1>
      ${s.subtitle ? `<p class="subtitle">${escHtml(s.subtitle)}</p>` : ''}
      ${s.date ? `<p class="date">${escHtml(s.date)}</p>` : ''}
    </div>`,
    bullets: s => `<h2>${escHtml(s.title)}</h2>
      <ul class="bl">${(s.bullets || []).map(b => `<li><i class="bi bi-check-circle-fill"></i><span>${escHtml(b)}</span></li>`).join('')}</ul>`,
    cards: s => `<h2>${escHtml(s.title)}</h2>
      <div class="grid g${Math.min((s.cards || []).length, 4)}">${(s.cards || []).map(c => `<div class="card"><i class="bi ${escHtml(c.icon || 'bi-star')}"></i><h3>${escHtml(c.title)}</h3><p>${escHtml(c.text)}</p></div>`).join('')}</div>`,
    stats: s => `<h2>${escHtml(s.title)}</h2>
      <div class="stats">${(s.stats || []).map(x => `<div class="stat"><div class="v">${escHtml(x.value)}</div><div class="l">${escHtml(x.label)}</div></div>`).join('')}</div>`,
    table: s => `<h2>${escHtml(s.title)}</h2>
      <table><thead><tr>${(s.headers || []).map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${(s.rows || []).map(r => `<tr>${(Array.isArray(r) ? r : [r]).map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
    quote: s => `<div class="center">
      <i class="bi bi-quote qmark"></i>
      <blockquote>${escHtml(s.quote || s.title)}</blockquote>
      ${s.attribution ? `<p class="attr">— ${escHtml(s.attribution)}</p>` : ''}
    </div>`,
    steps: s => `<h2>${escHtml(s.title)}</h2>
      <div class="steps">${(s.steps || []).map((st, i) => `<div class="step"><div class="num">${i + 1}</div><div class="stx"><h3>${escHtml(st.title)}</h3><p>${escHtml(st.text || '')}</p></div></div>`).join('')}</div>`,
    two_col: s => `<h2>${escHtml(s.title)}</h2>
      <div class="cols">
        <div class="col"><h3>${escHtml(s.leftTitle || '')}</h3><ul class="bl sm">${(s.left || []).map(b => `<li><i class="bi bi-dot"></i><span>${escHtml(b)}</span></li>`).join('')}</ul></div>
        <div class="col"><h3>${escHtml(s.rightTitle || '')}</h3><ul class="bl sm">${(s.right || []).map(b => `<li><i class="bi bi-dot"></i><span>${escHtml(b)}</span></li>`).join('')}</ul></div>
      </div>`,
    closing: s => `<div class="center">
      <h1 class="h1sm">${escHtml(s.title)}</h1>
      <ul class="bl closing">${(s.takeaways || []).map(b => `<li><i class="bi bi-check-circle-fill"></i><span>${escHtml(b)}</span></li>`).join('')}</ul>
      ${s.cta ? `<p class="cta">${escHtml(s.cta)}</p>` : ''}
    </div>`
  };
  R['two-col'] = R.two_col;

  const slideHtml = slides.map((s, i) =>
    `<section class="slide${i === 0 ? ' active' : ''}">${(R[s.layout] || R.bullets)(s)}</section>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(deckTitle)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden}
body{background:${t.bg};font-family:'Inter',system-ui,sans-serif;color:${t.text}}
.viewport{position:fixed;inset:0 0 64px 0;display:flex;align-items:center;justify-content:center}
.stage{width:1280px;height:720px;position:relative;transform-origin:center;flex-shrink:0}
.slide{position:absolute;inset:0;padding:64px 88px;background:${t.slide};border:1px solid ${t.border};border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.12);opacity:0;transform:translateY(14px);transition:all .35s ease;pointer-events:none;display:flex;flex-direction:column;overflow:hidden}
.slide.active{opacity:1;transform:none;pointer-events:auto}
.center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:22px}
.deco{width:72px;height:6px;border-radius:3px;background:${t.accent}}
h1{font-size:54px;font-weight:800;line-height:1.15;letter-spacing:-1px}
.h1sm{font-size:42px}
.subtitle{font-size:24px;color:${t.muted};font-weight:600}
.date{font-size:17px;color:${t.muted}}
h2{font-size:34px;font-weight:800;margin-bottom:34px;padding-bottom:14px;border-bottom:4px solid ${t.accent};align-self:flex-start;letter-spacing:-.5px}
h3{font-size:19px;font-weight:700}
.bl{list-style:none;display:flex;flex-direction:column;gap:20px;font-size:21px;line-height:1.5}
.bl li{display:flex;gap:14px;align-items:flex-start}
.bl li i{color:${t.accent};flex-shrink:0;margin-top:3px}
.bl.sm{font-size:17px;gap:13px}
.bl.closing{font-size:20px;text-align:left}
.grid{display:grid;gap:22px;flex:1;align-content:center}
.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(2,1fr)}
.card{background:${t.card};border:1px solid ${t.border};border-radius:14px;padding:26px;display:flex;flex-direction:column;gap:10px}
.card i{font-size:30px;color:${t.accent}}
.card p{font-size:15.5px;color:${t.muted};line-height:1.5}
.stats{display:flex;gap:26px;flex:1;align-items:center;justify-content:center}
.stat{background:${t.card};border:1px solid ${t.border};border-radius:14px;padding:38px 44px;text-align:center;min-width:200px}
.stat .v{font-size:52px;font-weight:800;color:${t.accent}}
.stat .l{font-size:16px;color:${t.muted};margin-top:8px}
table{width:100%;border-collapse:collapse;font-size:17px}
th{background:${t.card};color:${t.accent};text-align:left;padding:13px 16px;border:1px solid ${t.border};font-size:15px;text-transform:uppercase;letter-spacing:.4px}
td{padding:12px 16px;border:1px solid ${t.border};color:${t.text}}
.qmark{font-size:64px;color:${t.accent};opacity:.5}
blockquote{font-size:33px;font-weight:700;line-height:1.4;max-width:900px}
.attr{font-size:18px;color:${t.muted}}
.steps{display:flex;flex-direction:column;gap:20px;flex:1;justify-content:center}
.step{display:flex;gap:18px;align-items:flex-start}
.num{width:42px;height:42px;border-radius:50%;background:${t.accent};color:#fff;font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.stx p{font-size:16.5px;color:${t.muted};margin-top:4px;line-height:1.5}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:34px;flex:1}
.col{background:${t.card};border:1px solid ${t.border};border-radius:14px;padding:28px}
.col h3{color:${t.accent};margin-bottom:18px;font-size:21px}
.cta{font-size:21px;font-weight:600;color:${t.accent}}
.nav{position:fixed;bottom:0;left:0;right:0;height:64px;display:flex;align-items:center;justify-content:center;gap:18px;z-index:1000}
.nav button{padding:9px 22px;border-radius:24px;border:1px solid ${t.border};background:${style === 'dark' || style === 'gradient' ? 'rgba(255,255,255,0.08)' : '#ffffff'};color:${t.text};font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:7px;box-shadow:0 4px 14px rgba(0,0,0,.1)}
.nav button:hover{border-color:${t.accent};color:${t.accent}}
.nav button:disabled{opacity:.35;cursor:default}
#ctr{font-size:14px;font-weight:700;color:${t.muted};min-width:64px;text-align:center}
</style>
</head>
<body>
<div class="viewport"><div class="stage" id="stage">
${slideHtml}
</div></div>
<div class="nav">
  <button id="prev"><i class="bi bi-arrow-left"></i> Prev</button>
  <span id="ctr"></span>
  <button id="next">Next <i class="bi bi-arrow-right"></i></button>
</div>
<script>
var i=0,S=document.querySelectorAll('.slide'),total=S.length;
function show(n){i=Math.max(0,Math.min(total-1,n));S.forEach(function(s,j){s.classList.toggle('active',j===i)});document.getElementById('ctr').textContent=(i+1)+' / '+total;document.getElementById('prev').disabled=i===0;document.getElementById('next').disabled=i===total-1;}
document.getElementById('prev').onclick=function(){show(i-1)};
document.getElementById('next').onclick=function(){show(i+1)};
window.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown')show(i+1);if(e.key==='ArrowLeft'||e.key==='PageUp')show(i-1);});
function fit(){var s=Math.min(window.innerWidth/1340,(window.innerHeight-80)/760);document.getElementById('stage').style.transform='scale('+s+')';}
window.addEventListener('resize',fit);fit();show(0);
</script>
</body>
</html>`;
}

// LLM produces carousel JSON; we render a visual IG-style preview (square
// slides + caption panel) so the user gets a real post, not a text outline.
// opts: { configId, size: 'square'|'portrait'|'story', theme, slides, brand }
async function generateInstagramPost(title, content, userId, opts = {}) {
  const slideCount = Math.min(Math.max(opts.slides || 6, 3), 10);
  const contentSlides = slideCount - 2;

  const messages = [
    { role: 'system', content: 'You are a social media designer specializing in Instagram carousels. Return ONLY valid JSON — no markdown, no code fences, no explanation.' },
    {
      role: 'user',
      content: `Create a ${slideCount}-slide Instagram carousel post about: "${title}"

Material (match its language exactly):
${content.slice(0, 4000)}

Return ONLY this JSON structure:
{
 "slides":[
   {"type":"cover","title":"scroll-stopping hook, max 8 words","subtitle":"one short supporting line"},
   {"type":"content","heading":"short heading","points":["punchy point, max 12 words","..."]},
   {"type":"cta","title":"closing line","text":"call to action","button":"short button label"}
 ],
 "caption":"engaging 100-180 word caption with emojis and \\n line breaks, ends with a question or CTA",
 "hashtags":["#tag1","#tag2"]
}

Rules:
- First slide type=cover, last slide type=cta, exactly ${contentSlides} content slides in between
- Each content slide: 1 clear idea, 2-4 points max — Instagram is skimmed, keep text SHORT
- 20-25 hashtags: mix broad and niche
- Everything in the same language as the material`
    }
  ];

  const raw = await callLLM(messages, userId, { temperature: 0.7, maxTokens: 2500, configId: opts.configId });

  let data = null;
  const jm = raw.match(/\{[\s\S]*\}/);
  if (jm) { try { data = JSON.parse(jm[0]); } catch {} }
  if (!data?.slides?.length) {
    const slides = extractSlidesJson(raw);
    if (!slides?.length) throw new Error('Instagram generation returned no valid JSON');
    const capMatch = raw.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    data = { slides, caption: capMatch ? JSON.parse(`"${capMatch[1]}"`) : '', hashtags: [] };
  }

  const html = buildInstagramHTML(data, title, opts);
  const caption = [data.caption, (data.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
  return { html, caption };
}

const IG_SIZES = {
  square:   { w: 1080, h: 1080, label: '1:1' },
  portrait: { w: 1080, h: 1350, label: '4:5' },
  story:    { w: 1080, h: 1920, label: '9:16' }
};

const IG_THEMES = {
  purple: { g1: '#5b54e0', g2: '#a855f7', accent: '#6c63ff', badgeBg: '#f0eeff', cBg: '#ffffff', cText: '#171730' },
  ocean:  { g1: '#0284c7', g2: '#14b8a6', accent: '#0891b2', badgeBg: '#e0f5fa', cBg: '#ffffff', cText: '#0f2233' },
  sunset: { g1: '#f97316', g2: '#ec4899', accent: '#ea580c', badgeBg: '#fff1e6', cBg: '#ffffff', cText: '#331507' },
  forest: { g1: '#15803d', g2: '#84cc16', accent: '#16a34a', badgeBg: '#eaf7ea', cBg: '#ffffff', cText: '#12210f' },
  dark:   { g1: '#111827', g2: '#4c1d95', accent: '#a78bfa', badgeBg: '#2d2d44', cBg: '#171727', cText: '#e8e6f0' },
  mono:   { g1: '#111111', g2: '#3f3f46', accent: '#111111', badgeBg: '#f0f0f0', cBg: '#ffffff', cText: '#111111' }
};

function buildInstagramHTML(data, title = 'Instagram Post', opts = {}) {
  const dim = IG_SIZES[opts.size] || IG_SIZES.square;
  const th = IG_THEMES[opts.theme] || IG_THEMES.purple;
  const brand = opts.brand || 'your.brand';
  const slides = data.slides || [];
  const cap = String(data.caption || '');
  const tags = (data.hashtags || []).join(' ');
  const n = slides.length;

  const rs = {
    cover: s => `<div class="sq cover">
      <div class="deco"></div>
      <h1>${escHtml(s.title)}</h1>
      ${s.subtitle ? `<p class="sub">${escHtml(s.subtitle)}</p>` : ''}
      <div class="swipe">Swipe <i class="bi bi-arrow-right"></i></div>
    </div>`,
    content: (s, i) => `<div class="sq content">
      <div class="topbar"></div>
      <div class="badge">${i + 1}/${n}</div>
      <h2>${escHtml(s.heading || s.title)}</h2>
      ${s.points?.length
        ? `<ul>${s.points.map(p => `<li><i class="bi bi-check-circle-fill"></i><span>${escHtml(p)}</span></li>`).join('')}</ul>`
        : `<p class="body">${escHtml(s.text || '')}</p>`}
    </div>`,
    cta: s => `<div class="sq cover cta">
      <h1 class="h1sm">${escHtml(s.title)}</h1>
      ${s.text ? `<p class="sub">${escHtml(s.text)}</p>` : ''}
      ${s.button ? `<div class="pill">${escHtml(s.button)}</div>` : ''}
    </div>`
  };

  const slideHtml = slides.map((s, i) =>
    `<section class="slide${i === 0 ? ' active' : ''}">${(rs[s.type] || rs.content)(s, i)}</section>`
  ).join('\n');

  const dots = slides.map((_, i) => `<span class="dot${i === 0 ? ' on' : ''}"></span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)} — Instagram Post</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden}
body{background:#f0f0f5;font-family:'Inter',system-ui,sans-serif;display:flex}
.app{flex:1;display:flex;min-height:0}
.canvas{flex:1;display:flex;align-items:center;justify-content:center;min-width:0;position:relative}
.stage{width:${dim.w}px;height:${dim.h}px;position:relative;transform-origin:center;flex-shrink:0;border-radius:8px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.18)}
.slide{position:absolute;inset:0;opacity:0;transition:opacity .3s;pointer-events:none}
.slide.active{opacity:1;pointer-events:auto}
.sq{position:absolute;inset:0;padding:96px;display:flex;flex-direction:column;justify-content:center;gap:40px}
.cover{background:linear-gradient(135deg,${th.g1},${th.g2});color:#fff;align-items:flex-start}
.cover.cta{background:linear-gradient(135deg,${th.g2},${th.g1});align-items:center;text-align:center}
.deco{width:110px;height:12px;border-radius:6px;background:rgba(255,255,255,.85)}
.cover h1{font-size:86px;font-weight:800;line-height:1.1;letter-spacing:-2px}
.h1sm{font-size:66px}
.sub{font-size:34px;opacity:.85;font-weight:600;line-height:1.35}
.swipe{position:absolute;bottom:70px;left:96px;font-size:26px;font-weight:700;display:flex;gap:12px;align-items:center;opacity:.9}
.pill{padding:22px 56px;border-radius:60px;background:#fff;color:${th.g1};font-size:30px;font-weight:800;margin-top:12px}
.content{background:${th.cBg};color:${th.cText}}
.topbar{position:absolute;top:0;left:0;right:0;height:16px;background:linear-gradient(90deg,${th.g1},${th.g2})}
.badge{position:absolute;top:52px;right:60px;background:${th.badgeBg};color:${th.accent};font-size:24px;font-weight:800;padding:10px 26px;border-radius:40px}
.content h2{font-size:58px;font-weight:800;letter-spacing:-1px;line-height:1.15}
.content ul{list-style:none;display:flex;flex-direction:column;gap:34px}
.content li{display:flex;gap:22px;align-items:flex-start;font-size:35px;line-height:1.4;font-weight:600}
.content li i{color:${th.accent};flex-shrink:0;margin-top:4px}
.body{font-size:36px;line-height:1.5;font-weight:600}
.ig-nav{position:absolute;top:50%;transform:translateY(-50%);width:76px;height:76px;border-radius:50%;border:none;background:rgba(255,255,255,.92);color:#333;font-size:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.22);z-index:5}
.ig-nav:disabled{opacity:0;pointer-events:none}
.ig-nav.prev{left:28px}.ig-nav.next{right:28px}
.dots{position:absolute;bottom:26px;left:0;right:0;display:flex;gap:12px;justify-content:center;z-index:5}
.dot{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.5);box-shadow:0 1px 4px rgba(0,0,0,.25)}
.dot.on{background:#fff}
.side{width:360px;flex-shrink:0;background:#fff;border-left:1px solid #e5e5ee;display:flex;flex-direction:column;min-height:0}
.ig-head{display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid #eee;font-size:14px}
.ava{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,${th.g1},${th.g2})}
.capwrap{flex:1;overflow-y:auto;padding:16px}
.cap{font-size:13.5px;line-height:1.6;white-space:pre-wrap;color:#222}
.tags{font-size:13px;line-height:1.7;color:#5b54e0;margin-top:14px;word-break:break-word}
.btns{padding:12px 16px;border-top:1px solid #eee;display:flex;gap:8px}
.btns button{flex:1;padding:9px 4px;border-radius:8px;border:1px solid #ddd;background:#fff;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;color:#333}
.btns button:hover{border-color:#6c63ff;color:#6c63ff}
#toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#171730;color:#fff;padding:9px 20px;border-radius:20px;font-size:13px;opacity:0;transition:.25s;pointer-events:none;z-index:99}
@media (max-width:900px){.app{flex-direction:column;overflow-y:auto}html,body{overflow:auto}.side{width:100%;border-left:none;border-top:1px solid #e5e5ee}.canvas{min-height:60vh}}
</style>
</head>
<body>
<div class="app">
  <div class="canvas" id="cv">
    <div class="stage" id="stage">
${slideHtml}
      <button class="ig-nav prev" id="prev"><i class="bi bi-chevron-left"></i></button>
      <button class="ig-nav next" id="next"><i class="bi bi-chevron-right"></i></button>
      <div class="dots" id="dots">${dots}</div>
    </div>
  </div>
  <aside class="side">
    <div class="ig-head"><div class="ava"></div><b>${escHtml(brand)}</b></div>
    <div class="capwrap">
      <div class="cap" id="cap">${escHtml(cap)}</div>
      <div class="tags" id="tags">${escHtml(tags)}</div>
    </div>
    <div class="btns">
      <button onclick="cp('cap')"><i class="bi bi-clipboard"></i> Caption</button>
      <button onclick="cp('tags')"><i class="bi bi-hash"></i> Hashtags</button>
      <button onclick="cpAll()"><i class="bi bi-clipboard-check"></i> All</button>
    </div>
  </aside>
</div>
<div id="toast">Copied!</div>
<script>
var i=0,S=document.querySelectorAll('.slide'),D=document.querySelectorAll('.dot'),total=S.length;
function show(x){i=Math.max(0,Math.min(total-1,x));S.forEach(function(s,j){s.classList.toggle('active',j===i)});D.forEach(function(d,j){d.classList.toggle('on',j===i)});document.getElementById('prev').disabled=i===0;document.getElementById('next').disabled=i===total-1;}
document.getElementById('prev').onclick=function(){show(i-1)};
document.getElementById('next').onclick=function(){show(i+1)};
window.addEventListener('keydown',function(e){if(e.key==='ArrowRight')show(i+1);if(e.key==='ArrowLeft')show(i-1);});
function fit(){var c=document.getElementById('cv');var s=Math.min(c.clientWidth/${dim.w + 90},c.clientHeight/${dim.h + 90});document.getElementById('stage').style.transform='scale('+s+')';}
window.addEventListener('resize',fit);fit();show(0);
function doCopy(t){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(ta);var o=document.getElementById('toast');o.style.opacity=1;setTimeout(function(){o.style.opacity=0},1200);}
function cp(id){doCopy(document.getElementById(id).textContent)}
function cpAll(){doCopy(document.getElementById('cap').textContent+'\\n\\n'+document.getElementById('tags').textContent)}
</script>
</body>
</html>`;
}

async function generateDiagramXML(promptText, title, content, userId, configId = null) {
  const messages = [
    {
      role: 'system',
      content: `You are a diagram expert who creates draw.io (mxGraph) XML diagrams. Return ONLY valid mxGraphModel XML — no markdown, no explanation, no code fences.

Rules:
- Root structure: <mxGraphModel dx="800" dy="600" grid="0" page="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/>[cells here]</root></mxGraphModel>
- Every node: <mxCell id="node1" value="Label" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf" vertex="1" parent="1"><mxGeometry x="40" y="40" width="160" height="60" as="geometry"/></mxCell>
- Every edge: <mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1" edge="1" parent="1" source="node1" target="node2"><mxGeometry relative="1" as="geometry"/></mxCell>
- Edge labels go in the value attribute of the edge cell
- Give every cell a unique id; never reuse ids 0 or 1
- Lay out nodes so nothing overlaps (roughly 220px horizontal / 130px vertical spacing)
- Use varied fillColor/strokeColor pairs to group related concepts (e.g. #dae8fc/#6c8ebf blue, #d5e8d4/#82b366 green, #ffe6cc/#d79b00 orange, #f8cecc/#b85450 red)
- Keep it readable: at most ~15 nodes
- Node labels should match the language of the user's request/note`
    },
    {
      role: 'user',
      content: `Create a draw.io diagram: ${promptText}
${content ? `\nContext from the note "${title}":\n${content.slice(0, 3000)}` : ''}`
    }
  ];

  const result = await callLLM(messages, userId, { temperature: 0.4, maxTokens: 3000, configId });
  const match = result.match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/);
  if (!match) throw new Error('AI did not return valid diagram XML');
  return match[0];
}

async function improveWriting(text, instruction, userId) {
  const messages = [
    {
      role: 'system',
      content: `You are an expert writing assistant. Improve the given text according to the instruction. Return ONLY the improved text, no explanations.`
    },
    {
      role: 'user',
      content: `Instruction: ${instruction}\n\nText to improve:\n${text}`
    }
  ];

  return callLLM(messages, userId, { temperature: 0.6, maxTokens: 2000 });
}

async function expandNote(text, direction, userId) {
  const directionGuide = {
    elaborate: 'Add more detail, examples, and explanations',
    examples: 'Add concrete examples and use cases',
    counterarguments: 'Add counterarguments and alternative perspectives',
    technical: 'Add technical depth and implementation details',
    simplify: 'Make it simpler and more accessible'
  };

  const messages = [
    {
      role: 'system',
      content: `You are a writing assistant. ${directionGuide[direction] || direction}. Return ONLY the expanded/modified text.`
    },
    {
      role: 'user',
      content: text
    }
  ];

  return callLLM(messages, userId, { temperature: 0.7, maxTokens: 2000 });
}

async function generateFromTemplate(templatePrompt, context, userId) {
  const messages = [
    {
      role: 'system',
      content: `You are a document creation assistant. Generate well-structured content based on the template and context provided.`
    },
    {
      role: 'user',
      content: `Template: ${templatePrompt}\nContext: ${context}`
    }
  ];

  return callLLM(messages, userId, { temperature: 0.7, maxTokens: 3000 });
}

// ── Find related documents using embedding similarity ────────────────────────

async function findRelatedDocuments(documentId, userId, limit = 3) {
  try {
    // Get workspace of current document
    const doc = await db('notes_documents').where({ id: documentId }).select('workspace_id').first();

    if (!doc) return [];

    // Get all chunks for current document
    const myChunks = await db('notes_document_chunks').where({ document_id: documentId }).select('embedding');

    if (!myChunks || myChunks.length === 0) return [];

    // Calculate average embedding for current document
    const avgEmbedding = myChunks[0].embedding
      ? new Array(myChunks[0].embedding.length).fill(0).map((_, i) =>
          myChunks.reduce((sum, chunk) => sum + (chunk.embedding?.[i] || 0), 0) / myChunks.length
        )
      : null;

    if (!avgEmbedding) return [];

    // Get all documents in workspace except current one
    const otherDocs = await db('notes_documents')
      .where({ workspace_id: doc.workspace_id, created_by: userId, is_archived: false })
      .whereNot({ id: documentId })
      .select('id');

    if (!otherDocs || otherDocs.length === 0) return [];

    // Get chunks for other documents and calculate similarity
    const chunks = await db('notes_document_chunks')
      .whereIn('document_id', otherDocs.map(d => d.id))
      .select('document_id', 'embedding');

    if (!chunks) return [];

    // Score chunks and group by document
    const cosineSimilarity = (a, b) => {
      if (!a || !b || a.length !== b.length) return 0;
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      return denom === 0 ? 0 : dot / denom;
    };

    const docScores = {};
    for (const chunk of chunks) {
      if (chunk.embedding) {
        const score = cosineSimilarity(avgEmbedding, chunk.embedding);
        if (score > 0.6) { // threshold for relevance
          docScores[chunk.document_id] = Math.max(docScores[chunk.document_id] || 0, score);
        }
      }
    }

    // Get top N related documents
    const related = Object.entries(docScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docId]) => docId);

    return related;
  } catch (err) {
    console.error('[Notes AI] findRelatedDocuments error:', err);
    return [];
  }
}

// ── Full document processing (background job) ────────────────────────────────

async function processDocumentInsights(documentId, userId) {
  try {
    // Mark as processing
    await db('notes_ai_insights')
      .insert({ document_id: documentId, processing_status: 'processing' })
      .onConflict('document_id')
      .merge();

    const doc = await db('notes_documents').where({ id: documentId }).select('title', 'content_text', 'workspace_id').first();

    // Decrypt before passing to AI
    const title = decrypt(doc?.title || '');
    const contentText = decrypt(doc?.content_text || '');

    if (!doc || !contentText || contentText.length < 50) {
      await db('notes_ai_insights').insert({
        document_id: documentId,
        processing_status: 'done',
        last_processed_at: db.fn.now()
      }).onConflict('document_id').merge();
      return;
    }

    const [summary, entities, autoTags, actionItems, keyPoints, relatedDocs] = await Promise.all([
      summarizeDocument(contentText, userId, { length: 'medium' }).catch(e => { console.error('[Insights] summarize failed:', e.message); return null; }),
      extractEntities(contentText, userId).catch(e => { console.error('[Insights] entities failed:', e.message); return []; }),
      suggestTags(title, contentText, userId).catch(e => { console.error('[Insights] tags failed:', e.message); return []; }),
      extractActionItems(contentText, userId).catch(e => { console.error('[Insights] actions failed:', e.message); return []; }),
      extractKeyPoints(contentText, userId).catch(e => { console.error('[Insights] keypoints failed:', e.message); return []; }),
      findRelatedDocuments(documentId, userId, 3).catch(e => { console.error('[Insights] related docs failed:', e.message); return []; })
    ]);

    await db('notes_ai_insights').insert({
      document_id: documentId,
      summary,
      key_entities: JSON.stringify(entities),
      auto_tags: JSON.stringify(autoTags),
      action_items: JSON.stringify(actionItems),
      key_points: JSON.stringify(keyPoints),
      related_doc_ids: JSON.stringify(relatedDocs.length > 0 ? relatedDocs : []),
      processing_status: 'done',
      last_processed_at: db.fn.now()
    }).onConflict('document_id').merge();

    // Knowledge-graph RAG: normalize entities across notes (not just this
    // note's own insight blob) and extract simple relation facts between
    // them. Kept outside the Promise.all above and non-fatal to the rest of
    // insight processing - this is additive graph-building, not something
    // the Insights panel itself depends on to render.
    try {
      await upsertEntitiesForDocument(documentId, doc.workspace_id, userId, entities);
      const entityNames = (entities || []).map(e => e?.value).filter(Boolean);
      const relations = await extractRelations(contentText, entityNames, userId).catch(e => {
        console.error('[Insights] relations failed:', e.message);
        return [];
      });
      await recordRelations(doc.workspace_id, documentId, userId, relations);
    } catch (e) {
      console.error('[Insights] knowledge graph update failed:', e.message);
    }

    console.log(`[Notes AI] Processed insights for document ${documentId}`);
  } catch (err) {
    console.error('[Notes AI] processDocumentInsights error:', err);
    await db('notes_ai_insights').insert({
      document_id: documentId,
      processing_status: 'failed',
      last_processed_at: db.fn.now()
    }).onConflict('document_id').merge();
  }
}

module.exports = {
  summarizeDocument,
  extractEntities,
  extractActionItems,
  suggestTags,
  extractKeyPoints,
  generateFAQ,
  generateSlideOutline,
  chatWithNote,
  chatWithNoteAgentic,
  generatePresentation,
  generateInstagramPost,
  generateDiagramXML,
  improveWriting,
  expandNote,
  generateFromTemplate,
  processDocumentInsights
};
