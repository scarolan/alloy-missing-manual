# Bootstrap vs Pipeline Scope

> TODO: Write this section.

## Overview

Understanding what goes in the bootstrap config vs what goes in FM pipelines.

## Key Concepts

- Bootstrap config: local file on disk, runs when Alloy starts
- FM pipelines: delivered remotely, each wrapped in a sealed module
- Bootstrap config is where you configure the FM connection itself
- Everything else should be in FM pipelines (so you can manage it centrally)

## What Goes Where

| Component | Bootstrap | FM Pipeline |
|---|---|---|
| FM connection config | Yes | No |
| prometheus.remote_write | Needed in each pipeline | Yes |
| loki.write | Needed in each pipeline | Yes |
| Scrape configs | No | Yes |
| Log collection | No | Yes |
| Relabel rules | No | Yes |

## Examples

## Summary
