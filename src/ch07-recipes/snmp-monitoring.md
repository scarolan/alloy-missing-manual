# SNMP Monitoring

## When You Need SNMP

Network switches, routers, firewalls, load balancers, UPS units, NAS appliances, and printers have one thing in common: you cannot install an agent on them. There is no node_exporter for a Cisco switch and no windows_exporter for a NetApp filer. These devices expose their telemetry through SNMP (Simple Network Management Protocol), and Alloy's built-in `prometheus.exporter.snmp` component can query them.

If the device runs a standard operating system where you can install Alloy (Linux, Windows), use the host monitoring configs from [Starter Configs](starter-configs.md) instead. SNMP monitoring is for the infrastructure that has no other option.

Common SNMP monitoring targets:

| Device Type | What You Monitor | Example Metrics |
|---|---|---|
| Network switches | Port traffic, errors, status, PoE | Bytes in/out, CRC errors, port admin/oper status |
| Routers | Interface traffic, routing table, BGP | Interface utilization, route count, BGP peer state |
| Firewalls | Connections, throughput, policy hits | Active sessions, CPU, memory, policy deny counts |
| UPS / PDU | Battery, load, voltage, temperature | Battery charge %, output watts, input voltage |
| NAS appliances | Disk health, volume usage, IOPS | RAID status, pool usage %, read/write latency |
| Wireless APs | Client count, channel utilization, signal | Associated clients, noise floor, retransmissions |

## SNMP Versions: v2c vs v3

| Feature | SNMP v2c | SNMP v3 |
|---|---|---|
| **Authentication** | Community string (plaintext password) | Username + auth protocol (MD5, SHA) |
| **Encryption** | None | Optional (DES, AES) |
| **Deployment effort** | Minimal | Moderate |
| **When to use** | Lab, isolated management VLANs, devices that do not support v3 | Production networks, compliance requirements |

Most network equipment supports v2c. If your security policy requires encrypted SNMP traffic or your management VLAN is not isolated, use v3. The Alloy config supports both.

For the configs in this chapter, we use v2c with the community string stored in an environment variable via `sys.env()`. The community string never appears in the config file.

## The snmp.yml Module File

The SNMP exporter does not query arbitrary OIDs on the fly. It uses a **module file** (`snmp.yml`) that defines which OIDs to query, how to parse the results, and what metric names to produce. This file is the bridge between raw SNMP MIB trees and Prometheus-style metrics.

The upstream [snmp_exporter](https://github.com/prometheus/snmp_exporter) project maintains a default `snmp.yml` that covers common MIBs. The most important module for network monitoring is `if_mib`, which covers the standard interface MIB (RFC 2863) -- the universal set of port/interface metrics that virtually every network device supports.

### Where to Get snmp.yml

1. **Use the default** -- download the latest `snmp.yml` from the [snmp_exporter releases page](https://github.com/prometheus/snmp_exporter/releases). The default file includes modules for `if_mib`, `apcups`, `synology`, and many others.

2. **Generate a custom one** -- if you need vendor-specific MIBs (Cisco, Juniper, Arista, etc.), use the `snmp_exporter/generator` tool to build a custom `snmp.yml` from the MIB files. See the [generator documentation](https://github.com/prometheus/snmp_exporter/tree/main/generator).

### File Placement

Place `snmp.yml` in a location Alloy can read. Common paths:

| OS | Path |
|---|---|
| Linux | `/etc/alloy/snmp.yml` |
| Windows | `C:\Program Files\GrafanaLabs\Alloy\snmp.yml` |

## Complete Working Config: Monitoring Network Switches

This config monitors a set of network switches using the standard `if_mib` module. It reads the SNMP module file from disk, defines targets inline, and ships metrics to Grafana Cloud.

**Environment variables required:** `GCLOUD_RW_API_KEY`, `GRAFANA_METRICS_URL`, `GRAFANA_METRICS_USERNAME`, `SNMP_COMMUNITY`

**Additional environment variable:**

| Variable | Example Value | Notes |
|---|---|---|
| `SNMP_COMMUNITY` | `monitoring-ro` | SNMP v2c community string (read-only) |

```alloy
// =================================================================
// SNMP Monitoring -- Network Switches (if_mib)
// =================================================================
// Monitors network switches via SNMP v2c. Uses the standard if_mib
// module for interface metrics. Community string via sys.env().
// =================================================================

// --- Write Endpoint ---
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Load SNMP module file ---
local.file "snmp_modules" {
  filename = "/etc/alloy/snmp.yml"
}

// --- SNMP Exporter ---
prometheus.exporter.snmp "network_switches" {
  config = local.file.snmp_modules.content

  target "core-switch-01" {
    address     = "10.0.1.1"
    module      = "if_mib"
    auth        = "public_v2"
    walk_params = "standard"
  }

  target "core-switch-02" {
    address     = "10.0.1.2"
    module      = "if_mib"
    auth        = "public_v2"
    walk_params = "standard"
  }

  target "access-switch-01" {
    address     = "10.0.2.1"
    module      = "if_mib"
    auth        = "public_v2"
    walk_params = "standard"
  }

  target "access-switch-02" {
    address     = "10.0.2.2"
    module      = "if_mib"
    auth        = "public_v2"
    walk_params = "standard"
  }

  target "access-switch-03" {
    address     = "10.0.2.3"
    module      = "if_mib"
    auth        = "public_v2"
    walk_params = "standard"
  }

  walk_params "standard" {
    retries = 3
    timeout = "10s"
    max_repetitions = 25
  }

  auth "public_v2" {
    community = sys.env("SNMP_COMMUNITY")
  }
}

// --- Discovery + Relabel ---
discovery.relabel "network_switches" {
  targets = prometheus.exporter.snmp.network_switches.targets

  rule {
    target_label = "job"
    replacement  = "integrations/snmp"
  }

  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// --- Scrape ---
prometheus.scrape "network_switches" {
  targets         = discovery.relabel.network_switches.output
  forward_to      = [prometheus.relabel.network_switches.receiver]
  scrape_interval = "60s"
  scrape_timeout  = "30s"
}

// --- Cardinality Control ---
prometheus.relabel "network_switches" {
  forward_to = [prometheus.remote_write.metrics_service.receiver]

  // Allow-list: keep only the interface metrics we need
  rule {
    source_labels = ["__name__"]
    regex = join([
      "up",
      "snmp_scrape_duration_seconds",
      "snmp_scrape_pdus_returned",
      "snmp_scrape_walk_duration_seconds",

      // -- Interface status --
      "ifAdminStatus",
      "ifOperStatus",
      "ifType",
      "ifAlias",
      "ifDescr",
      "ifName",
      "ifIndex",
      "ifHighSpeed",
      "ifSpeed",
      "ifMtu",
      "ifLastChange",

      // -- Interface traffic (64-bit counters) --
      "ifHCInOctets",
      "ifHCOutOctets",
      "ifHCInUcastPkts",
      "ifHCOutUcastPkts",
      "ifHCInMulticastPkts",
      "ifHCOutMulticastPkts",
      "ifHCInBroadcastPkts",
      "ifHCOutBroadcastPkts",

      // -- Interface errors --
      "ifInErrors",
      "ifOutErrors",
      "ifInDiscards",
      "ifOutDiscards",

      // -- System info --
      "sysUpTime",
      "sysDescr",
      "sysName",
      "sysContact",
      "sysLocation",
    ], "|")
    action = "keep"
  }

  // Drop interfaces that are administratively down
  // (removes metrics for unused ports)
  rule {
    source_labels = ["ifAdminStatus"]
    regex         = "2"
    action        = "drop"
  }
}
```

## Config Components Explained

### local.file

```alloy
local.file "snmp_modules" {
  filename = "/etc/alloy/snmp.yml"
}
```

Reads the SNMP module file from disk. The content is passed to `prometheus.exporter.snmp` as the `config` parameter. If you update the file on disk, Alloy detects the change and reloads it automatically.

### target Blocks

Each `target` block defines one SNMP device to poll:

| Field | Required | Purpose |
|---|---|---|
| (label) | Yes | Unique name for this target (the string after `target`, e.g., `"core-switch-01"`) |
| `address` | Yes | IP address or hostname of the SNMP device |
| `module` | Yes | Which module from `snmp.yml` to use (e.g., `"if_mib"`) |
| `auth` | Yes | Which auth block to use for credentials |
| `walk_params` | No | Which walk_params block to use for SNMP transport settings |

### walk_params

Controls the SNMP transport behavior:

| Parameter | Value | Purpose |
|---|---|---|
| `retries` | `3` | Number of retries on timeout before giving up |
| `timeout` | `"10s"` | Timeout for each SNMP request |
| `max_repetitions` | `25` | How many OIDs to request per SNMP GETBULK (higher = faster walks, more memory) |

### auth (v2c)

```alloy
auth "public_v2" {
  community = sys.env("SNMP_COMMUNITY")
}
```

The community string is read from an environment variable. Never hardcode community strings in the config.

### auth (v3)

For SNMP v3 with authentication and encryption:

```alloy
auth "secure_v3" {
  security_level = "authPriv"
  username       = sys.env("SNMP_V3_USERNAME")
  auth_protocol  = "SHA"
  auth_password  = sys.env("SNMP_V3_AUTH_PASSWORD")
  priv_protocol  = "AES"
  priv_password  = sys.env("SNMP_V3_PRIV_PASSWORD")
}
```

| Security Level | Authentication | Encryption |
|---|---|---|
| `noAuthNoPriv` | No | No |
| `authNoPriv` | Yes (MD5 or SHA) | No |
| `authPriv` | Yes (MD5 or SHA) | Yes (DES or AES) |

## Multiple Device Types

Real networks have more than just switches. Here is how to monitor different device types by using different SNMP modules:

```alloy
// Switches use if_mib
target "core-switch-01" {
  address     = "10.0.1.1"
  module      = "if_mib"
  auth        = "public_v2"
  walk_params = "standard"
}

// UPS uses apcups module
target "ups-01" {
  address     = "10.0.10.1"
  module      = "apcups"
  auth        = "public_v2"
  walk_params = "standard"
}

// Synology NAS uses synology module
target "nas-01" {
  address     = "10.0.20.1"
  module      = "synology"
  auth        = "public_v2"
  walk_params = "standard"
}
```

Each device type uses a different module from `snmp.yml`. The upstream `snmp.yml` includes modules for many common device types. If your device is not covered, you need to generate a custom module (see the Custom MIBs section below).

## Walk vs Get: Performance Considerations

SNMP uses two main operations:

- **GET** -- request a specific OID. One request, one response. Fast and predictable.
- **WALK (GETNEXT / GETBULK)** -- traverse a subtree of OIDs. Multiple round-trips. Slower but discovers all entries.

The if_mib module uses WALK to discover all interfaces on a device. This is necessary because the number of interfaces varies per device. The walk operation is the most expensive part of SNMP polling.

### Performance Factors

| Factor | Impact | Mitigation |
|---|---|---|
| Number of interfaces per device | Each interface adds ~30 OID values to the walk | Filter unused interfaces in relabel rules |
| SNMP timeout | Slow devices cause scrape timeouts | Increase `walk_params.timeout` and `scrape_timeout` |
| `max_repetitions` | Higher = fewer round-trips but larger responses | Start at 25, increase for devices with many interfaces |
| Number of devices per exporter | Each device is polled sequentially within a scrape | Keep to 20-30 devices per exporter instance |

### Timing Budget

For a 60-second scrape interval, you need all SNMP walks to complete within the `scrape_timeout`. A rough guide:

| Device Count | Ports per Device | Estimated Walk Time | Recommended scrape_timeout |
|---|---|---|---|
| 5 | 24 | 5-10s | 15s |
| 10 | 48 | 15-30s | 45s |
| 20 | 48 | 30-60s | 60s (push scrape_interval to 120s) |
| 50+ | Mixed | 60s+ | Split across multiple exporter instances |

If walks consistently take more than half your scrape interval, either increase the interval or split the targets across multiple `prometheus.exporter.snmp` instances.

## Cardinality Considerations

SNMP monitoring can produce surprising cardinality. The math is straightforward:

```
series = devices x ports_per_device x metrics_per_port
```

### Real-World Example: 48-Port Switches

| Scenario | Devices | Ports | Metrics/Port | Total Series |
|---|---|---|---|---|
| 5 access switches, all ports | 5 | 48 | 15 | 3,600 |
| 10 access switches, all ports | 10 | 48 | 15 | 7,200 |
| 100 switches (campus network) | 100 | 48 | 15 | 72,000 |
| 100 switches, filtered to active ports only | 100 | ~20 avg | 15 | 30,000 |

At $8 per 1,000 active series per month:

| Scenario | Monthly Cost |
|---|---|
| 100 switches, all ports, 15 metrics | $576 |
| 100 switches, active ports only, 15 metrics | $240 |
| 100 switches, active ports only, 8 core metrics | $128 |

The three levers for controlling SNMP cardinality:

1. **Filter unused ports** -- drop interfaces where `ifAdminStatus = 2` (administratively down). This is included in the config above.
2. **Reduce metrics per port** -- the allow-list in the relabel rules controls which OIDs are kept. Start with traffic counters and error counters; add more only if your dashboards need them.
3. **Increase scrape interval** -- SNMP data on network switches does not change meaningfully in 15 seconds. A 60-second or 120-second interval is standard for network monitoring.

## Key Network Metrics

These are the most useful metrics from the `if_mib` module for network monitoring dashboards.

### Interface Traffic

| Metric | Type | What It Measures |
|---|---|---|
| `ifHCInOctets` | Counter | Bytes received on the interface (64-bit) |
| `ifHCOutOctets` | Counter | Bytes transmitted on the interface (64-bit) |
| `ifHCInUcastPkts` | Counter | Unicast packets received |
| `ifHCOutUcastPkts` | Counter | Unicast packets transmitted |

Always use the `ifHC*` (high capacity, 64-bit) counters instead of the 32-bit `ifIn*`/`ifOut*` counters. On a 10 Gbps link, a 32-bit counter wraps in about 3.4 seconds, producing meaningless rate calculations.

### Interface Errors

| Metric | Type | What It Measures |
|---|---|---|
| `ifInErrors` | Counter | Inbound packets with errors (CRC, framing, etc.) |
| `ifOutErrors` | Counter | Outbound packets with errors |
| `ifInDiscards` | Counter | Inbound packets discarded (buffer full, policy, etc.) |
| `ifOutDiscards` | Counter | Outbound packets discarded |

A non-zero error rate on a port usually indicates a physical layer problem (bad cable, SFP, speed/duplex mismatch).

### Interface Status

| Metric | Type | Values |
|---|---|---|
| `ifAdminStatus` | Gauge | 1 = up, 2 = down, 3 = testing |
| `ifOperStatus` | Gauge | 1 = up, 2 = down, 3 = testing, 5 = dormant, 6 = notPresent |
| `ifHighSpeed` | Gauge | Interface speed in Mbps |

The combination of `ifAdminStatus=1` (admin up) and `ifOperStatus=2` (oper down) is the classic "port is configured but the link is down" condition -- a common alerting target.

### System Info

| Metric | Type | What It Provides |
|---|---|---|
| `sysUpTime` | Gauge | Device uptime in hundredths of a second |
| `sysName` | Info metric | Device hostname |
| `sysDescr` | Info metric | Device model/firmware description |

## PromQL Examples for Network Monitoring

### Interface utilization (percentage of link speed):

```promql
rate(ifHCInOctets{job="integrations/snmp"}[5m]) * 8
/ (ifHighSpeed{job="integrations/snmp"} * 1e6) * 100
```

### Top 10 busiest ports by inbound traffic:

```promql
topk(10, rate(ifHCInOctets{job="integrations/snmp"}[5m]) * 8)
```

### Ports with errors in the last hour:

```promql
increase(ifInErrors{job="integrations/snmp"}[1h]) > 0
```

### Ports that are admin up but operationally down:

```promql
ifAdminStatus{job="integrations/snmp"} == 1
and
ifOperStatus{job="integrations/snmp"} == 2
```

## Custom MIBs

When the default `snmp.yml` does not cover your device, you need to generate a custom module from the vendor's MIB files.

### The Generator Workflow

1. **Obtain MIB files** from the vendor (usually available on the vendor's support portal or the device itself via `show mib` / `copy mib`).

2. **Install the generator tool:**
   ```bash
   go install github.com/prometheus/snmp_exporter/generator@latest
   ```

3. **Create a `generator.yml`** that defines which MIB modules to include:
   ```yaml
   modules:
     my_switch:
       walk:
         - ifMIB
         - 1.3.6.1.4.1.9.9.109  # Cisco CPU OIDs
       lookups:
         - source_indexes: [ifIndex]
           lookup: ifAlias
         - source_indexes: [ifIndex]
           lookup: ifDescr
       overrides:
         ifAlias:
           type: DisplayString
         ifDescr:
           type: DisplayString
   ```

4. **Run the generator:**
   ```bash
   generator generate
   ```
   This produces a new `snmp.yml` with your custom module.

5. **Deploy the generated `snmp.yml`** to the Alloy host and update the `local.file` path.

### MIB Version Matters

The MIB files used to generate `snmp.yml` must match the firmware version on the device. A MIB from firmware v15.x may define OIDs that do not exist in firmware v14.x (or vice versa). Mismatched MIBs result in SNMP walk timeouts and missing metrics.

## Testing and Debugging

### Test from the Alloy API

Alloy exposes component metrics via its HTTP API. You can check if SNMP scrapes are succeeding:

```bash
curl -s http://localhost:12345/api/v0/component/prometheus.exporter.snmp.network_switches/metrics | head -20
```

### Test SNMP Connectivity

Before configuring Alloy, verify that you can reach the device with `snmpwalk`:

```bash
# SNMP v2c
snmpwalk -v2c -c $SNMP_COMMUNITY 10.0.1.1 sysDescr

# SNMP v3
snmpwalk -v3 -l authPriv -u monitoring -a SHA -A authpass -x AES -X privpass 10.0.1.1 sysDescr
```

If `snmpwalk` times out, check:
- Firewall rules (SNMP uses UDP port 161)
- The community string or v3 credentials
- Whether the device has SNMP enabled and accessible from the Alloy host's network

### Common snmpwalk Output

A successful query returns something like:

```
SNMPv2-MIB::sysDescr.0 = STRING: Cisco IOS Software, C2960X Software (C2960X-UNIVERSALK9-M), Version 15.2(7)E9
```

If you get `Timeout: No Response from 10.0.1.1`, the device is not reachable via SNMP from the Alloy host.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Hardcoding the community string in the config | Secret visible in config files, backups, FM UI | Use `sys.env("SNMP_COMMUNITY")` |
| Using 32-bit counters (`ifInOctets`) instead of 64-bit (`ifHCInOctets`) | Counter wraps every few seconds on fast links, producing incorrect rate() values | Always use `ifHC*` counters in the allow-list |
| Monitoring all ports including admin-down | 48-port switch has ~24 unused ports generating zero-value metrics | Drop `ifAdminStatus=2` in relabel rules |
| MIB version mismatch with device firmware | Walk timeouts, missing metrics, wrong OID mappings | Regenerate `snmp.yml` from MIBs matching your firmware version |
| Scrape timeout shorter than SNMP walk time | Scrape fails, no metrics collected | Set `scrape_timeout` to at least 2x the expected walk duration |
| Too many devices in one exporter instance | Walks run sequentially, exceeding the scrape interval | Split targets across multiple `prometheus.exporter.snmp` instances (max 20-30 per instance) |
| Not testing with `snmpwalk` first | Hours of debugging config issues that are actually network/firewall problems | Always verify SNMP connectivity with `snmpwalk` before configuring Alloy |
| Forgetting UDP port 161 firewall rules | SNMP queries time out | Open UDP 161 from the Alloy host to the SNMP targets |

## Summary

- `prometheus.exporter.snmp` is built into Alloy -- no external snmp_exporter binary needed
- SNMP monitoring is for devices where you cannot install an agent (switches, routers, firewalls, UPS, NAS)
- The `snmp.yml` module file defines which OIDs to query; `if_mib` covers standard interface metrics
- Community strings and v3 credentials go in environment variables via `sys.env()`, never in the config file
- Cardinality scales as `devices x ports x metrics` -- a 100-switch campus can easily produce 30,000-72,000 series
- Control cardinality by filtering admin-down ports, using an allow-list, and setting appropriate scrape intervals
- Always test SNMP connectivity with `snmpwalk` before configuring Alloy
- Use 64-bit counters (`ifHC*`) for traffic metrics on modern networks
