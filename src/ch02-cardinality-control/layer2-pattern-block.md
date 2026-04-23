# Layer 2: Pattern Block

After the allow-list filters metric names, you still have a problem: individual metrics can carry high-cardinality label *values*. A single metric like `node_filesystem_size_bytes` might have dozens of label values for `device` or `mountpoint` -- many of which are ephemeral container mounts, UUID-named devices, or virtual interfaces that churn constantly.

Layer 2 uses regex patterns to identify and drop these problematic label values before they reach your backend.

## Linux Pattern Blocks

The hardened Linux config contains five pattern-block rules. Here is each one with the exact regex and an explanation of what it catches.

### Rule 1: Loopback and Virtual Network Interfaces

```alloy
// Drop loopback and virtual network interfaces
rule {
    source_labels = ["__name__", "device"]
    regex         = "node_network_.+;(lo|docker.*|veth.*|cali.*|flannel\\.[0-9]+)"
    action        = "drop"
}
```

**What it catches:**

| Pattern | Source | Why it's dropped |
|---------|--------|-----------------|
| `lo` | Loopback interface | Always present, never useful for monitoring real traffic |
| `docker.*` | Docker bridge networks (`docker0`, `docker_gwbridge`) | Internal container networking, not real host traffic |
| `veth.*` | Virtual ethernet pairs | One created per container; churn as containers start/stop |
| `cali.*` | Calico CNI interfaces | Kubernetes pod networking; one per pod |
| `flannel\.[0-9]+` | Flannel CNI interfaces | Kubernetes overlay network interfaces |

**Impact:** On a container host running 50 containers, this rule prevents ~50 `veth` interfaces from each generating ~21 network metric series (1,050 series avoided).

### Rule 2: Virtual/Ephemeral Filesystem Types

```alloy
// Drop virtual/ephemeral filesystem types
rule {
    source_labels = ["__name__", "fstype"]
    regex         = "node_filesystem_.+;(tmpfs|devtmpfs|overlay|squashfs)"
    action        = "drop"
}
```

**What it catches:**

| Pattern | Source | Why it's dropped |
|---------|--------|-----------------|
| `tmpfs` | Temporary in-memory filesystems | `/dev/shm`, `/run`, systemd mounts -- not real storage |
| `devtmpfs` | Device filesystem | `/dev` -- always present, not monitorable storage |
| `overlay` | Docker/containerd overlay mounts | Container filesystem layers; churn with container lifecycle |
| `squashfs` | Snap packages (Ubuntu) | Each snap package creates a squashfs mount; dozens on Ubuntu |

**Impact:** A typical Ubuntu host with snap packages can have 20+ squashfs mounts. Each generates 7 filesystem metrics = 140 wasted series. On container hosts, overlay mounts multiply further.

### Rule 3: UUID in Device Labels

```alloy
// Drop metrics where 'device' label contains a UUID (container sprawl)
rule {
    source_labels = ["device"]
    regex         = ".*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}.*"
    action        = "drop"
}
```

**What it catches:** Any metric where the `device` label contains a standard UUID pattern (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). This appears in:

- Device-mapper names for LVM volumes: `dm-name-vg--data-lv--docker--ab12cd34-ef56-...`
- Container storage drivers: device names containing container IDs
- iSCSI/multipath device names with GUIDs

**Impact:** On hosts with LVM or container storage, device names containing UUIDs create series that are difficult to query (the UUID changes with container recreation) and provide no dashboard value.

### Rule 4: UUID in Mountpoint Labels

```alloy
// Drop metrics where 'mountpoint' label contains a UUID
rule {
    source_labels = ["mountpoint"]
    regex         = ".*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}.*"
    action        = "drop"
}
```

**What it catches:** Filesystem metrics where the `mountpoint` label contains a UUID. Common sources:

- Libvirt/KVM virtual disk mounts
- Systemd mount units with UUID-based names
- Cloud provider ephemeral disk mounts
- Container volume mounts with generated names

### Rule 5: Ephemeral Container Mounts

```alloy
// Drop filesystem metrics for ephemeral container mounts
rule {
    source_labels = ["__name__", "mountpoint"]
    regex         = "node_filesystem_.+;.*/var/lib/(docker|containerd|pods)/.+"
    action        = "drop"
}
```

**What it catches:** Any filesystem metric where the mountpoint is under:

- `/var/lib/docker/...` -- Docker container storage layers and volumes
- `/var/lib/containerd/...` -- containerd runtime storage
- `/var/lib/pods/...` -- Kubernetes pod volumes

**Impact:** A busy container host might have hundreds of submounts under these paths. Each creates 7 filesystem metric series. On a host running 100 containers, this could mean 700+ spurious series from container storage alone.

## Windows Pattern Blocks

The hardened Windows config contains five pattern-block rules targeting Windows-specific cardinality traps.

### Rule 1: Virtual/Tunnel Network Interfaces

```alloy
// Drop virtual/tunnel network interfaces (Hyper-V, isatap, Teredo, loopback)
rule {
    source_labels = ["__name__", "nic"]
    regex         = "windows_net_.+;.*(isatap|Teredo|Loopback|vEthernet|6to4|WFP).*"
    action        = "drop"
}
```

**What it catches:**

| Pattern | Source | Why it's dropped |
|---------|--------|-----------------|
| `isatap` | IPv6 transition tunnels | Automatic IPv6-over-IPv4 tunnels; not real NICs |
| `Teredo` | Teredo tunneling | IPv6 NAT traversal interface; not monitorable traffic |
| `Loopback` | Loopback adapter | Not real network traffic |
| `vEthernet` | Hyper-V virtual switches | Virtual switch ports; one per VM/container |
| `6to4` | 6to4 tunneling | IPv6 transition mechanism |
| `WFP` | Windows Filtering Platform | WFP lightweight filter interfaces |

**Impact:** A Windows server running Hyper-V can have dozens of `vEthernet` adapters. Each generates ~10 network metric series.

### Rule 2: Hidden System Volumes

```alloy
// Drop hidden system volumes (HarddiskVolume partitions)
rule {
    source_labels = ["__name__", "volume"]
    regex         = "windows_logical_disk_.+;.*HarddiskVolume.*"
    action        = "drop"
}
```

**What it catches:** Windows system partitions reported as `HarddiskVolume1`, `HarddiskVolume2`, etc. These are:

- EFI System Partition
- Recovery partition
- Reserved partition (MSR)

These partitions are not user-accessible storage and should not be monitored for capacity planning.

### Rule 3: GUID Volumes

```alloy
// Drop metrics where 'volume' label contains a GUID
rule {
    source_labels = ["volume"]
    regex         = ".*[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}.*"
    action        = "drop"
}
```

**What it catches:** Volume labels containing Windows GUIDs, typically `Volume{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}`. These appear when:

- Volumes are mounted by GUID instead of drive letter
- System volumes without drive letter assignments
- Cluster shared volumes in failover clustering

Note: The Windows regex uses `[A-Fa-f0-9]` (case-insensitive) because Windows GUIDs use uppercase hex, unlike Linux UUIDs which are typically lowercase.

### Rule 4: `_Total` Pseudo-Instance for Disk

```alloy
// Drop the _Total pseudo-instance for logical disks
rule {
    source_labels = ["__name__", "volume"]
    regex         = "windows_logical_disk_.+;_Total"
    action        = "drop"
}
```

**What it catches:** The `_Total` aggregate volume that Windows performance counters automatically generate. This is a sum across all real volumes -- redundant because you can `sum()` the individual volumes in PromQL. Keeping it doubles your disk metric series for no benefit.

### Rule 5: `_Total` Pseudo-Instance for Network

```alloy
// Drop the _Total pseudo-instance for network
rule {
    source_labels = ["__name__", "nic"]
    regex         = "windows_net_.+;_Total"
    action        = "drop"
}
```

**What it catches:** Same concept as Rule 4, applied to network interfaces. The `_Total` NIC is an aggregate across all real NICs -- redundant and a free cardinality win to drop.

## Pre-Collector Filtering

In addition to the relabel-time pattern blocks above, the hardened Linux config also filters at the collector level before metrics are even scraped. This is even more efficient because the data never enters the pipeline:

### Filesystem Exclusions (collector-level)

```alloy
filesystem {
    // Exclude virtual and pseudo filesystems
    fs_types_exclude     = "^(autofs|binfmt_misc|bpf|cgroup2?|configfs|debugfs|devpts|devtmpfs|tmpfs|fusectl|hugetlbfs|iso9660|mqueue|nsfs|overlay|proc|procfs|pstore|rpc_pipefs|securityfs|selinuxfs|squashfs|sysfs|tracefs)$"
    // Exclude system and container mount points
    mount_points_exclude = "^/(dev|proc|run/credentials/.+|sys|var/lib/docker/.+)($|/)"
    mount_timeout        = "5s"
}
```

This excludes 24 virtual filesystem types and system mount paths at collection time, before they even become metrics.

### Network Device Exclusions (collector-level)

```alloy
netdev {
    // Exclude virtual interfaces (containers, bridges, overlay networks)
    device_exclude = "^(veth.*|cali.*|flannel\\.[0-9]+|[a-f0-9]{15})$"
}
```

The `[a-f0-9]{15}` pattern catches Docker network IDs that appear as device names (15-character hex strings).

### Disabled Collectors

The Linux config explicitly disables 14 collectors that produce metrics not used by Dashboard 1860:

```alloy
disable_collectors = [
    "bcache",
    "bonding",
    "btrfs",
    "fibrechannel",
    "infiniband",
    "ipvs",
    "mdadm",
    "nfs",
    "nfsd",
    "rapl",
    "tapestats",
    "udp_queues",
    "xfs",
    "zfs",
]
```

Each of these collectors would produce metrics that pass through the allow-list (they have different `__name__` prefixes that are not in the list), so they are technically redundant with Layer 1. But disabling them is a defense-in-depth measure that also saves CPU and memory on the host -- the collector never runs, so the data is never generated.

## How Layers 1 and 2 Work Together

Layer 1 (allow-list) filters by metric **name**. Layer 2 (pattern block) filters by label **value**.

Consider `node_filesystem_size_bytes`. Layer 1 allows it through because the dashboard needs it. But a container host might report it with 50 different `mountpoint` values:

- `/` -- real, keep it
- `/boot` -- real, keep it
- `/var/lib/docker/overlay2/abc123def456/merged` -- container layer, drop it
- `/run/user/1000` -- tmpfs, drop it (caught by fstype rule)

Layer 1 cannot distinguish between these -- they all share the same `__name__`. Layer 2 catches the container paths and ephemeral types that would otherwise inflate your series count.

## Common Mistakes

**Not accounting for container hosts.** A bare-metal server might have 3 filesystems and 2 NICs. A container host running 100 containers might have 103 filesystems and 102 network interfaces. Without Layer 2, the same allow-list produces 30x more series on the container host.

**Overly broad regex.** A regex like `device=".*docker.*"` might accidentally match a legitimate device named `docker-data`. Be specific about what you are matching -- container paths, UUID formats, known virtual interface prefixes.

**Not filtering at both levels.** The collector-level filters (filesystem exclusions, netdev exclusions) and the relabel-level pattern blocks are complementary. Collector-level filtering prevents data generation. Relabel-level filtering catches anything that slips through. Use both.

## Summary

- Layer 2 catches high-cardinality label values that the allow-list cannot filter
- Linux: 5 pattern-block rules targeting loopback/veth interfaces, tmpfs/overlay, UUIDs in device/mountpoint labels, and container storage paths
- Windows: 5 pattern-block rules targeting virtual NICs (isatap, Teredo, vEthernet, 6to4, WFP), hidden volumes (HarddiskVolume), GUID volumes, and `_Total` pseudo-instances
- Pre-collector filtering (filesystem type exclusions, network device exclusions, disabled collectors) provides defense in depth
- The combination of Layers 1 and 2 handles both the metric-name and label-value dimensions of cardinality
