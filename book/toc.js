// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded affix "><a href="introduction.html">Introduction</a></li><li class="chapter-item expanded affix "><li class="spacer"></li><li class="chapter-item expanded affix "><li class="part-title">Getting Started</li><li class="chapter-item expanded "><a href="ch01-config-language/index.html"><strong aria-hidden="true">1.</strong> Config Language Survival Guide</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch01-config-language/syntax-basics.html"><strong aria-hidden="true">1.1.</strong> Syntax Basics</a></li><li class="chapter-item expanded "><a href="ch01-config-language/gotchas-and-traps.html"><strong aria-hidden="true">1.2.</strong> Gotchas and Traps</a></li><li class="chapter-item expanded "><a href="ch01-config-language/component-wiring.html"><strong aria-hidden="true">1.3.</strong> Component Wiring</a></li><li class="chapter-item expanded "><a href="ch01-config-language/error-messages.html"><strong aria-hidden="true">1.4.</strong> Error Messages Decoded</a></li></ol></li><li class="chapter-item expanded "><li class="part-title">Core Skills</li><li class="chapter-item expanded "><a href="ch02-cardinality-control/index.html"><strong aria-hidden="true">2.</strong> Cardinality Control</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch02-cardinality-control/why-cardinality-matters.html"><strong aria-hidden="true">2.1.</strong> Why Cardinality Matters</a></li><li class="chapter-item expanded "><a href="ch02-cardinality-control/layer1-allow-list.html"><strong aria-hidden="true">2.2.</strong> Layer 1: Allow-List</a></li><li class="chapter-item expanded "><a href="ch02-cardinality-control/layer2-pattern-block.html"><strong aria-hidden="true">2.3.</strong> Layer 2: Pattern Block</a></li><li class="chapter-item expanded "><a href="ch02-cardinality-control/layer3-label-tagging.html"><strong aria-hidden="true">2.4.</strong> Layer 3: Label Tagging</a></li><li class="chapter-item expanded "><a href="ch02-cardinality-control/layer4-value-limits.html"><strong aria-hidden="true">2.5.</strong> Layer 4: Value Limits</a></li><li class="chapter-item expanded "><a href="ch02-cardinality-control/layer5-service-filter-windows.html"><strong aria-hidden="true">2.6.</strong> Layer 5: Service Filter (Windows)</a></li><li class="chapter-item expanded "><a href="ch02-cardinality-control/before-and-after.html"><strong aria-hidden="true">2.7.</strong> Before and After: Unfiltered vs Hardened</a></li></ol></li><li class="chapter-item expanded "><a href="ch03-credentials-and-secrets/index.html"><strong aria-hidden="true">3.</strong> Credentials and Secrets</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch03-credentials-and-secrets/sys-env-pattern.html"><strong aria-hidden="true">3.1.</strong> The sys.env() Pattern</a></li><li class="chapter-item expanded "><a href="ch03-credentials-and-secrets/linux-env-setup.html"><strong aria-hidden="true">3.2.</strong> Linux Environment Setup</a></li><li class="chapter-item expanded "><a href="ch03-credentials-and-secrets/windows-env-setup.html"><strong aria-hidden="true">3.3.</strong> Windows Environment Setup</a></li></ol></li><li class="chapter-item expanded "><li class="part-title">Operations</li><li class="chapter-item expanded "><a href="ch04-platform-guides/index.html"><strong aria-hidden="true">4.</strong> Platform Guides</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch04-platform-guides/linux/systemd-filtering.html"><strong aria-hidden="true">4.1.</strong> Linux: systemd Filtering</a></li><li class="chapter-item expanded "><a href="ch04-platform-guides/linux/journal-logs.html"><strong aria-hidden="true">4.2.</strong> Linux: Journal Logs</a></li><li class="chapter-item expanded "><a href="ch04-platform-guides/linux/non-root-operation.html"><strong aria-hidden="true">4.3.</strong> Linux: Non-Root Operation</a></li><li class="chapter-item expanded "><a href="ch04-platform-guides/windows/service-cardinality.html"><strong aria-hidden="true">4.4.</strong> Windows: Service Cardinality</a></li><li class="chapter-item expanded "><a href="ch04-platform-guides/windows/env-var-inheritance.html"><strong aria-hidden="true">4.5.</strong> Windows: Environment Variable Inheritance</a></li><li class="chapter-item expanded "><a href="ch04-platform-guides/windows/event-logs.html"><strong aria-hidden="true">4.6.</strong> Windows: Event Logs</a></li><li class="chapter-item expanded "><a href="ch04-platform-guides/windows/domain-controller.html"><strong aria-hidden="true">4.7.</strong> Windows: Domain Controller Considerations</a></li></ol></li><li class="chapter-item expanded "><a href="ch05-fleet-management/index.html"><strong aria-hidden="true">5.</strong> Fleet Management</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch05-fleet-management/sealed-module-gotcha.html"><strong aria-hidden="true">5.1.</strong> The Sealed-Module Gotcha</a></li><li class="chapter-item expanded "><a href="ch05-fleet-management/bootstrap-vs-pipeline.html"><strong aria-hidden="true">5.2.</strong> Bootstrap vs Pipeline Scope</a></li><li class="chapter-item expanded "><a href="ch05-fleet-management/write-endpoints.html"><strong aria-hidden="true">5.3.</strong> Every Pipeline Needs Its Own Write Endpoints</a></li></ol></li><li class="chapter-item expanded "><a href="ch09-fleet-deployment/index.html"><strong aria-hidden="true">6.</strong> Fleet Deployment</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch09-fleet-deployment/deployment-strategy.html"><strong aria-hidden="true">6.1.</strong> Deployment Strategy</a></li><li class="chapter-item expanded "><a href="ch09-fleet-deployment/linux-ansible.html"><strong aria-hidden="true">6.2.</strong> Linux: Ansible</a></li><li class="chapter-item expanded "><a href="ch09-fleet-deployment/linux-other.html"><strong aria-hidden="true">6.3.</strong> Linux: Other Automation</a></li><li class="chapter-item expanded "><a href="ch09-fleet-deployment/windows-sccm.html"><strong aria-hidden="true">6.4.</strong> Windows: SCCM / MECM</a></li><li class="chapter-item expanded "><a href="ch09-fleet-deployment/windows-gpo.html"><strong aria-hidden="true">6.5.</strong> Windows: Group Policy (GPO)</a></li><li class="chapter-item expanded "><a href="ch09-fleet-deployment/windows-other.html"><strong aria-hidden="true">6.6.</strong> Windows: Other Automation</a></li><li class="chapter-item expanded "><a href="ch09-fleet-deployment/validation-rollback.html"><strong aria-hidden="true">6.7.</strong> Validation and Rollback</a></li></ol></li><li class="chapter-item expanded "><a href="ch06-cost-optimization/index.html"><strong aria-hidden="true">7.</strong> Cost Optimization</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch06-cost-optimization/metrics-cost-drivers.html"><strong aria-hidden="true">7.1.</strong> Metrics: The #1 Cost Driver</a></li><li class="chapter-item expanded "><a href="ch06-cost-optimization/top-n-series.html"><strong aria-hidden="true">7.2.</strong> The Top-N Series Approach</a></li><li class="chapter-item expanded "><a href="ch06-cost-optimization/adaptive-metrics.html"><strong aria-hidden="true">7.3.</strong> Adaptive Metrics</a></li><li class="chapter-item expanded "><a href="ch06-cost-optimization/dangerous-labels.html"><strong aria-hidden="true">7.4.</strong> Dangerous Label Patterns</a></li><li class="chapter-item expanded "><a href="ch06-cost-optimization/log-filtering.html"><strong aria-hidden="true">7.5.</strong> Log Filtering</a></li></ol></li><li class="chapter-item expanded "><li class="part-title">Advanced Topics</li><li class="chapter-item expanded "><a href="ch08-otel-native/index.html"><strong aria-hidden="true">8.</strong> OpenTelemetry Native Support</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch08-otel-native/what-changed.html"><strong aria-hidden="true">8.1.</strong> What Changed</a></li><li class="chapter-item expanded "><a href="ch08-otel-native/migration.html"><strong aria-hidden="true">8.2.</strong> Migration from Alloy Config</a></li><li class="chapter-item expanded "><a href="ch08-otel-native/when-to-use.html"><strong aria-hidden="true">8.3.</strong> When to Use OTEL Native vs Alloy Config</a></li><li class="chapter-item expanded "><a href="ch08-otel-native/examples.html"><strong aria-hidden="true">8.4.</strong> Example Configurations</a></li></ol></li><li class="chapter-item expanded "><li class="part-title">Reference</li><li class="chapter-item expanded "><a href="ch07-recipes/index.html"><strong aria-hidden="true">9.</strong> Recipes and Examples</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch07-recipes/snmp-monitoring.html"><strong aria-hidden="true">9.1.</strong> SNMP Monitoring</a></li><li class="chapter-item expanded "><a href="ch07-recipes/blackbox-exporter.html"><strong aria-hidden="true">9.2.</strong> Blackbox Exporter</a></li><li class="chapter-item expanded "><a href="ch07-recipes/network-testing.html"><strong aria-hidden="true">9.3.</strong> Network Testing</a></li><li class="chapter-item expanded "><a href="ch07-recipes/starter-configs.html"><strong aria-hidden="true">9.4.</strong> Starter Configs</a></li><li class="chapter-item expanded "><a href="ch07-recipes/alloy-vs-otel.html"><strong aria-hidden="true">9.5.</strong> Alloy vs OpenTelemetry Collector</a></li></ol></li><li class="chapter-item expanded "><a href="ch10-useful-links/index.html"><strong aria-hidden="true">10.</strong> Useful Links</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="ch10-useful-links/official-docs.html"><strong aria-hidden="true">10.1.</strong> Official Documentation</a></li><li class="chapter-item expanded "><a href="ch10-useful-links/community.html"><strong aria-hidden="true">10.2.</strong> Community Resources</a></li><li class="chapter-item expanded "><a href="ch10-useful-links/dashboards-and-tools.html"><strong aria-hidden="true">10.3.</strong> Dashboards and Tools</a></li></ol></li><li class="chapter-item expanded "><li class="spacer"></li><li class="chapter-item expanded affix "><a href="appendix/resources.html">Resources</a></li><li class="chapter-item expanded affix "><a href="appendix/glossary.html">Glossary</a></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString().split("#")[0].split("?")[0];
        if (current_page.endsWith("/")) {
            current_page += "index.html";
        }
        var links = Array.prototype.slice.call(this.querySelectorAll("a"));
        var l = links.length;
        for (var i = 0; i < l; ++i) {
            var link = links[i];
            var href = link.getAttribute("href");
            if (href && !href.startsWith("#") && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The "index" page is supposed to alias the first chapter in the book.
            if (link.href === current_page || (i === 0 && path_to_root === "" && current_page.endsWith("/index.html"))) {
                link.classList.add("active");
                var parent = link.parentElement;
                if (parent && parent.classList.contains("chapter-item")) {
                    parent.classList.add("expanded");
                }
                while (parent) {
                    if (parent.tagName === "LI" && parent.previousElementSibling) {
                        if (parent.previousElementSibling.classList.contains("chapter-item")) {
                            parent.previousElementSibling.classList.add("expanded");
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                sessionStorage.setItem('sidebar-scroll', this.scrollTop);
            }
        }, { passive: true });
        var sidebarScrollTop = sessionStorage.getItem('sidebar-scroll');
        sessionStorage.removeItem('sidebar-scroll');
        if (sidebarScrollTop) {
            // preserve sidebar scroll position when navigating via links within sidebar
            this.scrollTop = sidebarScrollTop;
        } else {
            // scroll sidebar to current active section when navigating via "next/previous chapter" buttons
            var activeSection = document.querySelector('#sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        var sidebarAnchorToggles = document.querySelectorAll('#sidebar a.toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(function (el) {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define("mdbook-sidebar-scrollbox", MDBookSidebarScrollbox);
