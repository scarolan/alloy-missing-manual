# SNMP Monitoring

> TODO: Write this section.

## Overview

Using Alloy's built-in SNMP exporter to monitor network devices, NAS appliances, and other SNMP-enabled infrastructure.

## Key Concepts

- SNMP targets in a separate YAML file loaded via `local.file`
- Generating SNMP module YAML from vendor MIBs using `snmp_exporter/generator`
- `encoding.from_yaml()` to parse targets inline
- Walk params with retries and timeout
- Testing via the Alloy API: `http://host:12345/api/v0/component/prometheus.exporter.snmp.NAME/metrics`

## Example: Synology NAS

## Common Mistakes

- Trying to inline SNMP targets instead of using a file
- Not generating the module YAML from the correct MIB version

## Summary
