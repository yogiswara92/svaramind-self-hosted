<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Editor } from '@tiptap/core';
  import { marked } from 'marked';
  import QuickVoiceInput from './QuickVoiceInput.svelte';
  import { parsePPT, slidesToMarkdown } from '../lib/ppt-parser';

  export let editor: Editor | null = null;
  export let savingDoc: boolean = false;
  export let lineHeight: number = 1.6;
  export let fontSize: number = 16;

  const MIN_FONT = 12;
  const MAX_FONT = 32;
  const FONT_STEP = 2;

  function zoomIn()  { if (fontSize < MAX_FONT) dispatch('fontSizeChange', Math.min(fontSize + FONT_STEP, MAX_FONT)); }
  function zoomOut() { if (fontSize > MIN_FONT) dispatch('fontSizeChange', Math.max(fontSize - FONT_STEP, MIN_FONT)); }
  function zoomReset() { dispatch('fontSizeChange', 16); }

  const dispatch = createEventDispatcher();

  // Portal dropdown anchors (position:fixed — escape overflow clip)
  let fontAnchor:   DOMRect | null = null;
  let colorAnchor:  DOMRect | null = null;
  let insertAnchor: DOMRect | null = null;
  let showLinkInput = false;
  let linkUrl = '';
  let pptInput: HTMLInputElement;
  let mdInput: HTMLInputElement;
  let importing = false;
  let importingMd = false;

  const FONTS = [
    { label: 'Inter',            value: 'Inter' },
    { label: 'Merriweather',     value: 'Merriweather' },
    { label: 'Playfair Display', value: 'Playfair Display' },
    { label: 'Georgia',          value: 'Georgia' },
    { label: 'Fira Code',        value: 'Fira Code' },
    { label: 'Arial',            value: 'Arial' },
    { label: 'Times New Roman',  value: 'Times New Roman' }
  ];

  const TEXT_COLORS = [
    '#000000','#374151','#dc2626','#ea580c','#ca8a04',
    '#16a34a','#0284c7','#7c3aed','#db2777','#6b7280'
  ];
  const HIGHLIGHTS = ['#fef08a','#bbf7d0','#bfdbfe','#ddd6fe','#fed7aa','#fecdd3'];

  function closeAll() {
    fontAnchor = colorAnchor = insertAnchor = null;
    showLinkInput = false;
  }

  function openFont(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    fontAnchor = fontAnchor ? null : r;
    colorAnchor = insertAnchor = null;
  }

  function openColor(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    colorAnchor = colorAnchor ? null : r;
    fontAnchor = insertAnchor = null;
  }

  function openInsert(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    insertAnchor = insertAnchor ? null : r;
    fontAnchor = colorAnchor = null;
  }

  function cmd(action: string, opts?: any) {
    if (!editor) return;
    const ch = editor.chain().focus();
    switch (action) {
      case 'undo':        ch.undo().run(); break;
      case 'redo':        ch.redo().run(); break;
      case 'bold':        ch.toggleBold().run(); break;
      case 'italic':      ch.toggleItalic().run(); break;
      case 'underline':   ch.toggleUnderline().run(); break;
      case 'strike':      ch.toggleStrike().run(); break;
      case 'code':        ch.toggleCode().run(); break;
      case 'sub':         ch.toggleSubscript().run(); break;
      case 'sup':         ch.toggleSuperscript().run(); break;
      case 'h1':          ch.toggleHeading({ level: 1 }).run(); break;
      case 'h2':          ch.toggleHeading({ level: 2 }).run(); break;
      case 'h3':          ch.toggleHeading({ level: 3 }).run(); break;
      case 'bullet':      ch.toggleBulletList().run(); break;
      case 'ordered':     ch.toggleOrderedList().run(); break;
      case 'task':        ch.toggleTaskList().run(); break;
      case 'quote':       ch.toggleBlockquote().run(); break;
      case 'codeBlock':   ch.toggleCodeBlock().run(); break;
      case 'alignLeft':   ch.setTextAlign('left').run(); break;
      case 'alignCenter': ch.setTextAlign('center').run(); break;
      case 'alignRight':  ch.setTextAlign('right').run(); break;
      case 'alignJustify':ch.setTextAlign('justify').run(); break;
      case 'hr':          ch.setHorizontalRule().run(); break;
      case 'table':       ch.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      case 'font':        ch.setFontFamily(opts).run(); break;
      case 'color':       ch.setColor(opts).run(); break;
      case 'highlight':   ch.toggleHighlight({ color: opts }).run(); break;
      case 'clearFmt':    ch.clearNodes().unsetAllMarks().run(); break;
    }
  }

  function setLink() {
    if (!linkUrl) editor?.chain().focus().unsetLink().run();
    else editor?.chain().focus().setLink({ href: linkUrl, target: '_blank' }).run();
    showLinkInput = false;
    linkUrl = '';
  }

  function insertImage() {
    const url = prompt('Image URL (or drag/paste into editor)');
    if (url) editor?.chain().focus().setImage({ src: url }).run();
    closeAll();
  }

  async function handlePPTImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !editor) return;

    importing = true;
    try {
      const slides = await parsePPT(file);
      const markdown = slidesToMarkdown(slides, file.name);
      editor.chain().focus().insertContent(markdown).run();
      closeAll();
    } catch (err) {
      console.error('PPT import failed:', err);
      alert('Failed to import PPT: ' + (err as Error).message);
    } finally {
      importing = false;
      pptInput.value = '';
    }
  }

  function openPPTImport() {
    pptInput.click();
  }

  async function handleMarkdownImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !editor) return;

    importingMd = true;
    try {
      const text = await file.text();
      const html = marked.parse(text, { gfm: true, breaks: false }) as string;
      editor.chain().focus().insertContent(html).run();
      closeAll();
    } catch (err) {
      console.error('Markdown import failed:', err);
      alert('Failed to import Markdown: ' + (err as Error).message);
    } finally {
      importingMd = false;
      mdInput.value = '';
    }
  }

  function openMarkdownImport() {
    mdInput.click();
  }


  // Reactive active states — re-evaluate when editor state changes
  $: st = editor?.state;
  $: isBold    = editor?.isActive('bold')              && !!st;
  $: isItalic  = editor?.isActive('italic')            && !!st;
  $: isUnder   = editor?.isActive('underline')         && !!st;
  $: isStrike  = editor?.isActive('strike')            && !!st;
  $: isCode    = editor?.isActive('code')              && !!st;
  $: isSub     = editor?.isActive('subscript')         && !!st;
  $: isSup     = editor?.isActive('superscript')       && !!st;
  $: isH1      = editor?.isActive('heading',{level:1}) && !!st;
  $: isH2      = editor?.isActive('heading',{level:2}) && !!st;
  $: isH3      = editor?.isActive('heading',{level:3}) && !!st;
  $: isBullet  = editor?.isActive('bulletList')        && !!st;
  $: isOrdered = editor?.isActive('orderedList')       && !!st;
  $: isTask    = editor?.isActive('taskList')          && !!st;
  $: isQuote   = editor?.isActive('blockquote')        && !!st;
  $: isCodeBlk = editor?.isActive('codeBlock')         && !!st;
  $: isAlignL  = editor?.isActive({textAlign:'left'})  && !!st;
  $: isAlignC  = editor?.isActive({textAlign:'center'})&& !!st;
  $: isAlignR  = editor?.isActive({textAlign:'right'}) && !!st;
  $: isLink    = editor?.isActive('link')              && !!st;
  $: canUndo   = editor?.can().undo()                  && !!st;
  $: canRedo   = editor?.can().redo()                  && !!st;
  $: currentColor = editor?.getAttributes('textStyle')?.color || '#000';
</script>

<svelte:window
  on:click={closeAll}
  on:keydown={(e) => e.key === 'Escape' && closeAll()}
/>

<input
  bind:this={pptInput}
  type="file"
  accept=".pptx,.ppt"
  style="display:none"
  on:change={handlePPTImport}
/>

<input
  bind:this={mdInput}
  type="file"
  accept=".md,.markdown"
  style="display:none"
  on:change={handleMarkdownImport}
/>

<div class="editor-toolbar">

  <!-- Undo / Redo -->
  <div class="tb-group">
    <button class="tb" on:click={() => cmd('undo')} disabled={!canUndo} title="Undo (⌘Z)">
      <i class="bi bi-arrow-counterclockwise"></i>
    </button>
    <button class="tb" on:click={() => cmd('redo')} disabled={!canRedo} title="Redo (⌘⇧Z)">
      <i class="bi bi-arrow-clockwise"></i>
    </button>
  </div>

  <div class="sep"></div>

  <!-- Font family -->
  <div class="tb-group">
    <button class="tb font-btn" on:click|stopPropagation={openFont} title="Font">
      <span class="font-label">Aa</span>
      <i class="bi bi-chevron-down caret"></i>
    </button>
  </div>

  <div class="sep"></div>

  <!-- Headings -->
  <div class="tb-group">
    <button class="tb txt {isH1?'on':''}" on:click={() => cmd('h1')} title="Heading 1">H1</button>
    <button class="tb txt {isH2?'on':''}" on:click={() => cmd('h2')} title="Heading 2">H2</button>
    <button class="tb txt {isH3?'on':''}" on:click={() => cmd('h3')} title="Heading 3">H3</button>
  </div>

  <div class="sep"></div>

  <!-- Text formatting -->
  <div class="tb-group">
    <button class="tb {isBold?'on':''}"   on:click={() => cmd('bold')}      title="Bold (⌘B)">        <i class="bi bi-type-bold"></i></button>
    <button class="tb {isItalic?'on':''}" on:click={() => cmd('italic')}    title="Italic (⌘I)">      <i class="bi bi-type-italic"></i></button>
    <button class="tb {isUnder?'on':''}"  on:click={() => cmd('underline')} title="Underline (⌘U)">   <i class="bi bi-type-underline"></i></button>
    <button class="tb {isStrike?'on':''}" on:click={() => cmd('strike')}    title="Strikethrough">    <i class="bi bi-type-strikethrough"></i></button>
    <button class="tb {isCode?'on':''}"   on:click={() => cmd('code')}      title="Inline code">      <i class="bi bi-code"></i></button>
    <button class="tb tb-mobile-hide {isSub?'on':''}" on:click={() => cmd('sub')} title="Subscript">  <i class="bi bi-subscript"></i></button>
    <button class="tb tb-mobile-hide {isSup?'on':''}" on:click={() => cmd('sup')} title="Superscript"><i class="bi bi-superscript"></i></button>
  </div>

  <div class="sep"></div>

  <!-- Color -->
  <div class="tb-group tb-mobile-hide">
    <button class="tb color-btn" on:click|stopPropagation={openColor} title="Color / Highlight">
      <span class="color-a" style="border-bottom:3px solid {currentColor}">A</span>
      <i class="bi bi-chevron-down caret"></i>
    </button>
  </div>

  <div class="sep tb-mobile-hide"></div>

  <!-- Lists & blocks -->
  <div class="tb-group">
    <button class="tb {isBullet?'on':''}"  on:click={() => cmd('bullet')}   title="Bullet list">    <i class="bi bi-list-ul"></i></button>
    <button class="tb {isOrdered?'on':''}" on:click={() => cmd('ordered')}  title="Numbered list">  <i class="bi bi-list-ol"></i></button>
    <button class="tb {isTask?'on':''}"    on:click={() => cmd('task')}     title="Task list">       <i class="bi bi-check2-square"></i></button>
    <button class="tb {isQuote?'on':''}"   on:click={() => cmd('quote')}    title="Blockquote">     <i class="bi bi-chat-square-quote"></i></button>
    <button class="tb {isCodeBlk?'on':''}" on:click={() => cmd('codeBlock')} title="Code block">    <i class="bi bi-code-slash"></i></button>
  </div>

  <div class="sep"></div>

  <!-- Alignment -->
  <div class="tb-group tb-mobile-hide">
    <button class="tb {isAlignL?'on':''}" on:click={() => cmd('alignLeft')}    title="Align left">    <i class="bi bi-text-left"></i></button>
    <button class="tb {isAlignC?'on':''}" on:click={() => cmd('alignCenter')}  title="Align center">  <i class="bi bi-text-center"></i></button>
    <button class="tb {isAlignR?'on':''}" on:click={() => cmd('alignRight')}   title="Align right">   <i class="bi bi-text-right"></i></button>
    <button class="tb"                    on:click={() => cmd('alignJustify')}  title="Justify">       <i class="bi bi-justify"></i></button>
  </div>

  <div class="sep tb-mobile-hide"></div>

  <!-- Link -->
  <div class="tb-group">
    {#if showLinkInput}
      <form class="link-row" on:submit|preventDefault={setLink} on:click|stopPropagation>
        <input class="link-input" bind:value={linkUrl} placeholder="https://..." />
        <button type="submit"  class="tb on"><i class="bi bi-check-lg"></i></button>
        <button type="button"  class="tb" on:click={() => { showLinkInput = false; linkUrl = ''; }}><i class="bi bi-x-lg"></i></button>
      </form>
    {:else}
      <button class="tb {isLink?'on':''}" title="Link"
        on:click|stopPropagation={() => { showLinkInput = true; linkUrl = editor?.getAttributes('link')?.href || ''; }}>
        <i class="bi bi-link-45deg"></i>
      </button>
    {/if}
  </div>

  <!-- Insert -->
  <div class="tb-group">
    <button class="tb" on:click|stopPropagation={openInsert} title="Insert">
      <i class="bi bi-plus-circle"></i>
      <i class="bi bi-chevron-down caret"></i>
    </button>
  </div>

  <div class="sep"></div>

  <!-- Quick Voice Input -->
  <div class="tb-group">
    <QuickVoiceInput
      on:transcribed
    />
  </div>

  <div class="sep"></div>

  <!-- Zoom -->
  <div class="tb-group">
    <button class="tb" on:click={zoomOut} disabled={fontSize <= MIN_FONT} title="Zoom out (⌘-)">
      <i class="bi bi-zoom-out"></i>
    </button>
    <button class="zoom-label" on:click={zoomReset} title="Reset zoom">
      {Math.round((fontSize / 16) * 100)}%
    </button>
    <button class="tb" on:click={zoomIn} disabled={fontSize >= MAX_FONT} title="Zoom in (⌘+)">
      <i class="bi bi-zoom-in"></i>
    </button>
  </div>

</div>

<!-- ── Portal dropdowns — position:fixed, outside overflow ── -->

{#if fontAnchor}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="portal" style="left:{fontAnchor.left}px;top:{fontAnchor.bottom+4}px;min-width:190px"
    on:click|stopPropagation on:mousedown|preventDefault>
    {#each FONTS as f}
      <button class="p-item" style="font-family:{f.value}" on:click={() => { cmd('font', f.value); closeAll(); }}>
        {f.label}
      </button>
    {/each}
  </div>
{/if}

{#if colorAnchor}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="portal" style="left:{colorAnchor.left}px;top:{colorAnchor.bottom+4}px;min-width:200px"
    on:click|stopPropagation on:mousedown|preventDefault>
    <div class="p-section-label">Text color</div>
    <div class="p-swatch-row">
      {#each TEXT_COLORS as c}
        <button class="p-swatch" style="background:{c}" title={c}
          on:click={() => { cmd('color', c); closeAll(); }}></button>
      {/each}
    </div>
    <div class="p-section-label" style="margin-top:8px">Highlight</div>
    <div class="p-swatch-row">
      {#each HIGHLIGHTS as c}
        <button class="p-swatch rounded" style="background:{c}" title={c}
          on:click={() => { cmd('highlight', c); closeAll(); }}></button>
      {/each}
    </div>
    <div class="p-divider"></div>
    <button class="p-item danger" on:click={() => { cmd('clearFmt'); closeAll(); }}>
      <i class="bi bi-eraser"></i> Clear formatting
    </button>
  </div>
{/if}

{#if insertAnchor}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="portal" style="left:{insertAnchor.left}px;top:{insertAnchor.bottom+4}px;min-width:200px"
    on:click|stopPropagation on:mousedown|preventDefault>
    <button class="p-item" on:click={insertImage}>
      <i class="bi bi-image"></i> Image
    </button>
    <button class="p-item" on:click={() => { cmd('table'); closeAll(); }}>
      <i class="bi bi-table"></i> Table (3×3)
    </button>
    <button class="p-item" on:click={() => { cmd('hr'); closeAll(); }}>
      <i class="bi bi-dash-lg"></i> Horizontal divider
    </button>
    <button class="p-item" on:click={() => { editor?.chain().focus().insertDrawio().run(); closeAll(); }}>
      <i class="bi bi-diagram-3"></i> Draw.io diagram
    </button>
    <div class="p-divider"></div>
    <button class="p-item" on:click={openPPTImport} disabled={importing}>
      <i class="bi bi-file-earmark-ppt"></i> {importing ? 'Importing...' : 'Import PowerPoint'}
    </button>
    <button class="p-item" on:click={openMarkdownImport} disabled={importingMd}>
      <i class="bi bi-markdown"></i> {importingMd ? 'Importing...' : 'Import Markdown'}
    </button>
  </div>
{/if}

<style>
  .editor-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;          /* wrap ke baris bawah saat sempit */
    min-height: var(--toolbar-height, 48px);
    padding: 4px 12px;
    gap: 1px;
    row-gap: 4px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
    /* No overflow: hidden/auto — dropdowns use position:fixed portals */
  }

  @media (max-width: 768px) {
    .editor-toolbar {
      padding: 6px 6px;
      gap: 0;
      column-gap: 1px;
    }
    .tb-mobile-hide { display: none !important; }
    .sep { margin: 0 2px; }
  }

  .tb-group { display: flex; align-items: center; gap: 1px; }

  .sep {
    width: 1px; height: 18px;
    background: var(--border-color);
    margin: 0 4px;
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .sep {
      height: 14px;
      margin: 0 2px;
    }
    .sep:nth-child(n + 8) {
      display: none;
    }
  }

  /* Base button */
  .tb {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 2px;
    min-width: 28px; height: 28px; padding: 0 5px;
    border: none; border-radius: 5px; background: none;
    color: var(--text-secondary);
    cursor: pointer; font-size: 14px;
    transition: background 0.1s, color 0.1s;
    flex-shrink: 0;
  }
  .tb:hover    { background: var(--bg-hover); color: var(--text-primary); }
  .tb.on       { background: var(--bg-active); color: var(--accent-color); }
  .tb:disabled { opacity: 0.3; cursor: default; }

  @media (max-width: 768px) {
    .tb {
      min-width: 24px;
      height: 24px;
      padding: 0 4px;
      font-size: 12px;
    }
  }

  .txt  { font-size: 12px; font-weight: 700; }
  .zoom-label {
    font-size: 11px; font-weight: 600; min-width: 36px; text-align: center;
    border: none; background: none; cursor: pointer; color: var(--text-muted);
    padding: 0 2px; border-radius: 4px;
  }
  .zoom-label:hover { background: var(--bg-hover); color: var(--text-primary); }
  .caret { font-size: 8px; }

  .font-btn   { gap: 3px; }
  .font-label { font-size: 13px; font-weight: 600; }

  .color-btn { gap: 3px; }
  .color-a   { font-size: 13px; font-weight: 700; }

  /* Link form */
  .link-row   { display: flex; align-items: center; gap: 3px; }
  .link-input {
    width: 180px; height: 28px; padding: 0 8px;
    border: 1px solid var(--accent-color); border-radius: 5px;
    background: var(--bg-primary); color: var(--text-primary);
    font-size: 12px; outline: none;
  }

  @media (max-width: 768px) {
    .link-input {
      width: 120px;
      min-width: 100px;
      max-width: calc(100vw - 100px);
    }
  }

  /* ── Portals ─────────────────────────────────────────────────────── */
  .portal {
    position: fixed;
    z-index: 9000;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.14);
    padding: 5px;
    animation: dropIn 0.12s ease;
  }

  @keyframes dropIn {
    from { opacity:0; transform:translateY(-4px); }
    to   { opacity:1; transform:translateY(0); }
  }

  .p-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 8px 10px;
    border: none; border-radius: 5px; background: none;
    cursor: pointer; font-size: 13px;
    color: var(--text-primary); text-align: left;
    transition: background 0.1s;
  }
  .p-item:hover { background: var(--bg-hover); }
  .p-item.danger { color: var(--danger-color); }
  .p-item.danger:hover { background: #fee2e2; }

  .p-section-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--text-muted);
    padding: 4px 8px 4px;
  }

  .p-swatch-row { display: flex; gap: 5px; padding: 0 8px 6px; }
  .p-swatch {
    width: 20px; height: 20px; border-radius: 50%;
    border: 1px solid rgba(0,0,0,0.12); cursor: pointer;
    transition: transform 0.1s;
  }
  .p-swatch.rounded { border-radius: 4px; }
  .p-swatch:hover { transform: scale(1.25); }

  .p-divider { border-top: 1px solid var(--border-color); margin: 4px 0; }
</style>
