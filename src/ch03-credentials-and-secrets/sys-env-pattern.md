# The sys.env() Pattern

## The Problem: Hardcoded Credentials

The default Alloy examples in the docs and in Grafana Cloud's connection wizards use hardcoded placeholder values:

```alloy
// DON'T DO THIS IN PRODUCTION
prometheus.remote_write "default" {
  endpoint {
    url = "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
    basic_auth {
      username = "000000"
      password = "glc_xxxxxxxxxxxxx"   // <-- your API key in plain text
    }
  }
}
```

This is fine for a tutorial, but in production it means your API key is:

- Visible in the config file on every host
- Committed to version control if anyone checks in their config
- Exposed in Fleet Management pipeline exports, backups, and screenshots
- Impossible to rotate without editing every config file

## The Fix: sys.env()

Alloy provides a single built-in function for reading environment variables: `sys.env()`. It takes one argument -- the variable name as a string -- and returns the value.

```
> sys.env("HOME")
"/home/alloy"

> sys.env("DOES_NOT_EXIST")
""
```

**Critical behavior:** when the referenced variable does not exist, `sys.env()` returns an **empty string** -- it does not throw an error. This means a misconfigured host will silently fail to authenticate rather than refusing to start. You must verify your variables are set correctly (covered later in this chapter).

## The Five Required Variables for Grafana Cloud

Every Grafana Cloud deployment needs exactly five environment variables:

| Variable | What It Is | Where to Find It |
|---|---|---|
| `GCLOUD_RW_API_KEY` | Access policy token with `set:alloy-data-write` scope. Shared password for Prometheus, Loki, and Fleet Management. | Access Policies -- your policy -- Add token. Copy immediately, shown once. |
| `GRAFANA_METRICS_URL` | Prometheus remote_write URL | My Account -- stack -- Prometheus -- Details |
| `GRAFANA_METRICS_USERNAME` | Prometheus stack ID (6-digit number) | My Account -- stack -- Prometheus -- Details |
| `GRAFANA_LOGS_URL` | Loki push URL | My Account -- stack -- Loki -- Details |
| `GRAFANA_LOGS_USERNAME` | Loki stack ID (6-digit number) | My Account -- stack -- Loki -- Details |

One API key serves all three backends (Prometheus, Loki, Fleet Management). The `set:alloy-data-write` scope bundles metrics, logs, traces, and profiles write permissions in a single policy.

## Complete Working Config

Here is the complete write-endpoint section using `sys.env()` for all credentials. This is the pattern used in both the [hardened Linux config](https://github.com/scarolan/hardened-grafana-alloy-linux) and [hardened Windows config](https://github.com/scarolan/hardened-grafana-alloy-windows):

```alloy
// Prometheus -- metrics
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// Loki -- logs
loki.write "grafana_cloud_loki" {
  endpoint {
    url = sys.env("GRAFANA_LOGS_URL")
    basic_auth {
      username = sys.env("GRAFANA_LOGS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}
```

If you enable Fleet Management (the `remotecfg` block), it also uses `sys.env()`:

```alloy
remotecfg {
  url            = "https://fleet-management-prod-008.grafana.net"
  id             = constants.hostname
  poll_frequency = "60s"

  basic_auth {
    username = "<fleet-management-username>"   // edit this one manually
    password = sys.env("GCLOUD_RW_API_KEY")   // same API key
  }
}
```

Note that the Fleet Management URL and username are typically hardcoded in the bootstrap config because they are not secret and are the same for every host in a stack. Only the password uses `sys.env()`.

## What Happens When a Variable Is Missing

Because `sys.env()` returns an empty string for missing variables:

| Missing Variable | What Happens |
|---|---|
| `GCLOUD_RW_API_KEY` | Alloy starts but all remote_write requests fail with 401 Unauthorized. If Fleet Management is enabled, the collector never connects. |
| `GRAFANA_METRICS_URL` | Alloy starts but the Prometheus endpoint URL is empty. You will see connection errors in the logs. |
| `GRAFANA_METRICS_USERNAME` | Alloy starts but metrics remote_write fails with 401. |
| `GRAFANA_LOGS_URL` | Same as metrics URL -- empty URL, connection errors. |
| `GRAFANA_LOGS_USERNAME` | Alloy starts but log writes fail with 401. |

In every case, **Alloy starts without complaint**. It does not validate that `sys.env()` returned a non-empty value. This is why the verification step (covered in the Linux and Windows setup pages) is essential.

## Why Not Hardcode URLs and Usernames?

URLs and usernames are not secret, so why put them in environment variables? Two reasons:

1. **Atomic rotations.** When you migrate stacks or rotate credentials, you change the env file on the host and restart. Done. No editing N config files or N Fleet Management pipelines.

2. **You're already setting one env var.** `GCLOUD_RW_API_KEY` must be on the host regardless. Adding four more lines to the same file costs seconds and keeps everything in one place.

## Secret Hygiene Checklist

- The env file should be `chmod 600` and owned by root (Linux) or set via Machine-scope / registry (Windows)
- Never commit `.env` files to version control (only `.env.example` with placeholder values)
- Never paste the API key into Fleet Management pipeline config -- always use `sys.env("GCLOUD_RW_API_KEY")`
- Rotate tokens by creating a new one, updating the env file, restarting, verifying data flow, then deleting the old token
