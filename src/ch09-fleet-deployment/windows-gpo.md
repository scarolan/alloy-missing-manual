# Windows: Group Policy (GPO)

Group Policy is ubiquitous in Active Directory environments. It cannot deploy EXE installers natively (GPO Software Installation requires MSI), but it excels at deploying configuration files, environment variables, and startup scripts. This section covers using GPO for Alloy deployment and ongoing configuration management.

## What GPO Can and Cannot Do

| Task | GPO Capable? | Method |
|---|---|---|
| Deploy MSI packages | Yes | Software Installation policy |
| Deploy EXE installers | No (directly) | Startup script workaround |
| Set machine environment variables | Yes | Preferences > Environment |
| Deploy config files | Yes | Preferences > Files or startup script |
| Set registry values | Yes | Preferences > Registry |
| Restart a service | Partially | Startup/logon scripts only (not on-demand) |

Since the Alloy installer is an NSIS EXE (not MSI), you need the startup script approach for initial installation. For ongoing config and credential management, GPO Preferences work well.

## Strategy: Startup Script for Installation

### Step 1: Stage the Installer on a Network Share

Create a share accessible by all target computer accounts:

```
\\dc01\NETLOGON\Alloy\
├── alloy-installer-windows-amd64.exe
├── config.alloy
└── Install-Alloy.ps1
```

The `NETLOGON` share is accessible by all domain-joined computers by default. Alternatively, use a dedicated software distribution share with appropriate read permissions for `Domain Computers`.

### Step 2: The Installation Script

```powershell
# Install-Alloy.ps1
# Deployed via GPO Computer Startup Script
# This script runs as SYSTEM at computer startup, before user logon.

$ErrorActionPreference = "SilentlyContinue"
$LogFile = "C:\Windows\Temp\alloy-gpo-install.log"
$ExpectedVersion = "1.8.1"
$SourcePath = "\\dc01\NETLOGON\Alloy"
$InstallerExe = "alloy-installer-windows-amd64.exe"

function Write-Log {
    param([string]$Message)
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message" | Out-File -Append $LogFile
}

# --- Check if already installed at the correct version ---
$binaryPath = "$env:ProgramFiles\GrafanaLabs\Alloy\alloy-windows-amd64.exe"
if (Test-Path $binaryPath) {
    $versionOutput = & $binaryPath --version 2>&1 | Out-String
    if ($versionOutput -match $ExpectedVersion) {
        Write-Log "Alloy $ExpectedVersion already installed. Skipping."
        exit 0
    }
    Write-Log "Alloy installed but wrong version. Upgrading."
}

# --- Verify network share is accessible ---
if (-not (Test-Path "$SourcePath\$InstallerExe")) {
    Write-Log "ERROR: Cannot access $SourcePath\$InstallerExe"
    exit 1
}

# --- Copy installer locally (avoids network timeout during install) ---
$localInstaller = "$env:TEMP\$InstallerExe"
Copy-Item "$SourcePath\$InstallerExe" $localInstaller -Force

# --- Run silent install ---
Write-Log "Installing Alloy $ExpectedVersion"
$proc = Start-Process -FilePath $localInstaller -ArgumentList "/S" `
    -Wait -PassThru -NoNewWindow
Write-Log "Installer exit code: $($proc.ExitCode)"

# --- Deploy config file ---
$configDest = "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy"
if (Test-Path "$SourcePath\config.alloy") {
    Copy-Item "$SourcePath\config.alloy" $configDest -Force
    Write-Log "Config file deployed"
}

# --- Restart service ---
Restart-Service -Name "Alloy" -Force
Write-Log "Service restarted"

# --- Cleanup ---
Remove-Item $localInstaller -Force -ErrorAction SilentlyContinue
Write-Log "Installation complete"
```

### Step 3: Create the GPO

1. Open **Group Policy Management Console** (gpmc.msc)
2. Create a new GPO: `Deploy Grafana Alloy`
3. Navigate to: **Computer Configuration > Policies > Windows Settings > Scripts (Startup/Shutdown)**
4. Click **Startup > PowerShell Scripts**
5. Add the script:
   - **Script Name**: `\\dc01\NETLOGON\Alloy\Install-Alloy.ps1`
   - **Parameters**: (leave empty)
6. On the **PowerShell Scripts** tab, ensure "Run Windows PowerShell scripts first" is selected

### Step 4: Link the GPO

Link the GPO to the appropriate Organizational Unit (OU). The script runs at every computer startup. The version check at the top makes it idempotent -- it exits immediately if the correct version is already installed.

## Environment Variables via GPO Preferences

This is the cleanest way to distribute credentials across a Windows fleet. GPO Preferences write Machine-scope environment variables that the Alloy service reads on startup.

### Configuration Path

**Computer Configuration > Preferences > Windows Settings > Environment**

### Create Environment Variable Items

Right-click in the Environment panel > **New > Environment Variable**. Create one item for each variable:

| Action | Name | Value | Variable Type |
|---|---|---|---|
| Create | `GCLOUD_RW_API_KEY` | `glc_xxxxxxxxxxxxx` | Machine |
| Create | `GRAFANA_METRICS_URL` | `https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push` | Machine |
| Create | `GRAFANA_METRICS_USERNAME` | `000000` | Machine |
| Create | `GRAFANA_LOGS_URL` | `https://logs-prod-006.grafana.net/loki/api/v1/push` | Machine |
| Create | `GRAFANA_LOGS_USERNAME` | `000000` | Machine |

Set the **Action** to **Replace** (not Create) to ensure changes propagate on credential rotation. Replace creates the variable if it does not exist and updates it if it does.

> **Security note:** GPO Preferences environment variables are stored in the SYSVOL share in XML files (`Registry.xml`). They are readable by all authenticated users. For sensitive credentials, consider writing to the Alloy-specific registry key instead (covered below). Machine-scope env vars in the registry (`HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`) are only writable by administrators but readable by any local process.

### Alternative: Registry Preferences for the Alloy Service

Instead of machine environment variables, write directly to the Alloy service's registry key:

**Computer Configuration > Preferences > Windows Settings > Registry**

| Action | Hive | Path | Name | Type | Data |
|---|---|---|---|---|---|
| Replace | HKLM | SOFTWARE\GrafanaLabs\Alloy | Environment | REG_MULTI_SZ | (see below) |

For REG_MULTI_SZ values in GPO Preferences, each line is a separate string. Set the value data to:

```
GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx
GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push
GRAFANA_METRICS_USERNAME=000000
```

This writes credentials only to the Alloy-specific registry key, not to the system-wide environment.

## Config File Deployment via GPO

### Option A: GPO File Preferences

**Computer Configuration > Preferences > Windows Settings > Files**

| Setting | Value |
|---|---|
| Action | Replace |
| Source | `\\dc01\NETLOGON\Alloy\config.alloy` |
| Destination | `%PROGRAMFILES%\GrafanaLabs\Alloy\config.alloy` |

This copies the config file from the network share on every Group Policy refresh (default: every 90 minutes + random offset of 0-30 minutes).

**Limitation:** File copy does not restart the Alloy service. The new config takes effect at the next service restart (reboot or manual restart). To trigger a reload, pair with a scheduled task or startup script.

### Option B: Startup Script with Config Deployment

Add config deployment to your startup script (as shown in the installation script above). This ensures the config is deployed and the service is restarted at every boot.

### Option C: Scheduled Task via GPO

Create a scheduled task that periodically checks for config updates:

**Computer Configuration > Preferences > Control Panel Settings > Scheduled Tasks**

```powershell
# Config-Sync-Alloy.ps1
# Runs on a schedule via GPO Scheduled Task

$sourcePath = "\\dc01\NETLOGON\Alloy\config.alloy"
$destPath = "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy"

if (-not (Test-Path $sourcePath)) { exit 0 }

$sourceHash = (Get-FileHash $sourcePath -Algorithm SHA256).Hash
$destHash = if (Test-Path $destPath) {
    (Get-FileHash $destPath -Algorithm SHA256).Hash
} else { "" }

if ($sourceHash -ne $destHash) {
    Copy-Item $sourcePath $destPath -Force
    # Reload config via API (non-disruptive)
    try {
        Invoke-RestMethod -Method POST -Uri "http://localhost:12345/-/reload"
    } catch {
        # If reload fails, restart the service
        Restart-Service -Name "Alloy" -Force
    }
}
```

## WMI Filters for Targeting

Use WMI filters to target specific machine types:

### Servers Only

```wql
SELECT * FROM Win32_OperatingSystem WHERE ProductType = 3
```

(ProductType: 1 = Workstation, 2 = Domain Controller, 3 = Server)

### Specific OS Version (Server 2019+)

```wql
SELECT * FROM Win32_OperatingSystem WHERE Version LIKE "10.%" AND ProductType > 1
```

### Machines with Sufficient Disk Space (> 1 GB free on C:)

```wql
SELECT * FROM Win32_LogicalDisk WHERE DeviceID = "C:" AND FreeSpace > 1073741824
```

### Creating a WMI Filter

1. In GPMC, right-click **WMI Filters > New**
2. Name: `Windows Servers Only`
3. Add the query above
4. Link the WMI filter to your GPO

## GPO Processing Order

Group Policy processes in this order: **Local > Site > Domain > OU** (LSDOU). Within an OU, GPOs process in reverse link order (bottom-up in the GPMC list).

### Considerations for Alloy Deployment

1. **Computer vs. User Configuration**: All Alloy settings go under **Computer Configuration** because the Alloy service runs as SYSTEM, not as a logged-in user.

2. **Policy vs. Preferences**: Use **Preferences** (not Policies) for environment variables and files. Preferences are non-tattooing -- they do not revert when the GPO is unlinked. Policies are tattooing -- they actively enforce and revert.

3. **Startup script timing**: Startup scripts run before the user logon screen appears. Network-dependent scripts (copying from a share) require the network to be available. Enable **Computer Configuration > Administrative Templates > System > Group Policy > Configure startup script delay** if startup scripts run before network initialization.

4. **Refresh behavior**: GPO Preferences refresh in the background every ~90 minutes. Changes to environment variables take effect at the next GPO refresh, but the Alloy service only reads environment variables at startup. You need a service restart to apply credential changes.

## Putting It Together: A Complete GPO Structure

For a clean deployment, use multiple GPOs:

| GPO Name | What It Does | Linked To |
|---|---|---|
| `Alloy - Install` | Startup script installs/upgrades the Alloy binary | Server OU |
| `Alloy - Credentials` | Preferences deploy environment variables or registry values | Server OU |
| `Alloy - Config` | Preferences deploy the config file; optional scheduled task for reload | Server OU |

Separating these into three GPOs lets you update credentials independently from the binary, and update the config independently from both.

### Forcing a GPO Update

After creating or modifying a GPO, force an immediate update on target machines:

```powershell
# On a single machine
gpupdate /force /target:computer

# Remotely via PowerShell (requires WinRM)
Invoke-GPUpdate -Computer "server01" -Force -Target "Computer"

# Across an OU (requires RSAT and appropriate permissions)
Get-ADComputer -SearchBase "OU=Servers,DC=example,DC=com" -Filter * |
  ForEach-Object { Invoke-GPUpdate -Computer $_.Name -Force -Target "Computer" }
```

## Common Mistakes

| Mistake | What Happens | Fix |
|---|---|---|
| Using User Configuration for service settings | Variables not available to SYSTEM service | Always use Computer Configuration |
| GPO Software Installation with EXE installer | Policy expects MSI, deployment fails | Use a startup script for the EXE installer |
| Not forcing gpupdate after changes | Changes take up to 90 minutes to propagate | Run `gpupdate /force` or wait |
| Startup script before network ready | Script cannot reach the share, install fails | Enable startup script delay or add retry logic |
| Environment variables set but service not restarted | Alloy runs with old credentials until reboot | Add a scheduled task to restart after credential changes |
| Using "Create" action instead of "Replace" | Variable not updated on credential rotation | Use "Replace" action for environment variables |
| Credentials in SYSVOL readable by all users | API keys exposed to any authenticated domain user | Use registry preferences for the Alloy-specific key instead |

## Summary

GPO is a solid option for Windows domains, especially for credential distribution and config file management. The main limitation is that the Alloy installer is an EXE, not an MSI, so initial installation requires a startup script workaround. For ongoing management, GPO Preferences handle environment variables, registry values, and file deployment effectively. Separate your GPOs by function (install, credentials, config) so you can update each independently, and use WMI filters to target specific machine types.
