<script lang="ts">
  import { onMount } from 'svelte';
  import { blogApi } from '../lib/api';
  import { getSession } from '../lib/auth';

  export let username: string = '';

  let profile: any = null;
  let articles: any[] = [];
  let loading = true;
  let error = '';
  let isOwner = false;

  onMount(async () => {
    try {
      const blogData = await blogApi.getProfile(username);
      profile = blogData.profile;
      articles = blogData.articles || [];

      const session = getSession();
      isOwner = session?.user?.user_metadata?.username === username;
    } catch (err: any) {
      error = err.message || 'Blog not found';
    } finally {
      loading = false;
    }
  });

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function readTime(minutes: number, wordCount: number) {
    const m = minutes || Math.max(1, Math.ceil((wordCount || 0) / 200));
    return `${m} min read`;
  }
</script>

<svelte:head>
  <title>{profile?.full_name || profile?.username ? (profile.full_name || profile.username) + ' — Svaramind' : 'Blog'}</title>
</svelte:head>

<div class="blog-root">
  <!-- Nav -->
  <nav class="blog-nav">
    <a href="/" class="blog-nav-brand">
      <img src="/SvaraMind%20Logo.png" alt="Svaramind" width="120" height="28" style="height:28px;width:auto;object-fit:contain;display:block" />
    </a>
    {#if isOwner}
      <a href="/" class="blog-nav-edit-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Manage blog
      </a>
    {/if}
  </nav>

  {#if loading}
    <div class="blog-loading">
      <div class="blog-spinner"></div>
    </div>

  {:else if error}
    <div class="blog-error">
      <h1>404</h1>
      <p>{error}</p>
    </div>

  {:else}
    <!-- Profile header -->
    <header class="blog-profile">
      <div class="blog-profile-inner">
        {#if profile?.avatar_url}
          <img src={profile.avatar_url} alt={profile.full_name || username} class="blog-avatar" />
        {:else}
          <div class="blog-avatar-placeholder">{(profile?.full_name || profile?.username || username || '?')[0].toUpperCase()}</div>
        {/if}
        <div>
          <h1 class="blog-profile-name">{profile?.full_name || profile?.username || username}</h1>
          {#if profile?.blog_bio}
            <p class="blog-profile-bio">{profile.blog_bio}</p>
          {/if}
          <p class="blog-profile-count">{articles.length} article{articles.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </header>

    <!-- Article list -->
    <main class="blog-main">
      {#if articles.length === 0}
        <div class="blog-empty">
          <p>No published articles yet.</p>
        </div>
      {:else}
        <div class="blog-list">
          {#each articles as article}
            <a href="/{username}/{article.public_slug || article.id}" class="blog-card">
              {#if article.cover_image}
                <div class="blog-card-cover" style="background-image:url({article.cover_image})"></div>
              {/if}
              <div class="blog-card-body">
                <h2 class="blog-card-title">{article.title || 'Untitled'}</h2>
                {#if article.excerpt}
                  <p class="blog-card-excerpt">{article.excerpt}</p>
                {/if}
                <div class="blog-card-meta">
                  <span>{formatDate(article.published_at)}</span>
                  <span class="blog-meta-dot">·</span>
                  <span>{readTime(article.read_time_minutes, article.word_count)}</span>
                  {#if article.views}
                    <span class="blog-meta-dot">·</span>
                    <span>{article.views} views</span>
                  {/if}
                </div>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </main>
  {/if}

  <footer class="blog-footer">
    <span>Written with</span>
    <span>Svaramind</span>
  </footer>
</div>

<style>
  :global(body) { margin: 0; font-family: 'Georgia', serif; background: #fff; color: #1a1a1a; }

  .blog-root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Nav */
  .blog-nav {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 24px;
    height: 56px;
    min-height: 56px;
    max-height: 56px;
    flex-shrink: 0;
    border-bottom: 1px solid #e8e8e8;
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(8px);
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    line-height: 1;
    box-sizing: border-box;
    overflow: hidden;
  }
  .blog-nav-brand { display: flex; align-items: center; text-decoration: none; }
  .blog-nav-edit-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: #132578;
    text-decoration: none;
    padding: 6px 12px;
    border: 1px solid #132578;
    border-radius: 6px;
    transition: all 0.15s;
  }
  .blog-nav-edit-btn:hover { background: #132578; color: #fff; }

  /* Loading / error */
  .blog-loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 80px 0;
  }
  .blog-spinner {
    width: 32px; height: 32px;
    border: 3px solid #e8e8e8;
    border-top-color: #1a1a1a;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .blog-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 24px;
    text-align: center;
  }
  .blog-error h1 { font-size: 72px; font-weight: 700; margin: 0 0 12px; color: #e8e8e8; font-family: 'Inter', sans-serif; }
  .blog-error p { font-size: 16px; color: #666; }

  /* Profile */
  .blog-profile {
    border-bottom: 1px solid #e8e8e8;
    padding: 48px 24px 40px;
  }
  .blog-profile-inner {
    max-width: 680px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .blog-avatar {
    width: 72px; height: 72px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    border: 2px solid #e8e8e8;
  }
  .blog-avatar-placeholder {
    width: 72px; height: 72px;
    border-radius: 50%;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 700;
    font-family: 'Inter', sans-serif;
    flex-shrink: 0;
  }
  .blog-profile-name {
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 6px;
    font-family: 'Inter', sans-serif;
    color: #1a1a1a;
  }
  .blog-profile-bio {
    font-size: 15px;
    color: #555;
    margin: 0 0 8px;
    line-height: 1.5;
  }
  .blog-profile-count {
    font-size: 13px;
    color: #999;
    margin: 0;
    font-family: 'Inter', sans-serif;
  }

  /* Article list */
  .blog-main {
    flex: 1;
    max-width: 680px;
    width: 100%;
    margin: 0 auto;
    padding: 40px 24px 60px;
  }
  .blog-empty {
    text-align: center;
    padding: 60px 0;
    color: #999;
    font-family: 'Inter', sans-serif;
  }
  .blog-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .blog-card {
    display: flex;
    gap: 24px;
    padding: 28px 0;
    border-bottom: 1px solid #e8e8e8;
    text-decoration: none;
    color: inherit;
    transition: opacity 0.15s;
  }
  .blog-card:hover { opacity: 0.75; }
  .blog-card:last-child { border-bottom: none; }

  .blog-card-cover {
    width: 112px;
    height: 80px;
    border-radius: 4px;
    background-size: cover;
    background-position: center;
    flex-shrink: 0;
    order: 2;
  }
  .blog-card-body {
    flex: 1;
    min-width: 0;
    order: 1;
  }
  .blog-card-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 8px;
    font-family: 'Inter', sans-serif;
    line-height: 1.35;
    color: #1a1a1a;
  }
  .blog-card-excerpt {
    font-size: 14px;
    color: #555;
    margin: 0 0 12px;
    line-height: 1.55;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .blog-card-meta {
    font-size: 12px;
    color: #999;
    font-family: 'Inter', sans-serif;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .blog-meta-dot { opacity: 0.5; }

  /* Footer */
  .blog-footer {
    text-align: center;
    padding: 24px;
    font-size: 13px;
    color: #bbb;
    font-family: 'Inter', sans-serif;
    border-top: 1px solid #e8e8e8;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .blog-footer a { color: #132578; text-decoration: none; }
  .blog-footer a:hover { text-decoration: underline; }

  @media (max-width: 600px) {
    .blog-card-cover { width: 80px; height: 56px; }
    .blog-card-title { font-size: 16px; }
    .blog-profile-inner { flex-direction: column; align-items: flex-start; gap: 16px; }
  }
</style>
