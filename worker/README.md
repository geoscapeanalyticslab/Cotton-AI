# Earth Engine OAuth Token Exchange Worker

This Cloudflare Worker handles the OAuth code → token exchange for Earth Engine access.

## Why is this needed?

Google Sign-In can't directly request Earth Engine scopes in the browser.
This worker takes the auth code from Google Sign-In and exchanges it for an
access token with the `earthengine.readonly` scope.

## Setup

1. **Create a Cloudflare account** (free): https://dash.cloudflare.com/sign-up

2. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

3. **Authenticate**:
   ```bash
   wrangler login
   ```

4. **Set secrets** (never put these in code):
   ```bash
   wrangler secret put CLIENT_ID
   # Paste your Google OAuth 2.0 Client ID

   wrangler secret put CLIENT_SECRET
   # Paste your Google OAuth 2.0 Client Secret
   ```

5. **Deploy**:
   ```bash
   cd worker
   wrangler deploy
   ```

6. **Note the URL** — it'll be something like:
   `https://cotton-ai-ee-auth.YOUR_SUBDOMAIN.workers.dev`

7. **Set it in your frontend .env**:
   ```
   VITE_EE_AUTH_WORKER=https://cotton-ai-ee-auth.YOUR_SUBDOMAIN.workers.dev
   ```

## Google Cloud Console Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add your GitHub Pages domain as an Authorized JavaScript origin
4. Add your Worker URL as an Authorized redirect URI
5. Enable the Earth Engine API in your GCP project
