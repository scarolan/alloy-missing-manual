# Blackbox Exporter

## What Is Blackbox Monitoring?

Blackbox monitoring probes endpoints from the outside -- the way a user or customer would experience them. Instead of collecting metrics from inside a service (CPU, memory, request counts), you ask a simple question from the outside: "Can I reach this thing, and how long does it take?"

The name comes from treating the target as a "black box" -- you do not care about its internals, only its observable behavior. This is the complementary opposite of the host monitoring configs in [Starter Configs](starter-configs.md), which instrument the inside of a machine.

Blackbox monitoring answers questions that internal metrics cannot:

- Is this HTTPS endpoint reachable from this network?
- How long does the TLS handshake take?
- When does the SSL certificate expire?
- Can I open a TCP connection to this port?
- Does this host respond to ICMP ping, and what is the round-trip latency?
- Does DNS resolve this name correctly?

## Why Use Alloy's Built-In Blackbox Exporter?

Alloy includes `prometheus.exporter.blackbox`, which embeds the same probe logic as the standalone [blackbox_exporter](https://github.com/prometheus/blackbox_exporter) binary. You do not need to install, configure, or manage a separate blackbox_exporter process.

The blackbox module configuration is passed inline as a backtick-delimited YAML string. No external `blackbox.yml` file is needed.

## Probe Types

The blackbox exporter supports four probe types. Each is defined as a "module" in the configuration.

| Probe Type | Protocol | What It Tests | Common Use Cases |
|---|---|---|---|
| **HTTP** | HTTP/HTTPS | Full HTTP request cycle: DNS, TCP connect, TLS handshake, request, response | Website uptime, API health, SSL cert expiry |
| **TCP** | TCP | TCP connection establishment | Database ports, custom service ports, Redis, SMTP |
| **ICMP** | ICMP | Ping (echo request/reply) | Network reachability, latency baselines, packet loss |
| **DNS** | DNS/UDP or DNS/TCP | DNS query and response validation | DNS server health, record correctness |

## Complete Working Config

This is a self-contained config that probes HTTP endpoints, TCP ports, ICMP hosts, and DNS servers. It ships all probe metrics to Grafana Cloud.

```alloy
// =================================================================
// Blackbox Exporter -- HTTP, TCP, ICMP, and DNS Probes
// =================================================================
// Probes external and internal endpoints, ships metrics to
// Grafana Cloud. Set env vars per Chapter 3.
// =================================================================

// --- Write Endpoint ---
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Blackbox Exporter ---
prometheus.exporter.blackbox "probes" {
  config = `
modules:
  http_2xx:
    prober: http
    timeout: 10s
    http:
      preferred_ip_protocol: ip4
      valid_status_codes: [200, 201, 204]
      follow_redirects: true
      fail_if_ssl: false
      fail_if_not_ssl: false

  http_2xx_tls:
    prober: http
    timeout: 10s
    http:
      preferred_ip_protocol: ip4
      valid_status_codes: [200, 201, 204]
      follow_redirects: true
      fail_if_not_ssl: true
      tls_config:
        insecure_skip_verify: false

  tcp_connect:
    prober: tcp
    timeout: 5s

  icmp:
    prober: icmp
    timeout: 5s
    icmp:
      preferred_ip_protocol: ip4

  dns_udp:
    prober: dns
    timeout: 5s
    dns:
      preferred_ip_protocol: ip4
      query_name: "grafana.com"
      query_type: "A"
      transport_protocol: udp
      valid_rcodes:
        - NOERROR
`

  // --- HTTP targets ---
  target {
    name    = "grafana-com"
    address = "https://grafana.com"
    module  = "http_2xx_tls"
    labels  = {
      env  = "external"
      team = "platform"
      type = "website"
    }
  }

  target {
    name    = "grafana-cloud-status"
    address = "https://status.grafana.com"
    module  = "http_2xx_tls"
    labels  = {
      env  = "external"
      team = "platform"
      type = "status-page"
    }
  }

  target {
    name    = "internal-api"
    address = "http://internal-api.example.com:8080/healthz"
    module  = "http_2xx"
    labels  = {
      env  = "prod"
      team = "backend"
      type = "api"
    }
  }

  // --- TCP targets ---
  target {
    name    = "postgres-primary"
    address = "db-primary.example.com:5432"
    module  = "tcp_connect"
    labels  = {
      env  = "prod"
      team = "data"
      type = "database"
    }
  }

  target {
    name    = "redis-cache"
    address = "redis.example.com:6379"
    module  = "tcp_connect"
    labels  = {
      env  = "prod"
      team = "backend"
      type = "cache"
    }
  }

  // --- ICMP targets ---
  target {
    name    = "gateway"
    address = "10.0.0.1"
    module  = "icmp"
    labels  = {
      env  = "prod"
      team = "network"
      type = "gateway"
    }
  }

  target {
    name    = "dns-server"
    address = "10.0.0.53"
    module  = "icmp"
    labels  = {
      env  = "prod"
      team = "network"
      type = "dns"
    }
  }

  // --- DNS targets ---
  target {
    name    = "dns-resolver-primary"
    address = "10.0.0.53"
    module  = "dns_udp"
    labels  = {
      env  = "prod"
      team = "network"
      type = "dns-resolver"
    }
  }
}

// --- Relabel for job/instance labels ---
discovery.relabel "probes" {
  targets = prometheus.exporter.blackbox.probes.targets
  rule {
    target_label = "job"
    replacement  = "integrations/blackbox"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// --- Scrape ---
prometheus.scrape "probes" {
  targets         = discovery.relabel.probes.output
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "60s"
  scrape_timeout  = "15s"
}
```

## Module Configuration Explained

The `config` block uses a backtick-delimited YAML string. This is standard blackbox_exporter YAML, embedded directly in the Alloy config. No external file is needed.

### http_2xx Module

The basic HTTP probe. It makes a GET request and checks for a 2xx status code.

| Parameter | Value | Purpose |
|---|---|---|
| `prober` | `http` | Use the HTTP prober |
| `timeout` | `10s` | Fail if no response within 10 seconds |
| `preferred_ip_protocol` | `ip4` | Resolve to IPv4 (avoids dual-stack surprises) |
| `valid_status_codes` | `[200, 201, 204]` | Which codes count as success |
| `follow_redirects` | `true` | Follow HTTP 3xx redirects |

### http_2xx_tls Module

Same as `http_2xx` but enforces TLS. The `fail_if_not_ssl: true` setting causes the probe to fail if the target does not use HTTPS, so you catch accidental HTTP downgrades.

### tcp_connect Module

Opens a TCP connection and immediately closes it. Success means the port is open and accepting connections. This does not send any application-layer data.

### icmp Module

Sends an ICMP echo request (ping). Measures round-trip time and packet loss. Requires the `CAP_NET_RAW` capability (see the ICMP setup section below).

### dns_udp Module

Sends a DNS query over UDP and validates the response. The `query_name` and `query_type` define what to ask; `valid_rcodes` defines what counts as success.

## Target Configuration

Each `target` block defines one endpoint to probe:

| Field | Required | Purpose |
|---|---|---|
| `name` | Yes | Unique identifier for this target (becomes the `__param_target` label) |
| `address` | Yes | The endpoint to probe (URL for HTTP, host:port for TCP, IP for ICMP, IP for DNS) |
| `module` | Yes | Which probe module to use (must match a key in the `config` YAML) |
| `labels` | No | Additional labels attached to all metrics from this target |

The `labels` map is where you add organizational metadata. Common patterns:

- `env` -- production, staging, development
- `team` -- which team owns the endpoint
- `type` -- website, api, database, cache, gateway

These labels make it easy to filter and aggregate in Grafana dashboards and alert rules.

## The discovery.relabel Pattern

The `discovery.relabel` block sets the `job` and `instance` labels for all probe metrics:

```alloy
discovery.relabel "probes" {
  targets = prometheus.exporter.blackbox.probes.targets
  rule {
    target_label = "job"
    replacement  = "integrations/blackbox"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}
```

The `job` label groups all blackbox metrics under one job name. The `instance` label identifies which Alloy collector ran the probe -- important in multi-site setups where multiple Alloy instances probe the same targets from different locations.

## ICMP Setup: CAP_NET_RAW

ICMP probes require the `CAP_NET_RAW` Linux capability. Without it, the ICMP prober fails silently (the probe returns `probe_success=0` with no useful error).

### Option 1: Add the Capability to the Alloy Binary

```bash
sudo setcap cap_net_raw+ep $(which alloy)
sudo systemctl restart alloy
```

This survives reboots but is overwritten by package upgrades. Add the `setcap` command to your upgrade automation.

### Option 2: systemd Override (Recommended)

```bash
sudo systemctl edit alloy
```

Add:

```ini
[Service]
AmbientCapabilities=CAP_NET_RAW
```

Save and restart:

```bash
sudo systemctl restart alloy
```

This survives package upgrades because systemd drop-ins are not touched by the package manager.

### Verifying ICMP Works

After setup, check the probe metrics:

```promql
probe_success{job="integrations/blackbox", module="icmp"}
```

A value of `1` means the ICMP probe succeeded. If it returns `0` for all ICMP targets, the capability is likely missing.

### Windows

On Windows, Alloy runs as the SYSTEM account which has ICMP privileges by default. No additional configuration is needed.

## Key Metrics

The blackbox exporter produces detailed metrics for every probe. These are the most important ones for dashboards and alerting.

| Metric | Type | What It Tells You |
|---|---|---|
| `probe_success` | Gauge (0 or 1) | Did the probe succeed? The single most important metric. |
| `probe_duration_seconds` | Gauge | Total time the probe took, end to end |
| `probe_dns_lookup_time_seconds` | Gauge | Time spent on DNS resolution alone |
| `probe_tls_version_info` | Gauge (info metric) | TLS version used (labels: `version="TLS 1.3"`) |
| `probe_ssl_earliest_cert_expiry` | Gauge (Unix timestamp) | When the SSL certificate expires. Critical for cert expiry alerting. |
| `probe_ssl_last_chain_info` | Gauge (info metric) | Certificate chain details |
| `probe_http_status_code` | Gauge | HTTP response status code (200, 301, 404, etc.) |
| `probe_http_duration_seconds` | Gauge | HTTP phase timings (labels: `phase="resolve"`, `"connect"`, `"tls"`, `"processing"`, `"transfer"`) |
| `probe_http_content_length` | Gauge | Response body size in bytes |
| `probe_http_redirects` | Gauge | Number of redirects followed |
| `probe_icmp_duration_seconds` | Gauge | ICMP round-trip time (labels: `phase="setup"`, `"rtt"`) |
| `probe_dns_duration_seconds` | Gauge | DNS query duration (labels: `phase="resolve"`, `"connect"`, `"request"`) |

### Series Count Estimation

Each target produces approximately 15-25 metric series depending on the probe type:

| Probe Type | Approximate Series per Target |
|---|---|
| HTTP (with TLS) | ~25 (includes phase breakdown, TLS info, cert expiry) |
| HTTP (plain) | ~20 |
| TCP | ~10 |
| ICMP | ~10 |
| DNS | ~15 |

For the example config above (3 HTTP + 2 TCP + 2 ICMP + 1 DNS targets = 8 targets), expect approximately 140-160 series.

## Alerting Patterns

### Endpoint Down (Probe Failed)

```yaml
alert: BlackboxProbeDown
expr: probe_success{job="integrations/blackbox"} == 0
for: 5m
labels:
  severity: critical
annotations:
  summary: "Endpoint {{ $labels.name }} is down"
  description: "Blackbox probe {{ $labels.name }} has been failing for 5 minutes."
```

The `for: 5m` clause prevents alerting on transient network blips. Adjust based on your SLA.

### SSL Certificate Expiring Soon

```yaml
alert: SSLCertExpiringSoon
expr: (probe_ssl_earliest_cert_expiry{job="integrations/blackbox"} - time()) / 86400 < 30
for: 1h
labels:
  severity: warning
annotations:
  summary: "SSL cert for {{ $labels.name }} expires in {{ $value | humanizeDuration }}"
  description: "Certificate for {{ $labels.name }} expires in less than 30 days."
```

### High Probe Latency

```yaml
alert: BlackboxHighLatency
expr: probe_duration_seconds{job="integrations/blackbox"} > 5
for: 10m
labels:
  severity: warning
annotations:
  summary: "Probe {{ $labels.name }} is slow ({{ $value }}s)"
  description: "Blackbox probe {{ $labels.name }} has been taking over 5 seconds for 10 minutes."
```

### HTTP Non-2xx Response

```yaml
alert: BlackboxHTTPNon2xx
expr: probe_http_status_code{job="integrations/blackbox"} < 200 or probe_http_status_code{job="integrations/blackbox"} >= 300
for: 5m
labels:
  severity: warning
annotations:
  summary: "{{ $labels.name }} returning HTTP {{ $value }}"
  description: "Endpoint {{ $labels.name }} has been returning non-2xx status for 5 minutes."
```

## Advanced Module Configuration

### HTTP with Content Matching

Verify that the response body contains expected content. This catches situations where a load balancer returns 200 but serves an error page:

```yaml
http_content_check:
  prober: http
  timeout: 10s
  http:
    preferred_ip_protocol: ip4
    valid_status_codes: [200]
    fail_if_body_not_matches_regexp:
      - "healthy"
      - "ok"
    follow_redirects: true
```

### HTTP with Custom Headers

Probe authenticated endpoints or APIs that require specific headers:

```yaml
http_api_auth:
  prober: http
  timeout: 10s
  http:
    preferred_ip_protocol: ip4
    valid_status_codes: [200]
    method: GET
    headers:
      Accept: application/json
      Authorization: Bearer ${API_TOKEN}
    follow_redirects: false
```

### HTTP POST with Body

Probe endpoints that require a POST request (health check APIs, webhook targets):

```yaml
http_post:
  prober: http
  timeout: 10s
  http:
    preferred_ip_protocol: ip4
    valid_status_codes: [200, 202]
    method: POST
    headers:
      Content-Type: application/json
    body: '{"check":"health"}'
```

### TCP with TLS

Verify TLS connectivity to a port (useful for TLS-wrapped database connections, LDAPS, SMTPS):

```yaml
tcp_tls:
  prober: tcp
  timeout: 5s
  tcp:
    tls: true
    tls_config:
      insecure_skip_verify: false
```

### DNS with Record Validation

Verify that DNS returns the expected answer (not just that it responds):

```yaml
dns_validate:
  prober: dns
  timeout: 5s
  dns:
    preferred_ip_protocol: ip4
    query_name: "api.example.com"
    query_type: "A"
    transport_protocol: udp
    valid_rcodes:
      - NOERROR
    validate_answer_rrs:
      fail_if_not_matches_regexp:
        - ".*10\\.0\\.1\\.100.*"
```

## Grafana Dashboard Suggestions

### Probe Overview Panel

A stat panel showing probe success across all targets:

```promql
probe_success{job="integrations/blackbox"}
```

Color map: 1 = green, 0 = red. Group by `name` label.

### Latency Heatmap

A heatmap showing probe duration over time:

```promql
probe_duration_seconds{job="integrations/blackbox"}
```

### SSL Certificate Expiry Table

A table showing days until certificate expiry for all HTTPS targets:

```promql
(probe_ssl_earliest_cert_expiry{job="integrations/blackbox"} - time()) / 86400
```

Sort ascending to see the soonest-expiring certificates at the top.

### HTTP Phase Breakdown

A stacked bar chart showing where time is spent for each HTTP probe:

```promql
probe_http_duration_seconds{job="integrations/blackbox"}
```

Group by `phase` label to see resolve, connect, TLS, processing, and transfer times separately.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Missing `CAP_NET_RAW` for ICMP probes | ICMP probes always return `probe_success=0` | Add the capability via systemd override or `setcap` |
| Setting `scrape_timeout` shorter than the longest probe `timeout` | Scrape times out before probe completes, metrics lost | Set `scrape_timeout` at least 5s longer than your longest probe timeout |
| Using the same `name` for multiple targets | Only one target is scraped (name collision) | Use unique `name` values for every target |
| Forgetting `preferred_ip_protocol: ip4` | Probe attempts IPv6 first, fails on IPv4-only networks | Always set `preferred_ip_protocol: ip4` unless you specifically need IPv6 |
| Module name in target does not match config | Probe fails with "unknown module" | Verify module names match exactly between `target.module` and `config` YAML keys |
| Probing via HTTP when target redirects to HTTPS | Probe measures redirect chain, not the actual endpoint | Use `https://` in the address, or set `follow_redirects: false` and probe the HTTPS URL directly |
| Not setting `fail_if_not_ssl: true` for HTTPS targets | An accidental HTTP downgrade goes undetected | Use the `http_2xx_tls` module for endpoints that must use TLS |
| Inline YAML indentation errors | Alloy fails to parse the config block | Use a YAML linter on the content inside the backticks before deploying |

## Summary

- `prometheus.exporter.blackbox` embeds the blackbox_exporter inside Alloy -- no external binary needed
- Module configuration is passed inline as a backtick-delimited YAML string
- Four probe types: HTTP (website/API health), TCP (port checks), ICMP (ping/latency), DNS (resolution)
- Each target produces 10-25 metric series depending on probe type
- ICMP probes require `CAP_NET_RAW` on Linux (systemd override is the most robust approach)
- The three critical alerting patterns: probe failure (`probe_success == 0`), SSL cert expiry (`probe_ssl_earliest_cert_expiry`), and high latency (`probe_duration_seconds`)
- Use labels on targets (`env`, `team`, `type`) to organize probes for dashboard filtering
