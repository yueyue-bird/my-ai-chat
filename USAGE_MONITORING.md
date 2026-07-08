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
