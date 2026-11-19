<#
.SYNOPSIS
  Sends test USDC to a testnet wallet so it can buy tickets in the CREDENCE demo.

.DESCRIPTION
  Mints the demo USDC asset (issued by credence-usdc-issuer) to any testnet
  address. The wallet must already have a USDC trustline; the web app's
  "Add USDC trustline" button creates one.

.EXAMPLE
  # From the contracts folder:
  powershell -ExecutionPolicy Bypass -File scripts\mint-test-usdc.ps1 -To GABC... -Amount 100
#>
param(
    [Parameter(Mandatory = $true)][string]$To,
    [decimal]$Amount = 100,
    [string]$Network = "testnet"
)

$ErrorActionPreference = "Stop"

if ($To -notmatch '^G[A-Z2-7]{55}$') { throw "'$To' is not a Stellar account address (G...)." }
if ($Amount -le 0 -or $Amount -gt 10000) { throw "Amount must be between 0 and 10000 USDC." }

$ContractsDir = Split-Path -Parent $PSScriptRoot
$deployment = Get-Content (Join-Path $ContractsDir "deployments\$Network.json") -Raw | ConvertFrom-Json
$units = [string][int64]($Amount * 10000000)

& stellar contract invoke --id $deployment.usdc_contract_id --source-account credence-usdc-issuer --network $Network -- mint --to $To --amount $units
if ($LASTEXITCODE -ne 0) { throw "Mint failed. Make sure the wallet is funded and has a USDC trustline." }

Write-Host "Minted $Amount test USDC to $To"
