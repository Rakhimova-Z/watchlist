# Watchlist

Personal movie/series watchlist frontend backed by Supabase.

## Stack
- Static HTML/CSS/JS frontend
- Supabase Auth + Postgres
- Supabase Edge Function `tmdb`
- TMDB as metadata source

## Security
- `config.js` contains only the public Supabase URL and publishable key.
- `TMDB_ACCESS_TOKEN` must stay in Supabase Edge Function secrets and must never be committed.

## Deploy
This repo is ready for Cloudflare Pages Git deployment.
- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
