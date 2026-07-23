import { Node, mergeAttributes } from '@tiptap/core';
import { get } from 'svelte/store';
import { tabs, goToNote } from '../stores/tabs';

// WikiLink node: stores [[Title]] links as structured nodes with doc ID
export const WikiLinkExtension = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      docId: { default: null },
      label: { default: '' }
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-wiki-link': '', class: 'wiki-link' },
        { 'data-doc-id': HTMLAttributes.docId }
      ),
      `[[${HTMLAttributes.label}]]`
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('span');
      dom.classList.add('wiki-link');
      dom.setAttribute('data-doc-id', node.attrs.docId || '');
      dom.textContent = `[[${node.attrs.label}]]`;
      dom.title = `Open: ${node.attrs.label}`;
      dom.style.cssText = `
        color: var(--accent-color);
        background: rgba(108,99,255,0.08);
        padding: 1px 5px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        text-decoration: none;
        display: inline;
        border: 1px solid rgba(108,99,255,0.2);
      `;

      dom.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (node.attrs.docId) {
          goToNote(node.attrs.docId);
        }
      });

      return { dom };
    };
  }
});

// Helper: extract all wikilink doc IDs from TipTap JSON content
export function extractWikiLinkIds(content: any): string[] {
  const ids: string[] = [];
  function walk(node: any) {
    if (!node) return;
    if (node.type === 'wikiLink' && node.attrs?.docId) {
      ids.push(node.attrs.docId);
    }
    if (node.content) node.content.forEach(walk);
  }
  walk(content);
  return [...new Set(ids)];
}
