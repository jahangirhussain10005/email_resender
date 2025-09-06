#!/usr/bin/env bash
FUNC_URL="https://YOUR_PROJECT.functions.supabase.co/submit-quote"
curl -i -X POST "$FUNC_URL"   -H "Content-Type: application/json"   -H "Origin: https://www.aluminiumwindowsaustralia.com.au"   -d '{
    "quote_id":"Q-123",
    "to":"test@example.com",
    "subject":"Your AWA Quote",
    "html":"<h1>Thanks for your enquiry</h1><p>This is a test.</p>",
    "idempotency_key":"Q-123-email-1"
  }'
