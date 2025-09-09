// functions/render_warranty_pdf/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WARRANTY_BUCKET = Deno.env.get("WARRANTY_BUCKET") || "warranty";
const AWA_SUPPORT_EMAIL = Deno.env.get("AWA_SUPPORT_EMAIL") || "support@aluminiumwindowsaustralia.com.au";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function safeJson(res: Response | any) {
  try {
    if (!res) return null;
    // Some responses are already parsed objects
    if (typeof res.json === "function" && res.bodyUsed !== undefined) {
      const txt = await res.text().catch(()=>"");
      if (!txt) return null;
      return JSON.parse(txt);
    }
    return res;
  } catch (e) {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });

    // Accept either JSON { warranty_number } or { job_ref } for lookup
    const raw = await req.text();
    if (!raw) return new Response(JSON.stringify({ ok: false, error: "Empty body" }), { status: 400 });
    let body: any;
    try { body = JSON.parse(raw); } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400 });
    }

    const { warranty_number, job_ref, idempotency_key } = body;
    if (!warranty_number && !job_ref) return new Response(JSON.stringify({ ok: false, error: "warranty_number or job_ref required" }), { status: 400 });

    // 1) Find warranty record (by warranty_number or job_ref)
    let q = `${SUPABASE_URL}/rest/v1/warranty_records?`;
    if (warranty_number) q += `warranty_number=eq.${encodeURIComponent(warranty_number)}`;
    else q += `job_id=eq.${encodeURIComponent(job_ref)}`; // note: if job_ref not job_id; better to look up job first; we'll try warranty_number primarily.

    // Simpler: query using RPC style via supabase client
    const lookup = warranty_number
      ? await supabase.from("warranty_records").select("*").eq("warranty_number", warranty_number).limit(1).maybeSingle()
      : await supabase.rpc?.("get_warranty_by_job_ref", { _job_ref: job_ref }).catch(async ()=> {
          // fallback: join via jobs table
          const j = await supabase.from("jobs").select("id").eq("job_ref", job_ref).limit(1).maybeSingle();
          const jobRow = (j.data as any) ?? null;
          if (!jobRow) return { data: null };
          return await supabase.from("warranty_records").select("*").eq("job_id", jobRow.id).limit(1).maybeSingle();
        });

    const warrantyRow = (lookup && (lookup.data ?? lookup))?.data ?? lookup?.data ?? lookup?.[0] ?? (lookup as any).data ?? lookup as any;
    // The above is defensive; prefer using the simpler client below:

    // Simpler reliable lookup:
    let warranty;
    if (warranty_number) {
      const { data } = await supabase.from("warranty_records").select("*").eq("warranty_number", warranty_number).limit(1).maybeSingle();
      warranty = data;
    } else {
      // lookup job by job_ref then warranty
      const { data: job } = await supabase.from("jobs").select("id, job_ref, customer_name, customer_email, site_address").eq("job_ref", job_ref).limit(1).maybeSingle();
      if (!job) return new Response(JSON.stringify({ ok: false, error: "Job not found" }), { status: 404 });
      const { data } = await supabase.from("warranty_records").select("*").eq("job_id", job.id).limit(1).maybeSingle();
      warranty = data;
    }

    if (!warranty) return new Response(JSON.stringify({ ok: false, error: "Warranty record not found" }), { status: 404 });

    // If there's already a certificate path in metadata, return it (idempotency)
    const existingPath = warranty.metadata?.certificate_path ?? null;
    if (existingPath && !body.force) {
      // return existing path and signed url
      const { data: signed } = await supabase.storage.from(WARRANTY_BUCKET).createSignedUrl(existingPath, 120);
      return new Response(JSON.stringify({ ok: true, reused: true, filePath: existingPath, signedUrl: signed?.signedUrl ?? signed }), { status: 200 });
    }

    // 2) Build PDF using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const draw = (text: string, x: number, y: number, size = 12) => page.drawText(text, { x, y, size, font, color: rgb(0,0,0) });

    // Header + Branding
    draw("AWA Aluminium Windows", 50, 800, 16);
    draw("Warranty Certificate", 50, 780, 14);
    draw(`Warranty Number: ${warranty.warranty_number}`, 50, 760, 12);
    draw(`Job ID: ${warranty.job_id ?? ''}`, 50, 742, 10);
    draw(`Customer: ${warranty.customer_name ?? ''}`, 50, 724, 10);
    draw(`Customer Email: ${warranty.customer_email ?? ''}`, 50, 706, 10);
    draw(`Site: ${warranty.site_address ?? ''}`, 50, 688, 10);
    draw(`Issued at: ${warranty.issued_at ?? ''}`, 50, 670, 10);
    draw(`Status: ${warranty.status ?? 'active'}`, 50, 652, 10);

    // Simple body text
    const bodyText = [
      "This certificate confirms the warranty for the works described in the associated job.",
      "Please keep this warranty number for any future claims.",
      `If you have queries, contact ${AWA_SUPPORT_EMAIL}.`
    ];
    let ty = 620;
    for (const t of bodyText) {
      draw(t, 50, ty, 10);
      ty -= 18;
    }

    // Optional: small footer
    draw(`Generated: ${new Date().toISOString()}`, 50, 40, 8);

    const pdfBytes = await pdfDoc.save();

    // 3) Upload to Supabase Storage (warranty bucket)
    // Path: warranties/{warranty_number}/AWA_Warranty_{warranty_number}.pdf
    const filePath = `warranties/${warranty.warranty_number}/AWA_Warranty_${warranty.warranty_number}.pdf`;

    // upload using supabase-js
    const up = await supabase.storage.from(WARRANTY_BUCKET).upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`);

    // 4) Update warranty_records.metadata with certificate_path
    const newMetadata = { ...(warranty.metadata || {}), certificate_path: filePath, certificate_generated_at: new Date().toISOString() };
    const { error: uErr } = await supabase.from("warranty_records").update({ metadata: newMetadata }).eq("id", warranty.id);
    if (uErr) {
      // cleanup file to avoid orphan
      await supabase.storage.from(WARRANTY_BUCKET).remove([filePath]).catch(()=>null);
      throw uErr;
    }

    // 5) Return signed URL
    const { data: signedUrlData, error: sErr } = await supabase.storage.from(WARRANTY_BUCKET).createSignedUrl(filePath, 120);
    if (sErr) {
      return new Response(JSON.stringify({ ok: true, filePath, message: "Uploaded but could not create signed URL", details: sErr.message }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true, filePath, signedUrl: signedUrlData.signedUrl }), { status: 200 });

  } catch (err) {
    console.error("render_warranty_pdf error:", String(err));
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500 });
  }
});
