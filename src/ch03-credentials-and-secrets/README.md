# Credentials and Secrets

Alloy has no built-in secrets manager, no Vault integration, and no encrypted config support. By default, you're on your own.

The good news: there's a clean pattern that works. The bad news: you have to know about it, because the default examples in the docs use hardcoded placeholder values that people copy into production.

This chapter covers the `sys.env()` pattern and platform-specific setup for Linux and Windows.

## What you'll learn

- Why hardcoded credentials in config files are a problem
- The `sys.env()` pattern for reading environment variables
- How to set environment variables that Alloy can actually see (it's different on Linux vs Windows)
- How to verify your credentials are reaching the Alloy process
