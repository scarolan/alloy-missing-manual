# Alloy vs OpenTelemetry Collector

## Overview

A practical comparison of when to use Alloy vs the vanilla OpenTelemetry Collector.

## What Alloy adds

- Built-in node_exporter and windows_exporter
- systemd and journal log collection
- conntrack, entropy, ARP, PSI, schedstat, softnet, hwmon, timex, TCP states
- Web UI on port 12345 for pipeline visualization
- Fleet Management for remote configuration
- Grafana-native integrations

## What OTEL Collector offers differently

- Vendor-neutral distribution
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

## The OTel Engine Changes This Equation

Starting with Alloy v1.13.0, the OTel Engine lets you run standard OTEL Collector YAML configs natively inside Alloy. This eliminates the biggest advantage of the vanilla OTEL Collector (native YAML configuration) while keeping Alloy's packaging and release cadence. See [Chapter 8: OpenTelemetry Native Support](../ch08-otel-native/README.md) for the full story.

## Summary

- Use Alloy when you need deep Prometheus/Loki integration, Fleet Management, or the hardened configs from this book.
- Use the vanilla OTel Collector when your stack is pure OpenTelemetry end-to-end.
- With the OTel Engine (v1.13.0+), Alloy can run OTel Collector YAML natively, narrowing the gap significantly.
