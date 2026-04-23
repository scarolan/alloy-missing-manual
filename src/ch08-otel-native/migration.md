# Migration from Alloy Config

## Overview

Migration between Alloy config syntax and OTel Engine YAML is not a simple find-and-replace. The two engines are different runtimes with different component ecosystems. This chapter walks through the mapping, the gaps, and a practical workflow for moving between them.

> **Important distinction:** This chapter covers migrating *from Alloy config syntax to OTel Engine YAML* (for teams wanting to standardize on upstream OTEL). If you are coming *from an existing OTEL Collector to Alloy's Default Engine*, Grafana provides the `alloy convert --source-format=otelcol` tool and the `alloy run --config.format=otelcol` runtime flag -- see the [official migration guide](https://grafana.com/docs/alloy/latest/set-up/migrate/from-otelcol/).

## Component Mapping: Alloy Config to OTel Engine YAML

### Receivers (Data Ingestion)

| Alloy Component | OTel Engine Equivalent | Notes |
|---|---|---|
| `otelcol.receiver.otlp` | `otlp` receiver | Direct mapping; same underlying code |
| `otelcol.receiver.prometheus` | `prometheus` receiver | Direct mapping |
| `otelcol.receiver.kafka` | `kafka` receiver | Direct mapping |
| `otelcol.receiver.jaeger` | `jaeger` receiver | Direct mapping |
| `otelcol.receiver.zipkin` | `zipkin` receiver | Direct mapping |
| `otelcol.receiver.syslog` | `syslog` receiver | Direct mapping |
| `prometheus.exporter.unix` | `hostmetrics` receiver | **Different metric names**: `node_*` becomes `system.*` |
| `prometheus.exporter.windows` | `hostmetrics` receiver | Partial coverage only |
| `prometheus.scrape` | `prometheus` receiver | Different config structure |
| `loki.source.journal` | `filelog` receiver | Must target journal files manually; no native journal support |
| `loki.source.file` | `filelog` receiver | Similar but different config syntax |
| `loki.source.syslog` | `syslog` receiver | Direct mapping |

### Processors

| Alloy Component | OTel Engine Equivalent | Notes |
|---|---|---|
| `otelcol.processor.batch` | `batch` processor | Direct mapping |
| `otelcol.processor.memory_limiter` | `memorylimiter` processor | Direct mapping |
| `otelcol.processor.attributes` | `attributes` processor | Direct mapping |
| `otelcol.processor.filter` | `filter` processor | Direct mapping |
| `otelcol.processor.transform` | `transform` processor | Direct mapping |
| `otelcol.processor.tail_sampling` | `tailsampling` processor | Direct mapping |
| `otelcol.processor.resourcedetection` | `resourcedetection` processor | Direct mapping |
| `otelcol.processor.k8sattributes` | `k8sattributes` processor | Direct mapping |
| `otelcol.processor.deltatocumulative` | `deltatocumulative` processor | Direct mapping |
| `prometheus.relabel` | `transform` processor / `attributes` processor | No direct equivalent; use OTTL transform expressions |

### Exporters (Data Output)

| Alloy Component | OTel Engine Equivalent | Notes |
|---|---|---|
| `otelcol.exporter.otlp` | `otlp` exporter | Direct mapping |
| `otelcol.exporter.otlphttp` | `otlphttp` exporter | Direct mapping |
| `otelcol.exporter.prometheus` | `prometheus` exporter | Direct mapping |
| `prometheus.remote_write` | `prometheusremotewrite` exporter | Different auth config structure |
| `otelcol.exporter.kafka` | `kafka` exporter | Direct mapping |
| `loki.write` | `otlphttp` exporter (to Loki's OTLP endpoint) | Loki now accepts OTLP; no native Loki exporter in OTel |

### Extensions and Auth

| Alloy Component | OTel Engine Equivalent | Notes |
|---|---|---|
| `otelcol.auth.basic` | `basicauth` extension | Direct mapping |
| `otelcol.auth.bearer` | `bearertokenauth` extension | Direct mapping |
| `otelcol.auth.oauth2` | `oauth2clientauth` extension | Direct mapping |
| `otelcol.auth.sigv4` | `sigv4auth` extension | Direct mapping |
| `otelcol.auth.headers` | `headerssetter` extension | Direct mapping |

### No OTel Engine Equivalent

These Alloy components have **no equivalent** in the OTel Engine:

| Alloy Component | What It Does | Workaround |
|---|---|---|
| `prometheus.exporter.unix` (systemd collector) | Monitors systemd unit states | None in pure OTel mode; use `alloyengine` hybrid |
| `prometheus.exporter.unix` (conntrack, entropy, ARP, PSI, schedstat, softnet, hwmon, timex, TCP states) | Specialized Linux kernel metrics | None; `hostmetrics` covers CPU/memory/disk/network only |
| `loki.source.journal` | Native systemd journal reader | `filelog` pointed at journal files (lossy) |
| `loki.process` | Log processing pipeline | `transform` processor with OTTL (different syntax) |
| `discovery.*` components | Service discovery | Use `prometheus` receiver's built-in discovery |
| `module.*` components | Reusable config modules | No equivalent; duplicate config or use config providers |

## Key Behavioral Differences

### Metric Naming

This is the single biggest breaking change when moving from Alloy's `prometheus.exporter.unix` to the OTel Engine's `hostmetrics` receiver:

| Metric | Alloy (`node_*`) | OTel Engine (`system.*`) |
|---|---|---|
| CPU usage | `node_cpu_seconds_total` | `system.cpu.time` |
| Memory | `node_memory_MemTotal_bytes` | `system.memory.usage` |
| Disk I/O | `node_disk_read_bytes_total` | `system.disk.io` |
| Network | `node_network_receive_bytes_total` | `system.network.io` |
| Filesystem | `node_filesystem_size_bytes` | `system.filesystem.usage` |

**Consequence:** If you use Dashboard 1860 (Node Exporter Full), it will not work with OTel Engine metrics. You need OTel-native dashboards (e.g., dashboard 15983) or you need to stay on the Default Engine for host metrics.

### Pipeline Wiring

**Alloy config** wires components explicitly through output blocks:

```
otelcol.receiver.otlp "default" {
  output {
    metrics = [otelcol.processor.batch.default.input]
  }
}
```

**OTel Engine YAML** uses the service/pipelines declaration:

```yaml
service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp]
```

### Authentication

**Alloy config** uses inline auth blocks within components:

```
otelcol.exporter.otlphttp "default" {
  client {
    endpoint = "https://otlp-gateway.example.com"
    auth     = otelcol.auth.basic.creds.handler
  }
}
```

**OTel Engine YAML** uses extensions referenced by name:

```yaml
extensions:
  basicauth/creds:
    client_auth:
      username: ${env:USERNAME}
      password: ${env:PASSWORD}

exporters:
  otlphttp:
    endpoint: https://otlp-gateway.example.com
    auth:
      authenticator: basicauth/creds

service:
  extensions: [basicauth/creds]
```

### Environment Variables

- **Alloy config:** `sys.env("VAR_NAME")`
- **OTel Engine YAML:** `${env:VAR_NAME}` (standard OTEL Collector syntax)

### Meta-monitoring Metrics

Alloy's Default Engine and the OTel Engine expose self-monitoring metrics with different names. If you have dashboards or alerts monitoring Alloy itself, those queries will need updating.

## What You Lose in Migration

Be honest with your team about these trade-offs:

1. **Dashboard 1860 compatibility** -- Your `node_*` dashboards break. Full stop.
2. **systemd monitoring** -- No way to track unit states in pure OTel mode.
3. **Journal log collection** -- No native journal reader; `filelog` is a poor substitute.
4. **Web UI** -- The OTel Engine has no pipeline visualization UI.
5. **Fleet Management** -- Not supported for the OTel Engine yet.
6. **Reload endpoint** -- No hot-reload via HTTP; must restart the process.
7. **Support bundles** -- Not available from the OTel Engine HTTP server.
8. **Service installation** -- No systemd/launchd service management in the initial release.
9. **Specialized Linux metrics** -- conntrack, entropy, ARP, PSI, hwmon, etc. are gone.

## What You Gain in Migration

1. **Standard YAML config** -- Your OTEL Collector knowledge transfers directly.
2. **Upstream component access** -- Broader set of community contrib components.
3. **Portability** -- Same config works on vanilla OTEL Collector (minus `alloyengine` extension).
4. **Ecosystem tools** -- OpAMP, Collector Operator, OCB manifests become available.
5. **Team onboarding** -- New hires who know OTEL Collector are immediately productive.
6. **Config providers** -- Native `env`, `file`, `http`, `https`, `yaml` config providers.

## Practical Migration Workflow

### Step 1: Audit your current config

List every Alloy component in your config and classify it:

- **Direct mapping** -- `otelcol.*` components that have identical OTel Engine counterparts
- **Translatable** -- Components with a different-but-functional OTel equivalent (e.g., `prometheus.exporter.unix` to `hostmetrics`)
- **No equivalent** -- Alloy-only components with no OTel counterpart

If your "No equivalent" list is long, consider the hybrid approach (Step 5) instead of full migration.

### Step 2: Use the converter as a reference

Even though you are moving to the OTel Engine (not the Default Engine), the Alloy converter can help you understand the mapping:

```bash
# Convert an OTEL Collector YAML to Alloy syntax to see the mapping
alloy convert --source-format=otelcol --output=reference.alloy your-otel-config.yaml

# Generate a diagnostic report
alloy convert --source-format=otelcol --report=report.txt --output=reference.alloy your-otel-config.yaml
```

This shows you which OTEL components map to which Alloy components, helping you work backwards.

### Step 3: Write your OTel Engine YAML

Build your new config using standard OTEL Collector YAML format:

```yaml
receivers:
  otlp:
    protocols:
      grpc: {}
      http: {}

processors:
  batch:
    timeout: 1s
    send_batch_size: 512

exporters:
  otlphttp/backend:
    endpoint: https://your-backend.example.com

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/backend]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/backend]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/backend]
```

### Step 4: Validate before running

```bash
alloy otel validate --config=config.yaml
```

### Step 5: Consider the hybrid approach for Alloy-only features

If you need `prometheus.exporter.unix`, `loki.source.journal`, or other Alloy-only components alongside your OTel pipelines, use the `alloyengine` extension:

```yaml
extensions:
  alloyengine:
    config:
      file: /etc/alloy/alloy-components.alloy
    flags:
      server.http.listen-addr: 0.0.0.0:12345

service:
  extensions: [alloyengine]
  pipelines:
    # ... your OTel pipelines here
```

The two engines run in parallel but **cannot natively pass data between each other**. Each engine ships its own telemetry independently.

### Step 6: Run and compare

Run both configs side by side (on different hosts or in containers) and compare:

- Metric names and label sets
- Log formats and metadata
- Trace span attributes
- Self-monitoring metrics

### Step 7: Update dashboards and alerts

This is the step teams underestimate. If you moved from `prometheus.exporter.unix` to `hostmetrics`, every dashboard panel and every alert rule that references `node_*` metrics needs updating to `system.*` metrics.

## Common Migration Mistakes

1. **Assuming metric names are the same** -- They are not. `node_*` and `system.*` are completely different naming conventions.

2. **Forgetting auth extensions need to be in the service block** -- In OTel YAML, you must list auth extensions in `service.extensions` *and* reference them in exporter configs. Missing either step silently fails.

3. **Expecting the web UI to work** -- The OTel Engine does not serve the Alloy pipeline visualization UI. If your team depends on it for debugging, use the hybrid approach.

4. **Not accounting for port changes** -- Default Engine uses port 12345; OTel Engine uses port 8888. Firewall rules, health checks, and monitoring configs all need updating.

5. **Using `--storage.path` with the OTel Engine** -- The OTel Engine uses the `filestorage` extension instead. The CLI flag is ignored.

6. **Trying to hot-reload** -- The OTel Engine does not support the `/-/reload` endpoint. You must restart the process for config changes.
