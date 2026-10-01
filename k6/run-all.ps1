#!/usr/bin/env pwsh
param(
  [string]$BaseUrl = "http://localhost:3000/api/v1",
  [string]$AuthEmail = "admin@vardiya.com",
  [string]$AuthPassword = "password123",
  [string]$K6Binary = "k6",
  [switch]$SkipLoadTest,
  [switch]$SkipStressTest,
  [switch]$SkipSpikeTest,
  [switch]$SkipSoakTest,
  [switch]$InfluxDBOutput,
  [string]$InfluxDBUrl = "http://localhost:8086/k6"
)

$ErrorActionPreference = "Stop"
$ResultsDir = Join-Path $PSScriptRoot "results"
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null

$commonEnv = @{
  BASE_URL = $BaseUrl
  AUTH_EMAIL = $AuthEmail
  AUTH_PASSWORD = $AuthPassword
}

$outputFlag = if ($InfluxDBOutput) { "--out", "influxdb=$InfluxDBUrl" } else { @() }

function Run-Test {
  param([string]$Name, [string]$Script, [string]$Description)

  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host " Running: $Name" -ForegroundColor Cyan
  Write-Host " Script: $Script" -ForegroundColor Cyan
  Write-Host " Description: $Description" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan

  $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $jsonOut = Join-Path $ResultsDir "${Name}_${timestamp}.json"
  $summaryOut = Join-Path $ResultsDir "${Name}_${timestamp}_summary.txt"

  $envVars = $commonEnv.Keys | ForEach-Object { "-e", "$_=$($commonEnv[$_])" }

  $startTime = Get-Date

  & $K6Binary run $Script `
    --out "json=$jsonOut" `
    --summary-export $summaryOut `
    @outputFlag `
    @envVars `
    --tag "testrun=$timestamp" `
    --tag "testname=$Name"

  $exitCode = $LASTEXITCODE
  $endTime = Get-Date
  $duration = $endTime - $startTime

  Write-Host "----------------------------------------" -ForegroundColor Yellow
  Write-Host " Test: $Name" -ForegroundColor Yellow
  Write-Host " Exit Code: $exitCode" -ForegroundColor Yellow
  Write-Host " Duration: $($duration.TotalMinutes.ToString('F2')) min" -ForegroundColor Yellow
  Write-Host " Results: $jsonOut" -ForegroundColor Yellow
  Write-Host " Summary: $summaryOut" -ForegroundColor Yellow
  Write-Host "----------------------------------------" -ForegroundColor Yellow

  return @{
    Name = $Name
    ExitCode = $exitCode
    Duration = $duration
    JsonFile = $jsonOut
    SummaryFile = $summaryOut
    Timestamp = $timestamp
  }
}

$results = @()

if (-not $SkipLoadTest) {
  $results += Run-Test -Name "load_test" -Script (Join-Path $PSScriptRoot "scenarios\load-test.js") -Description "5-tier load test: 100/500/1000/2500/5000 concurrent users, all endpoints"
}

if (-not $SkipStressTest) {
  $results += Run-Test -Name "stress_test" -Script (Join-Path $PSScriptRoot "scenarios\stress-test.js") -Description "Ramp from 10 to 1500 req/s until breaking point"
}

if (-not $SkipSpikeTest) {
  $results += Run-Test -Name "spike_test" -Script (Join-Path $PSScriptRoot "scenarios\spike-test.js") -Description "Instant bursts: 1K/2.5K/5K VUs in 10-30s + recovery"
}

if (-not $SkipSoakTest) {
  $results += Run-Test -Name "soak_test" -Script (Join-Path $PSScriptRoot "scenarios\soak-test.js") -Description "Sustained load: 100 VUs/30min, 500 VUs/1h, 1000 VUs/2h"
}

Write-Host "========================================" -ForegroundColor Green
Write-Host " All tests completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`nResults Summary:" -ForegroundColor Cyan
$results | ForEach-Object {
  $status = if ($_.ExitCode -eq 0) { "PASS" } else { "FAIL" }
  Write-Host "  $($_.Name.PadRight(20)) $status (duration: $($_.Duration.TotalMinutes.ToString('F2'))m)" -ForegroundColor $(if ($_.ExitCode -eq 0) { "Green" } else { "Red" })
}

Write-Host "`nTo generate reports:" -ForegroundColor Yellow
Write-Host "  pwsh k6/generate-reports.ps1" -ForegroundColor Yellow
