# Layer 1: Allow-List

> TODO: Write this section.

## Overview

The allow-list is the most impactful single filter. It keeps only metrics you explicitly name and drops everything else.

## Key Concepts

- Using `prometheus.relabel` with `action = "keep"` and `source_labels = ["__name__"]`
- The `join()` function to build readable regex from a list of metric names
- Starting from your dashboard's required metrics and working backwards
- Why allow-list beats deny-list (new metrics from upgrades don't surprise you)

## Example: Node Exporter Full (Dashboard 1860)

The ~208 metric names needed for the complete dashboard.

## Example: Windows Exporter (Dashboard 24390)

The ~90 metric names needed.

## Common Mistakes

- Forgetting `up` and `scrape_duration_seconds` in the allow-list
- Using a single giant regex string instead of `join()` (harder to maintain)

## Summary
