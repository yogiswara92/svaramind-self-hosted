<script lang="ts">
  import NotesLayout from '../components/NotesLayout.svelte';

  const links = [
    { icon: 'bi-github', label: 'GitHub', value: 'yogiswara92', href: 'https://github.com/yogiswara92' },
    { icon: 'bi-envelope', label: 'Email', value: 'yogiswaragheartha@gmail.com', href: 'mailto:yogiswaragheartha@gmail.com' },
    { icon: 'bi-linkedin', label: 'LinkedIn', value: 'IGB Yogiswara Gheartha, S.T., M.M.T.', href: 'https://www.linkedin.com/in/igb-yogiswara-gheartha-st-mmt-969b6b117/' },
    { icon: 'bi-instagram', label: 'Instagram', value: '@yogiswara92', href: 'https://instagram.com/yogiswara92' }
  ];
</script>

<NotesLayout currentPage="about">
  <div class="about-page">
    <div class="about-header">
      <h2><i class="bi bi-info-circle"></i> About</h2>
    </div>

    <div class="about-content">
      <div class="about-card">
        <img src="/SvaraMind%20Logo.png" alt="Svaramind" class="svaramind-logo about-logo" />
        <p class="about-desc">
          Svaramind Local is a standalone, closed-loop deployment of the Svaramind notes app,
          built and maintained by the developer below.
        </p>

        <div class="about-links">
          {#each links as link}
            <a class="about-link" href={link.href} target="_blank" rel="noopener noreferrer">
              <i class="bi {link.icon}"></i>
              <div class="about-link-text">
                <span class="about-link-label">{link.label}</span>
                <span class="about-link-value">{link.value}</span>
              </div>
              <i class="bi bi-box-arrow-up-right about-link-external"></i>
            </a>
          {/each}
        </div>

        <div class="about-license">
          <div class="about-license-row">
            <i class="bi bi-file-earmark-text"></i>
            <span>Licensed under the <strong>GNU General Public License v3 (GPLv3)</strong> &copy; 2026 IGB Yogiswara Gheartha</span>
          </div>
          <p class="about-license-note">
            GPLv3 is a copyleft license: you are free to use, study, modify, and redistribute this
            software, but any distributed modified version must also be open source under GPLv3,
            with its source code made available. There is no warranty of any kind.
          </p>
        </div>
      </div>
    </div>
  </div>
</NotesLayout>

<style>
  .about-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .about-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }
  .about-header h2 { margin: 0; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 10px; }

  .about-content { flex: 1; overflow-y: auto; padding: 24px; display: flex; justify-content: center; }

  .about-card {
    max-width: 440px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
  }

  .about-logo { height: 44px; width: auto; object-fit: contain; margin-bottom: 8px; }

  .about-desc {
    font-size: 13.5px;
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .about-links {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .about-link {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    text-decoration: none;
    color: var(--text-primary);
    transition: all 0.15s;
    text-align: left;
  }
  .about-link:hover { border-color: var(--accent-color); background: var(--bg-hover); }
  .about-link i:first-child { font-size: 20px; color: var(--accent-color); flex-shrink: 0; width: 22px; text-align: center; }

  .about-link-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .about-link-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  .about-link-value { font-size: 13.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .about-link-external { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }

  .about-license {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
    font-size: 12px;
    color: var(--text-muted);
    text-align: left;
  }
  .about-license-row { display: flex; align-items: center; gap: 8px; }
  .about-license-row i { font-size: 14px; flex-shrink: 0; }
  .about-license-note { margin-top: 8px; line-height: 1.6; }
</style>
