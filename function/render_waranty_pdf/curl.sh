
#Render certificate (create)

curl -X POST "https://<project>.functions.supabase.co/render_warranty_pdf" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"warranty_number":"WAR-00007"}'

 #--------------------perfectlyworking the below curl tested on powersheel 

$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11ZHhmZ2hnYmFvb25jamZvaXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzM0Njc5MSwiZXhwIjoyMDcyOTIyNzkxfQ.uFXybRnD_p_nj9gGfqI9LYnaN3F0IVx4hYOw9Ykg0Io"
    "Content-Type"  = "application/json"
}

$body = @{
    warranty_number = "WAR-00007"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://mudxfghgbaooncjfoiru.supabase.co/functions/v1/render_warranty_pdf" -Method Post -Headers $headers -Body $body
