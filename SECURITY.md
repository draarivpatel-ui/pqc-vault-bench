# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/pqc-vault-bench/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| latest `main` | Supported |

Security fixes are applied to the latest state of the default branch.

## Scope

This policy covers the static PQC Vault Bench browser application, including post-quantum algorithm demonstrations, migration analysis, parameter matrices, compliance output and report rendering.

In scope:

- A cross-site scripting or HTML injection path through benchmark data, migration state, parameter values, compliance output, imports or reports.
- A validation or migration-analysis flaw that mislabels a supported state transition, risk magnitude or compliance result.
- A parameter-matrix or quantitative-analysis flaw that causes misleading safety output or hides invalid input.
- A report, JSON, CSV or caption export flaw that injects spreadsheet or markup control characters.
- A client-side persistence or share-state flaw that corrupts another analysis or executes attacker-controlled code.

Out of scope:

- Browser vulnerabilities, operating system compromise or physical access to the machine.
- Use of these demonstrations as production cryptography, key custody or wallet software, which is outside the documented purpose of the workbench.
- Damage caused by modified copies of the static application that do not come from this repository.

## Coordinated disclosure

- Acknowledgment: within 3 business days.
- Initial triage: within 14 calendar days.
- Fix or mitigation target: within 90 calendar days for confirmed reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.
