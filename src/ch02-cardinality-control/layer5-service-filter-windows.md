# Layer 5: Service Filter (Windows)

This is the single biggest cardinality trap on Windows. Without filtering, the Windows service collector alone generates **2,672 series** on a standard server -- more than all other collectors combined. The hardened config reduces this to **~24 series**.

This layer only applies to Windows. Linux does not have an equivalent service-state explosion (systemd filtering is handled at the collector level; see Chapter 4).

## The Problem: Services x States = Explosion

A standard Windows Server 2022 installation runs approximately 200 services. The Windows exporter's `service` collector generates `windows_service_state` with a `state` label that has 7 possible values for each service:

- `running`
- `stopped`
- `start pending`
- `stop pending`
- `continue pending`
- `pause pending`
- `paused`

Additionally, it generates:

- `windows_service_start_mode` with 5 modes per service (`auto`, `manual`, `disabled`, `auto (delayed)`, `auto (trigger)`)
- `windows_service_info` with 1 series per service
- `windows_service_status` with 1 series per service

The unfiltered math on a server with 200 services:

| Metric | Calculation | Series |
|--------|------------|--------|
| `windows_service_state` | 200 services x 7 states | 1,400 |
| `windows_service_start_mode` | 200 services x 5 modes | 1,000 |
| `windows_service_info` | 200 services x 1 | 200 |
| `windows_service_process` | 72 (varies) | 72 |
| **Total** | | **2,672** |

That is **92% of the total 2,909 unfiltered series** from a standard Windows server.

## The Filtered Math

The hardened config:

- Monitors **12 essential services** (not 200)
- Keeps only **2 states**: `running` and `stopped` (not 8)

| Metric | Calculation | Series |
|--------|------------|--------|
| `windows_service_state` | 12 services x 2 states | 24 |
| `windows_service_start_mode` | 12 services x ~2 modes | ~15 |
| `windows_service_info` | 12 services | 12 |
| `windows_service_status` | 12 services | 12 |
| **Total** | | **~24** (state) + supporting metrics |

From 2,672 series to ~24. That is a **99% reduction** in service-related cardinality.

## The Default Essential Services

The hardened config monitors these 12 services by default:

| Service Name | Description | Why It's Essential |
|-------------|-------------|-------------------|
| `windefend` | Windows Defender | Security -- antivirus must be running |
| `alloy` | Grafana Alloy | Monitoring agent -- meta-monitoring |
| `winrm` | Windows Remote Management | Remote management access |
| `w32time` | Windows Time | Time synchronization -- critical for log correlation |
| `wuauserv` | Windows Update | Patch compliance |
| `eventlog` | Windows Event Log | Logging infrastructure |
| `dhcp` | DHCP Client | Network configuration |
| `dnscache` | DNS Client | Name resolution |
| `lanmanserver` | Server (SMB) | File sharing and SMB access |
| `lanmanworkstation` | Workstation (SMB Client) | SMB client for accessing shares |
| `mpssvc` | Windows Firewall | Network security |
| `bits` | Background Intelligent Transfer | Windows Update delivery, SCCM |

To add your own services, append them to the regex:

```text
"windows_service_state@(windefend|alloy|winrm|w32time|...|my_custom_svc)"
```

## The `__keepme` Temp-Label Technique

The service filter cannot be done with a simple `keep` or `drop` rule because it needs to apply **only** to `windows_service_state` metrics. A `keep` rule on the `name` label would affect ALL metrics in the pipeline. A `drop` rule on specific service names would require listing every service you want to drop (hundreds of them).

The solution is a multi-step technique using temporary labels (prefixed with `__`) as intermediate state. Prometheus-style relabeling drops all `__`-prefixed labels before the final write, so they never reach your backend.

Here is the complete technique, step by step:

### Step 1: Tag Monitored Services with `__keepme`

```alloy
// Step 2a: Tag service metrics for monitored services
rule {
    source_labels = ["__name__", "name"]
    separator     = "@"
    regex         = "windows_service_state@(windefend|alloy|winrm|w32time|wuauserv|eventlog|dhcp|dnscache|lanmanserver|lanmanworkstation|mpssvc|bits)"
    target_label  = "__keepme"
    replacement   = "1"
}
```

**What happens:** For every `windows_service_state` metric where the `name` label matches one of the 12 monitored services, a temporary label `__keepme` is set to `"1"`.

**Why `@` separator:** The default separator is `;`, but service names could theoretically contain semicolons. Using `@` as the separator and matching `windows_service_state@servicename` makes the pattern unambiguous.

**After this step:**
- `windows_service_state{name="windefend", state="running"}` has `__keepme="1"`
- `windows_service_state{name="spooler", state="running"}` has no `__keepme` label

### Step 2: Drop Untagged Service State Metrics

```alloy
// Step 2b: Drop service_state for non-monitored services
rule {
    source_labels = ["__name__", "__keepme"]
    separator     = "@"
    regex         = "windows_service_state@"
    action        = "drop"
}
```

**What happens:** This drops any `windows_service_state` metric where `__keepme` is empty (not set). The regex `windows_service_state@` matches when `__keepme` is empty -- the `@` is immediately followed by end of string.

Metrics that have `__keepme="1"` produce the concatenated value `windows_service_state@1`, which does NOT match `windows_service_state@` (there is content after `@`).

**After this step:** Only the 12 monitored services remain.

### Step 3: Clean Up the Temp Label

```alloy
// Step 2c: Clean up temp label
rule {
    source_labels = ["__name__"]
    regex         = "windows_service_state"
    target_label  = "__keepme"
    replacement   = ""
}
```

**What happens:** For all surviving `windows_service_state` metrics, clear the `__keepme` label. This is technically optional (labels starting with `__` are dropped before remote write), but cleaning up explicitly makes the pipeline behavior clear and prevents interference with later rules.

### Step 4: Tag Desired States with `__keepme2`

```alloy
// Step 2d: Tag service metrics for desired states
rule {
    source_labels = ["__name__", "state"]
    separator     = "@"
    regex         = "windows_service_state@(running|stopped)"
    target_label  = "__keepme2"
    replacement   = "1"
}
```

**What happens:** Of the surviving 12 services, tag those in `running` or `stopped` state with `__keepme2="1"`. This discards the 6 other states (start pending, stop pending, continue pending, pause pending, paused, unknown) which are transient and rarely useful for monitoring.

### Step 5: Drop Undesired States

```alloy
// Step 2e: Drop service_state for non-desired states
rule {
    source_labels = ["__name__", "__keepme2"]
    separator     = "@"
    regex         = "windows_service_state@"
    action        = "drop"
}
```

**What happens:** Same pattern as Step 2 -- drop `windows_service_state` metrics where `__keepme2` is empty (meaning the state was not `running` or `stopped`).

### Step 6: Clean Up Second Temp Label

```alloy
// Step 2f: Clean up temp label
rule {
    source_labels = ["__name__"]
    regex         = "windows_service_state"
    target_label  = "__keepme2"
    replacement   = ""
}
```

### Steps 7-9: Apply Same Filter to Other Service Metrics

The same service-name filter (but not the state filter) is applied to `windows_service_start_mode`, `windows_service_status`, and `windows_service_info`:

```alloy
// Apply same service name filter to windows_service_start_mode, _status, _info
rule {
    source_labels = ["__name__", "name"]
    separator     = "@"
    regex         = "windows_service_(start_mode|status|info)@(windefend|alloy|winrm|w32time|wuauserv|eventlog|dhcp|dnscache|lanmanserver|lanmanworkstation|mpssvc|bits)"
    target_label  = "__keepme3"
    replacement   = "1"
}

rule {
    source_labels = ["__name__", "__keepme3"]
    separator     = "@"
    regex         = "windows_service_(start_mode|status|info)@"
    action        = "drop"
}

rule {
    source_labels = ["__name__"]
    regex         = "windows_service_(start_mode|status|info)"
    target_label  = "__keepme3"
    replacement   = ""
}
```

These three metrics do not have a `state` label, so they only need the service-name filter, not the state filter. The `__keepme3` label avoids collision with the `__keepme`/`__keepme2` labels used in the state filtering steps.

## Why Not Just Use `keep`?

You might wonder: why not simply use `action = "keep"` with a regex matching the desired services?

```alloy
// THIS WOULD BE WRONG -- DO NOT USE
rule {
    source_labels = ["name"]
    regex         = "(windefend|alloy|winrm|...)"
    action        = "keep"
}
```

The problem: `keep` applies to ALL metrics in the pipeline, not just service metrics. CPU metrics, memory metrics, disk metrics -- none of them have a `name` label, so the regex would not match them, and they would all be dropped.

The `__keepme` technique scopes the filter to specific metric names (`windows_service_state`, `windows_service_start_mode`, etc.) while leaving all other metrics untouched.

## Why Two Filtering Passes?

The service filter uses two independent filtering passes (services, then states) rather than a single combined regex. This is intentional:

1. **Readability**: The service list and state list are separate concerns. Combining them into one regex like `windows_service_state@(windefend|alloy|...)@(running|stopped)` would require a triple-label source and be harder to maintain.
2. **Flexibility**: You might want to keep all 8 states for debugging. Just remove Steps 4-6. Or you might want different state filters for different services. Two separate passes make customization straightforward.
3. **The secondary metrics**: `start_mode`, `status`, and `info` need the service filter but NOT the state filter (they do not have a `state` label). Keeping the passes separate means you reuse the service list without entangling state logic.

## Customizing the Service List

To add monitoring for SQL Server and IIS:

1. Add the service names to all three regex patterns:

```text
// In Step 2a (service_state):
"windows_service_state@(windefend|alloy|...|bits|mssqlserver|w3svc)"

// In Steps 7-9 (start_mode/status/info):
"windows_service_(start_mode|status|info)@(windefend|alloy|...|bits|mssqlserver|w3svc)"
```

2. The series impact: each new service adds ~2 `windows_service_state` series (running + stopped) plus ~3-4 supporting series. Adding 2 services adds approximately 10 series total.

To find the correct service name, run on the Windows host:

```powershell
Get-Service | Select-Object Name, DisplayName, Status | Sort-Object Name
```

Use the `Name` column value (not `DisplayName`) in the regex.

## Common Mistakes

**Filtering services but not states.** If you only filter by service name but keep all 8 states, you still get `12 services x 8 states = 96` series instead of `12 x 2 = 24`. Always filter both dimensions.

**Forgetting to update all three regex groups.** The service name list appears in three places: `windows_service_state` (Step 1), and `windows_service_(start_mode|status|info)` (Step 7). If you add a service to one but not the other, you get inconsistent data.

**Using service DisplayNames instead of Names.** Windows services have both a `Name` (e.g., `wuauserv`) and a `DisplayName` (e.g., `Windows Update`). The exporter uses the `Name`. Using the DisplayName in the regex will not match.

## Summary

- The Windows service collector is the #1 cardinality trap: 200 services x 7 states = 1,400 series
- The hardened config filters to 12 essential services x 2 states = ~24 series (99% reduction)
- The `__keepme` temp-label technique enables metric-name-scoped filtering without affecting other metrics in the pipeline
- The filter uses two passes: service name filtering, then state filtering
- The same service-name filter is applied to `start_mode`, `status`, and `info` metrics
- Temporary `__` labels are automatically dropped before remote write
- Complete production config with all 5 layers: [hardened-grafana-alloy-windows](https://github.com/scarolan/hardened-grafana-alloy-windows)
