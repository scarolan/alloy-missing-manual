# Windows: Event Logs

> TODO: Write this section.

## Overview

Collecting Windows Event Logs with `loki.source.windowsevent`.

## Key Concepts

- Selecting which event logs to collect (Application, System, Security)
- Using `xpath_query` to filter by event level
- Why the Security log needs special consideration (extremely chatty on domain controllers)
- Structured vs unstructured event log data

## Examples

## Common Mistakes

- Collecting the Security log without filtering on a domain controller
- Not using xpath filtering and shipping millions of events

## Summary
