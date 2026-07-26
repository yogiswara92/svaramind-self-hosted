<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from 'svelte-routing';
  import NotesLayout from '../components/NotesLayout.svelte';
  import NoteTabBar from '../components/NoteTabBar.svelte';
  import RichTextEditor from '../components/RichTextEditor.svelte';
  import EditorToolbar from '../components/EditorToolbar.svelte';
  import AIAssistantPanel from '../components/AIAssistantPanel.svelte';
  import VersionHistoryPanel from '../components/VersionHistoryPanel.svelte';
  import ShareModal from '../components/ShareModal.svelte';
  import BacklinksPanel from '../components/BacklinksPanel.svelte';
  import { loadDocument, saveDocument, currentDocument, documents } from '../stores/notes';
  import { settings } from '../stores/settings';
  import { documentApi, linksApi, tagApi } from '../lib/api';
  import { extractWikiLinkIds } from '../lib/wikilink-extension';
  import { updateTab, activeTabId } from '../stores/tabs';

  export let docId: string;

  let editorRef: RichTextEditor;
  let editorInstance: any = null;
  let doc: any = null;
  let loading = true;
  let saving = false;
  let savingDoc = false;
  let showAIPanel = false;
  let showVersionPanel = false;
  let showShareModal = false;

  // Persisted locally (not synced server-side, it's a low-stakes display
  // preference, not worth a settings-table round trip) so it survives reloads.
  let toolbarCollapsed = typeof localStorage !== 'undefined' && localStorage.getItem('svaramind_toolbar_collapsed') === 'true';
  function toggleToolbar() {
    toolbarCollapsed = !toolbarCollapsed;
    localStorage.setItem('svaramind_toolbar_collapsed', String(toolbarCollapsed));
  }
  let showExportMenu = false;
  let showPublishModal = false;
  let publishing = false;
  let publishSlug = '';
  let publishExcerpt = '';

  function exportAsPDF() {
    showExportMenu = false;
    const pFont  = $settings.editor_font       || 'Inter';
    const pSize  = $settings.editor_font_size  || 16;
    const pLine  = $settings.editor_line_height || 1.6;

    // Build CSS with string concat to avoid vite-plugin-svelte preprocessing the <style> block
    const css = [
      "body{font-family:'" + pFont + "',sans-serif;font-size:" + pSize + "px;line-height:" + pLine + ";max-width:800px;margin:40px auto;padding:0 40px;color:#212529}",
      'h1,h2,h3{margin-top:1.5em}',
      'table{border-collapse:collapse;width:100%}',
      'td,th{border:1px solid #dee2e6;padding:8px}',
      'img{max-width:100%}',
      'pre{background:#f8f9fa;padding:12px;border-radius:4px;overflow-x:auto}',
      'blockquote{border-left:3px solid #132578;margin:0;padding-left:16px;color:#6c757d;font-style:italic}',
      'ul,ol{padding-left:24px}'
    ].join('\n');

    const html = '<!DOCTYPE html><html><head>'
      + '<meta charset="UTF-8">'
      + '<title>' + (doc?.title || 'Note') + '</title>'
      + '<style>' + css + '</style>'
      + '</head><body>'
      + '<h1>' + (doc?.title || 'Untitled') + '</h1>'
      + (editorRef?.getHTML() || '')
      + '</body></html>';

    // Use Blob URL so the print footer shows the app domain instead of about:blank.
    // charset must be declared in BOTH the blob type and a <meta> tag, otherwise the
    // print window decodes UTF-8 as Latin-1 and emoji/dashes turn into mojibake.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    if (!win) { URL.revokeObjectURL(blobUrl); return; }
    win.focus();
    setTimeout(() => {
      win.print();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }, 500);
  }

  async function exportAsWord() {
    showExportMenu = false;
    const { Document, Paragraph, TextRun, HeadingLevel, Packer, ImageRun } = await import('docx');
    const title = doc?.title || 'Untitled';
    const json = editorRef?.getJSON();
    if (!json) return;

    const MAX_W = 500; // max image width in pixels for docx

    async function urlToBuffer(src: string): Promise<Uint8Array | null> {
      try { return new Uint8Array(await (await fetch(src)).arrayBuffer()); }
      catch { return null; }
    }

    async function svgToPngBuffer(svgSrc: string): Promise<{ buf: Uint8Array; w: number; h: number } | null> {
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const w = Math.max(img.naturalWidth, 1);
          const h = Math.max(img.naturalHeight, 1);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          canvas.toBlob(blob => {
            if (!blob) return resolve(null);
            blob.arrayBuffer().then(ab => resolve({ buf: new Uint8Array(ab), w, h }));
          }, 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = svgSrc;
      });
    }

    async function getImgSize(src: string): Promise<{ w: number; h: number }> {
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ w: Math.max(img.naturalWidth, 1), h: Math.max(img.naturalHeight, 1) });
        img.onerror = () => resolve({ w: 400, h: 300 });
        img.src = src;
      });
    }

    function scale(w: number, h: number) {
      const ratio = w > MAX_W ? MAX_W / w : 1;
      return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) };
    }

    function marksToOpts(marks: any[]) {
      const o: any = {};
      for (const m of marks || []) {
        if (m.type === 'bold') o.bold = true;
        if (m.type === 'italic') o.italics = true;
        if (m.type === 'underline') o.underline = {};
        if (m.type === 'strike') o.strike = true;
        if (m.type === 'code') o.font = 'Courier New';
      }
      return o;
    }

    // Returns inline runs (TextRun | ImageRun) — for use inside Paragraph.children
    async function toInline(node: any): Promise<any[]> {
      if (node.type === 'text') return [new TextRun({ text: node.text || '', ...marksToOpts(node.marks || []) })];
      if (node.type === 'hardBreak') return [new TextRun({ break: 1 })];
      if (node.type === 'image') {
        const src = node.attrs?.src;
        if (!src) return [];
        const [buf, size] = await Promise.all([urlToBuffer(src), getImgSize(src)]);
        if (!buf) return [new TextRun({ text: '[image]', italics: true })];
        const t = (src.includes('.gif') ? 'gif' : src.includes('.bmp') ? 'bmp'
          : (src.startsWith('data:image/png') || src.includes('.png')) ? 'png' : 'jpg') as any;
        return [new ImageRun({ type: t, data: buf, transformation: scale(size.w, size.h) })];
      }
      // inline fallback: collect from children
      const runs: any[] = [];
      for (const c of node.content || []) runs.push(...await toInline(c));
      return runs;
    }

    // Returns block elements (Paragraph[]) — for use in section.children
    async function toBlock(node: any, listLevel = 0): Promise<any[]> {
      const blocks: any[] = [];

      switch (node.type) {
        case 'paragraph': {
          const runs: any[] = [];
          for (const c of node.content || []) runs.push(...await toInline(c));
          blocks.push(new Paragraph({ children: runs.length ? runs : [new TextRun('')] }));
          break;
        }
        case 'heading': {
          const lvls = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
          const lvl = lvls[Math.min((node.attrs?.level || 1) - 1, 3)];
          const runs: any[] = [];
          for (const c of node.content || []) runs.push(...await toInline(c));
          blocks.push(new Paragraph({ children: runs, heading: lvl }));
          break;
        }
        case 'blockquote':
          for (const c of node.content || []) blocks.push(...await toBlock(c, listLevel));
          break;
        case 'codeBlock': {
          const text = (node.content || []).map((n: any) => n.text || '').join('');
          blocks.push(new Paragraph({ children: [new TextRun({ text, font: 'Courier New' })] }));
          break;
        }
        case 'bulletList':
        case 'orderedList':
          for (const item of node.content || []) blocks.push(...await toBlock(item, listLevel));
          break;
        case 'listItem': {
          const para = node.content?.find((c: any) => c.type === 'paragraph');
          const runs: any[] = [];
          for (const c of para?.content || []) runs.push(...await toInline(c));
          blocks.push(new Paragraph({ children: runs.length ? runs : [new TextRun('')], bullet: { level: listLevel } }));
          // nested lists
          for (const c of node.content || []) {
            if (c.type === 'bulletList' || c.type === 'orderedList') {
              blocks.push(...await toBlock(c, listLevel + 1));
            }
          }
          break;
        }
        case 'drawio': {
          const svg = node.attrs?.svg;
          if (svg) {
            const result = await svgToPngBuffer(svg);
            if (result) {
              blocks.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: result.buf, transformation: scale(result.w, result.h) })] }));
            } else {
              blocks.push(new Paragraph({ children: [new TextRun({ text: '[diagram]', italics: true })] }));
            }
          }
          break;
        }
        default:
          for (const c of node.content || []) blocks.push(...await toBlock(c, listLevel));
          break;
      }
      return blocks;
    }

    const bodyElems: any[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
    for (const node of json.content || []) {
      bodyElems.push(...await toBlock(node));
    }

    const blob = await Packer.toBlob(new Document({ sections: [{ children: bodyElems }] }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title}.docx`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportAsMarkdown() {
    showExportMenu = false;
    const html = editorRef?.getHTML() || '';
    const md = htmlToMarkdown(html, doc?.title || '');
    download(md, `${doc?.title || 'note'}.md`, 'text/markdown');
  }

  function exportAsText() {
    showExportMenu = false;
    const title = doc?.title || 'Untitled';
    const body = editorRef?.getText() || '';
    download(`${title}\n${'='.repeat(title.length)}\n\n${body}`, `${title}.txt`, 'text/plain');
  }

  function download(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function htmlToMarkdown(html: string, title: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    let md = `# ${title}\n\n`;

    function processNode(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const inner = () => Array.from(el.childNodes).map(processNode).join('');

      switch (tag) {
        case 'h1': return `# ${inner()}\n\n`;
        case 'h2': return `## ${inner()}\n\n`;
        case 'h3': return `### ${inner()}\n\n`;
        case 'h4': return `#### ${inner()}\n\n`;
        case 'p':  return `${inner()}\n\n`;
        case 'strong': case 'b': return `**${inner()}**`;
        case 'em': case 'i': return `*${inner()}*`;
        case 'u': return `<u>${inner()}</u>`;
        case 's': return `~~${inner()}~~`;
        case 'code': return tag === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre'
          ? `\`${inner()}\`` : inner();
        case 'pre': return `\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
        case 'blockquote': return `> ${inner().replace(/\n/g, '\n> ')}\n\n`;
        case 'ul': return Array.from(el.querySelectorAll(':scope > li'))
          .map(li => `- ${(li as HTMLElement).textContent?.trim() || ''}`).join('\n') + '\n\n';
        case 'ol': return Array.from(el.querySelectorAll(':scope > li'))
          .map((li, i) => `${i + 1}. ${(li as HTMLElement).textContent?.trim() || ''}`).join('\n') + '\n\n';
        case 'li': return inner();
        case 'a': return `[${inner()}](${el.getAttribute('href') || ''})`;
        case 'img': return `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})\n\n`;
        case 'hr': return `---\n\n`;
        case 'br': return '\n';
        case 'table': {
          const rows = Array.from(el.querySelectorAll('tr'));
          if (!rows.length) return '';
          const header = Array.from(rows[0].querySelectorAll('th,td'))
            .map(c => (c as HTMLElement).textContent?.trim() || '');
          let t = `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n`;
          for (const row of rows.slice(1)) {
            const cells = Array.from(row.querySelectorAll('td'))
              .map(c => (c as HTMLElement).textContent?.trim() || '');
            t += `| ${cells.join(' | ')} |\n`;
          }
          return t + '\n';
        }
        default: return inner();
      }
    }

    md += Array.from(div.childNodes).map(processNode).join('');
    return md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // ── Resizable AI panel ────────────────────────────────────────────────────
  const AI_MIN = 260;
  const AI_MAX = 680;
  const EDITOR_MIN = 320;
  let aiPanelWidth = parseInt(localStorage.getItem('notes_ai_w') || '340');
  let resizingAI = false;
  let resizeStartX = 0;
  let resizeStartW = 0;
  let isMobile = false;

  function checkMobile() { isMobile = window.innerWidth <= 768; }

  function startAIResize(e: MouseEvent) {
    if (isMobile) return;
    e.preventDefault();
    resizingAI = true;
    resizeStartX = e.clientX;
    resizeStartW = aiPanelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onAIMouseMove(e: MouseEvent) {
    if (!resizingAI) return;
    const delta = resizeStartX - e.clientX;
    const maxW = Math.min(AI_MAX, window.innerWidth - EDITOR_MIN - 260);
    aiPanelWidth = Math.max(AI_MIN, Math.min(maxW, resizeStartW + delta));
  }

  function stopAIResize() {
    if (!resizingAI) return;
    resizingAI = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('notes_ai_w', String(aiPanelWidth));
  }
  let showWikiLinkPicker = false;
  let wikiLinkQuery = '';
  let wikiLinkResults: any[] = [];
  let wikiLinkPickerPos = { top: 0, left: 0 };
  let isAutoTriggeredWikiPicker = false;
  let wikiLinkDebounceTimeout: any;
  let editingTitle = false;
  let titleInput = '';
  let saveTimeout: any;
  let contentText = '';
  let wordCount = 0;
  let diagramsXml = '';

  function svgToLabels(svg: string): string[] {
    if (!svg) return [];
    try {
      let text = '';
      if (svg.startsWith('data:image/svg+xml;base64,')) {
        text = atob(svg.slice('data:image/svg+xml;base64,'.length));
      } else if (svg.startsWith('data:image/svg+xml,')) {
        text = decodeURIComponent(svg.slice('data:image/svg+xml,'.length));
      } else if (svg.startsWith('<svg')) {
        text = svg;
      }
      if (!text) return [];
      const labels: string[] = [];
      const re = /<text[^>]*>([\s\S]*?)<\/text>/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const t = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
        if (t) labels.push(t);
      }
      return [...new Set(labels)];
    } catch { return []; }
  }

  function extractDiagramsFromJson(json: any): string {
    const parts: string[] = [];
    let idx = 1;
    function walk(node: any) {
      if (!node) return;
      if (node.type === 'drawio') {
        const labels = svgToLabels(node.attrs?.svg || '');
        if (labels.length) {
          parts.push(`Diagram ${idx}: contains elements: ${labels.join(', ')}`);
        } else if (node.attrs?.xml) {
          parts.push(`Diagram ${idx}: (no labels extracted)`);
        }
        idx++;
      }
      if (node.content) node.content.forEach(walk);
    }
    walk(json);
    return parts.join('\n');
  }

  function getLiveDiagramXml(): string {
    if (editorRef) {
      try {
        const live = extractDiagramsFromJson(editorRef.getJSON());
        if (live) return live;
      } catch {}
    }
    return diagramsXml;
  }
  let lastSaved = new Date();
  let hasUnsaved = false;
  let ragStatusMsg = '';
  let ragStatusTimer: any;

  // Keyboard shortcut state
  let searchOpen = false;

  onMount(async () => {
    checkMobile();
    window.addEventListener('resize', checkMobile);

    try {
      doc = await loadDocument(docId);
      titleInput = doc.title;
      showAIPanel = $settings.show_ai_panel;
      diagramsXml = extractDiagramsFromJson(doc.content);
      // Update tab with loaded document info (title and icon)
      updateTab(docId, { title: doc.title, icon: doc.icon || 'bi-file-text' });
    } catch {
      navigate('/');
    } finally {
      loading = false;
    }

    // Global keyboard shortcuts
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', checkMobile);
    };
  });

  onDestroy(() => {
    clearTimeout(saveTimeout);
    window.removeEventListener('keydown', handleKeyDown);
  });

  function closeWikiLinkPicker() {
    showWikiLinkPicker = false;
    isAutoTriggeredWikiPicker = false;
    wikiLinkQuery = '';
    wikiLinkResults = [];
    editorRef?.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    const isMac = navigator.platform.includes('Mac');
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    if (ctrl && e.key === 's') {
      e.preventDefault();
      saveNow();
    }
    if (ctrl && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      settings.update(s => ({ ...s, editor_font_size: Math.min((s.editor_font_size || 16) + 2, 32) }));
    }
    if (ctrl && e.key === '-') {
      e.preventDefault();
      settings.update(s => ({ ...s, editor_font_size: Math.max((s.editor_font_size || 16) - 2, 12) }));
    }
    if (ctrl && e.key === '0') {
      e.preventDefault();
      settings.update(s => ({ ...s, editor_font_size: 16 }));
    }
    if (ctrl && e.shiftKey && e.key === 'k') {
      e.preventDefault();
      searchOpen = !searchOpen;
    }
    if (e.key === 'Escape') {
      if (showWikiLinkPicker && isAutoTriggeredWikiPicker) {
        e.preventDefault();
        closeWikiLinkPicker();
      } else {
        editingTitle = false;
      }
    }
  }

  async function handleApplyTags(e: CustomEvent) {
    const { tags: tagNames } = e.detail; // string[]
    if (!tagNames?.length || !doc) return;
    try {
      // Fetch existing tags for this workspace
      const { tags: existing } = await tagApi.list(doc.workspace_id);
      const existingMap = Object.fromEntries((existing || []).map((t: any) => [t.name.toLowerCase(), t.id]));

      const tagIds: string[] = [];
      for (const name of tagNames) {
        const key = name.toLowerCase();
        if (existingMap[key]) {
          tagIds.push(existingMap[key]);
        } else {
          // Create new tag
          const { tag } = await tagApi.create({ workspace_id: doc.workspace_id, name, color: '#132578' });
          if (tag?.id) tagIds.push(tag.id);
        }
      }
      await tagApi.setDocumentTags(docId, tagIds);
    } catch (err: any) {
      console.error('[applyTags]', err.message);
    }
  }

  let transcriptSessionOpen = false;

  function handleRecordingStart() {
    transcriptSessionOpen = false;
  }

  function handleTranscribed(e: CustomEvent) {
    const { text, diarized } = e.detail;
    if (!text || !editorRef) return;

    const innerHtml = diarized
      ? text.split('\n')
          .filter((line: string) => line.trim())
          .map((line: string) => `<p>${line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>`)
          .join('')
      : text.split('\n')
          .filter((line: string) => line.trim())
          .map((line: string) => `<p><em>${line}</em></p>`)
          .join('');

    // First chunk: add heading + blockquote; subsequent chunks: just content
    const html = !transcriptSessionOpen
      ? `<h2>Transkrip</h2><blockquote>${innerHtml}</blockquote>`
      : `<blockquote>${innerHtml}</blockquote>`;
    transcriptSessionOpen = true;

    const editor = editorRef.getEditor();
    if (editor) {
      editor.chain().focus().insertContentAt(editor.state.doc.content.size, html).run();
    } else {
      editorRef.insertContent(html);
    }
  }

  function onEditorCreated(editor: any) {
    // Imported docs: content JSON is empty but content_html has parsed content.
    // Atom nodes (drawio, images) have no .content — only treat as empty when there is
    // no non-paragraph node AND no paragraph with actual text content.
    const nodes = doc?.content?.content ?? [];
    const hasContent = nodes.some((n: any) =>
      n.type !== 'paragraph' || (n.content?.length ?? 0) > 0
    );
    if (!hasContent && doc?.content_html) {
      editor.commands.setContent(doc.content_html, false);
    }
  }

  function onEditorUpdate(e: CustomEvent) {
    const { json, html, text, wordCount: wc } = e.detail;
    contentText = text;
    wordCount = wc;
    diagramsXml = extractDiagramsFromJson(json);
    hasUnsaved = true;

    clearTimeout(wikiLinkDebounceTimeout);
    wikiLinkDebounceTimeout = setTimeout(() => {
      detectWikiLinkPattern();
    }, 100);

    if (!$settings.auto_save) return;

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      autoSave(json, html, text);
    }, ($settings.auto_save_interval_seconds || 3) * 1000);
  }

  async function autoSave(json: any, html: string, text: string) {
    if (!doc || saving) return;
    saving = true;
    savingDoc = true;
    try {
      await saveDocument(docId, {
        content: json,
        content_html: html,
        content_text: text,
        reindex: false   // auto-save: skip RAG re-indexing
      });
      lastSaved = new Date();
      hasUnsaved = false;
      // Sync wikilinks in background
      const linkedIds = extractWikiLinkIds(json);
      linksApi.syncLinks(docId, linkedIds).catch(() => {});
    } finally {
      saving = false;
      savingDoc = false;
    }
  }

  // WikiLink picker
  async function searchWikiLinks(q: string) {
    if (!doc?.workspace_id) { wikiLinkResults = []; return; }
    // Fetch documents from all workspaces
    import('../lib/api').then(async ({ documentApi: da, workspaceApi: wa }) => {
      try {
        // Get all workspaces
        const { workspaces } = await wa.list();
        const allResults: any[] = [];

        // Fetch documents from each workspace
        for (const ws of workspaces || []) {
          try {
            const { documents: docs } = await da.list(ws.id);
            if (docs) {
              docs.forEach((d: any) => {
                if (d.id !== docId) {
                  allResults.push({
                    ...d,
                    workspace_name: ws.name,
                    workspace_id: ws.id
                  });
                }
              });
            }
          } catch {}
        }

        // Filter by query if provided
        let results = allResults;
        if (q.trim()) {
          results = results.filter((d: any) =>
            d.title?.toLowerCase().includes(q.toLowerCase())
          );
        }

        wikiLinkResults = results.slice(0, 15); // Limit to 15 results
      } catch {
        wikiLinkResults = [];
      }
    });
  }

  function detectWikiLinkPattern() {
    if (!editorInstance) return;
    const { $from } = editorInstance.state.selection;
    const start = Math.max(0, $from.pos - 100);
    const textBefore = editorInstance.state.doc.textBetween(start, $from.pos);
    const match = textBefore.match(/\[\[([^\[\]]*?)$/);

    if (match) {
      const query = match[1];
      showWikiLinkPicker = true;
      isAutoTriggeredWikiPicker = true;
      wikiLinkQuery = query;
      searchWikiLinks(query);

      try {
        const bracketPos = $from.pos - match[0].length;
        const coords = editorInstance.view.coordsAtPos(bracketPos);
        wikiLinkPickerPos = {
          top: coords.top + 24,
          left: Math.max(8, coords.left)
        };
      } catch {}
    } else {
      showWikiLinkPicker = false;
      isAutoTriggeredWikiPicker = false;
      wikiLinkQuery = '';
      wikiLinkResults = [];
    }
  }

  function insertWikiLink(target: any) {
    if (!editorInstance) return;
    const { $from } = editorInstance.state.selection;
    const start = Math.max(0, $from.pos - 100);
    const textBefore = editorInstance.state.doc.textBetween(start, $from.pos);
    const match = textBefore.match(/\[\[([^\[\]]*?)$/);

    if (match) {
      const queryLength = match[0].length;
      editorInstance.chain()
        .focus()
        .deleteRange({ from: $from.pos - queryLength, to: $from.pos })
        .insertContent({
          type: 'wikiLink',
          attrs: { docId: target.id, label: target.title }
        })
        .run();
    } else {
      editorInstance.chain().focus().insertContent({
        type: 'wikiLink',
        attrs: { docId: target.id, label: target.title }
      }).run();
    }

    closeWikiLinkPicker();
  }

  function showRagStatus(rag: any) {
    clearTimeout(ragStatusTimer);
    if (!rag) { ragStatusMsg = ''; return; }

    const model = $settings.embedding_model || 'openai/text-embedding-ada-002';
    const modelShort = model.includes('/') ? model.split('/').pop() : model;
    const embLabel = `[${modelShort}]`;

    if (rag.status === 'indexing')       ragStatusMsg = `🔍 RAG: indexing… ${embLabel}`;
    else if (rag.reason === 'unchanged') ragStatusMsg = `✓ RAG: no changes ${embLabel}`;
    else if (rag.reason === 'cooldown')  ragStatusMsg = `⏳ RAG: cooldown ${rag.remainMin ?? ''}min ${embLabel}`;
    else if (rag.reason === 'too_short') ragStatusMsg = `— RAG: content too short`;
    else                                 ragStatusMsg = '';

    ragStatusTimer = setTimeout(() => ragStatusMsg = '', 5000);
  }

  async function saveNow() {
    if (!editorRef || !doc) return;
    savingDoc = true;
    saving = true;
    try {
      const result = await saveDocument(docId, {
        content: editorRef.getJSON(),
        content_html: editorRef.getHTML(),
        content_text: editorRef.getText(),
        reindex: true
      });
      showRagStatus((result as any)?._rag);
      // Save version checkpoint
      await documentApi.saveVersion(docId, {
        title: doc.title,
        content: editorRef.getJSON(),
        content_text: editorRef.getText(),
        content_html: editorRef.getHTML(),
        change_summary: 'Manual save'
      });
      lastSaved = new Date();
      hasUnsaved = false;
    } finally {
      saving = false;
      savingDoc = false;
    }
  }

  async function saveTitle() {
    if (!doc || !titleInput.trim()) return;
    await saveDocument(docId, { title: titleInput });
    doc = { ...doc, title: titleInput };
    editingTitle = false;
  }

  function extractExcerpt(): string {
    // Walk ProseMirror doc to find first non-empty paragraph
    let firstPara = '';
    if (editorInstance) {
      editorInstance.state.doc.descendants((node: any) => {
        if (firstPara) return false;
        if (node.type.name === 'paragraph' && node.textContent.trim()) {
          firstPara = node.textContent.trim();
          return false;
        }
      });
    }
    if (!firstPara) {
      // Fallback: parse content JSON directly
      for (const node of doc?.content?.content || []) {
        if (node.type === 'paragraph' && node.content?.length) {
          const t = node.content.map((n: any) => n.text || '').join('').trim();
          if (t) { firstPara = t; break; }
        }
      }
    }
    if (!firstPara || firstPara.length <= 200) return firstPara;
    const cut = firstPara.slice(0, 200);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  function openPublishModal() {
    publishSlug = doc?.public_slug || slugify(doc?.title || 'untitled');
    publishExcerpt = doc?.excerpt || extractExcerpt();
    showPublishModal = true;
  }

  function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'untitled';
  }

  async function publishDoc() {
    if (!doc || publishing) return;
    publishing = true;
    try {
      const slug = publishSlug.trim() || slugify(doc.title || 'untitled');
      await saveDocument(docId, {
        is_public: true,
        published_at: doc.published_at || new Date().toISOString(),
        public_slug: slug,
        excerpt: publishExcerpt.trim() || null
      });
      doc = { ...doc, is_public: true, published_at: doc.published_at || new Date().toISOString(), public_slug: slug, excerpt: publishExcerpt.trim() || null };
      showPublishModal = false;
    } finally {
      publishing = false;
    }
  }

  async function unpublishDoc() {
    if (!doc || publishing) return;
    publishing = true;
    try {
      await saveDocument(docId, { is_public: false, published_at: null });
      doc = { ...doc, is_public: false, published_at: null };
    } finally {
      publishing = false;
    }
  }

  function handleInsertContent(e: CustomEvent) {
    const content = e.detail.content;
    const editor = editorRef?.getEditor();
    if (!content) return;

    // If content is already HTML (from parseMarkdown), insert at cursor position
    if (content.trim().startsWith('<') && editor) {
      editor.chain().focus().insertContent(content).run();
    } else {
      // Plain text fallback
      editorRef?.insertContent(`<p>${content.replace(/\n/g, '</p><p>')}</p>`);
    }
  }

  function handleReplaceContent(e: CustomEvent) {
    const text = e.detail.content;
    editorRef?.setContent(text);
  }

  function handleInsertDiagram(e: CustomEvent) {
    const xml = e.detail.xml;
    const editor = editorRef?.getEditor();
    if (!xml || !editor) return;
    editor.chain().focus().insertContent({ type: 'drawio', attrs: { xml, svg: '' } }).run();
  }

  async function handleVersionRestore(e: CustomEvent) {
    const restoredDoc = e.detail.document;
    editorRef?.setContent(restoredDoc.content);
    doc = restoredDoc;
    showVersionPanel = false;
  }

  function formatLastSaved(d: Date) {
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 10) return 'Just saved';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  $: showAIPanel = showAIPanel && !showVersionPanel;
</script>

<svelte:head>
  <title>Svaramind</title>
</svelte:head>

<svelte:window on:mousemove={onAIMouseMove} on:mouseup={stopAIResize} />

<NotesLayout currentPage="editor">
  <NoteTabBar />
  <div class="editor-page">
    {#if loading}
      <div class="editor-loading">
        <div class="spinner-sm" style="width:28px;height:28px;border-width:3px"></div>
      </div>
    {:else if doc}
      <!-- Top bar -->
      <div class="editor-topbar">
        <!-- Breadcrumb -->
        <div class="editor-breadcrumb">
          <button class="breadcrumb-btn" on:click={() => { activeTabId.set(null); navigate('/'); }}>
            <i class="bi bi-chevron-left"></i>
          </button>
          <i class="bi bi-chevron-right breadcrumb-sep"></i>
          {#if doc.folder_id}
            <button class="breadcrumb-btn">Folder</button>
            <i class="bi bi-chevron-right breadcrumb-sep"></i>
          {/if}
          <span class="breadcrumb-current">{doc.title}</span>
        </div>

        <!-- Actions -->
        <div class="editor-actions">
          <!-- Save status -->
          <span class="save-status">
            {#if savingDoc}
              <span class="spinner-sm" style="width:12px;height:12px;border-width:2px"></span> Saving...
            {:else if hasUnsaved}
              <i class="bi bi-circle" style="color:var(--warning-color)"></i> Unsaved
            {:else}
              <i class="bi bi-check-circle" style="color:var(--success-color)"></i>
              {formatLastSaved(lastSaved)}
            {/if}
          </span>
          {#if ragStatusMsg}
            <span class="rag-status">{ragStatusMsg}</span>
          {/if}

          <!-- Save button -->
          <button
            class="save-btn {hasUnsaved ? 'save-btn-active' : ''}"
            on:click={saveNow}
            disabled={savingDoc}
            title="Save & create version checkpoint (⌘S)">
            {#if savingDoc}
              <span class="spinner-sm" style="width:11px;height:11px;border-width:2px"></span>
            {:else}
              <i class="bi bi-floppy"></i>
            {/if}
            <span class="save-btn-label">Save</span>
          </button>

          <!-- Word count (hidden on mobile) -->
          {#if $settings.show_word_count}
            <span class="word-count hide-mobile">{wordCount} words</span>
          {/if}

          <!-- WikiLink picker trigger (hidden on mobile) -->
          <div class="wikilink-wrapper hide-mobile">
            <button class="editor-action-btn"
              on:click={() => { showWikiLinkPicker = !showWikiLinkPicker; isAutoTriggeredWikiPicker = false; wikiLinkQuery = ''; searchWikiLinks(''); }}
              title="Insert [[wikilink]]">
              <i class="bi bi-link-45deg"></i>
              <span style="font-size:10px;margin-left:1px">[[</span>
            </button>
            {#if showWikiLinkPicker && !isAutoTriggeredWikiPicker}
              <div class="wikilink-dropdown">
                <input class="notes-input" bind:value={wikiLinkQuery}
                  on:input={() => searchWikiLinks(wikiLinkQuery)}
                  placeholder="Search notes to link..." autofocus style="height:32px;font-size:12px" />
                {#if wikiLinkResults.length > 0}
                  <div class="wikilink-results">
                    {#each wikiLinkResults as result}
                      <button class="wikilink-result" on:click={() => insertWikiLink(result)} title={result.title}>
                        <i class="bi {result.icon || 'bi-file-text'}"></i>
                        <div class="wikilink-result-info">
                          <span class="wikilink-result-title">{result.title || 'Untitled'}</span>
                          {#if result.workspace_name}
                            <span class="wikilink-result-workspace">{result.workspace_name}</span>
                          {/if}
                        </div>
                      </button>
                    {/each}
                  </div>
                {:else if wikiLinkQuery}
                  <p class="wikilink-empty">No notes found</p>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Auto-triggered floating wiki link picker (when user types [[) -->
          {#if showWikiLinkPicker && isAutoTriggeredWikiPicker && wikiLinkQuery !== '' && (wikiLinkPickerPos.left > 0 || wikiLinkPickerPos.top > 0)}
            <div class="wikilink-floating" style="top:{wikiLinkPickerPos.top}px;left:{wikiLinkPickerPos.left}px">
              <div class="wikilink-floating-header">
                <span class="wikilink-query-text">[[{wikiLinkQuery}</span>
                <button class="wikilink-close-btn" on:click={closeWikiLinkPicker} title="Close (Esc)">
                  <i class="bi bi-x"></i>
                </button>
              </div>
              {#if wikiLinkResults.length > 0}
                <div class="wikilink-results">
                  {#each wikiLinkResults as result}
                    <button class="wikilink-result" on:click={() => insertWikiLink(result)} title={result.title}>
                      <i class="bi {result.icon || 'bi-file-text'}"></i>
                      <div class="wikilink-result-info">
                        <span class="wikilink-result-title">{result.title || 'Untitled'}</span>
                        {#if result.workspace_name}
                          <span class="wikilink-result-workspace">{result.workspace_name}</span>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              {:else if wikiLinkQuery}
                <p class="wikilink-empty">No notes found</p>
              {/if}
            </div>
          {/if}

          <!-- Version history (hidden on mobile) -->
          <button class="editor-action-btn hide-mobile {showVersionPanel ? 'active' : ''}" on:click={() => { showVersionPanel = !showVersionPanel; showAIPanel = false; }} title="Version history">
            <i class="bi bi-clock-history"></i>
          </button>

          <!-- Export dropdown (hidden on mobile) -->
          <div class="export-wrap hide-mobile">
            <button class="editor-action-btn" on:click={() => showExportMenu = !showExportMenu} title="Export">
              <i class="bi bi-download"></i>
            </button>
            {#if showExportMenu}
              <div class="export-dropdown">
                <button class="export-item" on:click={exportAsPDF}>
                  <i class="bi bi-file-earmark-pdf"></i> Export as PDF
                </button>
                <button class="export-item" on:click={exportAsWord}>
                  <i class="bi bi-file-earmark-word"></i> Export as Word
                </button>
                <button class="export-item" on:click={exportAsMarkdown}>
                  <i class="bi bi-markdown"></i> Export as Markdown
                </button>
                <button class="export-item" on:click={exportAsText}>
                  <i class="bi bi-file-earmark-text"></i> Export as Plain Text
                </button>
              </div>
            {/if}
          </div>

          <!-- Publish button -->
          {#if doc.published_at}
            <button class="publish-btn published hide-mobile" on:click={unpublishDoc} disabled={publishing} title="Unpublish">
              {#if publishing}
                <span class="spinner-sm" style="width:11px;height:11px;border-width:2px"></span>
              {:else}
                <i class="bi bi-globe2"></i>
              {/if}
              <span class="publish-btn-label">Published</span>
            </button>
          {:else}
            <button class="publish-btn hide-mobile" on:click={openPublishModal} disabled={publishing} title="Publish to blog">
              <i class="bi bi-send"></i>
              <span class="publish-btn-label">Publish</span>
            </button>
          {/if}

          <button class="editor-action-btn" on:click={() => showShareModal = true} title="Share">
            <i class="bi bi-share"></i>
          </button>
          <button class="editor-action-btn {showAIPanel ? 'active' : ''}" on:click={() => { showAIPanel = !showAIPanel; showVersionPanel = false; }} title="AI Assistant">
            <i class="bi bi-stars"></i>
          </button>
          <button class="editor-action-btn" on:click={toggleToolbar} title={toolbarCollapsed ? 'Show toolbar' : 'Hide toolbar'}>
            <i class="bi {toolbarCollapsed ? 'bi-chevron-bar-down' : 'bi-chevron-bar-up'}"></i>
          </button>
        </div>
      </div>

      <!-- ── Toolbar: outside scroll container so it's always visible ──
           VoiceRecorder lives inside EditorToolbar now so it wraps as part
           of the same flow instead of floating next to it. -->
      {#if !toolbarCollapsed}
        <EditorToolbar
          editor={editorInstance}
          {savingDoc}
          lineHeight={$settings.editor_line_height}
          fontSize={$settings.editor_font_size}
          on:toggleAI={() => { showAIPanel = !showAIPanel; showVersionPanel = false; }}
          on:lineHeightChange={(e) => { settings.update(s => ({ ...s, editor_line_height: e.detail })); }}
          on:fontSizeChange={(e) => { settings.update(s => ({ ...s, editor_font_size: e.detail })); }}
          on:recordingStart={handleRecordingStart}
          on:transcribed={handleTranscribed}
        />
      {/if}

      <!-- Editor layout -->
      <div class="editor-layout">
        <!-- Editor column: main scroll area + backlinks -->
        <div class="editor-col">
        <div class="editor-main">
          <!-- Cover image -->
          {#if doc.cover_image}
            <div class="cover-image" style="background-image:url({doc.cover_image})"></div>
          {/if}

          <!-- Document header — single compact row -->
          <div class="doc-header" style="font-family:{$settings.editor_font}">
            <div class="doc-title-row">
              <i class="bi {doc.icon} doc-icon-sm" title="Document icon"></i>

              {#if editingTitle}
                <form class="title-form" on:submit|preventDefault={saveTitle}>
                  <input
                    class="title-input"
                    bind:value={titleInput}
                    on:blur={saveTitle}
                    autofocus
                    style="font-family:{$settings.editor_font}"
                    placeholder="Untitled"
                  />
                </form>
              {:else}
                <h1
                  class="doc-title"
                  on:click={() => { editingTitle = true; titleInput = doc.title; }}
                  title="Click to edit title"
                >{doc.title || 'Untitled'}</h1>
              {/if}

              <button class="add-cover-btn" on:click={() => {
                const url = prompt('Cover image URL:');
                if (url) saveDocument(docId, { cover_image: url });
              }} title="Add cover image">
                <i class="bi bi-image"></i>
              </button>
            </div>
          </div>

          <!-- Draw.io section -->
          <!-- Rich text editor (bubble toolbar is built-in) -->
          <RichTextEditor
            bind:this={editorRef}
            content={doc.content}
            font={$settings.editor_font}
            fontSize={$settings.editor_font_size}
            lineHeight={$settings.editor_line_height}
            on:update={onEditorUpdate}
            on:created={(e) => {
              editorInstance = e.detail.editor;
              onEditorCreated(e.detail.editor);
            }}
            on:selectionUpdate={(e) => editorInstance = e.detail.editor}
          />
        </div>

        <!-- Backlinks: inside editor-col, outside scroll -->
        <BacklinksPanel documentId={docId} />
        </div><!-- end editor-col -->

        <!-- AI resize handle (desktop only) -->
        {#if showAIPanel && !isMobile}
          <div
            class="ai-resize-handle {resizingAI ? 'active' : ''}"
            on:mousedown={startAIResize}
            title="Drag to resize"
          ></div>
        {/if}

        <!-- Desktop: side panel; Mobile: bottom sheet (always mounted, hidden when closed) -->
        <div
          class="ai-panel-container"
          class:ai-panel-mobile={isMobile}
          class:hidden={!showAIPanel}
          style={isMobile ? '' : `width:${aiPanelWidth}px;min-width:${aiPanelWidth}px`}
        >
          {#if isMobile}
            <button class="ai-bottom-sheet-handle" on:click={() => showAIPanel = false} aria-label="Close AI panel"></button>
          {/if}
          <AIAssistantPanel
            document={doc}
            {contentText}
            {diagramsXml}
            getDiagramXml={getLiveDiagramXml}
            on:close={() => showAIPanel = false}
            on:insertContent={handleInsertContent}
            on:replaceContent={handleReplaceContent}
            on:insertDiagram={handleInsertDiagram}
            on:applyTags={handleApplyTags}
          />
        </div>

        {#if showVersionPanel && !isMobile}
          <VersionHistoryPanel
            documentId={docId}
            visible={showVersionPanel}
            on:close={() => showVersionPanel = false}
            on:restore={handleVersionRestore}
          />
        {/if}
      </div>
    {/if}

    <!-- Share Modal -->
    {#if showShareModal}
      <ShareModal
        documentId={docId}
        documentTitle={doc?.title || ''}
        on:close={() => showShareModal = false}
      />
    {/if}

    <!-- Publish Modal -->
    {#if showPublishModal}
      <div class="publish-overlay" role="dialog" aria-modal="true">
        <div class="publish-modal">
          <div class="publish-modal-header">
            <h3 class="publish-modal-title">Publish to Blog</h3>
            <button class="publish-modal-close" on:click={() => showPublishModal = false}>
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <div class="publish-modal-body">
            <label class="publish-label">
              URL slug
              <input
                class="notes-input publish-input"
                bind:value={publishSlug}
                placeholder="my-article-slug"
                spellcheck="false"
              />
              <span class="publish-input-hint">/{publishSlug || 'slug'}</span>
            </label>

            <label class="publish-label">
              Excerpt <span class="publish-optional">(optional)</span>
              <textarea
                class="notes-input publish-input"
                bind:value={publishExcerpt}
                rows="3"
                placeholder="Short description shown in article list…"
              ></textarea>
            </label>
          </div>

          <div class="publish-modal-footer">
            <button class="notes-btn notes-btn-ghost" on:click={() => showPublishModal = false}>Cancel</button>
            <button class="notes-btn notes-btn-primary" on:click={publishDoc} disabled={publishing || !publishSlug.trim()}>
              {#if publishing}
                <span class="spinner-sm" style="width:11px;height:11px;border-width:2px;border-top-color:#fff"></span>
              {/if}
              Publish
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</NotesLayout>

<style>
  .editor-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .editor-topbar {
    height: var(--header-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-primary);
    flex-shrink: 0;
  }

  .editor-breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .breadcrumb-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .breadcrumb-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .breadcrumb-sep { color: var(--text-muted); font-size: 10px; }
  .breadcrumb-current { color: var(--text-secondary); font-size: 13px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .editor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .save-status {
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .rag-status {
    font-size: 11px;
    color: var(--text-muted);
    opacity: 0.8;
    padding: 2px 6px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    white-space: nowrap;
  }

  .save-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .save-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .save-btn.save-btn-active {
    border-color: var(--accent-color);
    color: var(--accent-color);
    background: var(--bg-active);
  }
  .save-btn:disabled { opacity: 0.6; cursor: default; }

  .word-count {
    font-size: 12px;
    color: var(--text-muted);
    padding: 2px 8px;
    background: var(--bg-secondary);
    border-radius: 10px;
  }

  .export-wrap { position: relative; }
  .export-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    z-index: 100;
    min-width: 180px;
    overflow: hidden;
    animation: fadeIn 0.15s ease;
  }
  .export-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 14px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary);
    text-align: left;
    transition: background 0.1s;
  }
  .export-item:hover { background: var(--bg-hover); }

  .wikilink-wrapper { position: relative; }

  .wikilink-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 260px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    z-index: 100;
    padding: 8px;
    animation: fadeIn 0.15s ease;
  }

  .wikilink-results { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }

  .wikilink-result {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px; border: none; border-radius: 4px;
    background: none; cursor: pointer; text-align: left;
    font-size: 13px; color: var(--text-primary); width: 100%;
    transition: background 0.1s;
    min-width: 0;
  }
  .wikilink-result:hover { background: var(--bg-hover); color: var(--accent-color); }

  .wikilink-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .wikilink-result-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wikilink-result-workspace {
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wikilink-empty { font-size: 12px; color: var(--text-muted); padding: 6px 4px; margin: 0; }

  .wikilink-floating {
    position: fixed;
    width: 260px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    z-index: 1000;
    padding: 8px;
    animation: fadeIn 0.15s ease;
    max-height: 300px;
    overflow-y: auto;
  }

  .wikilink-floating-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 6px;
    padding: 4px 6px;
    background: var(--bg-secondary);
    border-radius: 4px;
    font-size: 12px;
  }

  .wikilink-query-text {
    flex: 1;
    color: var(--text-muted);
    font-family: monospace;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wikilink-close-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .wikilink-close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .editor-action-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.15s;
  }
  .editor-action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .editor-action-btn.active { background: var(--bg-active); color: var(--accent-color); }

  .editor-layout {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  /* editor-col: contains scrollable editor + backlinks, both only span editor area */
  .editor-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    min-width: 0;
  }

  /* AI panel resize handle */
  .ai-resize-handle {
    width: 4px;
    height: 100%;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    position: relative;
    z-index: 10;
    transition: background 0.15s;
  }
  .ai-resize-handle::after {
    content: '';
    position: absolute;
    inset: 0;
    width: 8px;
    left: -2px;
  }
  .ai-resize-handle:hover,
  .ai-resize-handle.active {
    background: var(--accent-color);
  }

  .cover-image {
    height: 200px;
    background-size: cover;
    background-position: center;
    flex-shrink: 0;
  }

  .doc-header {
    padding: 16px 64px 0;
    width: 100%;
  }

  .doc-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .doc-icon-sm {
    font-size: 1.1rem;
    color: var(--accent-color);
    flex-shrink: 0;
    opacity: 0.8;
  }

  .title-form { flex: 1; min-width: 0; }

  .title-input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text-primary);
    padding: 4px 0;
    line-height: 1.3;
  }

  .doc-title {
    flex: 1;
    font-size: 1.35rem;
    font-weight: 700;
    line-height: 1.3;
    margin: 0;
    cursor: text;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 0;
    min-width: 0;
  }

  .add-cover-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-muted);
    padding: 4px 6px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }

  .doc-header:hover .add-cover-btn { opacity: 1; }
  .add-cover-btn:hover { background: var(--bg-hover); color: var(--accent-color); }

  .drawio-section {
    padding: 0 64px;
    width: 100%;
  }

  /* AI panel container (desktop side panel) */
  .ai-panel-container {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  .ai-panel-container.hidden {
    display: none;
  }

  /* AI bottom sheet (mobile) */
  .ai-panel-mobile {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60vh;
    z-index: 100;
    border-top: 1px solid var(--border-color);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
    background: var(--bg-primary);
    width: auto !important;
    min-width: unset !important;
    flex-shrink: unset;
  }

  .ai-bottom-sheet-handle {
    width: 40px;
    height: 4px;
    background: var(--border-color);
    border-radius: 2px;
    margin: 10px auto 6px;
    flex-shrink: 0;
    cursor: pointer;
    display: block;
    border: none;
    padding: 0;
  }

  /* Publish button */
  .publish-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--accent-color);
    background: var(--accent-color);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    font-family: inherit;
  }
  .publish-btn:hover { opacity: 0.85; }
  .publish-btn:disabled { opacity: 0.6; cursor: default; }
  .publish-btn.published {
    background: var(--success-color, #28a745);
    border-color: var(--success-color, #28a745);
  }
  .publish-btn-label { white-space: nowrap; }

  /* Publish modal */
  .publish-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .publish-modal {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md, 12px);
    width: 100%; max-width: 420px;
    box-shadow: var(--shadow-lg);
    display: flex; flex-direction: column;
  }
  .publish-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 0;
  }
  .publish-modal-title {
    font-size: 15px; font-weight: 700;
    color: var(--text-primary); margin: 0;
  }
  .publish-modal-close {
    width: 28px; height: 28px; border: none; background: none;
    cursor: pointer; color: var(--text-muted);
    display: flex; align-items: center; justify-content: center;
    border-radius: 4px; font-size: 14px;
  }
  .publish-modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
  .publish-modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
  .publish-label {
    display: flex; flex-direction: column; gap: 6px;
    font-size: 12px; font-weight: 600; color: var(--text-secondary);
  }
  .publish-optional { font-weight: 400; color: var(--text-muted); }
  .publish-input { font-size: 13px !important; }
  .publish-input-hint { font-size: 11px; color: var(--text-muted); font-family: monospace; }
  .publish-modal-footer {
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 12px 20px 18px;
    border-top: 1px solid var(--border-color);
  }
  .publish-modal-footer :global(.notes-btn) {
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
  }
  .publish-modal-footer :global(.notes-btn:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .publish-modal-footer :global(.notes-btn-ghost) {
    border: 1px solid var(--border-color);
  }

  @media (max-width: 768px) {
    .doc-header { padding: 16px 16px 0; }
    .drawio-section { padding: 0 16px; }
    .title-input { font-size: 1.2rem; }
    .doc-title { font-size: 1.2rem; }

    /* Topbar: compact, breadcrumb truncates */
    .editor-topbar {
      padding: 0 8px;
      height: 44px;
      gap: 4px;
    }

    .editor-breadcrumb {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    /* Hide home + chevron, show only title */
    .breadcrumb-btn, .breadcrumb-sep { display: none; }
    .breadcrumb-current {
      max-width: 100%;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    /* Actions: only keep save status + share + AI */
    .editor-actions { gap: 4px; }
    .save-status { font-size: 11px; }
    .save-btn-label { display: none; }
    .word-count { display: none; }
    .hide-mobile { display: none !important; }

    /* Toolbar: wrap */
    :global(.editor-toolbar) {
      flex-wrap: wrap !important;
      padding: 4px 6px !important;
      height: auto !important;
    }
  }
</style>
