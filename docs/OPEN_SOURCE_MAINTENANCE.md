# Open Source Maintenance

This document summarizes the public maintenance model for `Remuse`.

## Project scope

`Remuse` is a full-stack AI digital regeneration museum. It connects old-object photo upload, AI recognition, story drafting, digital archive creation, generated stickers, emoji packs, perler patterns, transformation guides, and memory-based chat into one workflow. The repository includes the React/TypeScript frontend, Express API, SQLite schema, AI orchestration, quota tracking, admin tools, tests, and deployment scripts.

The repository is intended to be useful for:

- developers building AI-assisted archival, memory, or creative-reuse tools
- maintainers studying quota-controlled AI workflows with uploads and generated assets
- contributors improving full-stack TypeScript app structure, deployment, and operations

## Maintainer responsibilities

The primary maintainer is responsible for:

- reviewing changes to user-facing workflows, authentication, uploads, AI routes, quotas, memory threads, and admin tooling
- triaging issues about generated-content quality, rate limits, upload handling, deployment, and data migrations
- keeping API keys, production databases, user uploads, backups, and server credentials out of version control
- documenting quota policies, fallback behavior, deployment steps, and privacy boundaries
- cutting releases when the public baseline, production workflow, or data model changes materially

## Current maintenance priorities

1. Keep the deployed app and public repository aligned.
2. Strengthen tests around authentication, uploads, AI generation, quotas, and memory workflows.
3. Document model/provider configuration and safe fallback behavior without exposing keys.
4. Add small issues for UI polish, admin tooling, generated asset quality, and deployment reliability.
5. Maintain clear separation between source code, generated assets, production data, and backups.

## API-credit use boundary

If external AI/API credits are used, they should support Remuse development and validation: testing AI scanning, content generation, memory chat, fallback behavior, quota controls, and issue triage. They should not be resold, used for unrelated projects, or exposed through a public proxy.
