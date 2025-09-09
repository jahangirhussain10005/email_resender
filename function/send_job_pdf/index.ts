import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("URL_SUPABASE");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

const HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
};

Deno.serve(async (req) => {
  try {
    const { job_ref } = await req.json();
    if (!job_ref) {
      return new Response(JSON.stringify({
        ok: false,
        error: "job_ref required"
      }), { status: 400 });
    }

    // 1. Get job info
    const jobRes = await fetch(
      `${SUPABASE_URL}/rest/v1/jobs?job_ref=eq.${job_ref}`,
      { headers: { ...HEADERS, "Content-Type": "application/json" } }
    );
    const jobs = await jobRes.json();
    if (!jobs.length) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Job not found"
      }), { status: 404 });
    }
    const job = jobs[0];

    // 2. Get PDF artifact
    const pdfRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pdf_artifacts?job_id=eq.${job.id}`,
      { headers: HEADERS }
    );
    const artifacts = await pdfRes.json();
    if (!artifacts.length) {
      return new Response(JSON.stringify({
        ok: false,
        error: "No PDF artifact found"
      }), { status: 404 });
    }
    const artifact = artifacts[0];

    // 3. Get signed URL for attachment
    const signedUrlRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/job-pdfs/${artifact.storage_path}?download=${artifact.file_name}`,
      { method: "POST", headers: HEADERS }
    );
    const signedUrlData = await signedUrlRes.json();
    const signedUrl = signedUrlData.signedUrl; // ✅ correct property

    let attachments: any[] = [];

    if (signedUrl) {
      // Preferred: use signed URL path
      attachments = [
        {
          filename: artifact.file_name,
          path: signedUrl
        }
      ];
    } else {
      // Fallback: fetch file and embed as base64
      const fileRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/job-pdfs/${artifact.storage_path}`,
        { headers: HEADERS }
      );
      const buffer = new Uint8Array(await fileRes.arrayBuffer());
      const base64Content = btoa(String.fromCharCode(...buffer));

      attachments = [
        {
          filename: artifact.file_name,
          content: base64Content
        }
      ];
    }

    // 4. Send email with Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "noreply@yourdomain.com",
        to: job.customer_email,
        subject: `Your Job Quote - ${job_ref}`,
        html: `<p>Hi ${job.customer_name},</p>
               <p>Please find attached your job quote <b>${job_ref}</b>.</p>`,
        attachments
      })
    });
    const emailData = await emailRes.json();

    // 5. Log email
    await fetch(`${SUPABASE_URL}/rest/v1/email_logs`, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: job.id,
        recipient: job.customer_email,
        status: emailRes.ok ? "sent" : "failed",
        resend_id: emailData?.id || null
      })
    });

    return new Response(JSON.stringify({
      ok: true,
      resend: emailData
    }), { status: 200 });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({
      ok: false,
      error: err.message
    }), { status: 500 });
  }
});
