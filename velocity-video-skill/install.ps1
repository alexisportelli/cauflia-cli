# Velocity Video Skill - Installer pour Opencode
# Ce script installe le skill de montage vidéo IA

param(
    [string]$InstallDir = "$env:USERPROFILE\.agents\skills\velocity-video",
    [switch]$SystemWide
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🎬 Velocity Video Skill Installer       ║" -ForegroundColor Cyan
Write-Host "║  Montage vidéo IA pour Opencode           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Installer les dépendances Python
Write-Host "📦 Installation des dépendances Python..." -ForegroundColor Yellow
$ReqFile = Join-Path $ScriptDir "requirements.txt"
if (Test-Path $ReqFile) {
    python -m pip install -r $ReqFile 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Dépendances installées" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Erreur pip, tentative avec --user..." -ForegroundColor Yellow
        python -m pip install --user -r $ReqFile 2>&1 | Out-Null
    }
}

# 2. Copier les fichiers du skill
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Copy-Item -Path "$ScriptDir\SKILL.md" -Destination $InstallDir -Force
Copy-Item -Path "$ScriptDir\velocity_video.py" -Destination $InstallDir -Force
Write-Host "  ✓ Fichiers copiés dans $InstallDir" -ForegroundColor Green

# 3. Ajouter un alias pour lancer le skill directement
$ProfilePath = $PROFILE
if ($ProfilePath) {
    $AliasLine = "`n# Velocity Video - Montage vidéo IA`nfunction velocity-video { python `"$InstallDir\velocity_video.py`" @args }`n"
    
    $ProfileDir = Split-Path -Parent $ProfilePath
    if (-not (Test-Path $ProfileDir)) {
        New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
    }
    
    $CurrentContent = ""
    if (Test-Path $ProfilePath) {
        $CurrentContent = Get-Content $ProfilePath -Raw
    }
    
    if ($CurrentContent -notmatch "velocity-video") {
        Add-Content -Path $ProfilePath -Value $AliasLine
        Write-Host "  ✓ Alias 'velocity-video' ajouté à PowerShell" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Alias déjà configuré" -ForegroundColor Green
    }
}

# 4. Vérifier FFmpeg
try {
    $ffmpeg = Get-Command ffmpeg -ErrorAction Stop
    Write-Host "  ✓ FFmpeg trouvé : $($ffmpeg.Source)" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ FFmpeg non trouvé dans le PATH" -ForegroundColor Yellow
    Write-Host "    Télécharge-le depuis : https://ffmpeg.org/download.html" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "✅ Installation terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "Utilisation :" -ForegroundColor Cyan
Write-Host "  1. Ouvre Opencode" -ForegroundColor White
Write-Host "  2. Tape 'velocity' ou 'monter une video'" -ForegroundColor White
Write-Host "  3. Ou lance directement : python velocity_video.py" -ForegroundColor White
Write-Host ""
Write-Host "Le Skill est prêt à être utilisé avec Opencode !" -ForegroundColor Cyan
