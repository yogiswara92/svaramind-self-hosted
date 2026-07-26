<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { aiApi } from '../lib/api';

  const dispatch = createEventDispatcher();

  type State = 'idle' | 'recording' | 'paused' | 'processing' | 'error';
  type SourceType = 'mic' | 'system' | 'both';

  let state: State = 'idle';
  let sourceType: SourceType = 'mic';
  let errorMsg = '';
  let duration = 0;
  let timer: any;
  let chunkTimer: any;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stream: MediaStream | null = null;
  let displayStream: MediaStream | null = null;
  let micStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let keepAliveOsc: OscillatorNode | null = null;
  let shouldChunk = false;
  let systemAudioWarning = '';

  // A chunk (or the final stop) that failed to transcribe even after the
  // automatic retry below. Kept around so "Retry" actually resends the same
  // audio instead of just clearing the error and losing it.
  let lastFailedBlob: Blob | null = null;
  let lastFailedWasFinal = false;
  let retryingChunk = false;

  function isMac() {
    return typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);
  }

  onDestroy(() => {
    clearInterval(timer);
    clearInterval(chunkTimer);
    stopAllTracks();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  // Resume AudioContext when tab becomes visible again (browsers suspend it on tab hide)
  function handleVisibilityChange() {
    if (!document.hidden && audioCtx?.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function stopAllTracks() {
    stream?.getTracks().forEach(t => t.stop());
    displayStream?.getTracks().forEach(t => t.stop());
    micStream?.getTracks().forEach(t => t.stop());
    try { keepAliveOsc?.stop(); } catch {}
    audioCtx?.close().catch(() => {});
    stream = null; displayStream = null; micStream = null; audioCtx = null; keepAliveOsc = null;
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  // One automatic retry (short delay) on top of whatever aiApi.transcribe
  // does, before we give up and surface an error to the user. Network blips
  // or a slow/briefly-overloaded provider are common enough during a long
  // recording that this alone avoids losing a chunk in a lot of cases.
  async function transcribeWithRetry(blob: Blob, attempt = 1): Promise<any> {
    try {
      return await aiApi.transcribe(blob);
    } catch (err) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
        return transcribeWithRetry(blob, attempt + 1);
      }
      throw err;
    }
  }

  function setupMediaRecorder() {
    if (!mediaRecorder) return;
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      // Handle 5-minute chunks
      if (shouldChunk && state === 'recording') {
        shouldChunk = false;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        chunks = [];

        // Restart recording immediately, before transcribing this chunk, so
        // there is no gap in captured audio while we wait on the network
        // (and possibly retry) - the whole point of chunking is that
        // capture and transcription don't block each other.
        if (state === 'recording' && stream) {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus' : 'audio/webm';
          mediaRecorder = new MediaRecorder(stream, { mimeType });
          setupMediaRecorder();
          mediaRecorder.start(250);
        }

        try {
          const result = await transcribeWithRetry(blob);
          errorMsg = '';
          lastFailedBlob = null;
          dispatch('transcribed', {
            text: result.formatted || result.text,
            plain: result.text,
            diarized: false,
            duration: result.duration,
            language: result.language,
            interim: false
          });
        } catch (err: any) {
          errorMsg = err.message || 'Chunk transcription failed after retrying.';
          lastFailedBlob = blob;
          lastFailedWasFinal = false;
        }
      }
      // Handle final recording (user clicked stop)
      else if (state === 'processing') {
        await handleStop();
      }
    };
  }

  function handleChunk() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    shouldChunk = true;
    mediaRecorder.stop();
  }

  async function getRecordingStream(): Promise<MediaStream> {
    if (sourceType === 'mic') {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return micStream;
    }

    // 'system' or 'both': use getDisplayMedia to capture device audio
    const display: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: true,  // required for dialog; we stop video tracks right after
      audio: true
    });
    displayStream = display;

    // Stop video immediately — we only need audio
    display.getVideoTracks().forEach(t => t.stop());

    const hasSystemAudio = display.getAudioTracks().length > 0;
    systemAudioWarning = hasSystemAudio ? '' : (
      isMac()
        ? 'No system audio captured. On macOS, install BlackHole or Loopback first, then set it as your output device.'
        : 'No system audio captured. Make sure to check "Share system audio" in the screen share dialog.'
    );

    // Build mixed stream via AudioContext
    const ctx = new AudioContext();
    audioCtx = ctx;
    const dest = ctx.createMediaStreamDestination();

    // Chrome can auto-suspend an AudioContext whose output never reaches
    // actual speakers - exactly this case, since `dest` only feeds
    // MediaRecorder, nothing plays out loud - once the tab is backgrounded,
    // as a power-saving intervention. That would silently gap the recording
    // for as long as the tab stays hidden. Route a near-silent (not fully
    // silent - Chrome's "is this audible" check looks at actual output
    // level, so exact 0 gain would still be classified inaudible) oscillator
    // through ctx.destination so the context is considered "producing
    // sound" and never gets suspended in the background at all.
    const keepAliveGain = ctx.createGain();
    keepAliveGain.gain.value = 0.0001;
    keepAliveOsc = ctx.createOscillator();
    keepAliveOsc.connect(keepAliveGain).connect(ctx.destination);
    keepAliveOsc.start();

    if (hasSystemAudio) {
      ctx.createMediaStreamSource(display).connect(dest);
    }

    if (sourceType === 'both' || !hasSystemAudio) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx.createMediaStreamSource(micStream).connect(dest);
      } catch {
        if (!hasSystemAudio) throw new Error('No audio source available. System audio was not captured and microphone access was denied.');
      }
    }

    return dest.stream;
  }

  async function startRecording() {
    errorMsg = '';
    systemAudioWarning = '';
    lastFailedBlob = null;
    lastFailedWasFinal = false;
    try {
      const recordStream = await getRecordingStream();
      stream = recordStream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';

      mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunks = [];
      setupMediaRecorder();
      mediaRecorder.start(250);

      state = 'recording';
      duration = 0;
      timer = setInterval(() => duration++, 1000);
      chunkTimer = setInterval(() => handleChunk(), 5 * 60 * 1000);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      dispatch('recordingStart');
    } catch (err: any) {
      stopAllTracks();
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        errorMsg = sourceType === 'mic'
          ? 'Microphone access denied. Please allow microphone access in your browser settings.'
          : 'Screen share was cancelled. Please try again and allow audio sharing.';
      } else {
        errorMsg = err.message || 'Could not start recording.';
      }
      state = 'error';
    }
  }

  function pauseRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    mediaRecorder.pause();
    clearInterval(timer);
    state = 'paused';
  }

  function resumeRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'paused') return;
    // Resume AudioContext if suspended (can happen after tab switch)
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    mediaRecorder.resume();
    timer = setInterval(() => duration++, 1000);
    state = 'recording';
  }

  function stopRecording() {
    clearInterval(timer);
    clearInterval(chunkTimer);
    // Resume paused recorder before stopping so onstop fires correctly
    if (mediaRecorder?.state === 'paused') mediaRecorder.resume();
    mediaRecorder?.stop();
    state = 'processing';
  }

  function cancelRecording() {
    clearInterval(timer);
    clearInterval(chunkTimer);
    if (mediaRecorder?.state === 'paused') mediaRecorder.resume();
    mediaRecorder?.stop();
    stopAllTracks();
    chunks = [];
    lastFailedBlob = null;
    lastFailedWasFinal = false;
    state = 'idle';
    systemAudioWarning = '';
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  async function handleStop() {
    if (chunks.length === 0) { state = 'idle'; return; }
    const blob = new Blob(chunks, { type: 'audio/webm' });
    try {
      const result = await transcribeWithRetry(blob);
      dispatch('transcribed', {
        text: result.formatted || result.text,
        plain: result.text,
        diarized: result.diarized,
        duration: result.duration,
        language: result.language,
        interim: false
      });
      lastFailedBlob = null;
      state = 'idle';
    } catch (err: any) {
      errorMsg = err.message || 'Transcription failed. Please try again.';
      lastFailedBlob = blob;
      lastFailedWasFinal = true;
      state = 'error';
    }
  }

  // Actually resends the failed blob, instead of just clearing the error.
  // For a failed mid-recording chunk, recording keeps running the whole
  // time (state stays 'recording') - only the final-stop case moves through
  // 'processing'/'error' like a fresh transcription attempt.
  async function retryFailedTranscription() {
    if (!lastFailedBlob) { state = 'idle'; errorMsg = ''; return; }
    const blob = lastFailedBlob;
    const wasFinal = lastFailedWasFinal;

    if (wasFinal) {
      state = 'processing';
      errorMsg = '';
    } else {
      retryingChunk = true;
    }

    try {
      const result = await transcribeWithRetry(blob);
      dispatch('transcribed', {
        text: result.formatted || result.text,
        plain: result.text,
        diarized: result.diarized,
        duration: result.duration,
        language: result.language,
        interim: false
      });
      lastFailedBlob = null;
      errorMsg = '';
      if (wasFinal) state = 'idle';
    } catch (err: any) {
      errorMsg = err.message || 'Transcription failed. Please try again.';
      if (wasFinal) state = 'error';
      // otherwise stay in 'recording' - lastFailedBlob is kept so the user can retry again
    } finally {
      if (!wasFinal) retryingChunk = false;
    }
  }
</script>

<!-- ── Idle ── -->
{#if state === 'idle'}
  <div class="vr-idle-row">
    <div class="vr-source-tabs">
      <button class="vr-src-btn {sourceType === 'mic' ? 'active' : ''}" on:click={() => sourceType = 'mic'} title="Mic only"><i class="bi bi-mic"></i></button>
      <button class="vr-src-btn {sourceType === 'system' ? 'active' : ''}" on:click={() => sourceType = 'system'} title="System audio (Zoom/Teams)"><i class="bi bi-display"></i></button>
      <button class="vr-src-btn {sourceType === 'both' ? 'active' : ''}" on:click={() => sourceType = 'both'} title="Mic + System audio"><i class="bi bi-mic"></i><span class="vr-plus">+</span><i class="bi bi-display"></i></button>
    </div>
    <button class="vr-record-btn" on:click={startRecording} title={sourceType === 'mic' ? 'Record microphone' : sourceType === 'system' ? 'Record system audio' : 'Record mic + system audio'}>
      <i class="bi bi-mic"></i>
    </button>
  </div>

  {#if systemAudioWarning}
    <div class="vr-sys-warn"><i class="bi bi-exclamation-triangle"></i> {systemAudioWarning}</div>
  {/if}

<!-- ── Recording ── -->
{:else if state === 'recording'}
  <div class="vr-recording">
    <span class="vr-dot"></span>
    <span class="vr-src-label">
      {#if sourceType === 'system'}<i class="bi bi-display"></i>{:else if sourceType === 'both'}<i class="bi bi-mic"></i>+<i class="bi bi-display"></i>{:else}<i class="bi bi-mic"></i>{/if}
    </span>
    <span class="vr-time" title="Recording duration">{formatTime(duration)}</span>
    <button class="vr-pause-btn" on:click={pauseRecording} title="Pause recording">
      <i class="bi bi-pause-fill"></i>
    </button>
    <button class="vr-stop-btn" on:click={stopRecording} title="Stop & transcribe">
      <i class="bi bi-stop-fill"></i>
    </button>
    <button class="vr-cancel-btn" on:click={cancelRecording} title="Cancel recording">
      <i class="bi bi-x"></i>
    </button>
  </div>

  {#if lastFailedBlob && !lastFailedWasFinal}
    <div class="vr-chunk-warn">
      <i class="bi bi-exclamation-triangle"></i>
      <span>{errorMsg || 'A segment failed to transcribe.'}</span>
      <button class="vr-retry-btn" on:click={retryFailedTranscription} disabled={retryingChunk}>
        {#if retryingChunk}<span class="vr-spinner-sm"></span>{:else}<i class="bi bi-arrow-counterclockwise"></i>{/if} Retry
      </button>
    </div>
  {/if}

<!-- ── Paused ── -->
{:else if state === 'paused'}
  <div class="vr-recording vr-paused">
    <span class="vr-dot vr-dot-paused"></span>
    <span class="vr-src-label">
      {#if sourceType === 'system'}<i class="bi bi-display"></i>{:else if sourceType === 'both'}<i class="bi bi-mic"></i>+<i class="bi bi-display"></i>{:else}<i class="bi bi-mic"></i>{/if}
    </span>
    <span class="vr-time" title="Recorded duration">{formatTime(duration)}</span>
    <button class="vr-resume-btn" on:click={resumeRecording} title="Resume recording">
      <i class="bi bi-play-fill"></i>
    </button>
    <button class="vr-stop-btn" on:click={stopRecording} title="Stop & transcribe">
      <i class="bi bi-stop-fill"></i>
    </button>
    <button class="vr-cancel-btn" on:click={cancelRecording} title="Cancel recording">
      <i class="bi bi-x"></i>
    </button>
  </div>

<!-- ── Processing ── -->
{:else if state === 'processing'}
  <div class="vr-processing" title="Transcribing audio...">
    <span class="vr-spinner"></span>
  </div>

<!-- ── Error ── -->
{:else if state === 'error'}
  <div class="vr-error">
    <i class="bi bi-exclamation-triangle-fill vr-error-icon"></i>
    <span class="vr-error-msg">{errorMsg}</span>
    {#if lastFailedBlob}
      <button class="vr-retry-btn" on:click={retryFailedTranscription}>
        <i class="bi bi-arrow-counterclockwise"></i> Retry
      </button>
    {:else}
      <button class="vr-retry-btn" on:click={() => { state = 'idle'; errorMsg = ''; }}>
        <i class="bi bi-arrow-counterclockwise"></i> Dismiss
      </button>
    {/if}
  </div>
{/if}

<style>
  /* ── Record button ── */
  .vr-record-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 2px solid #ef4444;
    border-radius: 50%;
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    font-size: 15px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.1);
  }
  .vr-record-btn:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #dc2626;
    color: #dc2626;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
    transform: scale(1.08);
  }
  .vr-record-btn:active {
    transform: scale(0.95);
  }

  /* ── Recording state ── */
  .vr-recording {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px 3px 8px;
    border: 1.5px solid #ef4444;
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.07);
    animation: vr-fadein 0.2s ease;
  }

  .vr-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
    animation: vr-pulse 1.2s ease-in-out infinite;
  }
  @keyframes vr-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.35; transform: scale(0.75); }
  }

  .vr-time {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: #ef4444;
    font-weight: 600;
    min-width: 26px;
    flex-shrink: 0;
  }

  .vr-stop-btn, .vr-cancel-btn, .vr-pause-btn, .vr-resume-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    border: none;
    cursor: pointer;
    font-size: 10px;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .vr-stop-btn   { background: #ef4444; color: #fff; }
  .vr-stop-btn:hover   { background: #dc2626; }
  .vr-cancel-btn { background: var(--bg-hover); color: var(--text-muted); }
  .vr-cancel-btn:hover { background: var(--bg-active); color: var(--text-secondary); }
  .vr-pause-btn  { background: rgba(239,68,68,0.12); color: #ef4444; }
  .vr-pause-btn:hover  { background: rgba(239,68,68,0.22); }
  .vr-resume-btn { background: rgba(34,197,94,0.12); color: #16a34a; }
  .vr-resume-btn:hover { background: rgba(34,197,94,0.22); }

  .vr-paused {
    border-color: rgba(239,68,68,0.35);
    background: rgba(239,68,68,0.04);
  }
  .vr-dot-paused {
    animation: none;
    opacity: 0.35;
  }

  /* ── Processing ── */
  .vr-processing {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    animation: vr-fadein 0.2s ease;
  }
  .vr-spinner {
    width: 13px; height: 13px;
    border: 2px solid var(--border-color);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: vr-spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes vr-spin { to { transform: rotate(360deg); } }

  .vr-spinner-sm {
    width: 10px; height: 10px;
    display: inline-block;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: vr-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  /* ── Error ── */
  .vr-error {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 7px 10px;
    border: 1px solid rgba(239,68,68,0.35);
    border-radius: var(--radius-sm);
    background: rgba(239,68,68,0.07);
    max-width: 300px;
    animation: vr-fadein 0.2s ease;
  }
  .vr-error-icon { color: #ef4444; font-size: 13px; flex-shrink: 0; margin-top: 1px; }
  .vr-error-msg  { font-size: 11.5px; color: var(--text-secondary); flex: 1; line-height: 1.4; }
  .vr-retry-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px;
    border: 1px solid #ef4444;
    border-radius: 4px;
    background: none;
    color: #ef4444;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  }
  .vr-retry-btn:hover { background: rgba(239,68,68,0.1); }
  .vr-retry-btn:disabled { opacity: 0.6; cursor: default; }

  /* ── Mid-recording chunk failure banner ── */
  .vr-chunk-warn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    margin-top: 4px;
    background: rgba(239,68,68,0.06);
    border: 1px solid rgba(239,68,68,0.25);
    border-radius: var(--radius-sm);
    font-size: 11px;
    color: var(--text-secondary);
    max-width: 320px;
  }
  .vr-chunk-warn i:first-child { color: #ef4444; flex-shrink: 0; }
  .vr-chunk-warn span { flex: 1; line-height: 1.4; }
  .vr-chunk-warn .vr-retry-btn { background: #ef4444; color: #fff; }
  .vr-chunk-warn .vr-retry-btn:hover { background: #dc2626; }

  @keyframes vr-fadein { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }

  /* ── Source selector tabs ── */
  .vr-idle-row { display: inline-flex; align-items: center; gap: 4px; }

  .vr-source-tabs {
    display: inline-flex;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--bg-secondary);
  }
  .vr-src-btn {
    display: inline-flex; align-items: center; gap: 1px;
    padding: 4px 7px; border: none; background: none;
    color: var(--text-muted); font-size: 11px; cursor: pointer;
    border-right: 1px solid var(--border-color); line-height: 1;
    transition: all 0.15s;
  }
  .vr-src-btn:last-child { border-right: none; }
  .vr-src-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .vr-src-btn.active { background: var(--accent-color); color: #fff; }
  .vr-plus { font-size: 9px; margin: 0 1px; }

  .vr-src-label {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    color: #ef4444;
    opacity: 0.8;
    flex-shrink: 0;
  }

  .vr-sys-warn {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    padding: 6px 8px;
    margin-top: 4px;
    background: rgba(234,179,8,0.08);
    border: 1px solid rgba(234,179,8,0.3);
    border-radius: var(--radius-sm);
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.4;
    max-width: 280px;
  }
  .vr-sys-warn i { color: #ca8a04; flex-shrink: 0; margin-top: 1px; }

  /* ── Mobile ── */
  @media (max-width: 768px) {
    .vr-record-btn {
      width: 30px;
      height: 30px;
      font-size: 14px;
    }

    .vr-recording {
      gap: 5px;
      padding: 4px 6px 4px 8px;
    }

    .vr-processing { padding: 5px 8px; }

    .vr-error {
      max-width: 200px;
      flex-wrap: wrap;
    }
    .vr-error-msg {
      font-size: 11px;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .vr-chunk-warn { max-width: 220px; }
  }
</style>
