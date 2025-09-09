// functions/get_warranty_certificate/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WARRANTY_BUCKET = Deno.env.get("WARRANTY_BUCKET") || "warranty";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });

    let warranty_number: string | null = null;
    if (req.method === "GET") {
      const url = new URL(req.url);
      warranty_number = url.searchParams.get("warranty_number");
    } else {
      const raw = await req.text();
      if (!raw) return new Response(JSON.stringify({ ok: false, error: "Empty body" }), { status: 400 });
      const body = JSON.parse(raw);
      warranty_number = body?.warranty_number;
    }

    if (!warranty_number) return new Response(JSON.stringify({ ok: false, error: "warranty_number required" }), { status: 400 });

    const { data: warranty } = await supabase.from("warranty_records").select("id, metadata, warranty_number").eq("warranty_number", warranty_number).limit(1).maybeSingle();
    if (!warranty) return new Response(JSON.stringify({ ok: false, error: "Warranty not found" }), { status: 404 });

    const path = warranty.metadata?.certificate_path ?? null;
    if (!path) return new Response(JSON.stringify({ ok: false, error: "Certificate not generated", code: "CERT_NOT_FOUND" }), { status: 404 });

    const { data: signed, error } = await supabase.storage.from(WARRANTY_BUCKET).createSignedUrl(path, 120);
    if (error) return new Response(JSON.stringify({ ok: false, error: "Signed URL generation failed", details: error.message }), { status: 500 });

    return new Response(JSON.stringify({ ok: true, filePath: path, signedUrl: signed.signedUrl }), { status: 200 });

  } catch (err) {
    console.error("get_warranty_certificate error:", String(err));
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500 });
  }
});
