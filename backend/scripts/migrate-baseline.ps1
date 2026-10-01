# VardiyaOS — Migration Baseline Script
# Run this once on existing databases that were created with `prisma db push`
# to mark the baseline migration as already applied.
#
# Usage:
#   .\scripts\migrate-baseline.ps1
#
# Prerequisites:
#   - DATABASE_URL must be set in backend/.env or environment
#   - Node.js dependencies must be installed (npm ci)

$ErrorActionPreference = "Stop"

Write-Host "VardiyaOS — Migration Baseline Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Generate Prisma Client
Write-Host "[1/3] Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
Write-Host "  Done." -ForegroundColor Green

# Step 2: Mark baseline as applied (idempotent — safe to re-run)
Write-Host "[2/3] Marking baseline migration as applied..." -ForegroundColor Yellow
$baselineMigration = "20260519000000_v1_initial_baseline"
npx prisma migrate resolve --applied $baselineMigration 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Note: Migration may already be marked as applied. Continuing..." -ForegroundColor Yellow
}
Write-Host "  Done." -ForegroundColor Green

# Step 3: Verify migration state
Write-Host "[3/3] Verifying migration status..." -ForegroundColor Yellow
npx prisma migrate status
Write-Host ""
Write-Host "Baseline setup complete!" -ForegroundColor Green
Write-Host "From now on, use: npx prisma migrate deploy" -ForegroundColor Green
