param(
    [string]$BackupDir = (Join-Path $PSScriptRoot 'librechat-backups'),
    [int]$RetentionDays = 14,
    [string]$ContainerName = "chat-mongodb",
    [string]$DatabaseName = "LibreChat"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$backupName = 'librechat-backup-{0}.archive' -f (Get-Date -Format 'yyyy-MM-dd-HHmm')
$containerBackupPath = "/tmp/$backupName"

New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

$containerIsRunning = docker inspect -f "{{.State.Running}}" $ContainerName 2>$null
if ($LASTEXITCODE -ne 0 -or $containerIsRunning.Trim() -ne 'true') {
    throw "Container '$ContainerName' is not running."
}

docker exec $ContainerName mongodump --db $DatabaseName --archive=$containerBackupPath
if ($LASTEXITCODE -ne 0) {
    throw 'mongodump failed.'
}

docker cp "${ContainerName}:${containerBackupPath}" (Join-Path $BackupDir $backupName)
if ($LASTEXITCODE -ne 0) {
    throw 'docker cp failed.'
}

docker exec $ContainerName rm -f $containerBackupPath | Out-Null

$retentionCutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter 'librechat-backup-*.archive' -File |
    Where-Object { $_.LastWriteTime -lt $retentionCutoff } |
    Remove-Item -Force

Write-Host "Backup created: $(Join-Path $BackupDir $backupName)"
Write-Host "Old backups older than $RetentionDays days deleted."
