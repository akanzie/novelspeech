$ErrorActionPreference = "Stop"

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $base "..")
$target = Join-Path $root "libs\\tesseract"
$langDir = Join-Path $target "lang"

New-Item -ItemType Directory -Force -Path $target | Out-Null
New-Item -ItemType Directory -Force -Path $langDir | Out-Null

$files = @(
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.0/dist/tesseract.min.js"
    Path = (Join-Path $target "tesseract.min.js")
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.0/dist/worker.min.js"
    Path = (Join-Path $target "worker.min.js")
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.0/tesseract-core.wasm.js"
    Path = (Join-Path $target "tesseract-core.wasm.js")
  },
  @{
    Url = "https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.0/tesseract-core.wasm"
    Path = (Join-Path $target "tesseract-core.wasm")
  },
  @{
    Url = "https://tessdata.projectnaptha.com/4.0.0/vie.traineddata.gz"
    Path = (Join-Path $langDir "vie.traineddata.gz")
  }
)

foreach ($f in $files) {
  Write-Host "Downloading $($f.Url) -> $($f.Path)"
  Invoke-WebRequest -Uri $f.Url -OutFile $f.Path
}

Write-Host "Done. Files saved in $target and $langDir."
