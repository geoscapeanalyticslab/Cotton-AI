# Cotton-AI — Sindh Cotton Dashboard

Live map of 21 Sindh districts and 600 cotton fields, with climate and NDVI
queries run **in the browser, against the user's own Earth Engine account**.

**Live site:** https://geoscapeanalyticslab.github.io/Cotton-AI/

## How the live data works

| Layer | Source |
|---|---|
| Districts, fields, historical yield | Precomputed GeoJSON/JSON in `docs/data/` |
| Climate (ERA5-Land, CHIRPS) | Earth Engine JS API, queried live after sign-in |
| NDVI percentiles | Sentinel-2 SR, queried live after sign-in |

Sign-in uses the Google Identity Services **token flow**
(`google.accounts.oauth2.initTokenClient`), so there is no backend and no client
secret. The token is passed straight to `ee.data.setAuthToken()`.

## One-time Google Cloud setup

Everything below lives in the project that owns the OAuth client
(currently `1014576056812`).

1. **Enable the Earth Engine API**
   https://console.cloud.google.com/apis/library/earthengine.googleapis.com?project=1014576056812

2. **Create a Web application OAuth client**
   https://console.cloud.google.com/auth/clients?project=1014576056812
   - Authorized JavaScript origin: `https://geoscapeanalyticslab.github.io`
   - No redirect URI is needed for the token flow.

3. **Configure the consent screen (Google Auth Platform)**
   https://console.cloud.google.com/auth/overview?project=1014576056812
   - Branding → App name, user support email, developer contact email
   - Audience → External
   - Data Access → add `https://www.googleapis.com/auth/earthengine.readonly`

4. **Grant access to users** — this is the step people miss.
   https://console.cloud.google.com/auth/audience?project=1014576056812

   While the app is in **Testing**, only accounts listed under
   **Test users** can sign in. Anyone else sees:

   ```
   Access blocked: geoscapeanalyticslab.github.io has not completed
   the Google verification process
   Error 403: access_denied
   ```

   Either **Add users** there, or click **Publish app** to move the app to
   *In production* (unverified apps then show the usual
   "Google hasn't verified this app → Advanced → Go to app" interstitial,
   which is fine for a sensitive, non-restricted scope).

## Configuration

`frontend/.env` (git-ignored):

```
VITE_GOOGLE_CLIENT_ID=1014576056812-....apps.googleusercontent.com
VITE_EE_PROJECT=1014576056812
```

The same values are read from repository secrets at build time in
`.github/workflows/deploy.yml`: `VITE_GOOGLE_CLIENT_ID` and `VITE_EE_PROJECT`.

A project **number** works as well as a project **ID**.

## Development

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # writes frontend/dist
```

## Deployment

`.github/workflows/deploy.yml` builds the frontend and commits the output into
`docs/`, which GitHub Pages serves from `main` /docs. Nothing needs to be
uploaded manually; pushing to `main` is enough.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Error 403: access_denied`, "has not completed the Google verification process" | App is in Testing mode and the account is not a Test user. See step 4. |
| `Project 'projects/ee-...' not found or deleted` | `VITE_EE_PROJECT` points at a project that does not exist. Use the project number. |
| `Caller does not have permission` on an EE query | The signed-in account has no Earth Engine access, or the project has no EE API enabled. |
| Sign-in popup closes immediately | Browser blocked the popup, or `VITE_GOOGLE_CLIENT_ID` is empty. |
| Live queries silently fall back to precomputed data | The header now shows the Earth Engine error next to the sign-in button. |
