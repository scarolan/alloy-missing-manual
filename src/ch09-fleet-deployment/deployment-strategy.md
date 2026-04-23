# Deployment Strategy

> TODO: Write this section.

## Overview

Principles for rolling out Alloy across a large fleet, regardless of which automation tool you use.

## Key Concepts

- Phased rollout: dev → staging → production canary → production
- What to deploy first: binary/package, then config, then credentials
- Config management: templated configs vs Fleet Management vs both
- Version pinning: always pin the Alloy version, never use "latest"
- Rollback plan: keep the previous version's config and package available

## The Deployment Checklist

1. Network connectivity verified (see Network Testing recipe)
2. Credentials provisioned (see Credentials chapter)
3. Config validated (`alloy fmt` + `alloy run --check`)
4. Package installed and service configured
5. Service started and health verified
6. Metrics flowing (check Grafana Cloud)
7. Log collection verified

## Scaling Considerations

- Stagger deployments to avoid thundering herd on write endpoints
- Monitor remote_write queue depth during rollout
- Have a kill switch (Fleet Management or config management)

## Summary
