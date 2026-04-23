# Every Pipeline Needs Its Own Write Endpoints

> TODO: Write this section.

## Overview

Because of the sealed-module architecture, each FM pipeline must define its own `prometheus.remote_write` and/or `loki.write` components.

## Key Concepts

- Why you can't share write endpoints across the module boundary
- Template pattern for FM pipelines
- Credential management in FM pipelines (still use `sys.env()`)

## Examples

## The Duplication Problem

Yes, this means duplicating write endpoint config across pipelines. It's annoying but unavoidable.

## Common Mistakes

- Trying to reference bootstrap write endpoints from FM pipelines
- Forgetting credentials in FM pipeline write endpoints

## Summary
