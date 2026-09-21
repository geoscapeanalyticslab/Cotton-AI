/**
 * Cloudflare Worker — OAuth token exchange for Earth Engine JS API.
 *
 * Google Sign-In gives an auth code. This worker swaps it for an access
 * token with Earth Engine scopes. The client secret stays on the server.
 *
 * Deploy:  npx wrangler deploy
 * Secrets: CLIENT_ID, CLIENT_SECRET (set via wrangler secret put)
 */
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EE_SCOPES = [
  'https://www.googleapis.com/auth/earthengine.readonly',
  'https://www.googleapis.com/auth/earthengine',
].join(' ');

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'POST only' }, 405, request);
    }

    try {
      const { code, redirect_uri } = await request.json();
      if (!code) {
        return jsonResponse({ error: 'Missing code' }, 400, request);
      }

      const body = new URLSearchParams({
        code,
        client_id: env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        redirect_uri: redirect_uri || 'postmessage',
        grant_type: 'authorization_code',
      });

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return jsonResponse({ error: 'Token exchange failed', details: tokenData }, 401, request);
      }

      // The access token from Google already has the scopes we requested
      // during the Google Identity Services consent screen.
      // If the user's GCP project has Earth Engine enabled, this token
      // works directly with the EE JS API.
      return jsonResponse({
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
      }, 200, request);
    } catch (err) {
      return jsonResponse({ error: 'Internal error', message: err.message }, 500, request);
    }
  },
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}
