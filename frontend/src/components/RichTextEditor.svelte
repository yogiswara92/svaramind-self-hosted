<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Editor } from '@tiptap/core';
  import { marked } from 'marked';
  import StarterKit from '@tiptap/starter-kit';
  import Underline from '@tiptap/extension-underline';
  import Link from '@tiptap/extension-link';
  import Image from '@tiptap/extension-image';
  import imageCompression from 'browser-image-compression';
  import TextStyle from '@tiptap/extension-text-style';
  import { Color } from '@tiptap/extension-color';
  import { FontFamily } from '@tiptap/extension-font-family';
  import Highlight from '@tiptap/extension-highlight';
  import TaskList from '@tiptap/extension-task-list';
  import TaskItem from '@tiptap/extension-task-item';
  import TextAlign from '@tiptap/extension-text-align';
  import Placeholder from '@tiptap/extension-placeholder';
  import CharacterCount from '@tiptap/extension-character-count';
  import Subscript from '@tiptap/extension-subscript';
  import Superscript from '@tiptap/extension-superscript';
  import Table from '@tiptap/extension-table';
  import TableRow from '@tiptap/extension-table-row';
  import TableHeader from '@tiptap/extension-table-header';
  import TableCell from '@tiptap/extension-table-cell';
  import Typography from '@tiptap/extension-typography';
  import { WikiLinkExtension } from '../lib/wikilink-extension';
  import { DrawioExtension } from '../lib/drawio-extension';

  export let content: any = { type: 'doc', content: [{ type: 'paragraph' }] };
  export let editable = true;
  export let placeholder = 'Start writing...';
  export let font = 'Inter';
  export let fontSize = 16;
  export let lineHeight = 1.6;

  const dispatch = createEventDispatcher();

  let element: HTMLDivElement;
  let editor: Editor;

  // ── Bubble toolbar state ─────────────────────────────────────────────────────
  let tick = 0;               // increments on every transaction → triggers Svelte reactivity
  let bubbleVisible = false;
  let bubbleX = 0;
  let bubbleY = 0;
  let showLinkInput = false;
  let linkUrl = '';
  let showColorPicker = false;

  const BUBBLE_COLORS = ['#000000','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
  const BUBBLE_HIGHLIGHTS = ['#fef08a','#bbf7d0','#bfdbfe','#ddd6fe','#fed7aa','#fecdd3'];

  // ── Reactive helpers (re-evaluate every tick) ────────────────────────────────
  $: isBold        = editor?.isActive('bold')       && tick >= 0;
  $: isItalic      = editor?.isActive('italic')     && tick >= 0;
  $: isUnderline   = editor?.isActive('underline')  && tick >= 0;
  $: isStrike      = editor?.isActive('strike')     && tick >= 0;
  $: isCode        = editor?.isActive('code')       && tick >= 0;
  $: isH1          = editor?.isActive('heading', { level: 1 }) && tick >= 0;
  $: isH2          = editor?.isActive('heading', { level: 2 }) && tick >= 0;
  $: isH3          = editor?.isActive('heading', { level: 3 }) && tick >= 0;
  $: isLink        = editor?.isActive('link')       && tick >= 0;
  $: isBullet      = editor?.isActive('bulletList') && tick >= 0;
  $: isOrdered     = editor?.isActive('orderedList') && tick >= 0;
  $: isQuote       = editor?.isActive('blockquote') && tick >= 0;
  $: canUndo       = editor?.can().undo()           && tick >= 0;
  $: canRedo       = editor?.can().redo()           && tick >= 0;
  $: isInTable     = editor?.isActive('table')      && tick >= 0;

  function tbl(action: string) {
    if (!editor) return;
    const ch = editor.chain().focus();
    switch (action) {
      case 'addColBefore':  ch.addColumnBefore().run(); break;
      case 'addColAfter':   ch.addColumnAfter().run();  break;
      case 'deleteCol':     ch.deleteColumn().run();    break;
      case 'addRowBefore':  ch.addRowBefore().run();    break;
      case 'addRowAfter':   ch.addRowAfter().run();     break;
      case 'deleteRow':     ch.deleteRow().run();        break;
      case 'mergeCells':    ch.mergeCells().run();       break;
      case 'splitCell':     ch.splitCell().run();        break;
      case 'deleteTable':
        if (confirm('Delete this table?')) ch.deleteTable().run();
        break;
    }
  }

  // ── Editor methods exposed to parent ────────────────────────────────────────
  export function getJSON()  { return editor?.getJSON(); }
  export function getHTML()  { return editor?.getHTML(); }
  export function getText()  { return editor?.getText(); }
  export function getWordCount() { return editor?.storage?.characterCount?.words() ?? 0; }
  export function focus() { editor?.commands.focus(); }
  export function insertContent(html: string) { editor?.commands.insertContent(html); }
  export function setContent(c: any) { editor?.commands.setContent(c); }
  export function getEditor() { return editor; }

  onMount(() => {
    editor = new Editor({
      element,
      editable,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, codeBlock: { HTMLAttributes: { class: 'code-block' } } }),
        Underline,
        Link.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
        Image.configure({ inline: false, allowBase64: true }),
        TextStyle,
        Color,
        FontFamily,
        Highlight.configure({ multicolor: true }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Placeholder.configure({ placeholder }),
        CharacterCount,
        Subscript,
        Superscript,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        WikiLinkExtension,
        DrawioExtension,
        Typography
      ],
      content,
      onUpdate: ({ editor }) => {
        tick++;
        dispatch('update', {
          json: editor.getJSON(),
          html: editor.getHTML(),
          text: editor.getText(),
          wordCount: editor.storage.characterCount?.words() ?? 0
        });
      },
      onSelectionUpdate: ({ editor }) => {
        tick++;
        updateBubble(editor);
        dispatch('selectionUpdate', { editor });
      },
      onTransaction: () => {
        tick++;
      },
      onFocus: ({ editor }) => {
        tick++;
        dispatch('focus');
      },
      onBlur: ({ editor }) => {
        // Small delay so bubble buttons still work on click
        setTimeout(() => {
          if (!editor.isFocused) {
            bubbleVisible = false;
            showLinkInput = false;
            showColorPicker = false;
          }
        }, 150);
        dispatch('blur');
      },
      onCreate: ({ editor }) => {
        dispatch('created', { editor });
      }
    });

    element.addEventListener('dragover', (e) => e.preventDefault());
    element.addEventListener('drop', handleDrop);
    element.addEventListener('paste', handlePaste);
  });

  onDestroy(() => { editor?.destroy(); });

  // ── Bubble positioning ───────────────────────────────────────────────────────
  function updateBubble(ed: Editor) {
    const { empty, from, to } = ed.state.selection;
    if (empty || !ed.isEditable) {
      bubbleVisible = false;
      return;
    }
    try {
      const start = ed.view.coordsAtPos(from);
      const end   = ed.view.coordsAtPos(to);
      // Center horizontally, position above the selection
      bubbleX = (start.left + end.right) / 2;
      bubbleY = Math.min(start.top, end.top) - 52;
      // Make sure it doesn't go off-screen top
      if (bubbleY < 60) bubbleY = Math.max(start.bottom, end.bottom) + 8;
      bubbleVisible = true;
    } catch {
      bubbleVisible = false;
    }
  }

  // ── Bubble button helpers ────────────────────────────────────────────────────
  function cmd(action: string, opts?: any) {
    if (!editor) return;
    const ch = editor.chain().focus();
    switch (action) {
      case 'bold':       ch.toggleBold().run();                       break;
      case 'italic':     ch.toggleItalic().run();                     break;
      case 'underline':  ch.toggleUnderline().run();                  break;
      case 'strike':     ch.toggleStrike().run();                     break;
      case 'code':       ch.toggleCode().run();                       break;
      case 'h1':         ch.toggleHeading({ level: 1 }).run();        break;
      case 'h2':         ch.toggleHeading({ level: 2 }).run();        break;
      case 'h3':         ch.toggleHeading({ level: 3 }).run();        break;
      case 'quote':      ch.toggleBlockquote().run();                 break;
      case 'bullet':     ch.toggleBulletList().run();                 break;
      case 'ordered':    ch.toggleOrderedList().run();                break;
      case 'alignL':     ch.setTextAlign('left').run();               break;
      case 'alignC':     ch.setTextAlign('center').run();             break;
      case 'alignR':     ch.setTextAlign('right').run();              break;
      case 'color':      ch.setColor(opts).run();                     break;
      case 'highlight':  ch.toggleHighlight({ color: opts }).run();   break;
      case 'clearFmt':   ch.clearNodes().unsetAllMarks().run();       break;
      case 'undo':       ch.undo().run();                             break;
      case 'redo':       ch.redo().run();                             break;
      case 'codeBlock':  ch.toggleCodeBlock().run();                  break;
      case 'sub':        ch.toggleSubscript().run();                  break;
      case 'sup':        ch.toggleSuperscript().run();                break;
    }
  }

  function setLink() {
    if (!linkUrl) {
      editor?.chain().focus().unsetLink().run();
    } else {
      editor?.chain().focus().setLink({ href: linkUrl, target: '_blank' }).run();
    }
    showLinkInput = false;
    linkUrl = '';
  }

  // ── Image handling ────────────────────────────────────────────────────────────
  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer?.files || [])) {
      if (file.type.startsWith('image/')) await insertImage(file);
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    for (const item of Array.from(e.clipboardData?.items || [])) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await insertImage(file);
        return;
      }
    }

    // Markdown text copied from an LLM reply, a chat app, or a plain-text
    // source usually still carries a clipboard 'text/html' entry — browsers
    // auto-wrap any copied text in <meta>/<span>/<div> even with zero real
    // formatting. Tiptap happily parses that non-empty HTML as-is, so the raw
    // #/**/- syntax shows up literally. Treat HTML with no actual rich-text
    // tags as if it were plain text and convert it as markdown instead.
    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain');
    if (text && looksLikeMarkdown(text) && (!html || isTrivialHtml(html))) {
      e.preventDefault();
      const converted = marked.parse(text, { gfm: true, breaks: false }) as string;
      editor?.chain().focus().insertContent(converted).run();
    }
  }

  function isTrivialHtml(html: string): boolean {
    return !/<(b|strong|i|em|u|s|strike|ul|ol|li|table|h[1-6]|a\s|a>|code|pre|blockquote|img)[\s/>]/i.test(html);
  }

  function looksLikeMarkdown(text: string): boolean {
    let score = 0;
    for (const line of text.split('\n')) {
      if (/^#{1,6}\s+\S/.test(line)) score += 2;
      if (/^\s*[-*+]\s+\S/.test(line)) score += 1;
      if (/^\s*\d+\.\s+\S/.test(line)) score += 1;
      if (/^\s*>\s?\S/.test(line)) score += 1;
      if (/^\s*```/.test(line)) score += 2;
      if (/^\s*\|.+\|\s*$/.test(line)) score += 1;
      if (score >= 2) return true;
    }
    if (/\*\*[^*\n]+\*\*/.test(text)) score += 1;
    if (/\[[^\]]+\]\([^)]+\)/.test(text)) score += 1;
    return score >= 2;
  }

  async function insertImage(file: File) {
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        editor.chain().focus().setImage({ src }).run();
        dispatch('imageInserted', { file: compressedFile, src });
      };
      reader.readAsDataURL(compressedFile);
    } catch (err) {
      console.error('Image compression failed:', err);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        editor.chain().focus().setImage({ src }).run();
        dispatch('imageInserted', { file, src });
      };
      reader.readAsDataURL(file);
    }
  }

  $: if (editor && font)       element?.style.setProperty('font-family', font);
  $: if (editor && fontSize)   element?.style.setProperty('font-size', `${fontSize}px`);
  $: if (editor && lineHeight) element?.style.setProperty('line-height', String(lineHeight));
  $: if (editor && editable !== undefined) editor.setEditable(editable);
</script>

<!-- ── Bubble toolbar (floating, fixed to viewport) ──────────────────────── -->
{#if bubbleVisible && tick >= 0}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="bubble-toolbar"
    style="left:{bubbleX}px;top:{bubbleY}px"
    on:mousedown|preventDefault
  >
    <!-- Text style -->
    <div class="bubble-group">
      <button class="bb {isBold ? 'on' : ''}"      on:click={() => cmd('bold')}      title="Bold (⌘B)">     <i class="bi bi-type-bold"></i></button>
      <button class="bb {isItalic ? 'on' : ''}"    on:click={() => cmd('italic')}    title="Italic (⌘I)">   <i class="bi bi-type-italic"></i></button>
      <button class="bb {isUnderline ? 'on' : ''}" on:click={() => cmd('underline')} title="Underline (⌘U)"><i class="bi bi-type-underline"></i></button>
      <button class="bb {isStrike ? 'on' : ''}"    on:click={() => cmd('strike')}    title="Strikethrough">  <i class="bi bi-type-strikethrough"></i></button>
      <button class="bb {isCode ? 'on' : ''}"      on:click={() => cmd('code')}      title="Inline code">    <i class="bi bi-code"></i></button>
    </div>

    <div class="bubble-sep"></div>

    <!-- Headings -->
    <div class="bubble-group">
      <button class="bb text-btn {isH1 ? 'on' : ''}" on:click={() => cmd('h1')} title="Heading 1">H1</button>
      <button class="bb text-btn {isH2 ? 'on' : ''}" on:click={() => cmd('h2')} title="Heading 2">H2</button>
      <button class="bb text-btn {isH3 ? 'on' : ''}" on:click={() => cmd('h3')} title="Heading 3">H3</button>
    </div>

    <div class="bubble-sep"></div>

    <!-- Link -->
    {#if showLinkInput}
      <form class="bubble-link-form" on:submit|preventDefault={setLink}>
        <input class="bubble-link-input" bind:value={linkUrl} placeholder="https://..." autofocus />
        <button type="submit" class="bb on"><i class="bi bi-check"></i></button>
        <button type="button" class="bb" on:click={() => showLinkInput = false}><i class="bi bi-x"></i></button>
      </form>
    {:else}
      <div class="bubble-group">
        <button class="bb {isLink ? 'on' : ''}"
          on:click={() => { showLinkInput = true; linkUrl = editor?.getAttributes('link')?.href || ''; }}
          title="Link">
          <i class="bi bi-link-45deg"></i>
        </button>

        <!-- Color picker toggle -->
        <div class="bubble-color-wrap">
          <button class="bb color-trigger" on:click|stopPropagation={() => { showColorPicker = !showColorPicker; }} title="Color">
            <i class="bi bi-palette"></i>
          </button>
          {#if showColorPicker}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="bubble-color-panel" on:mousedown|preventDefault on:click|stopPropagation>
              <div class="cp-label">Text</div>
              <div class="cp-row">
                {#each BUBBLE_COLORS as c}
                  <button class="cp-dot" style="background:{c}" on:click={() => { cmd('color', c); showColorPicker = false; }} title={c}></button>
                {/each}
              </div>
              <div class="cp-label">Highlight</div>
              <div class="cp-row">
                {#each BUBBLE_HIGHLIGHTS as c}
                  <button class="cp-dot highlight" style="background:{c}" on:click={() => { cmd('highlight', c); showColorPicker = false; }} title={c}></button>
                {/each}
              </div>
              <button class="cp-clear" on:click={() => { cmd('clearFmt'); showColorPicker = false; }}>
                <i class="bi bi-eraser"></i> Clear format
              </button>
            </div>
          {/if}
        </div>
      </div>

      <div class="bubble-sep"></div>

      <!-- Alignment -->
      <div class="bubble-group">
        <button class="bb" on:click={() => cmd('alignL')} title="Align left">   <i class="bi bi-text-left"></i></button>
        <button class="bb" on:click={() => cmd('alignC')} title="Align center"> <i class="bi bi-text-center"></i></button>
        <button class="bb" on:click={() => cmd('alignR')} title="Align right">  <i class="bi bi-text-right"></i></button>
      </div>

      <div class="bubble-sep"></div>

      <!-- Lists & quote -->
      <div class="bubble-group">
        <button class="bb {isBullet ? 'on' : ''}"  on:click={() => cmd('bullet')}  title="Bullet list">  <i class="bi bi-list-ul"></i></button>
        <button class="bb {isOrdered ? 'on' : ''}" on:click={() => cmd('ordered')} title="Ordered list"> <i class="bi bi-list-ol"></i></button>
        <button class="bb {isQuote ? 'on' : ''}"   on:click={() => cmd('quote')}   title="Blockquote">   <i class="bi bi-chat-square-quote"></i></button>
      </div>
    {/if}
  </div>
{/if}

<!-- ── Table context toolbar (sticky, appears when cursor is in a table) ── -->
{#if isInTable}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="table-toolbar" on:mousedown|preventDefault>
    <span class="tbl-label"><i class="bi bi-table"></i> Table</span>
    <div class="tbl-sep"></div>

    <span class="tbl-group-label">Column</span>
    <button class="tbl-btn" on:click={() => tbl('addColBefore')} title="Insert column before">
      <i class="bi bi-layout-split"></i> Before
    </button>
    <button class="tbl-btn" on:click={() => tbl('addColAfter')} title="Insert column after">
      After <i class="bi bi-layout-split"></i>
    </button>
    <button class="tbl-btn danger" on:click={() => tbl('deleteCol')} title="Delete column">
      <i class="bi bi-trash"></i> Col
    </button>

    <div class="tbl-sep"></div>

    <span class="tbl-group-label">Row</span>
    <button class="tbl-btn" on:click={() => tbl('addRowBefore')} title="Insert row before">
      <i class="bi bi-layout-split" style="transform:rotate(90deg)"></i> Before
    </button>
    <button class="tbl-btn" on:click={() => tbl('addRowAfter')} title="Insert row after">
      After <i class="bi bi-layout-split" style="transform:rotate(90deg)"></i>
    </button>
    <button class="tbl-btn danger" on:click={() => tbl('deleteRow')} title="Delete row">
      <i class="bi bi-trash"></i> Row
    </button>

    <div class="tbl-sep"></div>

    <button class="tbl-btn" on:click={() => tbl('mergeCells')} title="Merge selected cells">
      <i class="bi bi-union"></i> Merge
    </button>
    <button class="tbl-btn" on:click={() => tbl('splitCell')} title="Split cell">
      <i class="bi bi-subtract"></i> Split
    </button>

    <div class="tbl-sep"></div>

    <button class="tbl-btn danger" on:click={() => tbl('deleteTable')} title="Delete table">
      <i class="bi bi-x-circle"></i> Delete Table
    </button>
  </div>
{/if}

<!-- ── Editor content ─────────────────────────────────────────────────────── -->
<div
  bind:this={element}
  class="rich-editor"
  style="font-family:{font};font-size:{fontSize}px;line-height:{lineHeight}"
></div>

<style>
  /* ── Bubble toolbar ─────────────────────────────────────────────────────── */
  .bubble-toolbar {
    position: fixed;
    transform: translateX(-50%);
    z-index: 600;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 8px;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    animation: bubbleIn 0.12s ease;
    pointer-events: all;
  }

  @keyframes bubbleIn {
    from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.96); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0)   scale(1); }
  }

  .bubble-group { display: flex; align-items: center; gap: 1px; }

  .bubble-sep {
    width: 1px; height: 18px;
    background: var(--border-color, #dee2e6);
    margin: 0 3px;
    flex-shrink: 0;
  }

  .bb {
    display: flex; align-items: center; justify-content: center;
    min-width: 28px; height: 28px; padding: 0 5px;
    border: none; border-radius: 5px; background: none;
    color: var(--text-secondary, #6c757d);
    cursor: pointer; font-size: 13px; font-weight: 500;
    transition: all 0.1s; white-space: nowrap;
  }
  .bb:hover { background: var(--bg-hover, #f0f0f0); color: var(--text-primary, #212529); }
  .bb.on    { background: var(--bg-active, #e8e0ff); color: var(--accent-color, #132578); font-weight: 600; }

  .text-btn { font-size: 12px; font-weight: 700; min-width: 26px; }

  /* Link form */
  .bubble-link-form { display: flex; align-items: center; gap: 4px; }
  .bubble-link-input {
    width: 200px; height: 28px; padding: 0 8px;
    border: 1px solid var(--accent-color, #132578); border-radius: 5px;
    background: var(--bg-primary, #fff); color: var(--text-primary, #212529);
    font-size: 12px; outline: none;
  }

  /* Color picker */
  .bubble-color-wrap { position: relative; }

  .bubble-color-panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    padding: 10px 12px;
    min-width: 170px;
    z-index: 10;
    animation: bubbleIn 0.12s ease;
  }

  .cp-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--text-muted, #adb5bd);
    margin-bottom: 5px;
  }

  .cp-row { display: flex; gap: 5px; margin-bottom: 8px; }

  .cp-dot {
    width: 20px; height: 20px; border-radius: 50%;
    border: 1px solid rgba(0,0,0,0.1); cursor: pointer;
    transition: transform 0.1s;
    flex-shrink: 0;
  }
  .cp-dot:hover { transform: scale(1.25); }
  .cp-dot.highlight { border-radius: 4px; }

  .cp-clear {
    display: flex; align-items: center; gap: 5px;
    width: 100%; padding: 5px 6px;
    border: none; border-radius: 5px; background: none;
    cursor: pointer; font-size: 11px; color: var(--danger-color, #dc3545);
    transition: background 0.1s;
  }
  .cp-clear:hover { background: #fee2e2; }

  /* ── Table context toolbar ───────────────────────────────────────────────── */
  .table-toolbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    padding: 5px 12px;
    background: #fff8e1;
    border-bottom: 1px solid #ffe082;
    animation: fadeIn 0.15s ease;
  }

  [data-theme="dark"] .table-toolbar { background: #2d2a1a; border-color: #5a4a00; }

  .tbl-label {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 700; color: #7a5c00;
    text-transform: uppercase; letter-spacing: 0.5px;
  }

  .tbl-group-label {
    font-size: 10px; font-weight: 600;
    color: #9a7a00; text-transform: uppercase; letter-spacing: 0.4px;
    padding: 0 2px;
  }

  .tbl-sep {
    width: 1px; height: 16px;
    background: #ffe082; margin: 0 4px; flex-shrink: 0;
  }

  .tbl-btn {
    display: inline-flex; align-items: center; gap: 4px;
    height: 26px; padding: 0 8px;
    border: 1px solid #ffe082; border-radius: 4px;
    background: rgba(255,255,255,0.7); cursor: pointer;
    font-size: 12px; color: #5c4000;
    transition: all 0.1s; white-space: nowrap;
  }
  .tbl-btn:hover { background: #fff3cd; border-color: #ffc107; color: #3d2a00; }
  .tbl-btn.danger { color: #b91c1c; border-color: #fca5a5; }
  .tbl-btn.danger:hover { background: #fee2e2; border-color: #ef4444; }

  /* ── Editor content area ─────────────────────────────────────────────────── */
  .rich-editor {
    flex: 1;
    padding: 24px 64px 80px;
    min-height: 100%;
    cursor: text;
  }

  .rich-editor :global(.ProseMirror) {
    min-height: calc(100vh - 280px);
    outline: none;
  }

  /* Fix list spacing to match paragraph line-height */
  .rich-editor :global(.ProseMirror ul),
  .rich-editor :global(.ProseMirror ol) {
    margin: 0 !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    padding: 0;
    padding-left: 20px;
  }

  .rich-editor :global(.ProseMirror li) {
    margin: 0 !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    padding: 0;
  }

  .rich-editor :global(.ProseMirror ul li),
  .rich-editor :global(.ProseMirror ol li) {
    margin: 0 !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }


  @media (max-width: 768px) {
    .rich-editor { padding: 16px 20px 60px; }
  }
</style>
