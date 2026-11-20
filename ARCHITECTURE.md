# SafeChat AI — Architecture

## Overview

SafeChat AI is a three-tier app:

```
React SPA (Netlify static)  ──►  Supabase (Auth + Postgres + Realtime + Storage)
        │                            ▲
        └──► Netlify Function /api/analyze ──► AI provider (Gemini / OpenRouter)
```

The browser never holds AI keys. All AI calls go through a Netlify Function that
validates the caller's Supabase JWT, enforces rate limits, and proxies to the
configured provider. Detection has two layers:

1. **Deterministic rule engine** (`src/safety/rules.js`) — runs in the browser,
   always available, zero cost, instant. Produces per-message flags and a
   heuristic score.
2. **Contextual AI analysis** — runs server-side on demand (debounced after new
   messages) and on "Ask AI" questions. Returns strict JSON, validated against a
   schema. Falls back to rule-engine output when the AI is unavailable or quota
   is exhausted.

## Module map

| Module | Path | Responsibility |
|---|---|---|
| Supabase client | `src/lib/supabase.js` | Auth + DB + Realtime client |
| Auth pages/hooks | `src/authentication/`, `src/hooks/useAuth.js` | Register/login/logout/session |
| Contacts | `src/contacts/` | Friend requests, search, presence |
| Messaging | `src/messaging/` | Chat UI, message send/receive, groups, typing |
| Safety engine | `src/safety/` | Rules, scoring, conversation aggregation |
| AI sidebar | `src/components/SafetySidebar.jsx` | Right-panel UI |
| Safety dashboard | `src/dashboard/` | Aggregate stats + reports |
| AI proxy | `netlify/functions/analyze.js` | Secure server-side AI calls |
| AI providers | `netlify/functions/ai-providers.js` | Gemini + OpenRouter adapters |

## Data flow (message → safety)

1. User sends message → `messages` insert → Supabase Realtime broadcast to members.
2. Client runs rule engine on the new message (instant highlight).
3. Debounced (e.g. 2s after last message): client calls `POST /.netlify/functions/analyze`
   with `{ conversationId, messages: [...] }` (bounded window).
4. Function verifies JWT via `supabase.auth.getUser(token)`, checks membership in
   `conversation_members` via service role, rate-limits, calls provider, validates
   JSON, upserts `safety_analyses`, returns result.
5. UI merges AI result with rule-engine result; caches in `safety_analyses`.

## Key design decisions

- **RLS everywhere**: messages readable only by `conversation_members`; profiles
  readable by authenticated users; analyses readable by conversation members.
- **Service role only in functions**: never shipped to the browser.
- **Prompt-injection defence**: message content is wrapped in delimiters and the
  system prompt forbids following instructions inside messages; output is strict
  JSON schema-validated.
- **Incremental analysis**: only messages since last analysis are sent; results
  merged server-side.
- **Provider abstraction**: `AI_PROVIDER` env var selects Gemini or OpenRouter;
  `rules` mode disables AI entirely for offline/dev.

## Environment variables

See `.env.example`. `VITE_*` = public frontend. Everything else = Netlify
function env vars only.
