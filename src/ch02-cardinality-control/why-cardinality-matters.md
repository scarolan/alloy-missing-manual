# Why Cardinality Matters

Cardinality is the single most important concept to understand before deploying Alloy. It determines how many time series your hosts generate, which directly determines what you pay. Get this wrong and a fleet of 500 servers can cost 10x more than it should. Get it right and you have predictable, controlled costs with zero dashboard regressions.

## What Is a Time Series?

A time series is one unique combination of metric name plus label key-value pairs. Every distinct combination is a separate series that your backend must store, index, and query.

```text
node_cpu_seconds_total{cpu="0", mode="idle", instance="web-1", job="integrations/node_exporter"}
node_cpu_seconds_total{cpu="0", mode="user", instance="web-1", job="integrations/node_exporter"}
node_cpu_seconds_total{cpu="1", mode="idle", instance="web-1", job="integrations/node_exporter"}
```

Those are three separate time series, even though they share the same metric name. The label values differ, so each is tracked and billed independently.

## The Math: How Series Count Is Calculated

Series count is multiplicative across label dimensions:

```text
total_series = metric_name_count x label_value_combinations
```

For a single metric like `node_cpu_seconds_total` on a 4-core host:

```text
4 CPU cores x 8 modes (idle, user, system, nice, iowait, irq, softirq, steal)
= 32 series from one metric
```

For `windows_cpu_time_total` on a 16-core Windows server:

```text
16 cores x 5 modes (idle, user, privileged, interrupt, dpc)
= 80 series from one metric
```

Now multiply across all metric families. A single host running the node exporter exposes 500+ metric names by default. Many of those have per-device labels (one per CPU, per disk, per NIC, per filesystem, per network interface). The math compounds quickly:

```text
Unfiltered Linux host (1 CPU, 1 disk, 1 NIC): ~337 series
Unfiltered Windows server (2 CPU, 1 disk, 1 NIC, 200 services): ~2,909 series
```

And those are small VMs. Bigger hardware means more label values per metric.

## The Cost Model: Active Series x DPM

Grafana Cloud (and similar Prometheus-compatible backends) bills on two dimensions:

1. **Active series** -- the number of unique time series that received a sample in the last 5 minutes
2. **Data Points per Minute (DPM)** -- how frequently each series receives new samples

The billing formula:

```text
monthly_cost = (active_series / 1000) x (DPM / included_DPM) x price_per_1000_series
```

At a 60-second scrape interval, DPM = 1 (optimal for Grafana Cloud's included tier). At 15-second intervals, DPM = 4 and you pay 4x for the same data.

**Concrete example at $8 per 1,000 active series:**

| Scenario | Active Series | DPM | Monthly Cost |
|----------|--------------|-----|-------------|
| 100 hosts, unfiltered Windows (2,909/host) | 290,900 | 1 | $2,327 |
| 100 hosts, hardened Windows (135/host) | 13,500 | 1 | $108 |
| 1,000 hosts, unfiltered Linux (~2,000/host) | 2,000,000 | 1 | $16,000 |
| 1,000 hosts, hardened Linux (~500/host) | 500,000 | 1 | $4,000 |

The hardened configs save $2,219/month on 100 Windows hosts and $12,000/month on 1,000 Linux hosts. Over a year, that is $26,628 and $144,000 respectively.

## What an Unfiltered Host Actually Generates

These numbers come from real benchmarks on actual cloud VMs:

### Linux (t3.micro, 1 vCPU)

| Configuration | Active Series |
|---|---|
| Bare minimum (CPU/Disk/Mem/Net) | 11 |
| Dashboard-optimized (hardened, all layers) | ~50 |
| Unfiltered (all default collectors) | 337 |

The default node exporter enables collectors like `bcache`, `btrfs`, `xfs`, `nfs`, `infiniband`, `ipvs`, `rapl`, `tapestats`, and `zfs` -- none of which appear on Dashboard 1860 (Node Exporter Full). Every one generates series you pay for but never look at.

### Windows (n2-standard-2, 2 vCPU, 200 services)

| Configuration | Active Series |
|---|---|
| Bare minimum (4 collectors) | 16 |
| Dashboard-optimized (hardened, 5 layers) | 135 |
| Unfiltered (same 10 collectors, no filtering) | 2,909 |

The service collector alone accounts for **2,672 of those 2,909 unfiltered series** -- 92% of the total. That is 200 services x multiple states and modes, all shipped to your backend to sit in storage untouched.

### Where the Waste Comes From

The biggest waste categories:

| Source | Typical Waste | Example |
|--------|--------------|---------|
| Unused collectors | 100-500+ series | `node_xfs_*`, `node_btrfs_*`, `node_nfs_*` never queried |
| Service explosion (Windows) | 2,600+ series | 200 services x 8 states + start_modes + info |
| Virtual network interfaces | 50-200 series | `veth*`, `cali*`, `flannel.*` on container hosts |
| Container filesystem mounts | 50-500 series | `/var/lib/docker/*`, `/var/lib/containerd/*` |
| UUID-labeled devices | 20-100 series | Device-mapper names with full UUIDs |
| Hidden volumes (Windows) | 20-50 series | `HarddiskVolume*`, GUID volumes |

## The Dashboard Test

Here is the fundamental question to ask about every metric:

> **Does this metric power a panel in a dashboard, an alert rule, or a recording rule?**

If the answer is no, you are paying to collect, transmit, store, and index data that nobody looks at.

The hardened configs in this book are built by starting from specific dashboards and working backwards:

- **Linux**: [Node Exporter Full (Dashboard 1860)](https://grafana.com/grafana/dashboards/1860-node-exporter-full/) -- every panel was audited to determine the ~208 metric names it queries
- **Windows**: [Windows Exporter Dashboard 2025 (Dashboard 24390)](https://grafana.com/grafana/dashboards/24390-windows-exporter-dashboard-2025/) -- every panel was audited to determine the ~95 metric names it queries

If a metric name is not on the allow-list, it means no panel in the dashboard uses it. Dropping it costs you nothing in observability.

This is the dashboard test in practice. It transforms cardinality control from guesswork ("what can I safely drop?") into a mechanical process ("what does the dashboard actually query?").

## The Multiplicative Trap

The danger with cardinality is not any single metric. It is the multiplication across dimensions.

Consider adding one new label with 10 values to a metric that currently has 100 series:

```text
Before: 100 series
After:  100 x 10 = 1,000 series
```

A single label addition caused a 10x increase. Now imagine that label is unbounded -- like a user ID, request ID, or IP address:

```text
100 base series x 50,000 unique user IDs = 5,000,000 series
```

This is why the Grafana PS best-practice guides specifically call out these "dangerous label patterns":

- **User/Customer IDs**: creates a series per user
- **Request IDs / UUIDs**: creates a series per request
- **IP addresses**: thousands of series
- **Full URLs**: unbounded cardinality
- **Error messages**: unique variations create unique series
- **Timestamps in labels**: series grow with time

The hardened configs in this book address these patterns through Layer 2 (Pattern Block), which uses regex to catch and drop UUIDs, container paths, and other high-churn patterns before they reach your backend.

## Common Mistakes

**Scraping at 15-second intervals "just in case."** This quadruples your DPM (and cost) compared to 60-second intervals. Most infrastructure metrics do not change meaningfully in 15 seconds. The hardened configs use `scrape_interval = "60s"`.

**Enabling all collectors.** The node exporter and Windows exporter have many collectors enabled by default that produce metrics no standard dashboard uses. The hardened Linux config explicitly disables 14 unused collectors (`bcache`, `bonding`, `btrfs`, `fibrechannel`, `infiniband`, `ipvs`, `mdadm`, `nfs`, `nfsd`, `rapl`, `tapestats`, `udp_queues`, `xfs`, `zfs`).

**Using deny-lists instead of allow-lists.** A deny-list ("drop these metrics") means every new metric from an exporter upgrade passes through silently. An allow-list ("only keep these metrics") means upgrades never surprise you with unexpected series.

**Ignoring the service collector on Windows.** Without filtering, the Windows service collector generates 2,672 series from services alone. This is the single largest cardinality trap in Windows monitoring.

**Not filtering virtual/ephemeral devices.** Container hosts generate new `veth*` interfaces and `/var/lib/docker/*` mounts constantly. Each creates new series that churn and never stabilize.

## Summary

- A time series is one unique metric name + label combination
- Series count is multiplicative: more label values = exponentially more series
- Unfiltered hosts generate 3x-20x more series than hardened configs
- Cost scales linearly with active series count
- The dashboard test -- "does this metric power a panel?" -- is the foundation of cardinality control
- The 5-layer pattern in this chapter systematically eliminates waste while preserving every panel your dashboards need
- Production-ready implementations: [hardened-grafana-alloy-linux](https://github.com/scarolan/hardened-grafana-alloy-linux) and [hardened-grafana-alloy-windows](https://github.com/scarolan/hardened-grafana-alloy-windows)
