# Error Messages Decoded

Alloy error messages range from "reasonably helpful" to "completely misleading." This page is a reference for the most common errors you will encounter, what they actually mean, and how to fix them. Bookmark it.

## Validation and Parse Errors

These errors appear at startup or when running `alloy validate`. They mean your config file has a problem that prevents Alloy from even attempting to build the pipeline.

### "expected block label, got ..."

```text
Error: building config: /etc/alloy/config.alloy:5:1: expected block label, got "#"
```

**Means:** Alloy hit a character or token it did not expect while parsing a block definition.

**Common causes:**

- Using `#` for comments instead of `//`
- A stray character or typo at the start of a line
- Missing closing `}` on a previous block, causing the parser to get lost

**Fix:** Replace `#` comments with `//`. If the error points to a different character, check the lines above for unclosed braces.

```alloy
// WRONG
# This is a comment

// RIGHT
// This is a comment
```

---

### "expected \",\" or \"]\", got newline"

```text
Error: building config: /etc/alloy/config.alloy:12:3: expected "," or "]", got newline
```

**Means:** A list element is on its own line but is not followed by a comma.

**Common cause:** Missing trailing comma in a multi-line list.

**Fix:** Add a trailing comma after every element in a multi-line list or map.

```alloy
// WRONG
forward_to = [
  prometheus.remote_write.default.receiver
]

// RIGHT
forward_to = [
  prometheus.remote_write.default.receiver,
]
```

---

### "expected \";\", got \"s\"" (or similar unit suffix)

```text
Error: building config: /etc/alloy/config.alloy:8:22: expected ";", got "s"
```

**Means:** You wrote a duration as a bare value without quotes.

**Common cause:** Writing `60s` instead of `"60s"`. People coming from Prometheus YAML do this constantly.

**Fix:** Quote all duration values.

```alloy
// WRONG
scrape_interval = 60s

// RIGHT
scrape_interval = "60s"
```

---

### "expected block, got attribute"

```text
Error: building config: /etc/alloy/config.alloy:4:3: expected block, got attribute for "endpoint"
```

**Means:** You used `=` to assign a value where Alloy expected a nested block definition.

**Common cause:** Writing `endpoint = { ... }` instead of `endpoint { ... }`.

**Fix:** Remove the `=` sign. Nested blocks do not use assignment syntax.

```alloy
// WRONG
prometheus.remote_write "default" {
  endpoint = {
    url = "https://example.com/api/prom/push"
  }
}

// RIGHT
prometheus.remote_write "default" {
  endpoint {
    url = "https://example.com/api/prom/push"
  }
}
```

---

### "expected \"=\", got \"{\""

```text
Error: building config: /etc/alloy/config.alloy:6:7: expected "=", got "{"
```

**Means:** You used block syntax where Alloy expected an attribute assignment.

**Common cause:** Omitting `=` when setting an attribute, or trying to define a sub-block where the schema expects an attribute.

**Fix:** Add `=` for attributes. Check the component documentation to confirm whether the field is an attribute or a block.

---

### "X is not a valid component"

```text
Error: building config: "prometheus.exporter.snmp" is not a valid component
```

**Means:** The component type you specified does not exist in this version of Alloy, or it is gated behind a stability level that is not enabled.

**Common causes:**

1. **Typo in the component name.** Check spelling carefully. Component names are case-sensitive and use dots as separators.
2. **The component requires a different stability level.** Some components are marked as `experimental` or `public_preview` and must be enabled with a flag.
3. **Wrong Alloy version.** The component may have been added in a newer version, or removed/renamed in an upgrade.

**Fix for stability levels:** Enable the required stability level in your Alloy startup arguments:

```bash
# Allow experimental components
alloy run --stability.level=experimental config.alloy

# Or in the systemd unit
Environment="CUSTOM_ARGS=--stability.level=experimental"
```

The stability levels from least to most restrictive: `experimental` > `public_preview` > `generally_available`. Setting a less restrictive level enables all levels above it (so `experimental` enables everything).

**Fix for typos:** Check the [component reference](https://grafana.com/docs/alloy/latest/reference/components/) for the exact name.

---

### "label \"X\" is already in use"

```text
Error: building config: label "default" is already in use for prometheus.remote_write
```

**Means:** Two components of the same type have the same label.

**Common cause:** Copy-pasting a component block and forgetting to change the label.

**Fix:** Give each component of the same type a unique label.

```alloy
// WRONG
prometheus.remote_write "default" { /* ... */ }
prometheus.remote_write "default" { /* ... */ }

// RIGHT
prometheus.remote_write "grafana_cloud" { /* ... */ }
prometheus.remote_write "local_mimir" { /* ... */ }
```

---

### "cannot convert X to Y"

```text
Error: building config: cannot convert string to list(capsule)
```

**Means:** A type mismatch between what you provided and what the component expects.

**Common causes:**

- `forward_to` given a bare receiver instead of a list: `forward_to = prometheus.remote_write.default.receiver` instead of `forward_to = [prometheus.remote_write.default.receiver]`
- Passing a string where a number is expected, or vice versa
- Passing a map where a list is expected

**Fix:** Check the expected type in the component documentation. The most common case is the missing brackets on `forward_to`:

```alloy
// WRONG -- bare receiver, not a list
forward_to = prometheus.remote_write.default.receiver

// RIGHT -- wrapped in a list
forward_to = [prometheus.remote_write.default.receiver]
```

---

### "dependency cycle detected"

```text
Error: building config: dependency cycle detected: prometheus.relabel.a -> prometheus.relabel.b -> prometheus.relabel.a
```

**Means:** Two or more components reference each other in a loop, which is not allowed in a DAG.

**Common cause:** A wiring mistake where component A forwards to B and B forwards back to A (directly or through intermediate components).

**Fix:** Trace the cycle shown in the error message. One of the `forward_to` references is wrong. Draw out your intended pipeline and fix the reference that creates the loop.

```alloy
// WRONG -- creates a cycle
prometheus.relabel "a" {
  forward_to = [prometheus.relabel.b.receiver]
}
prometheus.relabel "b" {
  forward_to = [prometheus.relabel.a.receiver]  // cycle!
}

// RIGHT -- linear chain
prometheus.relabel "a" {
  forward_to = [prometheus.relabel.b.receiver]
}
prometheus.relabel "b" {
  forward_to = [prometheus.remote_write.default.receiver]
}
```

---

### "component X does not exist or is out of scope"

```text
Error: building config: component "prometheus.remote_write.metrics" does not exist or is out of scope
```

**Means:** You referenced a component that Alloy cannot find.

**Common causes:**

1. **Typo in the component reference.** The label in the reference does not match the label in the block definition. Check for plurals (`default` vs `defaults`), underscores vs no underscores, and similar near-misses.
2. **Wrong export name.** You wrote `.output` when the component exports `.receiver`, or vice versa.
3. **Module scope.** The component you are referencing is defined inside a module, and components outside the module cannot see it. This is the "sealed module" problem -- see [The Sealed-Module Gotcha](../ch05-fleet-management/sealed-module-gotcha.md).
4. **The component block does not exist.** You deleted it, commented it out, or never defined it.

**Fix:** Compare the reference in the error to your actual component definitions. The reference format is `component.type.label.export`:

```text
prometheus.remote_write.metrics_service.receiver
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
component.type         .label           .export
```

Check that each part matches exactly.

---

### "unrecognized attribute \"X\""

```text
Error: building config: unrecognized attribute "forward_to" for otelcol.processor.batch
```

**Means:** You used an attribute name that the component does not accept.

**Common causes:**

- Using `forward_to` at the top level of an `otelcol.*` component (it goes inside the `output` block)
- Typo in an attribute name (`scrape_intervl` instead of `scrape_interval`)
- Using an attribute from a different component type or a different version of Alloy

**Fix:** Check the component's documentation for the correct attribute names. For `otelcol.*` components, remember that wiring goes in the `output` block:

```alloy
// WRONG
otelcol.processor.batch "default" {
  forward_to = [otelcol.exporter.otlp.default.input]
}

// RIGHT
otelcol.processor.batch "default" {
  output {
    metrics = [otelcol.exporter.otlp.default.input]
    logs    = [otelcol.exporter.otlp.default.input]
    traces  = [otelcol.exporter.otlp.default.input]
  }
}
```

## Runtime Errors

These errors do not prevent Alloy from starting. Instead, they appear in the logs and in the web UI after the pipeline is running.

### 401 Unauthorized / 403 Forbidden

```text
level=error msg="failed to send batch" err="server returned HTTP status 401 Unauthorized"
```

**Means:** Authentication failed when sending data to the remote endpoint.

**Common causes:**

- `sys.env("GCLOUD_RW_API_KEY")` returned an empty string because the environment variable is not set
- The API key has been rotated or revoked
- The username does not match the stack (wrong `GRAFANA_METRICS_USERNAME` value)
- The token does not have the required scope (e.g., missing `metrics:write` permission)

**Fix:**

1. Verify the env var is set: `echo $GCLOUD_RW_API_KEY` (should not be empty)
2. Verify the env var is visible to the Alloy process. On Linux with systemd, the variable must be in the environment file (typically `/etc/default/alloy`)
3. Verify the API key is valid in Grafana Cloud under Access Policies
4. Restart Alloy after fixing (`systemctl restart alloy`)

---

### Connection Refused / Dial Error

```text
level=error msg="failed to send batch" err="Post \"https://...\": dial tcp: lookup prometheus-prod-13... no such host"
```

**Means:** Alloy cannot reach the remote endpoint.

**Common causes:**

- `sys.env("GRAFANA_METRICS_URL")` is empty or malformed
- DNS resolution failure (network/firewall issue)
- The endpoint is down or unreachable from this host
- Proxy settings not configured

**Fix:** Test connectivity from the host: `curl -v <the_url>`. Fix the URL, DNS, or firewall as needed.

---

### Component Health: Unhealthy / Degraded

In the web UI (`http://localhost:12345`), components show color-coded health:

| Color | Status | Meaning |
|---|---|---|
| Green | Healthy | Working normally |
| Yellow | Warning/Degraded | Partially working, may recover |
| Red | Unhealthy | Failed, needs attention |
| Gray | Unknown | Not yet evaluated or not applicable |

Click on any unhealthy component to see the detailed health message. The message usually contains the actual error (connection refused, 401, invalid config value, etc.).

---

### "context deadline exceeded"

```text
level=warn msg="scrape failed" err="context deadline exceeded"
```

**Means:** A scrape or request timed out.

**Common causes:**

- The scrape target is too slow to respond within the timeout
- `scrape_timeout` is shorter than the target needs
- Network latency between Alloy and the target

**Fix:** Increase the timeout or investigate why the target is slow:

```alloy
prometheus.scrape "slow_app" {
  targets         = [{"__address__" = "slow-app:8080"}]
  forward_to      = [prometheus.remote_write.default.receiver]
  scrape_interval = "60s"
  scrape_timeout  = "30s"   // default is 10s, increase if needed
}
```

---

### "too many open files"

```text
level=error msg="accept: too many open files"
```

**Means:** The Alloy process hit the OS file descriptor limit.

**Common cause:** Large deployments with many scrape targets, many log tails, or many concurrent connections can exhaust the default limit.

**Fix:** Increase the file descriptor limit in the systemd unit:

```ini
# /etc/systemd/system/alloy.service.d/override.conf
[Service]
LimitNOFILE=65536
```

Then reload and restart:

```bash
systemctl daemon-reload
systemctl restart alloy
```

## Using alloy validate

Before deploying a config change, validate it locally:

```bash
# Validate syntax and references
alloy validate config.alloy

# Validate with stability level (if using experimental components)
alloy validate --stability.level=experimental config.alloy
```

`alloy validate` catches all parse errors and reference errors (typos, missing components, type mismatches, cycles). It does not catch runtime errors (bad credentials, unreachable endpoints) because those require an actual running system.

**Use it in CI/CD.** Add `alloy validate` to your deployment pipeline. It catches the majority of config mistakes before they reach production.

## Using alloy fmt

Alloy includes a formatter that standardizes your config file style:

```bash
# Format a file in place
alloy fmt config.alloy

# Format and write to stdout (for checking)
alloy fmt -w=false config.alloy
```

`alloy fmt` does not catch errors -- it only reformats valid configs. But using it regularly helps keep configs readable and makes diffs easier to review.

## Quick Reference Table

| Error Message | Category | Usual Fix |
|---|---|---|
| `expected block label, got "#"` | Parse | Use `//` not `#` for comments |
| `expected "," or "]"` | Parse | Add trailing comma in list |
| `expected ";", got "s"` | Parse | Quote durations: `"60s"` |
| `expected block, got attribute` | Parse | Remove `=` from nested block |
| `X is not a valid component` | Parse | Check spelling, version, or stability level |
| `label X is already in use` | Parse | Use unique labels per component type |
| `cannot convert X to Y` | Type | Check expected type, usually missing `[ ]` on `forward_to` |
| `dependency cycle detected` | Wiring | Trace the cycle, fix the wrong `forward_to` |
| `does not exist or is out of scope` | Wiring | Fix typo, check label, check module scope |
| `unrecognized attribute` | Parse | Check docs for correct attribute name |
| `401 Unauthorized` | Runtime | Verify env vars, API key, and permissions |
| `connection refused` / `no such host` | Runtime | Check URL, DNS, and firewall |
| `context deadline exceeded` | Runtime | Increase timeout or fix slow target |
| `too many open files` | Runtime | Increase `LimitNOFILE` in systemd |

## Summary

- Use `alloy validate` to catch config errors before deployment
- Parse errors (bad syntax) prevent startup -- the error message points to the line
- Wiring errors (bad references) prevent startup -- check component names and labels carefully
- Runtime errors (auth, connectivity) do not prevent startup -- check the web UI and logs
- The web UI at port 12345 shows component health and is the fastest way to diagnose runtime issues
- When in doubt, the error reference table above covers the vast majority of errors you will encounter
