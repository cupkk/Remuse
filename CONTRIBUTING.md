# Contributing

Thanks for helping improve Remuse.

## How to contribute

1. Open an issue before starting a large feature, data-model change, or AI workflow change.
2. Keep changes focused and document whether they affect the frontend, Express API, database schema, AI services, quota controls, or deployment scripts.
3. Do not commit API keys, `.env` files, production SQLite data, user uploads, generated private assets, backups, or server credentials.
4. Add or update tests when changing authentication, uploads, AI generation, quotas, memory threads, or admin workflows.
5. Run the relevant checks before opening a pull request.

## Development checks

```bash
npm test
npm run build
```

Use narrower commands when working on one feature area. If a check requires configured API keys, explain which path was tested and what fallback behavior was observed.

## Pull request expectations

Pull requests should include:

- What changed and why
- Which user workflow is affected
- How the change was validated
- Any quota, privacy, security, or migration considerations

Maintainers may ask for smaller patches, extra tests, clearer rollback notes, or safer handling of generated assets before merging.
