# Layer 5: Service Filter (Windows)

> TODO: Write this section.

## Overview

This is the single biggest cardinality gotcha on Windows. Without filtering, every Windows service generates multiple series across multiple state labels. A typical server with ~150 services and 8 states produces **~1,200+ series** from services alone.

## Key Concepts

- The Windows service state explosion: services x states = series
- Filtering to essential services only (~12-15 services)
- Filtering to relevant states only (running/stopped vs all 8 states)
- The temp-label technique (`__keepme`) to tag and filter in a single relabel chain
- Unfiltered: ~1,200 series. Filtered: ~24 series.

## Examples

## Common Mistakes

- Forgetting to filter services and wondering why your series count is sky-high
- Filtering services but not states

## Summary
