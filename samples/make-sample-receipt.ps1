<#
.SYNOPSIS
  Draws a fictional ticket receipt (PNG) for demos and OCR testing.

.DESCRIPTION
  Uses Windows' built-in System.Drawing. The event, vendor, and order number
  are made up. Matches the MVP example: a P2,500 VIP ticket.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File samples\make-sample-receipt.ps1
#>
param([string]$Out = (Join-Path $PSScriptRoot "sample-receipt.png"))

Add-Type -AssemblyName System.Drawing

$lines = @(
    @{ Text = "SAMPLE TICKETS PH"; Size = 30; Bold = $true },
    @{ Text = "Official Order Confirmation"; Size = 20; Bold = $false },
    @{ Text = ""; Size = 14; Bold = $false },
    @{ Text = "Order No: SMT-2026-0042817"; Size = 22; Bold = $false },
    @{ Text = "Order Date: November 2, 2026"; Size = 22; Bold = $false },
    @{ Text = ""; Size = 14; Bold = $false },
    @{ Text = "Event: Sample Concert Manila 2026"; Size = 22; Bold = $true },
    @{ Text = "Event Date: December 12, 2026"; Size = 22; Bold = $false },
    @{ Text = "Venue: Philippine Arena"; Size = 22; Bold = $false },
    @{ Text = "Ticket Category: VIP"; Size = 22; Bold = $false },
    @{ Text = "Seat: Section 112, Row C, Seat 8"; Size = 22; Bold = $false },
    @{ Text = ""; Size = 14; Bold = $false },
    @{ Text = "Ticket Price: PHP 2,500.00"; Size = 22; Bold = $false },
    @{ Text = "Convenience Fee: PHP 150.00"; Size = 22; Bold = $false },
    @{ Text = "Total Paid: PHP 2,650.00"; Size = 22; Bold = $true },
    @{ Text = ""; Size = 14; Bold = $false },
    @{ Text = "Payment: GCash   Status: PAID"; Size = 20; Bold = $false },
    @{ Text = "This is a fictional receipt for the GOIN demo."; Size = 16; Bold = $false }
)

$width = 1000
$height = 980
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::White)
$brush = [System.Drawing.Brushes]::Black

$y = 50
foreach ($line in $lines) {
    $style = if ($line.Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = New-Object System.Drawing.Font "Arial", $line.Size, $style, ([System.Drawing.GraphicsUnit]::Pixel)
    if ($line.Text) { $g.DrawString($line.Text, $font, $brush, 60, $y) }
    $y += [int]($line.Size * 1.9)
    $font.Dispose()
}

$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Gray), 2
$g.DrawRectangle($pen, 20, 20, $width - 40, $height - 40)

$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$pen.Dispose()
$g.Dispose()
$bitmap.Dispose()
Write-Host "Saved $Out"
