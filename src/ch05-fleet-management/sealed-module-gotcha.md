# The Sealed-Module Gotcha

> TODO: Write this section.

## Overview

Each Fleet Management pipeline is wrapped in a sealed `declare` module. Components inside the module **cannot reference components in the parent scope** — including the bootstrap config.

This is the single most confusing thing about Fleet Management.

## Key Concepts

- What a sealed `declare` module means
- Why components inside can't see the bootstrap config
- The practical impact: you can't share `prometheus.remote_write` or `loki.write` across pipelines

## The Gotcha in Action

You define `prometheus.remote_write "default"` in your bootstrap config. You create an FM pipeline that scrapes metrics and forwards to `prometheus.remote_write.default.receiver`. It fails: "component does not exist or is out of scope."

## The Fix

Every FM pipeline must include its own write endpoints.

## Common Mistakes

## Summary
