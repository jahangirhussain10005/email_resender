$headers = @{
  "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11ZHhmZ2hnYmFvb25jamZvaXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzM0Njc5MSwiZXhwIjoyMDcyOTIyNzkxfQ.uFXybRnD_p_nj9gGfqI9LYnaN3F0IVx4hYOw9Ykg0Io"
  "Content-Type" = "application/json"
}

$body = @{
  job = @{
    job_ref = "AWA-10234"
    customer_name = "Jane Smith"
    customer_email = "jane@example.com"
    site_address = "12 Piper St, Kyneton VIC"
    subtotal = 5000
    gst = 500
    total = 5500
    lines = @(
      @{ item="HT102 Fixed Window"; qty=4; unit=750; amount=3000 },
      @{ item="Install"; qty=1; unit=2000; amount=2000 }
    )
  }
  idempotency_key = "job:AWA-10234:v1"
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "https://mudxfghgbaooncjfoiru.supabase.co/functions/v1/render_job_pdf" -Method Post -Headers $headers -Body $body