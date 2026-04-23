# Windows Environment Setup

## The Fundamental Problem

Windows services do **not** inherit user-level environment variables. If you set a variable via `$env:GCLOUD_RW_API_KEY = "..."` in a PowerShell session, or via the "User variables" section of the System Properties UI, the Alloy service will never see it.

This catches everyone at least once. The Alloy service runs under the SYSTEM account (or whichever service account you configure). It inherits **Machine-scope** system variables and any **service-scoped** variables set in the registry. User variables are invisible.

## Three Methods

### Method 1: Machine-Scope System Variables (Recommended)

Machine-scope variables are visible to every service and every new process on the host. This is the simplest approach and works for most deployments.

**PowerShell (run as Administrator):**

```powershell
[System.Environment]::SetEnvironmentVariable("GCLOUD_RW_API_KEY", "glc_xxxxxxxxxxxxx", "Machine")
[System.Environment]::SetEnvironmentVariable("GRAFANA_METRICS_URL", "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push", "Machine")
[System.Environment]::SetEnvironmentVariable("GRAFANA_METRICS_USERNAME", "000000", "Machine")
[System.Environment]::SetEnvironmentVariable("GRAFANA_LOGS_URL", "https://logs-prod-006.grafana.net/loki/api/v1/push", "Machine")
[System.Environment]::SetEnvironmentVariable("GRAFANA_LOGS_USERNAME", "000000", "Machine")

Restart-Service Alloy
```

**UI (single host):** Start -- "Edit the system environment variables" -- Environment Variables... -- under **System variables** (not User variables) -- New.

**Key detail:** the third argument `"Machine"` is what makes this a system-wide variable. Using `"User"` or omitting the argument sets a user-scoped variable that services cannot see.

### Method 2: Service-Scoped Registry Key

This isolates Alloy's environment from other services. Variables set this way are only visible to the Alloy process. Other services and shell sessions cannot see them.

```powershell
Set-ItemProperty `
  -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Alloy" `
  -Name Environment `
  -Type MultiString `
  -Value @(
    "GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx",
    "GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push",
    "GRAFANA_METRICS_USERNAME=000000",
    "GRAFANA_LOGS_URL=https://logs-prod-006.grafana.net/loki/api/v1/push",
    "GRAFANA_LOGS_USERNAME=000000"
  )

Restart-Service Alloy
```

**How it works:**

- The `Environment` value is a `REG_MULTI_SZ` (multi-string registry value) -- one `KEY=value` per array element
- Windows Service Control Manager reads this registry key at service start and injects the variables into the process environment
- If both Machine-scope and service-scoped variables exist for the same name, the service-scoped value wins

**When to use this:** on hosts where other services run under the same account and you do not want them to see the API key via `Get-ChildItem env:`.

### Method 3: Group Policy (Fleet-Wide)

For deploying to many hosts, use Group Policy Preferences:

1. Open Group Policy Management Console
2. Navigate to: **Computer Configuration** -- **Preferences** -- **Windows Settings** -- **Environment**
3. Right-click -- **New** -- **Environment Variable**
4. For each variable:
   - **Action:** Replace
   - **Name:** the variable name (e.g., `GCLOUD_RW_API_KEY`)
   - **Value:** the variable value
   - **Variable type:** leave default (System)
5. Repeat for all five variables

GPO distributes Machine-scope variables. Alloy must be restarted after GPO applies (either via a scheduled task, a startup script, or a reboot).

**Security note:** anyone with read access to the GPO object can see the values. If this is a concern, use the service-scoped registry approach (Method 2) distributed via your preferred configuration management tool (SCCM, Intune, DSC, etc.) instead.

## Verification

### Check Machine-Scope Variables

This shows what the next service start will inherit (useful after setting via Method 1):

```powershell
[System.Environment]::GetEnvironmentVariables("Machine").Keys |
  Where-Object { $_ -like "GRAFANA_*" -or $_ -eq "GCLOUD_RW_API_KEY" } |
  ForEach-Object { "$_ = $([System.Environment]::GetEnvironmentVariable($_, 'Machine'))" }
```

### Check Service-Scoped Registry Values

This shows what is configured via Method 2:

```powershell
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Alloy" -ErrorAction SilentlyContinue).Environment
```

Expected output (one entry per line):

```
GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx
GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push
GRAFANA_METRICS_USERNAME=000000
GRAFANA_LOGS_URL=https://logs-prod-006.grafana.net/loki/api/v1/push
GRAFANA_LOGS_USERNAME=000000
```

### Check Your Current Shell

This only confirms what your interactive session sees, not what the service sees. Useful for a quick sanity check after Method 1:

```powershell
Get-ChildItem env: | Where-Object { $_.Name -like "GRAFANA*" -or $_.Name -eq "GCLOUD_RW_API_KEY" }
```

**Important:** if you set Machine-scope variables in the same PowerShell session, that session still has the old environment. Open a **new** PowerShell window or restart the service to pick up changes.

### Check the Running Process

The process environment is fixed at start time. If you changed values after starting Alloy, you must `Restart-Service Alloy` first, then verify.

## Restart Procedure

```powershell
Restart-Service Alloy
Get-Service Alloy    # confirm Status is "Running"
```

If the service fails to start, check the Application event log:

```powershell
Get-WinEvent -LogName Application -ProviderName Alloy -MaxEvents 20 | Format-List
```

## Rotating Credentials

1. Create a new access policy token in Grafana Cloud (keep the old one active)
2. Update `GCLOUD_RW_API_KEY` using whichever method you used to set it
3. `Restart-Service Alloy`
4. Verify data is flowing (PromQL smoke tests)
5. Delete the old token

## Automation at Scale

| Tool | Method |
|---|---|
| **GPO** | Computer Configuration -- Preferences -- Environment (Method 3) |
| **SCCM / MECM** | PowerShell script package using Method 1 or Method 2 |
| **Intune** | Remediation script or Win32 app with PowerShell |
| **DSC** | `Environment` resource (Method 1) or `Registry` resource (Method 2) |
| **PDQ Deploy** | PowerShell step with the commands from Method 1 or 2 |

## Common Mistakes

| Mistake | What Happens | Fix |
|---|---|---|
| Setting User-scope variables | Alloy service never sees them | Use `"Machine"` as the third argument, or use Method 2 |
| Using `$env:VAR = "value"` in PowerShell | Sets a session-scoped variable that dies with the shell | Use `[System.Environment]::SetEnvironmentVariable(...)` |
| Forgetting `Restart-Service Alloy` | Old values remain in the running process | Always restart after changes |
| GPO with "User" scope | Service runs as SYSTEM, not a user | Use "Machine" target in GPO |
| Reading `env:` to verify service variables | Shows your session env, not the service env | Use the registry check (Method 2) or Machine-scope check |
