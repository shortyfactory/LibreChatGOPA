param(
    [string]$RestoreFile,
    [string]$BackupDir = (Join-Path $PSScriptRoot 'librechat-backups'),
    [string]$ContainerName = "chat-mongodb",
    [string]$DatabaseName = "LibreChat",
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$containerIsRunning = docker inspect -f "{{.State.Running}}" $ContainerName 2>$null
if ($LASTEXITCODE -ne 0 -or $containerIsRunning.Trim() -ne 'true') {
    throw "Container '$ContainerName' is not running."
}

if ([string]::IsNullOrWhiteSpace($RestoreFile)) {
    $latestBackup = Get-ChildItem -Path $BackupDir -Filter 'librechat-backup-*.archive' -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($null -eq $latestBackup) {
        throw "No backup file found in '$BackupDir'."
    }

    $RestoreFile = $latestBackup.FullName
}

$resolvedRestoreFile = Resolve-Path $RestoreFile -ErrorAction Stop
$restoreFilePath = $resolvedRestoreFile.Path
$containerRestorePath = "/tmp/$([System.IO.Path]::GetFileName($restoreFilePath))"

if (-not $Force) {
    Write-Host "Backup selected: $restoreFilePath"
    Write-Host "This will replace database '$DatabaseName' in container '$ContainerName'."
    $confirmation = Read-Host "Type RESTORE to continue"
    if ($confirmation -ne 'RESTORE') {
        Write-Host 'Restore cancelled.'
        exit 0
    }
}

docker cp $restoreFilePath "${ContainerName}:${containerRestorePath}"
if ($LASTEXITCODE -ne 0) {
    throw 'docker cp failed.'
}

docker exec $ContainerName mongorestore --archive=$containerRestorePath --db $DatabaseName --drop
if ($LASTEXITCODE -ne 0) {
    throw 'mongorestore failed.'
}

docker exec $ContainerName rm -f $containerRestorePath | Out-Null

Write-Host "Restore completed from: $restoreFilePath"
