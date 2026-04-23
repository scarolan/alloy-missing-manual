# Layer 4: Value Limits

Layers 1 through 3 handle metric names, label value patterns, and missing labels. Layer 4 addresses a subtler problem: label values that are technically valid but excessively long.

A mountpoint like `/data` creates one series. A mountpoint like `/mnt/nfs-cluster-prod/department-engineering/project-alpha/datasets/2024/Q4/raw-telemetry-ingestion-pipeline/staging` creates a different series -- and that 100+ character label value has real consequences for storage, indexing, and query performance.

## Why Long Label Values Are a Problem

Prometheus and Mimir (the backend behind Grafana Cloud) store label values in the index. Every unique label value:

1. **Consumes index space** proportional to its length
2. **Increases memory usage** in the label cache
3. **Slows queries** that scan label values (e.g., label-based filtering, regex matchers)
4. **Creates visual noise** in dashboards and query results

More importantly, deeply nested paths tend to be ephemeral. A mountpoint 120 characters long is likely an application-specific mount that changes with deployments. Each new path creates a new series, and the old one goes stale -- classic cardinality churn.

## The 100-Character Threshold

The hardened configs truncate label values exceeding 100 characters. This threshold is chosen pragmatically:

- Real disk mountpoints (`/`, `/boot`, `/home`, `/var/log`) are well under 100 characters
- Real Windows volume labels (`C:`, `D:`, `E:`) are under 100 characters
- NFS mounts (`/mnt/shared`, `/nfs/data`) are typically under 100 characters
- Paths exceeding 100 characters are almost always auto-generated, deeply nested, or application-specific

If a label value exceeds 100 characters, it is truncated to exactly 100 characters with a `_TRUNCATED` suffix appended. This preserves enough of the path to identify what it refers to while preventing unbounded growth.

## Linux: Mountpoint Truncation

```alloy
// Truncate mountpoint to 100 chars to prevent runaway label cardinality
rule {
    source_labels = ["mountpoint"]
    regex         = "(.{100}).*"
    target_label  = "mountpoint"
    replacement   = "${1}_TRUNCATED"
}
```

### How the Regex Works

The regex `(.{100}).*` uses a capture group:

- `(.{100})` -- captures exactly the first 100 characters into group `${1}`
- `.*` -- matches (and discards) everything after the 100th character

The `replacement = "${1}_TRUNCATED"` substitutes the full value with the first 100 characters followed by the literal string `_TRUNCATED`.

**If the value is 100 characters or fewer**, the regex does not match (`.{100}` requires at least 100 characters), and the rule has no effect. The label value passes through unchanged.

**If the value is 101+ characters**, the regex matches, and the value is replaced with the first 100 characters plus `_TRUNCATED`.

### Example

Before truncation:

```text
mountpoint="/mnt/nfs-cluster-prod/department-engineering/project-alpha/datasets/2024/Q4/raw-telemetry-ingestion-pipeline/staging"
```

This is 128 characters. After the rule fires:

```text
mountpoint="/mnt/nfs-cluster-prod/department-engineering/project-alpha/datasets/2024/Q4/raw-telemetry-in_TRUNCATED"
```

The first 100 characters are preserved, giving you enough context to identify the mount. The `_TRUNCATED` suffix makes it immediately obvious the value was modified.

## Windows: Volume Label Truncation

```alloy
// Truncate volume label to 100 chars to prevent runaway label cardinality
rule {
    source_labels = ["volume"]
    regex         = "(.{100}).*"
    target_label  = "volume"
    replacement   = "${1}_TRUNCATED"
}
```

The same technique applied to Windows volume labels. While standard Windows volumes (`C:`, `D:`) are short, volume labels can become long in environments with:

- Cluster Shared Volumes (CSV) with descriptive names
- Storage Spaces Direct (S2D) volume names
- Third-party storage management tools that generate verbose labels
- Mapped network drives with full UNC paths

## Why Not a Shorter Limit?

You might wonder why 100 characters instead of, say, 50. The tradeoff:

- **Too short**: You truncate legitimate paths and lose diagnostic value. A 50-character limit would truncate `/mnt/data/production/databases/postgresql-primary` (48 chars) at the boundary.
- **Too long**: You allow excessively long values that create cardinality and performance issues.
- **100 characters**: Covers all standard system paths with room to spare, while catching the deeply nested application paths that cause problems.

If your environment has specific patterns (e.g., all NFS mounts are under `/nfs/` and never exceed 60 characters), you can tighten the limit. But 100 is a safe default for general-purpose use.

## Combining with Layer 2

Layer 2 (pattern block) and Layer 4 (value limits) are complementary:

- **Layer 2** drops label values matching specific bad patterns (UUIDs, container paths, virtual devices)
- **Layer 4** catches anything Layer 2 missed by limiting the maximum length

A label value might not contain a UUID and might not be under `/var/lib/docker/` -- but if it is 150 characters long, it is still a cardinality risk. Layer 4 is the safety net.

## Common Mistakes

**Not adding the `_TRUNCATED` suffix.** If you truncate without marking the value, you create an ambiguous situation: is this a real 100-character path, or was it truncated? The suffix makes the modification explicit.

**Applying truncation too early in the pipeline.** Layer 4 should run after Layers 1-3. If you truncate before the pattern block, you might truncate a UUID-containing path to just 100 characters, removing the UUID portion that Layer 2 would have matched. Run truncation last.

**Using truncation as a substitute for proper filtering.** Truncation is a safety net, not a primary filter. If you are seeing many truncated values, investigate whether Layer 2 needs additional pattern rules to drop those metrics entirely.

## Summary

- Layer 4 truncates label values exceeding 100 characters with a `_TRUNCATED` suffix
- Linux truncates `mountpoint` labels; Windows truncates `volume` labels
- The regex `(.{100}).*` captures the first 100 characters and discards the rest
- Values under 100 characters pass through unchanged
- 100 characters covers all standard system paths while catching deeply nested application paths
- This is a safety net that catches what Layers 1-3 miss
