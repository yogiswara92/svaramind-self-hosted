<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { showLoginPage } from '../stores/auth';

  function goToLogin() {
    showLoginPage.set(true);
  }

  let visible = false;
  let scrollY = 0;

  onMount(() => {
    visible = true;
    window.addEventListener('scroll', () => scrollY = window.scrollY);
  });

  const features = [
    {
      icon: 'bi-stars',
      title: 'AI Assistant',
      desc: 'Chat directly with your notes. Ask questions, get summaries, and extract insights from everything you\'ve written.',
      color: '#6366f1'
    },
    {
      icon: 'bi-diagram-3',
      title: 'Knowledge Graph',
      desc: 'See how your ideas connect. A living map that grows with every note, revealing patterns you never knew existed.',
      color: '#0ea5e9'
    },
    {
      icon: 'bi-mic',
      title: 'Voice to Text',
      desc: 'Capture thoughts hands-free. Record meetings, lectures, or ideas on the go instantly transcribed and searchable.',
      color: '#ec4899'
    },
    {
      icon: 'bi-search',
      title: 'Semantic Search',
      desc: 'Find anything by meaning, not just keywords. Powered by vector embeddings that understand context.',
      color: '#f59e0b'
    },
    {
      icon: 'bi-link-45deg',
      title: 'Wiki Links',
      desc: 'Connect notes with [[double brackets]]. Build a personal wiki where every idea can reference any other.',
      color: '#10b981'
    },
    {
      icon: 'bi-shield-lock',
      title: 'Private & Secure',
      desc: 'Fully encrypted in transit and at rest. Your notes never leave your own database. No training, no sharing, no ads.',
      color: '#8b5cf6'
    }
  ];

  const steps = [
    {
      num: '01',
      title: 'Capture Everything',
      desc: 'Rich text, voice record, diagrams, images, anything your mind produces, Svaramind holds it.',
      icon: 'bi-pencil-square'
    },
    {
      num: '02',
      title: 'Connect Ideas',
      desc: 'Link notes with wiki links, tag topics, and let the knowledge graph reveal hidden connections.',
      icon: 'bi-share'
    },
    {
      num: '03',
      title: 'Converse with Knowledge',
      desc: 'Ask your AI assistant anything. It reads your notes and answers with your own context in mind.',
      icon: 'bi-chat-dots'
    }
  ];
</script>

<svelte:window bind:scrollY />

<div class="landing">
  <!-- Nav -->
  <nav class="nav" class:nav-scrolled={scrollY > 40}>
    <div class="nav-inner">
      <a href="/" class="nav-logo">
        <img src="/SvaraMind%20Logo.png" alt="Svaramind" class="nav-logo-img" />
      </a>
      <div class="nav-links">
        <a href="#features" class="nav-link">Features</a>
        <a href="#how-it-works" class="nav-link">How it works</a>
      </div>
      <button class="btn-signin" on:click={() => goToLogin()}>
        Sign In <i class="bi bi-arrow-right"></i>
      </button>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-bg">
      <div class="hero-orb hero-orb-1"></div>
      <div class="hero-orb hero-orb-2"></div>
      <div class="hero-orb hero-orb-3"></div>
    </div>

    {#if visible}
      <div class="hero-content" in:fly={{ y: 32, duration: 700, delay: 100 }}>
        <div class="hero-badge">
          <i class="bi bi-stars"></i> AI-Powered Second Brain
        </div>
        <h1 class="hero-title">
          Think less.<br/>
          <span class="hero-gradient">Remember everything.</span>
        </h1>
        <p class="hero-sub">
          Svaramind captures your ideas, connects your knowledge, and lets you
          <strong>converse with everything you've ever written</strong>. So your second
          brain is always one question away.
        </p>
        <div class="hero-cta">
          <button class="btn-primary" on:click={() => goToLogin()}>
            <i class="bi bi-lightning-charge-fill"></i> Get Started Free
          </button>
          <a href="#features" class="btn-ghost">
            See features <i class="bi bi-chevron-down"></i>
          </a>
        </div>
      </div>

      <!-- App mockup -->
      <div class="mockup-wrap" in:fly={{ y: 48, duration: 800, delay: 300 }}>
        <div class="mockup">
          <!-- Sidebar -->
          <div class="mock-sidebar">
            <div class="mock-logo-row">
              <div class="mock-dot" style="background:#6366f1"></div>
              <div class="mock-line short" style="width:60px"></div>
            </div>
            <div class="mock-nav-items">
              <div class="mock-nav-item active"><div class="mock-dot" style="background:#0ea5e9;width:10px;height:10px"></div><div class="mock-line" style="width:50px"></div></div>
              <div class="mock-nav-item"><div class="mock-dot" style="background:rgba(255,255,255,.2)"></div><div class="mock-line" style="width:40px;opacity:.5"></div></div>
              <div class="mock-nav-item"><div class="mock-dot" style="background:rgba(255,255,255,.2)"></div><div class="mock-line" style="width:55px;opacity:.5"></div></div>
              <div class="mock-nav-item"><div class="mock-dot" style="background:rgba(255,255,255,.2)"></div><div class="mock-line" style="width:45px;opacity:.5"></div></div>
            </div>
            <div class="mock-divider"></div>
            <div class="mock-notes-list">
              {#each [72, 58, 80, 64, 50, 68] as w}
                <div class="mock-note-item">
                  <div class="mock-dot" style="background:rgba(255,255,255,.15);width:8px;height:8px"></div>
                  <div class="mock-line" style="width:{w}px;opacity:.4"></div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Editor -->
          <div class="mock-editor">
            <div class="mock-toolbar">
              {#each [28, 28, 28, 28, 28, 28] as _}
                <div class="mock-tool"></div>
              {/each}
              <div class="mock-tool-sep"></div>
              {#each [28, 28, 28] as _}
                <div class="mock-tool"></div>
              {/each}
            </div>
            <div class="mock-content">
              <div class="mock-h1"></div>
              <div class="mock-paragraph">
                {#each [100, 88, 95, 76] as w}
                  <div class="mock-text-line" style="width:{w}%"></div>
                {/each}
              </div>
              <div class="mock-h2"></div>
              <div class="mock-paragraph">
                {#each [92, 85, 97, 60] as w}
                  <div class="mock-text-line" style="width:{w}%"></div>
                {/each}
              </div>
              <div class="mock-blockquote">
                {#each [88, 72] as w}
                  <div class="mock-text-line" style="width:{w}%"></div>
                {/each}
              </div>
            </div>
          </div>

          <!-- AI Panel -->
          <div class="mock-ai">
            <div class="mock-ai-header">
              <div class="mock-dot" style="background:#6366f1;width:10px;height:10px"></div>
              <div class="mock-line" style="width:60px"></div>
            </div>
            <div class="mock-ai-messages">
              <div class="mock-msg user">
                <div class="mock-text-line" style="width:80%"></div>
                <div class="mock-text-line" style="width:55%"></div>
              </div>
              <div class="mock-msg assistant">
                <div class="mock-text-line" style="width:90%"></div>
                <div class="mock-text-line" style="width:75%"></div>
                <div class="mock-text-line" style="width:60%"></div>
              </div>
              <div class="mock-msg user">
                <div class="mock-text-line" style="width:65%"></div>
              </div>
              <div class="mock-msg assistant typing">
                <span></span><span></span><span></span>
              </div>
            </div>
            <div class="mock-ai-input"></div>
          </div>
        </div>
        <div class="mockup-glow"></div>
      </div>
    {/if}
  </section>

  <!-- Stats strip -->
  <div class="stats-strip">
    <div class="stat-item">
      <i class="bi bi-brain"></i>
      <span>AI-Powered RAG</span>
    </div>
    <div class="stat-sep"></div>
    <div class="stat-item">
      <i class="bi bi-diagram-3"></i>
      <span>Knowledge Graph</span>
    </div>
    <div class="stat-sep"></div>
    <div class="stat-item">
      <i class="bi bi-mic-fill"></i>
      <span>Voice Transcription</span>
    </div>
    <div class="stat-sep"></div>
    <div class="stat-item">
      <i class="bi bi-shield-check"></i>
      <span>Private by Design</span>
    </div>
  </div>

  <!-- Features -->
  <section class="features" id="features">
    <div class="section-label">Features</div>
    <h2 class="section-title">Everything your second brain needs</h2>
    <p class="section-sub">Built for thinkers, researchers, and makers who can't afford to lose a single idea.</p>

    <div class="features-grid">
      {#each features as f, i}
        <div class="feature-card" style="--c:{f.color};animation-delay:{i * 80}ms">
          <div class="feature-icon" style="background:{f.color}18;color:{f.color}">
            <i class="bi {f.icon}"></i>
          </div>
          <h3>{f.title}</h3>
          <p>{f.desc}</p>
        </div>
      {/each}
    </div>
  </section>

  <!-- How it works -->
  <section class="how" id="how-it-works">
    <div class="how-inner">
      <div class="section-label">How it works</div>
      <h2 class="section-title">Three steps to a smarter you</h2>

      <div class="steps">
        {#each steps as s, i}
          <div class="step">
            <div class="step-num">{s.num}</div>
            <div class="step-icon"><i class="bi {s.icon}"></i></div>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
            {#if i < steps.length - 1}
              <div class="step-arrow"><i class="bi bi-arrow-right"></i></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Graph preview section -->
  <section class="graph-section">
    <div class="graph-section-inner">
      <div class="graph-text">
        <div class="section-label">Knowledge Graph</div>
        <h2 class="section-title left">Your ideas, visually connected</h2>
        <p class="section-sub left">
          Every note you write becomes a node. Every wiki link becomes a connection.
          Watch your knowledge grow into a network that reveals insights you'd never
          find by scrolling through a list.
        </p>
        <ul class="graph-bullets">
          <li><i class="bi bi-check-circle-fill"></i> Auto-generated from your notes</li>
          <li><i class="bi bi-check-circle-fill"></i> Click any node to preview and open</li>
          <li><i class="bi bi-check-circle-fill"></i> See clusters of related knowledge</li>
          <li><i class="bi bi-check-circle-fill"></i> Find notes you forgot you wrote</li>
        </ul>
        <button class="btn-primary" on:click={() => goToLogin()}>
          Start connecting <i class="bi bi-arrow-right"></i>
        </button>
      </div>

      <!-- Graph mockup -->
      <div class="graph-mockup">
        <svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg">
          <!-- Edges -->
          <line x1="200" y1="160" x2="100" y2="80" stroke="rgba(99,102,241,.35)" stroke-width="1.5"/>
          <line x1="200" y1="160" x2="310" y2="90" stroke="rgba(14,165,233,.35)" stroke-width="1.5"/>
          <line x1="200" y1="160" x2="320" y2="220" stroke="rgba(16,185,129,.35)" stroke-width="1.5"/>
          <line x1="200" y1="160" x2="90" y2="230" stroke="rgba(245,158,11,.35)" stroke-width="1.5"/>
          <line x1="200" y1="160" x2="200" y2="280" stroke="rgba(236,72,153,.35)" stroke-width="1.5"/>
          <line x1="100" y1="80" x2="55" y2="140" stroke="rgba(99,102,241,.2)" stroke-width="1.2"/>
          <line x1="310" y1="90" x2="370" y2="150" stroke="rgba(14,165,233,.2)" stroke-width="1.2"/>
          <line x1="320" y1="220" x2="370" y2="150" stroke="rgba(16,185,129,.2)" stroke-width="1.2"/>
          <line x1="90" y1="230" x2="55" y2="140" stroke="rgba(245,158,11,.2)" stroke-width="1.2"/>
          <line x1="100" y1="80" x2="310" y2="90" stroke="rgba(139,92,246,.15)" stroke-width="1"/>
          <!-- Secondary nodes -->
          <circle cx="55" cy="140" r="18" fill="rgba(99,102,241,.15)" stroke="rgba(99,102,241,.4)" stroke-width="1.5"/>
          <text x="55" y="144" text-anchor="middle" font-size="9" fill="rgba(99,102,241,.8)">Ideas</text>
          <circle cx="370" cy="150" r="20" fill="rgba(14,165,233,.15)" stroke="rgba(14,165,233,.4)" stroke-width="1.5"/>
          <text x="370" y="154" text-anchor="middle" font-size="9" fill="rgba(14,165,233,.8)">Work</text>
          <!-- Primary nodes -->
          <circle cx="100" cy="80" r="28" fill="rgba(99,102,241,.2)" stroke="rgba(99,102,241,.6)" stroke-width="2"/>
          <text x="100" y="77" text-anchor="middle" font-size="10" fill="rgba(99,102,241,.9)">Meeting</text>
          <text x="100" y="89" text-anchor="middle" font-size="10" fill="rgba(99,102,241,.9)">Notes</text>
          <circle cx="310" cy="90" r="26" fill="rgba(14,165,233,.2)" stroke="rgba(14,165,233,.6)" stroke-width="2"/>
          <text x="310" y="87" text-anchor="middle" font-size="10" fill="rgba(14,165,233,.9)">Research</text>
          <text x="310" y="99" text-anchor="middle" font-size="10" fill="rgba(14,165,233,.9)">2025</text>
          <circle cx="320" cy="220" r="24" fill="rgba(16,185,129,.2)" stroke="rgba(16,185,129,.6)" stroke-width="2"/>
          <text x="320" y="224" text-anchor="middle" font-size="10" fill="rgba(16,185,129,.9)">Projects</text>
          <circle cx="90" cy="230" r="22" fill="rgba(245,158,11,.2)" stroke="rgba(245,158,11,.6)" stroke-width="2"/>
          <text x="90" y="234" text-anchor="middle" font-size="10" fill="rgba(245,158,11,.9)">Journal</text>
          <circle cx="200" cy="280" r="22" fill="rgba(236,72,153,.2)" stroke="rgba(236,72,153,.6)" stroke-width="2"/>
          <text x="200" y="284" text-anchor="middle" font-size="10" fill="rgba(236,72,153,.9)">Goals</text>
          <!-- Center node (main) -->
          <circle cx="200" cy="160" r="38" fill="rgba(99,102,241,.25)" stroke="rgba(99,102,241,.8)" stroke-width="2.5"/>
          <circle cx="200" cy="160" r="32" fill="rgba(99,102,241,.1)" stroke="none"/>
          <text x="200" y="157" text-anchor="middle" font-size="11" font-weight="600" fill="rgba(99,102,241,1)">Second</text>
          <text x="200" y="171" text-anchor="middle" font-size="11" font-weight="600" fill="rgba(99,102,241,1)">Brain</text>
        </svg>
      </div>
    </div>
  </section>

  <!-- AI feature callout -->
  <section class="ai-callout">
    <div class="ai-callout-inner">
      <div class="ai-chat-mockup">
        <div class="chat-header">
          <div class="chat-avatar"><i class="bi bi-stars"></i></div>
          <div>
            <div class="chat-name">Svaramind AI</div>
            <div class="chat-status">Reading your notes…</div>
          </div>
        </div>
        <div class="chat-messages">
          <div class="chat-bubble user">Apa keputusan dari meeting kemarin dengan tim product?</div>
          <div class="chat-bubble ai">
            Berdasarkan catatan meeting 15 Mei, ada 3 keputusan utama:
            <br/><br/>
            <strong>1. Fitur onboarding</strong> — dilaunching Q3, PIC: Dian<br/>
            <strong>2. Redesign dashboard</strong> — wireframe selesai minggu ini<br/>
            <strong>3. Budget API</strong> — disetujui $200/bulan
            <br/><br/>
            <span class="chat-source">📎 Sumber: Meeting Notes 15 Mei, Project Brief Q3</span>
          </div>
          <div class="chat-bubble user">Buatkan action items dalam format checklist</div>
          <div class="chat-bubble ai typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
        <div class="chat-input-mock">
          <span>Ask anything about your notes…</span>
          <i class="bi bi-send"></i>
        </div>
      </div>

      <div class="ai-callout-text">
        <div class="section-label">AI Assistant</div>
        <h2 class="section-title left">Chat with your<br/>entire knowledge base</h2>
        <p class="section-sub left">
          Svaramind's AI reads all your notes and answers questions in context.
          No more digging through folders, just ask.
        </p>
        <ul class="graph-bullets">
          <li><i class="bi bi-check-circle-fill"></i> Powered by RAG, answers from your actual notes</li>
          <li><i class="bi bi-check-circle-fill"></i> Summarize long notes instantly</li>
          <li><i class="bi bi-check-circle-fill"></i> Extract action items & key points</li>
          <li><i class="bi bi-check-circle-fill"></i> Works in Bahasa Indonesia & English</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta">
    <div class="cta-orb cta-orb-1"></div>
    <div class="cta-orb cta-orb-2"></div>
    <div class="cta-inner">
      <i class="bi bi-brain cta-icon"></i>
      <h2>Start building your<br/><span class="hero-gradient">second brain today</span></h2>
      <p>Free to use. Same account as Yesvara.</p>
      <button class="btn-primary btn-large" on:click={() => goToLogin()}>
        <i class="bi bi-lightning-charge-fill"></i> Get Started Free
      </button>
      <p class="cta-hint">Already have a Yesvara account? <button class="link-btn" on:click={() => goToLogin()}>Sign in here →</button></p>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-inner">
      <img src="/SvaraMind%20Logo.png" alt="Svaramind" class="footer-logo" />
      <p class="footer-copy">© {new Date().getFullYear()} Svaramind · Built by Yesvara</p>
      <div class="footer-links">
        <a href="https://yesvara.com" target="_blank" rel="noopener">Yesvara</a>
        <span>·</span>
        <button class="link-btn" on:click={() => goToLogin()}>Sign In</button>
      </div>
    </div>
  </footer>
</div>

<style>
  :global(html) { scroll-behavior: smooth; }

  .landing {
    min-height: 100vh;
    background: #0a0b14;
    color: #e2e8f0;
    font-family: 'Inter', -apple-system, sans-serif;
    overflow-x: hidden;
  }

  /* ── Nav ── */
  .nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 100;
    padding: 16px 0;
    transition: all 0.3s;
    /* Always show a dark base so hero text never bleeds into nav */
    background: rgba(10, 11, 20, 0.75);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255,255,255,.04);
  }
  .nav-scrolled {
    background: rgba(10, 11, 20, 0.95);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255,255,255,.08);
    padding: 12px 0;
  }
  .nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 32px;
    display: flex;
    align-items: center;
    gap: 32px;
  }
  .nav-logo { display: flex; align-items: center; text-decoration: none; }
  .nav-logo-img { height: 32px; object-fit: contain; filter: brightness(0) invert(1); }
  .nav-links { display: flex; gap: 24px; flex: 1; }
  .nav-link {
    color: rgba(255,255,255,.55);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: color .2s;
  }
  .nav-link:hover { color: #fff; }
  .btn-signin {
    background: rgba(255,255,255,.08);
    border: 1px solid rgba(255,255,255,.12);
    color: #fff;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all .2s;
    font-family: inherit;
  }
  .btn-signin:hover { background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.2); }

  /* ── Hero ── */
  .hero {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 160px 32px 80px;
    position: relative;
    overflow: hidden;
    text-align: center;
  }
  .hero-bg { position: absolute; inset: 0; pointer-events: none; }
  .hero-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.25;
  }
  .hero-orb-1 { width: 600px; height: 600px; background: #6366f1; top: -200px; left: -200px; }
  .hero-orb-2 { width: 500px; height: 500px; background: #0ea5e9; bottom: -100px; right: -100px; }
  .hero-orb-3 { width: 300px; height: 300px; background: #ec4899; top: 40%; left: 50%; transform: translateX(-50%); opacity: .12; }

  .hero-content { position: relative; z-index: 2; max-width: 720px; }
  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(99,102,241,.15);
    border: 1px solid rgba(99,102,241,.3);
    color: #a5b4fc;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 28px;
  }
  .hero-title {
    font-size: clamp(2rem, 5vw, 3.4rem);
    font-weight: 800;
    line-height: 1.1;
    margin: 0 0 24px;
    letter-spacing: -0.02em;
    color: #fff;
  }
  .hero-gradient {
    background: linear-gradient(135deg, #6366f1 0%, #0ea5e9 50%, #10b981 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .hero-sub {
    font-size: 1.1rem;
    color: rgba(255,255,255,.6);
    line-height: 1.7;
    margin: 0 0 40px;
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }
  .hero-cta { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }

  /* Buttons */
  .btn-primary {
    background: linear-gradient(135deg, #6366f1, #0ea5e9);
    color: #fff;
    border: none;
    padding: 13px 28px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all .25s;
    font-family: inherit;
    text-decoration: none;
    box-shadow: 0 4px 24px rgba(99,102,241,.35);
  }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(99,102,241,.45); }
  .btn-large { padding: 16px 36px; font-size: 16px; }
  .btn-ghost {
    background: transparent;
    border: 1px solid rgba(255,255,255,.15);
    color: rgba(255,255,255,.7);
    padding: 13px 24px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all .2s;
    font-family: inherit;
    text-decoration: none;
  }
  .btn-ghost:hover { border-color: rgba(255,255,255,.3); color: #fff; background: rgba(255,255,255,.05); }

  /* ── App Mockup ── */
  .mockup-wrap {
    position: relative;
    margin-top: 64px;
    width: 100%;
    max-width: 900px;
    z-index: 2;
  }
  .mockup {
    display: flex;
    height: 420px;
    background: #13141f;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,.1);
    overflow: hidden;
    box-shadow: 0 32px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05);
  }
  .mockup-glow {
    position: absolute;
    bottom: -60px; left: 50%; transform: translateX(-50%);
    width: 80%;
    height: 60px;
    background: radial-gradient(ellipse, rgba(99,102,241,.4) 0%, transparent 70%);
    filter: blur(20px);
  }

  .mock-sidebar {
    width: 180px;
    flex-shrink: 0;
    background: #0d0e1a;
    padding: 16px 12px;
    border-right: 1px solid rgba(255,255,255,.06);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .mock-logo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .mock-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .mock-line { height: 8px; background: rgba(255,255,255,.15); border-radius: 4px; }
  .mock-line.short { width: 48px; }
  .mock-nav-items { display: flex; flex-direction: column; gap: 4px; }
  .mock-nav-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; }
  .mock-nav-item.active { background: rgba(99,102,241,.15); }
  .mock-divider { height: 1px; background: rgba(255,255,255,.06); margin: 4px 0; }
  .mock-notes-list { display: flex; flex-direction: column; gap: 6px; }
  .mock-note-item { display: flex; align-items: center; gap: 6px; padding: 3px 8px; }

  .mock-editor { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .mock-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,.06);
    background: #0f1020;
  }
  .mock-tool { width: 22px; height: 22px; background: rgba(255,255,255,.08); border-radius: 4px; flex-shrink: 0; }
  .mock-tool-sep { width: 1px; height: 16px; background: rgba(255,255,255,.1); margin: 0 4px; }
  .mock-content { flex: 1; padding: 20px 24px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  .mock-h1 { height: 18px; background: rgba(255,255,255,.2); border-radius: 4px; width: 55%; }
  .mock-h2 { height: 14px; background: rgba(255,255,255,.15); border-radius: 4px; width: 40%; margin-top: 6px; }
  .mock-paragraph { display: flex; flex-direction: column; gap: 6px; }
  .mock-text-line { height: 8px; background: rgba(255,255,255,.07); border-radius: 3px; }
  .mock-blockquote {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 12px;
    border-left: 2px solid rgba(99,102,241,.5);
    margin-top: 6px;
  }

  .mock-ai {
    width: 200px;
    flex-shrink: 0;
    background: #0d0e1a;
    border-left: 1px solid rgba(255,255,255,.06);
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 10px;
  }
  .mock-ai-header { display: flex; align-items: center; gap: 8px; }
  .mock-ai-messages { flex: 1; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
  .mock-msg { display: flex; flex-direction: column; gap: 4px; }
  .mock-msg.user { align-items: flex-end; }
  .mock-msg.user .mock-text-line { background: rgba(99,102,241,.25); }
  .mock-msg.assistant .mock-text-line { background: rgba(255,255,255,.07); }
  .mock-msg.typing { flex-direction: row; gap: 4px; align-items: center; padding: 8px; background: rgba(255,255,255,.04); border-radius: 8px; }
  .mock-msg.typing span { width: 5px; height: 5px; background: rgba(99,102,241,.7); border-radius: 50%; animation: typingDot .9s infinite; }
  .mock-msg.typing span:nth-child(2) { animation-delay: .2s; }
  .mock-msg.typing span:nth-child(3) { animation-delay: .4s; }
  .mock-ai-input { height: 28px; background: rgba(255,255,255,.06); border-radius: 6px; border: 1px solid rgba(255,255,255,.08); }

  @keyframes typingDot {
    0%, 60%, 100% { transform: translateY(0); opacity: .4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  /* ── Stats Strip ── */
  .stats-strip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 20px 32px;
    background: rgba(255,255,255,.03);
    border-top: 1px solid rgba(255,255,255,.06);
    border-bottom: 1px solid rgba(255,255,255,.06);
    flex-wrap: wrap;
  }
  .stat-item { display: flex; align-items: center; gap: 8px; padding: 8px 32px; font-size: 14px; font-weight: 500; color: rgba(255,255,255,.65); }
  .stat-item i { color: #6366f1; font-size: 16px; }
  .stat-sep { width: 1px; height: 28px; background: rgba(255,255,255,.1); }

  /* ── Sections ── */
  .section-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #6366f1;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #fff;
    margin: 0 0 16px;
    line-height: 1.2;
  }
  .section-title.left { text-align: left; }
  .section-sub {
    font-size: 1rem;
    color: rgba(255,255,255,.55);
    line-height: 1.7;
    max-width: 520px;
    margin: 0 auto 48px;
  }
  .section-sub.left { margin: 0 0 24px; text-align: left; }

  /* ── Features ── */
  .features {
    padding: 100px 32px;
    max-width: 1100px;
    margin: 0 auto;
    text-align: center;
  }
  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
  }
  .feature-card {
    background: rgba(255,255,255,.03);
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 14px;
    padding: 28px 24px;
    text-align: left;
    transition: all .25s;
    position: relative;
    overflow: hidden;
  }
  .feature-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--c), transparent);
    opacity: 0;
    transition: opacity .25s;
  }
  .feature-card:hover { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.12); transform: translateY(-4px); }
  .feature-card:hover::before { opacity: 1; }
  .feature-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    margin-bottom: 16px;
  }
  .feature-card h3 { font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .feature-card p { font-size: 14px; color: rgba(255,255,255,.5); line-height: 1.6; margin: 0; }

  /* ── How it works ── */
  .how {
    padding: 100px 32px;
    background: rgba(99,102,241,.04);
    border-top: 1px solid rgba(99,102,241,.1);
    border-bottom: 1px solid rgba(99,102,241,.1);
  }
  .how-inner { max-width: 1000px; margin: 0 auto; text-align: center; }
  .steps { display: flex; gap: 0; justify-content: center; align-items: flex-start; flex-wrap: wrap; position: relative; }
  .step {
    flex: 1;
    min-width: 200px;
    max-width: 280px;
    padding: 0 24px;
    text-align: center;
    position: relative;
  }
  .step-num {
    font-size: 48px;
    font-weight: 900;
    color: rgba(99,102,241,.15);
    line-height: 1;
    margin-bottom: 12px;
    font-variant-numeric: tabular-nums;
  }
  .step-icon {
    width: 56px;
    height: 56px;
    background: rgba(99,102,241,.15);
    border: 1px solid rgba(99,102,241,.3);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #a5b4fc;
    margin: 0 auto 16px;
  }
  .step h3 { font-size: 1.1rem; font-weight: 700; color: #fff; margin: 0 0 10px; }
  .step p { font-size: 14px; color: rgba(255,255,255,.5); line-height: 1.6; margin: 0; }
  .step-arrow {
    position: absolute;
    top: 80px;
    right: -10px;
    color: rgba(99,102,241,.4);
    font-size: 20px;
    z-index: 1;
  }

  /* ── Graph Section ── */
  .graph-section {
    padding: 100px 32px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .graph-section-inner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: center;
  }
  .graph-text { order: 1; }
  .graph-mockup { order: 2; }
  .graph-mockup svg {
    width: 100%;
    height: auto;
    background: rgba(255,255,255,.02);
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 16px;
    padding: 16px;
  }
  .graph-bullets { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 10px; }
  .graph-bullets li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: rgba(255,255,255,.65); }
  .graph-bullets li i { color: #10b981; flex-shrink: 0; }

  /* ── AI Callout ── */
  .ai-callout {
    padding: 100px 32px;
    background: rgba(255,255,255,.02);
    border-top: 1px solid rgba(255,255,255,.05);
    border-bottom: 1px solid rgba(255,255,255,.05);
  }
  .ai-callout-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: center;
  }
  .ai-chat-mockup {
    background: #13141f;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,.4);
  }
  .chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,.07);
    background: #0d0e1a;
  }
  .chat-avatar {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #6366f1, #0ea5e9);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #fff;
    flex-shrink: 0;
  }
  .chat-name { font-size: 13px; font-weight: 600; color: #fff; }
  .chat-status { font-size: 11px; color: rgba(255,255,255,.4); }
  .chat-messages { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .chat-bubble {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
  }
  .chat-bubble.user {
    background: rgba(99,102,241,.2);
    border: 1px solid rgba(99,102,241,.3);
    color: #c7d2fe;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }
  .chat-bubble.ai {
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.08);
    color: rgba(255,255,255,.8);
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }
  .chat-source { font-size: 11px; color: rgba(255,255,255,.35); display: block; margin-top: 8px; }
  .typing-indicator {
    display: flex;
    gap: 5px;
    align-items: center;
    padding: 12px 14px;
  }
  .typing-indicator span {
    width: 6px; height: 6px;
    background: rgba(99,102,241,.7);
    border-radius: 50%;
    animation: typingDot .9s infinite;
  }
  .typing-indicator span:nth-child(2) { animation-delay: .2s; }
  .typing-indicator span:nth-child(3) { animation-delay: .4s; }
  .chat-input-mock {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-top: 1px solid rgba(255,255,255,.07);
    font-size: 13px;
    color: rgba(255,255,255,.25);
  }
  .chat-input-mock i { color: rgba(99,102,241,.6); }

  /* ── CTA ── */
  .cta {
    padding: 120px 32px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .cta-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.2;
    pointer-events: none;
  }
  .cta-orb-1 { width: 400px; height: 400px; background: #6366f1; top: -100px; left: -100px; }
  .cta-orb-2 { width: 400px; height: 400px; background: #0ea5e9; bottom: -100px; right: -100px; }
  .cta-inner { position: relative; z-index: 1; }
  .cta-icon { font-size: 3rem; background: linear-gradient(135deg, #6366f1, #0ea5e9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; display: block; margin-bottom: 24px; }
  .cta h2 { font-size: clamp(2rem, 5vw, 3rem); font-weight: 800; letter-spacing: -.02em; color: #fff; margin: 0 0 16px; line-height: 1.2; }
  .cta p { font-size: 16px; color: rgba(255,255,255,.45); margin: 0 0 40px; }
  .cta-hint { font-size: 14px; color: rgba(255,255,255,.35); margin-top: 20px; }

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    color: #a5b4fc;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* ── Footer ── */
  .footer {
    padding: 32px;
    border-top: 1px solid rgba(255,255,255,.06);
    background: #0d0e1a;
  }
  .footer-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .footer-logo { height: 24px; object-fit: contain; opacity: .7; filter: brightness(0) invert(1); }
  .footer-copy { font-size: 13px; color: rgba(255,255,255,.3); margin: 0; }
  .footer-links { display: flex; align-items: center; gap: 12px; font-size: 13px; color: rgba(255,255,255,.35); }
  .footer-links a { color: rgba(255,255,255,.45); text-decoration: none; }
  .footer-links a:hover { color: #fff; }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .nav-links { display: none; }
    .nav-inner { padding: 0 20px; }
    .hero { padding: 100px 20px 60px; }
    .mockup { height: 240px; }
    .mock-ai { display: none; }
    .mock-sidebar { width: 120px; }
    .stats-strip { gap: 0; }
    .stat-item { padding: 8px 16px; font-size: 12px; }
    .stat-sep { display: none; }
    .features { padding: 64px 20px; }
    .how { padding: 64px 20px; }
    .step-arrow { display: none; }
    .graph-section { padding: 64px 20px; }
    .graph-section-inner { grid-template-columns: 1fr; gap: 40px; }
    .graph-text { order: 2; }
    .graph-mockup { order: 1; }
    .ai-callout { padding: 64px 20px; }
    .ai-callout-inner { grid-template-columns: 1fr; gap: 40px; }
    .cta { padding: 80px 20px; }
    .footer-inner { flex-direction: column; text-align: center; }
  }
</style>
