const multer = require('multer');
const { db } = require('../config/db');
const FormData = require('form-data');
const axios = require('axios');
const { getAdminDefaultTranscription } = require('../services/adminLLMService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB (supports ~2 hours of compressed audio)
  fileFilter: (req, file, cb) => {
    const ok = ['audio/webm', 'audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/x-m4a', 'video/webm'];
    cb(null, ok.includes(file.mimetype) || file.originalname.match(/\.(webm|wav|mp3|mp4|m4a|ogg)$/i) ? true : false);
  }
});

async function getSettings(userId) {
  try {
    const data = await db('notes_settings').where({ user_id: userId }).first();
    return data || {};
  } catch { return {}; }
}

async function getOpenRouterKey(settings) {
  if (settings.ai_api_key) return settings.ai_api_key;
  try {
    const row = await db('admin_settings').where({ setting_key: 'openrouter_api_key' }).first();
    return (row && row.setting_value) || process.env.OPENROUTER_API_KEY;
  } catch { return process.env.OPENROUTER_API_KEY; }
}

// ── Gemini audio transcription via OpenRouter chat completions ────────────────
// Uses /chat/completions (supported) with base64 audio — no separate Whisper key needed

async function transcribeWithGemini(audioBuffer, model, language, diarize, apiKey, baseUrl) {
  const ext = 'webm';
  const b64 = audioBuffer.toString('base64');

  const langHint = (language && language !== 'auto') ? ` The audio is in ${language}.` : '';
  const diarizePrompt = diarize
    ? `\n\nIf multiple speakers are detected, label each speaker at the start of their section with **Speaker A:** or **Speaker B:** etc. on the same line as their speech. Use context clues (Interviewer/Host/Guest) if evident. Each speaker section should start on a new line. If only one speaker, return as-is without labels.`
    : '';

  const prompt = `Transcribe this audio accurately, preserving all words and punctuation. Return ONLY the spoken words — no commentary, no extra formatting, no timestamps.${langHint}${diarizePrompt}`;
  const endpoint = `${(baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minute timeout

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://yesvara.com'
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: model || 'google/gemini-2.0-flash-001',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: { data: b64, format: ext }
          },
          { type: 'text', text: prompt }
        ]
      }],
      temperature: 0.1
    })
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Transcription error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  return { text, formatted: text };
}

// ── Whisper fallback (Groq/OpenAI direct + optional LLM diarization) ──────────

async function transcribeWithWhisper(audioBuffer, filename, model, language, apiKey, baseUrl) {
  const ext = filename?.match(/\.(webm|wav|mp3|mp4|m4a|ogg)$/i)?.[1] || 'webm';
  const mimeMap = { webm: 'audio/webm', wav: 'audio/wav', mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/mp4', ogg: 'audio/ogg' };
  const mime = mimeMap[ext] || 'audio/webm';
  const endpoint = `${(baseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '')}/audio/transcriptions`;

  const form = new FormData();
  form.append('file', audioBuffer, { filename: `audio.${ext}`, contentType: mime });
  form.append('model', model || 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('temperature', '0');        // prevent hallucination / word repetition
  if (language && language !== 'auto') form.append('language', language);

  const res = await axios.post(endpoint, form, {
    headers: { 'Authorization': `Bearer ${apiKey}`, ...form.getHeaders() },
    maxBodyLength: Infinity
  });
  const raw = res.data?.text || '';
  const cleaned = removeRepetitions(raw);
  return { text: cleaned, formatted: cleaned };
}

// Remove Whisper hallucinated repetitions (e.g. "Kita juga. Kita juga. Kita juga...")
function removeRepetitions(text) {
  if (!text) return text;
  // Split into sentences / clauses, deduplicate consecutive repeats
  const parts = text.split(/(?<=[.!?])\s+/);
  const out = [];
  let lastPhrase = '';
  let repeatCount = 0;
  for (const part of parts) {
    const normalized = part.trim().toLowerCase();
    if (normalized === lastPhrase) {
      repeatCount++;
      if (repeatCount >= 3) continue; // skip if repeated 3+ times consecutively
    } else {
      repeatCount = 0;
      lastPhrase = normalized;
    }
    out.push(part);
  }
  return out.join(' ').trim();
}

async function diarizeWithLLM(transcript, model, apiKey) {
  const prompt = `You are a speaker diarization assistant. Given a transcript, identify different speakers and format the output with speaker labels.

Rules:
- Label speakers as "Speaker A", "Speaker B", etc. (or use context clues like "Interviewer"/"Interviewee", "Host"/"Guest" if obvious)
- Each speaker change starts on a new line with the label in bold: **Speaker A:** text
- If only one speaker is detected, return the text as-is without speaker labels
- Preserve all original words exactly — do not paraphrase or summarize
- Keep punctuation and paragraph breaks

Transcript:
${transcript}

Return ONLY the formatted transcript, no explanations.`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://yesvara.com'
    },
    body: JSON.stringify({
      model: model || 'mistralai/mistral-small-3.2-24b-instruct',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  });

  if (!res.ok) throw new Error(`Diarization LLM error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || transcript;
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function transcribe(req, res) {
  try {
    const userId = req.user.id;
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const userSettings = await getSettings(userId);
    const openRouterKey = await getOpenRouterKey(userSettings);
    const adminDefault = await getAdminDefaultTranscription();

    // Language and diarization stay user preferences even when the admin
    // locks the provider/model - locking is about "which service", not
    // "how you want the output formatted".
    const language = userSettings.transcription_language || 'auto';
    const diarize  = userSettings.diarization_enabled === true || userSettings.diarization_enabled === 'true';

    let provider, model, baseUrl, transcriptionKey;
    if (adminDefault.locked) {
      provider = adminDefault.provider;
      model = adminDefault.model || 'google/gemini-2.0-flash-001';
      baseUrl = adminDefault.baseUrl;
      transcriptionKey = adminDefault.apiKey;
    } else {
      provider = userSettings.transcription_provider || 'openrouter';
      model    = userSettings.transcription_model    || 'google/gemini-2.0-flash-001';
      baseUrl  = userSettings.transcription_base_url || 'https://openrouter.ai/api/v1';
      // Resolve API key: prefer user-configured key, fall back to admin default, then global OpenRouter key
      transcriptionKey = userSettings.transcription_api_key
        || (provider === adminDefault.provider ? adminDefault.apiKey : null)
        || (provider === 'openrouter' ? openRouterKey : null);
    }
    const useGemini = provider === 'openrouter';

    console.log(`[Transcribe] provider=${provider} model=${model} lang=${language} diarize=${diarize}`);

    let text = '', formatted = '';

    if (useGemini) {
      if (!transcriptionKey) return res.status(400).json({ error: 'No OpenRouter API key configured.' });
      const result = await transcribeWithGemini(req.file.buffer, model, language, diarize, transcriptionKey, baseUrl);
      text = result.text;
      formatted = result.formatted;
    } else {
      // Whisper path (groq / openai / custom): transcribe → optionally diarize with LLM
      if (!transcriptionKey) return res.status(400).json({ error: `No API key configured for provider "${provider}".` });
      const result = await transcribeWithWhisper(req.file.buffer, req.file.originalname, model, language, transcriptionKey, baseUrl);
      text = result.text.trim();
      formatted = text;
      if (diarize && text) {
        const diarizationModel = userSettings.diarization_model || 'mistralai/mistral-small-3.2-24b-instruct';
        try { formatted = await diarizeWithLLM(text, diarizationModel, openRouterKey); }
        catch (err) { console.warn('[Transcribe] Diarization failed:', err.message); }
      }
    }

    if (!text) return res.json({ text: '', formatted: '' });
    res.json({ text, formatted, diarized: diarize, language: null });
  } catch (err) {
    console.error('[Transcribe]', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { upload, transcribe };
