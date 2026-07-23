<script lang="ts">
  import { onMount } from 'svelte';
  import { blogApi } from '../lib/api';
  import { getSession } from '../lib/auth';

  export let username: string = '';
  export let slug: string = '';

  let profile: any = null;
  let article: any = null;
  let loading = true;
  let error = '';
  let isOwner = false;

  onMount(async () => {
    try {
      const postData = await blogApi.getPost(username, slug);
      profile = postData.profile;
      article = postData.article;

      const session = getSession();
      isOwner = session?.user?.user_metadata?.username === username;
    } catch (err: any) {
      error = err.message || 'Article not found';
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
  <title>{article?.title ? article.title + ' — ' + username : 'Article'}</title>
  {#if article?.excerpt}
    <meta name="description" content={article.excerpt} />
  {/if}
</svelte:head>

<div class="blog-root">
  <!-- Nav -->
  <nav class="blog-nav">
    <a href="/" class="blog-nav-brand">
      <img src="/SvaraMind%20Logo.png" alt="Svaramind" width="120" height="28" style="height:28px;width:auto;object-fit:contain;display:block" />
    </a>
    <a href="/{username}" class="blog-nav-back">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      {username}
    </a>
    {#if isOwner && article?.id}
      <a href="/doc/{article.id}" class="blog-nav-edit-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
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
      <a href="/{username}" class="blog-error-link">Back to {username}'s blog</a>
    </div>

  {:else}
    <article class="blog-article">
      <!-- Cover image -->
      {#if article.cover_image}
        <div class="blog-cover" style="background-image:url({article.cover_image})"></div>
      {/if}

      <div class="blog-article-inner">
        <!-- Title -->
        <h1 class="blog-title">{article.title || 'Untitled'}</h1>

        <!-- Author + meta row -->
        <div class="blog-byline">
          <a href="/{username}" class="blog-byline-author">
            {#if profile?.avatar_url}
              <img src={profile.avatar_url} alt={profile?.full_name || username} class="blog-byline-avatar" />
            {:else}
              <div class="blog-byline-avatar-placeholder">{(profile?.full_name || profile?.username || username || '?')[0].toUpperCase()}</div>
            {/if}
            <span class="blog-byline-name">{profile?.full_name || profile?.username || username}</span>
          </a>
          <span class="blog-byline-sep">·</span>
          <span class="blog-byline-date">{formatDate(article.published_at)}</span>
          <span class="blog-byline-sep">·</span>
          <span class="blog-byline-read">{readTime(article.read_time_minutes, article.word_count)}</span>
        </div>

        <!-- Excerpt as lead paragraph -->
        {#if article.excerpt}
          <p class="blog-lead">{article.excerpt}</p>
        {/if}

        <!-- Article body -->
        <div class="blog-body prose">
          {@html article.content_html || '<p>No content.</p>'}
        </div>

        <!-- Author card at bottom -->
        <div class="blog-author-card">
          <a href="/{username}" class="blog-author-card-link">
            {#if profile?.avatar_url}
              <img src={profile.avatar_url} alt={profile?.full_name || username} class="blog-author-card-avatar" />
            {:else}
              <div class="blog-author-card-avatar blog-author-card-placeholder">{(profile?.full_name || profile?.username || username || '?')[0].toUpperCase()}</div>
            {/if}
            <div>
              <p class="blog-author-card-name">{profile?.full_name || profile?.username || username}</p>
              {#if profile?.blog_bio}
                <p class="blog-author-card-bio">{profile.blog_bio}</p>
              {/if}
              <p class="blog-author-card-cta">More articles →</p>
            </div>
          </a>
        </div>
      </div>
    </article>
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
  .blog-nav-back {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #888;
    text-decoration: none;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    padding: 5px 10px;
    border-radius: 6px;
    margin-left: auto;
    transition: all 0.15s;
  }
  .blog-nav-back:hover { background: #f5f5f5; color: #1a1a1a; }
  .blog-nav-brand { display: flex; align-items: center; text-decoration: none; }
  .blog-nav-edit-btn {
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
    flex-shrink: 0;
  }
  .blog-nav-edit-btn:hover { background: #132578; color: #fff; }

  /* Loading / error */
  .blog-loading {
    flex: 1; display: flex; align-items: center; justify-content: center; padding: 80px 0;
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
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 80px 24px; text-align: center;
  }
  .blog-error h1 { font-size: 72px; font-weight: 700; margin: 0 0 12px; color: #e8e8e8; font-family: 'Inter', sans-serif; }
  .blog-error p { font-size: 16px; color: #666; margin: 0 0 20px; }
  .blog-error-link { color: #132578; font-family: 'Inter', sans-serif; font-size: 14px; }

  /* Article */
  .blog-article { flex: 1; }

  .blog-cover {
    width: 100%;
    height: 400px;
    background-size: cover;
    background-position: center;
  }

  .blog-article-inner {
    max-width: 680px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }

  .blog-title {
    font-family: 'Georgia', serif;
    font-size: 36px;
    font-weight: 700;
    line-height: 1.25;
    margin: 0 0 24px;
    color: #1a1a1a;
    letter-spacing: -0.3px;
  }

  /* Byline */
  .blog-byline {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 32px;
    flex-wrap: wrap;
  }
  .blog-byline-author {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    color: inherit;
  }
  .blog-byline-author:hover .blog-byline-name { text-decoration: underline; }
  .blog-byline-avatar {
    width: 32px; height: 32px;
    border-radius: 50%; object-fit: cover; border: 1px solid #e8e8e8;
  }
  .blog-byline-avatar-placeholder {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; font-family: 'Inter', sans-serif;
  }
  .blog-byline-name { font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; color: #1a1a1a; }
  .blog-byline-sep { color: #ccc; }
  .blog-byline-date, .blog-byline-read { font-family: 'Inter', sans-serif; font-size: 13px; color: #888; }

  /* Lead paragraph */
  .blog-lead {
    font-size: 20px;
    line-height: 1.6;
    color: #555;
    margin: 0 0 32px;
    font-style: italic;
    border-left: 3px solid #132578;
    padding-left: 20px;
  }

  /* Article body — prose styles */
  .blog-body :global(h1),
  .blog-body :global(h2),
  .blog-body :global(h3),
  .blog-body :global(h4) {
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    margin: 2em 0 0.5em;
    color: #1a1a1a;
    line-height: 1.3;
  }
  .blog-body :global(h1) { font-size: 28px; }
  .blog-body :global(h2) { font-size: 22px; }
  .blog-body :global(h3) { font-size: 18px; }
  .blog-body :global(p) {
    font-family: 'Georgia', serif;
    font-size: 18px;
    line-height: 1.8;
    margin: 0 0 1.4em;
    color: #1a1a1a;
  }
  .blog-body :global(ul), .blog-body :global(ol) {
    padding-left: 28px;
    margin: 0 0 1.4em;
  }
  .blog-body :global(li) {
    font-family: 'Georgia', serif;
    font-size: 18px;
    line-height: 1.75;
    margin-bottom: 0.4em;
    color: #1a1a1a;
  }
  .blog-body :global(blockquote) {
    border-left: 3px solid #132578;
    margin: 1.5em 0;
    padding: 4px 0 4px 24px;
    color: #555;
    font-style: italic;
  }
  .blog-body :global(blockquote p) { margin: 0; }
  .blog-body :global(pre) {
    background: #f6f8fa;
    border-radius: 6px;
    padding: 16px 20px;
    overflow-x: auto;
    font-size: 14px;
    line-height: 1.6;
    margin: 0 0 1.4em;
    border: 1px solid #e8e8e8;
  }
  .blog-body :global(code) {
    font-family: 'Fira Code', 'Courier New', monospace;
    font-size: 0.875em;
    background: #f6f8fa;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #e8e8e8;
    color: #d63384;
  }
  .blog-body :global(pre code) {
    background: none; border: none; padding: 0; color: #1a1a1a;
  }
  .blog-body :global(a) { color: #132578; }
  .blog-body :global(a:hover) { text-decoration: none; }
  .blog-body :global(img) { max-width: 100%; border-radius: 6px; margin: 1em 0; }
  .blog-body :global(hr) {
    border: none;
    border-top: 1px solid #e8e8e8;
    margin: 2.5em 0;
  }
  .blog-body :global(table) {
    width: 100%; border-collapse: collapse; font-size: 15px; margin-bottom: 1.4em;
    font-family: 'Inter', sans-serif;
  }
  .blog-body :global(th), .blog-body :global(td) {
    border: 1px solid #e8e8e8; padding: 10px 14px; text-align: left;
  }
  .blog-body :global(th) { background: #f6f8fa; font-weight: 600; }

  /* Author card */
  .blog-author-card {
    margin-top: 56px;
    padding-top: 40px;
    border-top: 1px solid #e8e8e8;
  }
  .blog-author-card-link {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    text-decoration: none;
    color: inherit;
  }
  .blog-author-card-link:hover .blog-author-card-name { text-decoration: underline; }
  .blog-author-card-avatar {
    width: 56px; height: 56px;
    border-radius: 50%; object-fit: cover; border: 2px solid #e8e8e8; flex-shrink: 0;
  }
  .blog-author-card-placeholder {
    background: linear-gradient(135deg, #132578, #1e3a9e);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 700; font-family: 'Inter', sans-serif;
  }
  .blog-author-card-name { font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 700; margin: 0 0 4px; color: #1a1a1a; }
  .blog-author-card-bio { font-size: 14px; color: #555; margin: 0 0 8px; line-height: 1.5; }
  .blog-author-card-cta { font-family: 'Inter', sans-serif; font-size: 13px; color: #132578; margin: 0; }

  /* Footer */
  .blog-footer {
    text-align: center; padding: 24px;
    font-size: 13px; color: #bbb;
    font-family: 'Inter', sans-serif;
    border-top: 1px solid #e8e8e8;
    display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  .blog-footer a { color: #132578; text-decoration: none; }
  .blog-footer a:hover { text-decoration: underline; }

  @media (max-width: 600px) {
    .blog-cover { height: 220px; }
    .blog-title { font-size: 26px; }
    .blog-body :global(p), .blog-body :global(li) { font-size: 16px; }
    .blog-lead { font-size: 17px; }
  }
</style>
