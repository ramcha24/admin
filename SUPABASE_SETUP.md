# Supabase Setup for Village

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in
2. Create a new project (free tier is fine)
3. Note your **Project URL** and **anon/public key** from Project Settings → API

## 2. Run this SQL in the Supabase SQL editor

```sql
-- Activity published by the owner
CREATE TABLE IF NOT EXISTS village_activity (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,           -- owner's @handle
  source_tool   TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Interactions submitted by village members via the web app
CREATE TABLE IF NOT EXISTS village_interactions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username      TEXT NOT NULL,           -- owner's @handle (which feed this belongs to)
  activity_id   TEXT NOT NULL REFERENCES village_activity(id) ON DELETE CASCADE,
  member_id     TEXT NOT NULL,           -- visitor's self-identified handle or UUID
  member_name   TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'comment',
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Pre-computed member feeds (so the deployed web app just fetches JSON)
CREATE TABLE IF NOT EXISTS village_feeds (
  username    TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  feed_json   JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (username, member_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_username ON village_activity(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_username ON village_interactions(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feeds_member ON village_feeds(username, member_id);

-- Row Level Security: anyone can read activity and write interactions (public feed)
ALTER TABLE village_activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE village_interactions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read activity"
  ON village_activity FOR SELECT USING (true);

CREATE POLICY "Owner insert activity"
  ON village_activity FOR INSERT WITH CHECK (true);

CREATE POLICY "Owner upsert activity"
  ON village_activity FOR UPDATE USING (true);

CREATE POLICY "Public read interactions"
  ON village_interactions FOR SELECT USING (true);

CREATE POLICY "Public insert interactions"
  ON village_interactions FOR INSERT WITH CHECK (true);

-- Feeds table: owner writes, anyone reads
ALTER TABLE village_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read feeds"
  ON village_feeds FOR SELECT USING (true);

CREATE POLICY "Owner upsert feeds"
  ON village_feeds FOR INSERT WITH CHECK (true);

CREATE POLICY "Owner update feeds"
  ON village_feeds FOR UPDATE USING (true);
```

## 3. Add credentials to Admin Settings

In the Admin app → Settings, add:
- **Supabase URL**: `https://YOUR_PROJECT_REF.supabase.co`
- **Supabase Anon Key**: the `anon`/`public` key from your project settings

## 4. Trigger first sync

In Village page, click the Sync button (↻). Admin will push all local activity
to Supabase and pull any cloud interactions back.

## 5. Deploy village-web

See `DEPLOY.md` in this directory for Cloudflare Pages deployment instructions.
The deployed web app reads directly from Supabase using the anon key.
