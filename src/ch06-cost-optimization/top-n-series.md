# The Top-N Series Approach

Do not try to optimize everything at once. Find the top 10-20 metrics by series count, triage each one, and cut the ones that are not earning their cost. This approach typically addresses 60-80% of your total spend in a single pass.

## Step 1: Find Your Top Series Consumers

### Using the Cardinality Management Dashboard

Grafana Cloud includes a built-in Cardinality Management dashboard (accessible from the Grafana menu under Observability & Data > Metrics > Cardinality Management). This dashboard shows:

- Total active series across your environment
- Top metric names by series count
- Top label names by cardinality
- Series growth over time

This is the fastest way to get a ranked list of your biggest cost drivers without writing any PromQL.

### Using PromQL Queries

If you prefer raw queries or are running self-hosted Prometheus, these queries give you the same information.

**Top 20 metric names by series count:**

```promql
topk(20, count by (__name__) ({__name__=~".+"}))
```

This returns the 20 metric names that produce the most individual time series. On a typical unoptimized deployment, the top 5-10 metrics account for more than half the total series.

**Top metric names for a specific job:**

```promql
topk(20, count by (__name__) ({job="integrations/node_exporter"}))
```

**Total series by job (to compare workloads):**

```promql
count by (job) ({__name__=~".+"})
```

**Series count for a specific metric, broken down by label:**

```promql
count by (cpu) (node_cpu_seconds_total)
```

This tells you how many series the `cpu` label produces for that metric. Replace `cpu` with any label name to see its cardinality contribution.

**Find which labels have the highest cardinality on a given metric:**

```promql
count(group by (__name__, cpu) (node_cpu_seconds_total))
count(group by (__name__, mode) (node_cpu_seconds_total))
count(group by (__name__, instance) (node_cpu_seconds_total))
```

Run these one at a time, swapping the label name. The one that returns the highest count is your biggest cardinality driver for that metric.

## Step 2: Triage Each Metric

For each of the top 20 metrics, answer three questions:

```text
                    Is this metric queried at all?
                    /                    \
                  YES                    NO
                  /                       \
        Is it in a dashboard      DROP IT. Free money.
        or alert rule?
        /              \
      YES               NO
      /                  \
  KEEP IT.          Who queries it? Why?
  Optimize labels   (Ad-hoc debugging? One-time investigation?
  if possible.       If nobody claims it, DROP IT.)
```

### How to Check If a Metric Is Queried

**In Grafana Cloud:** The Cardinality Management dashboard marks metrics as "queried" or "not queried" based on Grafana's query tracking. Adaptive Metrics (covered in [Adaptive Metrics](adaptive-metrics.md)) also surfaces this data.

**Manually:** Search your Grafana instance for the metric name:

1. Open each dashboard that targets the relevant data source
2. Search dashboard JSON for the metric name (`Ctrl+F` in the dashboard settings JSON model)
3. Check alert rules: navigate to Alerting > Alert rules and search for the metric name
4. Check recording rules: look in your Mimir/Prometheus rule configurations

**Via API:** If you have many dashboards, script it:

```bash
# Search all dashboards for a metric name
grafana-cli dashboard search --query "node_scrape" 2>/dev/null || \
curl -s -H "Authorization: Bearer $GRAFANA_TOKEN" \
  "https://your-instance.grafana.net/api/search?query=node_scrape" | jq '.[] | .title'
```

### Typical Findings

In most environments, the triage looks like this:

| Metric | Series Count | Queried? | Action |
|---|---|---|---|
| `node_cpu_seconds_total` | 512 (64 cores x 8 modes) | Yes (dashboard) | Keep, but aggregate modes (see below) |
| `node_scrape_collector_duration_seconds` | 200+ (per collector) | No | Drop |
| `node_scrape_collector_success` | 200+ (per collector) | No | Drop |
| `windows_service_state` | 1,600 (200 services x 8 states) | Partially | Filter to 12 critical services |
| `container_cpu_usage_seconds_total` | Varies (per container ID) | Yes, but container_id label churns | Aggregate away container_id |
| `go_memstats_*` | 30+ per target | Rarely | Drop unless debugging Alloy itself |
| `process_*` | 10+ per target | Rarely | Drop unless debugging Alloy itself |

## Step 3: Common High-Series Offenders

These are the metrics that show up repeatedly in top-N lists across customer environments. If you see any of them in your top 20, the fix is straightforward.

### node_scrape_* Metrics

The node exporter emits `node_scrape_collector_duration_seconds` and `node_scrape_collector_success` for every enabled collector. On a host with 20+ collectors, that is 40+ series of exporter self-monitoring that no dashboard uses.

**Series count:** 2 series per enabled collector. 20 collectors = 40 series/host.

**Fix:** Add to your allow-list exclusion, or ensure your allow-list does not include them. If you are using the Layer 1 allow-list from [Chapter 2](../ch02-cardinality-control/layer1-allow-list.md), these are already excluded.

### Per-CPU Metrics on High-Core Machines

`node_cpu_seconds_total` generates `cores x modes` series. On a 64-core host, that is 512 series from one metric. On a 128-core host, 1,024.

**Series count:** cores x 8 (Linux) or cores x 5 (Windows).

| Cores | Linux Series | Windows Series |
|---|---|---|
| 4 | 32 | 20 |
| 16 | 128 | 80 |
| 64 | 512 | 320 |
| 128 | 1,024 | 640 |

**Fix:** On very high-core machines, you can use a recording rule to pre-aggregate across CPUs and drop the per-CPU series. But for most environments, the per-CPU breakdown is valuable for troubleshooting (identifying hot CPUs). The better fix is to ensure the rest of your pipeline is lean so you can afford the CPU series.

### Windows Services

The Windows service collector generates series for every installed service. A typical server has 150-250 services. Each service generates metrics for state (8 possible values), start_mode, info, and status.

**Series count:** 200 services x ~13 series = 2,600 series/host.

**Fix:** Use the Layer 5 service filter from [Chapter 2](../ch02-cardinality-control/layer5-service-filter-windows.md) to monitor only the 10-15 services you care about. This cuts 2,600 series to ~50-70.

### Container ID Labels

Kubernetes and Docker environments attach `container_id`, `pod`, and sometimes `pod_uid` labels to metrics. Containers are ephemeral -- every deployment creates new IDs, which creates new series.

**Series count:** Grows with deployment frequency. A busy cluster can churn thousands of series per hour.

**Fix:** Drop `container_id` and `pod_uid` labels using `prometheus.relabel`. Keep `pod` and `container` (the name, not the ID) for troubleshooting.

```alloy
prometheus.relabel "drop_container_ids" {
    forward_to = [prometheus.remote_write.default.receiver]

    rule {
        action = "labeldrop"
        regex  = "container_id|pod_uid"
    }
}
```

### go_* and process_* Self-Monitoring Metrics

Every Go application (including Alloy itself) exposes `go_memstats_*`, `go_gc_*`, `go_goroutines`, and `process_*` metrics. These are useful for debugging the application itself, but rarely queried in production.

**Series count:** 25-40 per target. If you scrape 50 targets, that is 1,250-2,000 series.

**Fix:** Exclude from your allow-list. If you want to keep them for one target (e.g., Alloy self-monitoring), be explicit about which target gets them.

### Alloy's Own Self-Monitoring Metrics

Alloy exposes hundreds of metrics about its own internals at `:12345/metrics`. If you scrape this endpoint and send everything to your backend, you can easily add 500+ series of data you never look at.

**Series count:** 200-800 depending on pipeline complexity and number of components.

**Fix:** Either do not scrape Alloy's self-monitoring endpoint, or apply a tight allow-list if you do:

```alloy
prometheus.scrape "alloy_self" {
    targets    = [{"__address__" = "localhost:12345"}]
    forward_to = [prometheus.relabel.alloy_self.receiver]
}

prometheus.relabel "alloy_self" {
    forward_to = [prometheus.remote_write.default.receiver]

    rule {
        source_labels = ["__name__"]
        regex = join([
            "alloy_build_info",
            "prometheus_remote_write_wal_samples_appended_total",
            "prometheus_remote_write_wal_out_of_order_samples_total",
            "loki_process_dropped_lines_total",
        ], "|")
        action = "keep"
    }
}
```

## Step 4: Implement the Cuts

Once you have your triage list, implement the changes in order of impact. The mechanisms come from Chapter 2:

| Offender Type | Fix Mechanism | Chapter Reference |
|---|---|---|
| Entire metric names not queried | Layer 1: Allow-list | [Layer 1](../ch02-cardinality-control/layer1-allow-list.md) |
| Specific label values (veth, container IDs) | Layer 2: Pattern block | [Layer 2](../ch02-cardinality-control/layer2-pattern-block.md) |
| Windows service explosion | Layer 5: Service filter | [Layer 5](../ch02-cardinality-control/layer5-service-filter-windows.md) |
| High-cardinality labels (IDs, paths) | `labeldrop` rule | [Dangerous Labels](dangerous-labels.md) |
| Exporter self-monitoring | Exclude from allow-list | Layer 1 |

Apply changes one at a time or in small batches. Verify after each change that no dashboards or alerts broke.

## Step 5: Measure the Impact

After applying your changes, measure the actual reduction:

**Before/after series count for a specific host:**

```promql
count({instance="your-hostname", job="integrations/node_exporter"})
```

**Fleet-wide active series over time:**

```promql
sum(scrape_series_added) by (job)
```

**Cost impact:** Take the series delta, divide by 1,000, multiply by $8.

```text
Before: 1,000,000 active series = $8,000/month
After:    400,000 active series = $3,200/month
Savings:  600,000 series        = $4,800/month = $57,600/year
```

Track your active series count on a dashboard. Set an alert if it exceeds your budget threshold:

```promql
count({__name__=~".+"}) > 500000
```

## The Diminishing Returns Curve

The top-N approach works because series distribution follows a power law. The top 5 metrics might account for 50% of total series. The top 20 might cover 80%. After that, each additional optimization saves less.

| Optimization Pass | Typical Coverage | Effort |
|---|---|---|
| Top 5 metrics | 40-50% of series | Low -- usually obvious drops |
| Top 10 metrics | 60-70% of series | Low-medium -- some require triage |
| Top 20 metrics | 75-85% of series | Medium -- starts hitting metrics people care about |
| Beyond top 20 | Diminishing returns | High -- small savings, more discussion needed |

Stop when the cost of the next optimization (engineer time, risk of breaking something) exceeds the cost of the series it would eliminate. For most environments, addressing the top 20 metrics is the sweet spot.

## Common Mistakes

**Trying to optimize everything at once.** This leads to analysis paralysis. Start with the top 5 and ship the fix. Then do the next 5.

**Dropping a metric without checking alert rules.** Dashboards are visible, but alert rules are not always discoverable. Always search your alert rule configurations before dropping a metric.

**Optimizing a metric that costs $3/month.** If a metric produces 375 series across your entire fleet, it costs $3/month. Spending an hour deciding whether to drop it is not worth it. Focus on the metrics that cost $100+/month.

**Not re-measuring after changes.** Deploy the fix, wait 10 minutes for stale series to expire, then run the count query again. If the numbers did not drop as expected, something was missed.

## Summary

- Query `topk(20, count by (__name__) ({__name__=~".+"}))` to find your biggest cost drivers
- Triage each metric: is it queried? Is it in a dashboard or alert? If not, drop it
- The usual suspects: `node_scrape_*`, per-CPU metrics on high-core machines, Windows services, container ID labels, `go_*`/`process_*` self-monitoring
- Implement cuts using the Layer 1-5 patterns from Chapter 2
- Measure before and after with `count({instance="...", job="..."})` queries
- Stop at the top 20 -- beyond that, diminishing returns set in
