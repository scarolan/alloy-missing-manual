# Config Language Survival Guide

Alloy uses its own configuration language. It looks like HCL (Terraform's language), and you will be tempted to treat it like HCL. Don't. It's a different language with different rules, and the false familiarity is the first trap.

This chapter covers what you need to know to read, write, and debug Alloy configs without pulling your hair out.

## What you'll learn

- The actual syntax rules (not what you'd guess from other tools)
- Every common gotcha and how to avoid it
- How component wiring really works
- How to decode Alloy's error messages

## The bottom line

The config language is the #1 stumbling block for new users. Spend 30 minutes here before writing your first config and you'll save hours of debugging.
