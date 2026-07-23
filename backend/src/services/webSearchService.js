const { db } = require('../config/db');

const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

async function getSearchConfig() {
  try {
    const rows = await db('admin_settings')
      .select('setting_key', 'setting_value')
      .whereIn('setting_key', ['google_search_api_key', 'google_search_cx']);
    const cfg = {};
    for (const row of rows) cfg[row.setting_key] = row.setting_value;
    return {
      apiKey: cfg.google_search_api_key || process.env.GOOGLE_SEARCH_API_KEY,
      cx: cfg.google_search_cx || process.env.GOOGLE_SEARCH_CX
    };
  } catch {
    return {
      apiKey: process.env.GOOGLE_SEARCH_API_KEY,
      cx: process.env.GOOGLE_SEARCH_CX
    };
  }
}

async function searchGoogle(query, numResults = 5) {
  const { apiKey, cx } = await getSearchConfig();
  if (!apiKey || !cx) throw new Error('Google Search API key or CX not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX.');

  const url = `${GOOGLE_SEARCH_URL}?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${numResults}`;
  const resp = await fetch(url);

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google Search API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  if (!data.items?.length) return [];

  return data.items.slice(0, numResults).map(item => ({
    title: item.title,
    snippet: item.snippet,
    url: item.link,
    type: 'organic'
  }));
}

function formatResultsForContext(results, query) {
  if (!results.length) return '';
  const lines = [`[Web search results for: "${query}"]`];
  for (const [i, r] of results.entries()) {
    lines.push(`\n${i + 1}. ${r.title}`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    if (r.url) lines.push(`   Source: ${r.url}`);
  }
  return lines.join('\n');
}

module.exports = { searchGoogle, formatResultsForContext };
