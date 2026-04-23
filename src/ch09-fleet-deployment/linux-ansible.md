# Linux: Ansible

Ansible is the most common tool for deploying Alloy across Linux fleets. Grafana provides an official Ansible role in the `grafana.grafana` collection. This section covers both the official role and a custom role pattern for teams that need more control.

## The Official Grafana Ansible Collection

The `grafana.grafana` collection on Ansible Galaxy includes an `alloy` role that handles package installation, configuration, and service management across Debian, Ubuntu, RHEL, Rocky, AlmaLinux, SUSE, and macOS.

### Install the Collection

```bash
ansible-galaxy collection install grafana.grafana
```

### Minimal Playbook

```yaml
- name: Deploy Alloy
  hosts: alloy_fleet
  become: true

  tasks:
    - name: Install and configure Alloy
      ansible.builtin.include_role:
        name: grafana.grafana.alloy
      vars:
        alloy_version: "1.8.1"
        alloy_config: |
          prometheus.scrape "default" {
            targets = [{"__address__" = "localhost:12345"}]
            forward_to = [prometheus.remote_write.default.receiver]
          }

          prometheus.remote_write "default" {
            endpoint {
              url = env("GRAFANA_METRICS_URL")
              basic_auth {
                username = env("GRAFANA_METRICS_USERNAME")
                password = env("GCLOUD_RW_API_KEY")
              }
            }
          }
```

### Official Role Variables

| Variable | Default | Description |
|---|---|---|
| `alloy_version` | `"latest"` | Version to install. **Always override this in production.** |
| `alloy_uninstall` | `false` | Set to `true` to remove Alloy |
| `alloy_expose_port` | `false` | Add a firewalld rule to expose the Alloy HTTP port |
| `alloy_user_groups` | `[]` | Additional groups for the `alloy` user (e.g., `["systemd-journal"]`) |
| `alloy_env_file_vars` | `{}` | Dictionary of environment variables written to the env file |
| `alloy_systemd_override` | `{}` | Systemd drop-in override settings |
| `alloy_config` | `{}` | The Alloy configuration block (written to `/etc/alloy/config.alloy`) |
| `alloy_github_api_url` | GitHub API releases URL | Override for air-gapped environments |
| `alloy_download_url_rpm` | GitHub releases URL | Custom RPM download URL |
| `alloy_download_url_deb` | GitHub releases URL | Custom DEB download URL |
| `alloy_readiness_check_use_https` | `false` | Use HTTPS for the post-deploy readiness check |
| `alloy_readiness_check_use_proxy` | `true` | Use proxy for the readiness check |

### Official Role Handlers

The role defines two handlers:

```yaml
# Handler 1: Linux (systemd)
- name: Restart alloy
  listen: "restart alloy"
  ansible.builtin.systemd:
    daemon_reload: true
    name: alloy.service
    state: restarted
    enabled: true
  when: not ansible_check_mode

# Handler 2: macOS (Homebrew)
- name: Restart alloy macos
  listen: "restart alloy macos"
  ansible.builtin.command: "brew services restart alloy"
  when:
    - not ansible_check_mode
    - ansible_facts['os_family'] == 'Darwin'
```

### Uninstall

```bash
ansible-playbook deploy-alloy.yml -e "alloy_uninstall=true"
```

## Building a Custom Role

The official role is a good starting point, but many teams need more control: credential management via Ansible Vault, environment-specific config templates, config validation before restart, and separation of concerns between install, configure, and credentials. Here is a custom role structure.

### Role Directory Structure

```
roles/alloy/
├── defaults/
│   └── main.yml           # Default variables (version, ports, paths)
├── handlers/
│   └── main.yml           # Restart and reload handlers
├── tasks/
│   ├── main.yml           # Entry point: routes to install/configure/credentials
│   ├── repo.yml           # Add Grafana apt/yum repository
│   ├── install.yml        # Install the alloy package
│   ├── configure.yml      # Deploy config file from template
│   └── credentials.yml    # Deploy credentials to env file
├── templates/
│   ├── config.alloy.j2    # Alloy configuration template
│   └── alloy.env.j2       # Environment file template
└── vars/
    ├── Debian.yml          # Debian/Ubuntu-specific variables
    └── RedHat.yml          # RHEL/Rocky/CentOS-specific variables
```

### defaults/main.yml

```yaml
---
# Alloy version - always pin in production
alloy_version: "1.8.1"

# Package name
alloy_package: "alloy"

# Service settings
alloy_service_name: "alloy"
alloy_service_enabled: true
alloy_service_state: started

# Config paths
alloy_config_dir: "/etc/alloy"
alloy_config_file: "config.alloy"
alloy_storage_path: "/var/lib/alloy"

# HTTP server
alloy_listen_addr: "127.0.0.1"
alloy_listen_port: 12345

# Grafana repository
alloy_manage_repo: true

# User and group
alloy_user: "alloy"
alloy_user_groups: []

# Stagger start for thundering herd prevention
alloy_stagger_start: false
alloy_stagger_max_seconds: 60

# Credentials (use Ansible Vault for values)
alloy_grafana_metrics_url: ""
alloy_grafana_metrics_username: ""
alloy_grafana_logs_url: ""
alloy_grafana_logs_username: ""
alloy_grafana_api_key: ""
```

### vars/Debian.yml

```yaml
---
alloy_env_file: "/etc/default/alloy"
alloy_repo_gpg_key_url: "https://apt.grafana.com/gpg-full.key"
alloy_repo_gpg_key_path: "/etc/apt/keyrings/grafana.asc"
alloy_repo_url: "https://apt.grafana.com"
alloy_repo_component: "stable main"
```

### vars/RedHat.yml

```yaml
---
alloy_env_file: "/etc/sysconfig/alloy"
alloy_repo_gpg_key_url: "https://rpm.grafana.com/gpg.key"
alloy_repo_url: "https://rpm.grafana.com"
```

### tasks/main.yml

```yaml
---
- name: Include OS-specific variables
  ansible.builtin.include_vars: "{{ ansible_os_family }}.yml"

- name: Add Grafana repository
  ansible.builtin.include_tasks: repo.yml
  when: alloy_manage_repo

- name: Install Alloy package
  ansible.builtin.include_tasks: install.yml

- name: Deploy credentials
  ansible.builtin.include_tasks: credentials.yml

- name: Deploy configuration
  ansible.builtin.include_tasks: configure.yml
```

### tasks/repo.yml

```yaml
---
# --- Debian/Ubuntu ---
- name: Add Grafana GPG key (Debian)
  ansible.builtin.get_url:
    url: "{{ alloy_repo_gpg_key_url }}"
    dest: "{{ alloy_repo_gpg_key_path }}"
    mode: "0644"
  when: ansible_os_family == "Debian"

- name: Add Grafana APT repository
  ansible.builtin.apt_repository:
    repo: "deb [signed-by={{ alloy_repo_gpg_key_path }}] {{ alloy_repo_url }} {{ alloy_repo_component }}"
    state: present
    filename: grafana
  when: ansible_os_family == "Debian"

# --- RedHat/CentOS/Rocky ---
- name: Import Grafana RPM GPG key
  ansible.builtin.rpm_key:
    key: "{{ alloy_repo_gpg_key_url }}"
    state: present
  when: ansible_os_family == "RedHat"

- name: Add Grafana YUM repository
  ansible.builtin.yum_repository:
    name: grafana
    description: Grafana Repository
    baseurl: "{{ alloy_repo_url }}"
    gpgcheck: true
    gpgkey: "{{ alloy_repo_gpg_key_url }}"
    sslverify: true
    sslcacert: /etc/pki/tls/certs/ca-bundle.crt
    enabled: true
  when: ansible_os_family == "RedHat"
```

### tasks/install.yml

```yaml
---
- name: Install Alloy package (Debian)
  ansible.builtin.apt:
    name: "{{ alloy_package }}={{ alloy_version }}-1"
    state: present
    update_cache: true
  when: ansible_os_family == "Debian"
  notify: restart alloy

- name: Install Alloy package (RedHat)
  ansible.builtin.dnf:
    name: "{{ alloy_package }}-{{ alloy_version }}"
    state: present
  when: ansible_os_family == "RedHat"
  notify: restart alloy

- name: Ensure storage directory exists
  ansible.builtin.file:
    path: "{{ alloy_storage_path }}"
    state: directory
    owner: "{{ alloy_user }}"
    mode: "0755"

- name: Add alloy user to additional groups
  ansible.builtin.user:
    name: "{{ alloy_user }}"
    groups: "{{ alloy_user_groups }}"
    append: true
  when: alloy_user_groups | length > 0
  notify: restart alloy
```

### tasks/credentials.yml

```yaml
---
- name: Deploy environment file with credentials
  ansible.builtin.template:
    src: alloy.env.j2
    dest: "{{ alloy_env_file }}"
    owner: root
    group: root
    mode: "0600"
  notify: restart alloy
  no_log: true  # Prevents credentials from appearing in Ansible output
```

### tasks/configure.yml

```yaml
---
- name: Deploy Alloy configuration
  ansible.builtin.template:
    src: config.alloy.j2
    dest: "{{ alloy_config_dir }}/{{ alloy_config_file }}"
    owner: root
    group: "{{ alloy_user }}"
    mode: "0640"
    validate: "alloy validate %s"
  notify: reload alloy

- name: Ensure Alloy service is enabled and started
  ansible.builtin.systemd:
    name: "{{ alloy_service_name }}"
    enabled: "{{ alloy_service_enabled }}"
    state: "{{ alloy_service_state }}"
    daemon_reload: true
```

The `validate` parameter on the template task runs `alloy validate` against the rendered template before deploying it. If validation fails, the file is not deployed and the play fails. This is your safety net.

### handlers/main.yml

```yaml
---
# Reload: picks up config changes without restarting the process.
# Does NOT pick up environment variable changes.
- name: reload alloy
  ansible.builtin.uri:
    url: "http://{{ alloy_listen_addr }}:{{ alloy_listen_port }}/-/reload"
    method: POST
    status_code: 200
  listen: "reload alloy"

# Restart: full process restart. Required for env var changes,
# version upgrades, and when reload fails.
- name: restart alloy
  ansible.builtin.systemd:
    name: "{{ alloy_service_name }}"
    state: restarted
    daemon_reload: true
    enabled: true
  listen: "restart alloy"
```

**Key distinction:** Config file changes trigger a **reload** (POST to `/-/reload`), which is non-disruptive. Credential changes, package upgrades, and group membership changes trigger a **restart**, which briefly interrupts collection.

### templates/alloy.env.j2

```jinja2
# Managed by Ansible - do not edit manually
# Alloy environment file

# Service arguments
CONFIG_FILE={{ alloy_config_dir }}/{{ alloy_config_file }}
CUSTOM_ARGS=--server.http.listen-addr={{ alloy_listen_addr }}:{{ alloy_listen_port }} --storage.path={{ alloy_storage_path }}

# Grafana Cloud credentials
{% if alloy_grafana_api_key %}
GCLOUD_RW_API_KEY={{ alloy_grafana_api_key }}
{% endif %}
{% if alloy_grafana_metrics_url %}
GRAFANA_METRICS_URL={{ alloy_grafana_metrics_url }}
GRAFANA_METRICS_USERNAME={{ alloy_grafana_metrics_username }}
{% endif %}
{% if alloy_grafana_logs_url %}
GRAFANA_LOGS_URL={{ alloy_grafana_logs_url }}
GRAFANA_LOGS_USERNAME={{ alloy_grafana_logs_username }}
{% endif %}
```

### templates/config.alloy.j2

```jinja2
// Managed by Ansible - do not edit manually
// Host: {{ inventory_hostname }}
// Generated: {{ ansible_date_time.iso8601 }}

// ── Prometheus Scrape ──────────────────────────────────────
prometheus.scrape "default" {
  targets = [{"__address__" = "localhost:{{ alloy_listen_port }}"}]
  forward_to = [prometheus.remote_write.default.receiver]
  scrape_interval = "60s"
}

// ── Node Exporter (Linux metrics) ──────────────────────────
{% if alloy_enable_node_exporter | default(true) %}
prometheus.exporter.unix "default" { }

prometheus.scrape "node" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.remote_write.default.receiver]
  scrape_interval = "60s"
}
{% endif %}

// ── Remote Write ───────────────────────────────────────────
prometheus.remote_write "default" {
  endpoint {
    url = env("GRAFANA_METRICS_URL")
    basic_auth {
      username = env("GRAFANA_METRICS_USERNAME")
      password = env("GCLOUD_RW_API_KEY")
    }
  }
  external_labels = {
    cluster    = "{{ alloy_cluster_name | default('default') }}",
    environment = "{{ alloy_environment | default('production') }}",
  }
}

{% if alloy_enable_logs | default(false) %}
// ── Journal Logs ───────────────────────────────────────────
loki.source.journal "default" {
  forward_to = [loki.write.default.receiver]
  labels = {
    job = "systemd-journal",
  }
}

loki.write "default" {
  endpoint {
    url = env("GRAFANA_LOGS_URL")
    basic_auth {
      username = env("GRAFANA_LOGS_USERNAME")
      password = env("GCLOUD_RW_API_KEY")
    }
  }
  external_labels = {
    cluster     = "{{ alloy_cluster_name | default('default') }}",
    environment = "{{ alloy_environment | default('production') }}",
  }
}
{% endif %}
```

## Ansible Vault for Credentials

Never store API keys in plain text in your playbook or inventory. Use Ansible Vault.

### Encrypt the credentials

```bash
ansible-vault encrypt_string 'glc_xxxxxxxxxxxxx' --name 'alloy_grafana_api_key'
```

This outputs a block you paste into your inventory or group_vars:

```yaml
alloy_grafana_api_key: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  61626364656667...
```

### Group vars structure

```
inventory/
├── hosts.yml
├── group_vars/
│   ├── all.yml                     # Common settings (version, features)
│   ├── production.yml              # Production endpoints
│   ├── staging.yml                 # Staging endpoints
│   └── vault.yml                   # Encrypted credentials (ansible-vault)
└── host_vars/
    └── special-host.yml            # Host-specific overrides
```

**group_vars/all.yml:**

```yaml
alloy_version: "1.8.1"
alloy_enable_node_exporter: true
alloy_enable_logs: false
alloy_cluster_name: "my-company"
```

**group_vars/production.yml:**

```yaml
alloy_environment: "production"
alloy_grafana_metrics_url: "https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push"
alloy_grafana_metrics_username: "000000"
alloy_grafana_logs_url: "https://logs-prod-006.grafana.net/loki/api/v1/push"
alloy_grafana_logs_username: "000000"
```

**group_vars/vault.yml** (encrypted with `ansible-vault encrypt`):

```yaml
alloy_grafana_api_key: "glc_xxxxxxxxxxxxx"
```

### Example Inventory

```yaml
# inventory/hosts.yml
all:
  children:
    production:
      children:
        prod_webservers:
          hosts:
            web-[01:20].prod.example.com:
        prod_databases:
          hosts:
            db-[01:05].prod.example.com:
          vars:
            alloy_user_groups:
              - mysql
    staging:
      children:
        staging_all:
          hosts:
            staging-[01:05].example.com:
          vars:
            alloy_environment: "staging"
```

### Run with Vault

```bash
# Prompted for vault password
ansible-playbook -i inventory/hosts.yml deploy-alloy.yml --ask-vault-pass

# Using a vault password file
ansible-playbook -i inventory/hosts.yml deploy-alloy.yml \
  --vault-password-file ~/.vault_password
```

## The Full Playbook

```yaml
---
- name: Deploy Grafana Alloy
  hosts: alloy_fleet
  become: true
  serial: 50  # Deploy in batches of 50 to avoid thundering herd

  pre_tasks:
    - name: Verify network connectivity to metrics endpoint
      ansible.builtin.uri:
        url: "{{ alloy_grafana_metrics_url }}"
        method: HEAD
        status_code: [200, 401, 405]
        timeout: 10
      when: alloy_grafana_metrics_url | length > 0
      ignore_errors: false

  roles:
    - role: alloy

  post_tasks:
    - name: Wait for Alloy to be ready
      ansible.builtin.uri:
        url: "http://{{ alloy_listen_addr }}:{{ alloy_listen_port }}/-/ready"
        status_code: 200
      register: ready_check
      until: ready_check.status == 200
      retries: 12
      delay: 5

    - name: Verify Alloy is healthy
      ansible.builtin.uri:
        url: "http://{{ alloy_listen_addr }}:{{ alloy_listen_port }}/-/healthy"
        status_code: 200
      register: healthy_check
      failed_when: healthy_check.status != 200
```

## Idempotency

Every task in this role is idempotent. Running the playbook 10 times produces the same result as running it once:

- **Repository tasks**: `state: present` is a no-op if already present
- **Package install**: `state: present` with a pinned version only installs if the version is not already installed
- **Template tasks**: Only write the file (and notify the handler) if the rendered content differs from what is on disk
- **Service tasks**: `state: started` is a no-op if already running

This means you can safely run the playbook on a schedule (e.g., every hour via cron or AWX/Tower) to enforce desired state and correct drift.

## Common Mistakes

| Mistake | What Happens | Fix |
|---|---|---|
| Using `alloy_version: "latest"` | Different hosts get different versions over time | Always pin: `alloy_version: "1.8.1"` |
| Credentials in plain text in playbook | Secrets visible in version control | Use Ansible Vault |
| No handler for config changes | Config deploys but Alloy keeps running old config | Use `notify: reload alloy` on the template task |
| Using `restart` handler for config changes | Unnecessary service interruption | Use `reload` (POST to `/-/reload`) for config; `restart` only for env/package changes |
| Missing `validate` on template | Bad config deployed, service crashes on restart | Add `validate: "alloy validate %s"` to the template task |
| No `serial` on large fleets | Thundering herd on write endpoints | Set `serial: 50` or `serial: "10%"` |
| `no_log: true` missing on credentials task | API keys visible in Ansible output | Add `no_log: true` to credential tasks |
| Not adding `alloy` user to `systemd-journal` group | Journal log collection fails silently | Set `alloy_user_groups: ["systemd-journal"]` |

## Summary

The `grafana.grafana.alloy` collection role handles the basics. For production fleets, build a custom role that separates repository setup, installation, credentials, and configuration into distinct task files. Use Jinja2 templates for environment-specific configs, Ansible Vault for credentials, and the `validate` parameter on template tasks as a pre-deploy safety net. Always pin the version, use `serial` to stagger deployment, and use `reload` instead of `restart` for config-only changes.
