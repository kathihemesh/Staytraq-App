    # SSH configuration
$vpsIp = "144.91.79.198"
$username = "root"
$remotePath = "/opt/staytraq/chatbot"

Write-Host "Syncing chatbot code from local to VPS ($vpsIp)..." -ForegroundColor Cyan

# 1. Copy backend app files recursively
scp -o StrictHostKeyChecking=no -r "chatbot/backend/app" "${username}@${vpsIp}:${remotePath}/backend/"

# 2. Copy requirements.txt
scp -o StrictHostKeyChecking=no "chatbot/backend/requirements.txt" "${username}@${vpsIp}:${remotePath}/backend/"

# 3. Optional package update
$ans = Read-Host "Do you want to reinstall/upgrade requirements on the VPS? (y/N)"
if ($ans -eq "y" -or $ans -eq "yes") {
    Write-Host "Installing requirements on VPS..." -ForegroundColor Yellow
    ssh -o StrictHostKeyChecking=no "${username}@${vpsIp}" "${remotePath}/backend/venv/bin/pip install -r ${remotePath}/backend/requirements.txt"
}

# 4. Restart backend systemd service
Write-Host "Restarting staytraq-chatbot service on VPS..." -ForegroundColor Cyan
ssh -o StrictHostKeyChecking=no "${username}@${vpsIp}" "systemctl restart staytraq-chatbot"

Write-Host "Sync and restart complete!" -ForegroundColor Green
