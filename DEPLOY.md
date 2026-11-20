# SafeChat AI — Deployment & Setup Guide

## Architecture

- **Frontend**: React + Vite → static build in `dist/` → Netlify.
- **Backend**: Supabase (Auth, Postgres, Realtime, Storage, Edge Functions).
- **AI**: OpenRouter free models, called ONLY from Supabase Edge Functions.
  `OPENROUTER_API_KEY` lives in Supabase function secrets — never in the frontend.

## 1. Supabase setup

1. Create a project at https://supabase.com (free tier).
2. SQL Editor → run `supabase/migrations/0001_init.sql` in full.
3. Authentication → URL Configuration:
   - Site URL: `https://your-site.netlify.app`
   - Redirect URLs: `https://your-site.netlify.app/**` and `http://localhost:5173/**`

## 2. Supabase Edge Functions (the AI backend)

Install Supabase CLI, then:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the AI functions
supabase functions deploy analyze
supabase functions deploy ask

# Set secrets (the OpenRouter key you already added stays server-side)
supabase secrets set OPENROUTER_API_KEY=sk-or-...
supabase secrets set OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free   # optional
```

Or via Dashboard → Edge Functions → Secrets (no CLI needed for secrets, but
functions still must be deployed — paste `supabase/functions/analyze/index.ts`
and `ask/index.ts` + `_shared/openrouter.ts` via the dashboard editor, or use CLI).

**Free model used by default**: `nvidia/nemotron-3-ultra-550b-a55b:free`,
with automatic fallback to other verified `:free` models on rate-limit or
unavailability. Change anytime via the `OPENROUTER_MODEL` secret — never set a
paid model.

## 3. Frontend env + Netlify deploy

`.env` (local) / Netlify env vars (build time):

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then:

```bash
npm install
npm run build
netlify deploy --prod --dir=dist
```

No AI keys are needed in Netlify — all AI calls go through Supabase functions.

## 4. Local dev

```bash
npm run dev          # frontend on :5173
supabase functions serve   # edge functions on :54321 (optional for local AI)
```

For local edge-function testing, run `supabase start` + `supabase functions serve`
and point `VITE_SUPABASE_URL` at `http://localhost:54321` — or just test AI on the deployed project.

## 5. Verify

1. Register two accounts, add as friends, chat.
2. Send a scam-like message (e.g. "Share the OTP, your bank account will be blocked").
3. Right sidebar should flag it (rule engine instantly; AI within ~2s if functions are deployed).
4. Open `/safety` dashboard.

## Local Windows note

This PC's Application Control policy blocks native `.node` binaries (Rollup).
`node_modules/rollup` has been swapped to `@rollup/wasm-node`. If you run
`npm install` again it will be restored — re-apply:

```bash
npm pack @rollup/wasm-node@4.68.4
rm -rf node_modules/rollup && mkdir node_modules/rollup
tar xzf rollup-wasm-node-4.68.4.tgz -C node_modules/rollup --strip-components=1
```

Netlify's Linux build is unaffected.

## Files added for OpenRouter integration

- `supabase/functions/_shared/openrouter.ts` — OpenRouter client, model fallback,
  retries, timeout, rate limit, cache, JSON validation, Supabase helpers.
- `supabase/functions/analyze/index.ts` — conversation analysis endpoint.
- `supabase/functions/ask/index.ts` — Ask-AI endpoint.
- `supabase/config.toml` — function JWT verification config.
- `src/lib/ai.js` — now calls Supabase Edge Functions instead of Netlify.
- `src/safety/engine.js` — handles `fallback`/`skipped` responses.

The Netlify functions in `netlify/functions/` remain as an alternative backend
(Gemini/OpenRouter via Netlify env vars) but are no longer used by the frontend.
Remove them if you don't need them.
