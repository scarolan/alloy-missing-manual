# Layer 4: Value Limits

> TODO: Write this section.

## Overview

Excessively long label values (deeply nested mount paths, long service display names) create unique series and waste storage. Truncate them.

## Key Concepts

- Truncating mountpoint labels over 100 characters with `_TRUNCATED` suffix
- Why long label values are problematic for both cardinality and query performance
- Using `prometheus.relabel` with regex capture groups for truncation

## Examples

## Common Mistakes

## Summary
