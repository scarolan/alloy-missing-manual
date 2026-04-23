# Linux: systemd Filtering

> TODO: Write this section.

## Overview

Without filtering, the systemd collector scrapes ALL ~150 units across 5 states, generating ~750 series. Filter to essential services only.

## Key Concepts

- Default behavior: every systemd unit is scraped
- The `unit_include` regex to select specific services
- Recommended services to monitor (~15 essential services = ~75 series)
- Adding custom application services to the filter

## Examples

## Common Mistakes

- Leaving systemd unfiltered and wondering why series count is high
- Filtering too aggressively and missing critical services

## Summary
