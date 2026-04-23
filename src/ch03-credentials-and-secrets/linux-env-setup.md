# Linux Environment Setup

> TODO: Write this section.

## Overview

On Linux, Alloy runs as a systemd service. Environment variables must be set where the service can read them.

## Key Concepts

- Debian/Ubuntu: `/etc/default/alloy`
- RHEL/CentOS/Fedora: `/etc/sysconfig/alloy`
- Format: `KEY=value`, one per line
- These files should be owned by root with restricted permissions (0600)

## Required Variables

```
GCLOUD_RW_API_KEY=your-api-key-here
GRAFANA_METRICS_URL=https://prometheus-prod-XX-prod-us-east-0.grafana.net/api/prom/push
GRAFANA_METRICS_USERNAME=123456
GRAFANA_LOGS_URL=https://logs-prod-XX.grafana.net/loki/api/v1/push
GRAFANA_LOGS_USERNAME=654321
```

## Verification

```bash
sudo tr '\0' '\n' < /proc/$(systemctl show -p MainPID --value alloy)/environ | grep -E '^(GCLOUD_|GRAFANA_)'
```

## Common Mistakes

- Putting variables in `~/.bashrc` (services don't read shell profiles)
- Forgetting to restart Alloy after editing the env file

## Summary
