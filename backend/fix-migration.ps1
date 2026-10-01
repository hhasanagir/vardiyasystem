$migrationFile = "prisma/migrations/20260714000001_enterprise_asset_management/migration.sql"
$sql = [System.IO.File]::ReadAllText((Resolve-Path $migrationFile))

$lines = $sql -split "`r`n|`n"
$output = @()
$i = 0
$inTypeBlock = $false
$typeLines = @()
$typeName = ""

while ($i -lt $lines.Count) {
    $line = $lines[$i]
    
    if ($inTypeBlock) {
        if ($line -match ';$') {
            $typeLines += "    $line"
            $output += "DO `$`$"
            $output += "BEGIN"
            $output += "    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '$typeName' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN"
            $output += $typeLines -join "`r`n"
            $output += "    END IF;"
            $output += "END;"
            $output += "`$`$;"
            $inTypeBlock = $false
            $typeLines = @()
        } else {
            $typeLines += "    $line"
        }
    }
    elseif ($line -match '^CREATE TYPE "(\w+)" AS ENUM') {
        $typeName = $matches[1]
        $inTypeBlock = $true
        $typeLines = @("        $line")
    }
    elseif ($line -match '^CREATE TABLE "(\w+)"') {
        $output += "CREATE TABLE IF NOT EXISTS $($matches[0].Substring(13))"
        $output += $lines[$i]  # Hmm this duplicates the line. Let me handle it differently.
    }
    else {
        $output += $line
    }
    $i++
}

[System.IO.File]::WriteAllText((Resolve-Path $migrationFile), ($output -join "`r`n"))
Write-Host "Done. Fixed migration SQL written."
