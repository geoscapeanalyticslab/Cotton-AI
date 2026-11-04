/**
 * Cloudflare Worker — OPTIONAL OAuth code → token exchange for Earth Engine.
 *
 * The dashboard itself does NOT need this worker: it uses the Google
 * Identity Services token flow and receives an access token directly in the
 * browser (see frontend/src/ee/auth.js).
 *
 * This endpoint is kept for deployments that prefer the authorization-code
 * flow (for example if the token flow is blocked by policy). It exchanges a
 * Google auth code for an access token while keeping the client secret
 * server-side.
 *
 * Deploy:  npx wrangler deploy
 * Secrets: CLIENT_ID, CLIENT_SECRET (wrangler secret put …)
 * Optional var: ALLOWED_ORIGINS (comma-separated)
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const DEFAULT_ORIGINS = [
  'https://geoscapeanalyticslab.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, allowed),
      });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'POST only' }, 405, origin, allowed);
    }

    // Only registered dashboard origins may use this endpoint.
    if (origin && !allowed.includes(origin)) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, origin, allowed);
    }

    try {
      const { code, redirect_uri } = await request.json();
      if (!code) {
        return jsonResponse({ error: 'Missing code' }, 400, origin, allowed);
      }

      const body = new URLSearchParams({
        code,
        client_id: env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        grant_type: 'authorization_code',
      });
      // Popup-mode codes must be exchanged without a redirect_uri.
      if (redirect_uri) body.set('redirect_uri', redirect_uri);

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return jsonResponse(
          {
            error: tokenData.error || 'Token exchange failed',
            details: tokenData.error_description || null,
          },
          401,
          origin,
          allowed
        );
      }

      return jsonResponse(
        {
          access_token: tokenData.access_token,
          expires_in: tokenData.expires_in,
          token_type: tokenData.token_type,
          scope: tokenData.scope,
        },
        200,
        origin,
        allowed
      );
    } catch (err) {
      return jsonResponse({ error: 'Internal error', message: err.message }, 500, origin, allowed);
    }
  },
};

function allowedOrigins(env) {
  const configured = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ORIGINS;
}

function corsHeaders(origin, allowed) {
  const permitted = origin && allowed.includes(origin);
  return {
    // Echo the origin only when it is explicitly allowed.
    ...(permitted ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status, origin, allowed) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin, allowed),
    },
  });
}
