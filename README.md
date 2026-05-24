# BAT Runtime Cache

Runtime artifact cache for Better Agent Terminal.

This repository stores release artifacts for BAT-managed runtimes. The BAT app
does not download `latest`; every app release pins exact runtime versions and
SHA-256 checksums in a catalog.

## Runtime Policy

- Runtime artifacts are built from exact upstream package versions.
- Every release asset must have a SHA-256 entry.
- Catalog files must include exact version, platform, URL, archive type, and
  checksum.
- BAT installs artifacts into app-data only after checksum and executable
  version verification pass.
- BAT may use a system PATH runtime without an exact version match. PATH checks
  should stay minimal and assume the user can manage their own install. PATH
  runtimes are never trusted by checksum and should be treated as user-managed
  overrides.
- Large runtime archives are stored in GitHub Releases, not in git history.

## Runtime Resolution Order

BAT should resolve runtimes in this order:

1. App-data managed runtime with catalog checksum and version verification.
2. Bundled fallback shipped inside the BAT app.
3. System PATH runtime, if the executable exists and can answer a minimal
   version command.
4. Missing runtime prompt.

PATH runtime support avoids unnecessary downloads when a user already has the
right Codex, Claude Code, or Node binary installed. BAT should still show the
detected version and `source=system` in diagnostics so runtime-related bugs can
be traced back to the actual executable in use.

The PATH smoke check should be intentionally shallow:

- `node --version` exits successfully.
- `codex --version` exits successfully.
- `claude --version` exits successfully.

Do not run interactive login, network, model list, or agent protocol checks for
PATH runtimes during setup. Those failures should surface naturally when the
user starts the related agent, with diagnostics showing the runtime source.

## Codex Runtime

Build Codex runtime artifacts:

```sh
pnpm run build:codex -- --version 0.133.0
```

Build a single platform for local verification:

```sh
pnpm run build:codex -- --version 0.133.0 --platform darwin-arm64
```

This writes:

```text
dist/codex/0.133.0/
  codex-0.133.0-darwin-arm64.tar.gz
  codex-0.133.0-darwin-x64.tar.gz
  codex-0.133.0-linux-arm64.tar.gz
  codex-0.133.0-linux-x64.tar.gz
  codex-0.133.0-win32-arm64.tar.gz
  codex-0.133.0-win32-x64.tar.gz
  SHASUMS256.txt
  runtimes.codex-0.133.0.json
```

Publish through the `Build Codex Runtime` GitHub workflow with `publish=true`.
The workflow creates a release tag like `codex-0.133.0`.

## Catalog Shape

See [catalog/runtimes.schema.json](catalog/runtimes.schema.json).
