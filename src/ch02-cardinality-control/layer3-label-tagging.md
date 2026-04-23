# Layer 3: Label Tagging

Layers 1 and 2 drop metrics that should not exist. Layer 3 handles a different problem: metrics that *should* exist but arrive in an unexpected state. Specifically, metrics that are missing labels they are supposed to have.

The conventional approach is to drop these metrics. The hardened config takes a different path: **tag them with a warning label instead of dropping them.** This preserves visibility for debugging while clearly marking data quality issues.

## The Problem: Missing Labels

Certain metric families require specific labels to be meaningful:

| Metric Family | Required Labels | Why |
|---------------|----------------|-----|
| `node_filesystem_*` | `device`, `fstype` | Without these, you cannot distinguish between `/dev/sda1` and `/dev/sdb1`, or between `ext4` and `xfs` |
| `node_network_*` | `device` | Without this, you cannot distinguish between `eth0` and `eth1` |
| `node_disk_*` | `device` | Without this, disk I/O metrics are meaningless |
| `node_cpu_*` | `cpu` | Without this, you cannot distinguish between CPU cores |
| `windows_logical_disk_*` | `volume` | Without this, you cannot distinguish between `C:` and `D:` |
| `windows_net_*` | `nic` | Without this, you cannot distinguish between NICs |
| `windows_cpu_*` | `core` | Without this, you cannot distinguish between cores |

If a metric arrives without its expected labels, something is wrong upstream. Possible causes:

- A misconfigured relabel rule accidentally stripped a label
- A custom exporter is emitting metrics without standard labels
- A proxy or middleware is stripping labels in transit
- An Alloy pipeline bug is consuming labels before they reach this stage

## Why Tag Instead of Drop

Silently dropping a metric that is missing a label means you will never know it happened. The metric just disappears. When someone notices a gap in their dashboard days later, debugging is extremely difficult -- you have to figure out that a metric existed, was scraped, entered the pipeline, and was then dropped somewhere.

Tagging the metric with `quality_warning="missing_required_labels"` means:

1. **The metric still arrives at your backend** -- dashboards that do not filter on the missing label still work
2. **The problem is visible** -- a simple query reveals all affected metrics
3. **No data is lost** -- you can investigate and fix the root cause before deciding whether to drop

This is the observability equivalent of a compiler warning vs. a compiler error. Warnings let you ship while alerting you to problems. Errors block everything.

## The `quality_warning` Technique

### Linux Rules

The hardened Linux config tags four metric families:

```alloy
// Filesystem metrics SHOULD have device + fstype
rule {
    source_labels = ["__name__", "device", "fstype"]
    regex         = "node_filesystem_.+;;"
    target_label  = "quality_warning"
    replacement   = "missing_required_labels"
}

// Network metrics SHOULD have device
rule {
    source_labels = ["__name__", "device"]
    regex         = "node_network_.+;"
    target_label  = "quality_warning"
    replacement   = "missing_required_labels"
}

// Disk metrics SHOULD have device
rule {
    source_labels = ["__name__", "device"]
    regex         = "node_disk_.+;"
    target_label  = "quality_warning"
    replacement   = "missing_required_labels"
}

// CPU metrics SHOULD have cpu label (except load averages)
rule {
    source_labels = ["__name__", "cpu"]
    regex         = "node_cpu_.+;"
    target_label  = "quality_warning"
    replacement   = "missing_required_labels"
}
```

### Windows Rules

The hardened Windows config tags three metric families:

```alloy
// Logical disk metrics SHOULD have volume
rule {
    source_labels = ["__name__", "volume"]
    regex         = "windows_logical_disk_.+;"
    target_label  = "quality_warning"
    replacement   = "missing_required_labels"
}

// Network metrics SHOULD have nic
rule {
    source_labels = ["__name__", "nic"]
    regex         = "windows_net_.+;"
    target_label  = "quality_warning"
    replacement   = "missing_required_labels"
}

// CPU metrics SHOULD have core
rule {
    source_labels = ["__name__", "core"]
    regex         = "windows_cpu_.+;"
    target_label  = "quality_warning"
    replacement   = "missing_required_labels"
}
```

### How the Regex Works

The key is the trailing semicolons in the regex. When `source_labels` lists multiple labels, their values are joined with `;` (the default separator). So for:

```alloy
source_labels = ["__name__", "device", "fstype"]
regex         = "node_filesystem_.+;;"
```

If a `node_filesystem_*` metric arrives with both `device` and `fstype` empty (or absent), the concatenated value looks like:

```text
node_filesystem_size_bytes;;
```

This matches `node_filesystem_.+;;` -- the `.+` matches the metric name, and the two consecutive semicolons confirm both `device` and `fstype` are empty.

If the labels are present:

```text
node_filesystem_size_bytes;/dev/sda1;ext4
```

This does NOT match `node_filesystem_.+;;` because there is content between and after the semicolons. The rule does not fire and no tag is added.

For single-label checks like `node_network_.+;`, the pattern matches when `device` is empty:

```text
node_network_receive_bytes_total;     <-- matches (device empty)
node_network_receive_bytes_total;eth0 <-- does not match
```

## Querying for Tagged Metrics

To find all metrics with quality warnings across your fleet:

```promql
{quality_warning=~".+"}
```

To count how many series have quality warnings:

```promql
count({quality_warning=~".+"})
```

To see which metric names are affected:

```promql
count by (__name__) ({quality_warning=~".+"})
```

To find affected hosts:

```promql
count by (instance) ({quality_warning=~".+"})
```

These queries make data quality issues immediately visible in your Grafana Explore view. You can also build an alert rule:

```promql
count({quality_warning=~".+"}) > 0
```

This fires whenever any metric in your fleet is tagged with a quality warning, giving you a heads-up to investigate.

## When You Might See Warnings

In practice, quality warnings appear when:

1. **A custom relabel rule upstream strips labels.** For example, a rule that drops all labels matching a regex accidentally catches `device` or `fstype`.
2. **A synthetic test fixture emits metrics without all labels.** The hardened config's own test suite generates synthetic metrics -- some intentionally lack labels to test this tagging behavior.
3. **A third-party exporter uses non-standard label names.** Some exporters use `dev` instead of `device`, or `disk` instead of `volume`.
4. **An Alloy pipeline has a bug.** If a component in the pipeline consumes or renames a label before the relabel stage, the metric arrives without the expected label.

## Common Mistakes

**Dropping instead of tagging.** If you change the `replacement` action to `drop`, you lose the metric entirely. When debugging missing data, you will have no trace that the metric ever existed in the pipeline.

**Not monitoring the quality_warning label.** Tagging is only useful if someone looks at the tags. Set up a simple alert or dashboard panel that queries `{quality_warning=~".+"}` so you are notified when quality issues appear.

**Over-tagging.** Not every metric family needs label validation. Only tag families where missing labels make the metric genuinely ambiguous. The hardened configs limit tagging to per-device metrics (filesystem, network, disk, CPU) where the label is essential for disambiguation.

## Summary

- Layer 3 tags metrics missing required labels with `quality_warning="missing_required_labels"`
- This preserves data for debugging instead of silently dropping
- Linux: validates `device`/`fstype` on filesystem, `device` on network/disk, `cpu` on CPU metrics
- Windows: validates `volume` on logical_disk, `nic` on network, `core` on CPU metrics
- Query `{quality_warning=~".+"}` to find all tagged metrics across your fleet
- Consider alerting on the presence of tagged metrics to catch pipeline misconfigurations early
