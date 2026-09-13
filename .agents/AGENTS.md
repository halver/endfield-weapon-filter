# Project Rules & Guidelines

- **Git Branch Scoping**: Do NOT automatically push or merge changes into the `main` branch. Always perform work, commits, and pushes on the active working version branch (e.g., `1.0.4`). Only merge or push to `main` when explicitly commanded by the user.

- **Automatic Version Bump on Branch Creation**:
  Whenever a new version branch (e.g. `1.0.5`) is created or requested by the user:
  1. `app/build.gradle.kts` must be automatically updated with the corresponding `versionCode` (e.g. `5`) and `versionName` (e.g. `"1.0.5"`).
  2. `update.json` must be automatically updated with `latest_version_code`, `latest_version_name`, and the target Release `apk_url`.
  3. These build and version configuration updates must be committed and pushed along with the new branch creation.
