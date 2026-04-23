# Windows: Domain Controller Considerations

> TODO: Write this section.

## Overview

Domain controllers have unique monitoring challenges: extremely high event log volume, additional services to monitor, and security constraints.

## Key Concepts

- Security event log volume on DCs (authentication events for every user/computer)
- Consider commenting out Security log collection or aggressive xpath filtering
- Additional services to include in monitoring (AD DS, DNS, Kerberos, etc.)
- Group Policy considerations for fleet-wide Alloy configuration

## Examples

## Common Mistakes

## Summary
