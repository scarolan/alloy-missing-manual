# Starter Configs

Six copy-paste-ready Alloy configurations, from basic host monitoring to OTLP gateways and Fleet Management bootstrapping. Each config is self-contained, uses `sys.env()` for all credentials, and includes the cardinality controls from Chapter 2.

Pick the config that matches your use case, set the environment variables on the host, drop the config in place, and restart Alloy.

## Prerequisites (All Configs)

Before deploying any of these configs, you need:

1. **Alloy installed** -- from the Grafana APT/YUM repo (Linux) or MSI installer (Windows). See the [official install docs](https://grafana.com/docs/alloy/latest/set-up/install/).
2. **Environment variables set** -- follow [Linux Environment Setup](../ch03-credentials-and-secrets/linux-env-setup.md) or [Windows Environment Setup](../ch03-credentials-and-secrets/windows-env-setup.md). Every config below requires at minimum `GCLOUD_RW_API_KEY`.
3. **Grafana Cloud stack** -- with Prometheus, Loki, and/or Tempo endpoints. The URLs and usernames come from your stack's "Details" page in the Grafana Cloud portal.

The five standard environment variables used across these configs:

| Variable | Example Value | Used By |
|---|---|---|
| `GCLOUD_RW_API_KEY` | `glc_xxxxxxxxxxxxx` | All configs |
| `GRAFANA_METRICS_URL` | `https://prometheus-prod-13-prod-us-east-0.grafana.net/api/prom/push` | Metrics configs |
| `GRAFANA_METRICS_USERNAME` | `000000` | Metrics configs |
| `GRAFANA_LOGS_URL` | `https://logs-prod-006.grafana.net/loki/api/v1/push` | Logs configs |
| `GRAFANA_LOGS_USERNAME` | `000000` | Logs configs |


---

## 1. Linux Metrics Only

Collects host metrics using the built-in node exporter (`prometheus.exporter.unix`), applies the Chapter 2 allow-list for [Dashboard 1860 (Node Exporter Full)](https://grafana.com/grafana/dashboards/1860-node-exporter-full/), and ships to Grafana Cloud. This is the most common starting point for Linux monitoring.

**Expected series count:** 400-600 on a typical cloud VM (2-4 vCPU, 2 disks, 2 NICs). See [Before and After](../ch02-cardinality-control/before-and-after.md) for detailed scaling math.

**Environment variables required:** `GCLOUD_RW_API_KEY`, `GRAFANA_METRICS_URL`, `GRAFANA_METRICS_USERNAME`

**Config file location:** `/etc/alloy/config.alloy`

```alloy
// =================================================================
// Linux Metrics Only -- Node Exporter Full (Dashboard 1860)
// =================================================================
// Collects host metrics with full cardinality controls applied.
// Set env vars in /etc/default/alloy (Debian/Ubuntu)
//   or /etc/sysconfig/alloy (RHEL/Rocky/SUSE).
// =================================================================

// --- Write Endpoint ---
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Node Exporter ---
prometheus.exporter.unix "integrations_node_exporter" {
  enable_collectors = ["tcpstat", "systemd"]

  systemd {
    unit_include = "(sshd?\\.service|crond?\\.service|chronyd?\\.service|systemd-journald\\.service|alloy\\.service|docker\\.service)"
  }

  filesystem {
    fs_types_exclude     = "^(autofs|binfmt_misc|bpf|cgroup2?|configfs|debugfs|devpts|devtmpfs|tmpfs|fusectl|hugetlbfs|iso9660|mqueue|nsfs|overlay|proc|procfs|pstore|rpc_pipefs|securityfs|selinuxfs|squashfs|sysfs|tracefs)$"
    mount_points_exclude = "^/(dev|proc|run/credentials/.+|sys|var/lib/docker/.+)($|/)"
  }
}

// --- Discovery + Relabel ---
discovery.relabel "integrations_node_exporter" {
  targets = prometheus.exporter.unix.integrations_node_exporter.targets
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
  rule {
    target_label = "job"
    replacement  = "integrations/node_exporter"
  }
}

// --- Scrape ---
prometheus.scrape "integrations_node_exporter" {
  targets         = discovery.relabel.integrations_node_exporter.output
  forward_to      = [prometheus.relabel.integrations_node_exporter.receiver]
  scrape_interval = "60s"
}

// --- Cardinality Control (Layers 1-4) ---
prometheus.relabel "integrations_node_exporter" {
  forward_to = [prometheus.remote_write.metrics_service.receiver]

  // Layer 1: Allow-list -- only Dashboard 1860 metrics pass through
  rule {
    source_labels = ["__name__"]
    regex = join([
      // -- Uptime & clock --
      "up",
      "node_boot_time_seconds",
      "node_time_seconds",
      "node_time_zone_offset_seconds",

      // -- CPU --
      "node_cpu_seconds_total",
      "node_cpu_guest_seconds_total",
      "node_cpu_scaling_frequency_hertz",
      "node_cpu_scaling_frequency_max_hertz",
      "node_cpu_scaling_frequency_min_hertz",
      "node_load1",
      "node_load5",
      "node_load15",

      // -- Memory --
      "node_memory_MemTotal_bytes",
      "node_memory_MemFree_bytes",
      "node_memory_MemAvailable_bytes",
      "node_memory_Buffers_bytes",
      "node_memory_Cached_bytes",
      "node_memory_SwapTotal_bytes",
      "node_memory_SwapFree_bytes",
      "node_memory_SwapCached_bytes",
      "node_memory_Active_bytes",
      "node_memory_Inactive_bytes",
      "node_memory_Active_anon_bytes",
      "node_memory_Inactive_anon_bytes",
      "node_memory_Active_file_bytes",
      "node_memory_Inactive_file_bytes",
      "node_memory_AnonPages_bytes",
      "node_memory_AnonHugePages_bytes",
      "node_memory_Mapped_bytes",
      "node_memory_Shmem_bytes",
      "node_memory_ShmemHugePages_bytes",
      "node_memory_ShmemPmdMapped_bytes",
      "node_memory_Slab_bytes",
      "node_memory_SReclaimable_bytes",
      "node_memory_SUnreclaim_bytes",
      "node_memory_Dirty_bytes",
      "node_memory_Writeback_bytes",
      "node_memory_WritebackTmp_bytes",
      "node_memory_CommitLimit_bytes",
      "node_memory_Committed_AS_bytes",
      "node_memory_VmallocUsed_bytes",
      "node_memory_VmallocTotal_bytes",
      "node_memory_VmallocChunk_bytes",
      "node_memory_DirectMap1G_bytes",
      "node_memory_DirectMap2M_bytes",
      "node_memory_DirectMap4k_bytes",
      "node_memory_Unevictable_bytes",
      "node_memory_Mlocked_bytes",
      "node_memory_HugePages_Free",
      "node_memory_HugePages_Rsvd",
      "node_memory_HugePages_Surp",
      "node_memory_HugePages_Total",
      "node_memory_Hugepagesize_bytes",
      "node_memory_HardwareCorrupted_bytes",
      "node_memory_PageTables_bytes",
      "node_memory_KernelStack_bytes",
      "node_memory_Percpu_bytes",
      "node_memory_Bounce_bytes",
      "node_memory_NFS_Unstable_bytes",

      // -- Disk I/O --
      "node_disk_read_bytes_total",
      "node_disk_written_bytes_total",
      "node_disk_reads_completed_total",
      "node_disk_writes_completed_total",
      "node_disk_reads_merged_total",
      "node_disk_writes_merged_total",
      "node_disk_io_time_seconds_total",
      "node_disk_discard_time_seconds_total",
      "node_disk_discards_completed_total",
      "node_disk_discards_merged_total",
      "node_disk_io_now",
      "node_disk_io_time_weighted_seconds_total",
      "node_disk_read_time_seconds_total",
      "node_disk_write_time_seconds_total",

      // -- Filesystem --
      "node_filesystem_size_bytes",
      "node_filesystem_avail_bytes",
      "node_filesystem_free_bytes",
      "node_filesystem_files",
      "node_filesystem_files_free",
      "node_filesystem_device_error",
      "node_filesystem_readonly",

      // -- Network --
      "node_network_receive_bytes_total",
      "node_network_transmit_bytes_total",
      "node_network_receive_packets_total",
      "node_network_transmit_packets_total",
      "node_network_receive_compressed_total",
      "node_network_transmit_compressed_total",
      "node_network_receive_errs_total",
      "node_network_transmit_errs_total",
      "node_network_receive_drop_total",
      "node_network_transmit_drop_total",
      "node_network_receive_fifo_total",
      "node_network_transmit_fifo_total",
      "node_network_receive_frame_total",
      "node_network_receive_multicast_total",
      "node_network_up",
      "node_network_carrier",
      "node_network_mtu_bytes",
      "node_network_speed_bytes",
      "node_network_transmit_carrier_total",
      "node_network_transmit_colls_total",
      "node_network_transmit_queue_length",

      // -- Netstat --
      "node_netstat_Tcp_InErrs",
      "node_netstat_Tcp_OutRsts",
      "node_netstat_Tcp_RetransSegs",
      "node_netstat_Tcp_ActiveOpens",
      "node_netstat_Tcp_PassiveOpens",
      "node_netstat_Tcp_CurrEstab",
      "node_netstat_Tcp_InSegs",
      "node_netstat_Tcp_OutSegs",
      "node_netstat_Tcp_MaxConn",
      "node_netstat_TcpExt_ListenDrops",
      "node_netstat_TcpExt_ListenOverflows",
      "node_netstat_TcpExt_SyncookiesFailed",
      "node_netstat_TcpExt_SyncookiesRecv",
      "node_netstat_TcpExt_SyncookiesSent",
      "node_netstat_TcpExt_TCPOFOQueue",
      "node_netstat_TcpExt_TCPRcvQDrop",
      "node_netstat_TcpExt_TCPSynRetrans",
      "node_netstat_Udp_InErrors",
      "node_netstat_Udp_InDatagrams",
      "node_netstat_Udp_OutDatagrams",
      "node_netstat_Udp_NoPorts",
      "node_netstat_Udp_RcvbufErrors",
      "node_netstat_Udp_SndbufErrors",
      "node_netstat_UdpLite_InErrors",
      "node_netstat_Icmp_InMsgs",
      "node_netstat_Icmp_OutMsgs",
      "node_netstat_Icmp_InErrors",
      "node_netstat_IpExt_InOctets",
      "node_netstat_IpExt_OutOctets",
      "node_netstat_Ip_Forwarding",

      // -- Sockstat --
      "node_sockstat_FRAG_inuse",
      "node_sockstat_FRAG_memory",
      "node_sockstat_RAW_inuse",
      "node_sockstat_TCP_alloc",
      "node_sockstat_TCP_inuse",
      "node_sockstat_TCP_mem",
      "node_sockstat_TCP_mem_bytes",
      "node_sockstat_TCP_orphan",
      "node_sockstat_TCP_tw",
      "node_sockstat_UDPLITE_inuse",
      "node_sockstat_UDP_inuse",
      "node_sockstat_UDP_mem",
      "node_sockstat_UDP_mem_bytes",
      "node_sockstat_sockets_used",

      // -- Processes --
      "node_processes_pids",
      "node_processes_max_processes",
      "node_processes_threads",
      "node_processes_max_threads",
      "node_processes_state",
      "node_procs_blocked",
      "node_procs_running",
      "node_forks_total",
      "node_context_switches_total",

      // -- VMstat --
      "node_vmstat_pgfault",
      "node_vmstat_pgmajfault",
      "node_vmstat_pgpgin",
      "node_vmstat_pgpgout",
      "node_vmstat_oom_kill",
      "node_vmstat_pswpin",
      "node_vmstat_pswpout",

      // -- Hardware monitoring --
      "node_hwmon_chip_names",
      "node_hwmon_temp_celsius",
      "node_hwmon_temp_crit_alarm_celsius",
      "node_hwmon_temp_crit_celsius",
      "node_hwmon_temp_crit_hyst_celsius",
      "node_hwmon_temp_max_celsius",

      // -- Time sync --
      "node_timex_sync_status",
      "node_timex_frequency_adjustment_ratio",
      "node_timex_estimated_error_seconds",
      "node_timex_loop_time_constant",
      "node_timex_maxerror_seconds",
      "node_timex_offset_seconds",
      "node_timex_tai_offset_seconds",
      "node_timex_tick_seconds",

      // -- Entropy --
      "node_entropy_available_bits",
      "node_entropy_pool_size_bits",

      // -- Exporter health --
      "node_scrape_collector_success",
      "node_scrape_collector_duration_seconds",
      "node_textfile_scrape_error",

      // -- System info --
      "node_uname_info",

      // -- File descriptors & interrupts --
      "node_filefd_allocated",
      "node_filefd_maximum",
      "node_interrupts_total",
      "node_intr_total",

      // -- Conntrack --
      "node_nf_conntrack_entries",
      "node_nf_conntrack_entries_limit",

      // -- TCP connection states --
      "node_tcp_connection_states",

      // -- Power & cooling --
      "node_power_supply_online",
      "node_cooling_device_cur_state",
      "node_cooling_device_max_state",

      // -- ARP --
      "node_arp_entries",

      // -- Pressure Stall Information (PSI) --
      "node_pressure_cpu_waiting_seconds_total",
      "node_pressure_io_stalled_seconds_total",
      "node_pressure_io_waiting_seconds_total",
      "node_pressure_memory_stalled_seconds_total",
      "node_pressure_memory_waiting_seconds_total",

      // -- Scheduler --
      "node_schedstat_running_seconds_total",
      "node_schedstat_timeslices_total",
      "node_schedstat_waiting_seconds_total",

      // -- Softnet --
      "node_softnet_dropped_total",
      "node_softnet_processed_total",
      "node_softnet_times_squeezed_total",

      // -- Systemd --
      "node_systemd_socket_accepted_connections_total",
      "node_systemd_units",
      "node_systemd_unit_state",

      // -- Process FDs --
      "process_max_fds",
      "process_open_fds",
    ], "|")
    action = "keep"
  }

  // Layer 2: Drop virtual/container network interfaces
  rule {
    source_labels = ["__name__", "device"]
    regex         = "node_network_.+;(veth.*|cali.*|flannel.*|cni.*|docker.*|br-.*|lxc.*)"
    action        = "drop"
  }

  // Layer 2: Drop ephemeral/virtual filesystem types
  rule {
    source_labels = ["__name__", "fstype"]
    regex         = "node_filesystem_.+;(tmpfs|overlay|squashfs|iso9660|autofs)"
    action        = "drop"
  }

  // Layer 3: Tag with fleet-level labels
  rule {
    target_label = "fleet"
    replacement  = "linux"
  }

  // Layer 4: Limit high-cardinality label values
  rule {
    source_labels = ["mountpoint"]
    regex         = "/var/lib/docker/.*"
    action        = "drop"
  }
}
```

**Common customizations:**

- Add or remove services in `unit_include` to match your host (e.g., add `nginx\\.service`, `postgresql\\.service`)
- Set `scrape_interval` to `"15s"` if you need higher-resolution data (increases DPM by 4x)
- Add more mount point exclusions in Layer 4 if you use Kubernetes overlay mounts


---

## 2. Linux Metrics + Logs

Extends the Linux Metrics Only config with systemd journal log collection, forwarded to Loki. This is the standard "full host monitoring" config for Linux.

**Expected series count:** 400-600 (same as metrics-only; logs do not add metric series). Log volume depends heavily on the priority and unit filters -- see [Journal Logs](../ch04-platform-guides/linux/journal-logs.md) for cost-control levers.

**Environment variables required:** `GCLOUD_RW_API_KEY`, `GRAFANA_METRICS_URL`, `GRAFANA_METRICS_USERNAME`, `GRAFANA_LOGS_URL`, `GRAFANA_LOGS_USERNAME`

**Config file location:** `/etc/alloy/config.alloy`

```alloy
// =================================================================
// Linux Metrics + Logs -- Node Exporter Full + Journal Logs
// =================================================================
// Collects host metrics (Dashboard 1860) and systemd journal logs.
// Set env vars in /etc/default/alloy (Debian/Ubuntu)
//   or /etc/sysconfig/alloy (RHEL/Rocky/SUSE).
// =================================================================

// --- Write Endpoints ---
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

loki.write "grafana_cloud_loki" {
  endpoint {
    url = sys.env("GRAFANA_LOGS_URL")
    basic_auth {
      username = sys.env("GRAFANA_LOGS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Node Exporter ---
prometheus.exporter.unix "integrations_node_exporter" {
  enable_collectors = ["tcpstat", "systemd"]

  systemd {
    unit_include = "(sshd?\\.service|crond?\\.service|chronyd?\\.service|systemd-journald\\.service|alloy\\.service|docker\\.service)"
  }

  filesystem {
    fs_types_exclude     = "^(autofs|binfmt_misc|bpf|cgroup2?|configfs|debugfs|devpts|devtmpfs|tmpfs|fusectl|hugetlbfs|iso9660|mqueue|nsfs|overlay|proc|procfs|pstore|rpc_pipefs|securityfs|selinuxfs|squashfs|sysfs|tracefs)$"
    mount_points_exclude = "^/(dev|proc|run/credentials/.+|sys|var/lib/docker/.+)($|/)"
  }
}

// --- Metrics Discovery + Relabel ---
discovery.relabel "integrations_node_exporter" {
  targets = prometheus.exporter.unix.integrations_node_exporter.targets
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
  rule {
    target_label = "job"
    replacement  = "integrations/node_exporter"
  }
}

// --- Metrics Scrape ---
prometheus.scrape "integrations_node_exporter" {
  targets         = discovery.relabel.integrations_node_exporter.output
  forward_to      = [prometheus.relabel.integrations_node_exporter.receiver]
  scrape_interval = "60s"
}

// --- Metrics Cardinality Control (Layers 1-4) ---
prometheus.relabel "integrations_node_exporter" {
  forward_to = [prometheus.remote_write.metrics_service.receiver]

  // Layer 1: Allow-list -- only Dashboard 1860 metrics pass through
  rule {
    source_labels = ["__name__"]
    regex = join([
      "up",
      "node_boot_time_seconds",
      "node_time_seconds",
      "node_time_zone_offset_seconds",
      "node_cpu_seconds_total",
      "node_cpu_guest_seconds_total",
      "node_cpu_scaling_frequency_hertz",
      "node_cpu_scaling_frequency_max_hertz",
      "node_cpu_scaling_frequency_min_hertz",
      "node_load1",
      "node_load5",
      "node_load15",
      "node_memory_MemTotal_bytes",
      "node_memory_MemFree_bytes",
      "node_memory_MemAvailable_bytes",
      "node_memory_Buffers_bytes",
      "node_memory_Cached_bytes",
      "node_memory_SwapTotal_bytes",
      "node_memory_SwapFree_bytes",
      "node_memory_SwapCached_bytes",
      "node_memory_Active_bytes",
      "node_memory_Inactive_bytes",
      "node_memory_Active_anon_bytes",
      "node_memory_Inactive_anon_bytes",
      "node_memory_Active_file_bytes",
      "node_memory_Inactive_file_bytes",
      "node_memory_AnonPages_bytes",
      "node_memory_AnonHugePages_bytes",
      "node_memory_Mapped_bytes",
      "node_memory_Shmem_bytes",
      "node_memory_ShmemHugePages_bytes",
      "node_memory_ShmemPmdMapped_bytes",
      "node_memory_Slab_bytes",
      "node_memory_SReclaimable_bytes",
      "node_memory_SUnreclaim_bytes",
      "node_memory_Dirty_bytes",
      "node_memory_Writeback_bytes",
      "node_memory_WritebackTmp_bytes",
      "node_memory_CommitLimit_bytes",
      "node_memory_Committed_AS_bytes",
      "node_memory_VmallocUsed_bytes",
      "node_memory_VmallocTotal_bytes",
      "node_memory_VmallocChunk_bytes",
      "node_memory_DirectMap1G_bytes",
      "node_memory_DirectMap2M_bytes",
      "node_memory_DirectMap4k_bytes",
      "node_memory_Unevictable_bytes",
      "node_memory_Mlocked_bytes",
      "node_memory_HugePages_Free",
      "node_memory_HugePages_Rsvd",
      "node_memory_HugePages_Surp",
      "node_memory_HugePages_Total",
      "node_memory_Hugepagesize_bytes",
      "node_memory_HardwareCorrupted_bytes",
      "node_memory_PageTables_bytes",
      "node_memory_KernelStack_bytes",
      "node_memory_Percpu_bytes",
      "node_memory_Bounce_bytes",
      "node_memory_NFS_Unstable_bytes",
      "node_disk_read_bytes_total",
      "node_disk_written_bytes_total",
      "node_disk_reads_completed_total",
      "node_disk_writes_completed_total",
      "node_disk_reads_merged_total",
      "node_disk_writes_merged_total",
      "node_disk_io_time_seconds_total",
      "node_disk_discard_time_seconds_total",
      "node_disk_discards_completed_total",
      "node_disk_discards_merged_total",
      "node_disk_io_now",
      "node_disk_io_time_weighted_seconds_total",
      "node_disk_read_time_seconds_total",
      "node_disk_write_time_seconds_total",
      "node_filesystem_size_bytes",
      "node_filesystem_avail_bytes",
      "node_filesystem_free_bytes",
      "node_filesystem_files",
      "node_filesystem_files_free",
      "node_filesystem_device_error",
      "node_filesystem_readonly",
      "node_network_receive_bytes_total",
      "node_network_transmit_bytes_total",
      "node_network_receive_packets_total",
      "node_network_transmit_packets_total",
      "node_network_receive_compressed_total",
      "node_network_transmit_compressed_total",
      "node_network_receive_errs_total",
      "node_network_transmit_errs_total",
      "node_network_receive_drop_total",
      "node_network_transmit_drop_total",
      "node_network_receive_fifo_total",
      "node_network_transmit_fifo_total",
      "node_network_receive_frame_total",
      "node_network_receive_multicast_total",
      "node_network_up",
      "node_network_carrier",
      "node_network_mtu_bytes",
      "node_network_speed_bytes",
      "node_network_transmit_carrier_total",
      "node_network_transmit_colls_total",
      "node_network_transmit_queue_length",
      "node_netstat_Tcp_InErrs",
      "node_netstat_Tcp_OutRsts",
      "node_netstat_Tcp_RetransSegs",
      "node_netstat_Tcp_ActiveOpens",
      "node_netstat_Tcp_PassiveOpens",
      "node_netstat_Tcp_CurrEstab",
      "node_netstat_Tcp_InSegs",
      "node_netstat_Tcp_OutSegs",
      "node_netstat_Tcp_MaxConn",
      "node_netstat_TcpExt_ListenDrops",
      "node_netstat_TcpExt_ListenOverflows",
      "node_netstat_TcpExt_SyncookiesFailed",
      "node_netstat_TcpExt_SyncookiesRecv",
      "node_netstat_TcpExt_SyncookiesSent",
      "node_netstat_TcpExt_TCPOFOQueue",
      "node_netstat_TcpExt_TCPRcvQDrop",
      "node_netstat_TcpExt_TCPSynRetrans",
      "node_netstat_Udp_InErrors",
      "node_netstat_Udp_InDatagrams",
      "node_netstat_Udp_OutDatagrams",
      "node_netstat_Udp_NoPorts",
      "node_netstat_Udp_RcvbufErrors",
      "node_netstat_Udp_SndbufErrors",
      "node_netstat_UdpLite_InErrors",
      "node_netstat_Icmp_InMsgs",
      "node_netstat_Icmp_OutMsgs",
      "node_netstat_Icmp_InErrors",
      "node_netstat_IpExt_InOctets",
      "node_netstat_IpExt_OutOctets",
      "node_netstat_Ip_Forwarding",
      "node_sockstat_FRAG_inuse",
      "node_sockstat_FRAG_memory",
      "node_sockstat_RAW_inuse",
      "node_sockstat_TCP_alloc",
      "node_sockstat_TCP_inuse",
      "node_sockstat_TCP_mem",
      "node_sockstat_TCP_mem_bytes",
      "node_sockstat_TCP_orphan",
      "node_sockstat_TCP_tw",
      "node_sockstat_UDPLITE_inuse",
      "node_sockstat_UDP_inuse",
      "node_sockstat_UDP_mem",
      "node_sockstat_UDP_mem_bytes",
      "node_sockstat_sockets_used",
      "node_processes_pids",
      "node_processes_max_processes",
      "node_processes_threads",
      "node_processes_max_threads",
      "node_processes_state",
      "node_procs_blocked",
      "node_procs_running",
      "node_forks_total",
      "node_context_switches_total",
      "node_vmstat_pgfault",
      "node_vmstat_pgmajfault",
      "node_vmstat_pgpgin",
      "node_vmstat_pgpgout",
      "node_vmstat_oom_kill",
      "node_vmstat_pswpin",
      "node_vmstat_pswpout",
      "node_hwmon_chip_names",
      "node_hwmon_temp_celsius",
      "node_hwmon_temp_crit_alarm_celsius",
      "node_hwmon_temp_crit_celsius",
      "node_hwmon_temp_crit_hyst_celsius",
      "node_hwmon_temp_max_celsius",
      "node_timex_sync_status",
      "node_timex_frequency_adjustment_ratio",
      "node_timex_estimated_error_seconds",
      "node_timex_loop_time_constant",
      "node_timex_maxerror_seconds",
      "node_timex_offset_seconds",
      "node_timex_tai_offset_seconds",
      "node_timex_tick_seconds",
      "node_entropy_available_bits",
      "node_entropy_pool_size_bits",
      "node_scrape_collector_success",
      "node_scrape_collector_duration_seconds",
      "node_textfile_scrape_error",
      "node_uname_info",
      "node_filefd_allocated",
      "node_filefd_maximum",
      "node_interrupts_total",
      "node_intr_total",
      "node_nf_conntrack_entries",
      "node_nf_conntrack_entries_limit",
      "node_tcp_connection_states",
      "node_power_supply_online",
      "node_cooling_device_cur_state",
      "node_cooling_device_max_state",
      "node_arp_entries",
      "node_pressure_cpu_waiting_seconds_total",
      "node_pressure_io_stalled_seconds_total",
      "node_pressure_io_waiting_seconds_total",
      "node_pressure_memory_stalled_seconds_total",
      "node_pressure_memory_waiting_seconds_total",
      "node_schedstat_running_seconds_total",
      "node_schedstat_timeslices_total",
      "node_schedstat_waiting_seconds_total",
      "node_softnet_dropped_total",
      "node_softnet_processed_total",
      "node_softnet_times_squeezed_total",
      "node_systemd_socket_accepted_connections_total",
      "node_systemd_units",
      "node_systemd_unit_state",
      "process_max_fds",
      "process_open_fds",
    ], "|")
    action = "keep"
  }

  // Layer 2: Drop virtual/container network interfaces
  rule {
    source_labels = ["__name__", "device"]
    regex         = "node_network_.+;(veth.*|cali.*|flannel.*|cni.*|docker.*|br-.*|lxc.*)"
    action        = "drop"
  }

  // Layer 2: Drop ephemeral/virtual filesystem types
  rule {
    source_labels = ["__name__", "fstype"]
    regex         = "node_filesystem_.+;(tmpfs|overlay|squashfs|iso9660|autofs)"
    action        = "drop"
  }

  // Layer 3: Tag with fleet-level labels
  rule {
    target_label = "fleet"
    replacement  = "linux"
  }

  // Layer 4: Limit high-cardinality label values
  rule {
    source_labels = ["mountpoint"]
    regex         = "/var/lib/docker/.*"
    action        = "drop"
  }
}

// =================================================================
// --- Journal Log Collection ---
// =================================================================

loki.relabel "journal" {
  forward_to = [loki.write.grafana_cloud_loki.receiver]
  rule {
    target_label = "job"
    replacement  = "integrations/node_exporter"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

loki.source.journal "default" {
  max_age       = "12h0m0s"
  forward_to    = [loki.process.journal.receiver]
  relabel_rules = loki.relabel.journal_metadata.rules
}

loki.relabel "journal_metadata" {
  rule {
    source_labels = ["__journal__systemd_unit"]
    target_label  = "unit"
  }
  rule {
    source_labels = ["__journal__boot_id"]
    target_label  = "boot_id"
  }
  rule {
    source_labels = ["__journal__transport"]
    target_label  = "transport"
  }
  rule {
    source_labels = ["__journal_priority_keyword"]
    target_label  = "level"
  }
  forward_to = []
}

loki.process "journal" {
  // Drop info/debug/notice -- keep warnings and above
  stage.match {
    selector = "{level=~\"info|debug|notice\"}"
    action   = "drop"
  }

  // Rate limit as a safety net against log storms
  stage.limit {
    rate  = 100
    burst = 500
    drop  = true
  }

  // Drop anything older than 4 hours (belt and suspenders with max_age)
  stage.drop {
    older_than          = "4h"
    drop_counter_reason = "too old"
  }

  forward_to = [loki.relabel.journal.receiver]
}
```

**Common customizations:**

- Remove the `stage.match` drop rule if you want info-level logs (increases volume significantly)
- Add unit filtering in `loki.relabel "journal_metadata"` to ship logs from only specific services
- Adjust `stage.limit` rate if your workload legitimately produces more than 100 lines/second/stream


---

## 3. Windows Metrics Only

Collects host metrics using the built-in Windows exporter (`prometheus.exporter.windows`), applies the Chapter 2 allow-list for [Dashboard 24390 (Windows Exporter Dashboard 2025)](https://grafana.com/grafana/dashboards/24390-windows-exporter-dashboard-2025/), and ships to Grafana Cloud.

**Expected series count:** 130-150 on a small cloud VM (2 vCPU, 1 disk, 1 NIC). See [Before and After](../ch02-cardinality-control/before-and-after.md) for detailed scaling math.

**Environment variables required:** `GCLOUD_RW_API_KEY`, `GRAFANA_METRICS_URL`, `GRAFANA_METRICS_USERNAME`

**Config file location:** `C:\Program Files\GrafanaLabs\Alloy\config.alloy`

```alloy
// =================================================================
// Windows Metrics Only -- Windows Exporter (Dashboard 24390)
// =================================================================
// Collects host metrics with full cardinality controls applied.
// Set env vars as Machine-scope system variables (see Chapter 3).
// =================================================================

// --- Write Endpoint ---
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Windows Exporter ---
prometheus.exporter.windows "integrations_windows_exporter" {
  enabled_collectors = [
    "cpu",
    "cs",
    "diskdrive",
    "logical_disk",
    "memory",
    "net",
    "os",
    "service",
    "system",
    "time",
  ]

  service {
    where_clause = "Name IN ('Alloy','MSSQLSERVER','W3SVC','WinRM','Spooler','EventLog','LanmanServer','Dhcp','Dnscache','TermService','WinDefend','wuauserv','Schedule')"
  }
}

// --- Discovery + Relabel ---
discovery.relabel "integrations_windows_exporter" {
  targets = prometheus.exporter.windows.integrations_windows_exporter.targets
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
  rule {
    target_label = "job"
    replacement  = "integrations/windows_exporter"
  }
}

// --- Scrape ---
prometheus.scrape "integrations_windows_exporter" {
  targets         = discovery.relabel.integrations_windows_exporter.output
  forward_to      = [prometheus.relabel.integrations_windows_exporter.receiver]
  scrape_interval = "60s"
}

// --- Cardinality Control (Layers 1-4) ---
prometheus.relabel "integrations_windows_exporter" {
  forward_to = [prometheus.remote_write.metrics_service.receiver]

  // Layer 1: Allow-list -- only Dashboard 24390 metrics pass through
  rule {
    source_labels = ["__name__"]
    regex = join([
      // -- Uptime & general --
      "up",
      "windows_exporter_build_info",
      "windows_exporter_collector_success",
      "windows_exporter_collector_duration_seconds",

      // -- OS info --
      "windows_os_info",
      "windows_os_hostname",
      "windows_os_physical_memory_free_bytes",
      "windows_os_time",
      "windows_os_timezone",
      "windows_os_visible_memory_bytes",
      "windows_os_paging_free_bytes",
      "windows_os_paging_limit_bytes",
      "windows_os_processes",
      "windows_os_processes_limit",
      "windows_os_virtual_memory_bytes",
      "windows_os_virtual_memory_free_bytes",
      "windows_os_users",
      "windows_cs_hostname",
      "windows_cs_logical_processors",
      "windows_cs_physical_memory_bytes",

      // -- CPU --
      "windows_cpu_time_total",
      "windows_cpu_core_frequency_mhz",
      "windows_cpu_logical_processor",
      "windows_cpu_processor_performance_total",
      "windows_cpu_clock_interrupts_total",
      "windows_cpu_dpcs_total",
      "windows_cpu_interrupts_total",
      "windows_cpu_processor_utility_total",

      // -- Memory --
      "windows_memory_physical_total_bytes",
      "windows_memory_physical_free_bytes",
      "windows_memory_available_bytes",
      "windows_memory_cache_bytes",
      "windows_memory_cache_faults_total",
      "windows_memory_commit_limit",
      "windows_memory_committed_bytes",
      "windows_memory_modified_page_list_bytes",
      "windows_memory_page_faults_total",
      "windows_memory_pool_nonpaged_alloc_bytes",
      "windows_memory_pool_nonpaged_bytes",
      "windows_memory_pool_paged_alloc_bytes",
      "windows_memory_pool_paged_bytes",
      "windows_memory_pool_paged_resident_bytes",
      "windows_memory_standby_cache_bytes",
      "windows_memory_standby_cache_core_bytes",
      "windows_memory_standby_cache_normal_priority_bytes",
      "windows_memory_standby_cache_reserve_bytes",
      "windows_memory_swap_page_operations_total",
      "windows_memory_swap_page_reads_total",
      "windows_memory_swap_page_writes_total",
      "windows_memory_transition_faults_total",

      // -- Pagefile --
      "windows_pagefile_usage_bytes",
      "windows_pagefile_limit_bytes",
      "windows_pagefile_current_usage_percent",

      // -- Logical disk --
      "windows_logical_disk_free_bytes",
      "windows_logical_disk_size_bytes",
      "windows_logical_disk_read_bytes_total",
      "windows_logical_disk_write_bytes_total",
      "windows_logical_disk_reads_total",
      "windows_logical_disk_writes_total",
      "windows_logical_disk_read_latency_seconds_total",
      "windows_logical_disk_write_latency_seconds_total",
      "windows_logical_disk_read_seconds_total",
      "windows_logical_disk_write_seconds_total",
      "windows_logical_disk_idle_seconds_total",
      "windows_logical_disk_split_ios_total",
      "windows_logical_disk_requests_queued",

      // -- Physical disk (diskdrive) --
      "windows_diskdrive_info",
      "windows_diskdrive_size_bytes",
      "windows_diskdrive_status",

      // -- Network --
      "windows_net_bytes_received_total",
      "windows_net_bytes_sent_total",
      "windows_net_bytes_total",
      "windows_net_current_bandwidth_bytes",
      "windows_net_packets_outbound_discarded_total",
      "windows_net_packets_outbound_errors_total",
      "windows_net_packets_received_discarded_total",
      "windows_net_packets_received_errors_total",
      "windows_net_packets_received_total",
      "windows_net_packets_sent_total",

      // -- System --
      "windows_system_context_switches_total",
      "windows_system_exception_dispatches_total",
      "windows_system_processor_queue_length",
      "windows_system_processes",
      "windows_system_threads",
      "windows_system_system_calls_total",
      "windows_system_system_up_time",

      // -- Time --
      "windows_time_computed_time_offset_seconds",
      "windows_time_ntp_round_trip_delay_seconds",
      "windows_time_clock_frequency_adjustment_ppb_total",

      // -- Service --
      "windows_service_state",
      "windows_service_start_mode",
      "windows_service_status",
      "windows_service_info",

      // -- Exporter process --
      "process_cpu_seconds_total",
      "process_resident_memory_bytes",
    ], "|")
    action = "keep"
  }

  // Layer 2: Service filter -- tag monitored services, drop the rest
  rule {
    source_labels = ["__name__", "name"]
    regex         = "windows_service_.+;(?i)(Alloy|MSSQLSERVER|W3SVC|WinRM|Spooler|EventLog|LanmanServer|Dhcp|Dnscache|TermService|WinDefend|wuauserv|Schedule)"
    target_label  = "__keepservice"
    replacement   = "true"
  }
  rule {
    source_labels = ["__name__", "__keepservice"]
    regex         = "windows_service_.+;"
    action        = "drop"
  }
  rule {
    regex  = "__keepservice"
    action = "labeldrop"
  }

  // Layer 3: Drop virtual NICs
  rule {
    source_labels = ["__name__", "nic"]
    regex         = "windows_net_.+;(?i)(isatap.*|Teredo.*|6to4.*|vEthernet.*|WFP.*|Bluetooth.*)"
    action        = "drop"
  }

  // Layer 3: Drop hidden volumes
  rule {
    source_labels = ["__name__", "volume"]
    regex         = "windows_logical_disk_.+;(?i)(HarddiskVolume.*|\\\\\\\\\\?\\\\Volume.*)"
    action        = "drop"
  }

  // Layer 3: Drop _Total pseudo-instances
  rule {
    source_labels = ["__name__", "volume"]
    regex         = "windows_logical_disk_.+;_Total"
    action        = "drop"
  }

  rule {
    source_labels = ["__name__", "nic"]
    regex         = "windows_net_.+;_Total"
    action        = "drop"
  }

  // Layer 4: Tag with fleet-level labels
  rule {
    target_label = "fleet"
    replacement  = "windows"
  }
}
```

**Common customizations:**

- Edit the `where_clause` to include or exclude services specific to your environment (SQL Server, IIS, etc.)
- Add `"pagefile"` to `enabled_collectors` if you use custom pagefile configurations
- Adjust the virtual NIC pattern if you use Hyper-V (vEthernet interfaces) that you want to monitor


---

## 4. Windows Metrics + Event Logs

Extends the Windows Metrics Only config with Windows Event Log collection (Application, System, Security), forwarded to Loki.

**Expected series count:** 130-150 (same as metrics-only; logs do not add metric series). Event log volume depends on the `xpath_query` filters -- see [Windows Event Logs](../ch04-platform-guides/windows/event-logs.md) for details.

**Environment variables required:** `GCLOUD_RW_API_KEY`, `GRAFANA_METRICS_URL`, `GRAFANA_METRICS_USERNAME`, `GRAFANA_LOGS_URL`, `GRAFANA_LOGS_USERNAME`

**Config file location:** `C:\Program Files\GrafanaLabs\Alloy\config.alloy`

```alloy
// =================================================================
// Windows Metrics + Event Logs -- Windows Exporter + Event Logs
// =================================================================
// Collects host metrics (Dashboard 24390) and Application/System/
// Security event logs. Set env vars as Machine-scope system
// variables (see Chapter 3).
// =================================================================

// --- Write Endpoints ---
prometheus.remote_write "metrics_service" {
  endpoint {
    url = sys.env("GRAFANA_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_METRICS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

loki.write "grafana_cloud_loki" {
  endpoint {
    url = sys.env("GRAFANA_LOGS_URL")
    basic_auth {
      username = sys.env("GRAFANA_LOGS_USERNAME")
      password = sys.env("GCLOUD_RW_API_KEY")
    }
  }
}

// --- Windows Exporter ---
prometheus.exporter.windows "integrations_windows_exporter" {
  enabled_collectors = [
    "cpu",
    "cs",
    "diskdrive",
    "logical_disk",
    "memory",
    "net",
    "os",
    "service",
    "system",
    "time",
  ]

  service {
    where_clause = "Name IN ('Alloy','MSSQLSERVER','W3SVC','WinRM','Spooler','EventLog','LanmanServer','Dhcp','Dnscache','TermService','WinDefend','wuauserv','Schedule')"
  }
}

// --- Metrics Discovery + Relabel ---
discovery.relabel "integrations_windows_exporter" {
  targets = prometheus.exporter.windows.integrations_windows_exporter.targets
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
  rule {
    target_label = "job"
    replacement  = "integrations/windows_exporter"
  }
}

// --- Metrics Scrape ---
prometheus.scrape "integrations_windows_exporter" {
  targets         = discovery.relabel.integrations_windows_exporter.output
  forward_to      = [prometheus.relabel.integrations_windows_exporter.receiver]
  scrape_interval = "60s"
}

// --- Metrics Cardinality Control (Layers 1-4) ---
prometheus.relabel "integrations_windows_exporter" {
  forward_to = [prometheus.remote_write.metrics_service.receiver]

  // Layer 1: Allow-list -- only Dashboard 24390 metrics pass through
  rule {
    source_labels = ["__name__"]
    regex = join([
      "up",
      "windows_exporter_build_info",
      "windows_exporter_collector_success",
      "windows_exporter_collector_duration_seconds",
      "windows_os_info",
      "windows_os_hostname",
      "windows_os_physical_memory_free_bytes",
      "windows_os_time",
      "windows_os_timezone",
      "windows_os_visible_memory_bytes",
      "windows_os_paging_free_bytes",
      "windows_os_paging_limit_bytes",
      "windows_os_processes",
      "windows_os_processes_limit",
      "windows_os_virtual_memory_bytes",
      "windows_os_virtual_memory_free_bytes",
      "windows_os_users",
      "windows_cs_hostname",
      "windows_cs_logical_processors",
      "windows_cs_physical_memory_bytes",
      "windows_cpu_time_total",
      "windows_cpu_core_frequency_mhz",
      "windows_cpu_logical_processor",
      "windows_cpu_processor_performance_total",
      "windows_cpu_clock_interrupts_total",
      "windows_cpu_dpcs_total",
      "windows_cpu_interrupts_total",
      "windows_cpu_processor_utility_total",
      "windows_memory_physical_total_bytes",
      "windows_memory_physical_free_bytes",
      "windows_memory_available_bytes",
      "windows_memory_cache_bytes",
      "windows_memory_cache_faults_total",
      "windows_memory_commit_limit",
      "windows_memory_committed_bytes",
      "windows_memory_modified_page_list_bytes",
      "windows_memory_page_faults_total",
      "windows_memory_pool_nonpaged_alloc_bytes",
      "windows_memory_pool_nonpaged_bytes",
      "windows_memory_pool_paged_alloc_bytes",
      "windows_memory_pool_paged_bytes",
      "windows_memory_pool_paged_resident_bytes",
      "windows_memory_standby_cache_bytes",
      "windows_memory_standby_cache_core_bytes",
      "windows_memory_standby_cache_normal_priority_bytes",
      "windows_memory_standby_cache_reserve_bytes",
      "windows_memory_swap_page_operations_total",
      "windows_memory_swap_page_reads_total",
      "windows_memory_swap_page_writes_total",
      "windows_memory_transition_faults_total",
      "windows_pagefile_usage_bytes",
      "windows_pagefile_limit_bytes",
      "windows_pagefile_current_usage_percent",
      "windows_logical_disk_free_bytes",
      "windows_logical_disk_size_bytes",
      "windows_logical_disk_read_bytes_total",
      "windows_logical_disk_write_bytes_total",
      "windows_logical_disk_reads_total",
      "windows_logical_disk_writes_total",
      "windows_logical_disk_read_latency_seconds_total",
      "windows_logical_disk_write_latency_seconds_total",
      "windows_logical_disk_read_seconds_total",
      "windows_logical_disk_write_seconds_total",
      "windows_logical_disk_idle_seconds_total",
      "windows_logical_disk_split_ios_total",
      "windows_logical_disk_requests_queued",
      "windows_diskdrive_info",
      "windows_diskdrive_size_bytes",
      "windows_diskdrive_status",
      "windows_net_bytes_received_total",
      "windows_net_bytes_sent_total",
      "windows_net_bytes_total",
      "windows_net_current_bandwidth_bytes",
      "windows_net_packets_outbound_discarded_total",
      "windows_net_packets_outbound_errors_total",
      "windows_net_packets_received_discarded_total",
      "windows_net_packets_received_errors_total",
      "windows_net_packets_received_total",
      "windows_net_packets_sent_total",
      "windows_system_context_switches_total",
      "windows_system_exception_dispatches_total",
      "windows_system_processor_queue_length",
      "windows_system_processes",
      "windows_system_threads",
      "windows_system_system_calls_total",
      "windows_system_system_up_time",
      "windows_time_computed_time_offset_seconds",
      "windows_time_ntp_round_trip_delay_seconds",
      "windows_time_clock_frequency_adjustment_ppb_total",
      "windows_service_state",
      "windows_service_start_mode",
      "windows_service_status",
      "windows_service_info",
      "process_cpu_seconds_total",
      "process_resident_memory_bytes",
    ], "|")
    action = "keep"
  }

  // Layer 2: Service filter -- tag monitored services, drop the rest
  rule {
    source_labels = ["__name__", "name"]
    regex         = "windows_service_.+;(?i)(Alloy|MSSQLSERVER|W3SVC|WinRM|Spooler|EventLog|LanmanServer|Dhcp|Dnscache|TermService|WinDefend|wuauserv|Schedule)"
    target_label  = "__keepservice"
    replacement   = "true"
  }
  rule {
    source_labels = ["__name__", "__keepservice"]
    regex         = "windows_service_.+;"
    action        = "drop"
  }
  rule {
    regex  = "__keepservice"
    action = "labeldrop"
  }

  // Layer 3: Drop virtual NICs
  rule {
    source_labels = ["__name__", "nic"]
    regex         = "windows_net_.+;(?i)(isatap.*|Teredo.*|6to4.*|vEthernet.*|WFP.*|Bluetooth.*)"
    action        = "drop"
  }

  // Layer 3: Drop hidden volumes
  rule {
    source_labels = ["__name__", "volume"]
    regex         = "windows_logical_disk_.+;(?i)(HarddiskVolume.*|\\\\\\\\\\?\\\\Volume.*)"
    action        = "drop"
  }

  // Layer 3: Drop _Total pseudo-instances
  rule {
    source_labels = ["__name__", "volume"]
    regex         = "windows_logical_disk_.+;_Total"
    action        = "drop"
  }

  rule {
    source_labels = ["__name__", "nic"]
    regex         = "windows_net_.+;_Total"
    action        = "drop"
  }

  // Layer 4: Tag with fleet-level labels
  rule {
    target_label = "fleet"
    replacement  = "windows"
  }
}

// =================================================================
// --- Windows Event Log Collection ---
// =================================================================

// Relabel rules for log labels
loki.relabel "integrations_windows_exporter" {
  forward_to = [loki.write.grafana_cloud_loki.receiver]
  rule {
    target_label = "job"
    replacement  = "integrations/windows_exporter"
  }
  rule {
    target_label = "instance"
    replacement  = constants.hostname
  }
}

// Application log -- warnings and above
loki.source.windowsevent "application" {
  eventlog_name          = "Application"
  use_incoming_timestamp = true
  xpath_query            = "*[System[(Level=1 or Level=2 or Level=3)]]"
  forward_to             = [loki.process.windows_events.receiver]
}

// System log -- warnings and above
loki.source.windowsevent "system" {
  eventlog_name          = "System"
  use_incoming_timestamp = true
  xpath_query            = "*[System[(Level=1 or Level=2 or Level=3)]]"
  forward_to             = [loki.process.windows_events.receiver]
}

// Security log -- all events (Security log has no traditional levels)
loki.source.windowsevent "security" {
  eventlog_name          = "Security"
  use_incoming_timestamp = true
  forward_to             = [loki.process.windows_events.receiver]
}

// Processing pipeline with rate limiting
loki.process "windows_events" {
  stage.limit {
    rate  = 100
    burst = 500
    drop  = true
  }

  forward_to = [loki.relabel.integrations_windows_exporter.receiver]
}
```

**Common customizations:**

- Remove the `xpath_query` filter if you want all severity levels (increases volume significantly)
- Comment out the Security source entirely on domain controllers -- see [Domain Controller Considerations](../ch04-platform-guides/windows/domain-controller.md)
- Add `xpath_query` provider filters to the Application source to collect only specific application logs


---

## 5. OTLP Gateway

Accepts OTLP telemetry (metrics, logs, traces) over both gRPC and HTTP, batches it, and forwards to Grafana Cloud. Use this when applications send OTLP directly and you need a local collector to handle buffering, authentication, and routing.

This config turns Alloy into a gateway -- it does not collect host metrics. Combine it with one of the metrics configs above if you also need host monitoring on the same machine.

**Expected series count:** Depends entirely on what your applications send. The gateway itself adds no series. Monitor `otelcol.exporter.otlphttp` metrics to track throughput.

**Environment variables required:** `GCLOUD_RW_API_KEY`, `GRAFANA_OTLP_URL`, `GRAFANA_OTLP_USERNAME`

**Additional environment variables for traces:**

| Variable | Example Value |
|---|---|
| `GRAFANA_TRACES_URL` | `https://tempo-prod-04-prod-us-east-0.grafana.net/tempo` |
| `GRAFANA_TRACES_USERNAME` | `000000` |

**Config file location:** `/etc/alloy/config.alloy` (Linux) or `C:\Program Files\GrafanaLabs\Alloy\config.alloy` (Windows)

```alloy
// =================================================================
// OTLP Gateway -- Accept OTLP, Batch, Forward to Grafana Cloud
// =================================================================
// Listens on gRPC :4317 and HTTP :4318 for OTLP data.
// Batches and forwards metrics, logs, and traces to Grafana Cloud.
// =================================================================

// --- OTLP Receiver (gRPC + HTTP) ---
otelcol.receiver.otlp "default" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }

  http {
    endpoint = "0.0.0.0:4318"
  }

  output {
    metrics = [otelcol.processor.batch.default.input]
    logs    = [otelcol.processor.batch.default.input]
    traces  = [otelcol.processor.batch.default.input]
  }
}

// --- Batch Processor ---
// Batches telemetry to reduce the number of outgoing requests.
// Default settings are safe for most workloads.
otelcol.processor.batch "default" {
  timeout             = "5s"
  send_batch_size     = 8192
  send_batch_max_size = 0

  output {
    metrics = [otelcol.exporter.otlphttp.grafana_cloud.input]
    logs    = [otelcol.exporter.otlphttp.grafana_cloud.input]
    traces  = [otelcol.exporter.otlphttp.grafana_cloud.input]
  }
}

// --- OTLP HTTP Exporter (Grafana Cloud) ---
otelcol.exporter.otlphttp "grafana_cloud" {
  client {
    endpoint = sys.env("GRAFANA_OTLP_URL")
    auth     = otelcol.auth.basic.grafana_cloud.handler
  }
}

// --- Auth ---
otelcol.auth.basic "grafana_cloud" {
  username = sys.env("GRAFANA_OTLP_USERNAME")
  password = sys.env("GCLOUD_RW_API_KEY")
}
```

**Environment variables for the OTLP gateway:**

| Variable | Example Value | Notes |
|---|---|---|
| `GRAFANA_OTLP_URL` | `https://otlp-gateway-prod-us-east-0.grafana.net/otlp` | From your Grafana Cloud stack's OTLP endpoint |
| `GRAFANA_OTLP_USERNAME` | `000000` | Your Grafana Cloud instance ID |
| `GCLOUD_RW_API_KEY` | `glc_xxxxxxxxxxxxx` | Access policy token with `metrics:write`, `logs:write`, `traces:write` scopes |

**How to point applications at this gateway:**

Applications using the OTLP SDK set their exporter endpoint to the Alloy host:

```bash
# For gRPC (default for most SDKs)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://alloy-host:4317"

# For HTTP
export OTEL_EXPORTER_OTLP_ENDPOINT="http://alloy-host:4318"
```

**Common customizations:**

- Change `"0.0.0.0:4317"` to `"127.0.0.1:4317"` if applications run on the same host (prevents external access)
- Increase `send_batch_size` for high-throughput workloads (32768 is a reasonable upper bound)
- Add `otelcol.processor.memory_limiter` before the batch processor to prevent OOM under extreme load


---

## 6. Fleet Management Bootstrap

The minimal local config that connects Alloy to Fleet Management. This goes on disk at the standard config file path. All actual collection pipelines are delivered remotely via the FM UI.

This config is deliberately tiny. It connects to FM and nothing else. Everything that collects, processes, or ships data goes in FM pipelines. See [Bootstrap vs Pipeline Scope](../ch05-fleet-management/bootstrap-vs-pipeline.md) for the full explanation.

**Expected series count:** Zero from the bootstrap config itself. Series come from the FM pipelines you deploy.

**Environment variables required:** `GCLOUD_RW_API_KEY` (at minimum), plus `GRAFANA_METRICS_URL`, `GRAFANA_METRICS_USERNAME`, `GRAFANA_LOGS_URL`, `GRAFANA_LOGS_USERNAME` for the FM pipelines that will be delivered remotely.

**Config file location:** `/etc/alloy/config.alloy` (Linux) or `C:\Program Files\GrafanaLabs\Alloy\config.alloy` (Windows)

```alloy
// =================================================================
// Fleet Management Bootstrap
// =================================================================
// Connects this collector to Fleet Management. All collection
// pipelines are delivered remotely via the FM UI.
//
// Edit only: the FM URL and the FM username below.
// Everything else uses sys.env() and constants.hostname.
// =================================================================

remotecfg {
  url            = "https://fleet-management-prod-008.grafana.net"
  id             = constants.hostname
  poll_frequency = "60s"
  attributes     = encoding.from_json(coalesce(sys.env("ALLOY_FM_ATTRIBUTES"), `{}`))

  basic_auth {
    username = sys.env("GRAFANA_FM_USERNAME")
    password = sys.env("GCLOUD_RW_API_KEY")
  }
}
```

**Additional environment variables for Fleet Management:**

| Variable | Example Value | Notes |
|---|---|---|
| `GRAFANA_FM_USERNAME` | `000000` | FM instance ID (from Fleet Management > Collector configuration) |
| `ALLOY_FM_ATTRIBUTES` | `{"env":"production","team":"platform","role":"webserver"}` | JSON string of key/value pairs for pipeline targeting |

**Where to find the FM URL and username:**

1. Go to Grafana Cloud > your stack > Fleet Management > Collector configuration
2. The **URL** is shown as the API endpoint (e.g., `https://fleet-management-prod-008.grafana.net`)
3. The **username** is the numeric instance ID shown on the same page

**The attributes pattern:**

Attributes are how you target FM pipelines to groups of collectors. By putting the attributes JSON in an environment variable, you can set different attributes per host without changing the config file:

```bash
# Production web server
ALLOY_FM_ATTRIBUTES={"env":"production","team":"platform","role":"webserver"}

# Staging database server
ALLOY_FM_ATTRIBUTES={"env":"staging","team":"platform","role":"database"}
```

In the FM UI, you create pipeline matchers like `env=production AND role=webserver` to deliver a pipeline only to the matching collectors.

The `coalesce()` wrapper in the config provides a fallback empty JSON object (`{}`) if `ALLOY_FM_ATTRIBUTES` is not set, preventing a startup error.

**Common customizations:**

- Increase `poll_frequency` to `"300s"` (5 minutes) for large fleets where 60-second polling adds unnecessary FM API load
- Hardcode the `url` and `username` if you prefer not to manage them as environment variables (they are not secrets)
- Add more attribute keys for finer-grained pipeline targeting (`region`, `datacenter`, `os`, etc.)


---

## Common Mistakes (All Configs)

| Mistake | Impact | Fix |
|---|---|---|
| Forgetting to set environment variables before starting Alloy | Alloy starts but ships nothing (empty auth, empty URLs) | Follow [Linux](../ch03-credentials-and-secrets/linux-env-setup.md) or [Windows](../ch03-credentials-and-secrets/windows-env-setup.md) env setup first |
| Using `systemctl reload` instead of `systemctl restart` | Env var changes are not picked up (Linux) | Always use `restart` after changing env vars |
| Placing the config in the wrong file path | Alloy loads its default/empty config | Linux: `/etc/alloy/config.alloy`; Windows: `C:\Program Files\GrafanaLabs\Alloy\config.alloy` |
| Running the metrics+logs config with only metrics env vars set | Metrics work, logs fail silently | Set all five env vars for metrics+logs configs |
| Not including write endpoints inside FM pipelines | "Component does not exist or is out of scope" | See [Every Pipeline Needs Its Own Write Endpoints](../ch05-fleet-management/write-endpoints.md) |
| Deploying the OTLP gateway without firewall rules | External traffic can send arbitrary telemetry | Bind to `127.0.0.1` for local-only, or use firewall rules for network access |

## Summary

- Six configs covering the most common deployment patterns: Linux metrics, Linux metrics+logs, Windows metrics, Windows metrics+logs, OTLP gateway, and Fleet Management bootstrap
- All configs use `sys.env()` for credentials -- set them once per host, never hardcode
- Metrics configs include the full Chapter 2 cardinality controls (allow-list, pattern blocks, fleet tags)
- Expected series counts: 400-600 per Linux host, 130-150 per Windows host with the hardened configs
- The OTLP gateway config is a standalone pattern -- combine with a metrics config for full host monitoring
- The FM bootstrap config is the smallest possible local config; all collection logic lives in FM pipelines
