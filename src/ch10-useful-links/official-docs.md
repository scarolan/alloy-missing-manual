# Official Documentation

The Grafana Alloy docs are organized into roughly nine sections: Introduction, Get Started, Set Up, Configure, Collect & Forward Data, Monitor, Tutorials, Troubleshoot, and Reference. Below are the pages within those sections that you will actually reach for.

## Starting Points

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Alloy documentation home](https://grafana.com/docs/alloy/latest/) | Top of the doc tree. Start here when you are lost. | Essential |
| [Introduction to Grafana Alloy](https://grafana.com/docs/alloy/latest/introduction/) | Architecture overview, why Alloy exists, and how it relates to OpenTelemetry. | Essential |
| [Get Started](https://grafana.com/docs/alloy/latest/get-started/) | First concepts: components, expressions, syntax, modules, and clustering. | Essential |
| [Release cadence](https://grafana.com/docs/alloy/latest/introduction/release-cadence/) | New minor release every three weeks, patch releases every one to two weeks. Plan your upgrade cadence around this. | Supplementary |

## Configuration Language

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Alloy configuration syntax](https://grafana.com/docs/alloy/latest/get-started/configuration-syntax/) | The definitive explanation of blocks, attributes, and how Alloy config files are structured. | Essential |
| [Alloy syntax reference](https://grafana.com/docs/alloy/latest/get-started/syntax/) | Detailed syntax rules -- the two main elements (attributes and blocks), comments, and naming conventions. | Essential |
| [Types and values](https://grafana.com/docs/alloy/latest/get-started/expressions/types_and_values/) | Every data type the language supports. Refer to this when a type mismatch error has you stuck. | Essential |
| [Configuration files](https://grafana.com/docs/alloy/latest/concepts/configuration-syntax/files/) | How Alloy discovers `.alloy` files, directory-mode loading, and file naming conventions. | Supplementary |

## Component Reference

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Components index](https://grafana.com/docs/alloy/latest/reference/components/) | Master list of all 200+ components across every namespace (discovery, loki, prometheus, otelcol, pyroscope, etc.). This is the page you will visit most often. | Essential |
| [Compatible components](https://grafana.com/docs/alloy/latest/reference/compatibility/) | Which components can wire to which. Saves trial-and-error when building pipelines. | Essential |
| [Choose a component](https://grafana.com/docs/alloy/latest/collect/choose-component/) | Decision tree for picking the right component for your use case. | Supplementary |
| [Community components](https://grafana.com/docs/alloy/latest/get-started/components/community-components/) | Components contributed by the community -- worth checking before building something custom. | Supplementary |
| [Standard library](https://grafana.com/docs/alloy/latest/reference/stdlib/) | Built-in functions like `concat`, `json_decode`, `nonsensitive`, and more. | Essential |
| [Configuration blocks reference](https://grafana.com/docs/alloy/latest/reference/config-blocks/) | Top-level blocks: `logging`, `tracing`, `livedebugging`, `import.git`, and others. | Essential |

## Installation Guides

All installation guides live under the [Install Grafana Alloy](https://grafana.com/docs/alloy/latest/set-up/install/) parent page.

| Link | Platform | Priority |
|------|----------|----------|
| [Linux](https://grafana.com/docs/alloy/latest/set-up/install/linux/) | Debian/Ubuntu (apt), RHEL/Fedora (dnf), SUSE (zypper) | Essential |
| [Windows](https://grafana.com/docs/alloy/latest/set-up/install/windows/) | MSI installer, installs to `%PROGRAMFILES%\GrafanaLabs\Alloy` | Essential |
| [macOS](https://grafana.com/docs/alloy/latest/set-up/install/macos/) | Homebrew | Supplementary |
| [Docker](https://grafana.com/docs/alloy/latest/set-up/install/docker/) | Image: `grafana/alloy:latest` (also `windowsservercore-ltsc2022` and `-boringcrypto` variants) | Essential |
| [Kubernetes](https://grafana.com/docs/alloy/latest/set-up/install/kubernetes/) | Helm chart deployment | Essential |
| [Standalone binary](https://grafana.com/docs/alloy/latest/set-up/install/binary/) | Direct download for any supported architecture | Supplementary |
| [Ansible](https://grafana.com/docs/alloy/latest/set-up/install/ansible/) | Ansible role for automated deployment | Supplementary |
| [Chef](https://grafana.com/docs/alloy/latest/set-up/install/chef/) | Chef cookbook | Supplementary |
| [Puppet](https://grafana.com/docs/alloy/latest/set-up/install/puppet/) | Puppet module | Supplementary |
| [OpenShift](https://grafana.com/docs/alloy/latest/set-up/install/openshift/) | Red Hat OpenShift deployment | Supplementary |
| [Podman](https://grafana.com/docs/alloy/latest/set-up/install/podman/) | Podman container alternative to Docker | Supplementary |

Platform-specific post-install configuration:

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Configure on Linux](https://grafana.com/docs/alloy/latest/configure/linux/) | Service file locations, environment file, and systemd integration. | Essential |
| [Configure on Windows](https://grafana.com/docs/alloy/latest/configure/windows/) | Service management, config file location, and registry settings. | Essential |
| [Configure on Kubernetes](https://grafana.com/docs/alloy/latest/configure/kubernetes/) | Helm values, ConfigMaps, and how the chart creates alloy-metrics, alloy-logs, and alloy-singleton instances. | Essential |
| [Run Alloy](https://grafana.com/docs/alloy/latest/set-up/run/) | How to start and manage the Alloy process across all platforms. | Supplementary |

## Migration Guides

Grafana Agent reached End-of-Life on November 1, 2025. Promtail entered EOL on March 2, 2026. If you are still running either, migration is no longer optional.

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Migrate to Alloy (overview)](https://grafana.com/docs/alloy/latest/set-up/migrate/) | Landing page for all migration paths. Start here. | Essential |
| [From Grafana Agent Static](https://grafana.com/docs/alloy/latest/set-up/migrate/from-static/) | Converts static-mode Agent YAML to Alloy config using the built-in converter. | Essential |
| [From Grafana Agent Flow](https://grafana.com/docs/alloy/latest/set-up/migrate/from-flow/) | Live migration from Flow mode with minimal downtime -- mostly copying the data directory. | Essential |
| [From Grafana Agent Operator](https://grafana.com/docs/alloy/latest/set-up/migrate/from-operator/) | Kubernetes Operator to Alloy Helm chart migration. | Supplementary |
| [From Promtail](https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/) | Uses `alloy convert --source-format=promtail` to transform promtail.yml into Alloy config. | Essential |
| [From Prometheus](https://grafana.com/docs/alloy/latest/set-up/migrate/from-prometheus/) | Converts prometheus.yml scrape configs to Alloy components. | Supplementary |
| [From OpenTelemetry Collector](https://grafana.com/docs/alloy/latest/set-up/migrate/from-otelcol/) | Converts OTel Collector YAML to Alloy config. | Supplementary |
| [Convert command reference](https://grafana.com/docs/alloy/latest/reference/cli/convert/) | The CLI tool behind all conversions. Supports `--source-format` of `static`, `prometheus`, `promtail`, and `otelcol`. Pair with `--bypass-errors` and `--report` flags for large configs. | Essential |

## Release Notes and Changelog

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Release notes](https://grafana.com/docs/alloy/latest/release-notes/) | Deprecations, breaking changes, and migration notes per release. Read this before every upgrade. | Essential |
| [Release information](https://grafana.com/docs/alloy/latest/reference/release-information/) | Component stability levels and what they mean for your configs. | Supplementary |
| [GitHub releases](https://github.com/grafana/alloy/releases) | Download binaries and read per-release changelogs with links to pull requests. | Essential |
| [CHANGELOG.md](https://github.com/grafana/alloy/blob/main/CHANGELOG.md) | The raw, detailed changelog in the repo. | Supplementary |

## Tutorials (Official)

These are the official step-by-step tutorials from Grafana. Each one is self-contained.

| Link | What you will learn | Priority |
|------|-------------------|----------|
| [Send logs to Loki](https://grafana.com/docs/alloy/latest/tutorials/send-logs-to-loki/) | Basic log pipeline: file tailing through Alloy to Loki. | Essential |
| [Send metrics to Prometheus](https://grafana.com/docs/alloy/latest/tutorials/send-metrics-to-prometheus/) | Scraping and remote-writing metrics. | Essential |
| [First components and stdlib](https://grafana.com/docs/alloy/latest/tutorials/first-components-and-stdlib/) | How components wire together and how to use built-in functions. | Essential |
| [Logs and relabeling basics](https://grafana.com/docs/alloy/latest/tutorials/logs-and-relabeling-basics/) | Label manipulation for log pipelines. | Supplementary |
| [Process logs](https://grafana.com/docs/alloy/latest/tutorials/process-logs/) | Transforming and filtering log data within Alloy. | Supplementary |

## Grafana Learning Paths

Longer, guided journeys hosted on the Grafana docs site with interactive exercises.

| Link | What it covers | Priority |
|------|---------------|----------|
| [Send logs to Grafana Cloud using Alloy](https://grafana.com/docs/learning-paths/send-logs-alloy-loki/) | End-to-end log pipeline from install to Grafana Cloud, with interactive exercises. | Supplementary |
| [Send traces to Grafana Cloud using Alloy](https://grafana.com/docs/learning-paths/send-traces-alloy/) | Distributed tracing pipeline with Alloy. | Supplementary |

## Troubleshooting Reference

| Link | Why it matters | Priority |
|------|---------------|----------|
| [Troubleshoot Alloy (overview)](https://grafana.com/docs/alloy/latest/troubleshoot/) | Landing page for all troubleshooting topics. | Essential |
| [Debug Alloy](https://grafana.com/docs/alloy/latest/troubleshoot/debug/) | Log levels, log formats, and how to increase verbosity for diagnosis. | Essential |
| [Controller metrics](https://grafana.com/docs/alloy/latest/troubleshoot/controller_metrics/) | Prometheus metrics exposed by the component controller for health monitoring. | Essential |
| [Component metrics](https://grafana.com/docs/alloy/latest/troubleshoot/component_metrics/) | Per-component metrics for diagnosing individual pipeline stages. | Essential |
| [Import rendered mixin dashboards](https://grafana.com/docs/alloy/latest/troubleshoot/mixin-dashboards/) | Pre-built Jsonnet dashboards for visualizing Alloy internals. | Supplementary |
| [Generate a support bundle](https://grafana.com/docs/alloy/latest/troubleshoot/support-bundle/) | How to create diagnostic packages for filing issues or getting help. | Supplementary |
| [Profile resource consumption](https://grafana.com/docs/alloy/latest/troubleshoot/profiling/) | CPU and memory profiling with pprof endpoints. | Supplementary |
| [Live debugging](https://grafana.com/docs/alloy/latest/reference/config-blocks/livedebugging/) | Real-time view of telemetry flowing through each component. Added in v1.3. | Essential |
| [Logging config block](https://grafana.com/docs/alloy/latest/reference/config-blocks/logging/) | Configure log level and format (logfmt or json) for Alloy's own output. | Supplementary |
