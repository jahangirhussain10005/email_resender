# AWA Supabase Paid Micro Test

Edge Function: `submit-quote`  
Database: `email_logs`  
Email Service: [Resend](https://resend.com)

---

## 📌 Overview
This project implements a secure Supabase **Edge Function** to send emails via Resend, log them in Postgres, and ensure **idempotency** (no duplicate sends).

It replaces the earlier version with a **production-ready** update:
- 🔒 **Security hardened** (CORS checks, env vars, no secrets in code).
- ✅ **Idempotency** enforced using `idempotency_key`.
- 📝 **Logging** every send attempt into `email_logs` table.
- 🛠️ **Cleaner error handling** for debugging.
- 📤 Uses a **verified sender domain** for production.

---

## 🛠️ Functionality

1. **POST Handler**  
   Accepts JSON body:
   ```json
   {
     "quote_id": "Q-123",
     "to": "customer@example.com",
     "subject": "Your AWA Quote",
     "html": "<h1>Hello</h1>",
     "idempotency_key": "Q-123-email-1"
   }
CORS
Only allows requests from domains listed in ALLOWED_ORIGINS.

Resend API
Sends the email using the Resend API with your verified domain sender address.

Logging
Every attempt (success or failure) is stored in the email_logs table with:

quote_id

to_email

subject

status

resend_id

idempotency_key

payload

Idempotency
If the same idempotency_key is used again, no new email is sent.
The function returns the existing resend_id with status "duplicate".

🗄️ Database Schema
Run sql/email_logs.sql in your Supabase project:

sql
Copy code
create extension if not exists pgcrypto;

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  quote_id text,
  to_email text not null,
  subject text not null,
  status text not null,
  resend_id text,
  idempotency_key text unique,
  payload jsonb,
  created_at timestamptz default now()
);

create index if not exists email_logs_created_at_idx 
on public.email_logs (created_at desc);
⚙️ Environment Variables
Set these in Supabase project settings:

env
Copy code
RESEND_API_KEY=your_resend_key
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ALLOWED_ORIGINS=https://www.aluminiumwindowsaustralia.com.au,https://www.quotemywindows.info
🚀 Deployment Steps
Run sql/email_logs.sql in Supabase SQL Editor.

Create Edge Function:

bash
Copy code
supabase functions new submit-quote
Paste functions/submit-quote/index.ts into the function.

Set environment variables in Supabase.

Deploy:

bash
Copy code
supabase functions deploy submit-quote
Test with curl-test.sh.

📤 Test with Curl
bash
Copy code
#!/usr/bin/env bash
FUNC_URL="https://YOUR_PROJECT.functions.supabase.co/submit-quote"

curl -i -X POST "$FUNC_URL" \
  -H "Content-Type: application/json" \
  -H "Origin: https://www.aluminiumwindowsaustralia.com.au" \
  -d '{
    "quote_id":"Q-123",
    "to":"test@example.com",
    "subject":"Your AWA Quote",
    "html":"<h1>Thanks for your enquiry</h1><p>This is a test.</p>",
    "idempotency_key":"Q-123-email-1"
  }'
🔧 Notes for Production
Update the sender email in functions/submit-quote/index.ts:

ts
Copy code
from: "AWA Quotes <quotes@your-domain.com>",
Replace with your verified sender domain in Resend.

Double-check ALLOWED_ORIGINS for correct domains.

Do not expose SUPABASE_SERVICE_ROLE_KEY outside of Edge Functions.

👨‍💻 Author
Developed by @jahangirhussain10005
Custom Supabase Edge Function integration for AWA.









Ask ChatGPT
