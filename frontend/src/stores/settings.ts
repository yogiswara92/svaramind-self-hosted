import { writable } from 'svelte/store';
import { settingsApi } from '../lib/api';

export interface LLMConfig {
  id: string;
  name: string;
  provider: 'openrouter' | 'apilogy' | 'openai' | 'ollama' | 'custom';
  model: string;
  api_key: string;
  base_url: string;
}

export interface NotesSettings {
  id?: string;
  user_id?: string;
  theme: 'light' | 'dark' | 'sepia';
  editor_font: string;
  editor_font_size: number;
  editor_line_height: number;
  ai_enabled: boolean;
  ai_auto_tag: boolean;
  ai_auto_summary: boolean;
  ai_model: string;
  ai_provider: string;
  ai_api_key: string;
  ai_base_url: string;
  ai_default_language: string;
  sidebar_collapsed: boolean;
  show_word_count: boolean;
  spell_check: boolean;
  auto_save: boolean;
  auto_save_interval_seconds: number;
  show_ai_panel: boolean;
  compact_mode: boolean;
  show_breadcrumbs: boolean;
  apilogy_api_key: string;
  embedding_provider: string;
  embedding_api_key: string;
  embedding_model: string;
  embedding_base_url: string;
  llm_configs: LLMConfig[];
  default_llm_config: string;
  transcription_provider: string;
  transcription_model: string;
  transcription_language: string;
  transcription_api_key: string;
  transcription_base_url: string;
  diarization_enabled: boolean;
  diarization_model: string;
  google_search_api_key: string;
  google_search_cx: string;
  blog_bio: string;
}

export const defaultSettings: NotesSettings = {
  theme: 'light',
  editor_font: 'Inter',
  editor_font_size: 16,
  editor_line_height: 1.6,
  ai_enabled: true,
  ai_auto_tag: true,
  ai_auto_summary: true,
  ai_model: 'mistralai/mistral-small-3.2-24b-instruct',
  ai_provider: 'openrouter',
  ai_api_key: '',
  ai_base_url: 'https://openrouter.ai/api/v1',
  ai_default_language: 'auto',
  sidebar_collapsed: false,
  show_word_count: true,
  spell_check: true,
  auto_save: true,
  auto_save_interval_seconds: 15,
  show_ai_panel: true,
  compact_mode: false,
  show_breadcrumbs: true,
  apilogy_api_key: '',
  embedding_provider: 'openrouter',
  embedding_api_key: '',
  embedding_model: 'openai/text-embedding-ada-002',
  embedding_base_url: 'https://openrouter.ai/api/v1',
  llm_configs: [],
  default_llm_config: '',
  transcription_provider: 'openrouter',
  transcription_model: 'google/gemini-2.0-flash-001',
  transcription_language: 'auto',
  transcription_api_key: '',
  transcription_base_url: 'https://openrouter.ai/api/v1',
  diarization_enabled: false,
  diarization_model: 'mistralai/mistral-small-3.2-24b-instruct',
  google_search_api_key: '',
  google_search_cx: '',
  blog_bio: ''
};

export const settings = writable<NotesSettings>(defaultSettings);
export const settingsLoaded = writable(false);

export async function loadSettings() {
  try {
    const { settings: data } = await settingsApi.get();
    settings.set({ ...defaultSettings, ...data });
    applyTheme(data?.theme || 'light');
    settingsLoaded.set(true);
    return data;
  } catch (err) {
    console.error('[Settings] loadSettings error:', err);
    settingsLoaded.set(true);
    return defaultSettings;
  }
}

export async function saveSettings(updates: Partial<NotesSettings>) {
  try {
    const { settings: data } = await settingsApi.update(updates);
    settings.update(s => ({ ...s, ...data }));
    if (updates.theme) applyTheme(updates.theme);
    return data;
  } catch (err) {
    console.error('[Settings] saveSettings error:', err);
    throw err;
  }
}

export function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
}

export const FONTS = [
  { label: 'Inter (Default)', value: 'Inter' },
  { label: 'Merriweather (Serif)', value: 'Merriweather' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Fira Code (Monospace)', value: 'Fira Code' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' }
];

export const AI_LANGUAGES = [
  { label: 'Auto (follow user input)', value: 'auto' },
  { label: 'English', value: 'English' },
  { label: 'Indonesian (Bahasa Indonesia)', value: 'Indonesian' },
  { label: 'Arabic (العربية)', value: 'Arabic' },
  { label: 'Chinese Simplified (简体中文)', value: 'Chinese Simplified' },
  { label: 'Chinese Traditional (繁體中文)', value: 'Chinese Traditional' },
  { label: 'French (Français)', value: 'French' },
  { label: 'German (Deutsch)', value: 'German' },
  { label: 'Hindi (हिन्दी)', value: 'Hindi' },
  { label: 'Japanese (日本語)', value: 'Japanese' },
  { label: 'Korean (한국어)', value: 'Korean' },
  { label: 'Malay (Bahasa Melayu)', value: 'Malay' },
  { label: 'Portuguese (Português)', value: 'Portuguese' },
  { label: 'Russian (Русский)', value: 'Russian' },
  { label: 'Spanish (Español)', value: 'Spanish' },
  { label: 'Thai (ภาษาไทย)', value: 'Thai' },
  { label: 'Turkish (Türkçe)', value: 'Turkish' },
  { label: 'Vietnamese (Tiếng Việt)', value: 'Vietnamese' }
];

export const AI_MODELS = [
  { label: 'Mistral Small (Fast)', value: 'mistralai/mistral-small-3.2-24b-instruct', provider: 'openrouter' },
  { label: 'GPT-4o', value: 'openai/gpt-4o', provider: 'openrouter' },
  { label: 'GPT-4o Mini', value: 'openai/gpt-4o-mini', provider: 'openrouter' },
  { label: 'Claude Sonnet 4', value: 'anthropic/claude-sonnet-4', provider: 'openrouter' },
  { label: 'Claude Haiku 4', value: 'anthropic/claude-haiku-4', provider: 'openrouter' },
  { label: 'Gemma 4 27B', value: 'google/gemma-4-27b-it', provider: 'openrouter' },
  { label: 'Llama 3.3 70B', value: 'meta-llama/llama-3.3-70b-instruct', provider: 'openrouter' },
  { label: 'DeepSeek V3', value: 'deepseek/deepseek-chat', provider: 'openrouter' },
  // Apilogy (Telkom AI)
  { label: 'Qwen 2.5 32B Instruct (Apilogy)', value: 'Qwen/Qwen2.5-32B-Instruct', provider: 'apilogy' },
  { label: 'Qwen 2.5 72B Instruct (Apilogy)', value: 'Qwen/Qwen2.5-72B-Instruct', provider: 'apilogy' },
  { label: 'Telkom AI Instruct (Apilogy)', value: 'telkom-ai-instruct', provider: 'apilogy' }
];
