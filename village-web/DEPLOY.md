# Deploying Village Web to Cloudflare Pages

## Prerequisites
1. Complete Supabase setup — see `../SUPABASE_SETUP.md`
2. Install wrangler: `npm install -g wrangler`
3. Log in: `wrangler login`

## Deploy

```bash
cd /Users/ramcha1994/Admin/admin/village-web
bash deploy.sh YOUR_SUPABASE_URL YOUR_SUPABASE_ANON_KEY
```

This script:
1. Injects your Supabase credentials into a deploy copy of `index.html`
2. Uploads the `village-web/` directory to Cloudflare Pages

## What happens after deploy

- Members visit `https://your-project.pages.dev/?member=MEMBER_ID`
- The web app fetches their pre-computed feed from Supabase `village_feeds`
- Comments/interactions are written directly to Supabase
- Next time Admin syncs, it pulls cloud interactions into local DB

## Keeping feeds fresh

The deployed feed is only as fresh as the last Admin sync. Click the sync
button in Admin → Village, or it auto-syncs every 5 minutes when Admin is open.

## Custom domain

In Cloudflare Pages → your project → Custom domains, add your domain.
