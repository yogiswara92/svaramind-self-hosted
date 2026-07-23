const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const path = require('path');
const { db } = require('../config/db');
const { encryptDocument } = require('../services/encryptionService');
const { indexDocumentAsync } = require('../services/notesEmbeddingService');
const { markdownToTiptap, markdownToHtml } = require('../services/markdownToTiptap');
const { assertWorkspaceAccess, handleError } = require('../services/authz');

// Store uploads in memory (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.md', '.markdown'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  }
});

// ── Parsers ───────────────────────────────────────────────────────────────────

async function parseDocx(buffer) {
  const { value: html, messages } = await mammoth.convertToHtml({ buffer });
  // Extract plain text for RAG
  const { value: text } = await mammoth.extractRawText({ buffer });
  return { html, text: text.trim() };
}

async function parsePdf(buffer) {
  const parseWithTimeout = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PDF parsing timed out (15s). Try a smaller or simpler PDF.')), 15000);
    pdfParse(buffer, { max: 0 })
      .then(data => { clearTimeout(timer); resolve(data); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });

  const data = await parseWithTimeout;
  const text = data.text.trim();

  if (!text) {
    return {
      html: '<p><em>This PDF appears to be image-based or contains no extractable text.</em></p>',
      text: ''
    };
  }

  const html = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, ' ')}</p>`)
    .join('');
  return { html, text };
}

async function parseXlsx(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  let html = '';
  let text = '';

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    html += `<h2>${sheetName}</h2>`;
    text += `\n## ${sheetName}\n`;
    html += '<table><tbody>';

    rows.forEach((row, i) => {
      const tag = i === 0 ? 'th' : 'td';
      html += '<tr>' + row.map(cell => `<${tag}>${String(cell ?? '')}</${tag}>`).join('') + '</tr>';
      text += row.map(c => String(c ?? '')).join('\t') + '\n';
    });

    html += '</tbody></table>';
  }

  return { html, text: text.trim() };
}

async function parsePptx(buffer) {
  // PPTX is a ZIP — extract text from slide XML files
  const AdmZip = (() => { try { return require('adm-zip'); } catch { return null; } })();

  if (!AdmZip) {
    // Fallback: treat as plain text extraction via XLSX (limited)
    return { html: '<p>PPTX import requires adm-zip. Plain text only.</p>', text: '' };
  }

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries()
    .filter(e => /ppt\/slides\/slide\d+\.xml/.test(e.entryName))
    .sort((a, b) => {
      const n = s => parseInt(s.entryName.match(/slide(\d+)/)?.[1] || 0);
      return n(a) - n(b);
    });

  let html = '';
  let text = '';
  let slideNum = 1;

  for (const entry of entries) {
    const xml = entry.getData().toString('utf8');
    // Extract text from <a:t> tags
    const texts = [];
    const re = /<a:t[^>]*>([^<]+)<\/a:t>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const t = m[1].trim();
      if (t) texts.push(t);
    }
    if (texts.length === 0) { slideNum++; continue; }

    html += `<h2>Slide ${slideNum}</h2>`;
    // First text is usually the title
    if (texts[0]) html += `<h3>${texts[0]}</h3>`;
    const body = texts.slice(1);
    if (body.length > 0) {
      html += '<ul>' + body.map(t => `<li>${t}</li>`).join('') + '</ul>';
    }
    text += `Slide ${slideNum}: ${texts.join(' ')}\n`;
    slideNum++;
  }

  return { html: html || '<p>No text content found in presentation.</p>', text: text.trim() };
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function importDocument(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id, folder_id } = req.body;

    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await assertWorkspaceAccess(workspace_id, userId);

    const { buffer, originalname } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    const baseName = path.basename(originalname, ext);

    let html = '';
    let text = '';
    let content = null; // only markdown gives us exact TipTap JSON; others fall back to the empty doc + content_html

    if (ext === '.md' || ext === '.markdown') {
      text = buffer.toString('utf8');
      html = markdownToHtml(text);
      content = markdownToTiptap(text);
    } else if (ext === '.docx' || ext === '.doc') {
      ({ html, text } = await parseDocx(buffer));
    } else if (ext === '.pdf') {
      try {
        ({ html, text } = await parsePdf(buffer));
      } catch (pdfErr) {
        const msg = pdfErr.message || '';
        if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypted')) {
          return res.status(422).json({ error: 'PDF is password-protected. Please remove the password and try again.' });
        }
        if (msg.toLowerCase().includes('timed out')) {
          return res.status(422).json({ error: pdfErr.message });
        }
        return res.status(422).json({ error: `Could not read PDF: ${msg}` });
      }
    } else if (ext === '.xlsx' || ext === '.xls') {
      ({ html, text } = await parseXlsx(buffer, baseName));
    } else if (ext === '.pptx' || ext === '.ppt') {
      ({ html, text } = await parsePptx(buffer));
    } else {
      return res.status(400).json({ error: `Unsupported format: ${ext}` });
    }

    if (!html && !text) {
      return res.status(422).json({ error: 'Could not extract content from file' });
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    const plainDoc = {
      workspace_id,
      folder_id: folder_id || null,
      title: baseName,
      content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
      content_html: html,
      content_text: text,
      icon: iconForExt(ext),
      word_count: wordCount,
      read_time_minutes: Math.max(1, Math.round(wordCount / 200)),
      created_by: userId,
      last_edited_by: userId
    };

    const [data] = await db('notes_documents').insert(encryptDocument(plainDoc)).returning('*');

    await db('notes_ai_insights').insert({ document_id: data.id, processing_status: 'pending' });

    if (text.length > 50) indexDocumentAsync(data.id, text, userId);

    res.status(201).json({ document: { id: data.id, title: baseName } });
  } catch (err) { handleError(res, err, 'importDocument'); }
}

function iconForExt(ext) {
  const map = {
    '.pdf':  'bi-file-earmark-pdf',
    '.docx': 'bi-file-earmark-word',
    '.doc':  'bi-file-earmark-word',
    '.xlsx': 'bi-file-earmark-spreadsheet',
    '.xls':  'bi-file-earmark-spreadsheet',
    '.pptx': 'bi-file-earmark-slides',
    '.ppt':  'bi-file-earmark-slides',
    '.md':   'bi-markdown',
    '.markdown': 'bi-markdown',
  };
  return map[ext] || 'bi-file-earmark';
}

module.exports = { upload, importDocument };
