param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$BackupFile,

    [Parameter(Position=1)]
    [string]$OutputDir = "",

    [switch]$Force
)

$ErrorActionPreference = "Stop"
$logFile = "$BackupFile.restore.log"

function Write-Log { param([string]$Msg) $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; "$timestamp $Msg" | Tee-Object -FilePath $logFile -Append }

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $projectRoot ".env"
if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() -ErrorAction SilentlyContinue } } }

$dbHost = if ($env:PGHOST) { $env:PGHOST } else { "localhost" }
$dbPort = if ($env:PGPORT) { $env:PGPORT } else { "5432" }
$dbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "vardiya" }
$dbPass = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "" }
$dbName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "vardiyasystem" }

if (-not (Test-Path $BackupFile)) { Write-Log "Backup file not found: $BackupFile"; exit 1 }

$env:PGPASSWORD = $dbPass
Write-Log "Starting restore: $dbName@$dbHost`:$dbPort from $BackupFile"

if (-not $Force) {
    Write-Host "WARNING: This will OVERWRITE the database '$dbName' on $dbHost`:$dbPort"
    Write-Host "Press Ctrl+C to abort, or wait 5 seconds..."
    Start-Sleep -Seconds 5
}

Write-Log "Dropping existing connections to $dbName..."
& psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '$dbName' AND pid <> pg_backend_pid();" 2>> $logFile
if (-not $?) { Write-Log "Warning: connection termination had issues (non-fatal)" }

Write-Log "Dropping and recreating database..."
& psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "DROP DATABASE IF EXISTS `"$dbName`";" 2>> $logFile
& psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "CREATE DATABASE `"$dbName`";" 2>> $logFile

Write-Log "Restoring from backup..."
if ($BackupFile -match '\.gz$') {
    $stream = [System.IO.Compression.GZipStream]::new([System.IO.File]::OpenRead($BackupFile), [System.IO.Compression.CompressionMode]::Decompress)
    $tempFile = [System.IO.Path]::GetTempFileName()
    $fs = [System.IO.File]::Create($tempFile)
    $stream.CopyTo($fs); $fs.Close(); $stream.Close()
    & pg_restore --host=$dbHost --port=$dbPort --username=$dbUser --dbname=$dbName --no-owner --no-acl --verbose $tempFile 2>> $logFile
    Remove-Item $tempFile -ErrorAction SilentlyContinue
} else {
    & pg_restore --host=$dbHost --port=$dbPort --username=$dbUser --dbname=$dbName --no-owner --no-acl --verbose $BackupFile 2>> $logFile
}

if ($LASTEXITCODE -eq 0) {
    Write-Log "Restore COMPLETED"
    try {
        $row = & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" 2>> $logFile
        Write-Log "Verification: $($row.Trim()) tables restored"
    } catch { Write-Log "Verification query failed (non-fatal)" }
} else {
    Write-Log "Restore FAILED - check $logFile"
    Remove-Item "env:PGPASSWORD" -ErrorAction SilentlyContinue
    exit 1
}

Remove-Item "env:PGPASSWORD" -ErrorAction SilentlyContinue
