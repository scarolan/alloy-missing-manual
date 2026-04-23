# Layer 2: Pattern Block

> TODO: Write this section.

## Overview

Even after allow-listing metric names, individual metrics can have high-cardinality label values. The pattern block drops metrics whose labels contain problematic patterns.

## Key Concepts

- Regex patterns that catch UUIDs in device/mountpoint labels
- Dropping virtual network interfaces (veth, cali, flannel, isatap, Teredo, vEthernet)
- Dropping container-related mount paths
- Dropping hidden volumes and GUID volumes on Windows
- Dropping `_Total` pseudo-instances on Windows

## Examples

## Common Mistakes

## Summary
