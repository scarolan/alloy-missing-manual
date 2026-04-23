# Syntax Basics

Alloy has its own configuration language. It is not YAML. It is not HCL (Terraform). It is not JSON. It looks like HCL at first glance, which is a trap -- you will assume things work the same way, and they do not. This section covers the actual rules so you can read and write configs without guessing.

## Blocks and Labels

Everything in an Alloy config lives inside a **block**. A block has a type, a label, and a body wrapped in curly braces:

```alloy
prometheus.scrape "node_metrics" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.relabel.allow_list.receiver]
  scrape_interval = "60s"
}
```

Breaking that down:

| Part | Example | What It Is |
|---|---|---|
| Component type | `prometheus.scrape` | The kind of component. Determines what it does. |
| Label | `"node_metrics"` | Your name for this instance. Must be unique per type. Must be a valid identifier (letters, digits, underscores). |
| Body | `{ ... }` | The configuration for this component. Contains attributes and nested blocks. |

The label is how you reference this component elsewhere. Other components refer to it as `prometheus.scrape.node_metrics` (note: the label drops its quotes when used as a reference).

If you are coming from Prometheus YAML, the mental model is different. In Prometheus, you have a flat list of `scrape_configs`. In Alloy, each scrape job is its own named component that explicitly wires to other components.

```yaml
# Prometheus YAML -- flat list, implicit wiring
scrape_configs:
  - job_name: "node"
    static_configs:
      - targets: ["localhost:9100"]
```

```alloy
// Alloy -- named component, explicit wiring
prometheus.scrape "node" {
  targets    = [{"__address__" = "localhost:9100"}]
  forward_to = [prometheus.remote_write.default.receiver]
}
```

## Attributes vs Nested Blocks

Inside a block body, you have two things: **attributes** and **nested blocks**.

**Attributes** use `=` to assign a value:

```alloy
scrape_interval = "60s"
job_name        = "integrations/node_exporter"
```

**Nested blocks** use `{ }` without an `=` sign:

```alloy
prometheus.remote_write "default" {
  endpoint {
    url = "https://prometheus-us-central1.grafana.net/api/prom/push"
    basic_auth {
      username = "000000"
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}
```

The rule is simple: if you see `name = value`, it is an attribute. If you see `name { }`, it is a nested block. Mixing them up (writing `endpoint = { ... }` instead of `endpoint { ... }`) is a common parse error.

## Types

Alloy supports a small set of types. You will use all of them.

| Type | Syntax | Example |
|---|---|---|
| String | Double quotes | `"hello"` |
| Multi-line string | Backticks | `` `line one\nline two` `` |
| Number | Bare digits | `42`, `3.14` |
| Boolean | `true` / `false` | `enabled = true` |
| Duration | Quoted string | `"60s"`, `"5m"`, `"1h"` |
| List | Square brackets | `["a", "b", "c"]` |
| Map/Object | Curly braces with `=` | `{"key" = "value", "port" = 9090}` |
| Null | `null` | `value = null` |

### Strings and Multi-Line Strings

Regular strings use double quotes. They support escape sequences like `\"` and `\\`.

```alloy
description = "This is a simple string"
```

Multi-line strings use backticks. Everything between the backticks is literal -- no escape processing. This is essential for embedding YAML, JSON, or regex patterns inline:

```alloy
local.file "config" {
  filename = "/etc/alloy/extra.yaml"
}

// Or embed directly with a backtick string:
prometheus.relabel "filter" {
  forward_to = [prometheus.remote_write.default.receiver]
  rule {
    source_labels = ["__name__"]
    regex         = `node_cpu_seconds_total|node_memory_MemTotal_bytes|node_disk_io_time_seconds_total`
    action        = "keep"
  }
}
```

Backtick strings are how you avoid the backslash nightmare when writing regex. Compare:

```alloy
// Double-quoted: must escape backslashes
regex = "node_(cpu|disk)_\\w+"

// Backtick: write the regex as-is
regex = `node_(cpu|disk)_\w+`
```

Use backticks for any string that contains regex, YAML, JSON, or anything where you would rather not think about escape sequences.

### Duration Strings

Durations look like bare identifiers, but they must be quoted strings:

```alloy
// CORRECT -- duration as a quoted string
scrape_interval = "60s"
scrape_timeout  = "10s"
poll_frequency  = "5m"

// WRONG -- this is a parse error
scrape_interval = 60s
```

Valid duration units: `ns`, `us` (or `µs`), `ms`, `s`, `m`, `h`.

### Lists

Lists use square brackets with comma-separated values:

```alloy
forward_to = [prometheus.remote_write.default.receiver]

targets = [
  {"__address__" = "localhost:9090", "job" = "prometheus"},
  {"__address__" = "localhost:9100", "job" = "node"},
]
```

A trailing comma after the last element is allowed (and recommended -- it makes diffs cleaner).

### Maps (Objects)

Maps use curly braces with `key = value` pairs:

```alloy
labels = {
  "env"     = "production",
  "cluster" = "us-east-1",
}
```

Map keys are usually quoted strings. Values can be any type.

## Expressions

Alloy supports several kinds of expressions for building dynamic values.

### String Concatenation

Use `+` to join strings:

```alloy
url = "https://" + sys.env("GRAFANA_HOST") + "/api/prom/push"
```

### Arithmetic

Standard math operators work on numbers:

```alloy
value = 1024 * 1024  // 1 MiB in bytes
```

### Ternary (Conditional) Expressions

Alloy supports ternary expressions for conditional values:

```alloy
// condition ? true_value : false_value
log_level = sys.env("DEBUG") != "" ? "debug" : "info"
```

### sys.env()

The `sys.env()` function reads environment variables at runtime:

```alloy
password = sys.env("GCLOUD_RW_API_KEY")
```

This is the primary way to inject secrets and per-host values into configs. See the [Credentials and Secrets](../ch03-credentials-and-secrets/sys-env-pattern.md) chapter for full details.

### Component References

You reference another component's exports using dot notation:

```alloy
// component_type.label.export_name
forward_to = [prometheus.relabel.allow_list.receiver]
targets    = prometheus.exporter.unix.default.targets
```

This is how the pipeline is wired together. The DAG (directed acyclic graph) of component references determines what data flows where. See [Component Wiring](component-wiring.md) for the full picture.

## Comments

Alloy supports two comment styles:

```alloy
// Single-line comment

/*
  Multi-line
  comment
*/
```

Alloy does **not** support `#` comments. If you are coming from YAML or Prometheus config, this will trip you up. The `#` character has no special meaning and will cause a parse error if used as a comment.

## The forward_to Pattern

This is the single most important concept in Alloy configuration. Every pipeline component that sends data somewhere has a `forward_to` attribute. It takes a **list** of receivers:

```alloy
prometheus.scrape "metrics" {
  targets    = [{"__address__" = "localhost:9100"}]
  forward_to = [prometheus.relabel.filter.receiver]
}

prometheus.relabel "filter" {
  forward_to = [prometheus.remote_write.default.receiver]
  rule {
    source_labels = ["__name__"]
    regex         = `node_cpu.*`
    action        = "keep"
  }
}

prometheus.remote_write "default" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
  }
}
```

The data flows: scrape --> relabel --> remote_write. Each component declares where it sends data, and the Alloy runtime builds the pipeline graph from those declarations.

Key points about `forward_to`:

1. It always takes a **list** (square brackets), even for a single destination.
2. Each item in the list is a `.receiver` or `.input` export from another component.
3. Multiple items in the list means fan-out -- data goes to all of them.
4. The wiring is explicit. Nothing is implicit. If you do not wire it, data goes nowhere.

## Putting It All Together

Here is a minimal but complete config that scrapes the built-in node exporter and sends metrics to Grafana Cloud:

```alloy
// Enable the built-in node exporter
prometheus.exporter.unix "default" { }

// Scrape it every 60 seconds
prometheus.scrape "node_metrics" {
  targets         = prometheus.exporter.unix.default.targets
  forward_to      = [prometheus.remote_write.metrics_service.receiver]
  scrape_interval = "60s"
}

// Send metrics to Grafana Cloud
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

Three components. Each one has a type and a label. The scrape component references the exporter's targets and forwards to the remote_write component's receiver. The pipeline is: exporter --> scrape --> remote_write.

## Summary

- Alloy uses its own config language -- not YAML, not HCL, not JSON
- Everything lives in blocks: `component.type "label" { }`
- Attributes use `=`, nested blocks use `{ }` without `=`
- Strings are double-quoted, multi-line strings use backticks
- Durations must be quoted: `"60s"` not `60s`
- Lists use `[ ]`, maps use `{ key = value }`
- `forward_to` is how every pipeline is wired -- it always takes a list
- Comments use `//` or `/* */` -- never `#`
- `sys.env()` reads environment variables at runtime
- Component references use dot notation: `component.type.label.export`
