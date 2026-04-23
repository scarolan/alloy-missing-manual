# Every Pipeline Needs Its Own Write Endpoints

## The Duplication Problem

Because of the [sealed-module architecture](sealed-module-gotcha.md), you cannot define `prometheus.remote_write` once in the bootstrap config and share it across all FM pipelines. Every FM pipeline that ships metrics or logs must include its own write-endpoint blocks.

This means if you have 3 FM pipelines (host monitoring, blackbox probes, application scrapes), you have 3 copies of the `prometheus.remote_write` block and potentially 3 copies of the `loki.write` block.

At first glance this looks like unnecessary duplication. It is a direct consequence of the sealed-module design, and understanding why it works this way makes the pattern much easier to accept.

## Why the Duplication Is Necessary

Each FM pipeline runs in its own sealed `declare` module. The pipeline cannot reference components outside its module boundary. The only ways to get values into the module are:

1. **Define the component inside the module** -- this is what you must do for write endpoints
2. **Use `sys.env()`** -- reads from the host OS, crosses the module boundary
3. **Use built-in constants** -- `constants.hostname`, etc.

There is no mechanism to pass a component reference (like a `receiver`) into a sealed module from the parent scope. So the write endpoint must live inside each pipeline.

## The Template Pattern

To minimize the pain, treat the write-endpoint blocks as a boilerplate template. Every FM pipeline starts with the same header:

### Metrics-Only Pipeline Template

```alloy
// --- Write Endpoint (required in every FM pipeline) ---
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Your pipeline config below ---
// ...
```

### Logs-Only Pipeline Template

```alloy
// --- Write Endpoint (required in every FM pipeline) ---
loki.write "grafana_cloud_loki" {
  endpoint {
    url = sys.env("GRAFANA_LOGS_URL")
    basic_auth {
      username = sys.env("GRAFANA_LOGS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Your pipeline config below ---
// ...
```

### Metrics + Logs Pipeline Template

```alloy
// --- Write Endpoints (required in every FM pipeline) ---
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

// --- Your pipeline config below ---
// ...
```

## A Real Example: Blackbox Probe Pipeline

Here is a complete, self-contained FM pipeline for blackbox probing. Note how the write endpoint is the first block:

```alloy
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

prometheus.exporter.blackbox "integrations_blackbox" {
  config = `
modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      preferred_ip_protocol: ip4
      valid_status_codes: [200, 201, 204]
      follow_redirects: true
  icmp:
    prober: icmp
    timeout: 5s
    icmp:
      preferred_ip_protocol: ip4
  tcp_connect:
    prober: tcp
    timeout: 5s
`

  target {
    name    = "grafana-com-http"
    address = "https://grafana.com"
    module  = "http_2xx"
    labels  = {env = "prod", team = "platform"}
  }

  target {
    name    = "internal-api-tcp"
    address = "internal-api.example.com:8080"
    module  = "tcp_connect"
    labels  = {env = "prod", team = "platform"}
  }
}

discovery.relabel "integrations_blackbox" {
  targets = prometheus.exporter.blackbox.integrations_blackbox.targets
  rule {
    target_label = "job"
    replacement  = "integrations/blackbox"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

prometheus.scrape "integrations_blackbox" {
  targets         = discovery.relabel.integrations_blackbox.output
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "60s"
  scrape_timeout  = "10s"
}
```

## Why sys.env() Makes the Duplication Tolerable

The duplication is only in the block structure, not in the actual values. Because every write endpoint uses `sys.env()`:

- **Secrets are never duplicated.** The API key lives in one place: the host's env file. All pipelines read it from the same source.
- **URLs and usernames are never hardcoded.** Stack migrations require updating the host env file, not editing every pipeline in the FM UI.
- **Pipelines are portable.** The same pipeline config works on any host in the fleet, regardless of which Grafana Cloud stack it points to.

The alternative -- hardcoding URLs and passwords in each pipeline -- would make the duplication genuinely dangerous (secrets scattered across N pipelines in the FM UI, visible to anyone with FM access, impossible to rotate atomically).

## Credential Flow Diagram

```
Host env file                   FM Pipeline (sealed module)
(/etc/default/alloy)            
                                +-----------------------------------+
GCLOUD_RW_API_KEY=glc_xxx ------> sys.env("GCLOUD_RW_API_KEY")     |
GRAFANA_METRICS_URL=https://... -> sys.env("GRAFANA_METRICS_URL")   |
GRAFANA_METRICS_USERNAME=000000 -> sys.env("GRAFANA_METRICS_USERNAME")|
GRAFANA_LOGS_URL=https://... ----> sys.env("GRAFANA_LOGS_URL")      |
GRAFANA_LOGS_USERNAME=000000 ----> sys.env("GRAFANA_LOGS_USERNAME") |
                                +-----------------------------------+
```

One env file per host. N pipelines read from it. Credentials change in one place.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Referencing bootstrap write endpoints from FM pipeline | "Component does not exist or is out of scope" | Define write endpoints inside each FM pipeline |
| Hardcoding credentials in FM pipeline YAML | Secrets visible in FM UI and exports | Use `sys.env()` for all credential fields |
| Forgetting to include write endpoint in a new pipeline | Pipeline runs but data goes nowhere | Start every pipeline from the template pattern above |
| Different component labels across pipelines | Confusing debugging | Use consistent labels (`"metrics_service"`, `"grafana_cloud_loki"`) across all pipelines |
