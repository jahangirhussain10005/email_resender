// functions/render_job_pdf/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PDF_BUCKET = Deno.env.get("PDF_BUCKET") || "job-pdfs";

// Simple CORS helper
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors(req.headers.get("origin")) });
  }

  try {
    const origin = req.headers.get("origin");
    const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(s => s.trim());
    if (origin && allowed.length && !allowed.includes(origin)) {
      return new Response("Forbidden", { status: 403, headers: cors(origin) });
    }

    const { job, idempotency_key } = await req.json();
    if (!job?.job_ref) throw new Error("job_ref required");

    // Compose PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const draw = (text: string, x: number, y: number, size = 12) =>
      page.drawText(text, { x, y, size, font, color: rgb(0,0,0) });

    // Header
    draw("AWA Aluminium Windows — Job Sheet", 50, 800, 16);
    draw(`Job Ref: ${job.job_ref}`, 50, 780);
    draw(`Customer: ${job.customer_name}`, 50, 765);
    draw(`Site: ${job.site_address ?? ''}`, 50, 750);

    // Lines table
    let y = 720;
    draw("Item", 50, y); draw("Qty", 300, y); draw("Unit", 350, y); draw("Amount", 430, y);
    y -= 15;
    for (const line of (job.lines || [])) {
      draw(String(line.item), 50, y);
      draw(String(line.qty), 300, y);
      draw(`$${Number(line.unit).toFixed(2)}`, 350, y);
      draw(`$${Number(line.amount).toFixed(2)}`, 430, y);
      y -= 14;
    }

    // Totals
    y -= 10; draw(`Subtotal: $${Number(job.subtotal).toFixed(2)}`, 430, y);
    y -= 14; draw(`GST: $${Number(job.gst).toFixed(2)}`, 430, y);
    y -= 14; draw(`Total: $${Number(job.total).toFixed(2)}`, 430, y);

    const bytes = await pdfDoc.save();

    // Upload
    const filePath = `${job.job_ref}/AWA_JobSheet_${job.job_ref}.pdf`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    await supabase.storage.from(PDF_BUCKET).upload(filePath, bytes, {
      contentType: "application/pdf",
      upsert: true
    });

    // Ensure job row exists
    const { data: jobRow } = await supabase.from("jobs").select("id").eq("job_ref", job.job_ref).maybeSingle();
    const job_id = jobRow?.id ?? (
      await supabase.from("jobs").insert({
        job_ref: job.job_ref,
        customer_name: job.customer_name,
        customer_email: job.customer_email,
        site_address: job.site_address,
        subtotal: job.subtotal,
        gst: job.gst,
        total: job.total,
        status: "pdf_rendered"
      }).select("id").single()
    ).data.id;

    // Record artifact
    await supabase.from("pdf_artifacts").insert({
      job_id,
      version: 1,
      storage_path: filePath,
      content_sha256: crypto.randomUUID() // could hash bytes here
    });

    return new Response(JSON.stringify({ ok: true, filePath }), {
      headers: { ...cors(origin), "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
});
