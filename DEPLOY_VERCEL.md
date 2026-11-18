# Deploying to Vercel (Node + Supabase Postgres)

Personal / single-user deployment: the MCP server runs as one Vercel Node
function; OAuth grants, clients, sessions and encrypted Google tokens live in
Supabase Postgres (`STORAGE=postgres`). Token encryption stays local
(`CIPHER=static` + `ENCRYPTION_SECRET`). Nothing is sent to non-Google hosts
except your Supabase project.

Hostname used below: `https://gtasks-mcp-nikhil.vercel.app` — change it if your
Vercel project URL differs.

## Prerequisites

- A [Vercel](https://vercel.com) account linked to this GitHub fork
- A [Supabase](https://supabase.com) project (free tier is enough)
- A Google Cloud OAuth **Web application** client with redirect URI
  `https://gtasks-mcp-nikhil.vercel.app/callback`

## 1. Database migration

In the Supabase SQL editor (or CLI), apply:

[`supabase/migrations/20261118120000_kv_entries.sql`](supabase/migrations/20261118120000_kv_entries.sql)

That creates `public.kv_entries`, enables RLS, adds **no** public policies, and
grants DML only to `service_role`. The Vercel function must use the **service
role** key (never the anon key).

## 2. Google OAuth client

1. Google Auth Platform → create (or reuse) a **Web application** client.
2. Authorized redirect URI: `https://gtasks-mcp-nikhil.vercel.app/callback`.
3. Scopes used by the server: `openid`, `email`,
   `https://www.googleapis.com/auth/tasks`.

## 3. Vercel project

1. Import this repository in Vercel (Root Directory = repo root).
2. `vercel.json` sets `"framework": null` (avoids Dockerfile → “container”
   auto-detect), routes every path to `api/index.ts`, sets `maxDuration` 60s,
   and includes `public/**` for HTML pages. The function imports `src/` directly
   so `@vercel/node` bundles the app — no separate `tsc` output is required at
   runtime.
3. Set the environment variables below (Production; Preview optional).
4. Deploy.

Generate the encryption secret locally:

```bash
npm run generate-secret
```

## 4. Environment variables

| Name | Example / value | Notes |
|------|-----------------|-------|
| `GOOGLE_CLIENT_ID` | *(from Google Cloud)* | Required |
| `GOOGLE_CLIENT_SECRET` | *(from Google Cloud)* | Required |
| `GOOGLE_REDIRECT_URI` | `https://gtasks-mcp-nikhil.vercel.app/callback` | Must match the OAuth client |
| `ISSUER_URL` | `https://gtasks-mcp-nikhil.vercel.app` | No trailing slash; required behind Vercel’s proxy |
| `ENCRYPTION_SECRET` | *(output of `npm run generate-secret`)* | ≥ 32 chars; `CIPHER` defaults to `static` |
| `STORAGE` | `postgres` | Selects the Supabase-backed store |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Project URL (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | *(service_role secret)* | **Server only**; bypasses RLS |
| `ANALYTICS` | `false` | Strips upstream GA from public pages |
| `ALLOWED_REDIRECT_URIS` | see below | Lock down which MCP clients may register |
| `TRUST_PROXY_HOPS` | `1` | Rate-limit by the real client IP on Vercel |
| `PUBLIC_PAGES` | `true` or `auto` | Optional; default `true` |
| `LOG_LEVEL` | `info` | Optional |
| `ALLOWED_ORIGINS` | *(usually unset)* | Optional CORS allowlist |
| `ALLOWED_DOMAIN` | *(your Workspace domain)* | Optional; omit for any Google account |
| `CIPHER` | `static` | Leave default for this deployment |

### `ALLOWED_REDIRECT_URIS`

Comma-separated exact `https` URIs, plus `loopback` for local clients
(`mcp-remote`, CLI tools). Example for Claude + loopback:

```text
loopback,https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback
```

Add any other MCP client callback URLs you use. If unset, any https/loopback
redirect may register (fine for a private URL, weaker if the host is public).

## 5. Smoke check

```bash
curl -sS https://gtasks-mcp-nikhil.vercel.app/health
curl -sS https://gtasks-mcp-nikhil.vercel.app/.well-known/oauth-authorization-server
```

Then add the server in your MCP client as
`https://gtasks-mcp-nikhil.vercel.app/mcp` and complete the OAuth browser flow
once. Grants persist in Supabase across cold starts.

## 6. What talks to the network

| Destination | Why |
|-------------|-----|
| `oauth2.googleapis.com` / Google APIs | Sign-in + Tasks |
| Your `SUPABASE_URL` | Persistent store |
| MCP client ↔ this host | OAuth + `/mcp` |

With `ANALYTICS=false`, public HTML does not load Google Analytics.

## Troubleshooting

- **Re-auth on every request**: `STORAGE` is not `postgres`, or Supabase env vars
  are missing — the default Deno KV path is in-memory on Vercel.
- **503 / temporarily_unavailable**: Supabase unreachable; check project status
  and that the service role key is correct.
- **Client registration rejected**: redirect URI not in `ALLOWED_REDIRECT_URIS`.
- **Wrong issuer / redirect**: set `ISSUER_URL` and `GOOGLE_REDIRECT_URI` to the
  canonical `https://…vercel.app` host (no trailing slash on `ISSUER_URL`).
