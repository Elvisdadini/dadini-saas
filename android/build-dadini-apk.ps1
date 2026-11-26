# ============================================================
# Compila y firma el APK Android de CochaMarket (WebView nativo).
#
# Requisitos:
#   - Android SDK (build-tools 35.x y platform android-35)
#   - JDK 17+ (se usa el JBR de Android Studio si existe)
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-apk.ps1
#
# Salida por defecto:
#   frontend-web/public/descargas/cochamarket.apk
# ============================================================
param(
  [string]$OutputPath = '',
  [string]$VersionName = '21.0.6',
  [int]$VersionCode = 7
)

$ErrorActionPreference = 'Stop'

$project = Resolve-Path (Join-Path $PSScriptRoot 'dadini-app')
$buildDir = Join-Path $project '.build'
$compiledDir = Join-Path $buildDir 'compiled'
$classesDir = Join-Path $buildDir 'classes'
$dexDir = Join-Path $buildDir 'dex'

if (-not $OutputPath) {
  $OutputPath = Join-Path $PSScriptRoot '..\backend\assets\apk\DADINI-SaaS-21.0.6.apk'
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

function Reset-Dir([string]$ruta) {
  if (Test-Path $ruta) { Remove-Item $ruta -Recurse -Force }
  New-Item -ItemType Directory -Path $ruta -Force | Out-Null
}

Reset-Dir $buildDir
Reset-Dir $compiledDir
Reset-Dir $classesDir
Reset-Dir $dexDir
New-Item -ItemType Directory -Path (Split-Path $OutputPath -Parent) -Force | Out-Null

# ---------- Localizar Android SDK ----------
$sdk = $env:ANDROID_HOME
if (-not $sdk -or -not (Test-Path $sdk)) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk -or -not (Test-Path $sdk)) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $sdk)) { throw "No se encontró el Android SDK. Define ANDROID_HOME." }

$buildToolsDir = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
  Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1
if (-not $buildToolsDir) { throw "No se encontraron build-tools en $sdk." }

$platformDir = Get-ChildItem (Join-Path $sdk 'platforms') -Directory |
  Where-Object { $_.Name -match '^android-(\d+)$' } |
  Sort-Object { [int]($_.Name -replace 'android-', '') } -Descending |
  Select-Object -First 1
if (-not $platformDir) { throw "No se encontró ninguna plataforma Android en $sdk." }

$androidJar = Join-Path $platformDir.FullName 'android.jar'
$aapt2 = Join-Path $buildToolsDir.FullName 'aapt2.exe'
$zipalign = Join-Path $buildToolsDir.FullName 'zipalign.exe'
$apksigner = Join-Path $buildToolsDir.FullName 'apksigner.bat'
$d8 = Join-Path $buildToolsDir.FullName 'd8.bat'

# ---------- Localizar JDK ----------
$jdkBin = $null
if ($env:JAVA_HOME) {
  $candidato = Join-Path $env:JAVA_HOME 'bin'
  if (Test-Path (Join-Path $candidato 'javac.exe')) { $jdkBin = $candidato }
}
if (-not $jdkBin) {
  $jbr = 'C:\Program Files\Android\Android Studio\jbr\bin'
  if (Test-Path (Join-Path $jbr 'javac.exe')) { $jdkBin = $jbr }
}
if (-not $jdkBin) {
  $javacCmd = Get-Command javac -ErrorAction SilentlyContinue
  if ($javacCmd) { $jdkBin = Split-Path $javacCmd.Source -Parent }
}
if (-not $jdkBin) { throw "No se encontró un JDK. Instala JDK 17 o Android Studio." }

$env:JAVA_HOME = Split-Path $jdkBin -Parent
$env:PATH = "$jdkBin;$env:PATH"

$javac = Join-Path $jdkBin 'javac.exe'
$jar = Join-Path $jdkBin 'jar.exe'
$keytool = Join-Path $jdkBin 'keytool.exe'

# La firma se guarda fuera de .build para que no se regenere en cada compilación.
# Perder este keystore impide instalar actualizaciones sobre la app ya instalada.
$signingDir = Join-Path $project 'signing'
New-Item -ItemType Directory -Path $signingDir -Force | Out-Null
$keystore = Join-Path $signingDir 'dadini-saas-release.keystore'

Write-Host "== DADINI SaaS APK ==" -ForegroundColor Cyan
Write-Host "SDK:        $sdk"
Write-Host "BuildTools: $($buildToolsDir.Name)"
Write-Host "Platform:   $($platformDir.Name)"
Write-Host "JDK:        $env:JAVA_HOME"

# ---------- Recursos ----------
Write-Host "`n[1/6] Compilando recursos..." -ForegroundColor Yellow
& $aapt2 compile --dir (Join-Path $project 'res') -o $compiledDir
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile falló ($LASTEXITCODE)." }

$unsignedApk = Join-Path $buildDir 'app-unsigned.apk'
$linkArgs = @(
  'link',
  '-o', $unsignedApk,
  '-I', $androidJar,
  '--manifest', (Join-Path $project 'AndroidManifest.xml'),
  '--min-sdk-version', '24',
  '--target-sdk-version', '34',
  '--version-code', "$VersionCode",
  '--version-name', $VersionName,
  '--auto-add-overlay'
)

$flatFiles = Get-ChildItem $compiledDir -Filter *.flat -Recurse
if ($flatFiles.Count -eq 0) { throw "No se generaron recursos compilados." }
foreach ($flat in $flatFiles) {
  $linkArgs += '-R'
  $linkArgs += $flat.FullName
}

Write-Host "[2/6] Enlazando APK base..." -ForegroundColor Yellow
& $aapt2 @linkArgs
if ($LASTEXITCODE -ne 0) { throw "aapt2 link falló ($LASTEXITCODE)." }

# ---------- Java ----------
Write-Host "[3/6] Compilando clases Java..." -ForegroundColor Yellow
$javaFiles = Get-ChildItem (Join-Path $project 'src') -Recurse -Filter *.java
$javacArgs = @(
  '-encoding', 'UTF-8',
  '-source', '8',
  '-target', '8',
  '-bootclasspath', $androidJar,
  '-d', $classesDir
) + ($javaFiles | ForEach-Object { $_.FullName })

& $javac @javacArgs
if ($LASTEXITCODE -ne 0) { throw "javac falló ($LASTEXITCODE)." }

$classFiles = Get-ChildItem $classesDir -Recurse -Filter *.class | ForEach-Object { $_.FullName }
$d8Args = @('--min-api', '24', '--lib', $androidJar, '--output', $dexDir) + $classFiles
& $d8 @d8Args
if ($LASTEXITCODE -ne 0) { throw "d8 falló ($LASTEXITCODE)." }

$withDexApk = Join-Path $buildDir 'app-with-dex.apk'
Copy-Item $unsignedApk $withDexApk -Force
& $jar uf $withDexApk -C $dexDir classes.dex
if ($LASTEXITCODE -ne 0) { throw "No se pudo insertar classes.dex ($LASTEXITCODE)." }

# ---------- Alinear y firmar ----------
Write-Host "[4/6] Alineando APK..." -ForegroundColor Yellow
$alignedApk = Join-Path $buildDir 'app-aligned.apk'
& $zipalign -f -p 4 $withDexApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw "zipalign falló ($LASTEXITCODE)." }

Write-Host "[5/6] Firmando APK..." -ForegroundColor Yellow
$pass = $env:DADINI_APK_PASSWORD
if (-not $pass) {
  throw "Define DADINI_APK_PASSWORD con la contraseña del keystore antes de firmar (ej. `$env:DADINI_APK_PASSWORD='...')."
}

if (-not (Test-Path $keystore)) {
  & $keytool -genkeypair -v `
    -keystore $keystore `
    -alias dadini `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $pass -keypass $pass `
    -dname "CN=DADINI, OU=Mobile, O=DADINI, L=Cochabamba, ST=Cochabamba, C=BO"
  if ($LASTEXITCODE -ne 0) { throw "keytool falló ($LASTEXITCODE)." }
}

& $apksigner sign `
  --ks $keystore `
  --ks-key-alias dadini `
  --ks-pass "pass:$pass" `
  --key-pass "pass:$pass" `
  --out $OutputPath `
  $alignedApk
if ($LASTEXITCODE -ne 0) { throw "apksigner falló ($LASTEXITCODE)." }

Write-Host "[6/6] Verificando firma..." -ForegroundColor Yellow
& $apksigner verify --print-certs $OutputPath
if ($LASTEXITCODE -ne 0) { throw "La verificación de firma falló ($LASTEXITCODE)." }

# apksigner genera además una firma v4 (.idsig) que no se publica.
Remove-Item "$OutputPath.idsig" -Force -ErrorAction SilentlyContinue

$hash = (Get-FileHash $OutputPath -Algorithm SHA256).Hash
$sizeMb = [math]::Round((Get-Item $OutputPath).Length / 1MB, 2)

Write-Host "`nAPK listo: $OutputPath" -ForegroundColor Green
Write-Host "Versión:   $VersionName ($VersionCode)"
Write-Host "Tamaño:    $sizeMb MB"
Write-Host "SHA-256:   $hash"
Write-Host "`nFirma guardada en: $keystore" -ForegroundColor DarkGray
Write-Host "Guarda ese keystore para poder publicar actualizaciones del APK." -ForegroundColor DarkGray





