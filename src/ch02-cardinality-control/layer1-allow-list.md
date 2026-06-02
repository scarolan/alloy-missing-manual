# Layer 1: Allow-List

The allow-list is the most impactful single filter in the entire cardinality control stack. It operates on metric names -- the `__name__` label -- and keeps only the metrics you explicitly list. Everything else is dropped before it leaves the host.

This one rule typically eliminates 60-80% of unnecessary series.

## Why Allow-List Beats Deny-List

A deny-list says "drop these specific metrics." An allow-list says "keep only these specific metrics."

The critical difference: **what happens when the exporter is upgraded and adds new metrics?**

- **Deny-list**: New metrics pass through silently. Your series count creeps up with every upgrade. You discover the increase weeks later on your bill.
- **Allow-list**: New metrics are dropped by default. Your series count stays exactly where you set it. To add a new metric, you make a conscious decision.

Allow-lists give you a closed system. Nothing unexpected gets through.

## The `join()` Syntax

Alloy's configuration language provides a `join()` function that builds a regex from an array of strings. This is the key to making allow-lists maintainable:

```alloy
rule {
    source_labels = ["__name__"]
    regex = join([
        "metric_name_one",
        "metric_name_two",
        "metric_name_three",
    ], "|")
    action = "keep"
}
```

The `join()` call produces the regex `metric_name_one|metric_name_two|metric_name_three` at runtime. The benefits over a raw regex string:

- **One metric per line** -- easy to scan, diff, and review in pull requests
- **Comments between entries** -- group metrics by category with `//` comments
- **No escaping issues** -- each entry is a plain string, not embedded in a regex
- **Easy to add/remove** -- add a line, remove a line, no worrying about trailing `|` or missing parentheses

## Complete Allow-List: Node Exporter Full (Dashboard 1860)

This is the full 208-metric allow-list for the [Node Exporter Full dashboard](https://grafana.com/grafana/dashboards/1860-node-exporter-full/). Every metric listed below powers at least one panel in the dashboard. The list is grouped by category with comments matching the [hardened-grafana-alloy-linux](https://github.com/scarolan/hardened-grafana-alloy-linux) production config.

```alloy
prometheus.relabel "integrations_node_exporter" {
    forward_to = [prometheus.remote_write.metrics_service.receiver]

    // ===================================================================
    // LAYER 1: Allow-list -- only dashboard-required metrics pass through
    // ===================================================================
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

    // ... Layers 2-4 follow ...
}
```

### Metric Count by Category

| Category | Count | Notes |
|----------|-------|-------|
| Uptime & clock | 4 | `up`, boot time, time, timezone offset |
| CPU | 8 | seconds_total, guest, scaling freq (x3), load (x3) |
| Memory | 47 | Every `/proc/meminfo` field the dashboard queries |
| Disk I/O | 14 | Read/write bytes, ops, merges, io_time, discards |
| Filesystem | 7 | Size, avail, free, files, files_free, device_error, readonly |
| Network | 21 | RX/TX bytes, packets, errors, drops, fifo, carrier, MTU, speed |
| Netstat | 30 | TCP, UDP, UDPLite, ICMP, IP counters |
| Sockstat | 14 | TCP/UDP/FRAG/RAW socket counters |
| Processes | 9 | PIDs, threads, state, forks, context switches |
| VMstat | 7 | Page faults, paging, OOM kills, swap |
| Hardware monitoring | 6 | Temperature sensors |
| Time sync | 8 | NTP/timex health |
| Entropy | 2 | Available bits, pool size |
| Exporter health | 3 | Scrape success, duration, textfile errors |
| System info | 1 | `node_uname_info` |
| File descriptors & interrupts | 4 | FD allocated/max, interrupts |
| Conntrack | 2 | Entries, limit |
| TCP connection states | 1 | States (11 TCP states as label values) |
| Power & cooling | 3 | Power supply, cooling devices |
| ARP | 1 | ARP table entries |
| PSI | 5 | CPU, IO, memory pressure |
| Scheduler | 3 | Running, timeslices, waiting |
| Softnet | 3 | Dropped, processed, squeezed |
| Systemd | 3 | Socket connections, units, unit_state |
| Process FDs | 2 | max_fds, open_fds (exporter process) |
| **Total** | **206** | |

## Complete Allow-List: Windows Exporter Dashboard 2025 (Dashboard 24390)

The full 95-metric allow-list for the [Windows Exporter Dashboard 2025](https://grafana.com/grafana/dashboards/24390-windows-exporter-dashboard-2025/), matching the [hardened-grafana-alloy-windows](https://github.com/scarolan/hardened-grafana-alloy-windows) production config:

```alloy
prometheus.relabel "integrations_windows_exporter" {
    forward_to = [prometheus.remote_write.metrics_service.receiver]

    // ===================================================================
    // LAYER 1: Allow-list -- only dashboard-required metrics pass through
    // ===================================================================
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

            // -- Service (filtered by Layer 2) --
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

    // ... Layers 2-5 follow ...
}
```

### Windows Metric Count by Category

| Category | Count | Notes |
|----------|-------|-------|
| Uptime & general | 4 | `up`, build_info, collector success/duration |
| OS info | 16 | OS details, hostname, memory, paging, processes, users |
| CPU | 8 | time_total, frequency, performance, interrupts, dpcs, utility |
| Memory | 22 | Physical, available, cache, pool, standby, swap, faults |
| Pagefile | 3 | Usage, limit, percent |
| Logical disk | 13 | Free, size, read/write bytes/ops/latency/seconds, idle, split, queued |
| Physical disk | 3 | Info, size, status |
| Network | 10 | Bytes in/out/total, bandwidth, packets, errors, discards |
| System | 7 | Context switches, exceptions, processes, threads, queue, calls, uptime |
| Time | 3 | NTP offset, round trip, frequency adjustment |
| Service | 4 | State, start_mode, status, info (filtered by Layer 2) |
| Exporter process | 2 | CPU seconds, resident memory |
| **Total** | **95** | |

## How the `join()` Rule Works at Runtime

When Alloy evaluates the config, the `join()` call produces a single regex string:

```text
up|node_boot_time_seconds|node_time_seconds|...|process_open_fds
```

This regex is applied to the `__name__` label of every incoming metric. If the metric name matches any entry in the list, the `keep` action retains it. Everything else is dropped.

Because the regex is an exact-match alternation (no wildcards), it is both precise and fast. The Prometheus relabeling engine compiles the regex once and evaluates it for every sample in the scrape.

## Building Your Own Allow-List

To create an allow-list for a different dashboard:

1. **Open the dashboard JSON model** (Dashboard Settings > JSON Model)
2. **Search for all `expr` fields** -- these contain the PromQL queries
3. **Extract every metric name** referenced in those queries
4. **Add standard overhead metrics**: `up`, `scrape_duration_seconds`, `scrape_samples_scraped` (if you monitor scrape health)
5. **Format as a `join()` array** with comments grouping metrics by category

The `mimirtool analyze grafana` command can automate steps 1-3 by extracting all metric names referenced across all dashboards in a Grafana instance.

## Common Mistakes

**Forgetting `up`.** The `up` metric indicates whether the scrape target is reachable. Without it, you lose basic host-alive monitoring. Always include it.

**Using a single giant regex string.** Writing `regex = "up|node_boot_time_seconds|node_time_seconds|..."` as one long line makes the config impossible to review, diff, or maintain. Use `join()`.

**Using wildcards in the allow-list.** Writing `"node_memory_.*"` instead of listing specific metrics defeats the purpose of an allow-list. New memory metrics from exporter upgrades would pass through uncontrolled. List every metric explicitly.

**Not updating the allow-list when changing dashboards.** If you switch from Dashboard 1860 to a custom dashboard, the allow-list must be re-derived from the new dashboard's queries. The old allow-list may include metrics the new dashboard does not use (waste) or miss metrics the new dashboard needs (broken panels).

## Summary

- The allow-list is the single highest-impact cardinality control
- Use `join()` to build maintainable, reviewable regex from arrays of metric names
- The Linux config (Dashboard 1860) uses 208 metric names
- The Windows config (Dashboard 24390) uses 95 metric names
- Allow-lists are closed systems: nothing new passes through without explicit approval
- Derive your allow-list from your dashboards, not from guesswork
- Complete production configs with all 5 layers applied: [Linux](https://github.com/scarolan/hardened-grafana-alloy-linux) | [Windows](https://github.com/scarolan/hardened-grafana-alloy-windows)
