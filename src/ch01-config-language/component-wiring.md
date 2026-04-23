# Component Wiring

Understanding how components connect to each other is the difference between "I copied a config that works" and "I can build any pipeline I need." This section covers the wiring model, the common patterns, and how to debug pipelines when data is not flowing.

## The DAG Model

Alloy configs define a **directed acyclic graph** (DAG). Each component is a node. Each `forward_to`, `targets`, or similar reference is an edge. The Alloy runtime reads every component reference in your config and builds this graph at startup.

```text
                       +-----------------------+
                       | prometheus.exporter    |
                       | .unix "default"        |
                       +----------+------------+
                                  |
                              .targets
                                  |
                                  v
                       +-----------------------+
                       | prometheus.scrape      |
                       | "node_metrics"         |
                       +----------+------------+
                                  |
                            forward_to
                                  |
                                  v
                       +-----------------------+
                       | prometheus.relabel     |
                       | "allow_list"           |
                       +----------+------------+
                                  |
                            forward_to
                                  |
                                  v
                       +-----------------------+
                       | prometheus.remote_write |
                       | "metrics_service"       |
                       +-----------------------+
```

Three key properties of the DAG:

1. **Directed.** Data flows one way along each edge. A scrape component sends to a relabel component, not the reverse.
2. **Acyclic.** You cannot create loops. Component A cannot forward to B if B (directly or indirectly) forwards back to A. Alloy rejects dependency cycles at startup.
3. **Evaluated in dependency order.** The runtime figures out which components depend on which others and evaluates them in the right order. You do not need to define components in any particular order in your config file.

## How Components Connect: Exports and Arguments

Every component has two sides:

- **Arguments** -- the configuration you write inside the block (what the component consumes)
- **Exports** -- values the component makes available for other components to reference

The wiring happens when one component's argument references another component's export.

| Export Type | Used By | Provides | Example Reference |
|---|---|---|---|
| `.targets` | Exporters, discovery | List of scrape targets | `prometheus.exporter.unix.default.targets` |
| `.receiver` | Relabel, remote_write (Prometheus) | A metrics receiver endpoint | `prometheus.relabel.filter.receiver` |
| `.receiver` | Process, write (Loki) | A logs receiver endpoint | `loki.write.default.receiver` |
| `.input` | otelcol exporters | An OTLP receiver endpoint | `otelcol.exporter.otlp.default.input` |
| `.output` | File/content components | The file contents or parsed data | `local.file.config.content` |

The most common wiring pattern uses `forward_to` plus `.receiver`:

```alloy
// Component A sends metrics to Component B
prometheus.scrape "app" {
  targets    = [{"__address__" = "localhost:8080"}]
  forward_to = [prometheus.relabel.filter.receiver]
  //                                       ^^^^^^^^
  //                            This is an export from Component B
}

// Component B receives from A, sends to C
prometheus.relabel "filter" {
  forward_to = [prometheus.remote_write.default.receiver]
  rule {
    // ...
  }
}

// Component C is the terminal -- receives metrics and ships them out
prometheus.remote_write "default" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
  }
}
```

## The Four Common Wiring Patterns

### Pattern 1: Linear Pipeline

The simplest pattern. Data flows through a chain of components in sequence.

```text
  [source] --> [processor] --> [processor] --> [destination]
```

```alloy
prometheus.exporter.unix "default" { }

prometheus.scrape "node" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.relabel.allow_list.receiver]
}

prometheus.relabel "allow_list" {
  forward_to = [prometheus.remote_write.default.receiver]
  rule {
    source_labels = ["__name__"]
    regex         = `node_cpu_seconds_total|node_memory_MemTotal_bytes`
    action        = "keep"
  }
}

prometheus.remote_write "default" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
  }
}
```

### Pattern 2: Fan-Out (One Source, Multiple Destinations)

Send the same data to multiple destinations. This is useful for dual-writing (sending to both Grafana Cloud and a local Mimir instance, for example) or for splitting data into different processing paths.

```text
                              +--> [destination A]
                             /
  [source] --> [processor] -+
                             \
                              +--> [destination B]
```

```alloy
prometheus.scrape "app" {
  targets    = [{"__address__" = "localhost:8080"}]
  forward_to = [
    prometheus.remote_write.grafana_cloud.receiver,
    prometheus.remote_write.local_mimir.receiver,
  ]
}

prometheus.remote_write "grafana_cloud" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
  }
}

prometheus.remote_write "local_mimir" {
  endpoint {
    url = "http://mimir.internal:9009/api/v1/push"
  }
}
```

The scrape component sends every metric to both destinations. There is no filtering -- both get the same data. If you want different metrics to go to different destinations, put a relabel component before each remote_write.

### Pattern 3: Fan-In (Multiple Sources, One Destination)

Multiple sources all forward to the same destination. This is the most common pattern in production -- you have many scrape targets and they all feed into a single remote_write.

```text
  [source A] --\
                +--> [processor] --> [destination]
  [source B] --/
```

```alloy
prometheus.exporter.unix "default" { }

prometheus.scrape "node_metrics" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.relabel.allow_list.receiver]
}

prometheus.scrape "app_metrics" {
  targets    = [{"__address__" = "localhost:8080"}]
  forward_to = [prometheus.relabel.allow_list.receiver]
}

prometheus.relabel "allow_list" {
  forward_to = [prometheus.remote_write.default.receiver]
  rule {
    // same filter rules applied to all incoming metrics
  }
}

prometheus.remote_write "default" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
  }
}
```

Both scrape components feed into the same relabel component, which feeds into a single remote_write. The relabel rules apply to metrics from both sources.

### Pattern 4: Diamond (Fan-Out then Fan-In)

A combination where data splits for different processing, then merges back at a shared destination.

```text
                +--> [relabel A] --\
               /                    \
  [scrape] --+                      +--> [remote_write]
               \                    /
                +--> [relabel B] --/
```

```alloy
prometheus.scrape "app" {
  targets = [{"__address__" = "localhost:8080"}]
  forward_to = [
    prometheus.relabel.high_cardinality.receiver,
    prometheus.relabel.low_cardinality.receiver,
  ]
}

// Path A: aggressive filtering for expensive metrics
prometheus.relabel "high_cardinality" {
  forward_to = [prometheus.remote_write.default.receiver]
  rule {
    source_labels = ["__name__"]
    regex         = `http_request_duration_seconds_bucket`
    action        = "keep"
  }
  rule {
    regex  = `le`
    action = "labeldrop"
  }
}

// Path B: keep everything else as-is
prometheus.relabel "low_cardinality" {
  forward_to = [prometheus.remote_write.default.receiver]
  rule {
    source_labels = ["__name__"]
    regex         = `http_request_duration_seconds_bucket`
    action        = "drop"
  }
}

prometheus.remote_write "default" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
  }
}
```

**Warning:** In the diamond pattern, every metric passes through the scrape component and hits both relabel paths. If your relabel rules are not mutually exclusive (one keeps what the other drops), you will get duplicate series at the remote_write. Always ensure each path handles a distinct subset.

## Logs Pipeline Wiring

Loki (logs) components use the same `forward_to` / `.receiver` pattern, but the component names are different:

```text
  [loki.source.*] --> [loki.process] --> [loki.write]
```

```alloy
loki.source.journal "systemd" {
  forward_to = [loki.process.filter.receiver]
}

loki.process "filter" {
  forward_to = [loki.write.default.receiver]
  stage.drop {
    expression = `.*health check.*`
  }
}

loki.write "default" {
  endpoint {
    url = sys.env("GRAFANA_LOGS_URL")
    basic_auth {
      username = sys.env("GRAFANA_LOGS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}
```

## OpenTelemetry Pipeline Wiring

OpenTelemetry (`otelcol.*`) components have a different wiring style. Instead of a single `forward_to`, they use an `output` block that separates by signal type:

```text
  [otelcol.receiver.*] --> [otelcol.processor.*] --> [otelcol.exporter.*]
```

```alloy
otelcol.receiver.otlp "default" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }
  output {
    metrics = [otelcol.processor.batch.default.input]
    logs    = [otelcol.processor.batch.default.input]
    traces  = [otelcol.processor.batch.default.input]
  }
}

otelcol.processor.batch "default" {
  output {
    metrics = [otelcol.exporter.otlp.default.input]
    logs    = [otelcol.exporter.otlp.default.input]
    traces  = [otelcol.exporter.otlp.default.input]
  }
}

otelcol.exporter.otlp "default" {
  client {
    endpoint = "tempo.internal:4317"
  }
}
```

Key differences from Prometheus/Loki wiring:

| Aspect | Prometheus / Loki | otelcol |
|---|---|---|
| Wiring attribute | `forward_to = [...]` (top-level) | `output { metrics = [...] }` (nested block) |
| Export name | `.receiver` | `.input` |
| Signal separation | One `forward_to` carries all data | Separate lists for `metrics`, `logs`, `traces` |

## Visualizing the Pipeline

Every Alloy instance runs a web UI on port 12345 by default. Open `http://localhost:12345` (or `http://<host>:12345`) to see a live visualization of your pipeline graph.

The UI shows:

- Every component as a node
- Edges showing data flow between components
- Health status of each component (green = healthy, red = error, yellow = warning)
- Click on any component to see its current arguments, exports, and health details

This is the single best debugging tool for wiring problems. If a component is red or disconnected, you can see exactly where the pipeline breaks.

To change the port:

```bash
# Linux
alloy run --server.http.listen-addr=0.0.0.0:9999 config.alloy

# Or in the systemd unit
Environment="CUSTOM_ARGS=--server.http.listen-addr=0.0.0.0:9999"
```

## Debugging Broken Pipelines

### "component X does not exist or is out of scope"

**Cause:** You referenced a component that does not exist. Almost always a typo or a wrong label.

**Debug steps:**

1. Check the exact component name. Is it `prometheus.remote_write.default.receiver` or did you type `prometheus.remote_write.defaults.receiver`?
2. Check the label. Did you name it `"metrics_service"` but reference it as `"metrics"`?
3. If you are using modules, the referenced component might be inside a module scope that the referencing component cannot see. See [The Sealed-Module Gotcha](../ch05-fleet-management/sealed-module-gotcha.md).

### Data Is Going Nowhere

**Symptoms:** Alloy starts without errors, but no data appears in your backend.

**Debug steps:**

1. Open the web UI (`http://localhost:12345`). Check if all components are green.
2. Click on the scrape component. Check if `targets` is populated (not empty).
3. Click on the remote_write component. Check if `samples_sent` is incrementing.
4. Check if `sys.env()` values are set. Missing credentials cause 401 errors, not startup failures. Look at the component health details in the UI for HTTP response codes.
5. Check the Alloy logs. On Linux: `journalctl -u alloy -f`. Look for `401`, `403`, or connection refused messages.

### Upstream Config Errors

**Symptoms:** One component is red in the UI, and every downstream component is also unhealthy.

**Explanation:** If a source component fails (bad scrape target, connection refused, invalid config), everything downstream from it will have no data to process. Fix the upstream component first.

**Debug steps:**

1. In the web UI, find the first red component in the pipeline (the one closest to the source).
2. Click on it. Read the health message.
3. Fix that component. Downstream components will recover automatically.

### Wiring That Compiles but Does Nothing Useful

**Symptoms:** Config is valid, all components are green, but data is missing or duplicated.

**Common causes:**

- A relabel rule with `action = "keep"` and a regex that matches nothing. All data is dropped silently.
- Fan-out without mutually exclusive filters. Data is duplicated.
- A component with `forward_to = []` (empty list). Data enters the component and stops.
- `forward_to` pointing to the wrong component. Data goes somewhere you did not intend.

The web UI graph view is the fastest way to trace data flow and spot these problems.

## Cross-Component Type Wiring Rules

You cannot wire arbitrary components together. The receiver types must match:

| Source Type | Can Forward To | Cannot Forward To |
|---|---|---|
| `prometheus.scrape` | `prometheus.relabel`, `prometheus.remote_write` | `loki.*`, `otelcol.*` |
| `loki.source.*` | `loki.process`, `loki.write` | `prometheus.*`, `otelcol.*` |
| `otelcol.receiver.*` | `otelcol.processor.*`, `otelcol.exporter.*` | `prometheus.*`, `loki.*` |

There are bridge components for crossing between families:

- `otelcol.receiver.prometheus` -- accepts Prometheus metrics and sends them into the otelcol pipeline
- `otelcol.exporter.prometheus` -- exports otelcol metrics as Prometheus format
- `otelcol.exporter.loki` -- exports otelcol logs to Loki pipeline

If you get a type mismatch error, you likely need one of these bridge components.

## Summary

- Alloy configs define a DAG -- components are nodes, references are edges
- Components have arguments (what you configure) and exports (what others reference)
- `forward_to` + `.receiver` is the standard wiring pattern for Prometheus and Loki
- `output { }` + `.input` is the pattern for otelcol components
- Four core patterns: linear, fan-out, fan-in, diamond
- The web UI at port 12345 is the primary debugging tool for pipeline visualization
- Type mismatches between component families (Prometheus/Loki/otelcol) require bridge components
- When debugging, start at the first red component in the upstream direction
