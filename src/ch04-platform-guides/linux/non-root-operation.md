# Linux: Non-Root Operation

## The Challenge

When running Alloy in Kubernetes or OpenShift, security best practices require running containers as non-root. But log collection requires reading files from host paths like `/var/log/pods/` -- directories that are restricted to root.

This creates a conflict: you need non-root execution for security compliance, but root-level file access for log collection.

This page covers the solution documented in the [Grafana PS best-practice guide for non-root log collection](https://github.com/grafana-ps/best-practice-guides/tree/main/guides/public/collectors/alloy/log-collection-non-root), which uses Linux capabilities, SELinux contexts, and OpenShift SCCs to resolve this conflict.

## Solution Architecture

The approach has three layers:

1. **Custom Docker image** with the `DAC_READ_SEARCH` capability set on the Alloy binary
2. **Kubernetes security context** that runs as non-root but allows the specific capability
3. **OpenShift SCC** (if applicable) that permits the above within OpenShift's stricter security model

## Step 1: Build the Custom Docker Image

The official Alloy image runs as UID 473 (a non-root user). The custom image adds one capability to the Alloy binary:

```dockerfile
FROM grafana/alloy:latest

# Install setcap tool, grant the capability, clean up
USER root
RUN apt-get update && apt-get install -y libcap2-bin \
    && setcap "cap_dac_read_search+eip" /bin/alloy \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Switch back to non-root
USER 473
```

Build and push:

```bash
docker build -t myrepo.example.com/grafana/alloy-custom:v1 .
docker push myrepo.example.com/grafana/alloy-custom:v1
```

### What DAC_READ_SEARCH Does

`DAC_READ_SEARCH` (also referred to as `DAC_OVERRIDE` in some contexts) grants a process the ability to:

- Read files regardless of file permission bits
- Traverse directories regardless of directory permission bits
- Search directories without execute permission

The `+eip` flags mean:

| Flag | Meaning |
|---|---|
| `+e` (Effective) | The capability is activated when the process runs |
| `+i` (Inheritable) | Child processes can inherit the capability |
| `+p` (Permitted) | The process is allowed to use the capability |

This is much narrower than running as root. The process can read any file, but cannot write to them, cannot change ownership, cannot bind to privileged ports, and cannot perform any other privileged operation.

## Step 2: Configure the Helm Chart

Update your Helm `values.yaml` to use the custom image and set the required security contexts:

```yaml
# Use the custom image
image:
  registry: "myrepo.example.com"
  repository: "grafana/alloy-custom"
  tag: v1

# Pod-level security context
global:
  podSecurityContext:
    supplementalGroups: [473]
    seLinuxOptions:
      type: container_logreader_t
      level: s0

# Container-level security context
alloy:
  securityContext:
    runAsUser: 473
    capabilities:
      add: ["DAC_READ_SEARCH"]
```

### What Each Setting Does

| Setting | Purpose |
|---|---|
| `runAsUser: 473` | Runs Alloy as the non-root user (UID 473, matching the Dockerfile) |
| `capabilities.add: ["DAC_READ_SEARCH"]` | Allows the container to use the file-reading capability set on the binary |
| `seLinuxOptions.type: container_logreader_t` | On SELinux-enabled hosts, allows the container to access log files while restricting it to log-reading operations only |
| `seLinuxOptions.level: s0` | Sets the MLS (Multi-Level Security) level for SELinux |
| `supplementalGroups: [473]` | Adds the Alloy group to the pod's supplemental groups |

### SELinux Considerations

On SELinux-enabled distributions (RHEL, CentOS, Fedora):

- The `container_logreader_t` SELinux type is specifically designed for log-reading processes
- Even with `DAC_READ_SEARCH`, SELinux can deny access if the context is wrong
- Check for SELinux denials in the host audit log if log collection fails:

```bash
ausearch -m AVC --start recent | grep alloy
```

## Step 3: OpenShift Security Context Constraints

OpenShift adds another security layer: SCCs control what security features a pod can use. The default SCCs do not allow `DAC_READ_SEARCH` or hostPath volumes.

Create a custom SCC (`alloy-logs-scc.yaml`):

```yaml
apiVersion: security.openshift.io/v1
kind: SecurityContextConstraints
metadata:
  name: alloy-logs-reader
allowPrivilegeEscalation: false
allowPrivilegedContainer: false
allowedCapabilities:
  - DAC_READ_SEARCH
runAsUser:
  type: MustRunAs
  uid: 473
seLinuxContext:
  type: MustRunAs
  seLinuxOptions:
    type: container_logreader_t
    level: s0
users:
- "system:serviceaccount:your-namespace:alloy-service-account"
volumes:
- hostPath
```

Apply it:

```bash
oc apply -f alloy-logs-scc.yaml
```

### SCC Security Controls

| Setting | What It Enforces |
|---|---|
| `allowPrivilegeEscalation: false` | Processes cannot gain more privileges than their parent |
| `allowPrivilegedContainer: false` | No full-root containers |
| `allowedCapabilities: [DAC_READ_SEARCH]` | Only this specific capability is permitted |
| `runAsUser.type: MustRunAs` with `uid: 473` | Container must run as UID 473 |
| `users` | Only the specified service account can use this SCC |
| `volumes: [hostPath]` | Allows mounting host log directories |

Make sure your Helm values include the service account:

```yaml
serviceAccount:
  create: true
  name: alloy-service-account
```

Replace `your-namespace` in the SCC with the actual deployment namespace.

### Verify the SCC Is Applied

```bash
oc get pod <alloy-pod-name> -o yaml | grep openshift.io/scc
```

Expected output:

```
openshift.io/scc: alloy-logs-reader
```

## Deploy with Helm

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install alloy grafana/alloy \
  --namespace monitoring \
  --create-namespace \
  --values values.yaml
```

Verify:

```bash
kubectl get pods -n monitoring
kubectl logs -n monitoring -l app=alloy
kubectl get pod -n monitoring -l app=alloy -o jsonpath='{.items[0].spec.securityContext}'
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Permission denied reading `/var/log/pods/` | Capability not applied | Verify the custom image was built correctly and the security context includes `DAC_READ_SEARCH` |
| SELinux denials in audit log | Wrong SELinux context | Verify `container_logreader_t` is set in the pod security context |
| SCC not applied (OpenShift) | Service account mismatch | Check that the SCC `users` field matches the actual service account name and namespace |
| Capability dropped at runtime | Pod Security Standards blocking | Check if a `PodSecurityPolicy` or namespace-level `PodSecurity` admission is stripping the capability |

## References

- [Grafana Docs: Run Alloy as non-root in Kubernetes](https://grafana.com/docs/alloy/latest/configure/nonroot/)
- [Grafana Docs: Deploy Alloy on OpenShift](https://grafana.com/docs/alloy/latest/set-up/install/openshift/)
- [Linux Capabilities Man Page](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [Red Hat: SELinux and Container Security](https://www.redhat.com/en/blog/how-selinux-separates-containers-using-multi-level-security)
