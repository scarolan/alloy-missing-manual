# Bootstrap vs Pipeline Scope

## Two Config Layers

Fleet Management deployments have two distinct configuration layers:

1. **Bootstrap config** -- a local file on disk (`/etc/alloy/config.alloy` on Linux, `C:\Program Files\GrafanaLabs\Alloy\config.alloy` on Windows). This runs when Alloy starts and connects it to Fleet Management.

2. **FM pipelines** -- delivered remotely from the Fleet Management UI. Each pipeline is wrapped in a sealed module (see [The Sealed-Module Gotcha](sealed-module-gotcha.md)).

Understanding what belongs in each layer is essential. Put the wrong thing in the wrong place and you either break the FM connection or create components that nothing can reach.

## What Goes Where

| Component | Bootstrap Config | FM Pipeline | Why |
|---|---|---|---|
| `remotecfg` block | **Yes** | No | Must exist before FM can deliver anything |
| `prometheus.remote_write` | Reference template only | **Yes, in every pipeline** | Sealed modules cannot reach parent-scope components |
| `loki.write` | Reference template only | **Yes, in every pipeline** | Same reason |
| `prometheus.scrape` | No | **Yes** | Collection config should be centrally managed |
| `prometheus.exporter.*` | No | **Yes** | Same -- managed via FM |
| `prometheus.relabel` | No | **Yes** | Same |
| `loki.source.*` | No | **Yes** | Same |
| `loki.process` | No | **Yes** | Same |
| `discovery.*` | No | **Yes** | Same |

**Rule of thumb:** the bootstrap config should be as small as possible. It connects to FM and nothing else. Everything that collects, processes, or ships data goes in FM pipelines.

## Complete Bootstrap Config Example

This is the actual `fleet-config.alloy` from the hardened repos. It is deliberately tiny:

```alloy
// Connect to Fleet Management and poll for pipeline updates.
remotecfg {
  url            = "https://fleet-management-prod-008.grafana.net"
  id             = constants.hostname
  poll_frequency = "60s"
  attributes     = encoding.from_json(coalesce(`{"env":"pov","team":"ops"}`, `{}`))

  basic_auth {
    username = "<fleet-management-username>"
    password = sys.env("GCLOUD_RW_API_KEY")
  }
}

// --- REFERENCE TEMPLATES (not reachable from FM pipelines) ---

// Prometheus write endpoint -- copy this block into every FM pipeline
// that ships metrics. Use sys.env() for credentials.
prometheus.remote_write "metrics_service" {
  endpoint {
    url = "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
    basic_auth {
      username = "<prometheus-username>"
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// Loki write endpoint -- copy this block into every FM pipeline
// that ships logs. Use sys.env() for credentials.
loki.write "grafana_cloud_loki" {
  endpoint {
    url = "https://logs-prod-006.grafana.net/loki/api/v1/push"
    basic_auth {
      username = "<loki-username>"
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}
```

### What to Edit Before Deploying

Only two values need to be changed per stack:

1. The `url` in the `remotecfg` block -- your regional FM URL (from Fleet Management -- Collector configuration)
2. The `username` in the `remotecfg.basic_auth` block -- your FM instance ID (6-digit number, same page)

The reference template `prometheus.remote_write` and `loki.write` blocks can have placeholder usernames/URLs because FM pipelines will not use them. They exist only as copy-paste references.

### The attributes Map

```alloy
attributes = encoding.from_json(coalesce(`{"env":"pov","team":"ops"}`, `{}`))
```

Attributes are key/value pairs attached to the collector in the FM UI. You use them as matchers when targeting pipelines to specific groups of collectors. Examples:

- `env=production` + `team=platform` -- target all production platform hosts
- `env=staging` + `role=webserver` -- target staging web servers only
- `os=linux` + `region=us-east-1` -- target Linux hosts in a specific region

The `coalesce()` wrapper provides a fallback empty map (`{}`) in case the JSON string is malformed.

## Complete FM Pipeline Example

This is a self-contained FM pipeline for Linux host monitoring. Note that it includes its own `prometheus.remote_write` and `loki.write` blocks:

```alloy
// =================================================================
// FM Pipeline: Linux Host Monitoring
// =================================================================
// Self-contained pipeline with its own write endpoints.
// Uses sys.env() for all credentials (set once per host in
// /etc/default/alloy or /etc/sysconfig/alloy).
// =================================================================

// --- Write Endpoints (must be inside every FM pipeline) ---
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

loki.write "grafana_cloud_loki" {
  endpoint {
    url = sys.env("GRAFANA_LOGS_URL")
    basic_auth {
      username = sys.env("GRAFANA_LOGS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Metrics Collection ---
discovery.relabel "integrations_node_exporter" {
  targets = prometheus.exporter.unix.integrations_node_exporter.targets
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
  rule {
    target_label = "job"
    replacement  = "integrations/node_exporter"
  }
}

prometheus.exporter.unix "integrations_node_exporter" {
  enable_collectors = ["tcpstat", "systemd"]

  systemd {
    unit_include = "(sshd?\\.service|crond?\\.service|chronyd?\\.service|systemd-journald\\.service|alloy\\.service|docker\\.service)"
  }

  filesystem {
    fs_types_exclude     = "^(autofs|binfmt_misc|bpf|cgroup2?|configfs|debugfs|devpts|devtmpfs|tmpfs|fusectl|hugetlbfs|iso9660|mqueue|nsfs|overlay|proc|procfs|pstore|rpc_pipefs|securityfs|selinuxfs|squashfs|sysfs|tracefs)$"
    mount_points_exclude = "^/(dev|proc|run/credentials/.+|sys|var/lib/docker/.+)($|/)"
  }
}

prometheus.scrape "integrations_node_exporter" {
  targets         = discovery.relabel.integrations_node_exporter.output
  forward_to      = [prometheus.relabel.integrations_node_exporter.receiver]
  scrape_interval = "60s"
}

prometheus.relabel "integrations_node_exporter" {
  forward_to = [prometheus.remote_write.metrics_service.receiver]

  // Layer 1: Allow-list (abbreviated for clarity -- full list in config.alloy)
  rule {
    source_labels = ["__name__"]
    regex         = "up|node_cpu_seconds_total|node_memory_MemTotal_bytes|node_memory_MemAvailable_bytes|node_filesystem_size_bytes|node_filesystem_avail_bytes|node_network_receive_bytes_total|node_network_transmit_bytes_total|node_load1|node_load5|node_load15|node_boot_time_seconds|node_systemd_unit_state"
    action        = "keep"
  }
}

// --- Log Collection ---
loki.relabel "journal" {
  forward_to = [loki.write.grafana_cloud_loki.receiver]
  rule {
    target_label = "job"
    replacement  = "integrations/node_exporter"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

loki.source.journal "default" {
  max_age       = "12h0m0s"
  forward_to    = [loki.process.journal.receiver]
  relabel_rules = loki.relabel.journal_metadata.rules
}

loki.relabel "journal_metadata" {
  rule {
    source_labels = ["__journal__systemd_unit"]
    target_label  = "unit"
  }
  rule {
    source_labels = ["__journal_priority_keyword"]
    target_label  = "level"
  }
  forward_to = []
}

loki.process "journal" {
  forward_to = [loki.relabel.journal.receiver]
}
```

## The Smoke-Test Pipeline

Before deploying the full hardened config via FM, use a minimal smoke-test pipeline to verify the end-to-end loop (host -- FM -- pipeline delivered -- data lands in stack):

```alloy
prometheus.remote_write "smoke_test" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

prometheus.exporter.self "alloy_self" { }

discovery.relabel "alloy_self" {
  targets = prometheus.exporter.self.alloy_self.targets
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
  rule {
    target_label = "job"
    replacement  = "fm_smoke_test"
  }
}

prometheus.scrape "alloy_self" {
  targets         = discovery.relabel.alloy_self.output
  forward_to      = [prometheus.remote_write.smoke_test.receiver]
  scrape_interval = "30s"
}
```

Verify with:

```promql
alloy_build_info{job="fm_smoke_test"}
```

If this returns data within ~2 minutes, the plumbing works. Replace the smoke-test pipeline with your real collection config.

## Pipeline Targeting with Matchers

When creating a pipeline in the FM UI, you target it to specific collectors using matchers:

- **By attribute:** match the `env`, `team`, `role`, or any other attribute set in the bootstrap config's `attributes` map. Example: `env=production` targets all collectors with that attribute.
- **By collector ID:** match the specific hostname (since `id = constants.hostname` in the bootstrap config).

Attribute-based matching is recommended for fleet-wide pipelines. Collector ID matching is useful for one-off debugging or host-specific overrides.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Putting collection config in the bootstrap | Cannot update without touching every host | Move everything except `remotecfg` to FM pipelines |
| Omitting write endpoints from FM pipeline | Pipeline fails to ship data | Include `prometheus.remote_write` and/or `loki.write` in every pipeline |
| Hardcoding credentials in FM pipeline YAML | Secrets visible in FM UI, exports, backups | Use `sys.env()` for all credentials |
| Forgetting to set env vars on the host | FM pipeline runs but `sys.env()` returns empty strings | Set all five env vars per the [Linux](../../ch03-credentials-and-secrets/linux-env-setup.md) or [Windows](../../ch03-credentials-and-secrets/windows-env-setup.md) setup |
