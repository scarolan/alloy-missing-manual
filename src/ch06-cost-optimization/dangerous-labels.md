# Dangerous Label Patterns

> TODO: Write this section.

## Overview

Certain label values create cardinality explosions. Learn to recognize and eliminate them.

## The Danger List

- **User IDs** — unique per user = unbounded cardinality
- **Request IDs** — unique per request = infinite growth
- **IP addresses** — high cardinality in dynamic environments
- **Email addresses** — same as user IDs
- **Timestamps** — every value is unique by definition
- **Full URLs** — path parameters create unique series
- **Error messages** — slight variations create new series
- **Span names with embedded IDs** — common in OTEL instrumentation

## Key Concepts

- Why dropping labels isn't always safe (can create duplicate series that Prometheus rejects)
- Using recording rules to aggregate before dropping
- Using `otelcol.processor.transform` to normalize high-cardinality attributes

## Examples

## Summary
