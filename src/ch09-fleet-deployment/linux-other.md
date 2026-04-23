# Linux: Other Automation

Not every shop runs Ansible. This section covers deploying Alloy with Puppet, Chef, SaltStack, Terraform + cloud-init, and plain shell scripts. The principles from [Deployment Strategy](deployment-strategy.md) apply to all of them: pin the version, validate the config, separate credentials from config, and stagger rollouts.

## Puppet

Grafana provides example Puppet manifests in their [official documentation](https://grafana.com/docs/alloy/latest/set-up/install/puppet/). Here is a production-ready class structure.

### Module Structure

```
modules/alloy/
├── manifests/
│   ├── init.pp          # Main class
│   ├── repo.pp          # Repository setup
│   ├── install.pp       # Package installation
│   ├── config.pp        # Config file management
│   ├── credentials.pp   # Environment file (credentials)
│   └── service.pp       # Service management
├── templates/
│   ├── config.alloy.epp # Alloy config template
│   └── alloy.env.epp    # Environment file template
└── data/
    └── common.yaml      # Hiera defaults
```

### manifests/init.pp

```puppet
# @summary Installs and configures Grafana Alloy
#
# @param version       Package version to install
# @param manage_repo   Whether to manage the Grafana package repo
# @param config_source Puppet source for the Alloy config file
# @param metrics_url   Grafana Cloud metrics push URL
# @param metrics_user  Grafana Cloud metrics username
# @param logs_url      Grafana Cloud Loki push URL
# @param logs_user     Grafana Cloud Loki username
# @param api_key       Grafana Cloud API key (use Hiera eyaml)
class alloy (
  String  $version       = '1.8.1',
  Boolean $manage_repo   = true,
  String  $metrics_url   = '',
  String  $metrics_user  = '',
  String  $logs_url      = '',
  String  $logs_user     = '',
  Sensitive[String] $api_key = Sensitive(''),
) {
  contain alloy::repo
  contain alloy::install
  contain alloy::config
  contain alloy::credentials
  contain alloy::service

  Class['alloy::repo']
  -> Class['alloy::install']
  -> Class['alloy::credentials']
  -> Class['alloy::config']
  ~> Class['alloy::service']
}
```

### manifests/repo.pp

```puppet
# @summary Manages the Grafana package repository
class alloy::repo {
  case $facts['os']['family'] {
    'Debian': {
      apt::source { 'grafana':
        location => 'https://apt.grafana.com/',
        release  => '',
        repos    => 'stable main',
        key      => {
          id     => 'B53AE77BADB630A683046005963FA27710458545',
          source => 'https://apt.grafana.com/gpg.key',
        },
      }
    }
    'RedHat': {
      yumrepo { 'grafana':
        ensure   => 'present',
        descr    => 'Grafana Repository',
        baseurl  => 'https://rpm.grafana.com',
        gpgcheck => true,
        gpgkey   => 'https://rpm.grafana.com/gpg.key',
        enabled  => true,
        sslverify => true,
      }
    }
    default: {
      fail("Unsupported OS family: ${facts['os']['family']}")
    }
  }
}
```

### manifests/config.pp

```puppet
# @summary Deploys the Alloy configuration file
class alloy::config {
  file { '/etc/alloy/config.alloy':
    ensure  => file,
    owner   => 'root',
    group   => 'alloy',
    mode    => '0640',
    content => epp('alloy/config.alloy.epp'),
    notify  => Service['alloy'],
  }
}
```

### manifests/credentials.pp

```puppet
# @summary Deploys credentials via the environment file
class alloy::credentials {
  $env_file = $facts['os']['family'] ? {
    'Debian' => '/etc/default/alloy',
    'RedHat' => '/etc/sysconfig/alloy',
  }

  file { $env_file:
    ensure    => file,
    owner     => 'root',
    group     => 'root',
    mode      => '0600',
    content   => epp('alloy/alloy.env.epp'),
    show_diff => false,  # Prevents credentials from appearing in logs
    notify    => Service['alloy'],
  }
}
```

### Hiera Integration

```yaml
# data/common.yaml
alloy::version: '1.8.1'
alloy::manage_repo: true
alloy::metrics_url: 'https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push'
alloy::metrics_user: '000000'

# Encrypted with hiera-eyaml
alloy::api_key: ENC[PKCS7,MIIBmQYJKoZIhvcNAQcDoIIBijCCAYYCAQAx...]
```

## Chef

Grafana provides [official Chef recipe snippets](https://grafana.com/docs/alloy/latest/set-up/install/chef/). Here is a structured cookbook pattern.

### Cookbook Structure

```
cookbooks/alloy/
├── recipes/
│   ├── default.rb       # Main recipe
│   ├── repo.rb          # Repository setup
│   ├── install.rb       # Package install
│   ├── configure.rb     # Config file
│   ├── credentials.rb   # Environment file
│   └── service.rb       # Service management
├── templates/
│   ├── config.alloy.erb
│   └── alloy.env.erb
├── attributes/
│   └── default.rb
└── metadata.rb
```

### attributes/default.rb

```ruby
default['alloy']['version'] = '1.8.1'
default['alloy']['package'] = 'alloy'
default['alloy']['config_dir'] = '/etc/alloy'
default['alloy']['config_file'] = 'config.alloy'
default['alloy']['listen_port'] = 12345
```

### recipes/repo.rb (from official Grafana docs)

```ruby
if platform_family?('debian', 'rhel', 'amazon', 'fedora')
  if platform_family?('debian')
    remote_file '/etc/apt/keyrings/grafana.gpg' do
      source 'https://apt.grafana.com/gpg.key'
      mode '0644'
      action :create
    end

    file '/etc/apt/sources.list.d/grafana.list' do
      content "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com/ stable main"
      mode '0644'
      notifies :update, 'apt_update[update apt cache]', :immediately
    end

    apt_update 'update apt cache' do
      action :nothing
    end
  elsif platform_family?('rhel', 'amazon', 'fedora')
    yum_repository 'grafana' do
      description 'grafana'
      baseurl 'https://rpm.grafana.com'
      gpgcheck true
      gpgkey 'https://rpm.grafana.com/gpg.key'
      enabled true
      action :create
      notifies :run, 'execute[add-rhel-key]', :immediately
    end

    execute 'add-rhel-key' do
      command 'rpm --import https://rpm.grafana.com/gpg.key'
      action :nothing
    end
  end
else
  raise "The #{node['platform_family']} platform is not supported."
end
```

### recipes/install.rb

```ruby
package node['alloy']['package'] do
  version node['alloy']['version']
  action :install
  flush_cache [:before] if platform_family?('amazon', 'rhel', 'fedora')
  notifies :restart, 'service[alloy]', :delayed
end
```

### recipes/credentials.rb

```ruby
env_file = platform_family?('debian') ? '/etc/default/alloy' : '/etc/sysconfig/alloy'

template env_file do
  source 'alloy.env.erb'
  owner 'root'
  group 'root'
  mode '0600'
  sensitive true  # Prevents credentials from appearing in Chef logs
  variables(
    api_key: data_bag_item('alloy', 'credentials')['api_key'],
    metrics_url: node['alloy']['metrics_url'],
    metrics_username: node['alloy']['metrics_username']
  )
  notifies :restart, 'service[alloy]', :delayed
end
```

### recipes/service.rb

```ruby
service 'alloy' do
  service_name 'alloy'
  action [:enable, :start]
end
```

Store secrets in a Chef Vault or encrypted data bag, never in attributes.

## SaltStack

There is no official Salt formula for Alloy, but the state + pillar pattern maps naturally.

### State Structure

```
salt/
├── alloy/
│   ├── init.sls         # Main state
│   ├── repo.sls         # Repository setup
│   ├── install.sls      # Package install
│   ├── config.sls       # Config file
│   ├── credentials.sls  # Env file
│   └── service.sls      # Service management
├── alloy/files/
│   ├── config.alloy.jinja
│   └── alloy.env.jinja
pillar/
├── alloy/
│   └── init.sls         # Variables including credentials
```

### alloy/init.sls

```yaml
include:
  - alloy.repo
  - alloy.install
  - alloy.credentials
  - alloy.config
  - alloy.service
```

### alloy/repo.sls

```yaml
{% if grains['os_family'] == 'Debian' %}
grafana_gpg_key:
  file.managed:
    - name: /etc/apt/keyrings/grafana.asc
    - source: https://apt.grafana.com/gpg-full.key
    - skip_verify: false
    - mode: 644

grafana_apt_repo:
  pkgrepo.managed:
    - humanname: Grafana
    - name: deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main
    - file: /etc/apt/sources.list.d/grafana.list
    - require:
      - file: grafana_gpg_key

{% elif grains['os_family'] == 'RedHat' %}
grafana_rpm_key:
  cmd.run:
    - name: rpm --import https://rpm.grafana.com/gpg.key
    - unless: rpm -q gpg-pubkey --qf '%{summary}\n' | grep -q grafana

grafana_yum_repo:
  pkgrepo.managed:
    - name: grafana
    - humanname: Grafana
    - baseurl: https://rpm.grafana.com
    - gpgcheck: 1
    - gpgkey: https://rpm.grafana.com/gpg.key
    - enabled: 1
{% endif %}
```

### alloy/install.sls

```yaml
alloy_package:
  pkg.installed:
    - name: alloy
    - version: {{ pillar['alloy']['version'] }}
    - require:
      - pkgrepo: grafana_*_repo
```

### alloy/config.sls

```yaml
alloy_config:
  file.managed:
    - name: /etc/alloy/config.alloy
    - source: salt://alloy/files/config.alloy.jinja
    - template: jinja
    - user: root
    - group: alloy
    - mode: 640
    - require:
      - pkg: alloy_package
    - watch_in:
      - service: alloy_service
```

### Pillar Data

```yaml
# pillar/alloy/init.sls
alloy:
  version: '1.8.1-1'
  metrics_url: 'https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push'
  metrics_username: '000000'
  api_key: 'glc_xxxxxxxxxxxxx'  # Use Salt's GPG renderer for encryption
```

Use Salt's GPG renderer (`#!yaml|gpg`) for encrypting sensitive pillar data.

## Terraform + cloud-init

For cloud VMs provisioned with Terraform, cloud-init handles the first-boot installation. This is not a configuration management tool (it runs once at provisioning), so combine it with Ansible or Fleet Management for ongoing management.

### Terraform + cloud-init (AWS Example)

```hcl
resource "aws_instance" "alloy_target" {
  count         = var.instance_count
  ami           = var.ami_id
  instance_type = var.instance_type
  user_data     = templatefile("${path.module}/cloud-init.yml", {
    alloy_version      = var.alloy_version
    metrics_url        = var.grafana_metrics_url
    metrics_username   = var.grafana_metrics_username
    api_key            = var.grafana_api_key
    environment        = var.environment
  })

  tags = {
    Name        = "alloy-target-${count.index}"
    Environment = var.environment
  }
}
```

### cloud-init.yml

```yaml
#cloud-config
package_update: true

write_files:
  - path: /etc/apt/keyrings/grafana.asc
    permissions: '0644'
    defer: true
    content: |
      # GPG key will be fetched by runcmd below

  - path: /etc/default/alloy
    permissions: '0600'
    content: |
      CONFIG_FILE=/etc/alloy/config.alloy
      CUSTOM_ARGS=--server.http.listen-addr=0.0.0.0:12345 --storage.path=/var/lib/alloy
      GCLOUD_RW_API_KEY=${api_key}
      GRAFANA_METRICS_URL=${metrics_url}
      GRAFANA_METRICS_USERNAME=${metrics_username}

  - path: /etc/alloy/config.alloy
    permissions: '0640'
    content: |
      prometheus.exporter.unix "default" { }

      prometheus.scrape "node" {
        targets    = prometheus.exporter.unix.default.targets
        forward_to = [prometheus.remote_write.default.receiver]
        scrape_interval = "60s"
      }

      prometheus.remote_write "default" {
        endpoint {
          url = env("GRAFANA_METRICS_URL")
          basic_auth {
            username = env("GRAFANA_METRICS_USERNAME")
            password = env("GCLOUD_RW_API_KEY")
          }
        }
        external_labels = {
          environment = "${environment}",
        }
      }

runcmd:
  - mkdir -p /etc/apt/keyrings
  - wget -qO /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
  - chmod 644 /etc/apt/keyrings/grafana.asc
  - echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" | tee /etc/apt/sources.list.d/grafana.list
  - apt-get update
  - apt-get install -y alloy=${alloy_version}-1
  - systemctl enable alloy
  - systemctl start alloy
```

> **Important:** cloud-init is a one-shot provisioner. If you need to update configs after deployment, pair it with Fleet Management or a config management tool.

### Terraform + cloud-init (Azure Example)

```hcl
resource "azurerm_linux_virtual_machine" "alloy_target" {
  # ...standard Azure VM config...
  custom_data = base64encode(templatefile("${path.module}/cloud-init.yml", {
    alloy_version    = var.alloy_version
    metrics_url      = var.grafana_metrics_url
    metrics_username = var.grafana_metrics_username
    api_key          = var.grafana_api_key
    environment      = var.environment
  }))
}
```

## Shell Scripts

For environments without configuration management tooling, a shell script works. It is the least maintainable option but sometimes it is what you have.

### install-alloy.sh (Debian/Ubuntu)

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
ALLOY_VERSION="${ALLOY_VERSION:-1.8.1}"
METRICS_URL="${METRICS_URL:?METRICS_URL is required}"
METRICS_USERNAME="${METRICS_USERNAME:?METRICS_USERNAME is required}"
API_KEY="${API_KEY:?API_KEY is required}"

echo "==> Installing Grafana Alloy ${ALLOY_VERSION}"

# --- Add Grafana repository ---
sudo mkdir -p /etc/apt/keyrings
sudo wget -qO /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
sudo chmod 644 /etc/apt/keyrings/grafana.asc
echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" \
  | sudo tee /etc/apt/sources.list.d/grafana.list >/dev/null

# --- Install package ---
sudo apt-get update -qq
sudo apt-get install -y -qq "alloy=${ALLOY_VERSION}-1"

# --- Deploy credentials ---
sudo tee /etc/default/alloy >/dev/null <<EOF
CONFIG_FILE=/etc/alloy/config.alloy
CUSTOM_ARGS=--server.http.listen-addr=127.0.0.1:12345 --storage.path=/var/lib/alloy
GCLOUD_RW_API_KEY=${API_KEY}
GRAFANA_METRICS_URL=${METRICS_URL}
GRAFANA_METRICS_USERNAME=${METRICS_USERNAME}
EOF
sudo chmod 600 /etc/default/alloy

# --- Deploy config ---
sudo tee /etc/alloy/config.alloy >/dev/null <<'ALLOY_CONFIG'
prometheus.exporter.unix "default" { }

prometheus.scrape "node" {
  targets    = prometheus.exporter.unix.default.targets
  forward_to = [prometheus.remote_write.default.receiver]
  scrape_interval = "60s"
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
ALLOY_CONFIG

# --- Validate config ---
if alloy validate /etc/alloy/config.alloy; then
  echo "==> Config validation passed"
else
  echo "==> ERROR: Config validation failed" >&2
  exit 1
fi

# --- Start service ---
sudo systemctl daemon-reload
sudo systemctl enable alloy
sudo systemctl restart alloy

# --- Verify ---
sleep 5
if curl -sf http://localhost:12345/-/ready >/dev/null 2>&1; then
  echo "==> Alloy is ready"
else
  echo "==> WARNING: Alloy readiness check failed" >&2
  sudo systemctl status alloy --no-pager
  exit 1
fi

echo "==> Done"
```

### Running the script

```bash
# Pass credentials as environment variables (never as command-line arguments)
sudo METRICS_URL="https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push" \
     METRICS_USERNAME="000000" \
     API_KEY="glc_xxxxxxxxxxxxx" \
     ALLOY_VERSION="1.8.1" \
     bash install-alloy.sh
```

### install-alloy.sh (RHEL/Rocky)

The RHEL variant differs only in the repository and package manager commands:

```bash
# --- Add Grafana repository ---
sudo rpm --import https://rpm.grafana.com/gpg.key
cat <<'REPO' | sudo tee /etc/yum.repos.d/grafana.repo >/dev/null
[grafana]
name=grafana
baseurl=https://rpm.grafana.com
repo_gpgcheck=1
enabled=1
gpgcheck=1
gpgkey=https://rpm.grafana.com/gpg.key
sslverify=1
sslcacert=/etc/pki/tls/certs/ca-bundle.crt
REPO

# --- Install package ---
sudo dnf install -y "alloy-${ALLOY_VERSION}"

# --- Credentials go to /etc/sysconfig/alloy instead of /etc/default/alloy ---
```

Everything else (config deployment, validation, service management) is identical.

## Common Patterns Across Tools

Regardless of which tool you use, these patterns apply:

| Pattern | Why |
|---|---|
| **Pin the Alloy version** | Reproducibility and clean rollbacks |
| **Separate credentials from config** | Different change frequencies, different security requirements |
| **Use the tool's native secret management** | Hiera eyaml (Puppet), Chef Vault (Chef), GPG pillar (Salt), Ansible Vault (Ansible) |
| **Validate config before deploying** | `alloy validate` catches syntax errors before they break the service |
| **Use reload for config changes** | POST to `/-/reload` or `SIGHUP` avoids service interruption |
| **Use restart only for credential or version changes** | Environment variables are set at process start time |
| **Idempotent operations** | Running the tool twice should produce the same result as running it once |

## Summary

Every configuration management tool follows the same pattern: add the Grafana repository, install the pinned package version, deploy credentials securely, deploy and validate the config, and manage the service. The tool-specific details differ, but the sequence and principles do not. Choose the tool your team already knows. The fastest path to a deployed fleet is the one that fits your existing workflow.
