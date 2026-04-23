# Fleet Deployment

Installing Alloy on a handful of servers is straightforward. Rolling it out across hundreds or thousands of Linux and Windows VMs is a different problem entirely.

This chapter covers deployment automation for real fleets: Ansible for Linux, SCCM/MECM and Group Policy for Windows, and the principles that apply regardless of tooling.

## What you'll learn

- Deployment strategy: what to automate and in what order
- Ansible playbooks for Linux fleet deployment
- SCCM/MECM packages for Windows fleet deployment
- GPO-based deployment for Windows domains
- Other automation tools (Puppet, Chef, Salt, Terraform, etc.)
- Validation and rollback strategies
