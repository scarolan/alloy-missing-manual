# Linux: Journal Logs

## Overview

On modern Linux, the systemd journal is the primary log source. `loki.source.journal` reads from the journal and forwards log entries to Loki. By default it ships everything -- the equivalent of `journalctl -f` piped to the cloud. That works, but logs can become the dominant cost driver at scale.

This page covers the complete journal log collection pipeline: the source component, relabel rules for extracting journal metadata, and the three main cost-control levers (priority filtering, unit filtering, and rate limiting).

## The Complete Pipeline

The hardened Linux config uses a `declare` module to keep the journal pipeline self-contained:

```alloy
// Relabel rules to add job and instance labels
loki.relabel "integrations_node_exporter" {
  forward_to = [loki.write.grafana_cloud_loki.receiver]
  rule {
    target_label = "job"
    replacement  = "integrations/node_exporter"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// Invoke the journal module
journal_module "integrations_node_exporter" {
  forward_to = [loki.relabel.integrations_node_exporter.receiver]
}

// The journal module declaration
declare "journal_module" {
  argument "forward_to" {
    optional = false
  }

  loki.source.journal "default" {
    max_age    = "12h0m0s"
    forward_to = [loki.process.default.receiver]
    relabel_rules = loki.relabel.default.rules
  }

  loki.relabel "default" {
    rule {
      source_labels = ["__journal__systemd_unit"]
      target_label  = "unit"
    }
    rule {
      source_labels = ["__journal__boot_id"]
      target_label  = "boot_id"
    }
    rule {
      source_labels = ["__journal__transport"]
      target_label  = "transport"
    }
    rule {
      source_labels = ["__journal_priority_keyword"]
      target_label  = "level"
    }

    forward_to = []
  }

  loki.process "default" {
    forward_to = argument.forward_to.value
  }
}
```

## Key Components Explained

### loki.source.journal

The source component that reads from the systemd journal.

| Parameter | Value | Purpose |
|---|---|---|
| `max_age` | `"12h0m0s"` | Only read journal entries from the last 12 hours. Prevents shipping a flood of old logs when Alloy restarts. |
| `forward_to` | `[loki.process.default.receiver]` | Sends entries through the processing pipeline |
| `relabel_rules` | `loki.relabel.default.rules` | Extracts journal metadata fields into Loki labels |

**Why `max_age` matters:** without it, a fresh Alloy install or a restart after a long outage will attempt to ship the entire journal history. On a busy server, that can be gigabytes of logs hitting Loki all at once.

### Relabel Rules (Journal Metadata)

The journal attaches structured metadata to every entry. The relabel rules extract the most useful fields into Loki labels:

| Journal Field | Loki Label | What It Contains |
|---|---|---|
| `__journal__systemd_unit` | `unit` | The systemd unit that generated the log (e.g., `sshd.service`) |
| `__journal__boot_id` | `boot_id` | Unique ID for the current boot session |
| `__journal__transport` | `transport` | How the entry reached the journal (`stdout`, `syslog`, `journal`, `kernel`) |
| `__journal_priority_keyword` | `level` | Human-readable priority: `emerg`, `alert`, `crit`, `err`, `warning`, `notice`, `info`, `debug` |

## Cost Control: Three Levers

### Lever 1: Filter by Priority

Drop low-priority (noisy) entries, keep warnings and above. Journal priorities follow syslog conventions:

| Priority | Keyword | Keep? |
|---|---|---|
| 0 | `emerg` | Yes |
| 1 | `alert` | Yes |
| 2 | `crit` | Yes |
| 3 | `err` | Yes |
| 4 | `warning` | Yes |
| 5 | `notice` | Depends |
| 6 | `info` | Usually no |
| 7 | `debug` | No |

Add this block inside `loki.process`:

```alloy
loki.process "default" {
  stage.match {
    selector = "{level=~\"info|debug|notice\"}"
    action   = "drop"
  }

  forward_to = argument.forward_to.value
}
```

This typically reduces log volume by 60-80% on most servers, because the majority of journal entries are informational.

### Lever 2: Filter by Unit

Only ship logs from specific services. Add this rule inside `loki.relabel "default"`:

```alloy
rule {
  source_labels = ["__journal__systemd_unit"]
  regex         = "(sshd?\\.service|crond?\\.service|alloy\\.service|docker\\.service|kubelet\\.service|kernel)"
  action        = "keep"
}
```

Everything not matching the regex is dropped before it reaches Loki. This is the most aggressive cost-control option -- you see only the services you explicitly list.

### Lever 3: Rate Limit

Cap log throughput per stream as a safety net against log storms (crash loops, debug logging left on, etc.):

```alloy
loki.process "default" {
  stage.limit {
    rate  = 100   // lines per second per stream
    burst = 500   // burst allowance
    drop  = true  // drop excess lines (vs backpressure)
  }

  forward_to = argument.forward_to.value
}
```

Rate limiting operates per unique label combination (per stream). A host with 20 units generates 20 streams, each independently rate-limited.

## The stage.drop Safety Net

The gist-based starter config includes an additional safety net: `stage.drop` with an `older_than` parameter. This catches entries that somehow bypassed the `max_age` filter (e.g., from a backfilled journal):

```alloy
loki.process "drop_old" {
  forward_to = [loki.write.grafana_cloud_loki.receiver]
  stage.drop {
    older_than          = "4h"
    drop_counter_reason = "too old"
  }
}
```

This is belt-and-suspenders: `max_age` on the source prevents reading old entries; `stage.drop` in the pipeline catches anything that slips through. The `drop_counter_reason` label lets you monitor how many entries are being dropped.

## Combining Multiple Levers

You can stack all three controls. Here is a complete `loki.process` block with priority filtering, rate limiting, and the old-entry safety net:

```alloy
loki.process "default" {
  // Drop debug and info level entries
  stage.match {
    selector = "{level=~\"info|debug|notice\"}"
    action   = "drop"
  }

  // Rate limit as a safety net against log storms
  stage.limit {
    rate  = 100
    burst = 500
    drop  = true
  }

  // Drop anything older than 4 hours (belt and suspenders with max_age)
  stage.drop {
    older_than          = "4h"
    drop_counter_reason = "too old"
  }

  forward_to = argument.forward_to.value
}
```

## File-Based Log Collection

For hosts that also write traditional log files (pre-systemd or alongside the journal), you can add file-based collection:

```alloy
local.file_match "syslog_files" {
  path_targets = [{
    __address__ = "localhost",
    __path__    = "/var/log/{syslog,messages,*.log}",
    instance    = constants.hostname,
    job         = "integrations/node_exporter",
  }]
}

loki.source.file "syslog_files" {
  targets    = local.file_match.syslog_files.targets
  forward_to = [loki.process.default.receiver]
}
```

Most modern Linux distributions (Ubuntu 20.04+, Debian 11+, RHEL 8+) use the journal as the primary log source. File-based collection is mainly needed for legacy systems or applications that write directly to `/var/log`.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Not setting `max_age` | Gigabytes of old logs shipped on restart | Set `max_age = "12h0m0s"` or similar |
| Collecting all priorities in production | 60-80% of volume is info/debug noise | Add `stage.match` to drop low priorities |
| No rate limiting | A single crash-looping service floods Loki | Add `stage.limit` as a safety net |
| Using `stage.drop` without `max_age` | Source still reads old entries into memory | Use both: `max_age` at the source, `stage.drop` in the pipeline |
| Not extracting the `level` label | Cannot filter by priority in Grafana | Include the `__journal_priority_keyword` relabel rule |
