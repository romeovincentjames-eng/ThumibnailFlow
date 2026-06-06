# Supabase Auth setup

ThumbnailFlow Batch now requires accounts before users can open the generator, create batches, buy credits, regenerate images, or apply changes to YouTube.

## Required Supabase steps

1. Run the latest `supabase/schema.sql` in the Supabase SQL editor. This adds:
   - `billing_accounts.user_id`
   - `billing_accounts`
   - `point_ledger`
   - `apply_points_delta`

2. In Supabase Dashboard, open **Authentication > URL Configuration**.

3. Set the local site URL:

```text
http://localhost:3000
```

4. Add redirect URLs:

```text
http://localhost:3000/auth/callback
http://localhost:3000/generate
http://localhost:3000/pricing
```

5. Enable the Email provider under **Authentication > Providers**.

If email confirmation is enabled, users will sign up, confirm by email, then log in. If confirmation is disabled during development, signup logs users in immediately.
