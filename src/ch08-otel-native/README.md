# OpenTelemetry Native Support

Grafana recently introduced OTEL-native configuration support in Alloy, allowing you to use standard OpenTelemetry Collector YAML configuration directly instead of (or alongside) Alloy's custom config syntax.

This is a significant shift. It means you can bring existing OTEL Collector configs into Alloy with minimal changes, and new users familiar with the OTEL ecosystem don't have to learn a second config language.

## What you'll learn

- What changed and why it matters
- How to migrate existing Alloy configs to OTEL-native format
- When to use OTEL-native vs Alloy config syntax
- Working examples in both formats
