# Windows Environment Setup

> TODO: Write this section.

## Overview

Windows services do not inherit user environment variables. You must use Machine-scope system variables or service-scoped registry entries.

## Key Concepts

- Machine-scope environment variables (visible to all services)
- Service-scoped registry key for isolation
- GPO distribution for fleets

## Option 1: Machine-Scope Environment Variables

```powershell
[System.Environment]::SetEnvironmentVariable("GCLOUD_RW_API_KEY", "your-key", "Machine")
[System.Environment]::SetEnvironmentVariable("GRAFANA_METRICS_URL", "https://...", "Machine")
```

Requires service restart to pick up changes.

## Option 2: Service-Scoped Registry

```powershell
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Alloy" `
  -Name Environment -Type MultiString `
  -Value @("GCLOUD_RW_API_KEY=your-key", "GRAFANA_METRICS_URL=https://...")
```

Only visible to the Alloy service process.

## Option 3: GPO for Fleet Distribution

Computer Configuration > Preferences > Windows Settings > Environment

## Common Mistakes

- Setting user-level environment variables and expecting services to see them
- Forgetting to restart the Alloy service after changes

## Summary
