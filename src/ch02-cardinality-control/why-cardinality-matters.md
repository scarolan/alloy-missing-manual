# Why Cardinality Matters

> TODO: Write this section.

## Overview

Cardinality = the number of unique time series. Each unique combination of metric name + label key/value pairs = one series. Costs scale with active series count.

## Key Concepts

- Active series count and how it's calculated
- Data points per minute (DPM) and how over-sampling increases cost
- The multiplicative nature of labels: 100 hosts x 50 metrics x 10 label values = 50,000 series
- Why default Alloy configs generate far more series than dashboards need

## The Dashboard Test

If a metric isn't used in a dashboard, alert rule, or recording rule — why are you paying to store it?

## Common Mistakes

## Summary
