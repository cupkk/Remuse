# Security Policy

## Supported scope

Security reports are accepted for the current `main` branch.

## Reporting a vulnerability

Please do not open public issues for vulnerabilities, leaked secrets, production data, user uploads, API keys, webhook URLs, or server credentials. Contact the maintainer through the GitHub profile or use GitHub's private vulnerability reporting flow if it is enabled for this repository.

When reporting, include:

- Affected route, service, component, or workflow
- Reproduction steps
- Expected and actual behavior
- Whether user data, generated assets, or credentials may be exposed

## Data and secret handling

Secrets must stay in environment variables or deployment-specific secret stores. Production SQLite files, uploads, backups, generated private assets, and local `.env` files must not be committed.
