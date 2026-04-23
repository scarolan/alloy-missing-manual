# Dangerous Label Patterns

Some labels are cost bombs. A single label with unbounded or high-cardinality values can multiply your series count by 10x, 100x, or more. This page catalogs the patterns that repeatedly cause series explosion in real deployments, explains the math behind each one, and shows how to detect and fix them.

Every pattern here has been encountered in production environments. If you see any of these in your metrics, you are paying more than you need to.

## The Fundamental Rule

Series count is multiplicative across label dimensions. Adding one label with N unique values to a metric that has M existing series produces M x N total series.

```text
Before: 100 series
Add a label with 10 values: 100 x 10 = 1,000 series
Add another label with 50 values: 1,000 x 50 = 50,000 series
```

A label is "dangerous" when its value count is high, unbounded, or growing over time. The following catalog is organized from most commonly encountered to most subtle.

## Container and Pod IDs

**The pattern:** Kubernetes metrics include labels like `container_id`, `pod_uid`, or Docker's `container_id` (the full SHA256 hash). These are unique per container instance and change on every pod restart or deployment.

**Why it is dangerous:**

```text
50 pods x 20 metrics per pod = 1,000 series (with pod name only)
50 pods x 20 metrics x container_id = still 1,000 series (1:1 with pod)
  ...but every deployment creates 50 NEW container_ids
  = 1,000 stale series + 1,000 new series until staleness expires
```

The label does not increase the instantaneous series count (it is 1:1 with the pod), but it causes high churn. Your active series count oscillates as old IDs go stale and new ones appear. Worse, if staleness windows overlap, you temporarily double your series for those metrics.

**How to detect:**

```promql
count(group by (container_id) (container_cpu_usage_seconds_total))
```

If this returns hundreds or thousands, and you know you have far fewer running containers, you have stale series from old container IDs.

**How to fix:**

```alloy
prometheus.relabel "drop_container_ids" {
    forward_to = [prometheus.remote_write.default.receiver]

    rule {
        action = "labeldrop"
        regex  = "container_id|pod_uid"
    }
}
```

Keep `pod` (the human-readable name) and `container` (the container name within the pod). Drop `container_id` and `pod_uid`. You lose nothing useful -- nobody writes PromQL queries against raw SHA256 container IDs.

## Request Paths and URLs

**The pattern:** Application metrics with an `endpoint`, `path`, `url`, or `uri` label that captures the full request path, including path parameters.

**Why it is dangerous:**

```text
http_request_duration_seconds with path="/api/users/12345"
http_request_duration_seconds with path="/api/users/67890"
http_request_duration_seconds with path="/api/users/99999"
...
```

Each unique user ID in the path creates a new series. For a service handling 10,000 unique paths per day, this creates 10,000 series per metric -- multiplied by however many label dimensions the metric has (method, status code, etc.):

```text
10,000 paths x 5 methods x 10 status codes = 500,000 series
```

**How to detect:**

```promql
count(group by (path) (http_request_duration_seconds_bucket))
```

If the count is in the thousands and growing, you have path cardinality explosion.

**How to fix:** Normalize paths before they become labels. In Alloy, use `otelcol.processor.transform` for OpenTelemetry data, or relabel rules for Prometheus metrics:

```alloy
prometheus.relabel "normalize_paths" {
    forward_to = [prometheus.remote_write.default.receiver]

    // Replace numeric path segments with a placeholder
    rule {
        source_labels = ["path"]
        regex         = "(/api/users/)[0-9]+"
        target_label  = "path"
        replacement   = "${1}:id"
    }

    // Replace UUIDs in paths
    rule {
        source_labels = ["path"]
        regex         = "(/[^/]*/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(.*)"
        target_label  = "path"
        replacement   = "${1}:uuid${3}"
    }
}
```

The best fix is to normalize paths in the application's instrumentation library before they reach Alloy at all.

## IP Addresses

**The pattern:** Labels like `remote_addr`, `client_ip`, `source_ip`, or `peer` that capture the IP address of a client or peer.

**Why it is dangerous:**

```text
Unique IPs hitting an API gateway: 50,000/day
http_requests_total{client_ip="1.2.3.4", method="GET", status="200"} -- series 1
http_requests_total{client_ip="5.6.7.8", method="GET", status="200"} -- series 2
... x 50,000
```

IP addresses are semi-bounded (there are only ~4 billion IPv4 addresses) but in practice, a busy service sees thousands to hundreds of thousands of unique IPs. Each one creates series across every metric that carries the label.

**How to detect:**

```promql
count(group by (client_ip) ({__name__=~"http_.*"}))
```

**How to fix:** Drop the label entirely. If you need per-IP analysis, use logs, not metrics. Metrics are for aggregates; logs are for individual events.

```alloy
prometheus.relabel "drop_ip_labels" {
    forward_to = [prometheus.remote_write.default.receiver]

    rule {
        action = "labeldrop"
        regex  = "remote_addr|client_ip|source_ip|peer_address"
    }
}
```

## Timestamps in Labels

**The pattern:** Labels that embed a timestamp, such as `start_time`, `created_at`, or `last_seen`.

**Why it is dangerous:** By definition, every timestamp value is unique. A label that captures a timestamp generates a new series for every event, every pod start, or every request. This is infinite growth.

```text
pod_start_time{pod="web", start_time="1681234567"} -- series 1 (Monday's deploy)
pod_start_time{pod="web", start_time="1681320967"} -- series 2 (Tuesday's deploy)
pod_start_time{pod="web", start_time="1681407367"} -- series 3 (Wednesday's deploy)
```

**How to detect:** Look for labels whose value count grows linearly with time:

```promql
count(group by (start_time) (some_metric))
```

If this count keeps growing, the label is time-based.

**How to fix:**

```alloy
prometheus.relabel "drop_timestamp_labels" {
    forward_to = [prometheus.remote_write.default.receiver]

    rule {
        action = "labeldrop"
        regex  = "start_time|created_at|last_seen|timestamp"
    }
}
```

Timestamps belong as sample values, not label values. If you need to know when something happened, use a gauge metric whose value is the timestamp, not a label.

## Unbounded Enums: Error Messages

**The pattern:** Labels like `error`, `message`, `reason`, or `description` that capture free-text error messages.

**Why it is dangerous:** Error messages have subtle variations that create unique series:

```text
request_errors_total{error="connection refused: 10.0.1.5:8080"}
request_errors_total{error="connection refused: 10.0.1.6:8080"}
request_errors_total{error="connection refused: 10.0.1.7:9090"}
request_errors_total{error="timeout after 30.001s"}
request_errors_total{error="timeout after 30.002s"}
```

Each unique string is a separate series. IP addresses, port numbers, and timing values embedded in error messages create unbounded cardinality.

**How to detect:**

```promql
count(group by (error) (request_errors_total)) > 100
```

If you have more than a handful of unique error values, the label is probably capturing free-text messages.

**How to fix:** Normalize the error label to a fixed set of categories:

```alloy
prometheus.relabel "normalize_errors" {
    forward_to = [prometheus.remote_write.default.receiver]

    rule {
        source_labels = ["error"]
        regex         = "connection refused.*"
        target_label  = "error"
        replacement   = "connection_refused"
    }
    rule {
        source_labels = ["error"]
        regex         = "timeout.*"
        target_label  = "error"
        replacement   = "timeout"
    }
}
```

Better yet, fix the instrumentation to emit error categories (`connection_refused`, `timeout`, `auth_failure`) instead of raw error messages.

## High-CPU-Count Machines

**The pattern:** Per-CPU metrics on hosts with 64, 96, or 128 cores. This is not a "bad label" -- it is a legitimate label (`cpu`) with a legitimately high value count.

**Why it is dangerous:**

```text
node_cpu_seconds_total on a 128-core host:
128 cores x 8 modes = 1,024 series from one metric

windows_cpu_time_total on a 128-core host:
128 cores x 5 modes = 640 series from one metric
```

Add other per-CPU metrics (`node_cpu_scaling_frequency_hertz`, `node_cpu_guest_seconds_total`, `node_schedstat_*`) and a single 128-core host can produce 2,000+ series just from CPU metrics.

**How to detect:**

```promql
count by (instance) (node_cpu_seconds_total)
```

Any host returning more than 200 is worth investigating.

**How to fix:** For most environments, per-CPU data is valuable and worth the cost. But if you have a large fleet of high-core machines and do not need per-CPU breakdown, aggregate:

```alloy
prometheus.relabel "aggregate_cpu" {
    forward_to = [prometheus.remote_write.default.receiver]

    // Drop the cpu label, keeping only mode
    // This aggregates all cores into one series per mode
    rule {
        action = "labeldrop"
        regex  = "cpu"
    }
}
```

This reduces 1,024 series (128 cores x 8 modes) to 8 series (8 modes). The tradeoff: you lose the ability to identify hot individual CPUs.

A middle ground: keep per-CPU data for a sample of hosts (one per hardware profile) and aggregate the rest.

## Windows Service Explosion

**The pattern:** The Windows service collector emits metrics for every installed service. A typical Windows server has 150-250 services.

**Why it is dangerous:**

```text
200 services x windows_service_state (8 state values each) = 1,600 series
200 services x windows_service_start_mode = 200 series
200 services x windows_service_info = 200 series
200 services x windows_service_status = 200 series
Total: ~2,600 series from services alone
```

On the benchmark Windows server, the service collector produced 2,672 of 2,909 total series -- 92% of all metrics from a single collector.

**How to detect:**

```promql
count by (__name__) ({__name__=~"windows_service_.*"})
```

**How to fix:** Use the service filter from [Chapter 2, Layer 5](../ch02-cardinality-control/layer5-service-filter-windows.md). Monitor only the services you actually care about:

```alloy
prometheus.exporter.windows "default" {
    service {
        where_clause = "Name IN ('W32Time','WinRM','EventLog','Spooler','LanmanServer','LanmanWorkstation','TermService','MSSQLSERVER','WinDefend','Dhcp','Dnscache','W3SVC')"
    }
}
```

This reduces 2,600+ series to roughly 50-70 (12 services x 4-5 series each).

## Alloy Self-Monitoring Metrics

**The pattern:** Alloy exposes detailed internal metrics at its HTTP endpoint (`:12345/metrics`). If you scrape this endpoint and ship everything, you pay for hundreds of series about Alloy's own internals.

**Why it is dangerous:** Alloy generates metrics per component, per pipeline stage, and per target. A moderately complex pipeline with 20+ components can produce 500-800 self-monitoring series. Most of these are never looked at.

**How to detect:**

```promql
count({job="alloy"})
```

Or check the series count at the endpoint directly:

```bash
curl -s http://localhost:12345/metrics | grep -v '^#' | wc -l
```

**How to fix:** Either do not scrape Alloy's self-monitoring endpoint at all (the recommended default for most deployments), or apply a strict allow-list as shown in [The Top-N Series Approach](top-n-series.md).

## Log-Derived Metrics (High-Cardinality Labels from Log Lines)

**The pattern:** Using Alloy's `loki.process` with `stage.metrics` to derive Prometheus metrics from log lines. The extracted labels inherit whatever cardinality the log fields have.

**Why it is dangerous:** Log fields are often high-cardinality by nature. Extracting a `user_id`, `request_id`, `trace_id`, or `url` from a log line and promoting it to a metric label creates exactly the same explosion as having those labels in application metrics.

```text
log_line_errors_total{user_id="user_12345"} -- series per user
log_line_errors_total{user_id="user_67890"} -- another series per user
... x 100,000 users = 100,000 series
```

**How to detect:** Check the series count for any metric generated by `stage.metrics`:

```promql
count(group by (__name__) ({__name__=~"log_line_.*"}))
```

**How to fix:** When deriving metrics from logs, be extremely selective about which labels to include. Extract only bounded, categorical fields:

```alloy
loki.process "derive_metrics" {
    forward_to = [loki.write.default.receiver]

    // Extract the status code (bounded: ~5 values)
    stage.regex {
        expression = "status=(?P<status>\\d{3})"
    }

    // Create a counter metric with only the status label
    stage.metrics {
        metric.counter {
            name         = "log_http_requests_total"
            source       = "status"
            description  = "Total HTTP requests by status code"
            match_all    = true
            action       = "inc"
        }
    }
}
```

Do not extract `user_id`, `request_id`, `ip`, `path`, or any other high-cardinality field into metric labels. If you need per-user or per-request analysis, query the logs directly.

## Quick Reference: The Dangerous Labels Catalog

| Label Pattern | Typical Cardinality | Series Impact | Fix |
|---|---|---|---|
| `container_id`, `pod_uid` | Hundreds, churning | Churn + stale overlap | `labeldrop` |
| `path`, `url`, `endpoint` (with params) | Thousands-millions | Unbounded growth | Normalize or drop |
| `client_ip`, `remote_addr` | Thousands-millions | Unbounded growth | Drop; use logs for per-IP |
| `start_time`, `created_at` | Infinite (time-based) | Linear growth | Drop; use gauge values |
| `error`, `message` (free text) | Hundreds-thousands | Unbounded growth | Normalize to categories |
| `cpu` on 128-core hosts | 128 | x128 per CPU metric | Aggregate if per-CPU not needed |
| Windows `service` (unfiltered) | 150-250 | x150-250 per service metric | Filter to 10-15 services |
| Alloy internal metrics | 200-800 | Per-component growth | Do not scrape, or strict allow-list |
| Log-derived labels (`user_id`, etc.) | Unbounded | Mirrors log cardinality | Extract only bounded fields |

## Common Mistakes

**Assuming `labeldrop` is always safe.** Dropping a label can cause previously distinct series to collide. If two series differ only by the label you drop, Prometheus/Mimir will reject the duplicate. Always check that the remaining labels still produce unique combinations:

```promql
// Before dropping label "foo", check for collisions:
count by (__name__, remaining_label_1, remaining_label_2) (your_metric) > 1
```

If any result returns a count greater than 1, dropping the label will cause collisions.

**Fixing label cardinality at the backend instead of the source.** Recording rules and aggregation at the backend still require storing the high-cardinality series first. You pay for ingestion and storage before the aggregation happens. Fix it at the source in Alloy's relabel pipeline, before the data leaves the host.

**Adding a "just in case" label to custom metrics.** Every label you add multiplies series count. Before adding a label to your application's instrumentation, ask: "Will a dashboard or alert actually filter or group by this label?" If the answer is no, do not add it.

**Not monitoring label cardinality over time.** A label that has 5 values today might have 500 tomorrow if a new code path starts emitting new values. Set up a recurring check:

```promql
count(group by (your_suspicious_label) (your_metric)) > 100
```

Alert on this so you catch label explosion early.

## Summary

- Labels with high, unbounded, or growing value counts are the primary cause of series explosion
- Container IDs, request paths, IP addresses, timestamps, and free-text error messages are the most common offenders
- Detection is straightforward: `count(group by (label) (metric))` tells you the cardinality of any label
- Fixes: `labeldrop` for unnecessary labels, regex normalization for path/error labels, service filters for Windows, aggregation for high-core-count CPU metrics
- Fix at the source (in Alloy) rather than at the backend to avoid paying for ingestion of data you will discard
- Always verify that dropping a label does not create series collisions before applying the change
