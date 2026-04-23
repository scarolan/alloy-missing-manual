# Linux Environment Setup

## How Alloy Reads Environment Variables on Linux

Alloy runs as a systemd service. It does **not** read your shell profile (`~/.bashrc`, `~/.zshrc`), does not source `/etc/environment` directly, and does not see variables set with `export` in a terminal. The only variables Alloy sees are those injected into its service environment by systemd.

## File Paths by Distro

Alloy's systemd unit is configured to source an environment file at startup. The path depends on your distribution:

| Distribution Family | Env File Path |
|---|---|
| Debian, Ubuntu | `/etc/default/alloy` |
| RHEL, Rocky, CentOS, SUSE, Amazon Linux | `/etc/sysconfig/alloy` |

These files already exist after installing Alloy from the Grafana APT or YUM repo. They may contain existing settings (like `CUSTOM_ARGS`). You append your credential variables to the same file.

## File Format

The format is plain `KEY=value`, one per line. No `export` keyword, no quotes required (though quotes work). Comments start with `#`.

```bash
# Grafana Cloud credentials
GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx
GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push
GRAFANA_METRICS_USERNAME=000000
GRAFANA_LOGS_URL=https://logs-prod-006.grafana.net/loki/api/v1/push
GRAFANA_LOGS_USERNAME=000000
```

## Setup Commands

### Debian / Ubuntu

```bash
sudo tee -a /etc/default/alloy >/dev/null <<'EOF'
GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx
GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push
GRAFANA_METRICS_USERNAME=000000
GRAFANA_LOGS_URL=https://logs-prod-006.grafana.net/loki/api/v1/push
GRAFANA_LOGS_USERNAME=000000
EOF
sudo chmod 600 /etc/default/alloy
sudo systemctl restart alloy
```

### RHEL / Rocky / CentOS / SUSE

```bash
sudo tee -a /etc/sysconfig/alloy >/dev/null <<'EOF'
GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx
GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push
GRAFANA_METRICS_USERNAME=000000
GRAFANA_LOGS_URL=https://logs-prod-006.grafana.net/loki/api/v1/push
GRAFANA_LOGS_USERNAME=000000
EOF
sudo chmod 600 /etc/sysconfig/alloy
sudo systemctl restart alloy
```

### systemd Drop-In (any distro, portable)

If you prefer not to touch distro-specific env files, use a systemd override:

```bash
sudo systemctl edit alloy
```

This opens an editor. Add:

```ini
[Service]
Environment="GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx"
Environment="GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
Environment="GRAFANA_METRICS_USERNAME=000000"
Environment="GRAFANA_LOGS_URL=https://logs-prod-006.grafana.net/loki/api/v1/push"
Environment="GRAFANA_LOGS_USERNAME=000000"
```

Save and close, then:

```bash
sudo systemctl restart alloy
```

The drop-in is written to `/etc/systemd/system/alloy.service.d/override.conf` and survives package upgrades.

## File Permissions

The env file contains your API key. Lock it down:

```bash
sudo chmod 600 /etc/default/alloy    # or /etc/sysconfig/alloy
sudo chown root:root /etc/default/alloy
```

The `chmod 600` means only root can read or write the file. The `tee` commands above already run as root via `sudo`.

## The Verification Command

This is the most important command in this chapter. It reads the actual environment variables from the running Alloy process, not from the file on disk:

```bash
sudo tr '\0' '\n' < /proc/$(systemctl show -p MainPID --value alloy)/environ \
  | grep -E '^(GCLOUD_|GRAFANA_)'
```

**How it works:**

1. `systemctl show -p MainPID --value alloy` -- gets the PID of the running Alloy process
2. `/proc/<pid>/environ` -- the kernel exposes the process's environment here, with null-byte separators
3. `tr '\0' '\n'` -- converts null bytes to newlines so `grep` can work
4. `grep -E '^(GCLOUD_|GRAFANA_)'` -- filters to only your credential variables

**Expected output:**

```
GCLOUD_RW_API_KEY=glc_xxxxxxxxxxxxx
GRAFANA_METRICS_URL=https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push
GRAFANA_METRICS_USERNAME=000000
GRAFANA_LOGS_URL=https://logs-prod-006.grafana.net/loki/api/v1/push
GRAFANA_LOGS_USERNAME=000000
```

If any variable is missing from the output, Alloy has not picked it up. The two most common causes:

1. You edited the env file but have not restarted Alloy yet
2. You put the variables in the wrong file (e.g., `/etc/default/alloy` on a RHEL host)

## Restart Procedure

After any change to the env file:

```bash
sudo systemctl restart alloy
sudo systemctl status alloy           # confirm it's running
```

Then run the verification command above to confirm the new values are in the process environment.

**Important:** `systemctl reload` does **not** pick up new environment variables. Environment is set at process start time. You must restart.

## Automation at Scale

For fleets, use your existing tooling:

| Tool | Method |
|---|---|
| **Ansible** | `lineinfile` or `template` module targeting the env file path, with a `notify: restart alloy` handler |
| **Chef** | `file` resource for the env file, `service` resource with `:restart` action |
| **Puppet** | `file` resource with `notify => Service['alloy']` |
| **Salt** | `file.managed` state with `watch_in: service.running` |
| **cloud-init** | `write_files` entry in user-data for the env file |

## Rotating Credentials

1. Create a new access policy token in Grafana Cloud (do not delete the old one yet)
2. Update `GCLOUD_RW_API_KEY` in the env file on each host
3. Restart Alloy on each host
4. Verify data is still flowing (run the PromQL smoke tests from the deployment guide)
5. Delete the old token

For URL or username changes (stack migration), update all four endpoint variables together and restart. The change is atomic per host.

## Common Mistakes

| Mistake | What Happens | Fix |
|---|---|---|
| Variables in `~/.bashrc` or `~/.profile` | Alloy's systemd service never sees them | Move to `/etc/default/alloy` or equivalent |
| Using `export KEY=value` in the env file | Technically works but is unnecessary and inconsistent | Use plain `KEY=value` |
| Forgetting `systemctl restart` after editing | Old values remain in the running process | Always restart after edits |
| Using `systemctl reload` instead of `restart` | Environment variables are not reloaded | Use `restart`, not `reload` |
| Wrong file path for the distro | Alloy reads the wrong file (or none) | Check with the verification command |
| File permissions too open | Other users on the host can read the API key | `chmod 600` and `chown root:root` |
