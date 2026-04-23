# Community Resources

The Alloy community is still growing. Most activity happens on the Grafana community forums, the Grafana Slack workspace, and GitHub. Below are the resources worth knowing about.

## Forums and Chat

| Link | What it is | Priority |
|------|-----------|----------|
| [Grafana Community Forums -- Alloy category](https://community.grafana.com/c/grafana-alloy/69) | The official forum for Alloy questions. Monitored by Grafana staff and community members. Search here before filing a GitHub issue. | Essential |
| [Grafana Slack workspace](https://slack.grafana.com/) | Join at `slack.grafana.com`, then find the `#alloy` channel. Faster than the forum for quick questions, but answers are not indexed by search engines. | Essential |
| [GitHub Issues -- grafana/alloy](https://github.com/grafana/alloy/issues) | Bug reports, feature requests, and design discussions. Check existing issues before opening a new one. | Essential |
| [GitHub Discussions -- grafana/alloy](https://github.com/grafana/alloy/discussions) | Longer-form community discussions and Q&A on the main repo. | Supplementary |

## Blog Posts and Articles

### Official Grafana Blog

| Link | What it covers | Priority |
|------|---------------|----------|
| [Introducing Grafana Alloy](https://grafana.com/blog/grafana-alloy-opentelemetry-collector-with-prometheus-pipelines/) | The original announcement post from GrafanaCON 2024. Explains why Grafana built Alloy as an OTel Collector distribution with Prometheus pipelines. | Essential |
| [From Agent to Alloy FAQ](https://grafana.com/blog/grafana-agent-to-grafana-alloy-opentelemetry-collector-faq/) | Why the transition happened, what changed, and what stayed the same. Read this if you are coming from Grafana Agent. | Essential |
| [Alloy at one year](https://grafana.com/blog/alloy-one-year/) | Retrospective on the first year of Alloy, covering what shipped and what is on the roadmap. | Supplementary |
| [Alloy 1.3 release -- live debugging](https://grafana.com/blog/2024/08/05/grafana-alloy-1.3-release-debug-pipelines-in-real-time/) | Introduced live debugging for real-time inspection of telemetry flowing through components. | Supplementary |
| [Loki 3.4 and Promtail merging into Alloy](https://grafana.com/blog/2025/02/13/grafana-loki-3.4-standardized-storage-config-sizing-guidance-and-promtail-merging-into-alloy/) | Covers the Promtail EOL timeline and why all log collection is converging on Alloy. | Supplementary |

### Community Blog Posts

| Link | What it covers | Priority |
|------|---------------|----------|
| [Grafana Alloy & OpenTelemetry (Magsther, Medium)](https://medium.com/@magstherdev/grafana-alloy-opentelemetry-59c171d2ebfc) | Clear walkthrough of how Alloy fits into the OTel ecosystem. Good for understanding the relationship. | Supplementary |
| [Migration from Promtail to Alloy (Developer Friendly)](https://developer-friendly.blog/blog/2025/03/17/migration-from-promtail-to-alloy-the-what-the-why-and-the-how/) | Step-by-step Promtail-to-Alloy migration with real config examples and reasoning. | Supplementary |
| [Migrating Promtail to Alloy in Kubernetes (Medium)](https://medium.com/@vincenthartmann/migrating-from-promtail-to-grafana-alloy-in-kubernetes-53ce4c5b7556) | Kubernetes-specific migration walkthrough with Helm chart details. | Supplementary |
| [Grafana Alloy -- Replacing Promtail (SUSE Communities)](https://www.suse.com/c/grafana-alloy-part-1-replacing-promtail/) | Enterprise perspective on migrating from Promtail. | Supplementary |
| [Replace Promtail with Alloy (OpenValue)](https://openvalue.blog/posts/2024/04/13/replace-promtail-with-alloy/) | Short, practical migration guide with Docker examples. | Supplementary |
| [Promtail to Alloy migration (AJ's Blog)](https://blog.ayjc.net/posts/promtail-to-alloy/) | Another community migration walkthrough, focused on Docker Compose environments. | Supplementary |
| [Complete monitoring with Alloy dashboards (Medium)](https://dhruv-mavani.medium.com/complete-monitoring-setup-with-grafana-alloy-custom-dashboards-for-storage-docker-logs-and-e2edc25e9da2) | Practical guide building custom dashboards for storage, Docker logs, and systemd services with Alloy. | Supplementary |
| [OTel Collector vs Grafana Alloy pipelines (Medium)](https://medium.com/@pankajhasija2109/demystifying-opentelemetry-collector-pipelines-standard-otel-vs-grafana-alloy-part-1-aba66277bc58) | Side-by-side comparison of how pipelines work in vanilla OTel Collector vs Alloy. | Supplementary |
| [Home lab monitoring with Grafana, Loki, Prometheus, and Alloy (XDA)](https://www.xda-developers.com/set-up-grafana-loki-prometheus-alloy-home-lab/) | End-to-end home lab setup guide. Good for learning the full stack. | Supplementary |

### Migration-Specific Forum Posts

| Link | What it covers | Priority |
|------|---------------|----------|
| [Promtail EOL announcement -- migration guide](https://community.grafana.com/t/promtail-end-of-life-eol-march-2026-how-to-migrate-to-grafana-alloy-for-existing-loki-server-deployments/159636) | Official forum announcement with migration instructions for self-hosted Loki deployments. | Essential |
| [How to migrate from Promtail to Alloy](https://community.grafana.com/t/how-to-migrate-from-promtail-end-of-life-to-alloy-for-grafana-loki/159635) | Community how-to guide posted alongside the EOL announcement. | Supplementary |
| [Migration from Agent to Alloy discussion](https://community.grafana.com/t/migration-from-agent-to-alloy/126695) | Community thread discussing real-world Agent-to-Alloy migration experiences. | Supplementary |
| [Best way to debug data flow through Alloy](https://community.grafana.com/t/best-way-to-debug-data-flow-through-alloy/123550) | Practical advice on debugging pipeline issues from community members and Grafana staff. | Supplementary |

## Conference Talks and Videos

### Grafana Alloy for Beginners (Video Series)

This is the single best video resource for learning Alloy from scratch. Produced by Grafana Labs, hosted by Lisa Jung and Mischa Thompson. Covers everything from "what is Alloy" through building real pipelines.

| Link | Episode | Priority |
|------|---------|----------|
| [Full playlist](https://www.youtube.com/playlist?list=PLDGkOdUX1UjoUmd6Z-lKgGaGzmZvYxRWs) | All episodes in order. Bookmark this. | Essential |
| [Series overview (Ep 1)](https://www.youtube.com/watch?v=KWWI0WONPVE) | What the series covers and how to follow along. | Essential |
| [What is Alloy and when to use it (Ep 2)](https://www.youtube.com/watch?v=bFyGd_Sr5W4) | Architecture and use cases. | Essential |
| [Configuration Language 101 (Ep 3)](https://www.youtube.com/watch?v=fN0uwuwm1Fo) | Hands-on introduction to the Alloy config syntax. | Essential |
| [Environment Setup (Ep 4)](https://www.youtube.com/watch?v=fZRwVwCvLAg) | Setting up a local dev environment. | Supplementary |
| [Infrastructure metrics pipeline (Ep 6)](https://www.youtube.com/watch?v=tT2r5gHFqzY) | Building a metrics pipeline from scratch. | Supplementary |
| [Application logs pipeline (Ep 11)](https://www.youtube.com/watch?v=EpJSBPlW-iA) | Building a log pipeline. | Supplementary |
| [Hands-on exercises (Ep 13)](https://www.youtube.com/watch?v=obUholL0E58) | Practice problems. | Supplementary |
| [Exercise solutions (Ep 14)](https://www.youtube.com/watch?v=qmwMGXx7FFE) | Walkthroughs of the solutions. | Supplementary |
| [Companion GitHub repo](https://github.com/grafana/Grafana-Alloy-for-Beginners) | Code and configs for following along with the series. | Essential |

### GrafanaCON and Other Talks

| Link | What it covers | Priority |
|------|---------------|----------|
| [Introducing Grafana Alloy -- GrafanaCON 2024](https://www.youtube.com/watch?v=d9zLeFuIFIk) | The official launch talk. Best overview of why Alloy exists and what it does differently. | Essential |
| [GrafanaCON 2024 Keynote](https://www.youtube.com/watch?v=L_GHahMOWEY) | Full keynote covering Grafana 11, Loki 3.0, and the Alloy announcement in context. | Supplementary |
| [How Grafana Alloy Works: Demo](https://www.youtube.com/watch?v=NrnLyDXpfq0) | Live demo showing Alloy in action -- good for visual learners who want to see the tool before reading docs. | Essential |
| [Grafana Alloy -- NEW collector replaces everything](https://www.youtube.com/watch?v=E654LPrkCjo) | Community-oriented video explaining how Alloy replaces the fragmented Agent/Promtail/OTel story. | Supplementary |
| [Send logs to Grafana Cloud using Alloy](https://www.youtube.com/watch?v=Xa3mCIdsno4) | Learning Journeys video: practical log pipeline to Grafana Cloud. | Supplementary |
| [Send OTel traces to Grafana Cloud using Alloy](https://www.youtube.com/watch?v=WpRD82cIB60) | Learning Journeys video: OTel traces pipeline. | Supplementary |
| [Alloy Community Call -- October 2024](https://www.youtube.com/watch?v=SLHn0FPHw7w) | Community call covering performance, OpenTelemetry, and log discussions. Shows the community pulse. | Supplementary |
| [Grafana Alloy YouTube playlist (all videos)](https://www.youtube.com/playlist?list=PLDGkOdUX1Ujo4nPEPvbeMayN8qilKkKF5) | Official Grafana playlist collecting all Alloy-related videos. | Essential |

## Community Configs and Example Repositories

| Link | What it is | Priority |
|------|-----------|----------|
| [grafana/alloy](https://github.com/grafana/alloy) | The main Alloy repository. Source code, issues, and the `example-config.alloy` file in the root. | Essential |
| [grafana/alloy-scenarios](https://github.com/grafana/alloy-scenarios) | 40+ self-contained, runnable scenarios with a full LGMT stack (Loki, Grafana, Mimir, Tempo) and pre-configured dashboards. Covers logs, traces, metrics, profiling, infrastructure monitoring, databases, Kubernetes, and the experimental OTel Engine. The single best repository for learning by example. | Essential |
| [grafana/alloy-modules](https://github.com/grafana/alloy-modules) | Reusable Alloy configuration modules that can be imported with `import.git`. Parameterized configs for common patterns. | Essential |
| [grafana/Grafana-Alloy-for-Beginners](https://github.com/grafana/Grafana-Alloy-for-Beginners) | Companion repo for the "Alloy for Beginners" video series. Working configs and exercises. | Essential |
| [grafana/alloy-operator](https://github.com/grafana/alloy-operator) | Kubernetes Operator that manages Alloy instances using the Alloy Helm chart as its base. | Supplementary |
| [Alloy Helm chart on Artifact Hub](https://artifacthub.io/packages/helm/grafana/alloy) | The Helm chart package listing with version history and values documentation. | Supplementary |
| [Docker Hub: grafana/alloy](https://hub.docker.com/r/grafana/alloy) | Official Docker image. Tags include `latest`, Windows variants, and `-boringcrypto` builds. | Supplementary |
