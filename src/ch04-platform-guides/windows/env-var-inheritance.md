# Windows: Environment Variable Inheritance

## The Problem Everyone Hits

You set environment variables in a PowerShell session:

```powershell
$env:GCLOUD_RW_API_KEY = "glc_xxxxxxxxxxxxx"
$env:GRAFANA_METRICS_URL = "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
```

You restart the Alloy service. It fails to authenticate. The variables are gone.

This is not a bug. Windows services do not inherit user-level or session-level environment variables. The Alloy service runs under the SYSTEM account (or whichever service account is configured). It sees only:

1. **Machine-scope system variables** -- set via `[System.Environment]::SetEnvironmentVariable(..., "Machine")` or the System Properties UI under "System variables"
2. **Service-scoped registry variables** -- set via the `Environment` registry key under `HKLM:\SYSTEM\CurrentControlSet\Services\Alloy`

User-scope variables (set via `$env:`, the "User variables" UI section, or `[System.Environment]::SetEnvironmentVariable(..., "User")`) are invisible to services.

## The Three Scopes

| Scope | Set By | Visible To | Use Case |
|---|---|---|---|
| **Session** | `$env:VAR = "value"` | Current PowerShell session only | Testing, debugging |
| **User** | `[Environment]::SetEnvironmentVariable("VAR", "value", "User")` | Processes started by that user | Desktop apps, not services |
| **Machine** | `[Environment]::SetEnvironmentVariable("VAR", "value", "Machine")` | All services and all new sessions | Alloy and other services |
| **Service-scoped** | Registry `HKLM:\...\Services\Alloy\Environment` | Only the Alloy service | Maximum isolation |

For Alloy, only Machine and Service-scoped work. Service-scoped takes precedence if both are set for the same variable name.

## The Three Approaches

This is a summary with cross-reference. For full commands and verification steps, see [Chapter 3: Windows Environment Setup](../../ch03-credentials-and-secrets/windows-env-setup.md).

### Approach 1: Machine-Scope PowerShell

```powershell
[System.Environment]::SetEnvironmentVariable("GCLOUD_RW_API_KEY", "glc_xxxxxxxxxxxxx", "Machine")
# ... repeat for all 5 variables ...
Restart-Service Alloy
```

- Simplest approach
- Visible to all services and new shells
- Works with GPO distribution

### Approach 2: Service-Scoped Registry

```powershell
Set-ItemProperty `
  -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Alloy" `
  -Name Environment `
  -Type MultiString `
  -Value @(
    "GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx",
    "GRAFANA_METRICS_URL=https://...",
    "GRAFANA_METRICS_USERNAME=000000",
    "GRAFANA_LOGS_URL=https://...",
    "GRAFANA_LOGS_USERNAME=000000"
  )
Restart-Service Alloy
```

- Only visible to the Alloy process
- Prevents other services from reading the API key
- Slightly more complex to manage

### Approach 3: Group Policy (GPO)

Computer Configuration -- Preferences -- Windows Settings -- Environment. Create one entry per variable with Action "Replace" and target "Machine".

- Fleet-wide distribution
- Deploys Machine-scope variables
- Anyone with GPO read access can see values

## Why This Catches People

The confusion arises because:

1. **Interactive testing works.** You set `$env:GRAFANA_METRICS_URL` in a PowerShell session, run Alloy manually (`alloy run config.alloy`), and everything works. Then you configure it as a service and it breaks.

2. **The error is not obvious.** Alloy starts fine but silently fails to authenticate (because `sys.env()` returns empty string for missing variables -- see [The sys.env() Pattern](../../ch03-credentials-and-secrets/sys-env-pattern.md)).

3. **The Windows UI is misleading.** The Environment Variables dialog has two sections: "User variables" (top) and "System variables" (bottom). Only the bottom section (System/Machine) works for services.

## Quick Diagnostic

If Alloy starts but data is not flowing, check whether the variables are actually set at Machine scope:

```powershell
# This shows Machine-scope variables (what services will see)
[System.Environment]::GetEnvironmentVariable("GCLOUD_RW_API_KEY", "Machine")

# This shows session variables (NOT what services see)
$env:GCLOUD_RW_API_KEY
```

If the first command returns empty but the second returns a value, you have a scope problem.
