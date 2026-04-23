# Windows: Event Logs

## Overview

Windows Event Logs are the Windows equivalent of the Linux systemd journal. Alloy collects them using the `loki.source.windowsevent` component, which reads from the Windows Event Log API and forwards entries to Loki.

The hardened Windows config ships three event logs by default: Application, System, and Security. Each gets its own source component.

## The Complete Event Log Pipeline

```alloy
// Relabel rules to add job and instance labels
loki.relabel "integrations_windows_exporter" {
  forward_to = [loki.write.grafana_cloud_loki.receiver]
  rule {
    target_label = "job"
    replacement  = "integrations/windows_exporter"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// Application log
loki.source.windowsevent "application" {
  eventlog_name          = "Application"
  use_incoming_timestamp = true
  forward_to             = [loki.process.windows_events.receiver]
}

// System log
loki.source.windowsevent "system" {
  eventlog_name          = "System"
  use_incoming_timestamp = true
  forward_to             = [loki.process.windows_events.receiver]
}

// Security log
loki.source.windowsevent "security" {
  eventlog_name          = "Security"
  use_incoming_timestamp = true
  forward_to             = [loki.process.windows_events.receiver]
}

// Processing pipeline (rate limiting, etc.)
loki.process "windows_events" {
  forward_to = [loki.relabel.integrations_windows_exporter.receiver]
}
```

## Key Parameters

| Parameter | Value | Purpose |
|---|---|---|
| `eventlog_name` | `"Application"`, `"System"`, `"Security"` | Which Windows Event Log channel to read |
| `use_incoming_timestamp` | `true` | Use the event's original timestamp rather than the time Alloy processes it |
| `forward_to` | `[loki.process.windows_events.receiver]` | Route through the processing pipeline |

## Filtering with xpath_query

The `xpath_query` parameter filters events at the source using XPath syntax. This is the most efficient way to reduce volume because filtered events never enter the Alloy pipeline.

### Filter by Level (Severity)

Windows Event Log levels:

| Level Value | Meaning |
|---|---|
| 1 | Critical |
| 2 | Error |
| 3 | Warning |
| 4 | Information |
| 5 | Verbose |

To ship only warnings and above (levels 1-3):

```alloy
loki.source.windowsevent "security" {
  eventlog_name          = "Security"
  use_incoming_timestamp = true
  xpath_query            = "*[System[(Level=1 or Level=2 or Level=3)]]"
  forward_to             = [loki.process.windows_events.receiver]
}
```

### Filter by Provider (Source)

To collect events only from specific providers:

```alloy
loki.source.windowsevent "application" {
  eventlog_name          = "Application"
  use_incoming_timestamp = true
  xpath_query            = "*[System[Provider[@Name='MSSQLSERVER' or @Name='Application Error' or @Name='.NET Runtime']]]"
  forward_to             = [loki.process.windows_events.receiver]
}
```

### Combine Level and Provider Filters

```alloy
loki.source.windowsevent "system" {
  eventlog_name          = "System"
  use_incoming_timestamp = true
  xpath_query            = "*[System[(Level=1 or Level=2 or Level=3) and Provider[@Name='Service Control Manager' or @Name='Microsoft-Windows-Kernel-General']]]"
  forward_to             = [loki.process.windows_events.receiver]
}
```

## Rate Limiting

Add a `stage.limit` block in the processing pipeline as a safety net:

```alloy
loki.process "windows_events" {
  stage.limit {
    rate  = 100   // lines per second per stream
    burst = 500   // burst allowance
    drop  = true  // drop excess (vs backpressure)
  }

  forward_to = [loki.relabel.integrations_windows_exporter.receiver]
}
```

## Selecting Which Logs to Collect

Not all three logs are necessary for every host:

| Log | Typical Volume | When to Collect |
|---|---|---|
| **Application** | Low to moderate | Always. Application errors and warnings are essential. |
| **System** | Low to moderate | Always. Service starts/stops, driver issues, hardware events. |
| **Security** | Varies wildly | With caution. Low on member servers, extremely high on domain controllers. |

On a standard member server, Application and System are usually safe to ship unfiltered. Security requires careful consideration -- see [Domain Controller Considerations](domain-controller.md).

## Structured Event Data

Windows Event Log entries contain structured data (event ID, provider name, level, task, keywords, etc.). When shipped to Loki, this metadata is available for querying. The event XML is included in the log line, so you can use Loki's `json` or `pattern` parsers in queries to extract specific fields.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Collecting Security log without filtering on a DC | Millions of events per day | Use `xpath_query` to filter by level, or comment out the Security source on DCs |
| Not using `use_incoming_timestamp` | Events timestamped when processed, not when they occurred | Always set `use_incoming_timestamp = true` |
| No rate limiting | A burst of events can overwhelm Loki | Add `stage.limit` in `loki.process` |
| Using `eventlog_name` with the wrong case | Component fails silently | Use exact Windows log names: `"Application"`, `"System"`, `"Security"` |
