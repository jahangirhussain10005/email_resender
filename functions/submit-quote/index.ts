// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("URL_SUPABASE");
const SERVICE_ROLE = Deno.env.get("SERVICE_SUPABASE_ROLE_KEY");
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Fail fast if required env vars are missing
if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing one or more required environment variables.");
}

function cors(origin: string | null) {
  const allowed = origin && ALLOWED.includes(origin) ? origin : null;
  return {
    headers: {
      "Access-Control-Allow-Origin": allowed ?? "null",
      "Vary": "Origin",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  };
}

async function alreadyLogged(key: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/email_logs?select=resend_id,status&idempotency_key=eq.${encodeURIComponent(
      key,
    )}`,
    {
      headers: {
        "apikey": SERVICE_ROLE,
        "Authorization": `Bearer ${SERVICE_ROLE}`,
      },
    },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function logSend(row: any) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_logs`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_ROLE,
        "Authorization": `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(row),
    });
  } catch (err) {
    console.error("Failed to log email send:", err);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { ...cors(origin), status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { ...cors(origin), status: 405 },
    );
  }

  // Reject unapproved origins
  if (ALLOWED.length && (!origin || !ALLOWED.includes(origin))) {
    return new Response(
      JSON.stringify({ error: "Origin not allowed" }),
      { ...cors(origin), status: 403 },
    );
  }

  // Parse JSON body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { ...cors(origin), status: 400 },
    );
  }

  const { quote_id, to, subject, html, idempotency_key } = body || {};

  // Validate fields
  if (!to || !subject || !html || !idempotency_key) {
    return new Response(
      JSON.stringify({
        error: "Missing fields: to, subject, html, idempotency_key",
      }),
      { ...cors(origin), status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return new Response(
      JSON.stringify({ error: "Invalid email address" }),
      { ...cors(origin), status: 400 },
    );
  }

  // Prevent duplicate send
  const existing = await alreadyLogged(idempotency_key);
  if (existing) {
    return new Response(
      JSON.stringify({
        ok: true,
        resend_id: existing.resend_id,
        status: "duplicate",
      }),
      { ...cors(origin), status: 200 },
    );
  }

  // Send email via Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AWA Quotes <quotes@your-domain.com>", // ✅ use verified domain
      to: [to],
      subject,
      html,
    }),
  });

  const out = await res.json();

  if (!res.ok) {
    await logSend({
      quote_id,
      to_email: to,
      subject,
      status: "error",
      resend_id: out?.id ?? null,
      idempotency_key,
      payload: out,
    });
    return new Response(
      JSON.stringify({ error: "Resend failed", details: out }),
      { ...cors(origin), status: 502 },
    );
  }

  await logSend({
    quote_id,
    to_email: to,
    subject,
    status: "sent",
    resend_id: out.id,
    idempotency_key,
    payload: body,
  });

  return new Response(
    JSON.stringify({ ok: true, resend_id: out.id }),
    { ...cors(origin), status: 200 },
  );
});
