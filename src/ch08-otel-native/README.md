# OpenTelemetry Native Support

In February 2026 (v1.13.0), Grafana shipped a second runtime inside the Alloy binary: the **OTel Engine**. For the first time, you can hand Alloy a standard OpenTelemetry Collector YAML config and run it natively -- no conversion, no new syntax to learn.

This is the most significant architectural change since Alloy replaced Grafana Agent. It means teams already running OTEL Collector can adopt Alloy without rewriting their configs, and organizations standardizing on OpenTelemetry no longer have to choose between vendor tooling and community standards.

> **Status:** The OTel Engine is **experimental** as of v1.16.0 (April 2026). Grafana is iterating based on community feedback. Existing `alloy run` workflows are completely unaffected.

## What you'll learn

- [**What Changed**](what-changed.md) -- When the OTel Engine was introduced, how to invoke it, what components are available, and what you lose compared to the Default Engine
- [**Migration from Alloy Config**](migration.md) -- Component-by-component mapping from Alloy syntax to OTel YAML, behavioral differences, what you gain and lose, and a practical migration workflow
- [**When to Use OTEL Native vs Alloy Config**](when-to-use.md) -- A clear decision framework, the hybrid approach with `alloyengine`, and an honest assessment of where each engine fits
- [**Example Configurations**](examples.md) -- Six side-by-side examples: basic metrics, traces with tail sampling, log collection, host monitoring, hybrid deployment, and Kubernetes with Helm
