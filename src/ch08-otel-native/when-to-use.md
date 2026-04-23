# When to Use OTEL Native vs Alloy Config

> TODO: Write this section.

## Overview

Decision framework for choosing between OTEL-native YAML and Alloy config syntax.

## Choose OTEL Native When

- You have existing OTEL Collector configs to migrate
- Your team already knows OTEL Collector YAML
- You want maximum portability across vendors
- You primarily use standard OTEL receivers/processors/exporters

## Choose Alloy Config When

- You need Alloy-specific components (node_exporter, windows_exporter, journal)
- You're using Fleet Management
- You're already invested in the Alloy config ecosystem
- You need the Web UI pipeline visualization (check OTEL-native support)

## Can You Mix Them?

## Summary
