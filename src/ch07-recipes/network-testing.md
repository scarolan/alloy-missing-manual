# Network Testing

## Overview

This chapter covers two distinct uses of the word "network testing":

1. **Pre-deployment connectivity tests** -- simple scripts to verify that a host can reach Grafana Cloud endpoints before you install Alloy
2. **Ongoing network quality monitoring** -- Alloy configs that continuously probe network paths, measure latency, detect packet loss, track SSL certificate expiry, and verify DNS resolution

The pre-deployment tests are one-time scripts. The ongoing monitoring configs use the `prometheus.exporter.blackbox` component covered in [Blackbox Exporter](blackbox-exporter.md) and run permanently as part of your Alloy deployment.

---

## Part 1: Pre-Deployment Connectivity Tests

Before deploying Alloy, verify that the host can reach all required Grafana Cloud endpoints. These scripts test TCP 443 connectivity to the five key endpoints. Run them on the target host (or a host with identical firewall rules) to catch network issues before they become Alloy debugging sessions.

### Endpoints to Test

All Grafana Cloud endpoints use TCP port 443 (HTTPS). The specific hostnames are stack- and region-specific. Replace the examples below with your actual endpoints from the Grafana Cloud portal.

| Endpoint | Purpose | Example Hostname |
|---|---|---|
| Grafana stack | Dashboard access | `your-stack.grafana.net` |
| OTLP gateway | OpenTelemetry ingest | `otlp-gateway-prod-us-east-0.grafana.net` |
| Prometheus | Metrics write | `prometheus-prod-13-prod-us-east-0.grafana.net` |
| Loki | Logs write | `logs-prod-006.grafana.net` |
| Tempo | Traces write | `tempo-prod-04-prod-us-east-0.grafana.net` |

### Linux (Bash)

```bash
#!/usr/bin/env bash
# =================================================================
# Grafana Cloud Connectivity Test -- Linux
# =================================================================
# Tests TCP 443 connectivity to all Grafana Cloud endpoints.
# Replace the hostnames below with your actual stack endpoints.
# Exit code 0 = all passed, 1 = at least one failed.
# =================================================================

set -euo pipefail

# --- Configure these for your stack ---
ENDPOINTS=(
  "your-stack.grafana.net:443"
  "otlp-gateway-prod-us-east-0.grafana.net:443"
  "prometheus-prod-13-prod-us-east-0.grafana.net:443"
  "logs-prod-006.grafana.net:443"
  "tempo-prod-04-prod-us-east-0.grafana.net:443"
)

TIMEOUT=5
PASS=0
FAIL=0

echo "Grafana Cloud Connectivity Test"
echo "================================"
echo ""

for endpoint in "${ENDPOINTS[@]}"; do
  host="${endpoint%%:*}"
  port="${endpoint##*:}"

  if timeout "$TIMEOUT" bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
    echo "[PASS] $host:$port"
    ((PASS++))
  else
    echo "[FAIL] $host:$port -- connection timed out or refused"
    ((FAIL++))
  fi
done

echo ""
echo "Results: $PASS passed, $FAIL failed out of ${#ENDPOINTS[@]} endpoints"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failed endpoints indicate a firewall or DNS issue."
  echo "Check:"
  echo "  1. Firewall rules allow outbound TCP 443 to these hosts"
  echo "  2. DNS can resolve these hostnames"
  echo "  3. Proxy settings (if required) are configured for the Alloy service"
  exit 1
fi

echo ""
echo "All endpoints reachable. Ready to deploy Alloy."
exit 0
```

Save as `test-connectivity.sh`, then run:

```bash
chmod +x test-connectivity.sh
./test-connectivity.sh
```

### Windows (PowerShell)

```powershell
# =================================================================
# Grafana Cloud Connectivity Test -- Windows
# =================================================================
# Tests TCP 443 connectivity to all Grafana Cloud endpoints.
# Replace the hostnames below with your actual stack endpoints.
# Run as Administrator (not strictly required, but recommended).
# =================================================================

$Endpoints = @(
    "your-stack.grafana.net",
    "otlp-gateway-prod-us-east-0.grafana.net",
    "prometheus-prod-13-prod-us-east-0.grafana.net",
    "logs-prod-006.grafana.net",
    "tempo-prod-04-prod-us-east-0.grafana.net"
)

$Port = 443
$Timeout = 5000  # milliseconds
$Pass = 0
$Fail = 0

Write-Host "Grafana Cloud Connectivity Test" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

foreach ($host in $Endpoints) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect($host, $Port, $null, $null)
        $success = $result.AsyncWaitHandle.WaitOne($Timeout, $false)

        if ($success -and $tcp.Connected) {
            Write-Host "[PASS] ${host}:${Port}" -ForegroundColor Green
            $Pass++
        } else {
            Write-Host "[FAIL] ${host}:${Port} -- connection timed out" -ForegroundColor Red
            $Fail++
        }

        $tcp.Close()
    } catch {
        Write-Host "[FAIL] ${host}:${Port} -- $($_.Exception.Message)" -ForegroundColor Red
        $Fail++
    }
}

Write-Host ""
Write-Host "Results: $Pass passed, $Fail failed out of $($Endpoints.Count) endpoints"

if ($Fail -gt 0) {
    Write-Host ""
    Write-Host "Failed endpoints indicate a firewall or DNS issue." -ForegroundColor Yellow
    Write-Host "Check:" -ForegroundColor Yellow
    Write-Host "  1. Firewall rules allow outbound TCP 443 to these hosts"
    Write-Host "  2. DNS can resolve these hostnames"
    Write-Host "  3. Proxy settings (if required) are configured for the Alloy service"
    exit 1
}

Write-Host ""
Write-Host "All endpoints reachable. Ready to deploy Alloy." -ForegroundColor Green
exit 0
```

Save as `Test-Connectivity.ps1`, then run:

```powershell
.\Test-Connectivity.ps1
```

### Key Considerations

- **Run from the target host** -- firewall rules differ between your workstation and the server where Alloy will run.
- **Proxy environments** -- these scripts test direct TCP connectivity. If your environment uses an HTTP proxy, the scripts may fail even though Alloy (configured with proxy settings) would succeed. Test the proxy separately.
- **DNS resolution** -- if the hostname does not resolve, the connection test fails. Check DNS first: `nslookup prometheus-prod-13-prod-us-east-0.grafana.net` (or `Resolve-DnsName` on Windows).

---

## Part 2: Ongoing Network Quality Monitoring

The rest of this chapter covers continuous network quality monitoring using Alloy's blackbox exporter. These configs run permanently and produce metrics for dashboards and alerting.

This builds on the [Blackbox Exporter](blackbox-exporter.md) chapter. Read that first for the fundamentals of probe types, module configuration, and ICMP setup.

## Smokeping-Style Latency Tracking

Smokeping is the classic tool for measuring network latency over time. You can replicate its core functionality with ICMP probes at short intervals. The key difference from standard blackbox monitoring is the scrape interval: 10-15 seconds instead of 60 seconds, giving you high-resolution latency data.

**Environment variables required:** `GCLOUD_RW_API_KEY`, `GRAFANA_METRICS_URL`, `GRAFANA_METRICS_USERNAME`

```alloy
// =================================================================
// Smokeping-Style Latency Monitoring
// =================================================================
// High-frequency ICMP probes for latency tracking.
// Requires CAP_NET_RAW -- see the Blackbox Exporter chapter.
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

// --- Blackbox Exporter (ICMP only) ---
prometheus.exporter.blackbox "latency" {
  config = `
modules:
  icmp:
    prober: icmp
    timeout: 5s
    icmp:
      preferred_ip_protocol: ip4
      dont_fragment: true
      payload_size: 56
`

  // Default gateway
  target {
    name    = "gateway"
    address = "10.0.0.1"
    module  = "icmp"
    labels  = { hop = "gateway", site = "dc1" }
  }

  // ISP next hop
  target {
    name    = "isp-hop1"
    address = "203.0.113.1"
    module  = "icmp"
    labels  = { hop = "isp", site = "dc1" }
  }

  // Cloud provider region endpoint
  target {
    name    = "cloud-region"
    address = "grafana.com"
    module  = "icmp"
    labels  = { hop = "cloud", site = "dc1" }
  }

  // DNS server
  target {
    name    = "dns-primary"
    address = "10.0.0.53"
    module  = "icmp"
    labels  = { hop = "local", site = "dc1" }
  }

  // Secondary site (cross-WAN)
  target {
    name    = "site-b-gateway"
    address = "10.1.0.1"
    module  = "icmp"
    labels  = { hop = "wan", site = "dc2" }
  }
}

// --- Relabel ---
discovery.relabel "latency" {
  targets = prometheus.exporter.blackbox.latency.targets
  rule {
    target_label = "job"
    replacement  = "network/latency"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// --- Scrape (high frequency for latency tracking) ---
prometheus.scrape "latency" {
  targets         = discovery.relabel.latency.output
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "15s"
  scrape_timeout  = "10s"
}
```

### Cardinality Note

Each ICMP target produces approximately 10 series. At a 15-second scrape interval, each target generates 4 DPM (data points per minute) per series. Five targets produce roughly 50 series and 200 DPM. This is modest.

The high scrape frequency is the cost: 4x more data points than a 60-second interval. For 5 targets this is negligible. For 50 targets, consider whether you need 15-second resolution for all of them or just the critical network hops.

### PromQL for Latency Analysis

Round-trip time over time (the classic Smokeping graph):

```promql
probe_icmp_duration_seconds{job="network/latency", phase="rtt"}
```

Average latency per target over the last 5 minutes:

```promql
avg_over_time(probe_icmp_duration_seconds{job="network/latency", phase="rtt"}[5m])
```

Packet loss rate (percentage of failed probes over the last hour):

```promql
1 - avg_over_time(probe_success{job="network/latency"}[1h])
```

Jitter (standard deviation of latency):

```promql
stddev_over_time(probe_icmp_duration_seconds{job="network/latency", phase="rtt"}[5m])
```

## TCP Connection Testing

Test that specific services are accepting TCP connections. This goes beyond ICMP reachability to verify that the application is actually listening.

```alloy
// =================================================================
// TCP Connection Testing
// =================================================================
// Verifies that services are accepting TCP connections.
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

// --- Blackbox Exporter (TCP) ---
prometheus.exporter.blackbox "tcp_checks" {
  config = `
modules:
  tcp_connect:
    prober: tcp
    timeout: 5s

  tcp_tls:
    prober: tcp
    timeout: 5s
    tcp:
      tls: true
      tls_config:
        insecure_skip_verify: false
`

  // Database
  target {
    name    = "postgres-primary"
    address = "db-primary.example.com:5432"
    module  = "tcp_connect"
    labels  = { service = "postgres", env = "prod", tier = "data" }
  }

  target {
    name    = "postgres-replica"
    address = "db-replica.example.com:5432"
    module  = "tcp_connect"
    labels  = { service = "postgres", env = "prod", tier = "data" }
  }

  // Cache
  target {
    name    = "redis-primary"
    address = "redis.example.com:6379"
    module  = "tcp_connect"
    labels  = { service = "redis", env = "prod", tier = "cache" }
  }

  // Message queue
  target {
    name    = "rabbitmq"
    address = "rabbitmq.example.com:5672"
    module  = "tcp_connect"
    labels  = { service = "rabbitmq", env = "prod", tier = "messaging" }
  }

  // LDAP (TLS)
  target {
    name    = "ldap-primary"
    address = "ldap.example.com:636"
    module  = "tcp_tls"
    labels  = { service = "ldap", env = "prod", tier = "auth" }
  }

  // SMTP (TLS)
  target {
    name    = "smtp-relay"
    address = "smtp.example.com:465"
    module  = "tcp_tls"
    labels  = { service = "smtp", env = "prod", tier = "email" }
  }
}

// --- Relabel ---
discovery.relabel "tcp_checks" {
  targets = prometheus.exporter.blackbox.tcp_checks.targets
  rule {
    target_label = "job"
    replacement  = "network/tcp"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// --- Scrape ---
prometheus.scrape "tcp_checks" {
  targets         = discovery.relabel.tcp_checks.output
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "30s"
  scrape_timeout  = "10s"
}
```

## HTTP Endpoint Monitoring

Comprehensive HTTP monitoring: response times, SSL certificates, content validation.

```alloy
// =================================================================
// HTTP Endpoint Monitoring
// =================================================================
// Monitors HTTP/HTTPS endpoints for availability, latency,
// SSL cert expiry, and response content.
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

// --- Blackbox Exporter (HTTP) ---
prometheus.exporter.blackbox "http_checks" {
  config = `
modules:
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

  http_content_check:
    prober: http
    timeout: 10s
    http:
      preferred_ip_protocol: ip4
      valid_status_codes: [200]
      fail_if_not_ssl: true
      fail_if_body_not_matches_regexp:
        - "healthy"
      tls_config:
        insecure_skip_verify: false

  http_api:
    prober: http
    timeout: 10s
    http:
      preferred_ip_protocol: ip4
      valid_status_codes: [200]
      method: GET
      headers:
        Accept: application/json
      follow_redirects: false
`

  // Public website
  target {
    name    = "company-website"
    address = "https://www.example.com"
    module  = "http_2xx_tls"
    labels  = { env = "prod", type = "website", team = "marketing" }
  }

  // Health check endpoint (verify response body)
  target {
    name    = "api-health"
    address = "https://api.example.com/healthz"
    module  = "http_content_check"
    labels  = { env = "prod", type = "api", team = "backend" }
  }

  // Customer-facing API
  target {
    name    = "api-v2"
    address = "https://api.example.com/v2/status"
    module  = "http_api"
    labels  = { env = "prod", type = "api", team = "backend" }
  }

  // Staging environment
  target {
    name    = "staging-web"
    address = "https://staging.example.com"
    module  = "http_2xx_tls"
    labels  = { env = "staging", type = "website", team = "platform" }
  }

  // Internal admin panel
  target {
    name    = "admin-panel"
    address = "https://admin.internal.example.com"
    module  = "http_2xx_tls"
    labels  = { env = "prod", type = "admin", team = "platform" }
  }

  // Status page
  target {
    name    = "status-page"
    address = "https://status.example.com"
    module  = "http_2xx_tls"
    labels  = { env = "prod", type = "status", team = "sre" }
  }
}

// --- Relabel ---
discovery.relabel "http_checks" {
  targets = prometheus.exporter.blackbox.http_checks.targets
  rule {
    target_label = "job"
    replacement  = "network/http"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// --- Scrape ---
prometheus.scrape "http_checks" {
  targets         = discovery.relabel.http_checks.output
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "60s"
  scrape_timeout  = "15s"
}
```

### Key PromQL for HTTP Monitoring

SSL certificate days until expiry:

```promql
(probe_ssl_earliest_cert_expiry{job="network/http"} - time()) / 86400
```

HTTP response time by phase:

```promql
probe_http_duration_seconds{job="network/http", name="api-health"}
```

This returns separate values for each phase (`resolve`, `connect`, `tls`, `processing`, `transfer`), showing exactly where time is being spent.

## DNS Resolution Monitoring

Monitor DNS server health and response times. This catches DNS issues before they cascade into service outages.

```alloy
// =================================================================
// DNS Resolution Monitoring
// =================================================================
// Monitors DNS servers for availability and response time.
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

// --- Blackbox Exporter (DNS) ---
prometheus.exporter.blackbox "dns_checks" {
  config = `
modules:
  dns_internal_forward:
    prober: dns
    timeout: 5s
    dns:
      preferred_ip_protocol: ip4
      query_name: "api.example.com"
      query_type: "A"
      transport_protocol: udp
      valid_rcodes:
        - NOERROR

  dns_internal_reverse:
    prober: dns
    timeout: 5s
    dns:
      preferred_ip_protocol: ip4
      query_name: "100.1.0.10.in-addr.arpa"
      query_type: "PTR"
      transport_protocol: udp
      valid_rcodes:
        - NOERROR

  dns_external:
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

  // Internal DNS servers
  target {
    name    = "dns-dc1-primary"
    address = "10.0.0.53"
    module  = "dns_internal_forward"
    labels  = { site = "dc1", role = "primary" }
  }

  target {
    name    = "dns-dc1-secondary"
    address = "10.0.0.54"
    module  = "dns_internal_forward"
    labels  = { site = "dc1", role = "secondary" }
  }

  target {
    name    = "dns-dc2-primary"
    address = "10.1.0.53"
    module  = "dns_internal_forward"
    labels  = { site = "dc2", role = "primary" }
  }

  // Reverse DNS check
  target {
    name    = "dns-reverse-check"
    address = "10.0.0.53"
    module  = "dns_internal_reverse"
    labels  = { site = "dc1", role = "primary" }
  }

  // External DNS (public resolvers)
  target {
    name    = "cloudflare-dns"
    address = "1.1.1.1"
    module  = "dns_external"
    labels  = { provider = "cloudflare" }
  }

  target {
    name    = "google-dns"
    address = "8.8.8.8"
    module  = "dns_external"
    labels  = { provider = "google" }
  }
}

// --- Relabel ---
discovery.relabel "dns_checks" {
  targets = prometheus.exporter.blackbox.dns_checks.targets
  rule {
    target_label = "job"
    replacement  = "network/dns"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// --- Scrape ---
prometheus.scrape "dns_checks" {
  targets         = discovery.relabel.dns_checks.output
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "30s"
  scrape_timeout  = "10s"
}
```

### DNS-Specific PromQL

DNS query response time:

```promql
probe_dns_duration_seconds{job="network/dns", phase="resolve"}
```

DNS servers that are failing:

```promql
probe_success{job="network/dns"} == 0
```

Compare response times across DNS servers:

```promql
avg_over_time(probe_dns_duration_seconds{job="network/dns", phase="resolve"}[5m])
```

## Multi-Site Mesh Pattern

In a multi-site deployment, each site runs an Alloy instance that probes the other sites. This creates a mesh of probes that shows network quality between every pair of sites.

### Architecture

```
Site A (dc1)                    Site B (dc2)
+------------------+            +------------------+
| Alloy            |   ICMP     | Alloy            |
|  probes:         | ---------> |  probes:         |
|   - dc2-gateway  |            |   - dc1-gateway  |
|   - dc3-gateway  | <--------- |   - dc3-gateway  |
+------------------+            +------------------+
        |      ^                       |      ^
        |      |                       |      |
        v      |                       v      |
+------------------+            +------------------+
| Site C (dc3)     |            |                  |
| Alloy            |            |                  |
|  probes:         |            |                  |
|   - dc1-gateway  | <--------> |                  |
|   - dc2-gateway  |            |                  |
+------------------+            +------------------+
```

Each site probes every other site. The metrics include the `instance` label (which Alloy collector ran the probe), so you can distinguish "dc1 probing dc2" from "dc2 probing dc1" and detect asymmetric network issues.

### Config for Site A (dc1)

```alloy
// =================================================================
// Multi-Site Mesh Probes -- Site A (dc1)
// =================================================================
// Probes all other sites. Deploy a similar config on each site,
// adjusting targets to probe the other sites.
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

// --- ICMP Mesh Probes ---
prometheus.exporter.blackbox "mesh" {
  config = `
modules:
  icmp:
    prober: icmp
    timeout: 5s
    icmp:
      preferred_ip_protocol: ip4
      dont_fragment: true
      payload_size: 56
`

  // Probe Site B
  target {
    name    = "dc2-gateway"
    address = "10.1.0.1"
    module  = "icmp"
    labels  = { source_site = "dc1", target_site = "dc2", link = "wan" }
  }

  target {
    name    = "dc2-app-server"
    address = "10.1.10.1"
    module  = "icmp"
    labels  = { source_site = "dc1", target_site = "dc2", link = "wan" }
  }

  // Probe Site C
  target {
    name    = "dc3-gateway"
    address = "10.2.0.1"
    module  = "icmp"
    labels  = { source_site = "dc1", target_site = "dc3", link = "wan" }
  }

  target {
    name    = "dc3-app-server"
    address = "10.2.10.1"
    module  = "icmp"
    labels  = { source_site = "dc1", target_site = "dc3", link = "wan" }
  }

  // Local (baseline -- should always be <1ms)
  target {
    name    = "dc1-local"
    address = "10.0.0.1"
    module  = "icmp"
    labels  = { source_site = "dc1", target_site = "dc1", link = "local" }
  }
}

// --- HTTP Cross-Site Probes ---
prometheus.exporter.blackbox "mesh_http" {
  config = `
modules:
  http_2xx:
    prober: http
    timeout: 10s
    http:
      preferred_ip_protocol: ip4
      valid_status_codes: [200, 204]
      follow_redirects: false
`

  target {
    name    = "dc2-api"
    address = "https://api.dc2.example.com/healthz"
    module  = "http_2xx"
    labels  = { source_site = "dc1", target_site = "dc2" }
  }

  target {
    name    = "dc3-api"
    address = "https://api.dc3.example.com/healthz"
    module  = "http_2xx"
    labels  = { source_site = "dc1", target_site = "dc3" }
  }
}

// --- Relabel (ICMP) ---
discovery.relabel "mesh" {
  targets = prometheus.exporter.blackbox.mesh.targets
  rule {
    target_label = "job"
    replacement  = "network/mesh-icmp"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// --- Relabel (HTTP) ---
discovery.relabel "mesh_http" {
  targets = prometheus.exporter.blackbox.mesh_http.targets
  rule {
    target_label = "job"
    replacement  = "network/mesh-http"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// --- Scrape (ICMP -- high frequency) ---
prometheus.scrape "mesh" {
  targets         = discovery.relabel.mesh.output
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "15s"
  scrape_timeout  = "10s"
}

// --- Scrape (HTTP -- standard frequency) ---
prometheus.scrape "mesh_http" {
  targets         = discovery.relabel.mesh_http.output
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "60s"
  scrape_timeout  = "15s"
}
```

### Deploying the Mesh

For each site, create a config that probes all other sites. The pattern is:

1. Copy the config above
2. Change the `source_site` label to the local site name
3. Replace the targets with the other sites' IP addresses and hostnames
4. Deploy to the Alloy instance at each site

The `source_site` and `target_site` labels let you query latency between any pair of sites:

```promql
probe_icmp_duration_seconds{
  job="network/mesh-icmp",
  source_site="dc1",
  target_site="dc2",
  phase="rtt"
}
```

## Grafana Dashboard Panel Suggestions

### Network Overview (Stat Panel Grid)

A grid of stat panels showing probe status for all targets:

| Panel | PromQL | Thresholds |
|---|---|---|
| Endpoint Up/Down | `probe_success{job=~"network/.*"}` | 1=green, 0=red |
| Latency (ms) | `probe_duration_seconds{job="network/latency"} * 1000` | <50=green, <200=yellow, >200=red |
| Packet Loss (%) | `(1 - avg_over_time(probe_success{job="network/latency"}[1h])) * 100` | <1=green, <5=yellow, >5=red |
| SSL Days Left | `(probe_ssl_earliest_cert_expiry{job="network/http"} - time()) / 86400` | >30=green, >7=yellow, <7=red |

### Latency Time Series (Graph Panel)

```promql
probe_icmp_duration_seconds{job="network/latency", phase="rtt"} * 1000
```

Legend: `{{name}}`. Y-axis: milliseconds. This is the Smokeping-equivalent graph.

### Site-to-Site Matrix (Table Panel)

```promql
avg_over_time(
  probe_icmp_duration_seconds{job="network/mesh-icmp", phase="rtt"}[5m]
) * 1000
```

Group by `source_site` and `target_site` to create a latency matrix.

### HTTP Phase Breakdown (Stacked Bar)

```promql
probe_http_duration_seconds{job="network/http", name="api-health"}
```

Each phase (resolve, connect, tls, processing, transfer) becomes a stack segment, showing where latency accumulates.

### Certificate Expiry Timeline (Table, Sorted)

```promql
sort_asc(
  (probe_ssl_earliest_cert_expiry{job="network/http"} - time()) / 86400
)
```

Table with columns: name, days_remaining. Sort ascending to see soonest-expiring at top.

## Alerting Patterns

### Sustained Latency

Alert when latency is consistently high, not just on a single spike:

```yaml
alert: SustainedHighLatency
expr: avg_over_time(probe_icmp_duration_seconds{job="network/latency", phase="rtt"}[15m]) > 0.1
for: 15m
labels:
  severity: warning
annotations:
  summary: "Sustained high latency to {{ $labels.name }} ({{ $value | humanize }}s avg)"
  description: "Average latency to {{ $labels.name }} has exceeded 100ms for 15 minutes."
```

### Packet Loss

Alert when packet loss exceeds a threshold over a sustained period:

```yaml
alert: PacketLoss
expr: (1 - avg_over_time(probe_success{job="network/latency"}[30m])) > 0.05
for: 10m
labels:
  severity: warning
annotations:
  summary: "Packet loss to {{ $labels.name }} ({{ $value | humanizePercentage }})"
  description: "More than 5% of probes to {{ $labels.name }} have failed over the last 30 minutes."
```

### SSL Certificate Expiry

```yaml
alert: SSLCertExpiring30Days
expr: (probe_ssl_earliest_cert_expiry{job="network/http"} - time()) / 86400 < 30
for: 1h
labels:
  severity: warning
annotations:
  summary: "SSL cert for {{ $labels.name }} expires in {{ $value | printf \"%.0f\" }} days"

---
alert: SSLCertExpiring7Days
expr: (probe_ssl_earliest_cert_expiry{job="network/http"} - time()) / 86400 < 7
for: 1h
labels:
  severity: critical
annotations:
  summary: "SSL cert for {{ $labels.name }} expires in {{ $value | printf \"%.0f\" }} days"
```

### Cross-Site Link Down

```yaml
alert: CrossSiteLinkDown
expr: probe_success{job="network/mesh-icmp"} == 0
for: 5m
labels:
  severity: critical
annotations:
  summary: "{{ $labels.source_site }} cannot reach {{ $labels.target_site }} ({{ $labels.name }})"
  description: "Cross-site ICMP probe from {{ $labels.source_site }} to {{ $labels.target_site }} has been failing for 5 minutes."
```

### DNS Server Down

```yaml
alert: DNSServerDown
expr: probe_success{job="network/dns"} == 0
for: 5m
labels:
  severity: critical
annotations:
  summary: "DNS server {{ $labels.name }} is not responding"
  description: "DNS probe to {{ $labels.name }} has been failing for 5 minutes."
```

### TCP Service Unreachable

```yaml
alert: TCPServiceDown
expr: probe_success{job="network/tcp"} == 0
for: 3m
labels:
  severity: critical
annotations:
  summary: "{{ $labels.service }} ({{ $labels.name }}) is not accepting connections"
  description: "TCP connection to {{ $labels.name }} has been failing for 3 minutes."
```

## Combining Multiple Configs

The configs above are shown separately for clarity. In production, you can combine them into a single Alloy config file. The key is to use different component labels to keep each probe group independent:

- `prometheus.exporter.blackbox "latency"` -- ICMP latency tracking
- `prometheus.exporter.blackbox "tcp_checks"` -- TCP port checks
- `prometheus.exporter.blackbox "http_checks"` -- HTTP endpoint monitoring
- `prometheus.exporter.blackbox "dns_checks"` -- DNS resolution monitoring
- `prometheus.exporter.blackbox "mesh"` -- Multi-site mesh probes

Each has its own `discovery.relabel` and `prometheus.scrape` blocks, with different `job` labels to separate them in queries and dashboards. They all share a single `prometheus.remote_write` block.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Running pre-deployment tests from the wrong host | Tests pass on your workstation but Alloy fails on the target server | Always run connectivity tests from the actual target host |
| Setting scrape_interval too low for too many targets | Excessive DPM costs, scrape timeouts | Use 15s only for critical latency targets; 60s for HTTP and TCP checks |
| Not including a local baseline target in mesh probes | Cannot distinguish local issues from WAN issues | Always include a local target with <1ms expected latency |
| Forgetting CAP_NET_RAW for ICMP probes | All ICMP probes return probe_success=0 | See [Blackbox Exporter](blackbox-exporter.md) for the systemd override |
| Using the same `job` label for all probe types | Cannot filter by probe type in dashboards and alerts | Use separate job labels per probe group (network/latency, network/http, etc.) |
| Testing connectivity through a proxy when Alloy does not use one | Tests pass but Alloy cannot reach endpoints | Test direct TCP connectivity, matching Alloy's actual network path |
| Alerting on single probe failures instead of sustained failures | Alert noise from transient network blips | Use `for: 5m` or `avg_over_time()` to filter transient issues |
| Not testing DNS resolution separately | DNS failures appear as generic probe failures | Add explicit DNS probes to isolate DNS issues from connectivity issues |

## Summary

- Pre-deployment connectivity tests catch firewall and DNS issues before they become Alloy debugging sessions
- Smokeping-style ICMP probes at 15-second intervals provide high-resolution latency and packet loss data
- TCP connection tests verify that services are actually listening, not just that the host is reachable
- HTTP monitoring covers response time, SSL certificate expiry, and content validation
- DNS monitoring catches resolution failures before they cascade into service outages
- The multi-site mesh pattern uses `source_site`/`target_site` labels to map network quality between every pair of sites
- Use separate `job` labels per probe type for clean dashboard and alert separation
- Alert on sustained conditions (`for: 5m`, `avg_over_time()`) rather than single failures to reduce noise
