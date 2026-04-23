# Gotchas and Traps

> TODO: Write this section.

## Overview

A curated list of the things that trip up every new Alloy user.

## Key Gotchas

- Trailing commas are required on list and object elements
- `#` does not work for comments — only `//`
- No global variables — repeated values must be copied everywhere
- No conditionals, loops, or dynamic block generation
- No variable interpolation — use `sys.env()` for external values
- Component names are flat despite the dot syntax suggesting hierarchy
- The syntax looks like HCL2 but is NOT HCL2
- No `locals` block or equivalent

## Examples

## Workarounds

## Summary
