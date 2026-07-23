<script lang="ts">
  import { onMount } from 'svelte';
  import NotesLayout from '../components/NotesLayout.svelte';
  import LLMConfigManager from '../components/LLMConfigManager.svelte';
  import ProviderConfigBlock from '../components/ProviderConfigBlock.svelte';
  import { settings, settingsLoaded, saveSettings, FONTS, AI_MODELS, AI_LANGUAGES, applyTheme } from '../stores/settings';
  import { currentWorkspace } from '../stores/notes';
  import { user } from '../stores/auth';
  import { aiApi } from '../lib/api';
  import * as authLib from '../lib/auth';

  // ── Admin-locked AI defaults ─────────────────────────────────────────────
  // When an admin locks a category (chat / embedding / transcription), that
  // section becomes read-only here - editing it would be pointless since the
  // backend ignores it anyway (see adminLLMService.js).
  let aiDefaults = {
    llm: { locked: false, provider: '', model: '' },
    embedding: { locked: false, provider: '', model: '' },
    transcription: { locked: false, provider: '', model: '' }
  };

  onMount(async () => {
    try {
      aiDefaults = await aiApi.getDefaults();
    } catch { /* non-fatal - sections just stay editable */ }
  });

  let reindexing = false;
  let reindexResult = '';
  let reindexProgress: { indexed: number; total: number } | null = null;
  let reindexPoller: any = null;

  function startProgressPolling(workspaceId: string) {
    reindexProgress = null;
    clearInterval(reindexPoller);
    reindexPoller = setInterval(async () => {
      try {
        const p = await aiApi.ragProgress(workspaceId);
        reindexProgress = p;
        if (p.done) {
          clearInterval(reindexPoller);
          reindexPoller = null;
          reindexResult = `✓ Done — ${p.indexed} / ${p.total} notes indexed.`;
          reindexing = false;
        }
      } catch {}
    }, 3000);
  }
  let testingEmbed = false;
  let embedTestResult: any = null;

  async function handleTestEmbedding() {
    testingEmbed = true;
    embedTestResult = null;
    try {
      embedTestResult = await aiApi.testEmbedding();
    } catch (err: any) {
      embedTestResult = { embeddingOk: false, embeddingError: err.message };
    }
    testingEmbed = false;
  }
  function handleLLMConfigChange(e: CustomEvent) {
    form.llm_configs = e.detail.configs;
    form.default_llm_config = e.detail.defaultId;
  }

  const EMBEDDING_PROVIDERS = [
    { value: 'openrouter', label: 'OpenRouter',              baseUrl: 'https://openrouter.ai/api/v1',                               keyPlaceholder: 'sk-or-v1-...' },
    { value: 'apilogy',    label: 'Apilogy (Telkom AI)',     baseUrl: 'https://telkom-ai-dag.api.apilogy.id/Text_Embedding/0.0.1', keyPlaceholder: 'Apilogy API key' },
    { value: 'openai',     label: 'OpenAI Direct',           baseUrl: 'https://api.openai.com/v1',                                  keyPlaceholder: 'sk-...' },
    { value: 'ollama',     label: 'Ollama (Local)',          baseUrl: 'http://localhost:11434/v1',                                  keyPlaceholder: '(not required for local Ollama)' },
    { value: 'custom',     label: 'Custom (OpenAI-compatible)', baseUrl: '',                                                         keyPlaceholder: 'API key' }
  ];
  const EMBEDDING_MODELS: Record<string, string[]> = {
    openrouter: ['openai/text-embedding-ada-002', 'openai/text-embedding-3-small', 'openai/text-embedding-3-large'],
    apilogy:    [],
    openai:     ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
    ollama:     ['nomic-embed-text', 'mxbai-embed-large'],
    custom:     []
  };

  const TRANSCRIPTION_PROVIDERS = [
    { value: 'openrouter', label: 'OpenRouter (Gemini)',  baseUrl: 'https://openrouter.ai/api/v1',      keyPlaceholder: 'sk-or-v1-...' },
    { value: 'groq',       label: 'Groq (Whisper)',       baseUrl: 'https://api.groq.com/openai/v1',    keyPlaceholder: 'gsk_...' },
    { value: 'openai',     label: 'OpenAI Direct',        baseUrl: 'https://api.openai.com/v1',          keyPlaceholder: 'sk-...' },
    { value: 'custom',     label: 'Custom',               baseUrl: '',                                   keyPlaceholder: 'API key' }
  ];
  const TRANSCRIPTION_MODELS: Record<string, string[]> = {
    openrouter: ['google/gemini-2.0-flash-001', 'google/gemini-flash-1.5', 'google/gemini-2.5-flash-preview'],
    groq:       ['whisper-large-v3-turbo', 'whisper-large-v3', 'distil-whisper-large-v3-en'],
    openai:     ['whisper-1'],
    custom:     []
  };

  async function handleReindex() {
    if (!$currentWorkspace?.id) return;
    reindexing = true;
    reindexResult = '';
    reindexProgress = null;
    try {
      const { queued, total } = await aiApi.reindexWorkspace($currentWorkspace.id);
      reindexResult = `Queued ${queued} of ${total} notes...`;
      startProgressPolling($currentWorkspace.id);
    } catch (err: any) {
      reindexResult = `Error: ${err.message}`;
      reindexing = false;
    }
  }

  // ── Account / Profile ──────────────────────────────────────────────
  let profileData = { full_name: '', username: '', avatar_url: '' };
  let avatarPreview = '';
  let savingProfile = false;
  let profileSaved = false;
  let profileError = '';
  let pwForm = { newPw: '', confirmPw: '' };
  let savingPw = false;
  let pwSaved = false;
  let pwError = '';
  let profileLoaded = false;

  async function loadProfile() {
    if (!$user || profileLoaded) return;
    profileData = {
      full_name: $user.user_metadata?.full_name || '',
      username: $user.user_metadata?.username || '',
      avatar_url: $user.user_metadata?.avatar_url || ''
    };
    profileLoaded = true;
  }

  async function compressImage(file: File): Promise<Blob> {
    return new Promise(resolve => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxDim = 400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const r = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        const tryQ = (q: number) => {
          canvas.toBlob(blob => {
            if (!blob) return;
            if (blob.size <= 500 * 1024 || q <= 0.3) resolve(blob);
            else tryQ(q - 0.15);
          }, 'image/jpeg', q);
        };
        tryQ(0.85);
      };
      img.src = objectUrl;
    });
  }

  async function handleAvatarChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    avatarPreview = URL.createObjectURL(file);
    profileError = '';
    try {
      const blob = await compressImage(file);
      const path = `avatars/${$user!.id}/avatar.jpg`;
      const publicUrl = await authLib.uploadFile(path, blob);
      await authLib.updateProfile({ avatar_url: publicUrl });
      profileData = { ...profileData, avatar_url: publicUrl };
      avatarPreview = publicUrl;
    } catch (err: any) {
      profileError = 'Failed to upload photo: ' + err.message;
      avatarPreview = '';
    }
  }

  async function saveProfile() {
    savingProfile = true;
    profileSaved = false;
    profileError = '';
    try {
      const username = profileData.username.trim().toLowerCase();
      if (username && !/^[a-z0-9_-]+$/.test(username)) {
        throw new Error('Username can only contain lowercase letters, numbers, underscores, or hyphens');
      }
      await authLib.updateProfile({ full_name: profileData.full_name, avatar_url: profileData.avatar_url, username });
      profileData = { ...profileData, username };
      profileSaved = true;
      setTimeout(() => { profileSaved = false; }, 2500);
    } catch (err: any) {
      profileError = err.message.includes('already taken') ? err.message : (err.message || 'Failed to save profile. Please try again.');
    }
    savingProfile = false;
  }

  async function changePassword() {
    pwSaved = false;
    pwError = '';
    if (pwForm.newPw.length < 6) { pwError = 'Password must be at least 6 characters'; return; }
    if (pwForm.newPw !== pwForm.confirmPw) { pwError = 'Passwords do not match'; return; }
    savingPw = true;
    try {
      await authLib.changePassword(pwForm.newPw);
      pwForm = { newPw: '', confirmPw: '' };
      pwSaved = true;
      setTimeout(() => { pwSaved = false; }, 3000);
    } catch (err: any) {
      pwError = err.message;
    }
    savingPw = false;
  }

  $: if ($user && activeSection === 'account') loadProfile();
  // ───────────────────────────────────────────────────────────────────

  let saving = false;
  let saved = false;
  let error = '';
  let activeSection = 'editor';

  let form = { ...$settings };
  $: profileUsername = profileData.username || $user?.user_metadata?.username || '';
  $: if ($user && (activeSection === 'blog' || activeSection === 'account')) loadProfile();
  // Re-initialize form once settings finish loading from the API
  // (guards against the component mounting before loadSettings() resolves)
  let formReady = false;
  $: if ($settingsLoaded && !formReady) {
    form = { ...$settings };
    formReady = true;
  }

  async function handleSave() {
    saving = true;
    error = '';
    try {
      await saveSettings(form);
      saved = true;
      setTimeout(() => saved = false, 2000);
    } catch (err: any) {
      error = err.message;
    }
    saving = false;
  }

  function handleThemeChange(theme: string) {
    form.theme = theme as any;
    applyTheme(theme);
  }

  const sections = [
    { id: 'editor', label: 'Editor', icon: 'bi-pencil' },
    { id: 'ai', label: 'AI & LLM', icon: 'bi-stars' },
    { id: 'appearance', label: 'Appearance', icon: 'bi-palette' },
    { id: 'privacy', label: 'Privacy & Sync', icon: 'bi-shield-lock' },
    { id: 'mcp', label: 'MCP', icon: 'bi-plug' },
    { id: 'blog', label: 'Blog', icon: 'bi-globe2' },
    { id: 'account', label: 'Account', icon: 'bi-person' }
  ];

  // ── MCP: connect Claude, ChatGPT, etc. ────────────────────────────────────
  const backendBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3002/api').replace(/\/api\/?$/, '');
  const mcpUrl = `${backendBaseUrl}/mcp`;
  const isLocalMcpUrl = /localhost|127\.0\.0\.1/.test(backendBaseUrl);
  let mcpUrlCopied = false;
  function copyMcpUrl() {
    navigator.clipboard.writeText(mcpUrl);
    mcpUrlCopied = true;
    setTimeout(() => (mcpUrlCopied = false), 1500);
  }

  const THEMES = [
    { id: 'light', label: 'Light', preview: '#ffffff', text: '#212529' },
    { id: 'dark', label: 'Dark', preview: '#1a1a2e', text: '#e8e6f0' },
    { id: 'sepia', label: 'Sepia', preview: '#fdf6e3', text: '#433422' }
  ];
</script>

<NotesLayout currentPage="settings">
  <div class="settings-page">
    <div class="settings-header">
      <h2><i class="bi bi-gear"></i> Settings</h2>
      <div class="settings-actions">
        {#if error}<span class="error-text">{error}</span>{/if}
        {#if saved}<span class="saved-text"><i class="bi bi-check-circle"></i> Saved!</span>{/if}
        <button class="notes-btn notes-btn-primary" on:click={handleSave} disabled={saving}>
          {#if saving}<span class="spinner-sm"></span>{/if}
          Save Changes
        </button>
      </div>
    </div>

    <div class="settings-layout">
      <!-- Sidebar nav -->
      <nav class="settings-nav">
        {#each sections as section}
          <button
            class="settings-nav-item {activeSection === section.id ? 'active' : ''}"
            on:click={() => activeSection = section.id}
          >
            <i class="bi {section.icon}"></i>
            {section.label}
          </button>
        {/each}
      </nav>

      <!-- Content -->
      <div class="settings-content">

        <!-- Editor settings -->
        {#if activeSection === 'editor'}
          <div class="settings-section fade-in">
            <h3>Editor</h3>

            <div class="setting-group">
              <label class="setting-label">Font Family</label>
              <select class="notes-input" bind:value={form.editor_font} style="max-width:300px">
                {#each FONTS as f}
                  <option value={f.value} style="font-family:{f.value}">{f.label}</option>
                {/each}
              </select>
              <p class="setting-hint">Preview: <span style="font-family:{form.editor_font}">The quick brown fox jumps over the lazy dog.</span></p>
            </div>

            <div class="setting-group">
              <label class="setting-label">Font Size</label>
              <div class="range-row">
                <input type="range" min="12" max="24" bind:value={form.editor_font_size} class="range-input" />
                <span class="range-value">{form.editor_font_size}px</span>
              </div>
            </div>

            <div class="setting-group">
              <label class="setting-label">Line Height</label>
              <div class="range-row">
                <input type="range" min="0.5" max="2.2" step="0.1" bind:value={form.editor_line_height} class="range-input" />
                <span class="range-value">{form.editor_line_height}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Auto Save</span>
                <span class="setting-hint">Automatically save as you type</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={form.auto_save} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            {#if form.auto_save}
              <div class="setting-group indent">
                <label class="setting-label">Save Interval</label>
                <div class="range-row">
                  <input type="range" min="5" max="60" bind:value={form.auto_save_interval_seconds} class="range-input" />
                  <span class="range-value">{form.auto_save_interval_seconds}s</span>
                </div>
              </div>
            {/if}

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Word Count</span>
                <span class="setting-hint">Show word count in editor toolbar</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={form.show_word_count} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Spell Check</span>
                <span class="setting-hint">Enable browser spell check</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={form.spell_check} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Breadcrumbs</span>
                <span class="setting-hint">Show navigation breadcrumbs</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={form.show_breadcrumbs} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

        <!-- AI settings -->
        {:else if activeSection === 'ai'}
          <div class="settings-section fade-in">
            <h3><i class="bi bi-stars"></i> AI & LLM Configuration</h3>
            <p class="section-desc">Configure the AI that powers notes analysis, summarization, and the assistant panel.</p>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Enable AI Features</span>
                <span class="setting-hint">AI-powered insights, summarization, and assistant</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={form.ai_enabled} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            {#if form.ai_enabled}
              <!-- ── LLM Models ── -->
              <div class="setting-group">
                <label class="setting-label">LLM Models</label>
                {#if aiDefaults.llm.locked}
                  <div class="locked-notice">
                    <i class="bi bi-lock-fill"></i>
                    <span>Your administrator has locked the chat model to <strong>{aiDefaults.llm.provider}{aiDefaults.llm.model ? ` - ${aiDefaults.llm.model}` : ''}</strong>. You can't change this.</span>
                  </div>
                {:else}
                  <p class="setting-hint" style="margin-bottom:10px">
                    Add multiple models. The default is used everywhere unless overridden in the chat panel.
                  </p>
                  <LLMConfigManager
                    configs={form.llm_configs || []}
                    defaultId={form.default_llm_config || ''}
                    on:change={handleLLMConfigChange}
                  />
                {/if}
              </div>

              <div class="setting-divider"></div>

              <!-- ── Embedding ── -->
              <div class="setting-group">
                <label class="setting-label">Embedding</label>
                {#if aiDefaults.embedding.locked}
                  <div class="locked-notice">
                    <i class="bi bi-lock-fill"></i>
                    <span>Your administrator has locked embedding to <strong>{aiDefaults.embedding.provider}{aiDefaults.embedding.model ? ` - ${aiDefaults.embedding.model}` : ''}</strong>. You can't change this.</span>
                  </div>
                {:else}
                  <p class="setting-hint" style="margin-bottom:10px">Used for RAG and semantic search. Separate from the LLM model above.</p>
                  <div style="max-width:420px">
                    <ProviderConfigBlock
                      providers={EMBEDDING_PROVIDERS}
                      suggestedModels={EMBEDDING_MODELS}
                      showModel={form.embedding_provider !== 'apilogy'}
                      bind:provider={form.embedding_provider}
                      bind:apiKey={form.embedding_api_key}
                      bind:model={form.embedding_model}
                      bind:baseUrl={form.embedding_base_url}
                    />
                  </div>
                {/if}
              </div>

              <div class="setting-group">
                <label class="setting-label">Default Response Language</label>
                <select class="notes-input" bind:value={form.ai_default_language} style="max-width:400px">
                  {#each AI_LANGUAGES as lang}
                    <option value={lang.value}>{lang.label}</option>
                  {/each}
                </select>
                <p class="setting-hint">
                  AI will respond in this language regardless of input language.
                  <strong>Auto</strong> follows what you write.
                </p>
              </div>

              <div class="setting-divider"></div>

              <!-- RAG re-index -->
              <div class="setting-group">
                <label class="setting-label">Knowledge Base (RAG)</label>
                <p class="setting-hint">Index all notes in your workspace so the AI can search across them. Run this if cross-note AI search isn't finding results.</p>

                <!-- Current embedding model info -->
                <div class="rag-model-info">
                  <span class="rag-model-label"><i class="bi bi-cpu"></i> Embedding model:</span>
                  <span class="rag-model-chip">
                    <strong>{form.embedding_provider || 'openrouter'}</strong>
                    {#if form.embedding_provider !== 'apilogy'}
                      · {form.embedding_model || 'openai/text-embedding-ada-002'}
                    {:else}
                      · Apilogy Text Embedding
                    {/if}
                  </span>
                </div>

                <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
                  <button class="notes-btn notes-btn-ghost" on:click={handleTestEmbedding} disabled={testingEmbed}>
                    {#if testingEmbed}<span class="spinner-sm"></span>{:else}<i class="bi bi-plug"></i>{/if}
                    Test Embedding
                  </button>
                  <button class="notes-btn notes-btn-ghost" on:click={handleReindex} disabled={reindexing}>
                    {#if reindexing}<span class="spinner-sm"></span>{:else}<i class="bi bi-arrow-repeat"></i>{/if}
                    Re-index Workspace
                  </button>
                  {#if reindexResult && !reindexProgress}
                    <span style="font-size:12px;color:var(--text-muted)">{reindexResult}</span>
                  {/if}
                </div>

                {#if reindexing && reindexProgress}
                  <div class="reindex-progress">
                    <div class="reindex-bar-wrap">
                      <div class="reindex-bar" style="width:{Math.round(reindexProgress.indexed / Math.max(reindexProgress.total,1) * 100)}%"></div>
                    </div>
                    <span class="reindex-label">
                      Indexing {reindexProgress.indexed} / {reindexProgress.total} notes…
                    </span>
                  </div>
                {:else if !reindexing && reindexResult}
                  <div style="font-size:12px;color:var(--text-muted);margin-top:6px">{reindexResult}</div>
                {/if}

                {#if embedTestResult}
                  <div class="embed-test-result {embedTestResult.embeddingOk ? 'ok' : 'err'}">
                    {#if embedTestResult.embeddingOk}
                      <i class="bi bi-check-circle-fill"></i>
                      <div>
                        <div>Embedding OK — dim: <strong>{embedTestResult.embeddingDim}</strong>, latency: <strong>{embedTestResult.embeddingMs}ms</strong></div>
                        <div style="font-size:11px;opacity:0.7;margin-top:2px">URL: {embedTestResult.debugUrl}</div>
                      </div>
                    {:else}
                      <i class="bi bi-x-circle-fill"></i>
                      <div>
                        <div>Embedding failed: <strong>{embedTestResult.embeddingError}</strong></div>
                        <div style="font-size:11px;opacity:0.7;margin-top:2px">URL tried: {embedTestResult.debugUrl}</div>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>

              <div class="setting-divider"></div>

              <!-- Web Search -->
              <div class="setting-group">
                <label class="setting-label"><i class="bi bi-globe2"></i> Web Search (Google Custom Search)</label>
                <input class="notes-input" type="password" bind:value={form.google_search_api_key}
                  placeholder="Google Search API Key" style="max-width:400px;margin-bottom:8px" />
                <input class="notes-input" bind:value={form.google_search_cx}
                  placeholder="Search Engine ID (CX)" style="max-width:400px" />
              </div>

              <div class="setting-divider"></div>

              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-label">Auto-Tag Notes</span>
                  <span class="setting-hint">Automatically suggest tags when saving</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" bind:checked={form.ai_auto_tag} />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-label">Auto-Summary</span>
                  <span class="setting-hint">Generate AI summary for new notes</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" bind:checked={form.ai_auto_summary} />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-label">Show AI Panel by Default</span>
                  <span class="setting-hint">Open AI assistant panel when editing notes</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" bind:checked={form.show_ai_panel} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            {/if}

            <!-- Voice & Transcription -->
            <h3 style="margin-top:28px"><i class="bi bi-mic"></i> Voice & Transcription</h3>

            <div class="setting-group">
              <label class="setting-label">Transcription Provider & Model</label>
              {#if aiDefaults.transcription.locked}
                <div class="locked-notice">
                  <i class="bi bi-lock-fill"></i>
                  <span>Your administrator has locked transcription to <strong>{aiDefaults.transcription.provider}{aiDefaults.transcription.model ? ` - ${aiDefaults.transcription.model}` : ''}</strong>. You can't change this.</span>
                </div>
              {:else}
                <p class="setting-hint" style="margin-bottom:10px">OpenRouter (Gemini) works with no extra key. Groq/OpenAI require an API key.</p>
                <div style="max-width:420px">
                  <ProviderConfigBlock
                    providers={TRANSCRIPTION_PROVIDERS}
                    suggestedModels={TRANSCRIPTION_MODELS}
                    bind:provider={form.transcription_provider}
                    bind:apiKey={form.transcription_api_key}
                    bind:model={form.transcription_model}
                    bind:baseUrl={form.transcription_base_url}
                  />
                </div>
              {/if}
            </div>

            <div class="setting-group">
              <label class="setting-label">Transcription Language</label>
              <select class="notes-input" bind:value={form.transcription_language} style="max-width:300px">
                <option value="auto">Auto-detect</option>
                <option value="id">Indonesian (Bahasa Indonesia)</option>
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="ar">Arabic</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="ms">Malay</option>
                <option value="pt">Portuguese</option>
                <option value="es">Spanish</option>
              </select>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Speaker Identification (Diarization)</span>
                <span class="setting-hint">After transcription, use an LLM to identify and label different speakers</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={form.diarization_enabled} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            {#if form.diarization_enabled}
              <div class="setting-group indent">
                <label class="setting-label">Diarization Model</label>
                <select class="notes-input" bind:value={form.diarization_model} style="max-width:400px">
                  {#each AI_MODELS as m}
                    <option value={m.value}>{m.label}</option>
                  {/each}
                </select>
                <p class="setting-hint">LLM used to assign speaker labels after transcription.</p>
              </div>
            {/if}
          </div>

        <!-- Appearance settings -->
        {:else if activeSection === 'appearance'}
          <div class="settings-section fade-in">
            <h3>Appearance</h3>

            <div class="setting-group">
              <label class="setting-label">Theme</label>
              <div class="theme-picker">
                {#each THEMES as theme}
                  <button
                    class="theme-option {form.theme === theme.id ? 'selected' : ''}"
                    on:click={() => handleThemeChange(theme.id)}
                    style="background:{theme.preview}"
                  >
                    <span style="color:{theme.text};font-size:12px;font-weight:500">{theme.label}</span>
                    {#if form.theme === theme.id}
                      <i class="bi bi-check-circle-fill" style="color:{theme.text};position:absolute;top:6px;right:6px;font-size:14px"></i>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Compact Mode</span>
                <span class="setting-hint">Reduce padding and spacing throughout the interface</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={form.compact_mode} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Collapsed Sidebar</span>
                <span class="setting-hint">Start with sidebar collapsed</span>
              </div>
              <label class="toggle">
                <input type="checkbox" bind:checked={form.sidebar_collapsed} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

        <!-- Privacy settings -->
        {:else if activeSection === 'privacy'}
          <div class="settings-section fade-in">
            <h3>Privacy & Sync</h3>
            <div class="info-box">
              <i class="bi bi-shield-check" style="color:var(--success-color)"></i>
              <div>
                <strong>Your notes are private by default</strong>
                <p>Notes are only accessible to you unless you explicitly share them. All data is stored on this server.</p>
              </div>
            </div>
            <div class="info-box">
              <i class="bi bi-save2" style="color:var(--info-color)"></i>
              <div>
                <strong>Auto-Save</strong>
                <p>Your changes are saved automatically as you type. There's no real-time push sync between open sessions - reopen a note in another tab or device to see the latest saved version.</p>
              </div>
            </div>

            <div class="setting-divider"></div>

            <div class="setting-group">
              <label class="setting-label"><i class="bi bi-shield-lock"></i> Field-Level Encryption (AES-256-GCM)</label>
              <div class="info-box" style="margin-bottom:12px">
                <i class="bi bi-info-circle" style="color:var(--accent-color)"></i>
                <div style="font-size:12px">
                  <strong>Status: Active</strong> <br> new and updated notes are automatically encrypted before being stored in the database.<br>
                  Protects against DB breaches. AI and vector search continue to work (decryption happens in-memory). Keyword full-text search is unavailable on encrypted content.
                </div>
              </div>
              <!-- <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <button class="notes-btn notes-btn-ghost" on:click={handleEncrypt} disabled={encrypting}>
                  {#if encrypting}<span class="spinner-sm"></span>{:else}<i class="bi bi-lock"></i>{/if}
                  Encrypt Existing Notes
                </button>
                {#if encryptResult}
                  <span style="font-size:12px;color:var(--text-muted)">{encryptResult}</span>
                {/if}
              </div>
              <p class="setting-hint">Encrypts all previously unencrypted notes in this workspace. Make sure to back up your encryption key — without it, data cannot be recovered.</p> -->
            </div>
          </div>

        <!-- MCP settings -->
        {:else if activeSection === 'mcp'}
          <div class="settings-section fade-in">
            <h3><i class="bi bi-plug"></i> MCP: Connect Claude, ChatGPT, and more</h3>
            <p class="section-desc">
              MCP (Model Context Protocol) lets AI assistants like Claude or ChatGPT read and write your notes
              directly through tools like <code>svaramind_search</code> and <code>svaramind_write</code>.
              You sign in with your own Svaramind account on the client side, so only your own notes are accessible.
            </p>

            <div class="setting-group">
              <label class="setting-label">MCP Server URL</label>
              <div class="url-copy-row">
                <code class="url-box">{mcpUrl}</code>
                <button class="notes-btn notes-btn-ghost" on:click={copyMcpUrl}>
                  <i class="bi {mcpUrlCopied ? 'bi-check-lg' : 'bi-clipboard'}"></i> {mcpUrlCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {#if isLocalMcpUrl}
              <div class="info-box" style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.3)">
                <i class="bi bi-exclamation-triangle" style="color:var(--warning-color)"></i>
                <div style="font-size:12.5px">
                  <strong>This URL is still localhost.</strong>
                  <p style="margin-top:4px">
                    Claude.ai and ChatGPT run in the cloud and can't reach <code>localhost</code> on your computer.
                    To use them from outside, the backend needs to be exposed via a public domain/URL (reverse proxy + HTTPS,
                    or a temporary tunnel like ngrok/Cloudflare Tunnel for testing). The admin also needs to set
                    <code>MCP_OAUTH_ISSUER</code> in <code>backend/.env</code> to match that public URL before restarting the backend.
                  </p>
                </div>
              </div>
            {/if}

            <div class="setting-divider"></div>

            <div class="setting-group">
              <label class="setting-label"><i class="bi bi-stars"></i> Steps: Claude.ai</label>
              <ol class="mcp-steps">
                <li>Open <strong>claude.ai</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Connectors</strong> (called "Integrations" in some versions).</li>
                <li>Click <strong>Add custom connector</strong> (or "Add more").</li>
                <li>Enter the URL: <code>{mcpUrl}</code></li>
                <li>Claude automatically detects that this server requires login (OAuth) and opens the Svaramind login page.</li>
                <li>Sign in with your Svaramind email/password, then click <strong>Sign in &amp; Allow</strong> to approve access.</li>
                <li>Done. Now ask Claude something like "find my notes about X in Svaramind" - it will automatically use the <code>svaramind_search</code>/<code>svaramind_write</code> tools.</li>
              </ol>
            </div>

            <div class="setting-group">
              <label class="setting-label"><i class="bi bi-chat-dots"></i> Steps: ChatGPT</label>
              <ol class="mcp-steps">
                <li>Open <strong>ChatGPT</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Connectors</strong> (custom MCP connector support depends on your ChatGPT plan/version).</li>
                <li>Click <strong>Add connector</strong> / <strong>Create</strong>, choose type <strong>MCP Server</strong>.</li>
                <li>Enter the URL: <code>{mcpUrl}</code></li>
                <li>Follow the login flow that appears (redirects to the Svaramind login page), then approve access.</li>
                <li>Enable the connector during chat so ChatGPT can call your notes tools.</li>
              </ol>
            </div>

            <div class="setting-group">
              <label class="setting-label"><i class="bi bi-boxes"></i> Other MCP clients (Cursor, Claude Desktop, etc.)</label>
              <p class="setting-hint">
                The same URL and OAuth flow work for any MCP client that supports remote servers + OAuth 2.1 + PKCE.
                Just enter the MCP Server URL above in that client's connector/MCP settings - its OAuth metadata is
                discovered automatically via <code>{backendBaseUrl}/.well-known/oauth-authorization-server</code>.
              </p>
            </div>
          </div>

        <!-- Blog settings -->
        {:else if activeSection === 'blog'}
          <div class="settings-section fade-in">
            <h3>Blog</h3>

            <!-- URL info row -->
            <div class="blog-url-row">
              <div>
                <span class="setting-label" style="margin:0 0 2px;display:block">Blog URL</span>
                <span class="blog-url-text">
                  yourdomain.com/<strong>{profileUsername || '[username]'}</strong>
                </span>
              </div>
              {#if profileUsername}
                <a href="/{profileUsername}" target="_blank" rel="noopener" class="notes-btn notes-btn-ghost" style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px;font-size:13px">
                  <i class="bi bi-box-arrow-up-right"></i> View blog
                </a>
              {/if}
            </div>
            {#if !profileUsername}
              <div class="setting-hint" style="color:var(--warning,#e07b00);margin-top:8px">
                <i class="bi bi-exclamation-triangle"></i> Username not set. Go to the <strong>Account</strong> tab to set a username so your blog can be accessed.
              </div>
            {/if}

            <div class="setting-group">
              <label class="setting-label" for="blog-bio">Bio</label>
              <textarea
                id="blog-bio"
                class="notes-input"
                bind:value={form.blog_bio}
                rows="3"
                placeholder="Short bio shown on your blog page…"
                style="max-width:480px;resize:vertical"
              ></textarea>
              <p class="setting-hint">Shown on your article list page.</p>
            </div>
          </div>

        <!-- Account settings -->
        {:else if activeSection === 'account'}
          <div class="settings-section fade-in">
            <h3>Profile</h3>
            <p class="section-desc">Manage your Svaramind account profile and password.</p>

            <!-- Avatar -->
            <div class="setting-group">
              <span class="setting-label">Profile Photo</span>
              <div class="avatar-edit-row">
                <div class="acct-avatar-wrap">
                  {#if avatarPreview || profileData.avatar_url}
                    <img src={avatarPreview || profileData.avatar_url} class="acct-avatar-img" alt="Profile" />
                  {:else}
                    <div class="acct-avatar-placeholder">{(profileData.full_name || $user?.email || '?')[0].toUpperCase()}</div>
                  {/if}
                </div>
                <div>
                  <input type="file" id="avatar-file" accept="image/*" style="display:none" on:change={handleAvatarChange} />
                  <label for="avatar-file" class="notes-btn notes-btn-ghost" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                    <i class="bi bi-camera"></i> Change Photo
                  </label>
                  <p class="setting-hint" style="margin-top:6px">Automatically compressed, max ~0.5 MB.</p>
                </div>
              </div>
            </div>

            <!-- Full name -->
            <div class="setting-group">
              <label class="setting-label" for="profile-displayname">Display Name</label>
              <input id="profile-displayname" class="notes-input" bind:value={profileData.full_name}
                placeholder="Your name" style="max-width:320px" autocomplete="off" />
            </div>

            <!-- Username (editable) -->
            <div class="setting-group">
              <label class="setting-label" for="profile-handle">Username</label>
              <input id="profile-handle" class="notes-input" bind:value={profileData.username}
                placeholder="username" style="max-width:320px" autocomplete="off" />
              <p class="setting-hint">
                Used as your blog URL: <strong>yourdomain.com/{profileData.username || '...'}</strong>.
                Changing your username will change all existing blog links.
              </p>
            </div>

            <!-- Email (readonly) -->
            <div class="setting-group">
              <label class="setting-label" for="acct-email">Email</label>
              <input id="acct-email" class="notes-input" value={$user?.email || ''} readonly
                style="max-width:320px;opacity:0.55;cursor:not-allowed" />
            </div>

            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
              <button class="notes-btn notes-btn-primary" on:click={saveProfile} disabled={savingProfile}>
                {#if savingProfile}<span class="spinner-sm"></span>{/if}
                Save Profile
              </button>
              {#if profileSaved}<span style="font-size:13px;color:var(--success-color)"><i class="bi bi-check-circle"></i> Saved!</span>{/if}
              {#if profileError}<span style="font-size:13px;color:var(--danger-color)">{profileError}</span>{/if}
            </div>

            <div class="setting-divider"></div>

            <!-- Change password -->
            <h3 style="font-size:1rem;border:none;margin:0 0 6px;padding:0">Change Password</h3>
            <p class="section-desc" style="margin-bottom:16px">
              Used to log in to Svaramind.
            </p>

            <div class="setting-group">
              <label class="setting-label" for="pw-new">New Password</label>
              <input id="pw-new" class="notes-input" type="password" bind:value={pwForm.newPw}
                placeholder="Min. 6 characters" style="max-width:320px" autocomplete="new-password" />
            </div>
            <div class="setting-group">
              <label class="setting-label" for="pw-confirm">Confirm Password</label>
              <input id="pw-confirm" class="notes-input" type="password" bind:value={pwForm.confirmPw}
                placeholder="Repeat new password" style="max-width:320px" autocomplete="new-password" />
            </div>

            <div style="display:flex;align-items:center;gap:12px">
              <button class="notes-btn notes-btn-ghost" on:click={changePassword} disabled={savingPw}>
                {#if savingPw}<span class="spinner-sm"></span>{/if}
                Update Password
              </button>
              {#if pwSaved}<span style="font-size:13px;color:var(--success-color)"><i class="bi bi-check-circle"></i> Password updated!</span>{/if}
              {#if pwError}<span style="font-size:13px;color:var(--danger-color)">{pwError}</span>{/if}
            </div>
          </div>
        {/if}

      </div>
    </div>
  </div>
</NotesLayout>

<style>
  .settings-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .settings-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .settings-header h2 { margin: 0; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 10px; }

  .settings-actions { display: flex; align-items: center; gap: 12px; }
  .error-text { font-size: 13px; color: var(--danger-color); }
  .saved-text { font-size: 13px; color: var(--success-color); display: flex; align-items: center; gap: 5px; }

  .settings-layout {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .settings-nav {
    width: 200px;
    min-width: 200px;
    border-right: 1px solid var(--border-color);
    padding: 12px 8px;
    overflow-y: auto;
    flex-shrink: 0;
    background: var(--bg-secondary);
  }

  .settings-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 12px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    text-align: left;
    transition: all 0.15s;
  }
  .settings-nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .settings-nav-item.active { background: var(--bg-active); color: var(--accent-color); font-weight: 500; }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .settings-section h3 {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; }

  .setting-group { margin-bottom: 20px; }

  .setting-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 6px;
  }

  .setting-hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

  .reindex-progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
  }
  .reindex-bar-wrap {
    flex: 1;
    max-width: 200px;
    height: 6px;
    background: var(--bg-hover);
    border-radius: 3px;
    overflow: hidden;
  }
  .reindex-bar {
    height: 100%;
    background: var(--accent-color);
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .reindex-label { font-size: 12px; color: var(--text-muted); white-space: nowrap; }

  .embed-test-result {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin-top: 10px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    line-height: 1.4;
  }
  .embed-test-result.ok  { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.3); color: var(--text-secondary); }
  .embed-test-result.err { background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.3);  color: var(--text-secondary); }
  .embed-test-result.ok  i { color: #16a34a; flex-shrink: 0; }
  .embed-test-result.err i { color: #dc2626; flex-shrink: 0; }

  .rag-model-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
  }
  .rag-model-label { color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
  .rag-model-chip {
    padding: 2px 10px;
    border: 1px solid var(--border-color);
    border-radius: 20px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-color);
  }

  .setting-info { display: flex; flex-direction: column; gap: 2px; }

  .toggle {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
    flex-shrink: 0;
  }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--border-color);
    border-radius: 22px;
    cursor: pointer;
    transition: 0.2s;
  }
  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 3px;
    top: 3px;
    background: #fff;
    border-radius: 50%;
    transition: 0.2s;
  }
  .toggle input:checked + .toggle-slider { background: var(--accent-color); }
  .toggle input:checked + .toggle-slider::before { transform: translateX(18px); }

  .range-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .range-input {
    flex: 1;
    max-width: 300px;
    accent-color: var(--accent-color);
  }
  .range-value {
    min-width: 40px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-color);
    text-align: right;
  }

  .indent { padding-left: 16px; }

  .api-key-row { display: flex; gap: 8px; align-items: center; }

  .setting-divider { border-top: 1px solid var(--border-color); margin: 20px 0; }

  .locked-notice {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px; border-radius: var(--radius-md);
    background: rgba(255,193,7,0.08); border: 1px solid rgba(255,193,7,0.3);
    font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;
  }
  .locked-notice i { color: var(--warning-color); font-size: 14px; flex-shrink: 0; margin-top: 1px; }

  .url-copy-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .url-box {
    flex: 1; min-width: 260px; padding: 9px 12px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-color); background: var(--bg-secondary);
    font-size: 13px; word-break: break-all;
  }
  .mcp-steps { padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
  .mcp-steps li::marker { color: var(--accent-color); font-weight: 600; }
  .settings-section code {
    background: var(--bg-secondary); border: 1px solid var(--border-color);
    border-radius: 4px; padding: 1px 6px; font-size: 12px; font-family: monospace;
    color: var(--text-primary);
  }

  .apilogy-card {
    border: 1px solid #e91e8c33;
    border-radius: var(--radius-md);
    padding: 14px;
    background: linear-gradient(135deg, rgba(233,30,140,0.04), rgba(255,0,102,0.03));
  }
  .apilogy-header { display: flex; align-items: center; gap: 10px; }
  .apilogy-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 20px;
    background: linear-gradient(135deg, #e91e8c, #ff0066);
    color: #fff; font-size: 12px; font-weight: 600;
  }
  .model-chip {
    display: inline-block; margin: 3px 3px 0 0;
    padding: 2px 8px; border-radius: 4px;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary); color: var(--accent-color);
    font-size: 11px; font-family: monospace; cursor: pointer;
    transition: all 0.15s;
  }
  .model-chip:hover { background: var(--bg-active); border-color: var(--accent-color); }

  .theme-picker {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .theme-option {
    width: 100px;
    height: 70px;
    border-radius: var(--radius-md);
    border: 2px solid var(--border-color);
    cursor: pointer;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 8px;
    position: relative;
    transition: all 0.15s;
    box-shadow: var(--shadow-sm);
  }
  .theme-option:hover { border-color: var(--accent-color); transform: scale(1.02); }
  .theme-option.selected { border-color: var(--accent-color); box-shadow: 0 0 0 3px rgba(19,37,120,0.2); }

  .info-box {
    display: flex;
    gap: 14px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    margin-bottom: 12px;
    font-size: 13px;
    line-height: 1.5;
  }
  .info-box i { font-size: 1.3rem; flex-shrink: 0; margin-top: 2px; }
  .info-box p { margin: 4px 0 0; color: var(--text-secondary); }

  .account-card { display: flex; align-items: center; gap: 14px; }
  .account-avatar {
    width: 48px; height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .account-name { font-size: 14px; font-weight: 600; }
  .account-email { font-size: 13px; color: var(--text-muted); }

  .avatar-edit-row { display: flex; align-items: center; gap: 16px; margin-top: 6px; }
  .acct-avatar-wrap { flex-shrink: 0; }
  .acct-avatar-img {
    width: 72px; height: 72px;
    border-radius: 50%; object-fit: cover;
    border: 2px solid var(--border-color);
    display: block;
  }
  .acct-avatar-placeholder {
    width: 72px; height: 72px;
    border-radius: 50%;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 700;
  }

  .blog-url-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    margin-bottom: 20px;
  }
  .blog-url-text {
    font-size: 13px;
    color: var(--text-muted);
  }
  .blog-url-text strong { color: var(--text-primary); }

  @media (max-width: 768px) {
    /* Stack nav on top, content below */
    .settings-layout {
      flex-direction: column;
      overflow: auto;
    }

    .settings-nav {
      width: 100%;
      min-width: unset;
      border-right: none;
      border-bottom: 1px solid var(--border-color);
      padding: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      overflow-y: unset;
    }

    .settings-nav-item {
      padding: 6px 10px;
      font-size: 12px;
      border-radius: 20px;
      border: 1px solid var(--border-color);
      width: auto;
    }
    .settings-nav-item.active {
      border-color: var(--accent-color);
    }
    .settings-nav-item span:first-child { display: none; } /* hide icon */

    .settings-content {
      overflow-y: auto;
      flex: 1;
    }

    .settings-header {
      padding: 10px 12px;
    }
    .settings-header h2 { font-size: 1.05rem; }
    .settings-actions { gap: 8px; }

    .setting-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .notes-input { max-width: 100% !important; }
    .api-key-row { flex-direction: column; }
  }
</style>
