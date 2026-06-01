# Cardinality Control

This is the money chapter. Literally.

Every metric series you send to Grafana Cloud (or any Prometheus-compatible backend) costs money. An unfiltered Alloy deployment on a single Windows server can generate **2,900+ series**. A hardened config for the same server: **~135 series**. That's a 21x difference.

Multiply that across a fleet of hundreds or thousands of hosts and you're looking at the difference between a reasonable observability bill and a budget emergency.

This chapter teaches a layered protection pattern that gives you predictable, controlled series counts without losing the metrics you actually need.

> **Want the complete configs?** The production-ready implementations of everything in this chapter are available as standalone repositories: [hardened-grafana-alloy-linux](https://github.com/scarolan/hardened-grafana-alloy-linux) and [hardened-grafana-alloy-windows](https://github.com/scarolan/hardened-grafana-alloy-windows). Each includes the full 5-layer config, deployment guides, and test suites.

## What you'll learn

- Why cardinality is the #1 cost driver in observability
- A 5-layer filtering pattern that works on both Linux and Windows
- How to go from thousands of series to hundreds per host
- How to verify your filtering is working

## The 5-Layer Pattern

1. **Allow-List** — Only named metrics pass through. Everything else is dropped.
2. **Pattern Block** — Drop metrics with high-cardinality label values (UUIDs, container paths, virtual interfaces).
3. **Label Tagging** — Metrics missing required labels get tagged instead of silently dropped.
4. **Value Limits** — Truncate excessively long label values.
5. **Service Filter** — (Windows) Control the service cardinality explosion.

Each layer catches what the previous one missed. Together, they give you defense in depth.
