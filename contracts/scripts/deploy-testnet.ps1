<#
.SYNOPSIS
  Deploys CREDENCE to Stellar testnet and runs the MVP flow end to end.

.DESCRIPTION
  1. Creates and funds testnet identities: admin, seller, buyer, and a test
     USDC issuer. Existing identities are reused.
  2. Issues a test USDC asset, adds USDC trustlines for the seller and buyer,
     wraps the asset in a Stellar Asset Contract, and mints 100 USDC to the buyer.
  3. Builds and deploys the CREDENCE contract.
  4. Runs two demo transactions:
       A. Transfer succeeds  -> seller receives 44.64 USDC.
       B. Transfer fails     -> buyer is refunded 44.64 USDC.
     The demo needs the admin's signature, so it only runs when the admin is
     the local credence-admin identity. With -Admin set to another wallet
     (e.g. a Freighter account), the script deploys and skips the demo.
  5. Writes contract IDs and public addresses to deployments/<network>.json.
     The previous deployment file and log are kept as *.previous.*.

  Secret keys stay in the Stellar CLI config. This script never prints them.

.EXAMPLE
  # From the contracts folder:
  powershell -ExecutionPolicy Bypass -File scripts\deploy-testnet.ps1

.EXAMPLE
  # Use your own wallet as the administrator:
  powershell -ExecutionPolicy Bypass -File scripts\deploy-testnet.ps1 -Admin GABC...
#>
param(
    [string]$Network = "testnet",
    # Administrator address. Defaults to the local credence-admin identity.
    [string]$Admin = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$ContractsDir = Split-Path -Parent $PSScriptRoot
Set-Location $ContractsDir

$DeployDir = Join-Path $ContractsDir "deployments"
New-Item -ItemType Directory -Force -Path $DeployDir | Out-Null
$LogFile = Join-Path $DeployDir "$Network-run.log"
$DeploymentFile = Join-Path $DeployDir "$Network.json"

# Keep the previous deployment record instead of silently overwriting it.
if (Test-Path $DeploymentFile) { Copy-Item $DeploymentFile (Join-Path $DeployDir "$Network.previous.json") -Force }
if (Test-Path $LogFile) { Copy-Item $LogFile (Join-Path $DeployDir "$Network-run.previous.log") -Force }
Set-Content -Path $LogFile -Value "CREDENCE $Network run $(Get-Date -Format s)" -Encoding UTF8

# 44.64 USDC (7 decimals). Matches the P2,500 example in the idea document.
$TicketPrice = "446400000"
# 100 USDC minted to the buyer for the demo.
$BuyerMint = "1000000000"

function Write-Log([string]$Message) {
    Write-Host $Message
    Add-Content -Path $LogFile -Value $Message -Encoding UTF8
}

# Runs the Stellar CLI, logs everything, throws on failure, and returns the
# last line of stdout (where the CLI prints the result).
function Invoke-Stellar([string[]]$CliArgs) {
    Add-Content -Path $LogFile -Value ("> stellar " + ($CliArgs -join " ")) -Encoding UTF8
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & stellar @CliArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous

    $stdout = @()
    foreach ($line in $output) {
        Add-Content -Path $LogFile -Value ("    " + $line.ToString()) -Encoding UTF8
        if (-not ($line -is [System.Management.Automation.ErrorRecord])) {
            $text = ([string]$line).Trim()
            if ($text -ne "") { $stdout += $text }
        }
    }
    if ($code -ne 0) {
        throw "stellar $($CliArgs[0]) $($CliArgs[1]) failed (exit $code). See $LogFile"
    }
    if ($stdout.Count -eq 0) { return "" }
    return $stdout[-1]
}

function Get-Identity([string]$Name) {
    try {
        return Invoke-Stellar @("keys", "address", $Name)
    } catch {
        Write-Log "  Creating and funding $Name"
        Invoke-Stellar @("keys", "generate", $Name, "--network", $Network, "--fund") | Out-Null
        return Invoke-Stellar @("keys", "address", $Name)
    }
}

function Invoke-Credence([string]$Source, [string[]]$FnArgs) {
    $cli = @("contract", "invoke", "--id", $script:CredenceId, "--source-account", $Source, "--network", $Network, "--") + $FnArgs
    return Invoke-Stellar $cli
}

function Get-UsdcBalance([string]$Address) {
    $raw = Invoke-Stellar @("contract", "invoke", "--id", $script:UsdcId, "--source-account", "credence-admin", "--network", $Network, "--", "balance", "--id", $Address)
    return [decimal]($raw.Trim('"'))
}

function Get-ListingStatus([string]$ListingId) {
    $json = Invoke-Credence "credence-admin" @("get_listing", "--listing_id", $ListingId)
    return ($json | ConvertFrom-Json).status
}

# SHA-256 of the off-chain ticket record. This is what the backend will send
# as ticket_ref; the record itself never goes on-chain.
function New-TicketRef([string]$Record) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Record))
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Assert-Equal($Expected, $Actual, [string]$What) {
    if ("$Expected" -ne "$Actual") { throw "CHECK FAILED: $What. Expected $Expected, got $Actual" }
    Write-Log "  OK  $What = $Actual"
}

function Format-Usdc([decimal]$Units) { return ($Units / 10000000).ToString("0.00") + " USDC" }

# Runs one listing from creation to the admin's transfer confirmation.
function Invoke-ResaleFlow([string]$Label, [bool]$TransferSucceeds) {
    Write-Log ""
    Write-Log "=== Flow ${Label}: transfer $(if ($TransferSucceeds) { 'succeeds' } else { 'fails' }) ==="

    $record = "Sample Concert|2026-12-12|Philippine Arena|VIP|order-$([guid]::NewGuid())"
    $ticketRef = New-TicketRef $record

    $sellerBefore = Get-UsdcBalance $Seller
    $buyerBefore = Get-UsdcBalance $Buyer

    $id = Invoke-Credence "credence-seller" @("create_listing", "--seller", $Seller, "--ticket_ref", $ticketRef, "--original_price", $TicketPrice, "--resale_price", $TicketPrice)
    Write-Log "  1. Seller created listing $id"
    Assert-Equal "PendingReview" (Get-ListingStatus $id) "status after create_listing"

    Invoke-Credence "credence-admin" @("review_listing", "--listing_id", $id, "--approved", "true") | Out-Null
    Write-Log "  2. Admin approved listing $id"
    Assert-Equal "Approved" (Get-ListingStatus $id) "status after review_listing"

    Invoke-Credence "credence-buyer" @("purchase", "--buyer", $Buyer, "--listing_id", $id) | Out-Null
    Write-Log "  3. Buyer paid $(Format-Usdc $TicketPrice) into escrow"
    Assert-Equal "PaymentCommitted" (Get-ListingStatus $id) "status after purchase"
    Assert-Equal ($buyerBefore - [decimal]$TicketPrice) (Get-UsdcBalance $Buyer) "buyer balance after purchase"

    Invoke-Credence "credence-seller" @("start_transfer", "--listing_id", $id) | Out-Null
    Write-Log "  4. Seller started the ticket transfer"
    Assert-Equal "TransferInitiated" (Get-ListingStatus $id) "status after start_transfer"

    $successArg = if ($TransferSucceeds) { "true" } else { "false" }
    Invoke-Credence "credence-admin" @("confirm_transfer", "--listing_id", $id, "--success", $successArg) | Out-Null
    Write-Log "  5. Admin confirmed transfer success = $successArg"

    if ($TransferSucceeds) {
        Assert-Equal "Settled" (Get-ListingStatus $id) "final status"
        Assert-Equal ($sellerBefore + [decimal]$TicketPrice) (Get-UsdcBalance $Seller) "seller balance after payout"
        Assert-Equal ($buyerBefore - [decimal]$TicketPrice) (Get-UsdcBalance $Buyer) "buyer balance after payout"
    } else {
        Assert-Equal "Refunded" (Get-ListingStatus $id) "final status"
        Assert-Equal $sellerBefore (Get-UsdcBalance $Seller) "seller balance after refund"
        Assert-Equal $buyerBefore (Get-UsdcBalance $Buyer) "buyer balance after refund"
    }
    return $id
}

try {
    Write-Log "=== 1. Identities ($Network) ==="
    # credence-admin always deploys and pays fees. It is also the contract
    # administrator unless -Admin names another wallet.
    $Deployer = Get-Identity "credence-admin"
    if (-not $Admin) {
        $Admin = $Deployer
    } elseif ($Admin -notmatch '^G[A-Z2-7]{55}$') {
        throw "-Admin '$Admin' is not a Stellar account address (G...)."
    }
    $RunDemo = ($Admin -eq $Deployer)
    $Seller = Get-Identity "credence-seller"
    $Buyer = Get-Identity "credence-buyer"
    $Issuer = Get-Identity "credence-usdc-issuer"
    Write-Log "  deployer $Deployer"
    Write-Log "  admin   $Admin"
    Write-Log "  seller  $Seller"
    Write-Log "  buyer   $Buyer"
    Write-Log "  issuer  $Issuer"

    Write-Log ""
    Write-Log "=== 2. Test USDC ==="
    $Asset = "USDC:$Issuer"
    foreach ($who in @("credence-seller", "credence-buyer")) {
        Invoke-Stellar @("tx", "new", "change-trust", "--source-account", $who, "--line", $Asset, "--network", $Network) | Out-Null
        Write-Log "  Trustline added for $who"
    }
    try {
        $script:UsdcId = Invoke-Stellar @("contract", "asset", "deploy", "--asset", $Asset, "--source-account", "credence-admin", "--network", $Network, "--alias", "credence-usdc")
        Write-Log "  Deployed USDC asset contract"
    } catch {
        Write-Log "  USDC asset contract already exists; looking up its ID"
        $script:UsdcId = Invoke-Stellar @("contract", "id", "asset", "--asset", $Asset, "--network", $Network)
    }
    Write-Log "  USDC contract $UsdcId"
    Invoke-Stellar @("contract", "invoke", "--id", $UsdcId, "--source-account", "credence-usdc-issuer", "--network", $Network, "--", "mint", "--to", $Buyer, "--amount", $BuyerMint) | Out-Null
    Write-Log "  Minted $(Format-Usdc $BuyerMint) to buyer"

    Write-Log ""
    Write-Log "=== 3. Build and deploy CREDENCE ==="
    if (-not $SkipBuild) { Invoke-Stellar @("contract", "build") | Out-Null }
    $Wasm = "target\wasm32v1-none\release\credence.wasm"
    $script:CredenceId = Invoke-Stellar @("contract", "deploy", "--wasm", $Wasm, "--source-account", "credence-admin", "--network", $Network, "--alias", "credence", "--", "--admin", $Admin, "--usdc_token", $UsdcId)
    Write-Log "  CREDENCE contract $CredenceId"
    $storedAdmin = (Invoke-Credence "credence-admin" @("admin")).Trim('"')
    $storedToken = (Invoke-Credence "credence-admin" @("usdc_token")).Trim('"')
    Assert-Equal $Admin $storedAdmin "contract admin"
    Assert-Equal $UsdcId $storedToken "contract USDC token"

    $SettledId = $null
    $RefundedId = $null
    if ($RunDemo) {
        $SettledId = [int](Invoke-ResaleFlow "A" $true)
        $RefundedId = [int](Invoke-ResaleFlow "B" $false)
    } else {
        Write-Log ""
        Write-Log "=== Demo flows skipped ==="
        Write-Log "  The administrator is an external wallet, so this script can't sign"
        Write-Log "  review_listing or confirm_transfer. Run the flow in the web app instead."
    }

    $deployment = [ordered]@{
        network              = $Network
        credence_contract_id = $CredenceId
        usdc_contract_id     = $UsdcId
        usdc_asset           = $Asset
        admin                = $Admin
        deployer             = $Deployer
        seller               = $Seller
        buyer                = $Buyer
        usdc_issuer          = $Issuer
        demo_settled_listing = $SettledId
        demo_refunded_listing = $RefundedId
        deployed_at          = (Get-Date -Format o)
    }
    $deployment | ConvertTo-Json | Set-Content -Path $DeploymentFile -Encoding UTF8

    Write-Log ""
    Write-Log "=== Done: all checks passed ==="
    Write-Log "  Contract on Stellar Expert: https://stellar.expert/explorer/$Network/contract/$CredenceId"
    Write-Log "  Saved IDs to deployments\$Network.json"
    exit 0
} catch {
    Write-Log ""
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
