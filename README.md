# SafeChat AI

An AI-powered messaging app with an integrated scam-detection Safety Assistant.

- **Frontend:** React + Vite + Tailwind + Supabase JS
- **Backend:** Supabase (Auth, Postgres, Realtime, Storage) + Netlify Functions
- **AI:** Gemini / OpenRouter via provider abstraction, plus a deterministic
  rule-based engine that always works offline.

## Quick start

1. `npm install`
2. Copy `.env.example` → `.env` and fill in Supabase values.
3. Apply `supabase/migrations/*.sql` to your Supabase project (SQL editor).
4. `npm run dev`

## Deploy (Netlify, no Git required)

See `DEPLOY.md`.

## AI setup

Set `AI_PROVIDER` and the corresponding API key in Netlify environment
variables. With no key, the app still works using the rule engine and shows
"AI analysis unavailable" in the sidebar.
