# Catalog

Catalog files pin the runtime versions and checksums that BAT is allowed to
install.

Generated Codex catalogs are named:

```text
runtimes.codex-<version>.json
```

BAT app releases should copy or embed the exact catalog they support instead of
fetching mutable catalog data at runtime.
