#!/usr/bin/env bash
# Deploy village-web to Cloudflare Pages with Supabase credentials injected.
# Usage: bash deploy.sh SUPABASE_URL SUPABASE_ANON_KEY [CF_PROJECT_NAME]
set -e

SUPA_URL="${1:?Usage: bash deploy.sh SUPABASE_URL SUPABASE_ANON_KEY [CF_PROJECT_NAME]}"
SUPA_KEY="${2:?Missing SUPABASE_ANON_KEY}"
CF_PROJECT="${3:-ram-village}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap "rm -rf $TMP_DIR" EXIT

echo "📦 Preparing village-web for deployment..."
cp "$SCRIPT_DIR/index.html" "$TMP_DIR/index.html"
cp "$SCRIPT_DIR/_headers"   "$TMP_DIR/_headers" 2>/dev/null || true

# Inject Supabase credentials
sed -i.bak \
  "s|__SUPABASE_URL__|${SUPA_URL}|g; s|__SUPABASE_ANON_KEY__|${SUPA_KEY}|g" \
  "$TMP_DIR/index.html"
rm -f "$TMP_DIR/index.html.bak"

echo "🚀 Deploying to Cloudflare Pages project: $CF_PROJECT"
wrangler pages deploy "$TMP_DIR" --project-name "$CF_PROJECT"

echo "✅ Deployed. Your village web app is live."
echo "   Share member links as: https://${CF_PROJECT}.pages.dev/?member=MEMBER_ID"
