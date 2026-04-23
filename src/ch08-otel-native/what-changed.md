# What Changed

## The Big Picture

Starting with **v1.13.0** (February 2026), Grafana Alloy ships with an embedded OpenTelemetry Collector runtime -- called the **OTel Engine** -- alongside the original Alloy runtime (now called the **Default Engine**). With **v1.14.0** (March 2026) the feature received its first public blog post, an overview dashboard, and Helm chart compatibility fixes. The OTel Engine lets you hand Alloy a standard OpenTelemetry Collector YAML file and run it natively, no conversion step required.

This is not a wrapper or a shim. The OTel Engine is a real, bundled OpenTelemetry Collector distribution compiled into the same `alloy` binary you already run. When you invoke `alloy otel`, you get the upstream collector runtime with all its semantics, plus access to Alloy-specific components through an extension.

> **Status as of April 2026:** The OTel Engine is **experimental**. Grafana is explicit: "Experimental features are subject to frequent breaking changes, and may be removed with no equivalent replacement." Your existing `alloy run` workflow is completely unaffected unless you opt in.

## Timeline

| Date | Version | What Happened |
|------|---------|---------------|
| Oct 2025 | -- | [Proposal issue #4705](https://github.com/grafana/alloy/issues/4705) opened: "Add OTel Collector Engine Support to Alloy" |
| Feb 2026 | v1.13.0 | OTel Engine and `alloyengine` extension added to codebase; `otel` subcommand exposed with documentation |
| Mar 2026 | v1.14.0 | OTel Engine Overview dashboard added; Helm chart compatibility fixes; upstream OTel Collector upgraded |
| Mar 12, 2026 | -- | [Blog post by Bejal Lewis](https://grafana.com/blog/native-opentelemetry-inside-alloy-now-you-can-get-the-best-of-both-worlds/): "Native OpenTelemetry inside Alloy: Now you can get the best of both worlds" |
| Mar 2026 | v1.15.0 | OTel Collector components upgraded to v0.147.0 |
| Apr 21, 2026 | -- | GrafanaCON 2026 session: "What's new in Grafana Alloy's OpenTelemetry engine" (speakers: Bejal Lewis, Marko Bachvarovski) |
| Apr 2026 | v1.16.0 | Continued maintenance; OTel Engine remains experimental |

## Key Terminology

Grafana introduced four terms you need to internalize:

1. **Engine** -- The runtime that instantiates components and pipelines. Alloy now has two.
2. **Default Engine** -- The original Alloy runtime. Uses Alloy config syntax (the block-based language you already know). Invoked with `alloy run`.
3. **OTel Engine** -- The new embedded OpenTelemetry Collector runtime. Uses standard Collector YAML. Invoked with `alloy otel`.
4. **Alloy Engine Extension** (`alloyengine`) -- A custom OTel Collector extension that starts a Default Engine pipeline *inside* the OTel Engine, enabling hybrid operation.

## How to Invoke the OTel Engine

### Run with OTEL Collector YAML

```bash
# Run Alloy using an OpenTelemetry Collector config file
alloy otel --config=config.yaml

# Validate the config without starting
alloy otel validate --config=config.yaml
```

The `alloy otel` command accepts the same flags as the upstream OpenTelemetry Collector. Run `alloy otel --help` to see them all.

### Compare with existing approaches

There are now **three** ways to use OTEL Collector configs with Alloy:

| Approach | Command | What It Does | Available Since |
|----------|---------|-------------|-----------------|
| **OTel Engine** (new) | `alloy otel --config=config.yaml` | Runs the native OTEL Collector runtime inside Alloy | v1.13.0 |
| **Runtime converter** | `alloy run --config.format=otelcol config.yaml` | Converts OTEL YAML to Alloy syntax on-the-fly, then runs the Default Engine | v1.0+ |
| **Static converter** | `alloy convert --source-format=otelcol --output=config.alloy config.yaml` | One-time conversion to Alloy syntax file | v1.0+ |

The OTel Engine is fundamentally different from the converter approaches. The converters translate YAML into Alloy config and run it on the Default Engine. The OTel Engine runs the upstream collector runtime directly -- no translation.

## What Components Are Available in OTel Engine Mode

As of v1.15.1, the OTel Engine bundles **OpenTelemetry Collector v0.147.0** components from both core and contrib repositories:

### Receivers (26)
`awscloudwatch`, `awsecscontainermetrics`, `awss3`, `cloudflare`, `datadog`, `faro`, `filelog`, `filestats`, `fluentforward`, `googlecloudpubsub`, `hostmetrics`, `influxdb`, `jaeger`, `k8sobjectsreceiver`, `kafka`, `kubeletstatsreceiver`, `otlp`, `prometheus`, `prometheusremotewrite`, `solace`, `splunkhec`, `syslog`, `tcplog`, `vcenter`, `zipkin`

### Processors (17)
`attributes`, `batch`, `cumulativetodelta`, `deltatocumulative`, `filter`, `groupbyattrs`, `interval`, `k8sattributes`, `memorylimiter`, `metricstarttime`, `probabilisticsampler`, `resource`, `resourcedetection`, `span`, `tailsampling`, `transform`

### Exporters (16)
`awss3`, `debug`, `faro`, `file`, `googlecloud`, `googlecloudpubsub`, `kafka`, `loadbalancing`, `nop`, `otlp`, `otlphttp`, `prometheus`, `prometheusremotewrite`, `splunkhec`, `syslog`, `zipkin`

### Extensions (11)
`alloyengine`, `basicauth`, `bearertokenauth`, `filestorage`, `headerssetter`, `healthcheck`, `jaegerremotesampling`, `oauth2clientauth`, `pprof`, `sigv4auth`, `zpages`

### Connectors (5)
`count`, `forward`, `grafanacloud`, `servicegraph`, `spanmetrics`

### Configuration Providers (5)
`env`, `file`, `http`, `https`, `yaml`

## What Is NOT Available in OTel Engine Mode

This is the critical part. The OTel Engine runs the upstream collector runtime, so **Alloy-specific components do not exist** in OTel Engine mode unless you use the `alloyengine` extension for hybrid operation. Things you lose in pure OTel Engine mode:

| Missing Capability | Alloy Default Engine Component | OTel Engine Alternative |
|---|---|---|
| Node Exporter metrics (`node_*` naming) | `prometheus.exporter.unix` | `hostmetrics` receiver (uses `system.*` naming) |
| Windows Exporter metrics | `prometheus.exporter.windows` | `hostmetrics` receiver (partial) |
| systemd unit monitoring | `prometheus.exporter.unix` (systemd collector) | No equivalent |
| Journal log collection | `loki.source.journal` | No direct equivalent; use `filelog` on `/var/log/journal` |
| Web UI on port 12345 | Built-in | Not available (OTel Engine HTTP server does not expose a UI) |
| Pipeline visualization | Built-in graph view | Not available |
| Fleet Management | Grafana Fleet Management integration | Not supported yet |
| Support bundles | Built-in endpoint | Not available |
| Reload endpoint | `/-/reload` | Not available |
| Service installation | systemd/launchd support | Not included in initial experimental release |
| Dashboard 1860 compatibility | `node_*` metric naming | Requires OTel-native dashboards (e.g., dashboard 15983) |

### Port Differences

| | Default Engine | OTel Engine |
|---|---|---|
| HTTP server | `0.0.0.0:12345` | `0.0.0.0:8888` |
| OTLP gRPC | Configured per-component | `0.0.0.0:4317` (default) |
| OTLP HTTP | Configured per-component | `0.0.0.0:4318` (default) |

### Storage Differences

- **Default Engine:** Uses the `--storage.path` CLI flag for component data storage.
- **OTel Engine:** Uses the `filestorage` extension instead of a CLI flag.

## The Bottom Line

The OTel Engine is a genuine paradigm shift for Alloy. For the first time, teams already running OTEL Collector can adopt Alloy without learning a new config language. Teams standardizing on OpenTelemetry can use the industry-standard YAML format while getting Alloy's binary, packaging, and (via the hybrid extension) access to Alloy-specific features like `prometheus.exporter.unix`.

But it is experimental. Do not deploy it to production expecting stability. The Grafana team is iterating based on community feedback, and breaking changes are expected.

## Further Reading

- [The OpenTelemetry Engine setup guide](https://grafana.com/docs/alloy/latest/set-up/otel_engine/)
- [OpenTelemetry in Alloy overview](https://grafana.com/docs/alloy/latest/introduction/otel_alloy/)
- [CLI reference for `alloy otel`](https://grafana.com/docs/alloy/latest/reference/cli/otel/)
- [Blog: Native OpenTelemetry inside Alloy](https://grafana.com/blog/native-opentelemetry-inside-alloy-now-you-can-get-the-best-of-both-worlds/)
- [GitHub proposal: Issue #4705](https://github.com/grafana/alloy/issues/4705)
