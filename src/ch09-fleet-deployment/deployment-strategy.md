# Deployment Strategy

Rolling Alloy out to five servers is a manual task. Rolling it out to five thousand servers requires a strategy. This section covers the principles that apply regardless of whether you use Ansible, SCCM, GPO, or something else entirely.

## The Phased Rollout

Never deploy to the entire fleet at once. Use a progressive expansion pattern:

| Phase | Scope | Duration | Purpose |
|---|---|---|---|
| 0 - Lab | 1-2 VMs you own | Hours | Prove the config works at all |
| 1 - Dev | Dev/test environment | 1-2 days | Catch config errors, permission issues |
| 2 - Staging | Staging environment | 2-3 days | Validate under realistic load |
| 3 - Canary | 1-5% of production | 1 week | Detect write-endpoint impact, cardinality surprises |
| 4 - Expansion | 25% increments | Days per step | Monitor each tranche before proceeding |
| 5 - Full | 100% of production | Ongoing | Steady-state monitoring |

The temptation is to skip phases 2 and 3. Resist it. A cardinality explosion that hits 100% of production at once can cost thousands of dollars in a single day on a metered backend.

## The Deployment Checklist

Every host goes through the same sequence, whether you run it manually or encode it in automation:

### 1. Network Connectivity

Before you install anything, verify the host can reach your write endpoints. On Linux:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push
# Expect: 401 (unauthorized but reachable) or 200
```

On Windows (PowerShell):

```powershell
(Invoke-WebRequest -Uri "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push" `
  -Method HEAD -UseBasicParsing).StatusCode
# Expect: 401 or 200
```

If you get a timeout or connection refused, fix the firewall or proxy before proceeding. Installing Alloy on a host that cannot reach the backend wastes everyone's time.

> **Tip:** The [Network Testing](../ch07-recipes/network-testing.md) recipe has a comprehensive connectivity test you can run from any host.

### 2. Credentials Provisioned

Deploy credentials to the host **before** installing Alloy. If Alloy starts with no credentials, it logs errors and retries, which is noisy and creates false alerts.

- **Linux:** Write to `/etc/default/alloy` (Debian/Ubuntu) or `/etc/sysconfig/alloy` (RHEL/SUSE). See [Linux Environment Setup](../ch03-credentials-and-secrets/linux-env-setup.md).
- **Windows:** Set Machine-scope environment variables or write to the registry key `HKLM\Software\GrafanaLabs\Alloy\Environment`. See [Windows Environment Setup](../ch03-credentials-and-secrets/windows-env-setup.md).

### 3. Configuration Validated

Never push a config to production without validating it first:

```bash
alloy validate config.alloy
```

The `validate` command exits with code 0 if the config is valid, non-zero with diagnostic output on stderr if it is not. Run this in your CI pipeline or as a pre-deployment step in your automation.

You can also validate configs written in other formats:

```bash
alloy validate --config.format=prometheus prometheus.yml
alloy validate --config.format=otelcol otel-config.yaml
```

For formatting consistency:

```bash
alloy fmt config.alloy
```

### 4. Package Installed and Service Configured

Install the Alloy package and deploy the config file. The specifics depend on your platform and tool:

- Linux: apt/yum package from the Grafana repository (see [Linux: Ansible](linux-ansible.md) and [Linux: Other Automation](linux-other.md))
- Windows: NSIS installer with `/S` flag (see [Windows: SCCM](windows-sccm.md) and [Windows: GPO](windows-gpo.md))

### 5. Service Started and Health Verified

After installation, verify the service is running and healthy:

```bash
# Linux
sudo systemctl is-active alloy          # returns "active"
curl -s http://localhost:12345/-/ready   # returns "Alloy is ready."
curl -s http://localhost:12345/-/healthy # returns "All Alloy components are healthy."
```

```powershell
# Windows
Get-Service Alloy | Select-Object Status   # returns "Running"
Invoke-RestMethod http://localhost:12345/-/ready   # returns "Alloy is ready."
Invoke-RestMethod http://localhost:12345/-/healthy # returns healthy message
```

### 6. Metrics Flowing

Within 2 minutes of starting the service, check your backend (Grafana Cloud, Mimir, etc.) for metrics from the new host. A quick PromQL query:

```promql
up{instance=~"new-host.*"}
```

### 7. Logs Collected (if applicable)

If you are collecting logs, verify in Loki:

```logql
{hostname="new-host"} | limit 10
```

## Version Pinning

**Always pin the Alloy version. Never use "latest" in production.**

The `grafana.grafana.alloy` Ansible role defaults `alloy_version` to `"latest"`, which downloads whatever is current at deploy time. Override this:

```yaml
alloy_version: "1.8.1"
```

For apt/yum, pin with:

```bash
# Debian/Ubuntu
sudo apt-get install alloy=1.8.1-1
# RHEL/Fedora
sudo dnf install alloy-1.8.1-1
```

Why pin? Because:

1. **Reproducibility** -- deploying the same playbook next week should produce the same result
2. **Rollback clarity** -- you know exactly which version to roll back to
3. **Change control** -- version upgrades are deliberate, not accidental
4. **Fleet consistency** -- every host runs the same version

### The Upgrade Workflow

1. Pin the new version in your automation
2. Deploy to Phase 0 (lab)
3. Run through the validation checklist
4. Promote through each phase
5. Update your "known-good version" record

## Thundering Herd Mitigation

When you deploy Alloy to 500 hosts simultaneously, all 500 start scraping and remote-writing at the same time. This creates a burst of traffic to your write endpoints that can:

- Trigger rate limiting on your backend
- Cause queue buildup and OOM kills on the Alloy instances
- Create a monitoring gap while everything recovers

### Mitigation Strategies

**Stagger deployments.** Use your automation tool's batching feature:

```yaml
# Ansible: deploy in batches of 50
- hosts: alloy_fleet
  serial: 50
  # ...tasks...
```

```ini
# Ansible: 10% of the fleet at a time
[alloy_fleet]
serial: "10%"
```

**Add a random startup delay.** In the Alloy config, if using Fleet Management, stagger the initial scrape intervals. In your automation, add a random sleep before starting the service:

```yaml
# Ansible task
- name: Random startup delay to avoid thundering herd
  ansible.builtin.pause:
    seconds: "{{ 60 | random }}"
  when: alloy_stagger_start | default(false)
```

**Monitor your write endpoints during rollout.** Watch these metrics on your backend:

- `cortex_distributor_received_samples_total` -- spike indicates the herd arriving
- `cortex_ingester_memory_series` -- sharp increase means cardinality impact
- Remote write queue depth on the Alloy side: check the Alloy dashboard

### Batch Size Guidelines

| Fleet Size | Recommended Batch | Wait Between Batches |
|---|---|---|
| < 100 | 10-20 hosts | 2 minutes |
| 100-500 | 25-50 hosts | 5 minutes |
| 500-2000 | 50-100 hosts | 5-10 minutes |
| > 2000 | 100-200 hosts | 10 minutes |

These are starting points. Adjust based on your backend's capacity and your observed write-endpoint behavior.

## Rollback Planning

Before you deploy, know how you will undo it.

### What to Keep Ready

| Artifact | Where to Store It | Why |
|---|---|---|
| Previous Alloy version number | Your automation repo | To pin the rollback version |
| Previous config file | Version control | To restore known-good config |
| Previous credentials | Credential store (Vault, etc.) | In case credential format changed |
| Rollback runbook | Wiki or automation repo | Steps are hard to remember under pressure |

### Rollback Triggers

Define these **before** you deploy:

- Error rate in Alloy logs exceeds N errors/minute
- Metric delivery latency exceeds N seconds
- Series count increases by more than N% (cardinality explosion)
- Backend returns 429 (rate limit) or 503 (overloaded)
- No data received from deployed hosts after 5 minutes

### Rollback Procedure (Generic)

1. **Stop the bleeding**: Halt the deployment pipeline (do not deploy to more hosts)
2. **Diagnose**: Check Alloy logs on affected hosts, check backend health
3. **Revert config**: Push the previous config version to affected hosts
4. **Revert package** (if needed): Downgrade the Alloy package to the previous version
5. **Restart service**: Restart Alloy on affected hosts
6. **Verify**: Run the validation checklist on affected hosts
7. **Post-mortem**: Document what went wrong and update your deployment process

Tool-specific rollback procedures are covered in each deployment section.

## The "Day Two" Problem

Deploying Alloy is day one. Keeping it running correctly is day two. Plan for:

- **Config drift**: Use your automation tool in enforcement mode, not just deployment mode. Run it periodically to detect and correct drift.
- **Version drift**: If some hosts miss an upgrade window, you end up with mixed versions. Track this with an inventory label or a Prometheus metric.
- **Credential rotation**: API keys expire. Build rotation into your automation, not your runbook.
- **Certificate expiry**: If using mTLS to your backend, certificates expire. Monitor expiry dates.

## Summary

The deployment sequence is always the same: verify network, provision credentials, validate config, install package, start service, verify health, confirm data flow. The phased rollout protects you from blast-radius mistakes. Version pinning gives you reproducibility and clean rollbacks. Staggered deployment prevents thundering-herd overload. And having a rollback plan means the inevitable bad deploy is a 10-minute fix instead of a 2-hour incident.
