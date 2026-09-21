/**
 * Earth Engine authentication via Google Identity Services + Cloudflare Worker.
 *
 * Flow:
 *  1. User clicks "Sign in with Google"
 *  2. Google shows consent screen (user must have GEE access)
 *  3. We get an auth code
 *  4. Auth code → Cloudflare Worker → access token with EE scopes
 *  5. access_token → ee.Initialize()
 */
import { ref, onMounted } from 'react';

// ── CONFIG ──────────────────────────────────────────────────────────────
// Set these in your .env or Vite config:
//   VITE_GOOGLE_CLIENT_ID   — OAuth 2.0 Client ID from GCP Console
//   VITE_EE_AUTH_WORKER     — URL of the deployed Cloudflare Worker
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const EE_AUTH_WORKER = import.meta.env.VITE_EE_AUTH_WORKER || '';

let _eeReady = false;
let _eeInitPromise = null;

/**
 * Load the Google Identity Services script dynamically.
 */
function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts.id);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(window.google.accounts.id);
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Exchange an auth code for an access token via the Cloudflare Worker.
 */
async function exchangeCodeForToken(code, redirectUri) {
  const res = await fetch(EE_AUTH_WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Token exchange failed (${res.status})`);
  }
  return res.json();
}

/**
 * Initialize the Earth Engine JS library with an access token.
 * The ee library must be loaded via <script> tag before calling this.
 */
async function initEE(accessToken) {
  if (_eeReady) return;

  // Wait for the ee library to be available
  if (typeof window.ee === 'undefined') {
    throw new Error(
      'Earth Engine JS library not loaded. Add <script src="https://unpkg.com/earthengine-api@0.1.370/build/ee_api.min.js"> to index.html'
    );
  }

  return new Promise((resolve, reject) => {
    window.ee.initialize(accessToken, undefined, () => {
      _eeReady = true;
      resolve();
    }, (err) => {
      reject(new Error(`EE init failed: ${err}`));
    });
  });
}

/**
 * Full sign-in flow: Google consent → token exchange → EE init.
 * Returns the access token.
 */
export async function signInWithGoogle() {
  const gis = await loadGIS();

  return new Promise((resolve, reject) => {
    // Use the redirect flow (code response type) for server-side exchange
    const client = gis.init({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      ux_mode: 'redirect',
      redirect_uri: window.location.origin + window.location.pathname,
      state: 'ee_auth',
    });

    // Alternative: use popup + implicit flow (simpler, no redirect)
    // For popup flow, we'd use response_type=token and get the access token directly.
    // But EE scopes require server-side exchange. Let's use the code flow.

    // Actually, let's use the simpler popup + token approach.
    // Google Identity Services can return an ID token directly.
    // For EE, we need an ACCESS token, not an ID token.
    // The code flow is the correct approach.

    // Trigger the sign-in prompt
    gis.prompt();
  });
}

/**
 * Simpler approach: use GIS in popup mode, get auth code, exchange via worker.
 */
export async function signIn() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID not set');
  }
  if (!EE_AUTH_WORKER) {
    throw new Error('VITE_EE_AUTH_WORKER not set');
  }

  const gis = await loadGIS();

  return new Promise((resolve, reject) => {
    // Initialize with callback
    gis.initialize(GOOGLE_CLIENT_ID, {
      callback: async (response) => {
        if (!response.code) {
          reject(new Error('No auth code received'));
          return;
        }
        try {
          const redirectUri = window.location.origin + window.location.pathname;
          const tokenData = await exchangeCodeForToken(response.code, redirectUri);
          await initEE(tokenData.access_token);
          resolve(tokenData.access_token);
        } catch (err) {
          reject(err);
        }
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'Google Sign-In failed'));
      },
      scope: 'openid email profile',
      ux_mode: 'popup',
    });

    // Show the Google One Tap prompt
    gis.prompt();
  });
}

/**
 * Check if EE is initialized and ready.
 */
export function isEEReady() {
  return _eeReady;
}

/**
 * Get the ee object (throws if not initialized).
 */
export function getEE() {
  if (!_eeReady || typeof window.ee === 'undefined') {
    throw new Error('Earth Engine not initialized. Sign in first.');
  }
  return window.ee;
}

/**
 * Sign out — clear the EE session.
 */
export function signOut() {
  _eeReady = false;
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
}
