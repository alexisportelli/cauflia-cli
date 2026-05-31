# Démarre le serveur de rendu vidéo Velocity
param(
    [int]$Port = 8330,
    [string]$Host = "0.0.0.0"
)

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🎬 Velocity Video Engine Server          ║" -ForegroundColor Cyan
Write-Host "║  http://${Host}:${Port}                     ║" -ForegroundColor Cyan
Write-Host "║  API: /api/v1/*                          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Vérifier les dépendances
$hasFfmpeg = $null -ne (Get-Command ffmpeg -ErrorAction SilentlyContinue)
if (-not $hasFfmpeg) {
    Write-Host "⚠️  FFmpeg n'est pas dans le PATH" -ForegroundColor Yellow
    Write-Host "   Télécharge depuis : https://ffmpeg.org/download.html" -ForegroundColor DarkYellow
}

Write-Host "📦 Démarrage du serveur..." -ForegroundColor Yellow
Write-Host ""

# Lancer le serveur
python -m uvicorn server.main:app --host $Host --port $Port --reload
