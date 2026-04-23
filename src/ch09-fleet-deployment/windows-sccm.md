# Windows: SCCM / MECM

Microsoft Endpoint Configuration Manager (MECM, formerly SCCM) is the standard tool for deploying software to Windows fleets in enterprise environments. This section covers deploying Grafana Alloy as an SCCM application, including silent install, detection methods, config deployment, and phased rollout.

## Understanding the Installer

Grafana Alloy for Windows uses an **NSIS (Nullsoft Scriptable Install System)** installer, not an MSI. The file is named `alloy-installer-windows-amd64.exe`. Download it from the [GitHub releases page](https://github.com/grafana/alloy/releases).

This matters for SCCM because:

- You cannot use GPO Software Installation (which requires MSI) -- see the [GPO chapter](windows-gpo.md) for workarounds
- SCCM handles EXE installers fine via the Application model
- Detection methods need to check the registry or file system, not the MSI product code

### Silent Install Command

```cmd
alloy-installer-windows-amd64.exe /S
```

### Silent Install with All Options

```cmd
alloy-installer-windows-amd64.exe /S ^
  /CONFIG="C:\ProgramData\GrafanaLabs\Alloy\config.alloy" ^
  /STABILITY="generally-available" ^
  /USERNAME="NT AUTHORITY\LocalSystem" ^
  /RUNTIMEPRIORITY="normal" ^
  /DISABLEREPORTING="no" ^
  /DISABLEPROFILING="no" ^
  /ENVIRONMENT="GCLOUD_RW_API_KEY=glc_xxx\0GRAFANA_METRICS_URL=https://prometheus-prod.grafana.net/api/prom/push"
```

### Installer Flags Reference

| Flag | Values | Default | Description |
|---|---|---|---|
| `/S` | (none) | N/A | Silent install (required for automation) |
| `/CONFIG` | File path | `%PROGRAMFILES%\GrafanaLabs\Alloy\config.alloy` | Path to the config file |
| `/STABILITY` | `generally-available`, `public-preview`, `experimental` | `generally-available` | Component stability level |
| `/USERNAME` | Domain\User or built-in account | `NT AUTHORITY\LocalSystem` | Service account |
| `/PASSWORD` | String | (none) | Password for the service account (not needed for LocalSystem) |
| `/RUNTIMEPRIORITY` | `normal`, `below_normal`, `above_normal`, `high`, `idle`, `realtime` | `normal` | Process priority class |
| `/DISABLEREPORTING` | `yes`, `no` | `no` | Disable usage reporting |
| `/DISABLEPROFILING` | `yes`, `no` | `no` | Disable the pprof endpoint |
| `/ENVIRONMENT` | `KEY=VALUE\0KEY2=VALUE2` | (none) | Environment variables for the service |
| `/FORCEREGISTRY` | `yes` | (not set) | Delete all Alloy registry keys before install |

### Silent Uninstall

```cmd
"%PROGRAMFILES%\GrafanaLabs\Alloy\uninstall.exe" /S
```

### Installation Paths

| Item | Path |
|---|---|
| Binary | `%PROGRAMFILES%\GrafanaLabs\Alloy\alloy-windows-amd64.exe` |
| Default config | `%PROGRAMFILES%\GrafanaLabs\Alloy\config.alloy` |
| Data storage | `%PROGRAMDATA%\GrafanaLabs\Alloy\data` |
| Uninstaller | `%PROGRAMFILES%\GrafanaLabs\Alloy\uninstall.exe` |
| Registry key | `HKLM\SOFTWARE\GrafanaLabs\Alloy` |

### Registry Values

The service reads its configuration from `HKLM\SOFTWARE\GrafanaLabs\Alloy`:

| Value Name | Type | Content |
|---|---|---|
| `Arguments` | REG_MULTI_SZ | Command-line arguments (one per line) |
| `Environment` | REG_MULTI_SZ | Environment variables as `KEY=VALUE` (one per line) |

## SCCM Application vs. Package

Use an **Application**, not a Package. Applications provide:

- Detection methods (verify installation state)
- Supersedence (automated upgrades)
- Requirements (OS version, disk space, etc.)
- Return code handling
- User-targeted or device-targeted deployment
- Phased deployment support

Packages are the legacy model. They deploy blindly with no state awareness.

## Creating the SCCM Application

### Step 1: Prepare the Content Source

Create a folder on your SCCM content share:

```
\\sccm-share\Sources\Applications\GrafanaAlloy\1.8.1\
├── alloy-installer-windows-amd64.exe
├── config.alloy          # Your organization's config file
└── Install-Alloy.ps1     # Wrapper script (below)
```

### Step 2: The Installation Wrapper Script

A wrapper script handles config deployment alongside the installer:

```powershell
# Install-Alloy.ps1
# SCCM Application installation script for Grafana Alloy
param(
    [string]$Version = "1.8.1",
    [string]$InstallerPath = "$PSScriptRoot\alloy-installer-windows-amd64.exe"
)

$ErrorActionPreference = "Stop"
$LogFile = "$env:TEMP\alloy-install.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -Append -FilePath $LogFile
    Write-Host $Message
}

Write-Log "Starting Alloy $Version installation"

# --- Install Alloy silently ---
$installArgs = @(
    "/S"
    "/STABILITY=`"generally-available`""
)

Write-Log "Running installer: $InstallerPath $($installArgs -join ' ')"
$process = Start-Process -FilePath $InstallerPath `
    -ArgumentList $installArgs `
    -Wait -PassThru -NoNewWindow

if ($process.ExitCode -ne 0) {
    Write-Log "ERROR: Installer exited with code $($process.ExitCode)"
    exit $process.ExitCode
}
Write-Log "Installer completed successfully"

# --- Deploy config file ---
$configSource = "$PSScriptRoot\config.alloy"
$configDest = "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy"

if (Test-Path $configSource) {
    Write-Log "Deploying config file to $configDest"
    Copy-Item -Path $configSource -Destination $configDest -Force
} else {
    Write-Log "WARNING: No config.alloy found in script directory"
}

# --- Add Alloy service user to required groups ---
$groups = @("Event Log Readers", "Performance Monitor Users", "Performance Log Users")
foreach ($group in $groups) {
    try {
        $groupObj = [ADSI]"WinNT://./$group,group"
        $members = @($groupObj.Invoke("Members")) | ForEach-Object {
            $_.GetType().InvokeMember("Name", 'GetProperty', $null, $_, $null)
        }
        # LocalSystem is implicitly a member; skip if using LocalSystem
        Write-Log "Verified group: $group"
    } catch {
        Write-Log "WARNING: Could not verify group $group - $_"
    }
}

# --- Restart the service to pick up new config ---
Write-Log "Restarting Alloy service"
Restart-Service -Name "Alloy" -Force
Start-Sleep -Seconds 5

# --- Verify ---
$service = Get-Service -Name "Alloy" -ErrorAction SilentlyContinue
if ($service.Status -eq "Running") {
    Write-Log "Alloy service is running"
} else {
    Write-Log "ERROR: Alloy service is not running"
    exit 1
}

Write-Log "Installation complete"
exit 0
```

### Step 3: The Uninstall Script

```powershell
# Uninstall-Alloy.ps1
$ErrorActionPreference = "Stop"

$uninstaller = "$env:ProgramFiles\GrafanaLabs\Alloy\uninstall.exe"
if (Test-Path $uninstaller) {
    $process = Start-Process -FilePath $uninstaller -ArgumentList "/S" `
        -Wait -PassThru -NoNewWindow
    exit $process.ExitCode
} else {
    Write-Host "Alloy uninstaller not found at $uninstaller"
    exit 0  # Already uninstalled
}
```

### Step 4: Create the Application in SCCM Console

1. **Software Library > Application Management > Applications > Create Application**
2. **Type**: Manually specify the application information
3. **General Info**:
   - Name: `Grafana Alloy`
   - Publisher: `Grafana Labs`
   - Software Version: `1.8.1`
4. **Deployment Type**: Script Installer
   - **Content location**: `\\sccm-share\Sources\Applications\GrafanaAlloy\1.8.1\`
   - **Install command**: `powershell.exe -ExecutionPolicy Bypass -File Install-Alloy.ps1`
   - **Uninstall command**: `powershell.exe -ExecutionPolicy Bypass -File Uninstall-Alloy.ps1`
   - **Install behavior**: Install for system
   - **Logon requirement**: Whether or not a user is logged on

## Detection Methods

SCCM needs a detection method to determine whether Alloy is already installed. Three options, in order of reliability:

### Option A: File System Detection (Simplest)

- **Type**: File
- **Path**: `%PROGRAMFILES%\GrafanaLabs\Alloy`
- **File**: `alloy-windows-amd64.exe`
- **Rule**: File exists

This confirms Alloy is installed but does not verify the version.

### Option B: Registry Detection (Version-Aware)

- **Type**: Registry
- **Hive**: `HKEY_LOCAL_MACHINE`
- **Key**: `SOFTWARE\GrafanaLabs\Alloy`
- **Rule**: Key exists

### Option C: PowerShell Script Detection (Most Thorough)

```powershell
# SCCM Detection Script for Grafana Alloy
# Returns output if installed (detected), no output if not installed

$ExpectedVersion = "1.8.1"

# Check if the binary exists
$binaryPath = "$env:ProgramFiles\GrafanaLabs\Alloy\alloy-windows-amd64.exe"
if (-not (Test-Path $binaryPath)) {
    exit
}

# Check if the service exists and is running
$service = Get-Service -Name "Alloy" -ErrorAction SilentlyContinue
if ($null -eq $service) {
    exit
}

# Check version by running the binary
try {
    $versionOutput = & $binaryPath --version 2>&1
    if ($versionOutput -match $ExpectedVersion) {
        Write-Host "Grafana Alloy $ExpectedVersion detected"
    }
} catch {
    # Binary exists but version check failed
    exit
}
```

> **Tip:** Use Option C for production. It verifies the binary exists, the service is registered, and the correct version is running. SCCM considers the application "detected" if the script produces any output.

## Config File as a Configuration Item

Separate config file management from installation. This way you can update configs without reinstalling the application.

### Create a Configuration Baseline

1. **Assets and Compliance > Compliance Settings > Configuration Items > Create**
2. **Name**: `Alloy Config File`
3. **Setting**:
   - **Type**: Script
   - **Discovery Script** (PowerShell):
   ```powershell
   if (Test-Path "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy") {
       Get-Content "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy" -Raw
   }
   ```
   - **Remediation Script** (PowerShell):
   ```powershell
   # Place your expected config content here or pull from a share
   $configSource = "\\sccm-share\Sources\Configs\Alloy\config.alloy"
   $configDest = "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy"
   Copy-Item -Path $configSource -Destination $configDest -Force
   Restart-Service -Name "Alloy" -Force
   ```

## Phased Deployment

SCCM supports phased deployments natively. Use this for large fleet rollouts.

### Collection Structure

Create collections for each deployment phase:

| Collection | Query Rule | Purpose |
|---|---|---|
| `Alloy - Phase 0 Lab` | Direct membership (hand-picked machines) | Lab testing |
| `Alloy - Phase 1 Dev` | OU-based or direct membership | Dev/test |
| `Alloy - Phase 2 Staging` | OU-based | Staging |
| `Alloy - Phase 3 Canary` | Random subset (~5% of production) | Production canary |
| `Alloy - Phase 4 Production` | All Windows Servers minus earlier phases | Full production |

### Creating a Phased Deployment

1. **Right-click the Application > Create Phased Deployment**
2. Add each collection as a phase
3. Configure success criteria:
   - **Phase 1 success**: 95% compliance within 48 hours
   - **Phase 2 success**: 95% compliance within 48 hours
4. Configure automatic advancement or manual approval between phases

## Supersedence for Upgrades

When a new Alloy version is released:

1. Create a new deployment type for the new version (or a new application)
2. On the old application, add a **Supersedence** relationship pointing to the new application
3. Set to **Uninstall** the old version (the new installer handles this, but explicit is safer)
4. Deploy the new application through the same phased deployment pattern

## Environment Variables via SCCM

If you manage credentials via machine-scope environment variables rather than the `/ENVIRONMENT` installer flag:

```powershell
# Deploy-AlloyCredentials.ps1
# Run as a separate SCCM Package/Task Sequence step

[System.Environment]::SetEnvironmentVariable(
    "GCLOUD_RW_API_KEY", "glc_xxxxxxxxxxxxx", "Machine")
[System.Environment]::SetEnvironmentVariable(
    "GRAFANA_METRICS_URL",
    "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push",
    "Machine")
[System.Environment]::SetEnvironmentVariable(
    "GRAFANA_METRICS_USERNAME", "000000", "Machine")

# Restart Alloy to pick up new environment
Restart-Service -Name "Alloy" -Force -ErrorAction SilentlyContinue
```

Alternatively, write directly to the registry (see [Windows Environment Setup](../ch03-credentials-and-secrets/windows-env-setup.md)):

```powershell
$regPath = "HKLM:\SOFTWARE\GrafanaLabs\Alloy"
$envVars = @(
    "GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx"
    "GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
    "GRAFANA_METRICS_USERNAME=000000"
)
Set-ItemProperty -Path $regPath -Name "Environment" -Value $envVars -Type MultiString
Restart-Service -Name "Alloy" -Force
```

## Common Mistakes

| Mistake | What Happens | Fix |
|---|---|---|
| Deploying as a Package instead of Application | No detection, no compliance, no supersedence | Always use the Application model |
| No detection method | SCCM reinstalls on every evaluation cycle | Add a detection script (Option C above) |
| Running installer in user context | Installation fails (requires admin) | Set "Install for system" in deployment type |
| Bundling config updates with the installer | Config change requires full reinstall cycle | Use a separate Configuration Item for config |
| Hardcoding credentials in the install script | Credentials visible in SCCM content share | Use machine env vars or registry, deployed separately |
| No phased deployment | Problems hit the entire fleet at once | Use SCCM phased deployments or collection targeting |
| Forgetting to restart after credential changes | Service runs with old credentials | Include `Restart-Service` in credential deployment scripts |

## Summary

Deploy Alloy through SCCM as an Application, not a Package. Use the `/S` flag for silent installation, a PowerShell wrapper script for config deployment, and a PowerShell detection script for compliance checking. Separate config management into a Configuration Item so you can update configs without reinstalling. Use SCCM phased deployments and collection targeting to roll out gradually, and use supersedence relationships for version upgrades.
