# Alloy - The Missing Manual

A practical, opinionated guide to [Grafana Alloy](https://grafana.com/docs/alloy/latest/) — the observability pipeline tool that replaced Grafana Agent.

This is an **unofficial, community-driven** resource. It is not affiliated with or endorsed by Grafana Labs.

## Who is this for?

- **New Alloy users** trying to get past the initial learning curve
- **Grafana SEs** who need battle-tested configs and patterns
- **Operations teams** managing Alloy fleets at scale
- **Anyone** who has been bitten by cardinality explosions, cryptic error messages, or Windows service quirks

## What's inside

| Chapter | What you'll learn |
|---|---|
| Config Language Survival Guide | Syntax traps, gotchas, and "why doesn't this work?" |
| Cardinality Control | The 5-layer protection pattern that saves your Prometheus budget |
| Credentials & Secrets | The `sys.env()` pattern on Linux and Windows |
| Platform Guides | Linux systemd, Windows services, non-root, domain controllers |
| Fleet Management | Sealed modules, bootstrap scope, pipeline isolation |
| Cost Optimization | Top-N series, Adaptive Metrics, dangerous label patterns |
| Recipes & Examples | SNMP, blackbox, network testing, starter configs |
| OpenTelemetry Native Support | The new OTEL-native mode and what it means for your configs |
| Fleet Deployment | Rolling out Alloy across thousands of VMs with SCCM, GPO, Ansible, and more |

## Building the book

This project uses [mdBook](https://rust-lang.github.io/mdBook/).

```bash
# Install mdBook
cargo install mdbook

# Build and serve locally
mdbook serve --open
```

## Contributing

Contributions are welcome! Please open an issue or pull request. See the
[edit links](https://github.com/scarolan/alloy-missing-manual/edit/main/) on
each page of the rendered book for quick fixes.

## License

This work is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
