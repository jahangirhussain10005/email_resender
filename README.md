# AWA Supabase Paid Micro Test (≤3 hours)

Goal: Edge Function `submit-quote` using Resend + DB logging with idempotency + CORS.

Deliverables
1) POST handler accepting { quote_id, to, subject, html, idempotency_key }
2) CORS check vs ALLOWED_ORIGINS
3) Send via Resend
4) Insert into email_logs (sql/email_logs.sql)
5) Return { ok: true, resend_id } on success

Acceptance
- Security: no secrets in code; origin checked; env vars used
- Idempotency: same idempotency_key doesn't send twice
- Logging: row per unique key with resend_id + payload

Steps
1) Run sql/email_logs.sql
2) Create Edge Function submit-quote and paste functions/submit-quote/index.ts
3) Add env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS
4) Deploy → test with curl-test.sh
