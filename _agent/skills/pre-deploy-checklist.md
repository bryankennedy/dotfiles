---
name: pre-deploy-checklist
description: Run a structured pre-deployment review before shipping an app to production. Works through six gates — Security, Config, Observability, Resilience, Data, and Deploy — and produces a pass/fail report with action items.
---

You are acting as a production readiness reviewer. Work through each gate below sequentially. For each item, inspect the codebase, config files, CI pipeline, and any infrastructure definitions available in the current working directory.

At the end, produce a **Deployment Readiness Report** summarizing pass/fail per gate and a prioritized list of blockers vs. warnings.

---

## Gate 1: Security

- [ ] **Secrets scan**: No hardcoded secrets, API keys, tokens, or passwords in source code or committed config files. Check with `git log` and current diff.
- [ ] **Dependency vulnerabilities**: Run `bun audit` (or equivalent). Flag any critical/high severity findings as blockers.
- [ ] **Container image scan**: If a Dockerfile or image is present, note that it should be scanned with Trivy or Grype before deploy. Flag if no scan step exists in CI.
- [ ] **OWASP Top 10 surface check**: Review for obvious risks — SQL injection, XSS, insecure direct object references, broken auth, security misconfiguration.
- [ ] **TLS enforced**: All external endpoints use HTTPS. No plaintext HTTP allowed in production config.
- [ ] **Auth & authorization**: Authentication is required on all non-public endpoints. Authorization checks are present (not just authentication).
- [ ] **Supply chain**: Dependencies are pinned to exact versions (lockfile committed). No use of mutable tags like `latest` in Docker images.

---

## Gate 2: Config

- [ ] **No config in code**: All environment-specific values (URLs, credentials, feature flags, limits) come from environment variables — not hardcoded.
- [ ] **`.env.example` is current**: All required env vars are documented with descriptions. No undocumented vars are required at runtime.
- [ ] **Secrets via Secret Manager**: Production secrets are referenced from a secrets manager (e.g., Google Secret Manager, AWS Secrets Manager, Vault) — not passed as raw env var values in deployment manifests.
- [ ] **Environment parity**: Dev, staging, and production use the same code artifact. Differences are only in config/env vars.
- [ ] **Feature flags**: Any risky or incomplete features are behind a flag that is off by default in production.

---

## Gate 3: Observability

- [ ] **Structured logging**: Logs are emitted as JSON (or structured format) with consistent fields — at minimum: `timestamp`, `level`, `message`, `trace_id`.
- [ ] **Log levels used correctly**: `ERROR` for actionable failures, `WARN` for degraded state, `INFO` for key lifecycle events, `DEBUG` disabled in production.
- [ ] **Distributed tracing**: OpenTelemetry (or equivalent) is instrumented for inbound requests and outbound calls to dependencies.
- [ ] **Metrics exposed**: Key RED metrics (Rate, Errors, Duration) are emitted. A `/metrics` endpoint or equivalent exists if applicable.
- [ ] **Alerts configured**: At minimum, alerts exist for: error rate spike, latency p99 threshold, and service unavailability. Alerts link to a runbook.
- [ ] **No silent failures**: All error paths log at ERROR level with enough context to diagnose (request ID, user/tenant ID where applicable, stack trace).

---

## Gate 4: Resilience

- [ ] **Health check endpoints**: A `/health` or `/healthz` endpoint exists and returns 200 only when the service is truly ready to serve traffic. Liveness and readiness are separated if applicable.
- [ ] **Graceful shutdown**: The app handles `SIGTERM` — it stops accepting new requests, finishes in-flight work, then exits cleanly. Shutdown timeout is configured.
- [ ] **Retry logic with backoff**: Calls to external services (APIs, databases, queues) use exponential backoff with jitter. Retries are not applied to non-idempotent operations.
- [ ] **Circuit breaker / timeout**: All outbound calls have a timeout. Circuit breakers or fallbacks are in place for critical dependencies.
- [ ] **Resource limits set**: CPU and memory limits are defined in the deployment manifest (Cloud Run, K8s, etc.). No unbounded resource consumption.
- [ ] **Rollback procedure**: A documented, tested rollback path exists. The previous artifact version is known and can be deployed in under 10 minutes.

---

## Gate 5: Data

- [ ] **Migrations are safe**: Any database migrations are reviewed for:
  - Backwards compatibility (old code can run against new schema during rollout)
  - No locking operations on large tables without a maintenance window
  - Use of the expand/contract pattern for breaking changes
- [ ] **Migrations are reversible**: A down-migration or compensating action exists for each change.
- [ ] **Backups verified**: Backups exist AND have been tested for restore. Existence alone is not sufficient.
- [ ] **PII handling reviewed**: Any new PII fields are encrypted at rest, have a defined retention policy, and a deletion path exists (for GDPR/CCPA compliance).
- [ ] **Data at rest encrypted**: All storage (databases, object stores, disks) uses encryption at rest.

---

## Gate 6: Deploy

- [ ] **CI passes cleanly**: All tests pass on the exact commit being deployed. No skipped tests, no test suite bypasses.
- [ ] **Smoke tests exist**: A post-deploy smoke test (automated or scripted) verifies the critical user path is functional.
- [ ] **Canary or staged rollout**: For significant changes, a canary or progressive traffic split strategy is in place (even if manual).
- [ ] **Deployment manifest reviewed**: The production deployment config (Cloud Run yaml, K8s manifest, Terraform, etc.) has been reviewed for correctness — region, instance size, min/max instances, env vars, service account permissions.
- [ ] **Least-privilege IAM**: The service account or role used by the app has only the permissions it needs — no `owner`, `editor`, or wildcard policies.
- [ ] **Runbook is current**: A runbook or README exists that describes: how to deploy, how to roll back, how to check health, and who to page.

---

## Output: Deployment Readiness Report

After completing all gates, produce a report in this format:

```
## Deployment Readiness Report

**Commit / Version:** <identify the artifact>
**Reviewed:** <date>

### Gate Summary
| Gate           | Status  | Blockers | Warnings |
|----------------|---------|----------|----------|
| Security       | PASS/FAIL | n | n |
| Config         | PASS/FAIL | n | n |
| Observability  | PASS/FAIL | n | n |
| Resilience     | PASS/FAIL | n | n |
| Data           | PASS/FAIL | n | n |
| Deploy         | PASS/FAIL | n | n |

**Overall: READY / NOT READY**

### Blockers (must fix before deploy)
1. ...

### Warnings (should fix soon, deploy at your discretion)
1. ...

### Not Applicable
- List any items skipped with a brief reason (e.g., "No database — all Data gate items N/A")
```
