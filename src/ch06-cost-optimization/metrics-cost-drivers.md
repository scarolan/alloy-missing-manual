# Metrics: The #1 Cost Driver

Metrics are by far the largest line item on most observability bills. Logs and traces have their own cost models, but metrics -- specifically, the number of active time series -- dominate. Understanding why requires understanding what you actually pay for.

## The Grafana Cloud Cost Model

Grafana Cloud's metrics pricing is built on two dimensions:

1. **Active series** -- the number of unique time series that received a sample in the last 5 minutes
2. **Data Points per Minute (DPM)** -- how frequently each series receives new samples

On the Pro plan, the benchmark rate is approximately **$8 per 1,000 active series per month**. That number is the one to keep in your head. Every 1,000 series you add costs $8/month. Every 1,000 you remove saves $8/month.

The billing formula:

```text
monthly_cost = (active_series / 1000) x (DPM / included_DPM) x price_per_1000_series
```

At a 60-second scrape interval, DPM = 1, which aligns with Grafana Cloud's included tier. Scrape at 15 seconds and DPM = 4 -- you pay 4x more for the same metric.

## What Creates a Series

A time series is one unique combination of metric name plus label key-value pairs. Every distinct combination is a separate series your backend must store, index, and query -- and that you pay for.

```text
node_cpu_seconds_total{cpu="0", mode="idle", instance="web-1"}   -- series 1
node_cpu_seconds_total{cpu="0", mode="user", instance="web-1"}   -- series 2
node_cpu_seconds_total{cpu="1", mode="idle", instance="web-1"}   -- series 3
```

Three series from one metric name, because the label values differ. The math is multiplicative:

```text
total_series = metric_name_count x label_value_combinations
```

A single metric like `node_cpu_seconds_total` on a 4-core host:

```text
4 CPUs x 8 modes = 32 series
```

On a 64-core host:

```text
64 CPUs x 8 modes = 512 series -- from one metric
```

Now multiply that across the hundreds of metric names a default exporter exposes, many of which have their own per-device labels (per disk, per NIC, per filesystem, per service).

## Series Explosion: The Patterns

Series counts blow up through three common patterns:

### Pattern 1: High-Cardinality Labels

A single label with many values multiplies every metric it touches.

| Label | Typical Values | Impact |
|---|---|---|
| `cpu` on a 128-core host | 128 | x128 for every per-CPU metric |
| Windows services (200 running) | 200 | x200 for every per-service metric |
| Container IDs | Hundreds, churning | New series on every deploy |
| Request paths | Thousands | Unbounded growth |

### Pattern 2: Unused Collectors

The node exporter enables dozens of collectors by default. Many produce metrics that no standard dashboard queries:

| Collector | Metrics Generated | Queried by Dashboard 1860? |
|---|---|---|
| `bcache` | 15+ | No |
| `btrfs` | 10+ | No |
| `xfs` | 20+ | No |
| `nfs` / `nfsd` | 30+ | No |
| `infiniband` | 10+ | No |
| `ipvs` | 15+ | No |
| `zfs` | 20+ | No |
| `rapl` | 5+ | No |

Every one of these produces series you pay for but never look at.

### Pattern 3: Ephemeral Infrastructure

Container hosts create and destroy network interfaces (`veth*`, `cali*`), filesystem mounts (`/var/lib/docker/*`), and pods constantly. Each new entity creates new series. Those series go stale in 5 minutes, but the churn means your active series count stays elevated because new entities replace old ones.

## The 80/20 Rule

In most environments, **80% of series are never queried**. They sit in storage, indexed and billed, but no dashboard, alert, or recording rule ever touches them.

This is not a guess. Grafana Cloud's Adaptive Metrics feature (covered in [Adaptive Metrics](adaptive-metrics.md)) tracks which metrics are actually queried. Customers routinely find that the majority of their active series power nothing.

The implication is direct: the biggest cost reduction comes not from optimizing how you store data, but from stopping the collection of data nobody uses.

## The Real Numbers: What Hosts Actually Generate

These numbers come from controlled benchmarks on real cloud VMs (see [Before and After](../ch02-cardinality-control/before-and-after.md) for full methodology):

### Linux

| Configuration | Active Series | Notes |
|---|---|---|
| Unfiltered (all default collectors) | ~2,000/host (typical cloud VM) | Multiple CPUs, disks, NICs compound |
| Hardened (all layers active) | 400-600/host | Full Dashboard 1860 coverage, zero regressions |
| Bare minimum | ~11 | Just "is this host alive?" |

A typical 2-4 vCPU cloud VM with 2 disks and 2 NICs produces approximately 2,000 series with default collectors and no filtering. The hardened config in this book cuts that to 400-600 while preserving every panel on Dashboard 1860 (Node Exporter Full).

### Windows

| Configuration | Active Series | Notes |
|---|---|---|
| Unfiltered (10 collectors, no filtering) | 2,909/host | 200 services on benchmark host |
| Hardened (5 layers active) | ~135/host | Full Dashboard 24390 coverage |
| Bare minimum | 16 | CPU, memory, disk, network only |

The service collector alone accounts for 2,672 of those 2,909 unfiltered series -- 92% of the total. Two hundred services multiplied by multiple states and modes, all shipped to storage untouched.

## Fleet Math: Where It Gets Expensive

Individual host numbers look manageable. Fleet numbers do not.

At **$8 per 1,000 active series per month**:

### 500 Linux Hosts (Typical Cloud VMs)

| Configuration | Series/Host | Fleet Total | Monthly Cost | Annual Cost |
|---|---|---|---|---|
| Unfiltered | ~2,000 | 1,000,000 | **$8,000** | **$96,000** |
| Hardened | ~500 | 250,000 | **$2,000** | **$24,000** |
| **Savings** | | 750,000 | **$6,000/mo** | **$72,000/yr** |

### 200 Windows Servers (Mid-Range Hardware)

| Configuration | Series/Host | Fleet Total | Monthly Cost | Annual Cost |
|---|---|---|---|---|
| Unfiltered | 2,909 | 581,800 | **$4,654** | **$55,854** |
| Hardened | ~190 | 38,000 | **$304** | **$3,648** |
| **Savings** | | 543,800 | **$4,350/mo** | **$52,206/yr** |

### Mixed Fleet (500 Linux + 200 Windows)

| Configuration | Fleet Total | Monthly Cost | Annual Cost |
|---|---|---|---|
| Unfiltered | 1,581,800 | **$12,654** | **$151,854** |
| Hardened | 288,000 | **$2,304** | **$27,648** |
| **Savings** | 1,293,800 | **$10,350/mo** | **$124,206/yr** |

That is over $124,000 per year saved with no loss of dashboard coverage.

## Metrics vs Logs vs Traces

Metrics are usually the dominant cost, but it helps to see how the three pillars compare:

| Signal | Cost Model | Typical Rate | Where It Hurts |
|---|---|---|---|
| **Metrics** | Per active series + DPM | $8/1,000 series/month | High cardinality, unused collectors, scrape frequency |
| **Logs** | Per GB ingested | ~$0.50/GB (varies by plan) | Verbose log levels, health check spam, unfiltered journals |
| **Traces** | Per GB ingested (span bytes) | ~$0.50/GB (varies by plan) | High-throughput services, unbounded attributes |

On a typical infrastructure-monitoring deployment, metrics account for 60-80% of the bill. Logs are second. Traces are third -- unless you have high-throughput application tracing, in which case traces can rival metrics.

The optimization strategies differ by signal type:

- **Metrics**: Reduce active series count (this chapter, and all of Chapter 2)
- **Logs**: Filter by level and source before ingestion (see [Log Filtering](log-filtering.md))
- **Traces**: Sample at the edge, drop low-value spans (tail sampling)

## The DPM Multiplier

Scrape interval directly multiplies your cost:

| Scrape Interval | DPM | Cost Multiplier |
|---|---|---|
| 60 seconds | 1 | 1x (baseline) |
| 30 seconds | 2 | 2x |
| 15 seconds | 4 | 4x |

A fleet of 500 hosts at 15-second intervals costs the same as 2,000 hosts at 60-second intervals. Most infrastructure metrics (CPU, memory, disk, network) do not change meaningfully in 15 seconds. The hardened configs in this book use `scrape_interval = "60s"`.

If you have a specific metric that genuinely needs sub-minute resolution (application latency, request rate), scrape that one target at 15 seconds and leave everything else at 60.

## Common Mistakes

**Treating observability as a fixed cost.** It is not. Observability costs scale linearly with active series count, which scales with fleet size, scrape frequency, and cardinality. A deployment that costs $2,000/month at 200 hosts will cost $10,000/month at 1,000 hosts -- unless you have cardinality controls in place.

**Ignoring metrics costs until the bill arrives.** Series counts grow gradually. New exporters get added, new labels appear, the fleet grows. By the time someone notices the bill, there are hundreds of thousands of unnecessary series baked in. Monitor your active series count proactively with `count({__name__=~".+"})`.

**Scraping at 15-second intervals by default.** This quadruples cost compared to 60-second intervals. Unless you have a documented requirement for sub-minute resolution on specific metrics, use 60 seconds.

**Not filtering at the source.** Sending all metrics to a central location and filtering there means you pay for network transit, WAL storage, and remote write overhead for data you are going to discard anyway. Alloy's `prometheus.relabel` component filters before the data leaves the host.

**Running default exporter configs in production.** The node exporter and Windows exporter are designed to expose everything they can. That is correct behavior for the exporter -- it is your responsibility to filter at the collection layer. The 5-layer cardinality control pattern in [Chapter 2](../ch02-cardinality-control/README.md) is how you do this systematically.

## Summary

- Grafana Cloud metrics cost approximately $8 per 1,000 active series per month on the Pro plan
- A time series is one unique metric name + label combination; series counts are multiplicative
- Unfiltered Linux hosts generate ~2,000 series; hardened configs produce 400-600
- Unfiltered Windows hosts generate ~2,909 series; hardened configs produce ~135
- A mixed fleet of 700 hosts saves over $124,000/year by applying the hardened configs
- 80% of series are never queried -- the biggest savings come from not collecting data nobody uses
- Scrape interval is a direct cost multiplier: 15s costs 4x what 60s costs
- Metrics dominate most observability bills, but logs and traces need their own cost controls too
