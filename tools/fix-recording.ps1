param(
  [Parameter(Mandatory=$true)] [string]$InputFile,
  [string]$OutputFile = ""
)

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Error "ffmpeg was not found. Install ffmpeg first, then run this script again."
  exit 1
}

if (-not (Test-Path $InputFile)) {
  Write-Error "Input file not found: $InputFile"
  exit 1
}

if ([string]::IsNullOrWhiteSpace($OutputFile)) {
  $dir = Split-Path $InputFile -Parent
  $name = [System.IO.Path]::GetFileNameWithoutExtension($InputFile)
  $OutputFile = Join-Path $dir "$name-clean.wav"
}

$filter = "highpass=f=90,lowpass=f=12000,afftdn=nf=-38,acompressor=threshold=-30dB:ratio=3:attack=5:release=120:makeup=8,dynaudnorm=f=150:g=12:p=0.95,loudnorm=I=-16:TP=-1.5:LRA=11"

ffmpeg -y -i $InputFile -af $filter -ac 1 -ar 48000 $OutputFile

Write-Host "Cleaned recording saved to: $OutputFile"
