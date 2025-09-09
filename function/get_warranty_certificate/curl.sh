

$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11ZHhmZ2hnYmFvb25jamZvaXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzM0Njc5MSwiZXhwIjoyMDcyOTIyNzkxfQ.uFXybRnD_p_nj9gGfqI9LYnaN3F0IVx4hYOw9Ykg0Io"
}

Invoke-RestMethod -Uri "https://mudxfghgbaooncjfoiru.supabase.co/functions/v1/get_warranty_certificate?warranty_number=WAR-00007" -Method Get -Headers $headers
