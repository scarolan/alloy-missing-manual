# Dashboards and Tools

## Grafana Dashboards

### Infrastructure Monitoring Dashboards

These are the dashboards you will import into Grafana to visualize the data Alloy collects. They are not Alloy-specific, but they are what most Alloy deployments are feeding data into.

| Link | What it monitors | Priority |
|------|-----------------|----------|
| [Node Exporter Full (ID: 1860)](https://grafana.com/grafana/dashboards/1860) | The most popular Linux monitoring dashboard. Visualizes nearly all default metrics exported by the Prometheus Node Exporter -- CPU, memory, disk, network, systemd, and more. Requires a `node` job targeting port 9100. Recommend running node-exporter with `--collector.systemd` and `--collector.processes` for full coverage. | Essential |
| [Windows Exporter Dashboard 2025 (ID: 24390)](https://grafana.com/grafana/dashboards/24390) | Windows system performance dashboard compatible with prometheus-windows-exporter 0.31.3+. Uses bargauge, gauge, stat, table, and timeseries panels. Includes job filter for disk analysis. | Essential |
| [Grafana Dashboards library](https://grafana.com/grafana/dashboards/) | Browse all community and official dashboards. Search for specific exporters or use cases. | Supplementary |

### Alloy Self-Monitoring Dashboards

Alloy exposes Prometheus metrics about itself. These dashboards visualize those internal metrics so you can monitor the monitor.

| Link | What it provides | Priority |
|------|-----------------|----------|
| [Alloy monitoring integration](https://grafana.com/integrations/grafana-alloy/monitor/) | Pre-built Grafana Cloud dashboards and alerts for monitoring Alloy instances. One-click setup if you are on Grafana Cloud. | Essential |
| [Alloy mixin (GitHub)](https://github.com/grafana/alloy/tree/main/operations/alloy-mixin) | Jsonnet mixin that renders into Grafana dashboard JSON and Prometheus alert rules. Includes dashboards for: cluster overview, cluster node, resources, controller, Prometheus pipelines, OpenTelemetry pipelines, OTel engine overview, and Loki pipelines. Pre-rendered JSON is committed under the `rendered/` folder for direct import. | Essential |
| [Controller metrics docs](https://grafana.com/docs/alloy/latest/troubleshoot/controller_metrics/) | Documents the Prometheus metrics exposed by the Alloy controller, which you can scrape from `/metrics` on port 12345. | Essential |
| [Component metrics docs](https://grafana.com/docs/alloy/latest/troubleshoot/component_metrics/) | Documents per-component metrics for diagnosing individual pipeline stages. | Supplementary |
| [Import rendered mixin dashboards](https://grafana.com/docs/alloy/latest/troubleshoot/mixin-dashboards/) | Instructions for importing the pre-built mixin dashboards into your Grafana instance. | Supplementary |

## The Alloy Web UI

Alloy ships with a built-in web interface for inspecting running pipelines. It listens on port **12345** by default and is one of Alloy's most underappreciated features.

| Link | What it covers | Priority |
|------|---------------|----------|
| [HTTP endpoints reference](https://grafana.com/docs/alloy/latest/reference/http/) | Complete list of endpoints: `/` (UI), `/metrics` (Prometheus scrape), `/ready`, `/live`, and more. | Essential |
| [Debug Alloy](https://grafana.com/docs/alloy/latest/troubleshoot/debug/) | How to use the UI to inspect component health, view the pipeline graph, and diagnose issues. | Essential |
| [CLI `run` command](https://grafana.com/docs/alloy/latest/reference/cli/run/) | The `--server.http.listen-addr` flag controls the UI address (default `127.0.0.1:12345`). Set to `0.0.0.0:12345` in Docker to expose externally. | Essential |
| [Live debugging config block](https://grafana.com/docs/alloy/latest/reference/config-blocks/livedebugging/) | Enable the live debugging view to see real-time telemetry flowing through each component. Added in v1.3. | Essential |

**Quick access:** Once Alloy is running, open `http://localhost:12345` in your browser. You will see a visual graph of your pipeline, component health indicators, and links to per-component detail pages.

## CLI Tools

The `alloy` binary includes several built-in subcommands beyond `run`.

| Link | Command | What it does | Priority |
|------|---------|-------------|----------|
| [CLI reference (overview)](https://grafana.com/docs/alloy/latest/reference/cli/) | All subcommands | Landing page for all CLI documentation. | Essential |
| [validate](https://grafana.com/docs/alloy/latest/reference/cli/validate/) | `alloy validate` | Validates an Alloy config file or directory without starting the process. Returns zero exit code if valid, non-zero with diagnostics if not. Supports `--config.format` for validating converted configs (alloy, otelcol, prometheus, promtail, static). | Essential |
| [convert](https://grafana.com/docs/alloy/latest/reference/cli/convert/) | `alloy convert` | Converts configs from Prometheus, Promtail, Grafana Agent Static, or OTel Collector format into Alloy config. Use `--bypass-errors` for best-effort conversion of large files, `--report` for a diagnostic report. | Essential |
| [fmt](https://grafana.com/docs/alloy/latest/reference/cli/fmt/) | `alloy fmt` | Formats Alloy config files according to standard conventions. Run this before committing configs. | Essential |
| [tools](https://grafana.com/docs/alloy/latest/reference/cli/tools/) | `alloy tools` | Utilities for reading the Write-Ahead Log (WAL) and gathering statistical information. | Supplementary |
| [otel](https://grafana.com/docs/alloy/latest/reference/cli/otel/) | `alloy otel` | Starts Alloy with the experimental OTel Engine using an OTel Collector YAML config directly. | Supplementary |
| [completion](https://grafana.com/docs/alloy/latest/reference/cli/completion/) | `alloy completion` | Generates shell completion scripts for bash, zsh, fish, and PowerShell. | Supplementary |

## Configuration Tools

| Link | What it does | Priority |
|------|-------------|----------|
| [Alloy Configurator (web tool)](https://grafana.github.io/alloy-configurator/) | Experimental web-based GUI for building Alloy configs without writing code. Includes a configuration wizard, an examples catalog with pre-built templates, and a converter for transforming configs from other formats. Still early-stage but useful for exploration. | Supplementary |
| [Alloy Configurator (GitHub)](https://github.com/grafana/alloy-configurator) | Source repo for the configurator. Track development progress and report issues here. | Supplementary |

## Editor Extensions

| Link | What it provides | Priority |
|------|-----------------|----------|
| [Grafana Alloy VS Code extension (Marketplace)](https://marketplace.visualstudio.com/items?itemName=Grafana.grafana-alloy) | Official VS Code extension from Grafana. Provides syntax highlighting for `.alloy` files. Install this before writing any configs. | Essential |
| [grafana/vscode-alloy (GitHub)](https://github.com/grafana/vscode-alloy) | Source repo for the VS Code extension. File issues and feature requests here. | Supplementary |
| [Grafana VS Code extension (Marketplace)](https://marketplace.visualstudio.com/items?itemName=Grafana.grafana-vscode) | The broader Grafana extension for VS Code. Not Alloy-specific, but useful if you work with Grafana dashboards and data sources alongside Alloy configs. | Supplementary |

## Related Projects

These are the upstream projects and companion tools that Alloy builds on or sends data to. Understanding them makes you a better Alloy user.

### OpenTelemetry

| Link | Why it matters | Priority |
|------|---------------|----------|
| [OpenTelemetry Collector docs](https://opentelemetry.io/docs/collector/) | Alloy is a distribution of the OTel Collector. Understanding the upstream concepts (receivers, processors, exporters, connectors) maps directly to Alloy's `otelcol.*` components. | Essential |
| [OTel Collector configuration](https://opentelemetry.io/docs/collector/configuration/) | Reference for the YAML format that `alloy convert --source-format=otelcol` accepts, and that `alloy otel` runs natively. | Supplementary |
| [OTel Collector GitHub](https://github.com/open-telemetry/opentelemetry-collector) | Upstream source. Check here for the latest receiver/processor/exporter capabilities. | Supplementary |
| [OpenTelemetry docs home](https://opentelemetry.io/docs/) | The full OpenTelemetry documentation covering instrumentation, SDKs, and the collector. | Supplementary |
| [Grafana OTel Collector docs](https://grafana.com/docs/opentelemetry/collector/) | Grafana's own documentation for setting up the OTel Collector with Grafana Cloud. | Supplementary |

### Prometheus

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Prometheus docs home](https://prometheus.io/docs/) | The Prometheus documentation. Alloy's `prometheus.*` components mirror Prometheus concepts (scrape configs, relabeling, remote write). | Essential |
| [Prometheus configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/) | The prometheus.yml format that `alloy convert --source-format=prometheus` accepts. | Supplementary |
| [Prometheus getting started](https://prometheus.io/docs/prometheus/latest/getting_started/) | If you are new to Prometheus, start here before trying to understand Alloy's metrics pipeline. | Supplementary |

### Grafana Loki

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Loki docs home](https://grafana.com/docs/loki/latest/) | Documentation for Grafana Loki, the log aggregation backend that Alloy's `loki.*` components write to. | Essential |
| [Loki getting started](https://grafana.com/docs/loki/latest/get-started/) | Loki's architecture and data model. Understanding labels and streams in Loki helps you design better Alloy log pipelines. | Supplementary |
| [Migrate to Alloy (Loki docs)](https://grafana.com/docs/loki/latest/setup/migrate/migrate-to-alloy/) | Loki's own documentation on migrating from Promtail to Alloy. Complements the Alloy migration guide with Loki-specific context. | Supplementary |
| [Alloy Loki components reference](https://grafana.com/docs/alloy/latest/reference/components/loki/) | All `loki.*` components in Alloy: sources, processing stages, and write destinations. | Essential |

### Grafana Agent (Deprecated -- Migration Reference)

Grafana Agent reached End-of-Life on November 1, 2025. These docs remain available as a migration reference.

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Grafana Agent docs home](https://grafana.com/docs/agent/latest/) | The now-deprecated Agent documentation. Still useful as a reference when translating old Agent configs to Alloy. | Supplementary |
| [Agent introduction](https://grafana.com/docs/agent/latest/about/) | Understanding what Agent was helps you understand why certain Alloy components exist. | Supplementary |
| [Agent release notes](https://grafana.com/docs/agent/latest/static/release-notes/) | Final release notes for Agent Static mode. | Supplementary |
| [Agent Flow release notes](https://grafana.com/docs/agent/latest/flow/release-notes/) | Final release notes for Agent Flow mode, which was the direct predecessor to Alloy's config language. | Supplementary |

### Grafana Tempo and Pyroscope

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Tempo docs home](https://grafana.com/docs/tempo/latest/) | The tracing backend. Alloy's `otelcol.*` components can send traces here. | Supplementary |
| [Troubleshoot Alloy traces (Tempo docs)](https://grafana.com/docs/tempo/latest/troubleshooting/send-traces/alloy/) | Tempo-specific troubleshooting for when traces are not arriving. | Supplementary |
| [Pyroscope docs home](https://grafana.com/docs/pyroscope/latest/) | The continuous profiling backend. Alloy's `pyroscope.*` components send profile data here. | Supplementary |

### Kubernetes Monitoring

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Kubernetes Monitoring Helm chart overview](https://grafana.com/docs/grafana-cloud/monitor-infrastructure/kubernetes-monitoring/configuration/helm-chart-config/helm-chart/) | The full Kubernetes monitoring solution that deploys Alloy alongside kube-state-metrics, Node Exporter, and Windows Exporter. Creates three Alloy instances: alloy-metrics (StatefulSet), alloy-logs (DaemonSet), and alloy-singleton (Deployment). | Supplementary |
| [Deploy Alloy on Kubernetes](https://grafana.com/docs/alloy/latest/set-up/install/kubernetes/) | Standalone Alloy Helm chart deployment for when you want Alloy without the full monitoring chart. | Essential |
| [Configure Alloy on Kubernetes](https://grafana.com/docs/alloy/latest/configure/kubernetes/) | How to update ConfigMaps and apply new configs to a running Alloy Helm deployment. | Supplementary |
