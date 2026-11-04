# Earth Engine OAuth worker (optional)

**You do not need this worker.** The dashboard authenticates with Google
Identity Services in the browser (token flow) and talks to Earth Engine
directly, so no client secret and no server-side code are involved. See
`frontend/src/ee/auth.js`.

This worker is only for deployments that must use the authorization-code
flow. It swaps a Google auth code for an access token while keeping the
client secret server-side.

## Setup

1. **Create a Cloudflare account** (free): https://dash.cloudflare.com/sign-up
2. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
3. **Set secrets** (never put these in code):
   ```bash
   cd worker
   wrangler secret put CLIENT_ID      # Google OAuth 2.0 client ID
   wrangler secret put CLIENT_SECRET  # Google OAuth 2.0 client secret
   ```
4. **Deploy**:
   ```bash
   wrangler deploy
   ```
5. Note the URL, e.g.
   `https://cotton-ai-ee-auth.YOUR_SUBDOMAIN.workers.dev`.

## Restricting origins

Only browser origins listed in `ALLOWED_ORIGINS` may call the worker. The
defaults are `https://geoscapeanalyticslab.github.io` and the local Vite dev
server. Override with a Wrangler var if you fork this repo:

```toml
[vars]
ALLOWED_ORIGINS = "https://your-site.example,http://localhost:5173"
```
