# Windows: Service Cardinality

## The Biggest Cardinality Problem on Windows

The Windows service collector is the single largest source of metric cardinality on a Windows host. This is not a hypothetical concern -- it is the dominant cost driver, often producing more series than all other collectors combined.

A standard Windows Server 2022 has approximately 200 installed services. The `windows_exporter` generates state metrics for each service across 8 possible state values (running, stopped, start pending, stop pending, continue pending, pause pending, paused, unknown).

### The Math Without Filtering

| Metric | Calculation | Series |
|---|---|---|
| `windows_service_state` | 200 services x 7 states | **1,400** |
| `windows_service_start_mode` | 200 services x 5 modes | **1,000** |
| `windows_service_info` | 200 services x 1 | **200** |
| `windows_service_process` | ~72 running services | **72** |
| **Total from services** | | **~2,672** |

For context, the entire hardened config (with service filtering) ships **~135 series total** on a typical 2-vCPU host. Without filtering, services alone produce **20x** that number.

From the [Windows metrics benchmark](https://github.com/scarolan/hardened-grafana-alloy-windows/blob/main/docs/windows-metrics-benchmark.md): the unfiltered config produced 2,909 total series on a test VM, of which 2,672 (92%) came from service metrics.

## How the Hardened Config Fixes This

The fix has two parts, implemented as Layer 2 in the relabeling pipeline (see [Chapter 2: Layer 5 -- Service Filter](../../ch02-cardinality-control/layer5-service-filter-windows.md) for the full cardinality-control context).

### Part A: Filter to Essential Services Only

Only keep metrics for services you actually care about:

```alloy
// Tag service metrics for monitored services
rule {
  source_labels = ["__name__", "name"]
  separator     = "@"
  regex         = "windows_service_state@(windefend|alloy|winrm|w32time|wuauserv|eventlog|dhcp|dnscache|lanmanserver|lanmanworkstation|mpssvc|bits)"
  target_label  = "__keepme"
  replacement   = "1"
}

// Drop service_state for non-monitored services
rule {
  source_labels = ["__name__", "__keepme"]
  separator     = "@"
  regex         = "windows_service_state@"
  action        = "drop"
}

// Clean up temp label
rule {
  source_labels = ["__name__"]
  regex         = "windows_service_state"
  target_label  = "__keepme"
  replacement   = ""
}
```

The default set of 12 monitored services:

| Service Name | Description |
|---|---|
| `windefend` | Windows Defender |
| `alloy` | Grafana Alloy (monitor the monitor) |
| `winrm` | Windows Remote Management |
| `w32time` | Windows Time |
| `wuauserv` | Windows Update |
| `eventlog` | Windows Event Log |
| `dhcp` | DHCP Client |
| `dnscache` | DNS Client |
| `lanmanserver` | Server (SMB) |
| `lanmanworkstation` | Workstation (SMB Client) |
| `mpssvc` | Windows Firewall |
| `bits` | Background Intelligent Transfer Service |

### Part B: Filter to Relevant States Only

Of the 8 possible states, only `running` and `stopped` are operationally useful for alerting:

```alloy
// Tag service metrics for desired states
rule {
  source_labels = ["__name__", "state"]
  separator     = "@"
  regex         = "windows_service_state@(running|stopped)"
  target_label  = "__keepme2"
  replacement   = "1"
}

// Drop service_state for non-desired states
rule {
  source_labels = ["__name__", "__keepme2"]
  separator     = "@"
  regex         = "windows_service_state@"
  action        = "drop"
}

// Clean up temp label
rule {
  source_labels = ["__name__"]
  regex         = "windows_service_state"
  target_label  = "__keepme2"
  replacement   = ""
}
```

The same service-name filter is also applied to `windows_service_start_mode`, `windows_service_status`, and `windows_service_info` to ensure no unfiltered service metrics leak through.

### Result

| Configuration | Service Series | Total Series |
|---|---|---|
| Unfiltered | **~2,672** | ~2,909 |
| Hardened (12 services x 2 states) | **~24** | ~135 |

A 99% reduction in service metric cardinality.

## Customizing the Service List

To add your own services, edit the regex in all three rule groups (service_state, start_mode/status/info):

```alloy
regex = "windows_service_state@(windefend|alloy|winrm|w32time|wuauserv|eventlog|dhcp|dnscache|lanmanserver|lanmanworkstation|mpssvc|bits|mssqlserver|iisadmin)"
```

Each additional service adds approximately 2-4 series (state metrics for running + stopped, plus start_mode and info).

## How Series Scale

From the benchmark data:

| Hardware Profile | Expected Series (Hardened) | Notes |
|---|---|---|
| Small cloud VM (2 vCPU, 1 disk, 1 NIC) | 130-150 | Benchmark baseline |
| Mid-range server (8 vCPU, 2 disks, 1 NIC) | 175-225 | +40 from CPU, +13 from disk |
| Large server (16 vCPU, 4 disks, 2 NICs) | 250-325 | +70 CPU, +39 disk, +10 net |

Series scale with cores (~5 per core), disks (~13 per volume), and NICs (~10 per physical NIC). Service filtering keeps the service contribution constant regardless of how many services are installed.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Enabling the service collector without filtering | ~2,672 extra series per host | Add Layer 2 service filter rules |
| Filtering service_state but forgetting start_mode/info | Partial savings only | Apply the same service-name regex to all service metric families |
| Adding too many services to the filter | Gradual cardinality creep | Budget ~4 series per additional service |
