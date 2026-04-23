# Linux: systemd Filtering

## The Problem

The systemd collector in Alloy's unix exporter scrapes every systemd unit on the host. A typical Linux server has **~150 units** (services, sockets, timers, mounts, etc.). Each unit is tracked across **5 state labels** (active, activating, deactivating, inactive, failed).

Without filtering: **~150 units x 5 states = ~750 series** from systemd alone.

That is often more series than all other Linux metrics combined. On a host where the hardened config ships 400-600 total series, unfiltered systemd would more than double the count.

## The Fix: unit_include

The `systemd` block inside `prometheus.exporter.unix` accepts a `unit_include` regex. Only units matching this regex are scraped. Everything else is ignored.

```alloy
prometheus.exporter.unix "integrations_node_exporter" {
  enable_collectors = [
    "tcpstat",
    "systemd",
  ]

  systemd {
    unit_include = "(sshd?\\.service|crond?\\.service|chronyd?\\.service|systemd-journald\\.service|systemd-resolved\\.service|systemd-timesyncd\\.service|systemd-logind\\.service|alloy\\.service|docker\\.service|containerd\\.service|kubelet\\.service|firewalld?\\.service|ufw\\.service|dbus\\.service)"
  }

  // ... other collector settings ...
}
```

Result: **~15 units x 5 states = ~75 series.** A 10x reduction.

## The Default Service Set

The hardened config monitors these essential services:

| Category | Services | Notes |
|---|---|---|
| **Remote access** | `sshd` (or `ssh` on some distros) | The `sshd?` regex handles both `sshd.service` and `ssh.service` |
| **Scheduling** | `cron` / `crond` | `crond?` handles both Debian (`cron`) and RHEL (`crond`) |
| **Time sync** | `chronyd`, `systemd-timesyncd` | Most hosts run one or the other |
| **Logging** | `systemd-journald` | The journal daemon itself |
| **DNS** | `systemd-resolved` | Present on most modern distros |
| **Sessions** | `systemd-logind`, `dbus` | Login manager and message bus |
| **Monitoring** | `alloy` | Monitor the monitor |
| **Containers** | `docker`, `containerd`, `kubelet` | Only generate series if the service exists |
| **Firewall** | `firewalld`, `ufw` | `firewalld?` handles both names |

Services that do not exist on a given host simply produce no series. Including `kubelet` on a non-Kubernetes host costs nothing.

## Adding Your Own Services

Edit the `unit_include` regex. Add services using the pipe (`|`) separator inside the outer parentheses:

```alloy
systemd {
  unit_include = "(sshd?\\.service|crond?\\.service|chronyd?\\.service|systemd-journald\\.service|systemd-resolved\\.service|systemd-timesyncd\\.service|systemd-logind\\.service|alloy\\.service|docker\\.service|containerd\\.service|kubelet\\.service|firewalld?\\.service|ufw\\.service|dbus\\.service|nginx\\.service|postgresql\\.service|my-app\\.service)"
}
```

Each additional service adds ~5 series (one per state). Budget accordingly.

## Metrics Produced

The systemd collector produces three metric families when filtered:

| Metric | Description | Series per Service |
|---|---|---|
| `node_systemd_unit_state` | Current state of each unit (one series per state label) | 5 |
| `node_systemd_units` | Summary count of units by state | Shared across all units |
| `node_systemd_socket_accepted_connections_total` | Total connections accepted by socket units | 1 per socket |

The `node_systemd_unit_state` metric has a `state` label with values: `active`, `activating`, `deactivating`, `inactive`, `failed`. For each monitored unit, only one state is `1` at any time; the others are `0`.

## How to See What You Are Shipping

After deploying, check your series count in Grafana Cloud:

```promql
-- How many systemd series is this host sending?
count({__name__=~"node_systemd.*", instance="<your-hostname>"})

-- Which units are being tracked?
group by (name) (node_systemd_unit_state{instance="<your-hostname>"})
```

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Leaving systemd unfiltered | ~750 extra series per host | Add the `unit_include` regex |
| Forgetting to escape dots in service names | `sshd.service` regex matches `sshdXservice` too | Use `\\.` (double backslash in Alloy config) |
| Filtering too aggressively | Miss critical service failures | Start with the default set, add application services as needed |
| Not enabling the systemd collector | Zero systemd metrics (it is disabled by default) | Add `"systemd"` to `enable_collectors` |
