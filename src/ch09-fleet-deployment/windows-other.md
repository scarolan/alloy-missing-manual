# Windows: Other Automation

Not every Windows environment uses SCCM or Group Policy for software deployment. This section covers deploying Alloy with PowerShell DSC, Microsoft Intune, Ansible over WinRM, and a standalone bootstrap PowerShell script.

## PowerShell DSC

PowerShell Desired State Configuration (DSC) enforces a declarative desired state on Windows machines. There is no official Grafana DSC resource for Alloy, but the built-in DSC resources handle it well.

### DSC Configuration

```powershell
Configuration AlloyDeployment {
    param(
        [Parameter(Mandatory)]
        [string]$AlloyVersion,

        [Parameter(Mandatory)]
        [string]$InstallerSource,

        [Parameter(Mandatory)]
        [string]$ConfigSource,

        [Parameter(Mandatory)]
        [PSCredential]$GrafanaCredential
    )

    Import-DscResource -ModuleName PSDesiredStateConfiguration

    Node $AllNodes.NodeName {

        # --- Ensure the installer is cached locally ---
        File AlloyInstallerCache {
            Ensure          = "Present"
            SourcePath      = $InstallerSource
            DestinationPath = "C:\Temp\alloy-installer-windows-amd64.exe"
            Type            = "File"
            MatchSource     = $true
        }

        # --- Install Alloy via the cached installer ---
        Script AlloyInstall {
            GetScript = {
                $binaryPath = "$env:ProgramFiles\GrafanaLabs\Alloy\alloy-windows-amd64.exe"
                if (Test-Path $binaryPath) {
                    $version = & $binaryPath --version 2>&1 | Out-String
                    return @{ Result = $version }
                }
                return @{ Result = "Not installed" }
            }
            TestScript = {
                $binaryPath = "$env:ProgramFiles\GrafanaLabs\Alloy\alloy-windows-amd64.exe"
                if (-not (Test-Path $binaryPath)) { return $false }
                $version = & $binaryPath --version 2>&1 | Out-String
                return $version -match $using:AlloyVersion
            }
            SetScript = {
                $installer = "C:\Temp\alloy-installer-windows-amd64.exe"
                $proc = Start-Process -FilePath $installer `
                    -ArgumentList "/S" -Wait -PassThru -NoNewWindow
                if ($proc.ExitCode -ne 0) {
                    throw "Alloy installer failed with exit code $($proc.ExitCode)"
                }
            }
            DependsOn = "[File]AlloyInstallerCache"
        }

        # --- Deploy the configuration file ---
        File AlloyConfig {
            Ensure          = "Present"
            SourcePath      = $ConfigSource
            DestinationPath = "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy"
            Type            = "File"
            MatchSource     = $true
            DependsOn       = "[Script]AlloyInstall"
        }

        # --- Set environment variables for credentials ---
        Environment GrafanaApiKey {
            Ensure = "Present"
            Name   = "GCLOUD_RW_API_KEY"
            Value  = $GrafanaCredential.GetNetworkCredential().Password
            Target = @("Machine")
        }

        Environment GrafanaMetricsUrl {
            Ensure = "Present"
            Name   = "GRAFANA_METRICS_URL"
            Value  = $Node.MetricsUrl
            Target = @("Machine")
        }

        Environment GrafanaMetricsUsername {
            Ensure = "Present"
            Name   = "GRAFANA_METRICS_USERNAME"
            Value  = $Node.MetricsUsername
            Target = @("Machine")
        }

        # --- Ensure the Alloy service is running ---
        Service AlloyService {
            Name        = "Alloy"
            State       = "Running"
            StartupType = "Automatic"
            DependsOn   = @("[Script]AlloyInstall", "[File]AlloyConfig")
        }
    }
}
```

### Configuration Data

```powershell
$configData = @{
    AllNodes = @(
        @{
            NodeName        = "server01"
            MetricsUrl      = "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
            MetricsUsername  = "000000"
        },
        @{
            NodeName        = "server02"
            MetricsUrl      = "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
            MetricsUsername  = "000000"
        }
    )
}
```

### Apply the Configuration

```powershell
# Generate MOF files
$cred = Get-Credential -Message "Enter Grafana API Key as password"
AlloyDeployment -AlloyVersion "1.8.1" `
    -InstallerSource "\\share\Alloy\alloy-installer-windows-amd64.exe" `
    -ConfigSource "\\share\Alloy\config.alloy" `
    -GrafanaCredential $cred `
    -ConfigurationData $configData `
    -OutputPath ".\AlloyMOF"

# Push to target nodes
Start-DscConfiguration -Path ".\AlloyMOF" -Wait -Verbose -Force
```

### DSC Pull Server

For larger fleets, configure a DSC Pull Server so nodes pull their configuration automatically. The MOF files and required modules are hosted on the pull server, and nodes check in periodically to enforce desired state.

## Microsoft Intune / Endpoint Manager

Intune can deploy Alloy to Azure AD-joined or hybrid-joined Windows devices. Since the Alloy installer is an EXE (not MSI), you need to wrap it as a Win32 app.

### Step 1: Prepare the Win32 App Package

Use the [Microsoft Win32 Content Prep Tool](https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool) to create an `.intunewin` package.

Create a source directory:

```
AlloyIntunePackage\
├── alloy-installer-windows-amd64.exe
├── config.alloy
├── Install-Alloy.ps1     # Install wrapper
└── Uninstall-Alloy.ps1   # Uninstall wrapper
```

**Install-Alloy.ps1:**

```powershell
$ErrorActionPreference = "Stop"
$logFile = "$env:ProgramData\GrafanaLabs\alloy-intune-install.log"

function Write-Log { param($msg); "$(Get-Date -f s) $msg" | Out-File -Append $logFile }

# Silent install
$installer = "$PSScriptRoot\alloy-installer-windows-amd64.exe"
$proc = Start-Process $installer -ArgumentList "/S" -Wait -PassThru -NoNewWindow
Write-Log "Installer exit code: $($proc.ExitCode)"
if ($proc.ExitCode -ne 0) { exit $proc.ExitCode }

# Deploy config
$configDest = "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy"
Copy-Item "$PSScriptRoot\config.alloy" $configDest -Force
Write-Log "Config deployed"

# Restart to apply config
Restart-Service -Name "Alloy" -Force
Write-Log "Service restarted"
exit 0
```

**Uninstall-Alloy.ps1:**

```powershell
$uninstaller = "$env:ProgramFiles\GrafanaLabs\Alloy\uninstall.exe"
if (Test-Path $uninstaller) {
    Start-Process $uninstaller -ArgumentList "/S" -Wait -NoNewWindow
}
exit 0
```

Package with the content prep tool:

```cmd
IntuneWinAppUtil.exe -c AlloyIntunePackage -s Install-Alloy.ps1 -o OutputFolder
```

### Step 2: Create the App in Intune

1. **Microsoft Intune admin center > Apps > Windows > Add**
2. App type: **Windows app (Win32)**
3. Upload the `.intunewin` file
4. Configure:
   - **Install command**: `powershell.exe -ExecutionPolicy Bypass -File Install-Alloy.ps1`
   - **Uninstall command**: `powershell.exe -ExecutionPolicy Bypass -File Uninstall-Alloy.ps1`
   - **Install behavior**: System
   - **Device restart behavior**: No specific action

### Step 3: Detection Rules

- **Rule type**: Custom script
- Use the same detection script from the [SCCM chapter](windows-sccm.md):

```powershell
$binaryPath = "$env:ProgramFiles\GrafanaLabs\Alloy\alloy-windows-amd64.exe"
if (Test-Path $binaryPath) {
    $version = & $binaryPath --version 2>&1 | Out-String
    if ($version -match "1.8.1") {
        Write-Host "Alloy 1.8.1 detected"
    }
}
```

### Step 4: Deploy Credentials via Intune

Use a separate Intune **PowerShell script** deployment (Devices > Scripts) to set credentials:

```powershell
# Deploy-AlloyCredentials.ps1
# Deployed via Intune Script deployment

[System.Environment]::SetEnvironmentVariable(
    "GCLOUD_RW_API_KEY", "glc_xxxxxxxxxxxxx", "Machine")
[System.Environment]::SetEnvironmentVariable(
    "GRAFANA_METRICS_URL",
    "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push",
    "Machine")
[System.Environment]::SetEnvironmentVariable(
    "GRAFANA_METRICS_USERNAME", "000000", "Machine")

Restart-Service -Name "Alloy" -Force -ErrorAction SilentlyContinue
```

> **Tip:** For better credential management with Intune, consider integrating with Azure Key Vault and using a PowerShell script that retrieves secrets at runtime.

## Ansible over WinRM

Ansible can manage Windows hosts via WinRM. The `grafana.grafana.alloy` collection does not currently support Windows, so you need a custom playbook.

### WinRM Prerequisites

Enable WinRM on target hosts:

```powershell
# Run on each target (or via GPO startup script)
winrm quickconfig -q
Enable-PSRemoting -Force
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
```

Configure Ansible to use WinRM in your inventory:

```yaml
# inventory/hosts.yml
windows_servers:
  hosts:
    win-server01:
      ansible_host: 10.0.1.10
    win-server02:
      ansible_host: 10.0.1.11
  vars:
    ansible_user: admin@EXAMPLE.COM
    ansible_password: "{{ vault_windows_password }}"
    ansible_connection: winrm
    ansible_winrm_transport: kerberos  # or ntlm, credssp
    ansible_winrm_server_cert_validation: ignore
    ansible_port: 5986  # HTTPS
```

### Ansible Playbook for Windows

```yaml
---
- name: Deploy Grafana Alloy on Windows
  hosts: windows_servers
  gather_facts: true

  vars:
    alloy_version: "1.8.1"
    alloy_installer_url: "https://github.com/grafana/alloy/releases/download/v{{ alloy_version }}/alloy-installer-windows-amd64.exe.zip"
    alloy_install_dir: "C:\\Program Files\\GrafanaLabs\\Alloy"
    alloy_config_source: "files/config.alloy"

  tasks:
    - name: Check if Alloy is already installed
      ansible.windows.win_stat:
        path: "{{ alloy_install_dir }}\\alloy-windows-amd64.exe"
      register: alloy_binary

    - name: Check installed version
      ansible.windows.win_command: >
        "{{ alloy_install_dir }}\alloy-windows-amd64.exe" --version
      register: alloy_version_check
      when: alloy_binary.stat.exists
      changed_when: false
      failed_when: false

    - name: Download Alloy installer
      ansible.windows.win_get_url:
        url: "{{ alloy_installer_url }}"
        dest: "C:\\Temp\\alloy-installer.exe.zip"
      when: >
        not alloy_binary.stat.exists or
        alloy_version not in (alloy_version_check.stdout | default(''))

    - name: Extract installer
      community.windows.win_unzip:
        src: "C:\\Temp\\alloy-installer.exe.zip"
        dest: "C:\\Temp\\"
      when: >
        not alloy_binary.stat.exists or
        alloy_version not in (alloy_version_check.stdout | default(''))

    - name: Run silent install
      ansible.windows.win_command: >
        C:\Temp\alloy-installer-windows-amd64.exe /S
      when: >
        not alloy_binary.stat.exists or
        alloy_version not in (alloy_version_check.stdout | default(''))
      notify: restart alloy windows

    - name: Deploy credentials as environment variables
      ansible.windows.win_environment:
        name: "{{ item.name }}"
        value: "{{ item.value }}"
        level: machine
        state: present
      loop:
        - { name: "GCLOUD_RW_API_KEY", value: "{{ alloy_grafana_api_key }}" }
        - { name: "GRAFANA_METRICS_URL", value: "{{ alloy_grafana_metrics_url }}" }
        - { name: "GRAFANA_METRICS_USERNAME", value: "{{ alloy_grafana_metrics_username }}" }
      no_log: true
      notify: restart alloy windows

    - name: Deploy Alloy config file
      ansible.windows.win_copy:
        src: "{{ alloy_config_source }}"
        dest: "{{ alloy_install_dir }}\\config.alloy"
      notify: reload alloy windows

    - name: Ensure Alloy service is running
      ansible.windows.win_service:
        name: Alloy
        state: started
        start_mode: auto

  handlers:
    - name: reload alloy windows
      ansible.windows.win_uri:
        url: "http://localhost:12345/-/reload"
        method: POST
        status_code: 200

    - name: restart alloy windows
      ansible.windows.win_service:
        name: Alloy
        state: restarted
```

### WinRM vs. SSH

Ansible can also connect to Windows via OpenSSH (available on Windows Server 2019+). SSH is simpler to configure and does not require WinRM setup:

```yaml
# inventory snippet for SSH-based Windows management
windows_servers:
  vars:
    ansible_connection: ssh
    ansible_shell_type: powershell
```

## Bootstrap PowerShell Script

For environments without enterprise tooling, a self-contained PowerShell script handles the full deployment.

### Deploy-Alloy.ps1

```powershell
<#
.SYNOPSIS
    Bootstrap deployment script for Grafana Alloy on Windows.
.DESCRIPTION
    Downloads, installs, and configures Grafana Alloy.
    Run as Administrator.
.PARAMETER Version
    Alloy version to install (e.g., "1.8.1")
.PARAMETER MetricsUrl
    Grafana Cloud Prometheus remote write URL
.PARAMETER MetricsUsername
    Grafana Cloud Prometheus username (numeric)
.PARAMETER ApiKey
    Grafana Cloud API key
.EXAMPLE
    .\Deploy-Alloy.ps1 -Version "1.8.1" `
        -MetricsUrl "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push" `
        -MetricsUsername "000000" `
        -ApiKey "glc_xxxxxxxxxxxxx"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Version,

    [Parameter(Mandatory)]
    [string]$MetricsUrl,

    [Parameter(Mandatory)]
    [string]$MetricsUsername,

    [Parameter(Mandatory)]
    [string]$ApiKey
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speeds up Invoke-WebRequest

$installDir = "$env:ProgramFiles\GrafanaLabs\Alloy"
$binaryPath = "$installDir\alloy-windows-amd64.exe"
$downloadUrl = "https://github.com/grafana/alloy/releases/download/v${Version}/alloy-installer-windows-amd64.exe.zip"
$tempDir = "$env:TEMP\alloy-install"
$logFile = "$env:ProgramData\GrafanaLabs\alloy-bootstrap.log"

function Write-Log {
    param([string]$Message)
    $entry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message"
    Write-Host $entry
    $entry | Out-File -Append -FilePath $logFile
}

# --- Ensure running as admin ---
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "This script must run as Administrator"
}

# --- Check if already installed ---
if (Test-Path $binaryPath) {
    $currentVersion = & $binaryPath --version 2>&1 | Out-String
    if ($currentVersion -match $Version) {
        Write-Log "Alloy $Version is already installed. Skipping."
        exit 0
    }
    Write-Log "Alloy installed but version mismatch. Upgrading."
}

# --- Download ---
Write-Log "Downloading Alloy $Version"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$zipPath = "$tempDir\alloy-installer.exe.zip"
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

# --- Extract ---
Write-Log "Extracting installer"
Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

# --- Install ---
$installer = Get-ChildItem "$tempDir\alloy-installer-windows-amd64.exe" -ErrorAction Stop
Write-Log "Running silent install"
$proc = Start-Process -FilePath $installer.FullName -ArgumentList "/S" `
    -Wait -PassThru -NoNewWindow
if ($proc.ExitCode -ne 0) {
    throw "Installer failed with exit code $($proc.ExitCode)"
}
Write-Log "Installation complete"

# --- Set credentials ---
Write-Log "Setting environment variables"
[System.Environment]::SetEnvironmentVariable("GCLOUD_RW_API_KEY", $ApiKey, "Machine")
[System.Environment]::SetEnvironmentVariable("GRAFANA_METRICS_URL", $MetricsUrl, "Machine")
[System.Environment]::SetEnvironmentVariable("GRAFANA_METRICS_USERNAME", $MetricsUsername, "Machine")

# --- Deploy config ---
$configContent = @'
prometheus.exporter.windows "default" { }

prometheus.scrape "windows" {
  targets    = prometheus.exporter.windows.default.targets
  forward_to = [prometheus.remote_write.default.receiver]
  scrape_interval = "60s"
}

prometheus.remote_write "default" {
  endpoint {
    url = env("GRAFANA_METRICS_URL")
    basic_auth {
      username = env("GRAFANA_METRICS_USERNAME")
      password = env("GCLOUD_RW_API_KEY")
    }
  }
}
'@
$configPath = "$installDir\config.alloy"
Set-Content -Path $configPath -Value $configContent -Force
Write-Log "Config deployed to $configPath"

# --- Add service account to required groups ---
# (Only needed if not running as LocalSystem)

# --- Restart service ---
Write-Log "Restarting Alloy service"
Restart-Service -Name "Alloy" -Force
Start-Sleep -Seconds 5

# --- Verify ---
$service = Get-Service -Name "Alloy"
if ($service.Status -ne "Running") {
    throw "Alloy service is not running after install"
}

try {
    $ready = Invoke-RestMethod -Uri "http://localhost:12345/-/ready" -TimeoutSec 10
    Write-Log "Readiness check: $ready"
} catch {
    Write-Log "WARNING: Readiness check failed - $($_.Exception.Message)"
}

# --- Cleanup ---
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Log "Bootstrap complete"
```

### Running the Bootstrap Script

```powershell
# Interactive (prompts are visible)
.\Deploy-Alloy.ps1 -Version "1.8.1" `
    -MetricsUrl "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push" `
    -MetricsUsername "000000" `
    -ApiKey "glc_xxxxxxxxxxxxx"
```

For remote execution across multiple machines:

```powershell
# Run on multiple machines via PowerShell Remoting
$servers = @("server01", "server02", "server03")
$cred = Get-Credential

Invoke-Command -ComputerName $servers -Credential $cred -FilePath .\Deploy-Alloy.ps1 `
    -ArgumentList "1.8.1", `
        "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push", `
        "000000", `
        "glc_xxxxxxxxxxxxx"
```

### WinGet (For Individual Machines)

For single machines or developer workstations, WinGet is the fastest path:

```powershell
# Install
winget install GrafanaLabs.Alloy

# Uninstall
winget uninstall GrafanaLabs.Alloy
```

WinGet does not support config deployment or credential setup, so you still need to handle those separately. It is not a fleet deployment tool.

## Common Patterns Across Tools

| Pattern | Why |
|---|---|
| Always use the `/S` flag for silent install | Required for non-interactive deployment |
| Deploy credentials via Machine-scope env vars or registry | Alloy reads credentials from the process environment |
| Validate config before restarting the service | Catch errors before they take down the service |
| Test on a single machine before fleet rollout | Catch environment-specific issues early |
| Separate install, config, and credentials | Different change frequencies, different security requirements |
| Include version detection / idempotency check | Avoid unnecessary reinstalls |
| Log everything to a file | Debugging remote deployments requires logs |

## Summary

PowerShell DSC enforces desired state with periodic compliance checks. Intune handles cloud-managed and hybrid-joined devices through the Win32 app model. Ansible over WinRM brings the same playbook-driven approach from the Linux world to Windows. And a bootstrap PowerShell script works anywhere PowerShell is available. Choose the tool that fits your environment and existing workflows. The deployment principles remain the same: silent install, separate credentials from config, validate before apply, and verify after deployment.
