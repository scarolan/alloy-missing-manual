# Adaptive Metrics

Adaptive Metrics is a Grafana Cloud feature that automatically identifies metrics you are paying for but not querying. It tracks which metrics are used by dashboards, alerts, and recording rules in your Grafana instance, then recommends aggregation rules that reduce or eliminate the unused ones. It is the lowest-effort optimization available: enable it, review the recommendations, and apply them for a typical 20-40% series reduction without touching a single Alloy config.

## How It Works

Adaptive Metrics operates in three phases:

1. **Observation:** Grafana Cloud monitors all PromQL queries executed against your metrics backend -- dashboard panels, alert evaluations, recording rules, Explore queries. It builds a map of which metric names and label combinations are actually used.

2. **Recommendation:** For metrics that are collected but never (or rarely) queried, Adaptive Metrics generates aggregation recommendations. These recommendations either aggregate away unused labels (reducing series count while preserving queryability) or mark metrics as candidates for dropping entirely.

3. **Application:** You review the recommendations and apply them. Recommendations can be applied through the Grafana UI (one-click), via the API, or through the `grafana.adaptive_metrics` Alloy component for infrastructure-as-code workflows.

The key insight: Adaptive Metrics does not guess which metrics are important. It watches what your team actually queries and optimizes everything else.

## Enabling Adaptive Metrics

Adaptive Metrics is available on Grafana Cloud Pro and Advanced plans. To enable it:

1. Navigate to your Grafana Cloud instance
2. Go to **Infrastructure > Metrics > Adaptive Metrics** (or find it via the left sidebar under Observability & Data)
3. Enable the feature for your metrics endpoint

Once enabled, the system needs 7-14 days to build a reliable picture of your query patterns. Recommendations generated before that window may be incomplete.

## The Recommendations Workflow

### Reviewing Recommendations

The Adaptive Metrics UI shows each recommendation with:

- **Metric name** -- which metric is affected
- **Current series count** -- how many series this metric currently produces
- **Recommended series count** -- how many series after applying the recommendation
- **Reduction** -- the absolute and percentage savings
- **Labels to keep** -- which labels remain after aggregation
- **Labels to drop** -- which labels are aggregated away
- **Query status** -- whether the metric (with those specific labels) has been queried in the observation window

Example recommendation:

```text
Metric: node_network_receive_bytes_total
Current series: 2,400 (across fleet)
Recommended series: 600
Labels to keep: instance, job, device
Labels to drop: operstate, carrier, address, broadcast, duplex, ifalias
Savings: 1,800 series (75%)
```

This recommendation keeps the labels that dashboards actually filter on (`instance`, `device`) and aggregates away labels that no query uses.

### Applying Recommendations

**Option 1: Via the Grafana Cloud UI**

Click "Apply" on individual recommendations, or select multiple and apply in bulk. Recommendations take effect within minutes. This is the fastest path for one-time optimization.

**Option 2: Via the Alloy component**

For teams that manage Alloy configuration as code, the `grafana.adaptive_metrics` component pulls recommendations from the Grafana Cloud API and applies them locally:

```alloy
grafana.adaptive_metrics "default" {
    // Your Grafana Cloud credentials
    api_url = "https://your-instance.grafana.net"

    basic_auth {
        username = env("GRAFANA_CLOUD_METRICS_ID")
        password = env("GRAFANA_CLOUD_API_KEY")
    }

    // Forward the resulting aggregation rules to remote_write
    forward_to = [prometheus.remote_write.default.receiver]
}
```

This component periodically fetches the latest accepted recommendations and applies them as aggregation rules in the Alloy pipeline. The advantage: recommendations are applied at the edge, reducing both series shipped and network bandwidth.

**Option 3: Via the API**

For automation pipelines:

```bash
# List recommendations
curl -s -u "$METRICS_ID:$API_KEY" \
  "https://your-instance.grafana.net/api/v1/recommendations" | jq '.recommendations[:5]'

# Apply a specific recommendation
curl -s -X POST -u "$METRICS_ID:$API_KEY" \
  "https://your-instance.grafana.net/api/v1/recommendations/apply" \
  -H "Content-Type: application/json" \
  -d '{"metric_name": "node_network_receive_bytes_total"}'
```

## Expected Results

The savings from Adaptive Metrics depend on how much unnecessary data you are already collecting:

| Starting State | Typical Reduction | Notes |
|---|---|---|
| Default exporters, no filtering | 20-40% | Significant gains because everything is shipped |
| Partial filtering (some allow-lists) | 10-25% | Gains from labels and metrics the allow-list missed |
| Fully hardened (Chapter 2 layers) | 5-15% | Marginal gains -- most waste is already eliminated |

If you have already applied the 5-layer cardinality control pattern from Chapter 2, Adaptive Metrics provides a useful secondary optimization but will not produce dramatic results. The bulk of the waste was already addressed at the source.

If you have not yet applied manual cardinality controls, Adaptive Metrics is a good first step -- it gets you a meaningful reduction with minimal effort while you plan a more thorough cleanup.

## Limitations

Adaptive Metrics is powerful but has blind spots you need to understand:

### Only Tracks Grafana-Originated Queries

Adaptive Metrics monitors queries executed through Grafana (dashboards, alerts, Explore). It does not track:

- Direct PromQL queries via the Prometheus API (e.g., from scripts or custom tooling)
- Queries from external systems that read your metrics endpoint
- Recording rules evaluated by Mimir/Cortex that were not created through Grafana

If a metric is queried only by an external system, Adaptive Metrics will mark it as "unused" and recommend dropping it.

### Recommendation Lag

The system needs to observe query patterns over time. There is an inherent delay:

- **Initial ramp-up:** 7-14 days before recommendations are reliable
- **After dashboard changes:** If you create a new dashboard that queries a metric previously marked as unused, the recommendation will not immediately update. There is a lag of days before the system recognizes the new query pattern.

### New Dashboards Lose History

If you apply a recommendation to aggregate away a label, and later create a dashboard that queries that label, the historical data with that label is gone. The aggregated data remains, but the per-label breakdown is not recoverable.

This is the core tradeoff: you save money now, but you lose the ability to retroactively query dropped labels. For most infrastructure metrics this is fine -- you rarely need last month's per-veth-interface breakdown. For business-critical metrics, think twice.

### No Coverage of Logs or Traces

Adaptive Metrics applies only to Prometheus metrics. Logs and traces have their own optimization paths (see [Log Filtering](log-filtering.md) and Grafana Cloud's Adaptive Logs feature).

## Combining with Manual Cardinality Control

The strongest approach uses both:

1. **Manual cardinality control (Chapter 2 layers)** -- eliminates the obvious waste at the source: unused collectors, unused metrics, known-bad patterns, service explosion. This is deterministic and immediate.

2. **Adaptive Metrics** -- catches what manual control missed: metrics that are on the allow-list but never queried, labels that survive the pattern block but add no value. This is data-driven and ongoing.

The workflow:

```text
Step 1: Apply hardened configs (Chapter 2)
        → Eliminates 50-80% of series immediately

Step 2: Wait 2-4 weeks for Adaptive Metrics to observe

Step 3: Review Adaptive Metrics recommendations
        → Catches another 5-20% of remaining series

Step 4: Feed findings back into allow-lists
        → Metrics that Adaptive Metrics flags as unused
           can be removed from the allow-list permanently
```

Step 4 is important. If Adaptive Metrics consistently flags a metric as unused, remove it from your allow-list so the optimization is permanent and does not depend on the Adaptive Metrics feature remaining enabled.

## When NOT to Use Adaptive Metrics

There are scenarios where Adaptive Metrics recommendations should be treated with extra caution:

**Incident response metrics.** Some metrics are never queried in normal operations but are critical during incidents. If your team has runbooks that reference specific metrics for troubleshooting, those metrics may appear "unused" to Adaptive Metrics. Maintain a protected list of incident-response metrics that should never be aggregated.

**Seasonal or periodic queries.** Metrics queried only during quarterly reviews, annual capacity planning, or seasonal events may fall outside the observation window. If you know certain metrics are queried infrequently, exclude them from recommendations.

**Newly instrumented services.** If you just deployed new instrumentation, give teams time to build dashboards and alerts around the new metrics before applying Adaptive Metrics recommendations to them.

**Compliance and audit metrics.** Some metrics exist for regulatory or audit purposes and may never be queried during normal operations but must be retained.

## Common Mistakes

**Applying all recommendations blindly.** Always review before applying. The system is good but not perfect -- especially in the first few weeks before it has a complete picture of query patterns.

**Relying solely on Adaptive Metrics instead of manual filtering.** Adaptive Metrics is a complement to cardinality control, not a replacement. It cannot reduce series from unused collectors (they still get scraped and processed), and it cannot prevent series explosion from bad label patterns. Use both.

**Not re-reviewing after dashboard changes.** If your team adds new dashboards, some previously applied recommendations may need to be reverted. Check the Adaptive Metrics UI after significant dashboard changes.

**Applying recommendations to metrics used by external systems.** If scripts, CI pipelines, or external monitoring tools query your Prometheus endpoint directly, those queries are invisible to Adaptive Metrics. Audit your non-Grafana consumers before applying recommendations.

**Forgetting to feed learnings back into allow-lists.** If Adaptive Metrics repeatedly flags the same metrics as unused, remove them from your allow-list permanently. This makes the optimization durable and reduces your dependency on the Adaptive Metrics feature.

## Summary

- Adaptive Metrics tracks which metrics are actually queried in Grafana and recommends dropping or aggregating the rest
- Enable it in Grafana Cloud, wait 7-14 days for observation, then review recommendations
- Apply recommendations via the UI, API, or the `grafana.adaptive_metrics` Alloy component
- Typical savings: 20-40% for unoptimized environments, 5-15% on top of hardened configs
- Limitations: only tracks Grafana-originated queries, has recommendation lag, and aggregated labels cannot be recovered
- Use it as a complement to manual cardinality control, not a replacement
- Protect incident-response, seasonal, compliance, and newly instrumented metrics from aggressive optimization
