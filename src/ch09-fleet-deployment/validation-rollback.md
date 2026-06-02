# Validation and Rollback

Deploying Alloy is not done when the automation finishes. It is done when you have verified that the service is running, data is flowing, and no errors are accumulating. This section covers the verification steps for both Linux and Windows, canary deployment patterns, and rollback procedures for each deployment tool.

## Health Check Commands

### Linux

Run these in order. If any step fails, stop and investigate before proceeding.

```bash
# 1. Is the service running?
sudo systemctl is-active alloy
# Expected: "active"

# 2. Is the service enabled at boot?
sudo systemctl is-enabled alloy
# Expected: "enabled"

# 3. Is Alloy ready (config loaded)?
curl -sf http://localhost:12345/-/ready
# Expected: "Alloy is ready."
# HTTP 200 = ready, HTTP 503 = not ready

# 4. Are all components healthy?
curl -sf http://localhost:12345/-/healthy
# Expected: "All Alloy components are healthy."
# HTTP 200 = healthy, HTTP 500 = unhealthy (lists failing components)

# 5. Check for errors in logs (last 50 lines)
sudo journalctl -u alloy --no-pager -n 50 --priority=err
# Expected: no output (no errors)

# 6. Check for warnings in logs
sudo journalctl -u alloy --no-pager -n 50 --priority=warning
# Expected: minimal or no output

# 7. Are credentials loaded? (verify environment)
sudo tr '\0' '\n' < /proc/$(systemctl show -p MainPID --value alloy)/environ \
  | grep -E '^(GCLOUD_|GRAFANA_)'
# Expected: all credential variables present with correct values

# 8. Are metrics being scraped? (check internal metrics)
curl -sf http://localhost:12345/metrics | grep 'prometheus_remote_write_wal_samples_appended_total'
# Expected: counter value > 0 and increasing
```

### One-liner health check (for scripting)

```bash
# Returns 0 if all checks pass, non-zero on any failure
systemctl is-active alloy >/dev/null 2>&1 && \
  curl -sf http://localhost:12345/-/ready >/dev/null 2>&1 && \
  curl -sf http://localhost:12345/-/healthy >/dev/null 2>&1 && \
  echo "PASS" || echo "FAIL"
```

### Windows

```powershell
# 1. Is the service running?
(Get-Service -Name "Alloy").Status
# Expected: "Running"

# 2. Is the service set to auto-start?
(Get-Service -Name "Alloy").StartType
# Expected: "Automatic"

# 3. Is Alloy ready?
Invoke-RestMethod -Uri "http://localhost:12345/-/ready" -TimeoutSec 10
# Expected: "Alloy is ready."

# 4. Are all components healthy?
Invoke-RestMethod -Uri "http://localhost:12345/-/healthy" -TimeoutSec 10
# Expected: "All Alloy components are healthy."

# 5. Check Windows Event Log for Alloy errors (last 24 hours)
Get-WinEvent -FilterHashtable @{
    LogName = 'Application'
    ProviderName = 'Alloy'
    Level = 2  # Error
    StartTime = (Get-Date).AddHours(-24)
} -ErrorAction SilentlyContinue | Select-Object -First 10 TimeCreated, Message

# 6. Check environment variables
[System.Environment]::GetEnvironmentVariable("GCLOUD_RW_API_KEY", "Machine")
[System.Environment]::GetEnvironmentVariable("GRAFANA_METRICS_URL", "Machine")
# Expected: non-empty values

# 7. Check internal metrics
(Invoke-WebRequest -Uri "http://localhost:12345/metrics" -UseBasicParsing).Content |
    Select-String "prometheus_remote_write_wal_samples_appended_total"
```

### One-liner health check (Windows, for scripting)

```powershell
# Returns "PASS" or "FAIL"
if ((Get-Service Alloy -EA 0).Status -eq "Running" -and
    (Invoke-RestMethod "http://localhost:12345/-/ready" -TimeoutSec 5 -EA 0) -match "ready") {
    "PASS"
} else { "FAIL" }
```

## Metrics Flow Verification

Checking that the service is running is not enough. You need to verify that data is actually reaching your backend.

### Prometheus / Mimir

Run this PromQL query in your Grafana instance within 2-5 minutes of deployment:

```promql
# Check that the host is reporting
up{instance=~"<hostname>.*"}

# Check the scrape target count
scrape_samples_scraped{instance=~"<hostname>.*"}

# Check remote write success
prometheus_remote_write_wal_samples_appended_total{instance=~"<hostname>.*"}
```

### Loki (if collecting logs)

Run this LogQL query:

```logql
{hostname="<hostname>"} | limit 5
```

### Automated Verification Script (Linux)

```bash
#!/usr/bin/env bash
# verify-alloy.sh - Post-deployment verification
# Exit codes: 0 = all checks pass, 1 = failure

set -euo pipefail

HOST="${1:-localhost}"
PORT="${2:-12345}"
TIMEOUT=5
ERRORS=0

check() {
    local desc="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        echo "  [PASS] $desc"
    else
        echo "  [FAIL] $desc"
        ((ERRORS++))
    fi
}

echo "Verifying Alloy on ${HOST}:${PORT}"

check "Service is active" \
    systemctl is-active alloy

check "Service is enabled" \
    systemctl is-enabled alloy

check "Readiness endpoint" \
    curl -sf --max-time $TIMEOUT "http://${HOST}:${PORT}/-/ready"

check "Health endpoint" \
    curl -sf --max-time $TIMEOUT "http://${HOST}:${PORT}/-/healthy"

check "Metrics endpoint accessible" \
    curl -sf --max-time $TIMEOUT "http://${HOST}:${PORT}/metrics"

check "No errors in recent logs" \
    bash -c '! journalctl -u alloy --since "5 minutes ago" --priority=err --quiet | grep -q .'

check "Remote write WAL active" \
    bash -c "curl -sf 'http://${HOST}:${PORT}/metrics' | grep -q 'prometheus_remote_write_wal_samples_appended_total'"

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "All checks passed."
    exit 0
else
    echo "${ERRORS} check(s) failed."
    exit 1
fi
```

### Ansible Post-Deployment Verification

```yaml
# Include in your playbook as post_tasks
post_tasks:
  - name: Wait for Alloy readiness
    ansible.builtin.uri:
      url: "http://{{ alloy_listen_addr }}:{{ alloy_listen_port }}/-/ready"
      status_code: 200
    register: ready_result
    until: ready_result.status == 200
    retries: 12
    delay: 5

  - name: Verify component health
    ansible.builtin.uri:
      url: "http://{{ alloy_listen_addr }}:{{ alloy_listen_port }}/-/healthy"
      status_code: 200

  - name: Check for errors in Alloy logs
    ansible.builtin.command:
      cmd: journalctl -u alloy --since "5 minutes ago" --priority=err --no-pager
    register: error_log
    changed_when: false
    failed_when: error_log.stdout | length > 0
```

## Error Log Checking

### Common Errors and What They Mean

| Error Pattern | Cause | Fix |
|---|---|---|
| `connection refused` on remote write URL | Network/firewall blocking outbound HTTPS | Open port 443 to your write endpoint |
| `401 Unauthorized` on remote write | Wrong credentials or expired API key | Check env vars, rotate API key |
| `429 Too Many Requests` | Rate limited by backend | Reduce scrape frequency, filter metrics, or increase backend limits |
| `context deadline exceeded` | Timeout reaching backend | Check DNS, proxy settings, network latency |
| `component unhealthy` | A configured component failed to initialize | Check the specific component's config |
| `failed to load configuration` | Syntax error in config.alloy | Run `alloy validate config.alloy` and fix errors |
| `permission denied` reading journal | `alloy` user not in `systemd-journal` group | Add user to group: `usermod -aG systemd-journal alloy` |

### Continuous Log Monitoring (Linux)

```bash
# Follow Alloy logs in real time (useful during rollout)
sudo journalctl -u alloy -f

# Filter for errors and warnings only
sudo journalctl -u alloy -f --priority=warning
```

### Continuous Log Monitoring (Windows)

```powershell
# Watch for new Alloy events (PowerShell 7+)
Get-WinEvent -FilterHashtable @{
    LogName = 'Application'
    ProviderName = 'Alloy'
} -MaxEvents 20 | Format-Table TimeCreated, LevelDisplayName, Message -Wrap
```

## Canary Deployment Pattern

A canary deployment tests changes on a small subset before rolling them out to the full fleet.

### The Pattern

```
Phase 1: Deploy to 1-5% of fleet (canary group)
   │
   ├── Monitor for 30-60 minutes
   │   ├── Check error rates in Alloy logs
   │   ├── Check metrics delivery latency
   │   ├── Check series count (cardinality)
   │   └── Check backend health (rate limits, queue depth)
   │
   ├── [If OK] → Phase 2: Deploy to 25%
   │                │
   │                ├── Monitor for 30-60 minutes
   │                └── [If OK] → Phase 3: Deploy to 50% → 75% → 100%
   │
   └── [If NOT OK] → Rollback canary group
                      │
                      └── Investigate and fix before retrying
```

### Ansible Implementation

```yaml
# deploy-alloy-canary.yml
---
# Phase 1: Canary (5% of fleet)
- name: "Phase 1 - Canary deployment"
  hosts: alloy_canary
  become: true
  serial: "100%"  # All canaries at once (it's a small group)
  roles:
    - role: alloy
  post_tasks:
    - name: Verify canary health
      ansible.builtin.include_tasks: verify-alloy.yml

- name: "Phase 1 - Wait for monitoring"
  hosts: localhost
  tasks:
    - name: Pause for canary observation
      ansible.builtin.pause:
        prompt: |
          Canary deployment complete. Check Grafana dashboards for:
          - Error rate in Alloy logs
          - Metrics delivery latency
          - Series count changes
          - Backend health
          Press ENTER to proceed to Phase 2, or Ctrl+C to abort.

# Phase 2: 25% of production
- name: "Phase 2 - Expand to 25%"
  hosts: alloy_production
  become: true
  serial: "25%"
  roles:
    - role: alloy
  post_tasks:
    - name: Verify deployment health
      ansible.builtin.include_tasks: verify-alloy.yml

    - name: Pause between batches
      ansible.builtin.pause:
        seconds: 300
      when: ansible_play_batch | length > 0
```

### Canary Group in Ansible Inventory

```yaml
# inventory/hosts.yml
all:
  children:
    alloy_canary:
      hosts:
        canary-[01:03].prod.example.com:
    alloy_production:
      hosts:
        prod-[01:100].prod.example.com:
```

### Automated Rollback Triggers

Define these in your monitoring system (Grafana alerting, PagerDuty, etc.):

| Metric | Threshold | Action |
|---|---|---|
| Alloy error rate | > 10 errors/min per host | Alert + pause rollout |
| Remote write 4xx rate | > 5% of write requests | Alert + pause rollout |
| Remote write 5xx rate | > 1% of write requests | Alert + auto-rollback |
| Series count increase | > 20% jump in 30 min | Alert + investigate |
| No data from canary host | > 5 minutes | Alert + investigate |

## Rollback Procedures by Tool

### Ansible Rollback

```yaml
# rollback-alloy.yml
---
- name: Rollback Alloy
  hosts: "{{ target_hosts | default('alloy_canary') }}"
  become: true
  vars:
    alloy_version: "{{ rollback_version | default('1.7.0') }}"
    alloy_config_source: "{{ rollback_config | default('files/config.alloy.previous') }}"
  roles:
    - role: alloy
```

```bash
# Rollback canary group to previous version
ansible-playbook rollback-alloy.yml \
  -e target_hosts=alloy_canary \
  -e rollback_version=1.7.0

# Rollback a specific host
ansible-playbook rollback-alloy.yml \
  -e target_hosts=prod-42.prod.example.com \
  -e rollback_version=1.7.0
```

### SCCM Rollback

1. **If using supersedence**: Remove the supersedence relationship and redeploy the old application version
2. **If using phased deployment**: Pause or cancel the phased deployment; the old version remains on hosts not yet upgraded
3. **Manual rollback**: Deploy the old installer version to affected collections

### GPO Rollback

1. Update the startup script to reference the previous version of the installer
2. Update the config file on the network share to the previous version
3. Force a GPO refresh: `Invoke-GPUpdate -Computer $hostname -Force -Target Computer`
4. The next reboot will apply the rollback via the startup script

### Emergency Rollback (Any Tool)

When everything is on fire and you need to stop the bleeding immediately:

**Linux:**

```bash
# Stop the service (stops data collection immediately)
sudo systemctl stop alloy

# Revert to previous config
sudo cp /etc/alloy/config.alloy.bak /etc/alloy/config.alloy

# Downgrade the package
# Debian/Ubuntu:
sudo apt-get install alloy=1.7.0-1
# RHEL:
sudo dnf downgrade alloy-1.7.0

# Start with the old config
sudo systemctl start alloy

# Verify
curl -sf http://localhost:12345/-/ready
```

**Windows:**

```powershell
# Stop the service
Stop-Service -Name "Alloy" -Force

# Revert config (if you have a backup)
Copy-Item "C:\Backup\config.alloy" "$env:ProgramFiles\GrafanaLabs\Alloy\config.alloy" -Force

# For a version downgrade, uninstall and reinstall:
& "$env:ProgramFiles\GrafanaLabs\Alloy\uninstall.exe" /S
Start-Sleep -Seconds 10
& "C:\Backup\alloy-installer-windows-amd64-1.7.0.exe" /S
Start-Sleep -Seconds 10

# Start the service
Start-Service -Name "Alloy"

# Verify
Invoke-RestMethod "http://localhost:12345/-/ready"
```

### Fleet Management Rollback

If you use [Grafana Cloud Fleet Management](../ch05-fleet-management/README.md), you can roll back the pipeline configuration for all connected collectors without touching the individual hosts:

1. In Grafana Cloud, navigate to Fleet Management > Pipelines
2. Edit the pipeline and revert to the previous configuration version
3. Connected Alloy instances pull the updated pipeline within their check-in interval

This is the fastest rollback path for config-only changes because it does not require running any automation against the fleet.

## The Rollback Checklist

Before every deployment, fill in this checklist and keep it in your deployment ticket or runbook:

```
[ ] Previous Alloy version: _______________
[ ] Previous config file: backed up at _______________
[ ] Rollback automation tested: yes / no
[ ] Rollback trigger criteria defined:
    [ ] Error rate threshold: _______________
    [ ] Data gap threshold: _______________
    [ ] Series count threshold: _______________
[ ] Communication plan:
    [ ] Who to notify on rollback: _______________
    [ ] Escalation path: _______________
[ ] Post-rollback verification steps documented
```

## Common Mistakes

| Mistake | What Happens | Fix |
|---|---|---|
| No verification after deployment | Problems go unnoticed for hours | Run the health check sequence on every host |
| Checking only service status, not data flow | Service runs but sends no data | Always verify `/-/healthy` and check your backend |
| No canary phase | Bad config hits entire fleet at once | Deploy to 1-5% first, monitor, then expand |
| No rollback plan | 2-hour scramble when things go wrong | Document rollback steps before you deploy |
| No config backup before upgrade | Cannot revert to known-good config | Always back up before changes |
| Deploying on Friday afternoon | Weekend incident if something goes wrong | Deploy Tuesday through Thursday morning |
| Relying only on `/-/ready` | Ready means config loaded, not that components work | Use `/-/healthy` for component-level verification |

## Summary

Validation is a sequence: service running, readiness confirmed, components healthy, no errors in logs, credentials loaded, metrics flowing to the backend. Automate this sequence and run it on every host after every deployment. Use canary deployments to limit blast radius, define automated rollback triggers in your monitoring, and keep rollback procedures documented and tested. The fastest rollback is the one you have practiced.
