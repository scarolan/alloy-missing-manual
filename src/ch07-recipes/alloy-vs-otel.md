# Alloy vs OpenTelemetry Collector

> TODO: Write this section.

## Overview

An honest comparison of when to use Alloy vs the vanilla OpenTelemetry Collector.

## What Alloy adds

- Built-in node_exporter and windows_exporter
- systemd and journal log collection
- conntrack, entropy, ARP, PSI, schedstat, softnet, hwmon, timex, TCP states
- Web UI on port 12345 for pipeline visualization
- Fleet Management for remote configuration
- Grafana-native integrations

## What OTEL Collector does better

- No vendor dependency
- Native YAML configuration
- `memory_limiter` processor for back-pressure
- Automatic resource detection
- Built-in config providers (env, file, http, etc.)
- Broader community contrib ecosystem

## When to choose which

| Use case | Recommendation |
|---|---|
| Dashboard 1860 / Node Exporter Full | Alloy |
| systemd + journal monitoring | Alloy |
| Fleet Management needed | Alloy |
| Zero vendor lock-in required | OTEL Collector |
| Basic host metrics only | Either |
| Already running OTEL Collector | Stay with OTEL |

## Summary
