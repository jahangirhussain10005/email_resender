// supabase/functions/scheduler_followups/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("URL_SUPABASE")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

Deno.serve(async (_req) => {
  try {
    // 1️⃣ Fetch due tasks
    const nowISO = new Date().toISOString();
    const dueRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tasks_queue?next_attempt=lte.${nowISO}&status=eq.pending`,
      { headers: HEADERS }
    );
    const tasks = (await dueRes.json()) || [];

    if (!tasks.length) {
      return new Response(
        JSON.stringify({ ok: true, message: "No due tasks" }),
        { status: 200 }
      );
    }

    // 2️⃣ Process each task
    for (const task of tasks) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send_job_pdf`, {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ job_ref: task.job_ref }),
        });

        if (resp.ok) {
          // ✅ Success → mark done
          await fetch(`${SUPABASE_URL}/rest/v1/tasks_queue?id=eq.${task.id}`, {
            method: "PATCH",
            headers: HEADERS,
            body: JSON.stringify({ status: "done" }),
          });
        } else {
          // ⚠️ Failure → increment attempt_count and schedule retry
          const errorText = await resp.text();
          const updates: any = {
            attempt_count: (task.attempt_count || 0) + 1,
            last_error: errorText,
          };

          if (updates.attempt_count >= (task.max_attempts || 3)) {
            updates.status = "failed";
          } else {
            updates.status = "retrying";
            updates.next_attempt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // +10 min
          }

          await fetch(`${SUPABASE_URL}/rest/v1/tasks_queue?id=eq.${task.id}`, {
            method: "PATCH",
            headers: HEADERS,
            body: JSON.stringify(updates),
          });
        }
      } catch (taskErr) {
        console.error("Task processing error:", taskErr);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: tasks.length }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Scheduler error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500 }
    );
  }
});
