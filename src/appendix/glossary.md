# Glossary

**Active Series** — The number of unique time series currently being ingested. Each unique combination of metric name + label key/value pairs = one series. This is the primary cost driver for metrics storage.

**Adaptive Metrics** — A Grafana Cloud feature that automatically identifies and reduces unused or underused metrics. Can achieve 40-60% reduction in active series.

**Alloy Config Syntax** — Alloy's custom configuration language. Looks like HCL but is not HCL. Uses blocks, attributes, and component references.

**Cardinality** — The number of unique values a label can take. High-cardinality labels (user IDs, IP addresses) create many unique series and drive up costs.

**Component** — A building block in an Alloy configuration. Components have types (e.g., `prometheus.scrape`), labels, arguments, and exports.

**DPM (Data Points per Minute)** — How frequently data points are written for each series. A 15-second scrape interval = 4 DPM. A 60-second interval = 1 DPM.

**Fleet Management** — Grafana's remote configuration feature for Alloy. Allows centralized pipeline management without editing local config files. Pipelines are sealed modules.

**Forward To** — The wiring pattern that connects a source component's output to a destination component's receiver. Example: `forward_to = [prometheus.relabel.filter.receiver]`.

**OTEL-Native Mode** — Alloy's ability to consume standard OpenTelemetry Collector YAML configuration directly.

**Pipeline** — A chain of connected components that processes telemetry data from source to destination.

**Sealed Module** — The isolation boundary around Fleet Management pipelines. Components inside cannot reference components outside the module scope.

**Series Budget** — A target number of series per host that keeps costs predictable. Typical hardened Linux host: 400-600 series. Typical hardened Windows host: ~135 series.

**sys.env()** — Alloy's built-in function for reading environment variables. The recommended way to handle credentials.

**Web UI** — Alloy's built-in web interface at port 12345. Shows pipeline visualization, component health, and debug information.
