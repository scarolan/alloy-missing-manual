# Before and After: Unfiltered vs Hardened

> TODO: Write this section.

## Overview

Concrete numbers showing the impact of the 5-layer protection pattern.

## Linux

| Configuration | Series per host |
|---|---|
| Unfiltered node_exporter | ~2,000+ |
| Hardened (all layers) | 400-600 |

Scaling factors: ~+5/CPU core, +10/disk, +5/NIC

## Windows

| Configuration | Series per host |
|---|---|
| Unfiltered windows_exporter | ~2,909 |
| Hardened (all layers) | ~135 |

Scaling factors: ~+5/CPU core, +13/disk, +10/NIC

## Fleet Impact

Show the math: 1,000 hosts x (2,909 - 135) = 2,774,000 series saved.

## How to Measure

- Using Grafana Cloud's active series dashboard
- Querying `count({__name__=~".+"})` by job
- Using the Alloy Web UI metrics

## Summary
