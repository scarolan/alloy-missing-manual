# Gotchas and Traps

Every Alloy gotcha listed here has bitten real users in real deployments. This is not a theoretical list -- it is a field guide to the mistakes you will make and the error messages you will see when you make them.

## It Looks Like HCL but It Is Not HCL

Alloy's config syntax was inspired by HCL2 (Terraform's language). The curly braces, the `key = value` syntax, and the block structure look familiar. But Alloy's language is its own thing, and the differences will bite you if you assume HCL behavior.

| Feature | HCL2 (Terraform) | Alloy |
|---|---|---|
| Locals block | `locals { }` | Does not exist |
| Variable interpolation | `"${var.name}"` | Not supported. Use string concatenation: `"prefix" + variable` |
| Conditional blocks | `count`, `for_each` | Does not exist |
| Loops | `for` expressions | Does not exist |
| Dynamic blocks | `dynamic` block | Does not exist |
| Module variables | `variable` blocks | Module arguments use `argument` blocks |
| Comments | `#` and `//` | `//` and `/* */` only |

If you find yourself reaching for HCL features, stop. Alloy configs are intentionally simpler. There are no loops, no conditionals at the block level, and no variable system. Values are either hardcoded, read from `sys.env()`, or passed through module arguments.

## Gotcha: The `#` Comment Trap

**Mistake:** Using `#` for comments, especially if you are coming from YAML or Prometheus config.

**Error you will see:**

```text
Error: building config: /etc/alloy/config.alloy:3:1: expected block label, got "#"
```

**Fix:** Replace `#` with `//` for single-line comments, or `/* */` for multi-line.

```alloy
# This is NOT a comment -- it will cause a parse error

// This is a comment
/* This is also a comment */
```

## Gotcha: Trailing Commas in Lists and Maps

**Mistake:** Omitting the trailing comma, or getting confused about when commas are required.

**Error you will see:**

```text
Error: building config: expected "," or "]", got newline
```

**Fix:** In lists and maps, every element must be followed by a comma OR be on the same line as the closing bracket. The safe habit is to always include a trailing comma:

```alloy
// CORRECT -- trailing comma on last element
forward_to = [
  prometheus.relabel.filter.receiver,
  prometheus.remote_write.default.receiver,
]

// CORRECT -- single line, no trailing comma needed
forward_to = [prometheus.remote_write.default.receiver]

// WRONG -- missing comma after last element on its own line
forward_to = [
  prometheus.remote_write.default.receiver
]
```

The trailing comma rule applies to maps too:

```alloy
// CORRECT
labels = {
  "env"  = "production",
  "team" = "platform",
}

// WRONG -- will fail if elements are on separate lines without trailing comma
labels = {
  "env"  = "production",
  "team" = "platform"
}
```

## Gotcha: Duration Strings Must Be Quoted

**Mistake:** Writing durations as bare values without quotes.

**Error you will see:**

```text
Error: building config: expected ";", got "s"
```

**Fix:** Durations are strings. They must always be in double quotes:

```alloy
// CORRECT
scrape_interval = "60s"
scrape_timeout  = "10s"
poll_frequency  = "5m"

// WRONG -- these are parse errors
scrape_interval = 60s
scrape_timeout  = 10s
```

This trips up people coming from Prometheus YAML where `60s` is valid bare syntax.

## Gotcha: env() vs sys.env()

This one matters a lot, especially if you use Fleet Management.

**`sys.env()`** is a runtime function. It reads the environment variable from the host's actual environment when the config is evaluated. It is the function you want in almost every case.

**`env()`** was an older function that read environment variables at parse time. It has been deprecated and removed from newer versions. In some older versions, using `env()` instead of `sys.env()` could cause different behavior during config reloads.

**The Fleet Management implication:** When Fleet Management pushes a pipeline config to a collector, `sys.env()` reads from the host's local environment. This is exactly what you want -- the API key lives on the host, not in the pipeline YAML stored in Fleet Management. If you mistakenly hardcode credentials in the pipeline config, they are visible to anyone with Fleet Management access.

**Fix:** Always use `sys.env()`. If you see `env()` in old configs or blog posts, replace it.

```alloy
// CORRECT -- use sys.env()
password = sys.env("GCLOUD_RW_API_KEY")

// WRONG -- deprecated, do not use
password = env("GCLOUD_RW_API_KEY")
```

## Gotcha: forward_to Needs Brackets Even for One Target

**Mistake:** Passing a single receiver without wrapping it in a list.

**Error you will see:**

```text
Error: building config: expected type list(capsule), got capsule
```

**Fix:** `forward_to` always takes a list. Even when you have only one destination, you need the square brackets:

```alloy
// CORRECT
forward_to = [prometheus.remote_write.default.receiver]

// WRONG -- missing brackets
forward_to = prometheus.remote_write.default.receiver
```

This is the most common type error for new users. The brackets are always required.

## Gotcha: Label Naming Restrictions

**Mistake:** Using hyphens, leading numbers, or special characters in component labels.

**Error you will see:**

```text
Error: building config: expected block label, got "-"
```

**Fix:** Component labels must be valid identifiers: start with a letter or underscore, followed by letters, digits, or underscores. No hyphens.

```alloy
// CORRECT
prometheus.scrape "my_web_app" { }
prometheus.scrape "app_v2" { }

// WRONG -- hyphens not allowed
prometheus.scrape "my-web-app" { }

// WRONG -- cannot start with a number
prometheus.scrape "2nd_app" { }
```

If your team uses hyphens in service names (common in Kubernetes), convert them to underscores in your Alloy labels.

## Gotcha: Duplicate Labels

**Mistake:** Using the same label for two components of the same type.

**Error you will see:**

```text
Error: building config: label "default" is already in use for prometheus.remote_write
```

**Fix:** Every component of the same type must have a unique label. You cannot have two `prometheus.remote_write "default"` blocks. Choose descriptive labels:

```alloy
// CORRECT -- different labels
prometheus.remote_write "grafana_cloud" {
  // ...
}
prometheus.remote_write "local_mimir" {
  // ...
}

// WRONG -- duplicate label for same component type
prometheus.remote_write "default" {
  // ...
}
prometheus.remote_write "default" {
  // ...
}
```

Two different component types can share a label without conflict. A `prometheus.scrape "default"` and a `prometheus.remote_write "default"` are fine together.

## Gotcha: Block Ordering Does Not Matter

**Mistake:** Assuming components must be defined in pipeline order (source first, then processor, then destination).

**Reality:** Alloy builds a directed acyclic graph (DAG) from the component references. It does not care about the order of blocks in the config file. The runtime resolves dependencies regardless of where they appear.

```alloy
// This works fine -- remote_write is defined before scrape
prometheus.remote_write "default" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
  }
}

prometheus.scrape "node" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.remote_write.default.receiver]
}

prometheus.exporter.unix "default" { }
```

That said, for readability, most people define components in pipeline order (sources at top, destinations at bottom). It is a convention, not a requirement.

## Gotcha: Attribute vs Block Confusion

**Mistake:** Using `=` when defining a nested block, or omitting `=` when setting an attribute.

**Error you will see:**

```text
Error: building config: expected block, got attribute
```

or:

```text
Error: building config: expected "=", got "{"
```

**Fix:** Remember the rule: attributes use `=`, blocks do not.

```alloy
// CORRECT -- endpoint is a nested block
endpoint {
  url = "https://example.com"
}

// WRONG -- using = with a block
endpoint = {
  url = "https://example.com"
}

// CORRECT -- url is an attribute
url = "https://example.com"

// WRONG -- omitting = for an attribute
url "https://example.com"
```

When in doubt, check the [component documentation](https://grafana.com/docs/alloy/latest/reference/components/). Arguments listed as "Attributes" use `=`. Arguments listed as "Blocks" use nested `{ }`.

## Gotcha: The output Block Trap in otelcol Components

**Mistake:** Forgetting the `output` block in OpenTelemetry Collector (`otelcol.*`) components, or putting `forward_to` at the wrong level.

**Error you will see:**

```text
Error: building config: unrecognized attribute "forward_to"
```

**Fix:** Most `otelcol.*` processor and receiver components use a nested `output` block for their `forward_to` instead of a top-level attribute:

```alloy
// CORRECT -- forward_to inside output block
otelcol.processor.batch "default" {
  output {
    metrics = [otelcol.exporter.otlp.default.input]
    logs    = [otelcol.exporter.otlp.default.input]
    traces  = [otelcol.exporter.otlp.default.input]
  }
}

// WRONG -- forward_to at the top level
otelcol.processor.batch "default" {
  forward_to = [otelcol.exporter.otlp.default.input]
}
```

The `otelcol.*` components also separate their outputs by signal type (`metrics`, `logs`, `traces`), unlike Prometheus or Loki components that have a single `forward_to`. This is a common surprise when mixing component families.

## Gotcha: Empty Blocks Are Valid (and Sometimes Required)

**Mistake:** Thinking you can omit a block if it has no configuration.

**Reality:** Some components work with zero configuration but you still must declare the block:

```alloy
// This is valid -- empty block, uses all defaults
prometheus.exporter.unix "default" { }

// You cannot omit the braces
// prometheus.exporter.unix "default"   // WRONG -- parse error
```

An empty block with `{ }` is the equivalent of "use all defaults." This is common for exporters and some processors.

## Gotcha: Reload vs Restart

**Mistake:** Changing an environment variable and expecting `sys.env()` to pick it up on config reload.

**Reality:** A config **reload** (sending SIGHUP or clicking "Reload" in the UI) re-evaluates the config file but does **not** re-read the process environment. If you change an environment variable (like rotating an API key), you must **restart** the Alloy process for `sys.env()` to see the new value.

| Action | What Changes | What to Do |
|---|---|---|
| Edit config file | Config attributes, component wiring | Reload (SIGHUP or UI) |
| Change environment variable | `sys.env()` values | Full restart (`systemctl restart alloy`) |
| Change both | Everything | Full restart |

On Linux with systemd, the distinction matters:

```bash
# Reload config only (env vars NOT re-read)
systemctl reload alloy

# Restart process (env vars AND config re-read)
systemctl restart alloy
```

## Gotcha: No String Interpolation

**Mistake:** Trying to use `${}` or `%s` style string interpolation inside strings.

**Error you will see:** No error -- the literal string `${var}` is sent as-is, which is worse than an error because it fails silently.

**Fix:** Use string concatenation with `+`:

```alloy
// WRONG -- this sends the literal string "${HOST}"
url = "https://${HOST}/api/push"

// CORRECT -- use concatenation
url = "https://" + sys.env("HOST") + "/api/push"
```

## Summary

| Gotcha | Key Takeaway |
|---|---|
| `#` comments | Use `//` or `/* */` only |
| Trailing commas | Always add trailing commas in multi-line lists and maps |
| Duration strings | Must be quoted: `"60s"` not `60s` |
| `env()` vs `sys.env()` | Always use `sys.env()` |
| `forward_to` brackets | Always a list: `[receiver]` not `receiver` |
| Label names | No hyphens, no leading digits. Use underscores. |
| Duplicate labels | Each component type must have unique labels |
| Block ordering | Does not matter -- DAG resolves dependencies |
| Attribute vs block | Attributes use `=`, blocks do not |
| `otelcol` output block | Use `output { metrics = [...] }` not top-level `forward_to` |
| Empty blocks | `{ }` is valid and sometimes required |
| Reload vs restart | Env var changes require a full restart |
| String interpolation | Does not exist. Use `+` concatenation. |
