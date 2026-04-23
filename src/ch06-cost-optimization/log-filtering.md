# Log Filtering

> TODO: Write this section.

## Overview

Logs can be as expensive as metrics if you're not filtering. Most log volume is debug/info noise that nobody queries.

## Key Concepts

- `loki.process` with `stage.drop` to filter debug logs in production
- `stage.sampling` with `rate = 0.1` to keep only 10% of info-level logs
- Dropping health check and metrics endpoint logs pre-ingestion
- Rate limiting per stream
- Adaptive Logs in Grafana Cloud for automated optimization

## Examples

## Common Mistakes

- Shipping all log levels to production
- Not filtering health check endpoints (they can be 50%+ of log volume)

## Summary
