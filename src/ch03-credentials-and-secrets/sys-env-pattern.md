# The sys.env() Pattern

> TODO: Write this section.

## Overview

Use `sys.env("VARIABLE_NAME")` in Alloy config to read values from environment variables at startup.

## Key Concepts

- `sys.env()` reads environment variables available to the Alloy process
- Required environment variables for Grafana Cloud: API key, metrics URL, metrics username, logs URL, logs username
- Using `sys.env()` in `prometheus.remote_write` and `loki.write` blocks

## Example

```alloy
prometheus.remote_write "default" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")

    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}
```

## Common Mistakes

- Hardcoding credentials in config files (they end up in version control)
- Setting user-level environment variables that services can't see
- Forgetting to restart Alloy after changing environment variables

## Summary
