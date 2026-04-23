# When to Use OTEL Native vs Alloy Config

## The Decision Framework

There is no universal answer. The right choice depends on what you are collecting, what your team already knows, and how much you care about vendor portability. Here is a structured way to think through it.

## Choose OTel Engine (YAML) When

### Your team already runs OTEL Collector
If you have existing OTEL Collector YAML configs that work, the OTel Engine lets you bring them into Alloy verbatim. No conversion. No new syntax to learn. You get Alloy's binary packaging and release cadence while keeping your config files untouched.

### You want maximum portability
An OTel Engine YAML config (minus the `alloyengine` extension) is a standard OTEL Collector config. You can take that same file and run it on the vanilla OTEL Collector binary, or on any other OTEL distribution. No vendor lock-in on the config layer.

### Your pipelines are OTLP-centric
If your workloads emit OTLP (traces, metrics, logs) and you ship to OTLP-compatible backends, the OTel Engine is a natural fit. The receiver/processor/exporter model maps directly to your data flow.

### You need upstream contrib components
The OTel Engine bundles components from both core and contrib repositories. If you need specialized receivers like `awscloudwatch`, `vcenter`, `solace`, or connectors like `spanmetrics` and `servicegraph`, the OTel Engine gives you native access.

### You are building a multi-vendor observability stack
If your organization sends telemetry to multiple backends (e.g., Grafana Cloud for metrics, Datadog for traces, Splunk for logs), the standard OTEL pipeline model makes this straightforward with multiple exporters on the same pipeline.

### New team members know OTEL but not Alloy
The OpenTelemetry Collector YAML format is documented extensively across the OTEL ecosystem. If your hiring pool knows OTEL Collector and not Alloy config syntax, the OTel Engine reduces onboarding friction.

## Choose Default Engine (Alloy Config) When

### You need `prometheus.exporter.unix` or `prometheus.exporter.windows`
This is the single biggest deciding factor for host monitoring. If you use Dashboard 1860 (Node Exporter Full) or need `node_*` metric naming, you must use the Default Engine. The OTel Engine's `hostmetrics` receiver produces `system.*` metrics with different semantics.

### You need systemd or journal monitoring
The Default Engine has `loki.source.journal` for native systemd journal collection and the systemd collector in `prometheus.exporter.unix` for unit state monitoring. The OTel Engine has no equivalent. If tracking whether `sshd.service` is running matters to you, stay on the Default Engine.

### You need specialized Linux kernel metrics
conntrack table usage, entropy available, ARP table size, PSI (Pressure Stall Information), schedstat, softnet, hwmon temperatures, timex clock sync, TCP connection states -- these all come from `prometheus.exporter.unix` collectors that have no OTel Engine counterpart.

### You use Fleet Management
Grafana Fleet Management does not support the OTel Engine yet. If you manage Alloy configs remotely through Fleet Management, you must use the Default Engine for those managed pipelines.

### You depend on the Web UI
The Alloy web UI on port 12345 -- the pipeline graph, component status, debug info -- only works with the Default Engine. The OTel Engine HTTP server on port 8888 does not expose a UI, support bundles, or the reload endpoint.

### You need hot-reload
The Default Engine supports config reload via the `/-/reload` HTTP endpoint. The OTel Engine requires a full process restart for config changes.

### You are already invested in Alloy config
If you have a large library of Alloy config files, modules, and tooling built around the block-based syntax, switching to YAML gains you nothing and costs you a rewrite.

### You need production stability
The OTel Engine is experimental. If your monitoring is mission-critical and you cannot tolerate breaking changes between minor releases, stay on the Default Engine.

## Can You Mix Them? The Hybrid Approach

Yes. The `alloyengine` extension lets you run both engines simultaneously in a single Alloy instance.

### How it works

Your primary config is OTel Engine YAML. Inside it, you declare the `alloyengine` extension that points to an Alloy config file:

```yaml
extensions:
  alloyengine:
    config:
      file: /etc/alloy/host-monitoring.alloy
    flags:
      server.http.listen-addr: 0.0.0.0:12345

receivers:
  otlp:
    protocols:
      grpc: {}
      http: {}

processors:
  batch: {}

exporters:
  otlphttp/backend:
    endpoint: https://otlp.example.com

service:
  extensions: [alloyengine]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/backend]
```

The Alloy config file (`host-monitoring.alloy`) handles the Alloy-specific components:

```
// Host metrics with node_* naming for Dashboard 1860
prometheus.exporter.unix "default" {
  // ... your existing host metrics config
}

prometheus.scrape "host" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.remote_write.default.receiver]
}

prometheus.remote_write "default" {
  endpoint {
    url = "https://prometheus.example.com/api/v1/push"
  }
}

// Journal logs
loki.source.journal "default" {
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "https://loki.example.com/loki/api/v1/push"
  }
}
```

### Hybrid limitations

- **No data sharing between engines** -- The two pipelines run in parallel but cannot pass data to each other. The OTel Engine pipeline and the Default Engine pipeline each ship their own telemetry independently.
- **Port conflict management** -- The Default Engine defaults to port 12345 and the OTel Engine to port 8888. When running hybrid, you must explicitly configure ports in the `alloyengine` flags to avoid conflicts.
- **Two configs to maintain** -- You now have two configuration files with different syntax, which increases operational complexity.

### When hybrid makes sense

The hybrid approach is the right call when:

- You want OTEL-standard pipelines for traces and application metrics (OTel Engine)
- But you also need `prometheus.exporter.unix`, `loki.source.journal`, or Fleet Management (Default Engine)
- You are migrating incrementally and want to move pipeline by pipeline

## Decision Matrix

| Scenario | Recommendation |
|---|---|
| Greenfield OTLP-only deployment | OTel Engine |
| Existing OTEL Collector configs to migrate | OTel Engine |
| Host monitoring with Dashboard 1860 | Default Engine |
| systemd + journal log collection | Default Engine |
| Fleet Management required | Default Engine |
| OTLP traces + host metrics on same host | Hybrid (OTel Engine + `alloyengine`) |
| Multi-vendor backend (Grafana + Datadog + Splunk) | OTel Engine |
| Production-critical, zero tolerance for breaking changes | Default Engine |
| Team knows OTEL Collector, not Alloy | OTel Engine |
| Team knows Alloy, not OTEL Collector | Default Engine |
| Kubernetes with OTel Operator/Helm charts | OTel Engine |
| Need Web UI for pipeline debugging | Default Engine (or Hybrid) |

## The Honest Take

The OTel Engine is a strategic move by Grafana to make Alloy the "just use this" answer for any team adopting OpenTelemetry. It removes the biggest objection to Alloy: "I don't want to learn a proprietary config language."

But as of April 2026, it is experimental. The Default Engine is mature, well-tested, and production-proven. For most existing Alloy users, there is no urgent reason to switch. The OTel Engine is most compelling for:

1. Teams currently running vanilla OTEL Collector who want Alloy's packaging
2. Organizations standardizing on OTEL and unwilling to adopt vendor-specific config formats
3. Kubernetes environments already using OTEL Helm charts and operators

If none of those describe you, keep using Alloy config syntax. The OTel Engine will be there when (and if) you need it.
