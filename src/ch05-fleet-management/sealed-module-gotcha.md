# The Sealed-Module Gotcha

## The Key Concept to Understand About Fleet Management

You deploy a bootstrap config with `prometheus.remote_write "metrics_service"` defined. You create a Fleet Management pipeline that scrapes metrics and forwards them to `prometheus.remote_write.metrics_service.receiver`. It fails:

> component "prometheus.remote_write.metrics_service" does not exist or is out of scope

You can see the component in the bootstrap config. Alloy is running. The component exists. But the FM pipeline cannot reach it.

## Why: Sealed declare Modules

When Fleet Management delivers a pipeline to Alloy, the pipeline's config is **not** merged into the top-level scope alongside your bootstrap config. Instead, each FM pipeline is wrapped in a **sealed `declare` module**. This is the same `declare` keyword used for user-defined modules in Alloy configs, but with one critical property: it is **sealed** -- components inside the module cannot reference anything outside of it.

Think of it like function scope in a programming language. The bootstrap config is the "main" scope. Each FM pipeline is a function with its own local scope. Local variables cannot access variables in "main", and "main" cannot access local variables.

### What a declare Module Looks Like

When you write this in the FM UI:

```alloy
prometheus.scrape "my_target" {
  targets    = [{"__address__" = "localhost:9090"}]
  forward_to = [prometheus.remote_write.metrics_service.receiver]
}
```

Alloy internally wraps it as something conceptually like:

```alloy
declare "fm_pipeline_abc123" {
  // Your pipeline code runs here, in an isolated scope.
  // It CANNOT see prometheus.remote_write.metrics_service
  // because that component exists in the parent scope.

  prometheus.scrape "my_target" {
    targets    = [{"__address__" = "localhost:9090"}]
    forward_to = [prometheus.remote_write.metrics_service.receiver]  // ERROR
  }
}
```

The reference to `prometheus.remote_write.metrics_service.receiver` fails because that component is defined in the bootstrap config (parent scope), not inside the sealed module.

### What IS Visible Inside FM Pipelines

| Available | Not Available |
|---|---|
| `sys.env()` -- environment variables from the host | Components from the bootstrap config |
| `constants.hostname` and other built-in constants | Components from other FM pipelines |
| `encoding.from_json()`, `coalesce()`, and other stdlib functions | Any user-defined modules from the bootstrap config |
| Components defined within the same pipeline | Anything outside the sealed module boundary |

The key insight: **`sys.env()` crosses the module boundary because it reads from the OS, not from the Alloy config scope.** This is why the `sys.env()` pattern for credentials works -- it is the only mechanism that lets FM pipelines access host-specific values without hardcoding them.

## The Fix: Every Pipeline Gets Its Own Write Endpoints

The only solution is to include write endpoints inside every FM pipeline that ships data. Here is the before and after:

### Before (Broken)

Bootstrap config (`/etc/alloy/config.alloy`):

```alloy
remotecfg {
  url = "https://fleet-management-prod-008.grafana.net"
  // ...
}

prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}
```

FM Pipeline (fails):

```alloy
prometheus.scrape "my_app" {
  targets    = [{"__address__" = "localhost:8080"}]
  forward_to = [prometheus.remote_write.metrics_service.receiver]  // ERROR: out of scope
}
```

### After (Works)

Bootstrap config (`/etc/alloy/config.alloy`):

```alloy
remotecfg {
  url = "https://fleet-management-prod-008.grafana.net"
  id  = constants.hostname
  // ...
  basic_auth {
    username = "<fleet-management-username>"
    password = sys.env("GCLOUD_RW_API_KEY")
  }
}

// These are REFERENCE TEMPLATES only. FM pipelines cannot use them.
// Kept here for documentation purposes.
prometheus.remote_write "metrics_service" {
  endpoint {
    url = "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
    basic_auth {
      username = "<prometheus-username>"
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}
```

FM Pipeline (works):

```alloy
// Each FM pipeline must define its own write endpoint
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

prometheus.scrape "my_app" {
  targets    = [{"__address__" = "localhost:8080"}]
  forward_to = [prometheus.remote_write.metrics_service.receiver]  // WORKS
}
```

## Why This Design Exists

The sealed-module approach is a deliberate architectural choice, not a bug:

1. **Pipeline isolation.** Each FM pipeline operates independently. A broken pipeline cannot affect other pipelines or the bootstrap config.
2. **Safe updates.** FM can swap one pipeline without touching others. If pipelines shared components, updating one could break another.
3. **Predictable behavior.** Each pipeline is self-contained. You can read a pipeline's config and understand exactly what it does without needing to see the bootstrap config or other pipelines.

The tradeoff is duplication of write endpoint config. This is manageable with the `sys.env()` pattern -- the actual secrets are never duplicated, only the block structure.

## Quick Reference

- FM pipelines are wrapped in sealed `declare` modules
- Components inside sealed modules cannot reference components outside
- `sys.env()` still works because it reads from the OS, not the Alloy config scope
- Every FM pipeline that ships data must include its own `prometheus.remote_write` and/or `loki.write`
- The write endpoints in the bootstrap config are reference templates, not shared sinks
