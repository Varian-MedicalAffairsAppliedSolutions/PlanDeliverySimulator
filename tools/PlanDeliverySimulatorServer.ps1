param(
  [int]$Port = 8087,
  [string]$Root = $PSScriptRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ContentType([string]$path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    '.html' { return 'text/html; charset=utf-8' }
    '.htm'  { return 'text/html; charset=utf-8' }
    '.js'   { return 'application/javascript; charset=utf-8' }
    '.css'  { return 'text/css; charset=utf-8' }
    '.json' { return 'application/json; charset=utf-8' }
    '.svg'  { return 'image/svg+xml' }
    '.png'  { return 'image/png' }
    '.jpg'  { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.gif'  { return 'image/gif' }
    '.ico'  { return 'image/x-icon' }
    '.txt'  { return 'text/plain; charset=utf-8' }
    '.dcm'  { return 'application/dicom' }
    default { return 'application/octet-stream' }
  }
}

$rootFull = [System.IO.Path]::GetFullPath($Root)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host "Failed to start server on port $Port. If needed, run as admin or choose another port." -ForegroundColor Red
  throw
}

Write-Host "PlanDeliverySimulator server running" -ForegroundColor Green
Write-Host "  Root: $rootFull" -ForegroundColor Gray
Write-Host "  URL:  http://localhost:$Port/" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $rawPath = $request.Url.AbsolutePath
      if ([string]::IsNullOrWhiteSpace($rawPath)) { $rawPath = '/' }

      if ($rawPath -eq '/__plandelivery_ping') {
        $payload = [System.Text.Encoding]::UTF8.GetBytes('ok')
        $response.StatusCode = 200
        $response.ContentType = 'text/plain; charset=utf-8'
        $response.ContentLength64 = $payload.Length
        $response.OutputStream.Write($payload, 0, $payload.Length)
        $response.OutputStream.Close()
        continue
      }

      $relative = [System.Uri]::UnescapeDataString($rawPath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($relative)) {
        if (Test-Path (Join-Path $rootFull 'RP_MultiPlan_Comparator.html')) {
          $relative = 'RP_MultiPlan_Comparator.html'
        } elseif (Test-Path (Join-Path $rootFull 'index.html')) {
          $relative = 'index.html'
        }
      }

      $candidate = Join-Path $rootFull $relative
      $fullPath = [System.IO.Path]::GetFullPath($candidate)

      if (-not $fullPath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 400
        $response.ContentType = 'text/plain; charset=utf-8'
        $payload = [System.Text.Encoding]::UTF8.GetBytes('Bad request')
        $response.ContentLength64 = $payload.Length
        $response.OutputStream.Write($payload, 0, $payload.Length)
        $response.OutputStream.Close()
        continue
      }

      if (-not (Test-Path $fullPath -PathType Leaf)) {
        $response.StatusCode = 404
        $response.ContentType = 'text/plain; charset=utf-8'
        $payload = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        $response.ContentLength64 = $payload.Length
        $response.OutputStream.Write($payload, 0, $payload.Length)
        $response.OutputStream.Close()
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
      $response.StatusCode = 200
      $response.ContentType = Get-ContentType $fullPath
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      $response.OutputStream.Close()
    } catch {
      try {
        $response.StatusCode = 500
        $response.ContentType = 'text/plain; charset=utf-8'
        $payload = [System.Text.Encoding]::UTF8.GetBytes("Server error: $($_.Exception.Message)")
        $response.ContentLength64 = $payload.Length
        $response.OutputStream.Write($payload, 0, $payload.Length)
        $response.OutputStream.Close()
      } catch { }
    }
  }
} finally {
  try { $listener.Stop() } catch { }
  try { $listener.Close() } catch { }
}
