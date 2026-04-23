# Network Testing

> TODO: Write this section.

## Overview

Before deploying Alloy, verify that the host can reach all required Grafana Cloud endpoints. These scripts test TCP 443 connectivity to the five key endpoints.

## Linux (Bash)

```bash
# TODO: Add full script from gist
# Tests connectivity to: Grafana stack, OTLP gateway, Prometheus, Loki, Tempo
```

## Windows (PowerShell)

```powershell
# TODO: Add full script from gist
# Uses TcpClient to test same endpoints
```

## Key Concepts

- Five endpoints to test: Grafana stack, OTLP gateway, Prometheus, Loki, Tempo
- All use TCP 443
- Endpoints are region/stack-specific — customize for your environment
- Run this before deploying Alloy to catch firewall issues early

## Common Mistakes

- Testing from a machine with different firewall rules than the target host
- Forgetting that proxy settings may differ between user sessions and services

## Summary
