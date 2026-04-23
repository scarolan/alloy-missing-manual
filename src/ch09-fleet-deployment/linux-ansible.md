# Linux: Ansible

> TODO: Write this section.

## Overview

Ansible playbook patterns for deploying Alloy across a Linux fleet.

## Key Concepts

- Installing the Alloy package (apt/yum repos or direct download)
- Templating config files with Jinja2 (host-specific values)
- Deploying credentials via `/etc/default/alloy` or `/etc/sysconfig/alloy`
- Handler for config reload vs full restart
- Idempotent deployment (run it 10 times, same result)

## Example Playbook

## Role Structure

```
roles/alloy/
├── defaults/main.yml
├── handlers/main.yml
├── tasks/
│   ├── main.yml
│   ├── install.yml
│   ├── configure.yml
│   └── credentials.yml
├── templates/
│   ├── alloy.config.j2
│   └── alloy.env.j2
└── vars/main.yml
```

## Common Mistakes

- Using `latest` instead of pinning a version
- Not using a handler for service restart (config changes don't take effect)
- Storing credentials in the playbook instead of Ansible Vault

## Summary
