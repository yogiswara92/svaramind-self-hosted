import { Node, mergeAttributes } from '@tiptap/core';

function openDrawioEditor(currentXml: string, onSave: (xml: string, svg: string) => void) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    display: flex; flex-direction: column;
    background: var(--bg-primary, #fff);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px; border-bottom: 1px solid var(--border-color, #e5e7eb);
    background: var(--bg-secondary, #f9fafb); font-weight: 600; font-size: 14px;
    flex-shrink: 0;
  `;
  header.innerHTML = `<span><i class="bi bi-diagram-3" style="margin-right:8px"></i>Draw.io Editor</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<i class="bi bi-x-lg"></i> Close';
  closeBtn.style.cssText = `
    padding: 6px 14px; border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 6px; background: none; cursor: pointer; font-size: 13px;
    display: flex; align-items: center; gap: 6px;
  `;
  closeBtn.onclick = () => document.body.removeChild(overlay);
  header.appendChild(closeBtn);

  const iframe = document.createElement('iframe');
  iframe.src = 'https://embed.diagrams.net/?embed=1&ui=atlas&spin=1&modified=unsavedChanges&proto=json&stealth=1';
  iframe.style.cssText = 'flex: 1; border: none; width: 100%;';
  iframe.title = 'Draw.io Editor';

  let saved = false;

  function handleMessage(event: MessageEvent) {
    if (event.source !== iframe.contentWindow) return;
    try {
      const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

      if (msg.event === 'init') {
        iframe.contentWindow?.postMessage(JSON.stringify({
          action: 'load',
          xml: currentXml || '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
          autosave: 1
        }), '*');
      } else if (msg.event === 'save') {
        iframe.contentWindow?.postMessage(JSON.stringify({
          action: 'export', format: 'xmlsvg', spinKey: 'export'
        }), '*');
      } else if (msg.event === 'export') {
        saved = true;
        onSave(msg.xml, msg.data || '');
        window.removeEventListener('message', handleMessage);
        document.body.removeChild(overlay);
      } else if (msg.event === 'exit') {
        window.removeEventListener('message', handleMessage);
        document.body.removeChild(overlay);
      }
    } catch {}
  }

  window.addEventListener('message', handleMessage);
  overlay.appendChild(header);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
}

export const DrawioExtension = Node.create({
  name: 'drawio',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      xml: {
        default: '',
        parseHTML: el => el.getAttribute('data-xml') || '',
      },
      svg: {
        default: '',
        // Recover SVG from data-svg attr, or from child <img src> (HTML export fallback)
        parseHTML: el => {
          const dataSvg = el.getAttribute('data-svg');
          if (dataSvg) return dataSvg;
          const img = el.querySelector('img');
          return img?.getAttribute('src') || '';
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-drawio]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Always store both xml and svg as data-attributes so parseHTML can recover them.
    return ['div', mergeAttributes(
      { 'data-drawio': '', style: 'margin:12px 0;page-break-inside:avoid' },
      { 'data-xml': HTMLAttributes.xml || '', 'data-svg': HTMLAttributes.svg || '' }
    ),
      // Embed SVG as visible <img> for PDF/Word export
      ...(HTMLAttributes.svg
        ? [['img', { src: HTMLAttributes.svg, style: 'max-width:100%;height:auto;display:block;' }]]
        : [])
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-drawio', '');
      dom.style.cssText = `
        border: 1px solid var(--border-color, #e5e7eb);
        border-radius: 8px; overflow: hidden; margin: 12px 0;
        background: var(--bg-secondary, #f9fafb);
        user-select: none;
      `;

      function render() {
        dom.innerHTML = '';

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 12px; border-bottom: 1px solid var(--border-color, #e5e7eb);
          background: var(--bg-secondary, #f9fafb);
        `;
        const label = document.createElement('span');
        label.style.cssText = 'font-size:12px;font-weight:500;color:var(--text-secondary,#6b7280);display:flex;align-items:center;gap:6px';
        label.innerHTML = '<i class="bi bi-diagram-3"></i> Diagram';

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex;gap:6px';

        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<i class="bi bi-pencil"></i> Edit';
        editBtn.style.cssText = `
          padding:3px 10px;font-size:12px;border:1px solid var(--border-color,#e5e7eb);
          border-radius:5px;background:none;cursor:pointer;display:flex;align-items:center;gap:4px;
          color:var(--text-secondary,#6b7280);
        `;
        editBtn.onclick = (e) => {
          e.stopPropagation();
          openDrawioEditor(node.attrs.xml, (xml, svg) => {
            if (typeof getPos === 'function') {
              editor.chain().focus().updateAttributes('drawio', { xml, svg }).run();
              // update by position for multi-node support
              const pos = getPos();
              const tr = editor.view.state.tr.setNodeMarkup(pos, undefined, { xml, svg });
              editor.view.dispatch(tr);
            }
            node = { ...node, attrs: { xml, svg } };
            render();
          });
        };

        const delBtn = document.createElement('button');
        delBtn.innerHTML = '<i class="bi bi-trash"></i>';
        delBtn.title = 'Remove diagram';
        delBtn.style.cssText = `
          padding:3px 8px;font-size:12px;border:1px solid var(--border-color,#e5e7eb);
          border-radius:5px;background:none;cursor:pointer;display:flex;align-items:center;
          color:var(--danger-color,#ef4444);
        `;
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (typeof getPos === 'function') {
            const pos = getPos();
            editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
          }
        };

        btnGroup.appendChild(editBtn);
        btnGroup.appendChild(delBtn);
        toolbar.appendChild(label);
        toolbar.appendChild(btnGroup);
        dom.appendChild(toolbar);

        // Preview
        const preview = document.createElement('div');
        preview.style.cssText = 'padding:16px;min-height:80px;display:flex;align-items:center;justify-content:center;';

        if (node.attrs.svg) {
          const img = document.createElement('img');
          img.src = node.attrs.svg;
          img.alt = 'Diagram';
          img.style.cssText = 'max-width:100%;height:auto;max-height:500px;object-fit:contain;background:#fff;border-radius:4px;cursor:pointer;';
          img.onclick = () => editBtn.click();
          preview.appendChild(img);
        } else {
          // No SVG yet — auto-open editor for new empty nodes.
          // A node can have xml without svg (e.g. AI-generated diagram) — needs one open+save to render.
          const hasXml = !!node.attrs.xml;
          preview.innerHTML = `
            <div style="text-align:center;color:var(--text-muted,#9ca3af);padding:24px">
              <i class="bi ${hasXml ? 'bi-stars' : 'bi-diagram-3'}" style="font-size:2.5rem;display:block;margin-bottom:8px"></i>
              <p style="margin:0 0 12px;font-size:13px">${hasXml ? 'Diagram ready — open the editor to render it' : 'No diagram yet'}</p>
              <button class="open-editor-btn" style="padding:6px 16px;font-size:12px;border:1px solid var(--border-color,#e5e7eb);border-radius:5px;background:none;cursor:pointer;">
                <i class="bi bi-pencil"></i> Open Editor
              </button>
            </div>
          `;
          const openBtn = preview.querySelector('.open-editor-btn');
          openBtn?.addEventListener('click', () => editBtn.click());
        }

        dom.appendChild(preview);
      }

      render();

      // Auto-open editor when inserting a new empty node
      if (!node.attrs.xml) {
        setTimeout(() => {
          openDrawioEditor('', (xml, svg) => {
            if (typeof getPos === 'function') {
              const pos = getPos();
              const tr = editor.view.state.tr.setNodeMarkup(pos, undefined, { xml, svg });
              editor.view.dispatch(tr);
            }
            node = { ...node, attrs: { xml, svg } };
            render();
          });
        }, 50);
      }

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type !== node.type) return false;
          node = updatedNode;
          render();
          return true;
        }
      };
    };
  },

  addCommands() {
    return {
      insertDrawio: () => ({ commands }) => {
        return commands.insertContent({ type: 'drawio', attrs: { xml: '', svg: '' } });
      }
    } as any;
  }
});
