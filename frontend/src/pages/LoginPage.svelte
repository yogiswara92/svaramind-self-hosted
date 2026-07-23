<script lang="ts">
  import { signInWithEmail, signUpWithEmail, authError, showLoginPage } from '../stores/auth';
  import { fly } from 'svelte/transition';

  let email = '';
  let password = '';
  let confirmPassword = '';
  let loading = false;
  let showPassword = false;
  let mode: 'login' | 'register' = 'login';
  let registerSuccess = false;

  async function handleLogin() {
    loading = true;
    try { await signInWithEmail(email, password); } catch {}
    loading = false;
  }

  async function handleRegister() {
    if (password !== confirmPassword) { authError.set('Passwords do not match'); return; }
    if (password.length < 6) { authError.set('Password must be at least 6 characters'); return; }
    loading = true;
    try {
      await signUpWithEmail(email, password);
      registerSuccess = true;
    } catch {}
    loading = false;
  }

  function switchMode(m: 'login' | 'register') {
    mode = m;
    registerSuccess = false;
    authError.set(null);
    email = ''; password = ''; confirmPassword = '';
  }
</script>

<div class="login-wrapper">
  <!-- Decorative background elements -->
  <div class="bg-decoration bg-1"></div>
  <div class="bg-decoration bg-2"></div>
  <div class="bg-decoration bg-3"></div>

  <div class="login-container">
    <div class="login-card" in:fly={{ y: 20, duration: 400 }}>
      <!-- Header -->
      <div class="login-header">
        <div class="logo-wrapper" style="width:100%">
          <img src="/SvaraMind Logo.png" alt="Svaramind" class="logo svaramind-logo" style="height:80px" />
        </div>
      </div>

      <div class="auth-tabs">
        <button class="auth-tab {mode === 'login' ? 'active' : ''}" on:click={() => switchMode('login')}>Sign In</button>
        <button class="auth-tab {mode === 'register' ? 'active' : ''}" on:click={() => switchMode('register')}>Register</button>
      </div>

      <!-- Error message -->
      {#if $authError}
        <div class="alert alert-error" in:fly={{ y: -8, duration: 200 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" />
            <path d="M8 5v3.5M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          {$authError}
        </div>
      {/if}

      <!-- Register success -->
      {#if registerSuccess}
        <div class="alert alert-success" in:fly={{ y: -8, duration: 200 }}>
          Account created! You can sign in now.
        </div>

      {:else if mode === 'login'}
      <!-- Login Form -->
      <form on:submit|preventDefault={handleLogin}>
        <div class="form-group">
          <label for="email" class="form-label">Email address</label>
          <div class="input-wrapper">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 7 10-7" />
            </svg>
            <input id="email" class="form-input" type="email" bind:value={email} placeholder="you@example.com" required disabled={loading} />
          </div>
        </div>
        <div class="form-group">
          <div class="password-label-row">
            <label for="password" class="form-label">Password</label>
          </div>
          <div class="input-wrapper">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {#if showPassword}
              <input id="password" class="form-input" type="text" bind:value={password} placeholder="••••••••" required disabled={loading} />
            {:else}
              <input id="password" class="form-input" type="password" bind:value={password} placeholder="••••••••" required disabled={loading} />
            {/if}
            <button type="button" class="toggle-password" on:click={() => showPassword = !showPassword} tabindex="-1">
              {#if showPassword}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {/if}
            </button>
          </div>
        </div>
        <button class="btn-submit" type="submit" disabled={loading || !email || !password}>
          {#if loading}<span class="spinner"></span> Signing in...{:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Sign in
          {/if}
        </button>
      </form>

      {:else}
      <!-- Register Form -->
      <form on:submit|preventDefault={handleRegister}>
        <div class="form-group">
          <label for="reg-email" class="form-label">Email address</label>
          <div class="input-wrapper">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 7 10-7" />
            </svg>
            <input id="reg-email" class="form-input" type="email" bind:value={email} placeholder="you@example.com" required disabled={loading} />
          </div>
        </div>
        <div class="form-group">
          <label for="reg-password" class="form-label">Password <span style="font-weight:400;color:var(--text-muted)">(min. 6 characters)</span></label>
          <div class="input-wrapper">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {#if showPassword}
              <input id="reg-password" class="form-input" type="text" bind:value={password} placeholder="••••••••" required disabled={loading} />
            {:else}
              <input id="reg-password" class="form-input" type="password" bind:value={password} placeholder="••••••••" required disabled={loading} />
            {/if}
          </div>
        </div>
        <div class="form-group">
          <label for="reg-confirm" class="form-label">Confirm password</label>
          <div class="input-wrapper">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {#if showPassword}
              <input id="reg-confirm" class="form-input" type="text" bind:value={confirmPassword} placeholder="••••••••" required disabled={loading} />
            {:else}
              <input id="reg-confirm" class="form-input" type="password" bind:value={confirmPassword} placeholder="••••••••" required disabled={loading} />
            {/if}
          </div>
        </div>
        <button class="btn-submit" type="submit" disabled={loading || !email || !password || !confirmPassword}>
          {#if loading}<span class="spinner"></span> Creating account...{:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Create account
          {/if}
        </button>
      </form>
      {/if}

      <!-- Footer -->
      <p class="login-footer" style="margin-top:8px">
        <button class="back-link" on:click={() => showLoginPage.set(false)}>← Back to home</button>
      </p>
    </div>
  </div>
</div>

<style>
  .login-wrapper {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
    padding: 20px;
    position: relative;
    overflow: hidden;
  }

  /* Decorative background elements */
  .bg-decoration {
    position: absolute;
    border-radius: 50%;
    opacity: 0.08;
    pointer-events: none;
  }

  .bg-1 {
    width: 400px;
    height: 400px;
    background: var(--accent-color);
    top: -100px;
    right: -100px;
  }

  .bg-2 {
    width: 300px;
    height: 300px;
    background: var(--accent-color);
    bottom: -50px;
    left: -50px;
  }

  .bg-3 {
    width: 200px;
    height: 200px;
    background: var(--accent-color);
    top: 50%;
    left: 10%;
  }

  .login-container {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 420px;
  }

  .login-card {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 48px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(10px);
  }

  .login-header {
    text-align: center;
    margin-bottom: 32px;
  }

  .logo-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 24px;
  }

  .logo {
    height: 48px;
    width: auto;
    object-fit: contain;
  }

  /* Alert */
  .alert {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 13px;
    margin-bottom: 20px;
    line-height: 1.5;
  }

  .auth-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
    margin-bottom: 20px;
    gap: 0;
  }
  .auth-tab {
    flex: 1;
    padding: 10px;
    border: none;
    background: none;
    font-size: 14px;
    font-weight: 500;
    color: #9ca3af;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    font-family: inherit;
  }
  .auth-tab:hover { color: #374151; }
  .auth-tab.active { color: #4f46e5; border-bottom-color: #4f46e5; }

  .alert-error {
    background: rgba(239, 71, 111, 0.1);
    color: #ef476f;
    border: 1px solid rgba(239, 71, 111, 0.2);
  }

  .alert-success {
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 14px;
    text-align: center;
    margin-bottom: 16px;
  }

  .alert svg {
    flex-shrink: 0;
    margin-top: 2px;
  }

  /* Form */
  .form-group {
    margin-bottom: 20px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-icon {
    position: absolute;
    left: 12px;
    color: var(--text-secondary);
    pointer-events: none;
    flex-shrink: 0;
  }

  .form-input {
    width: 100%;
    padding: 11px 40px 11px 38px;
    background: var(--bg-secondary);
    border: 1.5px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-primary);
    font-size: 14px;
    font-family: inherit;
    transition: all 0.2s;
    outline: none;
  }

  .form-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .form-input:focus {
    border-color: var(--accent-color);
    background: var(--bg-primary);
    box-shadow: 0 0 0 3px rgba(0, 180, 216, 0.1);
  }

  .form-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-password {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .toggle-password:hover {
    color: var(--text-primary);
  }

  /* Password label row with forgot link */
  .password-label-row {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
  }
  .password-label-row .form-label { margin-bottom: 0; }
  .forgot-link {
    background: none; border: none; padding: 0;
    font-size: 12px; color: var(--accent-color);
    cursor: pointer; font-family: inherit;
    text-decoration: underline; text-underline-offset: 2px;
  }
  .forgot-link:hover { opacity: 0.75; }

  /* Forgot password header */
  .forgot-header { margin-bottom: 20px; }
  .forgot-desc { font-size: 13px; color: var(--text-secondary); margin-top: 10px; line-height: 1.5; }

  /* Submit button */
  .btn-submit {
    width: 100%;
    padding: 12px 16px;
    background: var(--accent-color);
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s;
    font-family: inherit;
    margin-top: 8px;
  }

  .btn-submit:hover:not(:disabled) {
    background: var(--accent-hover, #0091b9);
    box-shadow: 0 8px 20px rgba(0, 180, 216, 0.3);
    transform: translateY(-2px);
  }

  .btn-submit:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Divider */
  .divider {
    display: flex; align-items: center; gap: 12px;
    margin: 20px 0 16px;
    color: var(--text-muted); font-size: 12px;
  }
  .divider::before, .divider::after {
    content: ''; flex: 1; height: 1px; background: var(--border-color);
  }

  /* Google button */
  .btn-google {
    width: 100%; padding: 11px 16px;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    border: 1.5px solid var(--border-color);
    border-radius: 10px; background: var(--bg-primary);
    color: var(--text-primary); font-size: 14px; font-weight: 500;
    cursor: pointer; font-family: inherit;
    transition: all 0.2s;
  }
  .btn-google:hover:not(:disabled) {
    border-color: #4285F4; background: var(--bg-secondary);
    box-shadow: 0 2px 8px rgba(66,133,244,0.15);
  }
  .btn-google:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Footer */
  .login-footer {
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    margin: 24px 0 0;
  }

  .back-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .back-link:hover { color: var(--text-secondary); }

  /* Responsive */
  @media (max-width: 480px) {
    .login-card {
      padding: 32px 24px;
    }

    .login-header {
      margin-bottom: 24px;
    }

    .logo {
      height: 40px;
    }

    .bg-decoration {
      display: none;
    }
  }
</style>
