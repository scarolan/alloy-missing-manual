# Example Configurations

Side-by-side examples showing the same pipeline in both Alloy config syntax (Default Engine) and OTEL-native YAML (OTel Engine).

## Example 1: Basic OTLP Metrics Pipeline

Accept OTLP metrics over gRPC and HTTP, batch them, and forward to a backend.

### Alloy Config (Default Engine)

```
otelcol.receiver.otlp "default" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }
  http {
    endpoint = "0.0.0.0:4318"
  }

  output {
    metrics = [otelcol.processor.batch.default.input]
  }
}

otelcol.processor.batch "default" {
  timeout         = "1s"
  send_batch_size = 512

  output {
    metrics = [otelcol.exporter.otlphttp.backend.input]
  }
}

otelcol.auth.basic "creds" {
  username = sys.env("OTEL_USERNAME")
  password = sys.env("OTEL_PASSWORD")
}

otelcol.exporter.otlphttp "backend" {
  client {
    endpoint = "https://otlp-gateway.example.com"
    auth     = otelcol.auth.basic.creds.handler
  }
}
```

### OTel Engine YAML

```yaml
extensions:
  basicauth/creds:
    client_auth:
      username: ${env:OTEL_USERNAME}
      password: ${env:OTEL_PASSWORD}

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 512

exporters:
  otlphttp/backend:
    endpoint: https://otlp-gateway.example.com
    auth:
      authenticator: basicauth/creds

service:
  extensions: [basicauth/creds]
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/backend]
```

**Key differences:**
- Alloy wires components through `output` blocks; OTel YAML declares pipelines in the `service` section
- Alloy uses `sys.env("VAR")`; OTel YAML uses `${env:VAR}`
- Alloy auth is an inline component reference; OTel YAML uses named extensions

---

## Example 2: Traces Pipeline with Tail Sampling

Accept traces, apply tail sampling to keep only slow or error spans, then export.

### Alloy Config (Default Engine)

```
otelcol.receiver.otlp "default" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }

  output {
    traces = [otelcol.processor.tail_sampling.default.input]
  }
}

otelcol.processor.tail_sampling "default" {
  decision_wait = "10s"

  policy {
    name = "errors"
    type = "status_code"
    status_code {
      status_codes = ["ERROR"]
    }
  }

  policy {
    name = "slow-requests"
    type = "latency"
    latency {
      threshold_ms = 1000
    }
  }

  output {
    traces = [otelcol.processor.batch.default.input]
  }
}

otelcol.processor.batch "default" {
  output {
    traces = [otelcol.exporter.otlp.backend.input]
  }
}

otelcol.exporter.otlp "backend" {
  client {
    endpoint = "tempo.example.com:4317"
    tls {
      insecure = true
    }
  }
}
```

### OTel Engine YAML

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow-requests
        type: latency
        latency:
          threshold_ms: 1000

  batch: {}

exporters:
  otlp/backend:
    endpoint: tempo.example.com:4317
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [tail_sampling, batch]
      exporters: [otlp/backend]
```

**Key differences:**
- Alloy chains processors through explicit output wiring; OTel YAML lists them in order in the pipeline declaration
- Alloy uses `policy { }` blocks; OTel YAML uses a `policies` list
- OTel YAML requires explicit TLS config for non-TLS endpoints (`tls.insecure: true`)

---

## Example 3: Log Collection with File Tailing

Collect logs from files, parse them, and forward to a Loki-compatible backend.

### Alloy Config (Default Engine)

```
local.file_match "app_logs" {
  path_targets = [
    {__path__ = "/var/log/myapp/*.log", app = "myapp"},
  ]
}

loki.source.file "app_logs" {
  targets    = local.file_match.app_logs.targets
  forward_to = [loki.process.default.receiver]
}

loki.process "default" {
  stage.json {
    expressions = {
      level   = "level",
      message = "msg",
    }
  }
  stage.labels {
    values = {
      level = "",
    }
  }

  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "https://loki.example.com/loki/api/v1/push"
  }
}
```

### OTel Engine YAML

```yaml
receivers:
  filelog/app_logs:
    include:
      - /var/log/myapp/*.log
    operators:
      - type: json_parser
        parse_from: body
      - type: severity_parser
        parse_from: attributes.level
    attributes:
      app: myapp

processors:
  batch: {}

exporters:
  otlphttp/loki:
    endpoint: https://loki.example.com/otlp

service:
  pipelines:
    logs:
      receivers: [filelog/app_logs]
      processors: [batch]
      exporters: [otlphttp/loki]
```

**Key differences:**
- Alloy uses `local.file_match` + `loki.source.file` + `loki.process` as separate wired components; OTel YAML uses a single `filelog` receiver with inline operators
- Alloy's log processing uses stage-based pipeline; OTel uses operator-based parsing within the receiver
- Alloy writes directly to Loki's push API; OTel Engine sends OTLP to Loki's OTLP ingestion endpoint (Loki 3.0+)
- Log processing in Alloy (stages) vs OTel (operators) have very different syntax -- this is not a simple translation

---

## Example 4: Host Metrics Collection

Collect host-level metrics (CPU, memory, disk, network) and ship to a Prometheus-compatible backend.

### Alloy Config (Default Engine)

```
// Produces node_* metrics compatible with Dashboard 1860
prometheus.exporter.unix "default" {
  set_collectors     = ["cpu", "meminfo", "diskstats", "filesystem", "netdev", "loadavg", "uname"]
  enable_collectors  = ["systemd"]

  systemd {
    unit_include = "ssh.*|alloy.*|docker.*"
  }
}

prometheus.scrape "host" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.remote_write.default.receiver]

  scrape_interval = "60s"
}

prometheus.remote_write "default" {
  endpoint {
    url = "https://prometheus.example.com/api/v1/push"

    basic_auth {
      username = sys.env("PROM_USERNAME")
      password = sys.env("PROM_PASSWORD")
    }
  }
}
```

### OTel Engine YAML

```yaml
# Produces system.* metrics -- NOT compatible with Dashboard 1860
# Use OTel-native dashboards (e.g., dashboard 15983) instead

extensions:
  basicauth/prom:
    client_auth:
      username: ${env:PROM_USERNAME}
      password: ${env:PROM_PASSWORD}

receivers:
  hostmetrics:
    collection_interval: 60s
    scrapers:
      cpu: {}
      memory: {}
      disk: {}
      filesystem: {}
      network: {}
      load: {}

processors:
  resourcedetection:
    detectors: [system]
    system:
      hostname_sources: [os]

  batch: {}

exporters:
  prometheusremotewrite/backend:
    endpoint: https://prometheus.example.com/api/v1/push
    auth:
      authenticator: basicauth/prom

service:
  extensions: [basicauth/prom]
  pipelines:
    metrics:
      receivers: [hostmetrics]
      processors: [resourcedetection, batch]
      exporters: [prometheusremotewrite/backend]
```

**Key differences:**
- **Metric names are completely different**: `node_cpu_seconds_total` vs `system.cpu.time`, `node_memory_MemTotal_bytes` vs `system.memory.usage`, etc.
- **No systemd monitoring** in OTel Engine -- the `hostmetrics` receiver does not have a systemd scraper
- **No `uname` info** exposed as a metric in OTel's `hostmetrics`
- Alloy uses `prometheus.scrape` to poll the exporter; OTel's `hostmetrics` receiver pushes metrics directly into the pipeline
- The `resourcedetection` processor in OTel adds host metadata that Alloy's exporter handles differently

---

## Example 5: Hybrid -- OTLP Traces + Alloy Host Monitoring

Use the OTel Engine for trace collection and the Default Engine (via `alloyengine` extension) for host metrics with `node_*` naming.

### OTel Engine YAML (primary config: `/etc/alloy/otel-config.yaml`)

```yaml
extensions:
  basicauth/backend:
    client_auth:
      username: ${env:GRAFANA_USERNAME}
      password: ${env:GRAFANA_PASSWORD}

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
  batch:
    timeout: 1s
    send_batch_size: 512

exporters:
  otlphttp/traces:
    endpoint: https://tempo.example.com
    auth:
      authenticator: basicauth/backend

service:
  extensions: [basicauth/backend, alloyengine]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/traces]
```

### Alloy Config (loaded by `alloyengine`: `/etc/alloy/host-monitoring.alloy`)

```
prometheus.exporter.unix "default" {
  set_collectors    = ["cpu", "meminfo", "diskstats", "filesystem", "netdev", "loadavg", "uname"]
  enable_collectors = ["systemd"]

  systemd {
    unit_include = "ssh.*|alloy.*|docker.*"
  }
}

prometheus.scrape "host" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.remote_write.default.receiver]

  scrape_interval = "60s"
}

prometheus.remote_write "default" {
  endpoint {
    url = sys.env("PROMETHEUS_URL")

    basic_auth {
      username = sys.env("GRAFANA_USERNAME")
      password = sys.env("GRAFANA_PASSWORD")
    }
  }
}

loki.source.journal "default" {
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = sys.env("LOKI_URL")

    basic_auth {
      username = sys.env("GRAFANA_USERNAME")
      password = sys.env("GRAFANA_PASSWORD")
    }
  }
}
```

### Running the hybrid setup

```bash
# Validate the OTel config
alloy otel validate --config=/etc/alloy/otel-config.yaml

# Run it -- the alloyengine extension automatically starts the Default Engine
alloy otel --config=/etc/alloy/otel-config.yaml
```

**What runs where:**
- **OTel Engine (port 8888):** OTLP trace reception and export
- **Default Engine (port 12345):** Host metrics with `node_*` naming, systemd monitoring, journal logs, web UI

**Limitation:** The two engines cannot share data. Traces go through the OTel pipeline; metrics and logs go through the Alloy pipeline. Each has its own exporters.

---

## Example 6: Kubernetes Deployment with Helm

Deploy Alloy with the OTel Engine in Kubernetes using the Alloy Helm chart.

### Helm values (`values.yaml`)

```yaml
image:
  repository: grafana/alloy
  tag: v1.15.1

# Required: the Helm chart doesn't expose custom commands,
# so we override the binary to use the OTel Engine entrypoint
command:
  name: "bin/otelcol"

mode: deployment

ports:
  metrics:
    enabled: true

alternateConfig:
  extensions:
    health_check:
      endpoint: 0.0.0.0:13133

    basicauth/grafana:
      client_auth:
        username: "${GRAFANA_USERNAME}"
        password: "${GRAFANA_PASSWORD}"

  receivers:
    otlp:
      protocols:
        grpc: {}
        http: {}

  processors:
    batch:
      timeout: 1s
      send_batch_size: 512

    memorylimiter:
      limit_mib: 400
      spike_limit_mib: 100
      check_interval: 5s

  exporters:
    otlphttp/grafana:
      endpoint: https://otlp-gateway-prod-us-east-0.grafana.net/otlp
      auth:
        authenticator: basicauth/grafana

  service:
    telemetry:
      metrics:
        readers:
          - pull:
              exporter:
                prometheus:
                  host: 0.0.0.0
                  port: 8888
    extensions: [basicauth/grafana, health_check]
    pipelines:
      traces:
        receivers: [otlp]
        processors: [memorylimiter, batch]
        exporters: [otlphttp/grafana]
      metrics:
        receivers: [otlp]
        processors: [memorylimiter, batch]
        exporters: [otlphttp/grafana]
      logs:
        receivers: [otlp]
        processors: [memorylimiter, batch]
        exporters: [otlphttp/grafana]
```

**Key notes for Kubernetes:**
- Set `command.name` to `bin/otelcol` since the Helm chart does not expose the `alloy otel` subcommand directly
- Use `alternateConfig` instead of the standard Alloy config section
- The `health_check` extension on port 13133 is essential for Kubernetes liveness/readiness probes
- `memorylimiter` is strongly recommended in Kubernetes to prevent OOM kills
- Self-monitoring metrics are exposed via Prometheus pull on port 8888 (not 12345)

## Summary

The examples above demonstrate that while the two engines achieve similar outcomes, the configuration experience is fundamentally different. The OTel Engine YAML will feel immediately familiar to anyone who has used the upstream OTEL Collector, while Alloy config syntax offers more explicit pipeline wiring and access to Alloy-only components.

The hybrid approach (Example 5) is the pragmatic choice for teams that need both worlds: OTEL-standard pipelines for application telemetry and Alloy-native components for host monitoring. It comes at the cost of maintaining two config files, but avoids forcing a complete migration in either direction.
