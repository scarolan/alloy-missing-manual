# Windows: Group Policy (GPO)

> TODO: Write this section.

## Overview

Using Group Policy for Alloy deployment and configuration on Windows domain-joined machines.

## Key Concepts

- Software installation via GPO (MSI deployment)
- Environment variable distribution via GPO Preferences
- Config file deployment via GPO file copy or script
- Startup scripts for initial setup
- GPO filtering with WMI filters and security groups

## Environment Variables via GPO

Computer Configuration > Preferences > Windows Settings > Environment

This is the cleanest way to distribute credentials across a Windows fleet without touching each machine.

## Example: GPO Structure

## Common Mistakes

- Using User Configuration instead of Computer Configuration (services run as SYSTEM)
- Not forcing a gpupdate after changes
- GPO processing order conflicts with other policies

## Summary
