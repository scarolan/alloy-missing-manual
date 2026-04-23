# Linux: Journal Logs

> TODO: Write this section.

## Overview

Collecting logs from the systemd journal with Alloy, including filtering, rate limiting, and preventing backfill on restart.

## Key Concepts

- `loki.source.journal` component
- Filtering by priority (drop debug/info, keep warn+)
- Filtering by unit (only keep specific services)
- Rate limiting per stream: `stage.limit { rate = 100, burst = 500, drop = true }`
- `max_age = "12h"` to prevent shipping old logs on restart
- Using `stage.drop { older_than = "4h" }` as an additional safety net
- Relabel rules for unit, boot_id, transport, level

## Examples

## Common Mistakes

- Not setting `max_age`, causing a flood of old logs on service restart
- Collecting debug-level logs from all units in production

## Summary
