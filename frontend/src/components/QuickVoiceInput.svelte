<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { settings } from '../stores/settings';

  const dispatch = createEventDispatcher();

  type State = 'idle' | 'listening' | 'processing' | 'error';

  let state: State = 'idle';
  let errorMsg = '';
  let interimText = '';
  let recognition: any = null;
  let isWebSpeechSupported = false;
  let selectedLang = 'id-ID';

  $: transcriptionLanguage = $settings.transcription_language || 'id-ID';
  $: selectedLang = transcriptionLanguage;

  // Available languages with local labels
  const LANGUAGES = [
    { code: 'id-ID', name: 'Bahasa Indonesia' },
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'zh-CN', name: '中文 (简体)' },
    { code: 'zh-TW', name: '中文 (繁體)' },
    { code: 'es-ES', name: 'Español' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'ko-KR', name: '한국어' },
    { code: 'vi-VN', name: 'Tiếng Việt' },
    { code: 'th-TH', name: 'ไทย' },
    { code: 'pt-BR', name: 'Português (Brasil)' }
  ];

  let showLangDropdown = false;

  onDestroy(() => {
    recognition?.stop();
  });

  function initWebSpeech() {
    if (typeof window === 'undefined') return false;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLang;

    recognition.onstart = () => {
    dispatch('interimStart');
    interimText = '';
  };

  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        dispatch('transcribed', {
          text: transcript,
          plain: transcript,
          diarized: false,
          duration: null,
          language: null,
          interim: false
        });
      } else {
        interim += transcript + ' ';
      }
    }
    interimText = interim.trim();
  };

    recognition.onerror = (event: any) => {
      errorMsg = event.error === 'not-allowed'
        ? 'Microphone access denied. Please allow microphone access in your browser settings.'
        : `Speech recognition error: ${event.error}`;
      state = 'error';
      recognition?.stop();
    };

    recognition.onend = () => {
      if (state === 'listening') {
        state = 'idle';
        interimText = '';
      }
    };

    isWebSpeechSupported = true;
    return true;
  }

  function startListening() {
    if (!isWebSpeechSupported && !initWebSpeech()) {
      errorMsg = 'Web Speech API not supported in your browser.';
      state = 'error';
      return;
    }
    errorMsg = '';
    state = 'listening';
    interimText = '';
    recognition?.start();
  }

  function stopListening() {
    recognition?.stop();
    state = 'idle';
    interimText = '';
  }

  function changeLang(lang: string) {
    selectedLang = lang;
    settings.update(s => ({ ...s, transcription_language: lang }));
    showLangDropdown = false;
    if (recognition) recognition.lang = lang;
  }

  // Update recognition language when settings change
  $: if (recognition) {
    recognition.lang = transcriptionLanguage;
    selectedLang = transcriptionLanguage;
  }
</script>

<svelte:window
  on:click={() => showLangDropdown = false}
  on:keydown={(e) => e.key === 'Escape' && (showLangDropdown = false)}
/>

<div class="qvi-container">
  {#if state === 'idle'}
    <div class="qvi-idle">
      <button
        class="qvi-mic-btn"
        on:click={startListening}
        title="Quick voice input (Web Speech API)"
      >
        <i class="bi bi-mic-fill"></i>
      </button>

      <!-- Language dropdown -->
      <div class="qvi-lang-wrap">
        <button
          class="qvi-lang-btn"
          on:click|stopPropagation={() => showLangDropdown = !showLangDropdown}
          title="Transcription language"
        >
          <i class="bi bi-globe"></i>
          <span class="qvi-lang-label">{selectedLang}</span>
        </button>

        {#if showLangDropdown}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="qvi-lang-dropdown" on:click|stopPropagation>
            {#each LANGUAGES as lang}
              <button
                class="qvi-lang-item {selectedLang === lang.code ? 'active' : ''}"
                on:click={() => changeLang(lang.code)}
              >
                {lang.name}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

  {:else if state === 'listening'}
    <div class="qvi-listening">
      <span class="qvi-dot"></span>
      {#if interimText}
        <span class="qvi-interim-text">{interimText}</span>
      {/if}
      <button
        class="qvi-stop-btn"
        on:click={stopListening}
        title="Stop listening"
      >
        <i class="bi bi-stop-fill"></i>
      </button>
    </div>

  {:else if state === 'error'}
    <div class="qvi-error">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span>{errorMsg}</span>
      <button class="qvi-retry-btn" on:click={() => { state = 'idle'; errorMsg = ''; }}>
        <i class="bi bi-arrow-counterclockwise"></i>
      </button>
    </div>
  {/if}
</div>

<style>
  .qvi-container {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  /* ── Idle state ── */
  .qvi-idle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .qvi-mic-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .qvi-mic-btn:hover {
    border-color: #3b82f6;
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.06);
  }

  /* ── Language selector ── */
  .qvi-lang-wrap {
    position: relative;
  }

  .qvi-lang-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .qvi-lang-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  .qvi-lang-label {
    font-family: monospace;
    font-weight: 500;
  }

  .qvi-lang-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 2px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 100;
    max-height: 250px;
    overflow-y: auto;
    min-width: 160px;
  }

  .qvi-lang-item {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }
  .qvi-lang-item:hover {
    background: var(--bg-hover);
  }
  .qvi-lang-item.active {
    background: var(--accent-color);
    color: white;
  }

  /* ── Listening state ── */
  .qvi-listening {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border: 1.5px solid #3b82f6;
    border-radius: 6px;
    background: rgba(59, 130, 246, 0.08);
    animation: qvi-fadein 0.2s ease;
  }

  .qvi-interim-text {
    font-size: 11px;
    color: #3b82f6;
    max-width: 120px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-style: italic;
  }

  .qvi-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3b82f6;
    flex-shrink: 0;
    animation: qvi-pulse 1.2s ease-in-out infinite;
  }
  @keyframes qvi-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(0.75); }
  }

  .qvi-stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 3px;
    background: #3b82f6;
    color: white;
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .qvi-stop-btn:hover {
    background: #2563eb;
  }

  /* ── Error state ── */
  .qvi-error {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-sm);
    background: rgba(239, 68, 68, 0.06);
    font-size: 11px;
    color: var(--text-secondary);
  }

  .qvi-error i {
    color: #ef4444;
    font-size: 12px;
    flex-shrink: 0;
  }

  .qvi-retry-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: none;
    color: #ef4444;
    cursor: pointer;
    font-size: 11px;
    flex-shrink: 0;
    transition: color 0.15s;
  }
  .qvi-retry-btn:hover {
    color: #dc2626;
  }

  @keyframes qvi-fadein {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: none; }
  }

  /* Mobile */
  @media (max-width: 768px) {
    .qvi-interim {
      max-width: 100px;
      font-size: 10px;
    }

    .qvi-lang-dropdown {
      min-width: 140px;
    }
  }
</style>
