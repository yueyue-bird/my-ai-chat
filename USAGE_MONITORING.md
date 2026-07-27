# Usage Monitoring Setup

The app records Suno API usage through `lib/usageMonitor.ts`.

Local development uses:

- `.data/usage-events.jsonl`

Vercel production should use Supabase:

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the SQL in `supabase-usage-events.sql`.
4. Add these environment variables in Vercel:

```env
ADMIN_USAGE_TOKEN="use-a-long-random-admin-token"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_USAGE_TABLE="usage_events"
```

Also keep your existing Suno variables:

```env
SUNO_API_KEY="..."
SUNO_API_BASE_URL="https://api.sunoapi.org"
```

Public users can use `/generate`.
Only someone with `ADMIN_USAGE_TOKEN` can read `/admin/usage` data.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in client code or publish it.

## Music retention and Blob capacity protection

Run `supabase-generated-music.sql` in the Supabase SQL Editor. Besides the
generated-music table, it creates the private `music_cleanup_runs` audit table.

Configure these server-only Vercel environment variables:

```env
CRON_SECRET="use-a-separate-long-random-secret"
SUPABASE_MUSIC_CLEANUP_TABLE="music_cleanup_runs"
MUSIC_RETENTION_DAYS="90"
BLOB_STORAGE_BUDGET_BYTES="1073741824"
BLOB_CLEANUP_HIGH_WATERMARK="0.90"
BLOB_CLEANUP_TARGET="0.85"
MUSIC_CLEANUP_BATCH_SIZE="20"
```

`BLOB_STORAGE_BUDGET_BYTES` is the amount assigned to this app's `music/`
prefix, not a value automatically read from the Vercel billing plan. Update it
when the plan or storage allowance changes.

Cleanup runs after a successful music persistence request and once per day
through `/api/cron/storage-cleanup`. Vercel Cron sends
`Authorization: Bearer <CRON_SECRET>`, and the route rejects requests when the
secret is missing or does not match.

The cleanup order is:

1. Unreferenced files under `music/`.
2. Music older than the retention window.
3. The oldest remaining music when usage is above the high watermark, until it
   reaches the target watermark.

Each run processes at most `MUSIC_CLEANUP_BATCH_SIZE` music records. The admin
storage page supports a non-destructive preview before a manual cleanup.
