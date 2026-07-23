<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import NotesLayout from '../../components/NotesLayout.svelte';
  import LLMConfigManager from '../../components/LLMConfigManager.svelte';
  import ProviderConfigBlock from '../../components/ProviderConfigBlock.svelte';
  import { user } from '../../stores/auth';
  import { adminApi } from '../../lib/api';

  let activeSection: string = 'storage';
  const sections = [
    { id: 'storage', label: 'Storage', icon: 'bi-hdd-stack' },
    { id: 'users', label: 'Users', icon: 'bi-people' },
    { id: 'llm', label: 'Default LLM', icon: 'bi-stars' }
  ];

  $: if ($user && $user.role !== 'admin') navigate('/');

  // ── Storage section ────────────────────────────────────────────────────────
  const STORAGE_PROVIDERS = [
    { id: 'local', label: 'Local Filesystem', icon: 'bi-hdd', desc: 'Stored directly on this server\'s disk. Simplest option for a single-node deployment.' },
    { id: 'minio', label: 'MinIO', icon: 'bi-box-seam', desc: 'Self-hosted S3-compatible object storage.', endpointPlaceholder: 'http://localhost:9000', region: 'auto', forcePathStyle: true },
    { id: 's3', label: 'AWS S3', icon: 'bi-amazon', desc: 'Amazon S3. Endpoint can be left blank if you provide a valid region.', endpointPlaceholder: '(optional, e.g. https://s3.us-east-1.amazonaws.com)', region: 'us-east-1', forcePathStyle: false },
    { id: 'r2', label: 'Cloudflare R2', icon: 'bi-cloud', desc: 'Cloudflare R2, S3-compatible.', endpointPlaceholder: 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com', region: 'auto', forcePathStyle: true },
    { id: 'custom', label: 'Custom S3-compatible', icon: 'bi-hdd-network', desc: 'Any other S3-compatible store (SeaweedFS, Garage, Backblaze B2, etc.).', endpointPlaceholder: 'https://...', region: 'auto', forcePathStyle: true }
  ];

  let storageForm = {
    storage_provider: 'local',
    storage_s3_endpoint: '',
    storage_s3_region: 'auto',
    storage_s3_bucket: 'notes-images',
    storage_s3_access_key: '',
    storage_s3_secret_key: '',
    storage_s3_force_path_style: true
  };
  let storageSecretAlreadySet = false;
  let storageLoaded = false;
  let storageSaving = false;
  let storageSaved = false;
  let storageError = '';

  async function loadStorageSettings() {
    try {
      const s = await adminApi.getStorageSettings();
      storageForm.storage_provider = s.storage_provider;
      storageForm.storage_s3_endpoint = s.storage_s3_endpoint;
      storageForm.storage_s3_region = s.storage_s3_region;
      storageForm.storage_s3_bucket = s.storage_s3_bucket;
      storageForm.storage_s3_access_key = s.storage_s3_access_key;
      storageForm.storage_s3_force_path_style = s.storage_s3_force_path_style;
      storageSecretAlreadySet = s.storage_s3_secret_key_set;
    } catch (err: any) {
      storageError = err.message;
    }
    storageLoaded = true;
  }

  // Switching provider prefills sensible S3 defaults (only when the endpoint
  // is still empty, so it never clobbers something the admin already typed).
  function selectStorageProvider(id: string) {
    storageForm.storage_provider = id;
    const preset = STORAGE_PROVIDERS.find((p) => p.id === id);
    if (preset && id !== 'local' && !storageForm.storage_s3_endpoint) {
      storageForm.storage_s3_region = preset.region ?? 'auto';
      storageForm.storage_s3_force_path_style = preset.forcePathStyle ?? true;
    }
  }

  async function handleSaveStorage() {
    storageSaving = true;
    storageError = '';
    try {
      await adminApi.updateStorageSettings(storageForm);
      storageSaved = true;
      setTimeout(() => (storageSaved = false), 2000);
    } catch (err: any) {
      storageError = err.message;
    }
    storageSaving = false;
  }

  // ── Users section ──────────────────────────────────────────────────────────
  let users: any[] = [];
  let usersLoaded = false;
  let usersError = '';

  let showUserModal = false;
  let editingUser: any = null; // null = creating a new user
  let userForm = { email: '', password: '', full_name: '', username: '', role: 'user', is_active: true };
  let userFormError = '';
  let savingUser = false;

  async function loadUsers() {
    try {
      const { users: data } = await adminApi.listUsers();
      users = data;
    } catch (err: any) {
      usersError = err.message;
    }
    usersLoaded = true;
  }

  function openAddUser() {
    editingUser = null;
    userForm = { email: '', password: '', full_name: '', username: '', role: 'user', is_active: true };
    userFormError = '';
    showUserModal = true;
  }

  function openEditUser(u: any) {
    editingUser = u;
    userForm = { email: u.email, password: '', full_name: u.full_name || '', username: u.username || '', role: u.role, is_active: u.is_active };
    userFormError = '';
    showUserModal = true;
  }

  async function saveUser() {
    savingUser = true;
    userFormError = '';
    try {
      if (editingUser) {
        const payload: any = { full_name: userForm.full_name, username: userForm.username, role: userForm.role, is_active: userForm.is_active };
        if (userForm.password) payload.new_password = userForm.password;
        await adminApi.updateUser(editingUser.id, payload);
      } else {
        await adminApi.createUser({
          email: userForm.email, password: userForm.password,
          full_name: userForm.full_name, username: userForm.username, role: userForm.role
        });
      }
      showUserModal = false;
      await loadUsers();
    } catch (err: any) {
      userFormError = err.message;
    }
    savingUser = false;
  }

  async function toggleActive(u: any) {
    try {
      await adminApi.updateUser(u.id, { is_active: !u.is_active });
      await loadUsers();
    } catch (err: any) {
      usersError = err.message;
    }
  }

  async function handleDeleteUser(u: any) {
    if (!confirm(`Delete user "${u.email}"? This permanently deletes their account and all their notes/workspaces.`)) return;
    try {
      await adminApi.deleteUser(u.id);
      await loadUsers();
    } catch (err: any) {
      usersError = err.message;
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ── Default LLM / Embedding / Transcription section ────────────────────────
  const EMBEDDING_PROVIDERS = [
    { value: 'openrouter', label: 'OpenRouter',              baseUrl: 'https://openrouter.ai/api/v1',                               keyPlaceholder: 'sk-or-v1-...' },
    { value: 'apilogy',    label: 'Apilogy (Telkom AI)',     baseUrl: 'https://telkom-ai-dag.api.apilogy.id/Text_Embedding/0.0.1', keyPlaceholder: 'Apilogy API key' },
    { value: 'openai',     label: 'OpenAI Direct',           baseUrl: 'https://api.openai.com/v1',                                  keyPlaceholder: 'sk-...' },
    { value: 'ollama',     label: 'Ollama (Local)',          baseUrl: 'http://localhost:11434/v1',                                  keyPlaceholder: '(not required for local Ollama)' },
    { value: 'custom',     label: 'Custom (OpenAI-compatible)', baseUrl: '',                                                         keyPlaceholder: 'API key' }
  ];
  const EMBEDDING_MODELS: Record<string, string[]> = {
    openrouter: ['openai/text-embedding-ada-002', 'openai/text-embedding-3-small', 'openai/text-embedding-3-large'],
    apilogy: [], openai: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
    ollama: ['nomic-embed-text', 'mxbai-embed-large'], custom: []
  };
  const TRANSCRIPTION_PROVIDERS = [
    { value: 'openrouter', label: 'OpenRouter (Gemini)',  baseUrl: 'https://openrouter.ai/api/v1',      keyPlaceholder: 'sk-or-v1-...' },
    { value: 'groq',       label: 'Groq (Whisper)',       baseUrl: 'https://api.groq.com/openai/v1',    keyPlaceholder: 'gsk_...' },
    { value: 'openai',     label: 'OpenAI Direct',        baseUrl: 'https://api.openai.com/v1',          keyPlaceholder: 'sk-...' },
    { value: 'custom',     label: 'Custom',               baseUrl: '',                                   keyPlaceholder: 'API key' }
  ];
  const TRANSCRIPTION_MODELS: Record<string, string[]> = {
    openrouter: ['google/gemini-2.0-flash-001', 'google/gemini-flash-1.5'],
    groq: ['whisper-large-v3-turbo', 'whisper-large-v3'], openai: ['whisper-1'], custom: []
  };

  let llmLoaded = false;
  let llmLockEnabled = false;
  let llmConfigs: any[] = [];
  let llmDefaultId = '';

  let embeddingLockEnabled = false;
  let embeddingProvider = 'openrouter';
  let embeddingModel = '';
  let embeddingApiKey = '';
  let embeddingBaseUrl = '';

  let transcriptionLockEnabled = false;
  let transcriptionProvider = 'openrouter';
  let transcriptionModel = '';
  let transcriptionApiKey = '';
  let transcriptionBaseUrl = '';

  let llmSaving = false;
  let llmSaved = false;
  let llmError = '';

  async function loadLLMSettings() {
    try {
      const s = await adminApi.getLLMSettings();
      llmLockEnabled = s.llm_lock_enabled;
      llmConfigs = s.default_llm_configs;
      llmDefaultId = s.default_llm_config_id || '';

      embeddingLockEnabled = s.embedding_lock_enabled;
      embeddingProvider = s.default_embedding_provider;
      embeddingModel = s.default_embedding_model;
      embeddingApiKey = s.default_embedding_api_key;
      embeddingBaseUrl = s.default_embedding_base_url;

      transcriptionLockEnabled = s.transcription_lock_enabled;
      transcriptionProvider = s.default_transcription_provider;
      transcriptionModel = s.default_transcription_model;
      transcriptionApiKey = s.default_transcription_api_key;
      transcriptionBaseUrl = s.default_transcription_base_url;
    } catch (err: any) {
      llmError = err.message;
    }
    llmLoaded = true;
  }

  function handleLLMConfigChange(e: CustomEvent) {
    llmConfigs = e.detail.configs;
    llmDefaultId = e.detail.defaultId;
  }

  async function handleSaveLLM() {
    llmSaving = true;
    llmError = '';
    try {
      await adminApi.updateLLMSettings({
        llm_lock_enabled: llmLockEnabled,
        default_llm_configs: llmConfigs,
        default_llm_config_id: llmDefaultId || null,

        embedding_lock_enabled: embeddingLockEnabled,
        default_embedding_provider: embeddingProvider,
        default_embedding_model: embeddingModel,
        default_embedding_api_key: embeddingApiKey,
        default_embedding_base_url: embeddingBaseUrl,

        transcription_lock_enabled: transcriptionLockEnabled,
        default_transcription_provider: transcriptionProvider,
        default_transcription_model: transcriptionModel,
        default_transcription_api_key: transcriptionApiKey,
        default_transcription_base_url: transcriptionBaseUrl
      });
      llmSaved = true;
      setTimeout(() => (llmSaved = false), 2000);
    } catch (err: any) {
      llmError = err.message;
    }
    llmSaving = false;
  }

  // ── Test embedding / reindex (org-wide) ─────────────────────────────────────
  let testingEmbed = false;
  let embedTestResult: any = null;

  async function handleTestEmbedding() {
    testingEmbed = true;
    embedTestResult = null;
    try {
      embedTestResult = await adminApi.testDefaultEmbedding();
    } catch (err: any) {
      embedTestResult = { embeddingOk: false, embeddingError: err.message };
    }
    testingEmbed = false;
  }

  let reindexing = false;
  let reindexResult = '';
  let reindexProgress: { indexed: number; total: number } | null = null;
  let reindexPoller: any = null;

  function startReindexPolling() {
    reindexProgress = null;
    clearInterval(reindexPoller);
    reindexPoller = setInterval(async () => {
      try {
        const p = await adminApi.reindexAllProgress();
        reindexProgress = p;
        if (p.done) {
          clearInterval(reindexPoller);
          reindexPoller = null;
          reindexResult = `Done - ${p.indexed} / ${p.total} documents indexed.`;
          reindexing = false;
        }
      } catch {}
    }, 3000);
  }

  async function handleReindexAll() {
    if (!confirm('Reindex all documents for all users using the current default embedding model? This can take a while and will regenerate every embedding.')) return;
    reindexing = true;
    reindexResult = '';
    reindexProgress = null;
    try {
      const { queued, total } = await adminApi.reindexAll();
      reindexResult = `Queued ${queued} of ${total} documents...`;
      startReindexPolling();
    } catch (err: any) {
      reindexResult = `Error: ${err.message}`;
      reindexing = false;
    }
  }

  onMount(() => {
    loadStorageSettings();
    loadUsers();
    loadLLMSettings();
  });
</script>

<NotesLayout currentPage="admin">
  <div class="admin-page">
    <div class="admin-header">
      <h2><i class="bi bi-shield-lock"></i> Admin Settings</h2>
      <div class="admin-actions">
        {#if activeSection === 'storage'}
          {#if storageError}<span class="error-text">{storageError}</span>{/if}
          {#if storageSaved}<span class="saved-text"><i class="bi bi-check-circle"></i> Saved!</span>{/if}
          <button class="notes-btn notes-btn-primary" on:click={handleSaveStorage} disabled={storageSaving || !storageLoaded}>
            {#if storageSaving}<span class="spinner-sm"></span>{/if}
            Save Changes
          </button>
        {:else if activeSection === 'llm'}
          {#if llmError}<span class="error-text">{llmError}</span>{/if}
          {#if llmSaved}<span class="saved-text"><i class="bi bi-check-circle"></i> Saved!</span>{/if}
          <button class="notes-btn notes-btn-primary" on:click={handleSaveLLM} disabled={llmSaving || !llmLoaded}>
            {#if llmSaving}<span class="spinner-sm"></span>{/if}
            Save Changes
          </button>
        {:else if activeSection === 'users'}
          <button class="notes-btn notes-btn-primary" on:click={openAddUser}>
            <i class="bi bi-person-plus"></i> Add User
          </button>
        {/if}
      </div>
    </div>

    <div class="admin-layout">
      <nav class="admin-nav">
        {#each sections as s}
          <button class="admin-nav-item {activeSection === s.id ? 'active' : ''}" on:click={() => (activeSection = s.id)}>
            <i class="bi {s.icon}"></i>
            {s.label}
          </button>
        {/each}
      </nav>

      <div class="admin-section-content">
        {#if activeSection === 'storage'}
          {#if storageLoaded}
            <div class="settings-section fade-in">
              <h3><i class="bi bi-hdd-stack"></i> Storage Backend</h3>
              <p class="section-desc">Choose where files (note images, avatars) are stored. Can be changed anytime without restarting the server.</p>

              <div class="setting-group">
                <label class="setting-label">Storage Provider</label>
                <div class="provider-picker">
                  {#each STORAGE_PROVIDERS as p}
                    <button class="provider-option {storageForm.storage_provider === p.id ? 'selected' : ''}" on:click={() => selectStorageProvider(p.id)}>
                      <i class="bi {p.icon}"></i>
                      <div>
                        <strong>{p.label}</strong>
                        <p>{p.desc}</p>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>

              {#if storageForm.storage_provider !== 'local'}
                {@const preset = STORAGE_PROVIDERS.find((p) => p.id === storageForm.storage_provider)}
                <div class="setting-group">
                  <label class="setting-label" for="s3-endpoint">Endpoint URL</label>
                  <input id="s3-endpoint" class="notes-input" bind:value={storageForm.storage_s3_endpoint} placeholder={preset?.endpointPlaceholder || 'https://...'} style="max-width:420px" />
                  {#if storageForm.storage_provider === 's3'}
                    <p class="setting-hint">Leave blank to let AWS resolve the endpoint from the region below.</p>
                  {/if}
                </div>
                <div class="setting-group">
                  <label class="setting-label" for="s3-region">Region</label>
                  <input id="s3-region" class="notes-input" bind:value={storageForm.storage_s3_region} placeholder="auto" style="max-width:420px" />
                  <p class="setting-hint">Use "auto" for MinIO/R2. Real AWS S3 needs an actual region, e.g. us-east-1.</p>
                </div>
                <div class="setting-group">
                  <label class="setting-label" for="s3-bucket">Bucket</label>
                  <input id="s3-bucket" class="notes-input" bind:value={storageForm.storage_s3_bucket} placeholder="notes-images" style="max-width:420px" />
                </div>
                <div class="setting-group">
                  <label class="setting-label" for="s3-access">Access Key</label>
                  <input id="s3-access" class="notes-input" bind:value={storageForm.storage_s3_access_key} style="max-width:420px" />
                </div>
                <div class="setting-group">
                  <label class="setting-label" for="s3-secret">Secret Key {storageSecretAlreadySet ? '(already saved - leave blank to keep it unchanged)' : ''}</label>
                  <input id="s3-secret" class="notes-input" type="password" bind:value={storageForm.storage_s3_secret_key} placeholder={storageSecretAlreadySet ? '••••••••' : ''} style="max-width:420px" />
                </div>
                <div class="setting-row" style="border:none;padding:8px 0">
                  <div class="setting-info">
                    <span class="setting-label" style="margin:0">Force path-style addressing</span>
                    <span class="setting-hint">Required by MinIO and most self-hosted S3-compatible stores. Usually off for real AWS S3 buckets created after 2020.</span>
                  </div>
                  <label class="toggle">
                    <input type="checkbox" bind:checked={storageForm.storage_s3_force_path_style} />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              {/if}
            </div>
          {/if}

        {:else if activeSection === 'users'}
          <div class="settings-section fade-in">
            <h3><i class="bi bi-people"></i> Users</h3>
            <p class="section-desc">Manage every account on this instance: create, edit role/status, or delete.</p>

            {#if usersError}<p class="error-text" style="margin-bottom:12px">{usersError}</p>{/if}

            {#if usersLoaded}
              <div class="users-table-wrap">
                <table class="users-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Username</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last Login</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each users as u}
                      <tr>
                        <td>{u.email}</td>
                        <td>{u.username || '-'}</td>
                        <td>{u.full_name || '-'}</td>
                        <td><span class="role-badge {u.role}">{u.role}</span></td>
                        <td>
                          <button class="status-badge {u.is_active ? 'active' : 'disabled'}" on:click={() => toggleActive(u)} title="Click to toggle">
                            {u.is_active ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td class="muted">{formatDate(u.last_sign_in_at)}</td>
                        <td class="row-actions">
                          <button class="icon-btn" on:click={() => openEditUser(u)} title="Edit">
                            <i class="bi bi-pencil"></i>
                          </button>
                          <button class="icon-btn danger" on:click={() => handleDeleteUser(u)} title="Delete">
                            <i class="bi bi-trash3"></i>
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>

        {:else if activeSection === 'llm'}
          <div class="settings-section fade-in">
            <h3><i class="bi bi-stars"></i> Default AI Models</h3>
            <p class="section-desc">
              Configure organization-wide defaults for Chat, Embedding, and Transcription (STT), same options users see
              in their own Settings &gt; AI &amp; LLM. Each has its own lock switch: when locked, every user is forced
              onto that default and their own BYOK config for that category (if any) is ignored and hidden in Settings.
            </p>

            {#if llmLoaded}
              <!-- Chat -->
              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-label" style="margin:0"><i class="bi bi-chat-left-text"></i> Lock Chat model</span>
                  <span class="setting-hint">Forces every user onto the model below for AI chat/assistant features.</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" bind:checked={llmLockEnabled} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="setting-group" style="margin-top:14px">
                <LLMConfigManager configs={llmConfigs} defaultId={llmDefaultId} on:change={handleLLMConfigChange} />
              </div>

              <div class="setting-divider"></div>

              <!-- Embedding -->
              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-label" style="margin:0"><i class="bi bi-diagram-3"></i> Lock Embedding model</span>
                  <span class="setting-hint">Forces every user onto the embedding config below for search/RAG.</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" bind:checked={embeddingLockEnabled} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="setting-group" style="margin-top:14px;max-width:420px">
                <ProviderConfigBlock
                  providers={EMBEDDING_PROVIDERS}
                  suggestedModels={EMBEDDING_MODELS}
                  showModel={embeddingProvider !== 'apilogy'}
                  bind:provider={embeddingProvider}
                  bind:apiKey={embeddingApiKey}
                  bind:model={embeddingModel}
                  bind:baseUrl={embeddingBaseUrl}
                />
              </div>

              <div class="setting-group">
                <p class="setting-hint" style="margin-bottom:8px">
                  Save your changes above first, then test the saved default and, if needed, reindex every user's
                  documents so their embeddings match the current model.
                </p>
                <div class="test-reindex-row">
                  <button class="notes-btn notes-btn-ghost" on:click={handleTestEmbedding} disabled={testingEmbed}>
                    {#if testingEmbed}<span class="spinner-sm"></span>{/if}
                    Test Embedding
                  </button>
                  <button class="notes-btn notes-btn-ghost" on:click={handleReindexAll} disabled={reindexing}>
                    {#if reindexing}<span class="spinner-sm"></span>{/if}
                    Reindex All (org-wide)
                  </button>
                </div>

                {#if embedTestResult}
                  <div class="test-result {embedTestResult.embeddingOk ? 'ok' : 'error'}">
                    {#if embedTestResult.embeddingOk}
                      <i class="bi bi-check-circle"></i>
                      Working - {embedTestResult.provider}{embedTestResult.model ? ` / ${embedTestResult.model}` : ''},
                      dimension {embedTestResult.embeddingDim}, {embedTestResult.embeddingMs}ms
                    {:else}
                      <i class="bi bi-x-circle"></i>
                      Failed{embedTestResult.provider ? ` (${embedTestResult.provider})` : ''}: {embedTestResult.embeddingError}
                    {/if}
                  </div>
                {/if}

                {#if reindexResult}
                  <div class="test-result">
                    <i class="bi bi-info-circle"></i> {reindexResult}
                    {#if reindexProgress}
                      <span class="muted"> ({reindexProgress.indexed} / {reindexProgress.total})</span>
                    {/if}
                  </div>
                {/if}
              </div>

              <div class="setting-divider"></div>

              <!-- Transcription -->
              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-label" style="margin:0"><i class="bi bi-mic"></i> Lock Transcription (STT) model</span>
                  <span class="setting-hint">Forces every user onto the transcription config below for voice notes.</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" bind:checked={transcriptionLockEnabled} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="setting-group" style="margin-top:14px;max-width:420px">
                <ProviderConfigBlock
                  providers={TRANSCRIPTION_PROVIDERS}
                  suggestedModels={TRANSCRIPTION_MODELS}
                  bind:provider={transcriptionProvider}
                  bind:apiKey={transcriptionApiKey}
                  bind:model={transcriptionModel}
                  bind:baseUrl={transcriptionBaseUrl}
                />
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</NotesLayout>

<!-- Add/Edit user modal -->
{#if showUserModal}
  <div class="modal-bg" on:click|self={() => (showUserModal = false)} role="dialog">
    <div class="modal-box">
      <div class="modal-hdr"><h5>{editingUser ? 'Edit User' : 'Add User'}</h5></div>

      {#if userFormError}<p class="error-text" style="margin-bottom:10px">{userFormError}</p>{/if}

      <div class="form-row">
        <label class="setting-label" for="uf-email">Email</label>
        <input id="uf-email" class="notes-input mb-3" type="email" bind:value={userForm.email} disabled={!!editingUser} placeholder="user@example.com" />
      </div>

      <div class="form-row">
        <label class="setting-label" for="uf-password">{editingUser ? 'New Password (leave blank to keep unchanged)' : 'Password'}</label>
        <input id="uf-password" class="notes-input mb-3" type="password" bind:value={userForm.password} placeholder={editingUser ? '••••••••' : 'Min. 6 characters'} />
      </div>

      <div class="form-row">
        <label class="setting-label" for="uf-name">Full Name</label>
        <input id="uf-name" class="notes-input mb-3" bind:value={userForm.full_name} placeholder="Optional" />
      </div>

      <div class="form-row">
        <label class="setting-label" for="uf-username">Username</label>
        <input id="uf-username" class="notes-input mb-3" bind:value={userForm.username} placeholder="Optional" />
      </div>

      <div class="form-row">
        <label class="setting-label" for="uf-role">Role</label>
        <select id="uf-role" class="notes-input mb-3" bind:value={userForm.role}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {#if editingUser}
        <div class="setting-row" style="padding:0 0 14px">
          <span class="setting-label" style="margin:0">Active</span>
          <label class="toggle">
            <input type="checkbox" bind:checked={userForm.is_active} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      {/if}

      <div class="modal-actions">
        <button class="notes-btn notes-btn-primary" on:click={saveUser} disabled={savingUser || !userForm.email || (!editingUser && !userForm.password)}>
          {#if savingUser}<span class="spinner-sm"></span>{/if}
          {editingUser ? 'Save Changes' : 'Create User'}
        </button>
        <button class="notes-btn notes-btn-ghost" on:click={() => (showUserModal = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .admin-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
  .admin-header {
    padding: 16px 24px; border-bottom: 1px solid var(--border-color);
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
  }
  .admin-header h2 { margin: 0; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 10px; }
  .admin-actions { display: flex; align-items: center; gap: 12px; }
  .error-text { font-size: 13px; color: var(--danger-color); }
  .saved-text { font-size: 13px; color: var(--success-color); display: flex; align-items: center; gap: 5px; }

  .admin-layout { flex: 1; display: flex; overflow: hidden; }
  .admin-nav {
    width: 180px; min-width: 180px;
    border-right: 1px solid var(--border-color);
    padding: 12px 8px; overflow-y: auto; flex-shrink: 0;
    background: var(--bg-secondary);
  }
  .admin-nav-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 9px 12px; border: none; border-radius: var(--radius-sm);
    background: none; cursor: pointer; font-size: 13px; color: var(--text-secondary);
    text-align: left; transition: all 0.15s;
  }
  .admin-nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .admin-nav-item.active { background: var(--bg-active); color: var(--accent-color); font-weight: 500; }

  .admin-section-content { flex: 1; overflow-y: auto; padding: 24px; max-width: 900px; }
  .settings-section h3 {
    font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;
  }
  .section-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.6; }
  .setting-group { margin-bottom: 20px; }
  .setting-label { display: block; font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
  .setting-hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  .setting-divider { border-top: 1px solid var(--border-color); margin: 20px 0; }

  .setting-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 0; border-bottom: 1px solid var(--border-color);
  }
  .setting-info { display: flex; flex-direction: column; gap: 2px; max-width: 480px; }

  .toggle { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider {
    position: absolute; inset: 0; background: var(--border-color); border-radius: 22px;
    cursor: pointer; transition: 0.2s;
  }
  .toggle-slider::before {
    content: ''; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px;
    background: #fff; border-radius: 50%; transition: 0.2s;
  }
  .toggle input:checked + .toggle-slider { background: var(--accent-color); }
  .toggle input:checked + .toggle-slider::before { transform: translateX(18px); }

  .test-reindex-row { display: flex; gap: 10px; }
  .test-result {
    display: flex; align-items: center; gap: 6px; margin-top: 10px;
    padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12px;
    background: var(--bg-secondary); color: var(--text-secondary);
  }
  .test-result.ok { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.3); }
  .test-result.error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); }
  .test-result.ok i { color: #16a34a; }
  .test-result.error i { color: #dc2626; }
  .test-result .muted { color: var(--text-muted); }

  .provider-picker { display: flex; gap: 12px; flex-wrap: wrap; }
  .provider-option {
    flex: 1; min-width: 220px; text-align: left; display: flex; gap: 12px; align-items: flex-start;
    padding: 14px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md);
    background: var(--bg-primary); cursor: pointer; transition: all 0.15s;
  }
  .provider-option i { font-size: 22px; color: var(--accent-color); flex-shrink: 0; }
  .provider-option p { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; }
  .provider-option.selected { border-color: var(--accent-color); box-shadow: 0 0 0 3px rgba(19,37,120,0.12); }

  /* Users table */
  .users-table-wrap { overflow-x: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md); }
  .users-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .users-table th {
    text-align: left; padding: 10px 14px; background: var(--bg-secondary);
    color: var(--text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.3px; border-bottom: 1px solid var(--border-color);
  }
  .users-table td { padding: 10px 14px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); }
  .users-table tr:last-child td { border-bottom: none; }
  .users-table .muted { color: var(--text-muted); }

  .role-badge {
    display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600;
    background: var(--bg-secondary); color: var(--text-secondary); text-transform: capitalize;
  }
  .role-badge.admin { background: rgba(139,92,246,0.12); color: #8b5cf6; }

  .status-badge {
    display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600;
    border: none; cursor: pointer; font-family: inherit; transition: opacity 0.15s;
  }
  .status-badge:hover { opacity: 0.75; }
  .status-badge.active { background: rgba(34,197,94,0.12); color: #16a34a; }
  .status-badge.disabled { background: rgba(239,68,68,0.12); color: #dc2626; }

  .row-actions { display: flex; gap: 4px; white-space: nowrap; }
  .icon-btn {
    border: none; background: none; padding: 5px 7px; border-radius: 4px;
    color: var(--text-muted); cursor: pointer; transition: all 0.15s;
  }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .icon-btn.danger:hover { color: var(--danger-color); background: rgba(239,68,68,0.08); }

  /* Modal (add/edit user) */
  .modal-bg {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    z-index: 1000; display: flex; align-items: center; justify-content: center;
    padding: 16px; backdrop-filter: blur(2px);
  }
  .modal-box {
    background: var(--bg-primary); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg); width: 100%; max-width: 400px;
    padding: 24px; max-height: 90vh; overflow-y: auto;
  }
  .modal-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .modal-hdr h5 { margin: 0; font-size: 15px; font-weight: 700; }
  .modal-actions { display: flex; gap: 8px; margin-top: 4px; }
  .form-row { display: flex; flex-direction: column; }
  .mb-3 { margin-bottom: 14px; }
</style>
