# Summary

[Introduction](introduction.md)

---

# Getting Started

- [Config Language Survival Guide](ch01-config-language/README.md)
  - [Syntax Basics](ch01-config-language/syntax-basics.md)
  - [Gotchas and Traps](ch01-config-language/gotchas-and-traps.md)
  - [Component Wiring](ch01-config-language/component-wiring.md)
  - [Error Messages Decoded](ch01-config-language/error-messages.md)

# Core Skills

- [Cardinality Control](ch02-cardinality-control/README.md)
  - [Why Cardinality Matters](ch02-cardinality-control/why-cardinality-matters.md)
  - [Layer 1: Allow-List](ch02-cardinality-control/layer1-allow-list.md)
  - [Layer 2: Pattern Block](ch02-cardinality-control/layer2-pattern-block.md)
  - [Layer 3: Label Tagging](ch02-cardinality-control/layer3-label-tagging.md)
  - [Layer 4: Value Limits](ch02-cardinality-control/layer4-value-limits.md)
  - [Layer 5: Service Filter (Windows)](ch02-cardinality-control/layer5-service-filter-windows.md)
  - [Before and After: Unfiltered vs Hardened](ch02-cardinality-control/before-and-after.md)
- [Credentials and Secrets](ch03-credentials-and-secrets/README.md)
  - [The sys.env() Pattern](ch03-credentials-and-secrets/sys-env-pattern.md)
  - [Linux Environment Setup](ch03-credentials-and-secrets/linux-env-setup.md)
  - [Windows Environment Setup](ch03-credentials-and-secrets/windows-env-setup.md)

# Operations

- [Platform Guides](ch04-platform-guides/README.md)
  - [Linux: systemd Filtering](ch04-platform-guides/linux/systemd-filtering.md)
  - [Linux: Journal Logs](ch04-platform-guides/linux/journal-logs.md)
  - [Linux: Non-Root Operation](ch04-platform-guides/linux/non-root-operation.md)
  - [Windows: Service Cardinality](ch04-platform-guides/windows/service-cardinality.md)
  - [Windows: Environment Variable Inheritance](ch04-platform-guides/windows/env-var-inheritance.md)
  - [Windows: Event Logs](ch04-platform-guides/windows/event-logs.md)
  - [Windows: Domain Controller Considerations](ch04-platform-guides/windows/domain-controller.md)
- [Fleet Management](ch05-fleet-management/README.md)
  - [The Sealed-Module Gotcha](ch05-fleet-management/sealed-module-gotcha.md)
  - [Bootstrap vs Pipeline Scope](ch05-fleet-management/bootstrap-vs-pipeline.md)
  - [Every Pipeline Needs Its Own Write Endpoints](ch05-fleet-management/write-endpoints.md)
- [Fleet Deployment](ch09-fleet-deployment/README.md)
  - [Deployment Strategy](ch09-fleet-deployment/deployment-strategy.md)
  - [Linux: Ansible](ch09-fleet-deployment/linux-ansible.md)
  - [Linux: Other Automation](ch09-fleet-deployment/linux-other.md)
  - [Windows: SCCM / MECM](ch09-fleet-deployment/windows-sccm.md)
  - [Windows: Group Policy (GPO)](ch09-fleet-deployment/windows-gpo.md)
  - [Windows: Other Automation](ch09-fleet-deployment/windows-other.md)
  - [Validation and Rollback](ch09-fleet-deployment/validation-rollback.md)
- [Cost Optimization](ch06-cost-optimization/README.md)
  - [Metrics: The #1 Cost Driver](ch06-cost-optimization/metrics-cost-drivers.md)
  - [The Top-N Series Approach](ch06-cost-optimization/top-n-series.md)
  - [Adaptive Metrics](ch06-cost-optimization/adaptive-metrics.md)
  - [Dangerous Label Patterns](ch06-cost-optimization/dangerous-labels.md)
  - [Log Filtering](ch06-cost-optimization/log-filtering.md)

# Advanced Topics

- [OpenTelemetry Native Support](ch08-otel-native/README.md)
  - [What Changed](ch08-otel-native/what-changed.md)
  - [Migration from Alloy Config](ch08-otel-native/migration.md)
  - [When to Use OTEL Native vs Alloy Config](ch08-otel-native/when-to-use.md)
  - [Example Configurations](ch08-otel-native/examples.md)

# Reference

- [Recipes and Examples](ch07-recipes/README.md)
  - [SNMP Monitoring](ch07-recipes/snmp-monitoring.md)
  - [Blackbox Exporter](ch07-recipes/blackbox-exporter.md)
  - [Network Testing](ch07-recipes/network-testing.md)
  - [Starter Configs](ch07-recipes/starter-configs.md)
  - [Alloy vs OpenTelemetry Collector](ch07-recipes/alloy-vs-otel.md)

---

[Resources](appendix/resources.md)
[Glossary](appendix/glossary.md)
