# Windows: Domain Controller Considerations

## Why DCs Are Different

Domain controllers are the authentication backbone of Active Directory. Every user logon, Kerberos ticket request, LDAP query, and group policy evaluation generates Security log events. On a busy DC, this means:

- **Security log volume:** tens of thousands to millions of events per day, depending on the number of users, computers, and service accounts in the domain
- **Additional services:** Active Directory Domain Services (AD DS), DNS Server, Kerberos KDC, Group Policy, DFS Replication, and others that should be included in monitoring
- **Sensitive data:** Security events may contain usernames, IP addresses, and authentication details that some organizations consider sensitive for log shipping

A standard member server might generate a few hundred Security events per day. A DC serving 5,000 users can easily generate 500,000+ per day.

## Security Log: The Volume Problem

The Security log on a domain controller captures:

| Event Category | Event IDs | Volume |
|---|---|---|
| **Logon/Logoff** | 4624, 4625, 4634 | Every user and computer authentication |
| **Kerberos** | 4768, 4769, 4770, 4771 | Every ticket request and renewal |
| **Account Management** | 4720-4740 | User/group/computer changes |
| **Object Access** | 4663, 4656 | File and registry access auditing |
| **Policy Changes** | 4670, 4703, 4704 | Audit policy modifications |
| **LDAP** | varies | Every directory query |

Kerberos events alone can dominate: each user logon triggers TGT (4768) and service ticket (4769) requests, and tickets are renewed periodically. A domain with 5,000 users and 2,000 computers generates Kerberos events continuously.

## Three Approaches for DC Log Collection

### Approach 1: Skip the Security Log

The simplest option. Comment out the Security source entirely and rely on Application + System logs:

```alloy
// Application log
loki.source.windowsevent "application" {
  eventlog_name          = "Application"
  use_incoming_timestamp = true
  forward_to             = [loki.process.windows_events.receiver]
}

// System log
loki.source.windowsevent "system" {
  eventlog_name          = "System"
  use_incoming_timestamp = true
  forward_to             = [loki.process.windows_events.receiver]
}

// Security log -- DISABLED on domain controllers due to volume
// Uncomment if you need it and have the Loki budget for it.
// loki.source.windowsevent "security" {
//   eventlog_name          = "Security"
//   use_incoming_timestamp = true
//   forward_to             = [loki.process.windows_events.receiver]
// }
```

This is reasonable when you have a dedicated SIEM (Splunk, Sentinel, Elastic) already collecting Security events.

### Approach 2: Aggressive XPath Filtering

Collect only the most critical Security events:

```alloy
loki.source.windowsevent "security" {
  eventlog_name          = "Security"
  use_incoming_timestamp = true
  // Only critical security events: failed logons, account lockouts,
  // account changes, policy changes, and critical/error severity
  xpath_query            = "*[System[(Level=1 or Level=2 or Level=3) or (EventID=4625 or EventID=4740 or EventID=4720 or EventID=4722 or EventID=4723 or EventID=4724 or EventID=4725 or EventID=4726 or EventID=4738)]]"
  forward_to             = [loki.process.windows_events.receiver]
}
```

This captures:
- Failed logon attempts (4625) -- security investigations
- Account lockouts (4740) -- helpdesk and security
- Account lifecycle events (4720-4726, 4738) -- compliance auditing
- All critical/error/warning severity events

This can reduce Security log volume by 90%+ while retaining the events most useful for incident response.

### Approach 3: Rate-Limited Full Collection

Ship everything but cap the throughput:

```alloy
loki.source.windowsevent "security" {
  eventlog_name          = "Security"
  use_incoming_timestamp = true
  forward_to             = [loki.process.windows_events.receiver]
}

loki.process "windows_events" {
  stage.limit {
    rate  = 50    // lines per second -- tune based on your Loki budget
    burst = 200
    drop  = true
  }

  forward_to = [loki.relabel.integrations_windows_exporter.receiver]
}
```

This guarantees a predictable log volume but means some events will be dropped during bursts. Acceptable for general monitoring, not suitable if you need complete audit trails.

## Additional DC Services to Monitor

Domain controllers run services that member servers do not. Consider adding these to the service filter (see [Service Cardinality](service-cardinality.md)):

| Service Name | Description |
|---|---|
| `ntds` | Active Directory Domain Services |
| `dns` | DNS Server |
| `kdc` | Kerberos Key Distribution Center |
| `dfsr` | DFS Replication |
| `netlogon` | Netlogon (DC authentication) |
| `ismserv` | Intersite Messaging |
| `adws` | Active Directory Web Services |

Add them to the service filter regex:

```alloy
regex = "windows_service_state@(windefend|alloy|winrm|w32time|wuauserv|eventlog|dhcp|dnscache|lanmanserver|lanmanworkstation|mpssvc|bits|ntds|dns|kdc|dfsr|netlogon)"
```

Each additional service adds approximately 2-4 series.

## GPO Considerations

Domain controllers are typically managed via Group Policy. For fleet-wide Alloy deployment:

- Use GPO Preferences to distribute environment variables (Computer Configuration -- Preferences -- Windows Settings -- Environment)
- Use GPO or SCCM to distribute the config file to `C:\Program Files\GrafanaLabs\Alloy\config.alloy`
- Consider a separate GPO for DCs with a DC-specific config (Security log disabled or filtered)
- Schedule Alloy service restarts via a GPO-deployed scheduled task after config changes

## Estimating Log Volume

Before enabling Security log collection on a DC, estimate the volume:

```powershell
# Count Security events in the last 24 hours
$yesterday = (Get-Date).AddDays(-1)
(Get-WinEvent -FilterHashtable @{LogName='Security'; StartTime=$yesterday}).Count

# Or, faster -- check the log size directly
Get-WinEvent -ListLog Security | Select-Object LogName, RecordCount, FileSize, MaximumSizeInBytes
```

If the Security log is cycling through its maximum size multiple times per day, that is a strong signal to use Approach 1 or 2 rather than shipping everything.

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Treating DCs like member servers | Massive log volume, potential Loki cost spike | Use a DC-specific config with Security log filtering |
| Not monitoring DC-specific services | Miss AD DS, DNS, or Kerberos failures | Add DC services to the service filter |
| Using the same GPO for DCs and member servers | Identical config despite different needs | Create a separate OU or GPO for DC-specific Alloy config |
