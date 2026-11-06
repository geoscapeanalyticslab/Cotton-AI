/**
 * Earth Engine authentication for the browser.
 *
 * Flow:
 *  1. User clicks "Sign in with Google (GEE)"
 *  2. Google Identity Services (token model) shows the consent screen and
 *     returns an OAuth access token that carries the Earth Engine scope
 *  3. The token is handed to the Earth Engine JS API
 *  4. All climate / NDVI queries then run in the user's browser, against the
 *     user's own Earth Engine account and quota
 *
 * No backend or client secret is required: the OAuth client is a public
 * "Web application" client, and the token is issued straight to the page.
 *
 * Required config (frontend/.env):
 *   VITE_GOOGLE_CLIENT_ID  OAuth 2.0 Web client ID
 *   VITE_EE_PROJECT        Earth Engine / Google Cloud project ID
 */

// ── CONFIG ──────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const EE_PROJECT = import.meta.env.VITE_EE_PROJECT || 'ee-cotton-ai';

/** Earth Engine read-only scope — enough for every query this app runs. */
const EE_SCOPE = 'https://www.googleapis.com/auth/earthengine.readonly';

/** Official browser build of the Earth Engine JS API. */
const EE_LIB_URL =
  'https://cdn.jsdelivr.net/npm/@google/earthengine@1.7.51/build/ee_api_js.js';

const GIS_URL = 'https://accounts.google.com/gsi/client';

let _eeReady = false;
let _accessToken = null;
let _tokenExpiresAt = 0;
let _eeLibPromise = null;
let _gisPromise = null;

// ── Script loading ──────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadGIS() {
  if (!_gisPromise) {
    _gisPromise = loadScript(GIS_URL).then(() => {
      if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services did not initialise');
      }
      return window.google.accounts.oauth2;
    });
    _gisPromise.catch(() => {
      _gisPromise = null;
    });
  }
  return _gisPromise;
}

function loadEE() {
  if (!_eeLibPromise) {
    _eeLibPromise = loadScript(EE_LIB_URL).then(async () => {
      // The bundle assigns window.ee during evaluation; give it a moment.
      for (let i = 0; i < 40 && !window.ee; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!window.ee) throw new Error('Earth Engine JS library failed to load');
      return window.ee;
    });
    _eeLibPromise.catch(() => {
      _eeLibPromise = null;
    });
  }
  return _eeLibPromise;
}

/**
 * Warm up the Google + Earth Engine scripts (call this when the page mounts
 * so the sign-in popup opens immediately on click).
 */
export function preloadEarthEngine() {
  loadGIS().catch(() => {});
  loadEE().catch(() => {});
}

// ── Earth Engine initialisation ─────────────────────────────────────────
function initEE(ee, token, expiresIn) {
  return new Promise((resolve, reject) => {
    // setAuthToken(clientId, tokenType, accessToken, expiresIn, extraScopes,
    //              callback, updateAuthLibrary)
    ee.data.setAuthToken(
      null,
      'Bearer',
      token,
      expiresIn || 3600,
      [EE_SCOPE],
      () => {
        ee.initialize(
          null, // default API base URL
          null, // default tile base URL
          () => {
            _eeReady = true;
            resolve();
          },
          (err) => reject(new Error(`Earth Engine init failed: ${err?.message || err}`)),
          null, // no xsrf token
          EE_PROJECT
        );
      },
      false // don't load the legacy gapi auth library
    );
  });
}

// ── Public API ──────────────────────────────────────────────────────────
/**
 * Sign in with Google, request the Earth Engine scope, and initialise EE.
 * Resolves with `{ access_token, expires_in }`.
 */
export async function signIn() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured');
  }

  const oauth2 = await loadGIS();
  const ee = await loadEE();

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (!settled) {
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: `email ${EE_SCOPE}`,
      ux_mode: 'popup',
      callback: async (response) => {
        if (settled) return;
        if (response.error) {
          fail(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          fail(new Error('Google did not return an access token'));
          return;
        }
        try {
          await initEE(ee, response.access_token, Number(response.expires_in));
          _accessToken = response.access_token;
          _tokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
          settled = true;
          resolve({ access_token: response.access_token, expires_in: response.expires_in });
        } catch (err) {
          fail(err);
        }
      },
      error_callback: (err) => {
        fail(new Error(err?.message || 'Google Sign-In was cancelled'));
      },
    });

    try {
      client.requestAccessToken({ prompt: '' });
    } catch (err) {
      fail(err);
    }
  });
}

/** True once the EE JS API has been initialised with a user token. */
export function isEEReady() {
  return _eeReady && Date.now() < _tokenExpiresAt;
}

/** The `ee` object, or an error if the user has not signed in. */
export function getEE() {
  if (!_eeReady || typeof window.ee === 'undefined') {
    throw new Error('Earth Engine not initialised — sign in with Google first.');
  }
  return window.ee;
}

/** Revoke the access token and drop the Earth Engine session. */
export function signOut() {
  const token = _accessToken;
  _accessToken = null;
  _tokenExpiresAt = 0;
  _eeReady = false;

  if (token && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch {
      /* revoke is best-effort */
    }
  }
}
