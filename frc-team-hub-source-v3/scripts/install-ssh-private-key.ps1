param(
  [string]$PrivateKeyPath = (Join-Path $PSScriptRoot "id_ed25519"),
  [string]$KeyName = "id_ed25519",
  [string]$TestHost = "root@82.158.229.157",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

if (-not (Test-Path -LiteralPath $PrivateKeyPath -PathType Leaf)) {
  Fail "Private key not found: $PrivateKeyPath`nPlace id_ed25519 next to this script or pass -PrivateKeyPath."
}

$ssh = Get-Command "ssh.exe" -ErrorAction SilentlyContinue
$sshKeygen = Get-Command "ssh-keygen.exe" -ErrorAction SilentlyContinue
if (-not $ssh -or -not $sshKeygen) {
  Fail "Windows OpenSSH Client is not installed. Enable Settings > Optional features > OpenSSH Client."
}

$firstLine = [System.IO.File]::ReadLines($PrivateKeyPath) | Select-Object -First 1
if ($firstLine -notmatch "^-----BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY-----$") {
  Fail "The source file does not look like a supported SSH private key."
}

# ssh-keygen validates the key without displaying its private contents.
& $sshKeygen.Source -y -f $PrivateKeyPath *> $null
if ($LASTEXITCODE -ne 0) {
  Fail "ssh-keygen could not read the private key. Check that the file is valid and the passphrase is correct."
}

$sshDirectory = Join-Path $HOME ".ssh"
$destination = Join-Path $sshDirectory $KeyName
$currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value

if (-not (Test-Path -LiteralPath $sshDirectory)) {
  New-Item -ItemType Directory -Path $sshDirectory | Out-Null
}

if ((Test-Path -LiteralPath $destination) -and -not $Force) {
  Fail "A key already exists at $destination. Use -Force only if you intend to replace it."
}

if (Test-Path -LiteralPath $destination) {
  $backup = "$destination.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $destination -Destination $backup
  Write-Host "Existing key backed up to: $backup"
}

Copy-Item -LiteralPath $PrivateKeyPath -Destination $destination -Force

# Remove inherited access and grant only the current Windows user read access.
& icacls.exe $sshDirectory /inheritance:r /grant:r "*$currentUserSid`:(OI)(CI)F" *> $null
if ($LASTEXITCODE -ne 0) { Fail "Failed to secure $sshDirectory permissions." }

& icacls.exe $destination /inheritance:r /grant:r "*$currentUserSid`:R" *> $null
if ($LASTEXITCODE -ne 0) { Fail "Failed to secure private key permissions." }

$publicKeySource = "$PrivateKeyPath.pub"
$publicKeyDestination = "$destination.pub"
if (Test-Path -LiteralPath $publicKeySource -PathType Leaf) {
  Copy-Item -LiteralPath $publicKeySource -Destination $publicKeyDestination -Force
} else {
  & $sshKeygen.Source -y -f $destination | Set-Content -LiteralPath $publicKeyDestination -Encoding ascii
}
& icacls.exe $publicKeyDestination /inheritance:r /grant:r "*$currentUserSid`:R" *> $null

Write-Host "SSH private key installed: $destination"

if ($TestHost) {
  Write-Host "Testing SSH access to $TestHost ..."
  & $ssh.Source -i $destination -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10 $TestHost "echo SSH_KEY_OK"
  if ($LASTEXITCODE -ne 0) {
    Fail "The key was installed, but SSH authentication failed for $TestHost. Confirm that its public key is in the server account's authorized_keys file."
  }
  Write-Host "SSH authentication succeeded."
}
