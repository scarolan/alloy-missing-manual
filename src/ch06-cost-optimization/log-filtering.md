# Log Filtering

Logs are billed by volume -- gigabytes ingested -- not by series count. The cost model is simpler than metrics, but the waste can be just as large. Most log volume is debug/info noise, health check spam, and verbose output that nobody queries. Filtering at the edge in Alloy, before logs reach Loki, is the most effective way to control log costs.

## The Log Cost Model

Grafana Cloud Logs pricing is based on **ingested volume** (GB per month). The exact rate varies by plan, but the benchmark is approximately **$0.50 per GB** on the Pro plan. That sounds cheap until you calculate what an unfiltered fleet produces.

| Source | Typical Volume/Host/Day | 500 Hosts/Month | Monthly Cost (at $0.50/GB) |
|---|---|---|---|
| Journal logs (all priorities) | 200 MB - 1 GB | 3-15 TB | $1,500 - $7,500 |
| Journal logs (warning+ only) | 20-100 MB | 300 GB - 1.5 TB | $150 - $750 |
| Application logs (unfiltered) | 500 MB - 5 GB | 7.5-75 TB | $3,750 - $37,500 |
| Application logs (filtered) | 50-500 MB | 750 GB - 7.5 TB | $375 - $3,750 |

Filtering journal logs from all priorities to warning-and-above typically reduces volume by 60-80%. Filtering application logs by dropping health checks and debug output can reduce volume by 50-90%.

## The Filter-at-the-Edge Principle

Alloy runs on every host. Loki runs centrally (or in Grafana Cloud). Every byte that Alloy sends to Loki costs:

1. **Network bandwidth** to transmit it
2. **Ingestion cost** when Loki receives it
3. **Storage cost** for retention
4. **Query cost** when searching through it

Filtering in Loki (at query time) saves nothing on the first three. Filtering in Alloy (at collection time) saves on all four. This is why every filtering strategy in this chapter operates in the Alloy pipeline, before logs leave the host.

## Strategy 1: Drop Entire Streams by Label

The most aggressive filter: drop all log entries matching a label selector. This is useful for eliminating entire categories of noise.

### Drop by Log Level

The most common and highest-impact filter. Drop debug and info entries, keep warnings and above:

```alloy
loki.process "filter_by_level" {
    forward_to = [loki.write.default.receiver]

    stage.match {
        selector = "{level=~\"info|debug|notice\"}"
        action   = "drop"
    }
}
```

**Volume impact:** 60-80% reduction on most servers. The majority of journal entries and application logs are informational.

### Drop by Unit or Source

Drop logs from specific noisy services entirely:

```alloy
loki.process "filter_by_unit" {
    forward_to = [loki.write.default.receiver]

    stage.match {
        selector = "{unit=\"snapd.service\"}"
        action   = "drop"
    }

    stage.match {
        selector = "{unit=\"systemd-resolved.service\"}"
        action   = "drop"
    }
}
```

### Drop Health Check and Readiness Probe Logs

Health checks and Kubernetes readiness/liveness probes generate enormous log volume with zero diagnostic value:

```alloy
loki.process "drop_health_checks" {
    forward_to = [loki.write.default.receiver]

    stage.drop {
        expression = "(?i)(GET /health|GET /ready|GET /livez|GET /readyz|GET /metrics|health_check)"
        source     = ""
    }
}
```

**Volume impact:** On services with frequent health checks (every 5-10 seconds from a load balancer), these entries can account for 30-50% of that service's log volume.

## Strategy 2: Rate Limiting

Cap the throughput of any single log stream as a safety net against log storms (crash loops, debug logging accidentally enabled in production, chatty library output):

```alloy
loki.process "rate_limit" {
    forward_to = [loki.write.default.receiver]

    stage.limit {
        rate  = 100    // lines per second per stream
        burst = 500    // burst allowance above the rate
        drop  = true   // drop excess lines (vs applying backpressure)
    }
}
```

Rate limiting operates per unique label combination (per stream). A host with 20 systemd units generates 20 streams, each independently limited to 100 lines/second.

**When to use:** Always. Even if your other filters are working perfectly, rate limiting is a safety net against unexpected log volume spikes. A crash-looping service can emit thousands of lines per second. Without a rate limit, that one service can cost more in log ingestion than your entire fleet.

**Setting the rate:** 100 lines/second per stream is a reasonable starting point. Adjust based on your environment:

| Environment | Suggested Rate | Suggested Burst |
|---|---|---|
| Infrastructure hosts (low log volume) | 50-100 | 200-500 |
| Application servers | 100-500 | 500-2000 |
| High-throughput services | 500-1000 | 2000-5000 |

## Strategy 3: Sampling (1-in-N)

For log streams where you need some entries but not all -- typically high-volume info-level logs where statistical sampling is sufficient:

```alloy
loki.process "sample_info_logs" {
    forward_to = [loki.write.default.receiver]

    // Keep all warnings and above at full fidelity
    // Sample info logs at 10%
    stage.match {
        selector = "{level=\"info\"}"

        stage.sampling {
            rate = 0.1   // keep 10% of matching entries
        }
    }
}
```

**Volume impact:** A sampling rate of 0.1 (10%) reduces the volume of matched logs by 90%.

**When to use:** Sampling is appropriate for high-volume, low-criticality log streams where:

- You need enough entries to spot patterns but do not need every line
- Individual log entries are not actionable (you query aggregates, not specific events)
- The log source is too noisy to keep at full volume but too useful to drop entirely

**When NOT to use:** Do not sample security logs, error logs, audit logs, or any stream where individual entries matter. Use level-based filtering (Strategy 1) instead -- keep all errors at full fidelity, sample info/debug only.

## Strategy 4: Journal Log Filtering (Linux)

The systemd journal is the primary log source on modern Linux. The `loki.source.journal` component reads from it. See [Linux: Journal Logs](../ch04-platform-guides/linux/journal-logs.md) for the complete pipeline setup.

### Filter by Priority

Journal priorities follow syslog conventions:

| Priority | Keyword | Typical Action |
|---|---|---|
| 0-2 | emerg, alert, crit | Always keep |
| 3 | err | Always keep |
| 4 | warning | Keep |
| 5 | notice | Keep or drop (depends on environment) |
| 6 | info | Drop in production |
| 7 | debug | Always drop |

```alloy
loki.process "journal_filter" {
    forward_to = [loki.write.default.receiver]

    stage.match {
        selector = "{level=~\"info|debug|notice\"}"
        action   = "drop"
    }
}
```

### Filter by Systemd Unit

Use `matches` in the journal source to restrict collection to specific units. This is more efficient than processing and dropping because the entries never enter the Alloy pipeline:

```alloy
loki.source.journal "default" {
    max_age    = "12h0m0s"
    forward_to = [loki.process.default.receiver]
    relabel_rules = loki.relabel.default.rules
    matches    = "_SYSTEMD_UNIT=sshd.service OR _SYSTEMD_UNIT=docker.service OR _SYSTEMD_UNIT=kubelet.service"
}
```

The `matches` parameter uses the systemd journal matching syntax. Only entries from the specified units are read from the journal. Everything else is ignored at the source level.

### Combining Priority and Unit Filters

For maximum cost reduction, combine both: restrict to specific units and then drop low-priority entries from those units:

```alloy
loki.source.journal "default" {
    max_age    = "12h0m0s"
    forward_to = [loki.process.journal.receiver]
    relabel_rules = loki.relabel.default.rules
    matches    = "_SYSTEMD_UNIT=sshd.service OR _SYSTEMD_UNIT=docker.service OR _SYSTEMD_UNIT=kubelet.service OR _SYSTEMD_UNIT=alloy.service"
}

loki.process "journal" {
    forward_to = [loki.write.default.receiver]

    // Drop info and below, even from the units we keep
    stage.match {
        selector = "{level=~\"info|debug|notice\"}"
        action   = "drop"
    }

    // Safety net: rate limit per stream
    stage.limit {
        rate  = 100
        burst = 500
        drop  = true
    }

    // Belt and suspenders: drop anything too old
    stage.drop {
        older_than          = "4h"
        drop_counter_reason = "too old"
    }
}
```

## Strategy 5: Windows Event Log Filtering

Windows Event Logs are collected via `loki.source.windowsevent`. The `xpath_query` parameter filters events at the source using XPath, which is the most efficient approach because filtered events never enter the pipeline. See [Windows: Event Logs](../ch04-platform-guides/windows/event-logs.md) for the complete pipeline setup.

### Filter by Severity Level

Windows Event Log levels:

| Level | Meaning | Typical Action |
|---|---|---|
| 1 | Critical | Always keep |
| 2 | Error | Always keep |
| 3 | Warning | Keep |
| 4 | Information | Drop in production |
| 5 | Verbose | Always drop |

```alloy
loki.source.windowsevent "application" {
    eventlog_name          = "Application"
    use_incoming_timestamp = true
    xpath_query            = "*[System[(Level=1 or Level=2 or Level=3)]]"
    forward_to             = [loki.process.windows_events.receiver]
}
```

### Filter by Provider

Collect events only from specific providers (sources):

```alloy
loki.source.windowsevent "system" {
    eventlog_name          = "System"
    use_incoming_timestamp = true
    xpath_query            = "*[System[Provider[@Name='Service Control Manager' or @Name='Microsoft-Windows-Kernel-General' or @Name='Microsoft-Windows-WindowsUpdateClient']]]"
    forward_to             = [loki.process.windows_events.receiver]
}
```

### Combine Severity and Provider

```alloy
loki.source.windowsevent "application" {
    eventlog_name          = "Application"
    use_incoming_timestamp = true
    xpath_query            = "*[System[(Level=1 or Level=2 or Level=3) and Provider[@Name='MSSQLSERVER' or @Name='Application Error' or @Name='.NET Runtime']]]"
    forward_to             = [loki.process.windows_events.receiver]
}
```

### The Security Log Problem

On domain controllers, the Security log can generate millions of events per day (logon/logoff, privilege use, object access). Shipping it unfiltered is a cost disaster:

```alloy
// Only keep failed logon events (Event ID 4625) and account lockouts (4740)
loki.source.windowsevent "security" {
    eventlog_name          = "Security"
    use_incoming_timestamp = true
    xpath_query            = "*[System[(EventID=4625 or EventID=4740 or EventID=4771 or EventID=1102)]]"
    forward_to             = [loki.process.windows_events.receiver]
}
```

## Strategy 6: Structured Log Processing

For applications that emit structured (JSON) logs, Alloy can parse the structure and make filtering decisions based on specific fields. This is more surgical than regex matching.

### Parse JSON and Filter by Field

```alloy
loki.process "structured_logs" {
    forward_to = [loki.write.default.receiver]

    // Parse the JSON log line
    stage.json {
        expressions = {
            level      = "level",
            logger     = "logger",
            request_id = "request_id",
            path       = "path",
        }
    }

    // Drop debug-level entries
    stage.match {
        selector = "{level=\"debug\"}"
        action   = "drop"
    }

    // Drop health check paths
    stage.drop {
        expression = "^/health$|^/ready$|^/metrics$"
        source     = "path"
    }

    // Remove high-cardinality fields from labels
    // (keep them in the log line, just don't index them)
    stage.label_drop {
        values = ["request_id", "path"]
    }
}
```

The key insight: `stage.json` extracts fields into labels for processing. `stage.label_drop` removes them before sending to Loki. The fields remain in the original log line (queryable via Loki's JSON parser at query time) but are not indexed as labels (which would increase stream cardinality and cost).

### Extract Only What You Need

Do not promote high-cardinality log fields to Loki labels. Labels in Loki determine stream identity, and high-cardinality labels create the same explosion problem as in metrics:

| Field | As Loki Label? | Why |
|---|---|---|
| `level` | Yes | Bounded (5-7 values), essential for filtering |
| `service` | Yes | Bounded, essential for routing |
| `environment` | Yes | Bounded (dev/staging/prod) |
| `request_id` | No | Unique per request, unbounded |
| `user_id` | No | Unique per user, unbounded |
| `path` | No | High cardinality with path parameters |
| `trace_id` | No | Unique per trace, unbounded |

Keep high-cardinality fields in the log line body and query them with Loki's parser at query time. This costs nothing extra in storage and does not affect stream counts.

## Before and After: Volume Estimates

Here are realistic volume estimates for common filtering strategies applied to a fleet of 100 Linux hosts:

| Strategy | Volume/Host/Day | Fleet Total/Month | Monthly Cost |
|---|---|---|---|
| Unfiltered (all journal entries) | 500 MB | 1.5 TB | $750 |
| Priority filter (warning+) | 75 MB | 225 GB | $112 |
| Priority + unit filter | 25 MB | 75 GB | $37 |
| Priority + unit + rate limit | 20 MB | 60 GB | $30 |
| **Reduction from unfiltered** | | | **$720/mo saved** |

For a fleet of 100 Windows servers:

| Strategy | Volume/Host/Day | Fleet Total/Month | Monthly Cost |
|---|---|---|---|
| All three event logs, unfiltered | 200 MB | 600 GB | $300 |
| Severity filter (warning+) | 30 MB | 90 GB | $45 |
| Severity + provider filter | 10 MB | 30 GB | $15 |
| **Reduction from unfiltered** | | | **$285/mo saved** |

Combined, filtering logs on a mixed fleet of 100 Linux + 100 Windows hosts saves approximately **$1,000/month** ($12,000/year) in log ingestion costs alone.

## Putting It All Together: A Complete Pipeline

Here is a complete log processing pipeline that combines multiple strategies:

```alloy
// Journal source with unit filtering
loki.source.journal "default" {
    max_age    = "12h0m0s"
    forward_to = [loki.process.default.receiver]
    relabel_rules = loki.relabel.journal.rules
    matches    = "_SYSTEMD_UNIT=sshd.service OR _SYSTEMD_UNIT=docker.service OR _SYSTEMD_UNIT=kubelet.service OR _SYSTEMD_UNIT=alloy.service"
}

// Extract journal metadata into labels
loki.relabel "journal" {
    rule {
        source_labels = ["__journal__systemd_unit"]
        target_label  = "unit"
    }
    rule {
        source_labels = ["__journal_priority_keyword"]
        target_label  = "level"
    }
    forward_to = []
}

// Processing pipeline: filter, limit, protect
loki.process "default" {
    forward_to = [loki.relabel.add_labels.receiver]

    // 1. Drop low-priority entries
    stage.match {
        selector = "{level=~\"info|debug|notice\"}"
        action   = "drop"
    }

    // 2. Drop health check patterns from any remaining entries
    stage.drop {
        expression = "(?i)(health.check|readiness.probe|liveness.probe)"
        source     = ""
    }

    // 3. Rate limit as a safety net
    stage.limit {
        rate  = 100
        burst = 500
        drop  = true
    }

    // 4. Drop entries older than 4 hours
    stage.drop {
        older_than          = "4h"
        drop_counter_reason = "too old"
    }
}

// Add standard labels
loki.relabel "add_labels" {
    forward_to = [loki.write.default.receiver]

    rule {
        target_label = "job"
        replacement  = "integrations/node_exporter"
    }
    rule {
        target_label = "instance"
        replacement  = constants.hostname
    }
}
```

## Common Mistakes

**Not filtering logs at all.** The default Alloy configuration ships everything. On a busy server, that can be gigabytes per day of info/debug noise. Always add at least a priority/level filter.

**Filtering at query time instead of ingestion time.** A Loki query like `{job="syslog"} |= "error"` filters at read time -- you still pay for ingesting and storing all the lines that do not match. Filter in Alloy before the data reaches Loki.

**Not rate limiting.** A single crash-looping service can emit 10,000+ lines per second. Without a rate limit in the pipeline, that one service can generate more log volume in an hour than your entire fleet does in a day.

**Promoting high-cardinality fields to Loki labels.** Every unique label combination creates a new Loki stream. Streams have overhead. If you add `request_id` as a label, you create one stream per request. Use `stage.label_drop` to remove high-cardinality fields from labels while keeping them in the log line for query-time extraction.

**Forgetting `max_age` on journal sources.** Without it, Alloy restarts ship the entire journal history to Loki -- potentially days or weeks of old logs in a single burst.

**Ignoring the Security event log on Windows domain controllers.** This log alone can generate hundreds of megabytes per day on a busy DC. Use `xpath_query` to filter to specific Event IDs, or do not collect it at all.

## Summary

- Logs are billed per GB ingested; filtering at the edge in Alloy saves on network, ingestion, storage, and query costs
- Priority/level filtering (drop info/debug) is the single highest-impact log optimization: 60-80% volume reduction
- Rate limiting is a safety net every pipeline should have, regardless of other filters
- Sampling (1-in-N) is appropriate for high-volume, low-criticality streams where statistical coverage is sufficient
- Journal filtering uses `matches` for unit selection and `stage.match` for priority; both operate before data leaves the host
- Windows Event Log filtering uses `xpath_query` for source-level severity and provider filtering
- Structured log processing: extract fields with `stage.json`, filter on them, then `stage.label_drop` to prevent label cardinality explosion
- Keep high-cardinality fields in the log line body, not as Loki labels
- A mixed fleet of 200 hosts saves approximately $12,000/year with basic log filtering
