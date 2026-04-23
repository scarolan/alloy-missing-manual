# Validation and Rollback

> TODO: Write this section.

## Overview

How to verify a deployment succeeded and how to roll back when it doesn't.

## Validation Checklist

- Service is running: `systemctl is-active alloy` / `Get-Service alloy`
- Web UI accessible: `curl http://localhost:12345/ready`
- Metrics flowing: check Grafana Cloud within 2 minutes of deploy
- No error logs: check journal/event log for Alloy errors
- Series count is within expected range

## Rollback Strategies

- Keep the previous config version available
- Automation tool rollback (Ansible `--tags rollback`, SCCM supersedence)
- Fleet Management: push previous pipeline version
- Emergency: stop the service, revert config, restart

## Canary Deployments

- Deploy to 1-5% of fleet first
- Monitor for 30-60 minutes before proceeding
- Automated rollback triggers (error rate, missing metrics)

## Common Mistakes

- No rollback plan
- Deploying to the entire fleet at once
- Not monitoring during rollout

## Summary
