# Windows: SCCM / MECM

> TODO: Write this section.

## Overview

Deploying Alloy across a Windows fleet using Microsoft Endpoint Configuration Manager (MECM, formerly SCCM).

## Key Concepts

- Creating an SCCM application vs package
- MSI-based installation with silent flags
- Config file deployment as a separate configuration item
- Credential deployment via SCCM or GPO
- Detection methods for compliance checking
- Phased deployment with collection targeting

## Example: SCCM Application

## Example: Detection Script

## Common Mistakes

- Deploying as a package instead of an application (no detection/compliance)
- Not separating config from installation (config updates don't need reinstall)
- Using user context instead of system context for deployment

## Summary
