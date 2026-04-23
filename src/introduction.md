# Introduction

Grafana Alloy is a powerful observability pipeline with a steep initial learning curve.

The official documentation is thorough as a *reference*, but light as a *guide*. It tells you what every component does, but not how to wire them together without blowing your metrics budget. It documents every flag, but not the practical patterns that save you time in production.

This book is the manual we wish existed when we started.

## What this book is

- **Practical.** Real configs from production, not toy examples.
- **Opinionated.** When there are multiple ways to do something, we tell you which one works and why.
- **Battle-tested.** Every pattern here has been deployed across customer environments.

## What this book is not

- A replacement for the [official Alloy documentation](https://grafana.com/docs/alloy/latest/). Read that too.
- An exhaustive reference of every component. We focus on the components and patterns you'll actually use.
- Affiliated with or endorsed by Grafana Labs. This is a community resource.

## How to read this book

If you're **new to Alloy**, start with Chapter 1 (Config Language Survival Guide) and read sequentially. Each chapter builds on the previous one.

If you're **already running Alloy** and looking for specific answers, jump to the chapter you need. Each section is designed to stand alone as a reference.

If you're **managing a fleet**, pay special attention to the Fleet Management, Fleet Deployment, and Cost Optimization chapters — they'll save you real money.

## Conventions

Configuration examples use the Alloy config syntax unless noted otherwise. When a concept applies differently to Linux and Windows, both are covered explicitly.

Examples use placeholder values like `YOUR_INSTANCE` and `CHANGE_ME` for credentials. Never commit real credentials to config files — see the Credentials and Secrets chapter for the right way.
