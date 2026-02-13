# Quick GitHub Setup
# Run this after creating a new repository on GitHub

# Replace YOUR_USERNAME with your GitHub username
$GITHUB_USERNAME = "YOUR_USERNAME"
$REPO_NAME = "g2-tool-scanner"

Write-Host "🤖 Setting up GitHub remote..." -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "server.js")) {
    Write-Host "❌ Error: Run this from the g2-tool-scanner directory" -ForegroundColor Red
    exit 1
}

# Add remote
git remote add origin "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"

# Rename branch to main
git branch -M main

# Push to GitHub
Write-Host "📤 Pushing to GitHub..." -ForegroundColor Cyan
git push -u origin main

Write-Host ""
Write-Host "✅ Success! Repository pushed to GitHub" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to https://railway.app" -ForegroundColor White
Write-Host "2. Click 'New Project' → 'Deploy from GitHub repo'" -ForegroundColor White
Write-Host "3. Select '$REPO_NAME' repository" -ForegroundColor White
Write-Host "4. Add environment variable: G2_API_TOKEN" -ForegroundColor White
Write-Host "5. Deploy!" -ForegroundColor White
