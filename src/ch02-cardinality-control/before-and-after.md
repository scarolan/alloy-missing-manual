# Before and After: Unfiltered vs Hardened

This page presents the concrete numbers. No theory, no "it depends" -- real series counts from real hosts, with the math for scaling to your fleet.

## Linux: Node Exporter

Benchmarked on a Linux t3.micro (1 vCPU, 1 GB RAM, 1 disk, 1 NIC):

| Configuration | Active Series | Unique Metric Names | Description |
|---|---|---|---|
| Bare minimum (CPU/Disk/Mem/Net) | **11** | ~7 | Just enough to answer "is this host alive?" |
| Dashboard-optimized (hardened) | **~50** | ~206 | Full Dashboard 1860 coverage, all 4 layers active |
| Unfiltered (all default collectors) | **337** | ~300+ | Every default collector enabled, no filtering |

The hardened config ships 206 metric names but only ~50 series on a minimal VM because most of those names are singleton metrics (no per-device label multiplication). On larger hosts with more CPUs, disks, and NICs, series grow predictably.

A typical cloud VM (2-4 vCPU, 2 disks, 2 NICs) lands at **400-600 series** with the hardened config.

### Where the Linux Savings Come From

| What's eliminated | How | Series saved |
|---|---|---|
| Unused collectors (bcache, btrfs, xfs, nfs, zfs, etc.) | Layer 1: Allow-list + disabled collectors | 50-150+ |
| Virtual network interfaces (veth, cali, flannel) | Layer 2: Pattern block + collector-level netdev exclusion | 0-200+ per container host |
| Ephemeral filesystem types (tmpfs, overlay, squashfs) | Layer 2: Pattern block + collector-level fs_types_exclude | 20-140+ |
| UUID-named devices/mounts | Layer 2: UUID regex | 10-100+ |
| Container storage paths | Layer 2: `/var/lib/docker/*` pattern | 0-700+ per container host |
| Systemd service explosion | Collector-level unit_include filter | ~675 (150 units x 5 states reduced to 15 units x 5 states) |

## Windows: Windows Exporter

Benchmarked on a Windows Server 2022 Datacenter (2 vCPUs, 8 GB RAM, 1 disk, 1 NIC, 200 services):

| Configuration | Active Series | Unique Metric Names | Description |
|---|---|---|---|
| Bare minimum (4 collectors) | **16** | 7 | CPU, memory, disk, network only |
| **Hardened (this config)** | **135** | ~70 | Full Dashboard 24390 coverage, all 5 layers |
| Unfiltered (same 10 collectors, no filtering) | **2,909** | ~110 | Service collector explodes to 2,672 series |

The hardened config provides complete dashboard coverage at **4.6% of the unfiltered series count**.

### Hardened Windows Breakdown (135 series)

| Category | Series | Key Metrics |
|---|---|---|
| CPU | ~24 | time_total, interrupts, dpcs, frequency, performance, utility (per core) |
| Memory | ~19 | available, physical, cache, pool, standby, swap, page faults |
| Logical disk | ~13 | free, size, reads, writes, latency, idle, split_ios, queued |
| Network | ~10 | bytes in/out, packets, errors, discards, bandwidth |
| Service | ~24 | 12 services x 2 states (running/stopped) + start_mode + info |
| System | ~7 | context switches, exceptions, processes, threads, queue length |
| Disk drive | ~13 | info, status, size |
| OS | ~2 | info, hostname |
| Pagefile | ~1 | limit_bytes |
| Time | ~2 | NTP offset, round trip delay |
| Exporter | ~21 | build_info, collector_duration (x10), collector_success (x10) |
| Up | 1 | Scrape target health |
| **Total** | **~135** | |

### Where the Windows Savings Come From

| What's eliminated | How | Series saved |
|---|---|---|
| Service explosion (200 services x states/modes) | Layer 5: Service filter | **2,672 to ~24** |
| Virtual NICs (isatap, Teredo, vEthernet, 6to4, WFP) | Layer 2: Pattern block | 10-50+ per host |
| Hidden volumes (HarddiskVolume, GUID volumes) | Layer 2: Pattern block | 10-30 |
| _Total pseudo-instances (disk and network) | Layer 2: Pattern block | ~23 (13 disk + 10 network) |
| Unused metric names | Layer 1: Allow-list | Varies |

The service filter alone accounts for **96% of the savings** (2,648 of 2,774 eliminated series).

## How Series Scale with Hardware

Both configs scale predictably with hardware. The scaling factors from benchmarks:

### Linux Scaling

| Additional Hardware | Additional Series | Source |
|---|---|---|
| +1 CPU core | ~+5 series | `node_cpu_seconds_total` (8 modes), `node_cpu_scaling_*`, schedstat |
| +1 disk device | ~+10 series | 14 `node_disk_*` metrics per device |
| +1 NIC | ~+5 series | ~21 `node_network_*` metrics but many are singleton |
| +1 filesystem mount | ~+7 series | 7 `node_filesystem_*` metrics per mountpoint |
| +1 systemd service (if in unit_include) | ~+5 series | `node_systemd_unit_state` (5 states) |

### Windows Scaling

| Additional Hardware | Additional Series | Source |
|---|---|---|
| +1 CPU core | ~+5 series | `windows_cpu_time_total` (5 modes), frequency, interrupts |
| +1 disk volume | ~+13 series | 13 `windows_logical_disk_*` metrics per volume |
| +1 physical NIC | ~+10 series | 10 `windows_net_*` metrics per NIC |
| +1 monitored service | ~+4-5 series | state (2) + start_mode + info + status |

### Hardware Profile Estimates (Windows)

| Hardware Profile | Expected Series | Notes |
|---|---|---|
| Small cloud VM (2 vCPU, 1 disk, 1 NIC) | 130-150 | Benchmark baseline |
| Mid-range server (8 vCPU, 2 disks, 1 NIC) | 175-225 | +40 CPU, +13 disk |
| Large server (16 vCPU, 4 disks, 2 NICs) | 250-325 | +70 CPU, +39 disk, +10 net |
| Domain controller (8 vCPU, 2 disks, 3 NICs) | 200-275 | More NICs, more services if customized |

A real-world production deployment validated at approximately **190 active series per host** on mid-range servers, consistent with these estimates.

### Hardware Profile Estimates (Linux)

| Hardware Profile | Expected Series | Notes |
|---|---|---|
| Minimal cloud VM (1 vCPU, 1 disk, 1 NIC) | ~50 | t3.micro baseline |
| Small cloud VM (2 vCPU, 1 disk, 1 NIC) | 400-500 | Typical starting point |
| Mid-range server (8 vCPU, 4 disks, 2 NICs) | 500-650 | Per-device metrics scale up |
| Large server (32 vCPU, 8 disks, 4 NICs) | 700-900 | CPU metrics dominate |
| Container host (4 vCPU, many mounts/interfaces) | 450-600 | Layers 2-4 prevent container sprawl |

## Fleet Math

Here is where cardinality control translates directly to money. At **$8 per 1,000 active series per month**:

### Windows Fleet (100 servers, mid-range hardware)

| Configuration | Series/Host | Fleet Total | Monthly Cost |
|---|---|---|---|
| Unfiltered | 2,909 | 290,900 | **$2,327** |
| Hardened | ~190 | 19,000 | **$152** |
| **Savings** | | 271,900 | **$2,175/mo ($26,100/yr)** |

### Linux Fleet (500 servers, typical cloud VMs)

| Configuration | Series/Host | Fleet Total | Monthly Cost |
|---|---|---|---|
| Default collectors, no filtering | ~2,000 | 1,000,000 | **$8,000** |
| Hardened | ~500 | 250,000 | **$2,000** |
| **Savings** | | 750,000 | **$6,000/mo ($72,000/yr)** |

### Mixed Fleet (1,000 Linux + 200 Windows)

| Configuration | Fleet Total | Monthly Cost |
|---|---|---|
| Unfiltered | 2,000,000 + 581,800 = 2,581,800 | **$20,654** |
| Hardened | 500,000 + 38,000 = 538,000 | **$4,304** |
| **Savings** | 2,043,800 | **$16,350/mo ($196,200/yr)** |

## Linux vs Windows: Side-by-Side Comparison

| Dimension | Linux (1 vCPU) | Windows (2 vCPU) |
|---|---|---|
| Bare minimum series | 11 | 16 |
| Dashboard-optimized series | ~50 | 135 |
| Unfiltered series | 337 | 2,909 |
| Reduction ratio | 6.7x | 21.5x |
| Primary savings source | Unused collectors + allow-list | Service filter (92% of waste) |
| Dashboard | Node Exporter Full (1860) | Windows Exporter 2025 (24390) |
| Allow-list size | 208 metric names | 95 metric names |
| Protection layers | 4 | 5 (extra: service filter) |

Windows produces roughly 2-3x more series than Linux for equivalent monitoring coverage, driven primarily by per-core CPU metrics and the service collector.

## How to Measure Your Own Counts

### From Grafana Cloud

Query the active series for a specific host:

```promql
count({instance="your-hostname", job="integrations/node_exporter"})
```

```promql
count({instance="your-hostname", job="integrations/windows_exporter"})
```

### From the Alloy Web UI

Alloy exposes its own metrics at `http://localhost:12345/metrics`. Look for:

```promql
prometheus_remote_write_wal_samples_appended_total
```

This shows the total samples being sent. Divide by your scrape interval to get approximate active series.

### From Prometheus (self-hosted)

```promql
count by (job) ({__name__=~".+"})
```

This shows active series grouped by job, letting you compare before and after applying the hardened config.

### The Benchmark Methodology

The numbers in this chapter come from controlled benchmarks:

- **Platform**: GCP VMs (Linux: various distros; Windows: Server 2022 Datacenter)
- **Measurement**: Active series counted via Prometheus API using `count({instance="...", job="..."})`
- **Staleness**: Each configuration ran for 7+ minutes (longer than the 5-minute Prometheus staleness window) to ensure clean per-configuration counts
- **Scrape interval**: 60 seconds (1 DPM)

## Summary

- Unfiltered Windows: 2,909 series. Hardened: 135. Ratio: 21.5x.
- Unfiltered Linux (default collectors): 337+ series. Hardened: 400-600 on typical VMs (more metric names but controlled cardinality).
- Series scale linearly: +5/CPU core, +10-13/disk, +5-10/NIC
- At $8/1k series, a mixed fleet of 1,200 hosts saves ~$196,000/year with hardened configs
- The Windows service filter is the single highest-ROI optimization: 2,672 series to ~24
- Measure your own counts with `count({instance="...", job="..."})` and compare against these benchmarks
- Complete hardened configs with test suites and deployment guides: [Linux](https://github.com/scarolan/hardened-grafana-alloy-linux) | [Windows](https://github.com/scarolan/hardened-grafana-alloy-windows)
