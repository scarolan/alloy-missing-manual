# Fleet Management

Grafana Alloy supports remote configuration through Fleet Management (formerly "remotecfg"). This lets you manage Alloy pipelines centrally instead of editing config files on each host.

It's a powerful feature with one critical gotcha that will bite you if you don't know about it.

## What you'll learn

- The sealed-module architecture and why it matters
- How bootstrap config differs from pipeline config
- Why every FM pipeline needs its own write endpoints
