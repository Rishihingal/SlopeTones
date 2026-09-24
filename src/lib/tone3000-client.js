// Minimal OAuth 2.0 + PKCE client for the TONE3000 API (https://www.tone3000.com/api).
// There is no anonymous access — every resource call needs a user access token, so this
// always goes through a browser redirect + PKCE code exchange.
//
// Confirmed against TONE3000's own reference integration (github.com/tone-3000/api):
//   GET  /api/v1/oauth/authorize   – start a flow
//   POST /api/v1/oauth/token       – exchange code / refresh token
//   GET  /api/v1/user, /api/v1/users
//   GET  /api/v1/tones/{id}, /tones/search, /tones/created, /tones/favorited
//   GET  /api/v1/models/{id}, /api/v1/models
// Rate limit: 100 requests/minute.

const API_BASE = 'https://www.tone3000.com/api/v1';
const VERIFIER_KEY = 't3k_pkce_verifier';
const STATE_KEY = 't3k_pkce_state';

export const Gear = { Amp: 'amp', FullRig: 'full-rig', Pedal: 'pedal', Outboard: 'outboard', Ir: 'ir' };
export const Platform = { Nam: 'nam', Ir: 'ir', AidaX: 'aida-x', AaSnapshot: 'aa-snapshot', Proteus: 'proteus' };

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(verifierBytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

function setParams(url, params) {
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
  });
}

async function startFlow(publishableKey, redirectUri, params) {
  const { verifier, challenge } = await pkcePair();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const url = new URL(`${API_BASE}/oauth/authorize`);
  setParams(url, {
    client_id: publishableKey,
    redirect_uri: redirectUri,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...params,
  });
  window.location.href = url.toString();
}

/** User browses the TONE3000 catalog and picks one tone (best fit for a plugin-style app). */
export function startSelectFlow(publishableKey, redirectUri, { gears, platform, architecture } = {}) {
  return startFlow(publishableKey, redirectUri, { prompt: 'select_tone', gears, platform, architecture });
}

/** Re-check / re-pick access to a previously saved tone_id (e.g. a saved preset). */
export function startLoadToneFlow(publishableKey, redirectUri, toneId, { gears, platform, architecture } = {}) {
  return startFlow(publishableKey, redirectUri, { prompt: 'load_tone', tone_id: toneId, gears, platform, architecture });
}

/** Just connect the account; browse/search programmatically afterwards. */
export function startStandardFlow(publishableKey, redirectUri) {
  return startFlow(publishableKey, redirectUri, {});
}

export async function handleOAuthCallback(publishableKey, redirectUri) {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const toneId = url.searchParams.get('tone_id');
  const error = url.searchParams.get('error');

  if (error) return { ok: false, error };
  if (!code) return { ok: false, error: 'no_code' };

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (state && expectedState && state !== expectedState) return { ok: false, error: 'state_mismatch' };

  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: publishableKey,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
  });

  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);

  if (!res.ok) return { ok: false, error: `token_exchange_failed_${res.status}` };
  return { ok: true, tokens: await res.json(), toneId: toneId ? Number(toneId) : undefined };
}

export class T3KClient {
  constructor(publishableKey, onAuthExpired) {
    this.publishableKey = publishableKey;
    this.onAuthExpired = onAuthExpired;
    this.tokens = null;
  }

  setTokens(tokens) { this.tokens = tokens; }
  isAuthenticated() { return Boolean(this.tokens?.access_token); }

  async refresh() {
    if (!this.tokens?.refresh_token) { this.onAuthExpired?.(); return false; }
    const res = await fetch(`${API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.publishableKey,
        refresh_token: this.tokens.refresh_token,
      }),
    });
    if (!res.ok) { this.onAuthExpired?.(); return false; }
    this.tokens = await res.json();
    return true;
  }

  async request(path, { params, ...init } = {}) {
    if (!this.isAuthenticated()) throw new Error('not_authenticated');
    const url = new URL(`${API_BASE}${path}`);
    setParams(url, params);

    const doFetch = () => fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.tokens.access_token}`, ...(init.headers || {}) },
    });

    let res = await doFetch();
    if (res.status === 401) {
      if (!(await this.refresh())) throw new Error('auth_expired');
      res = await doFetch();
    }
    if (!res.ok) throw new Error(`t3k_request_failed_${res.status}`);
    return res.json();
  }

  getUser() { return this.request('/user'); }
  getTone(id) { return this.request(`/tones/${id}`); }
  searchTones({ query, gears, platform, architecture, sort, page, pageSize } = {}) {
    return this.request('/tones/search', { params: { query, gears, platform, architecture, sort, page, page_size: pageSize } });
  }
  createdTones(params) { return this.request('/tones/created', { params }); }
  favoritedTones(params) { return this.request('/tones/favorited', { params }); }
  getModel(id) { return this.request(`/models/${id}`); }
  listModels(toneId, params) { return this.request('/models', { params: { tone_id: toneId, ...params } }); }

  /** Model files also require the bearer token — a bare fetch(model_url) will 401/403. */
  async downloadModel(modelUrl) {
    if (!this.isAuthenticated()) throw new Error('not_authenticated');
    const res = await fetch(modelUrl, { headers: { Authorization: `Bearer ${this.tokens.access_token}` } });
    if (!res.ok) throw new Error(`model_download_failed_${res.status}`);
    return res.arrayBuffer();
  }
}
