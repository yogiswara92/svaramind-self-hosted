const { marked } = require('marked');

marked.setOptions({ gfm: true, breaks: false });

// Mirrors exactly what the Svaramind editor's TipTap schema supports (see
// notes/src/components/RichTextEditor.svelte extensions list). Anything
// markdown can express that the editor CAN'T render (H5/H6, footnotes,
// definition lists, syntax-highlighted code, …) is downgraded here rather
// than left for the editor to choke on.
const MAX_HEADING_LEVEL = 4;

function textNode(text, marks) {
  if (!text) return null;
  const node = { type: 'text', text };
  if (marks && marks.length) node.marks = marks;
  return node;
}

function inlineTokensToNodes(tokens, marks = []) {
  const nodes = [];
  for (const tok of tokens || []) {
    switch (tok.type) {
      case 'text':
      case 'escape': {
        const n = textNode(tok.text, marks);
        if (n) nodes.push(n);
        break;
      }
      case 'strong':
        nodes.push(...inlineTokensToNodes(tok.tokens, [...marks, { type: 'bold' }]));
        break;
      case 'em':
        nodes.push(...inlineTokensToNodes(tok.tokens, [...marks, { type: 'italic' }]));
        break;
      case 'del':
        nodes.push(...inlineTokensToNodes(tok.tokens, [...marks, { type: 'strike' }]));
        break;
      case 'codespan': {
        const n = textNode(tok.text, [...marks, { type: 'code' }]);
        if (n) nodes.push(n);
        break;
      }
      case 'link':
        nodes.push(...inlineTokensToNodes(tok.tokens, [...marks, { type: 'link', attrs: { href: tok.href, target: '_blank' } }]));
        break;
      case 'br':
        nodes.push({ type: 'hardBreak' });
        break;
      default: {
        // image/html/unrecognized inline token — degrade to its raw text
        // rather than silently dropping content.
        const fallback = tok.text || tok.raw;
        const n = textNode(fallback, marks);
        if (n) nodes.push(n);
      }
    }
  }
  return nodes;
}

function paragraphFromInline(tokens) {
  const content = inlineTokensToNodes(tokens);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

// A list item's .tokens holds nested block tokens. marked represents a
// "tight" item's own text as a bare {type:'text', tokens:[...inline]} rather
// than a full paragraph token — normalize that into one here.
function listItemContent(itemTokens) {
  const content = [];
  for (const t of itemTokens || []) {
    if (t.type === 'text' && t.tokens) {
      content.push(paragraphFromInline(t.tokens));
    } else if (t.type === 'list') {
      content.push(listToNode(t));
    } else {
      const mapped = blockTokenToNode(t);
      if (mapped) content.push(mapped);
    }
  }
  return content.length ? content : [{ type: 'paragraph' }];
}

function listToNode(tok) {
  const isTaskList = tok.items.length > 0 && tok.items.every((it) => it.task);
  if (isTaskList) {
    return {
      type: 'taskList',
      content: tok.items.map((item) => ({
        type: 'taskItem',
        attrs: { checked: !!item.checked },
        content: listItemContent(item.tokens),
      })),
    };
  }
  return {
    type: tok.ordered ? 'orderedList' : 'bulletList',
    content: tok.items.map((item) => ({
      type: 'listItem',
      content: listItemContent(item.tokens),
    })),
  };
}

function tableToNode(tok) {
  const headerRow = {
    type: 'tableRow',
    content: tok.header.map((cell) => ({
      type: 'tableHeader',
      content: [paragraphFromInline(cell.tokens)],
    })),
  };
  const bodyRows = tok.rows.map((row) => ({
    type: 'tableRow',
    content: row.map((cell) => ({
      type: 'tableCell',
      content: [paragraphFromInline(cell.tokens)],
    })),
  }));
  return { type: 'table', content: [headerRow, ...bodyRows] };
}

function blockTokenToNode(tok) {
  switch (tok.type) {
    case 'heading':
      return { type: 'heading', attrs: { level: Math.min(tok.depth, MAX_HEADING_LEVEL) }, content: inlineTokensToNodes(tok.tokens) };
    case 'paragraph':
      return paragraphFromInline(tok.tokens);
    case 'list':
      return listToNode(tok);
    case 'blockquote':
      return { type: 'blockquote', content: blocksToNodes(tok.tokens) };
    case 'code':
      // No lowlight extension wired into the editor — language is stored as
      // an attr but won't get syntax highlighting.
      return {
        type: 'codeBlock',
        attrs: { language: tok.lang || null },
        ...(tok.text ? { content: [{ type: 'text', text: tok.text }] } : {}),
      };
    case 'hr':
      return { type: 'horizontalRule' };
    case 'table':
      return tableToNode(tok);
    case 'space':
      return null;
    default: {
      // Unrecognized block type — degrade to a plain paragraph instead of
      // silently dropping the content.
      const fallback = tok.text || tok.raw;
      if (!fallback) return null;
      const n = textNode(fallback, []);
      return n ? { type: 'paragraph', content: [n] } : null;
    }
  }
}

function blocksToNodes(tokens) {
  const nodes = [];
  for (const tok of tokens || []) {
    const node = blockTokenToNode(tok);
    if (node) nodes.push(node);
  }
  return nodes.length ? nodes : [{ type: 'paragraph' }];
}

// Markdown -> TipTap JSON (the `content` field the editor actually reads).
function markdownToTiptap(markdown) {
  const tokens = marked.lexer(markdown || '');
  return { type: 'doc', content: blocksToNodes(tokens) };
}

// Markdown -> HTML (the `content_html` field — secondary/fallback render
// path per the editor's own load logic, but kept in sync regardless).
function markdownToHtml(markdown) {
  return marked.parse(markdown || '');
}

module.exports = { markdownToTiptap, markdownToHtml };
