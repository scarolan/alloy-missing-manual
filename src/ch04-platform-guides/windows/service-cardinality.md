# Windows: Service Cardinality

> TODO: Write this section.

## Overview

The single biggest cardinality problem on Windows. See also: Layer 5 in the Cardinality Control chapter.

A typical Windows Server has ~150 services. The windows_exporter generates metrics for each service across 8 state labels. That's **~1,200+ series** from services alone — often more than all other collectors combined.

## Key Concepts

- Why the default is so expensive
- Filtering to essential services and relevant states
- Cross-reference with Chapter 2, Layer 5

## Summary
