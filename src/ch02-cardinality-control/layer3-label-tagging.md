# Layer 3: Label Tagging

> TODO: Write this section.

## Overview

When a metric is missing expected labels, silently dropping it hides problems. Instead, tag it with `quality_warning="missing_required_labels"` so you can find and investigate it.

## Key Concepts

- Adding a quality_warning label instead of dropping
- Querying `{quality_warning=~".+"}` to find tagged metrics
- Why visibility beats silent dropping for debugging

## Examples

## Common Mistakes

## Summary
