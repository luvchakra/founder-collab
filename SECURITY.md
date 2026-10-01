# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately -- **do not open a public issue.**

- Use GitHub's private vulnerability reporting ("Report a vulnerability" under this
  repository's Security tab), or
- email the address published at `/.well-known/security.txt` on the deployed app.

Include steps to reproduce, the affected URL/endpoint, and the impact you observed. We
aim to acknowledge reports within 3 business days and to ship a fix for confirmed
high/critical issues within 30 days. Please give us a reasonable window to fix the issue
before disclosing it publicly. Testing must not access, modify or delete other customers'
data, degrade service, or use social engineering.

## Scope of in-repo security controls

See [`docs/compliance/security.md`](docs/compliance/security.md) for the controls this
codebase implements (headers/CSP, MFA, RLS tenant isolation, webhook signature
verification, rate limiting, secret handling, dependency auditing) and the controls that
must be configured outside the repo (Supabase Auth settings, Vercel, GitHub branch
protection).
