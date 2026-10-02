# Releasing

A release is a version tag on `main`. Pushing the tag runs
`.github/workflows/release.yml`, which:

1. checks the tagged commit is on `main` and that CI passed for it (waiting if CI is still running);
2. builds the API and web images for `linux/amd64` and `linux/arm64`, each on a native runner, with the version baked in;
3. publishes them to `ghcr.io/chris-billingham/taskflow-api` and `taskflow-web`, tagged `1.2.0`, `1.2`, `1` and `latest`;
4. creates a GitHub release from the version's CHANGELOG section, with upgrade instructions.

Installs find the newest release through the GitHub API, so `make upgrade`
picks it up as soon as the release exists.

## Steps

1. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [1.2.0] - 2026-10-02` and add a fresh `## [Unreleased]` above it. Call out anything an admin must do before upgrading.
2. Commit, push, and let CI pass.
3. Tag and push:

   ```bash
   git tag -a v1.2.0 -m "Taskflow 1.2.0"
   git push origin v1.2.0
   ```

4. Watch the run: `gh run watch $(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')`.

Versions follow [semantic versioning](https://semver.org): a major version
for changes that need an admin's attention or break installed apps, a minor
version for features, a patch for fixes.

## Pre-releases

A tag with a suffix, such as `v1.3.0-rc.1`, publishes images tagged only with
that version and a GitHub pre-release. Installs don't pick it up unless asked:
`make upgrade version=1.3.0-rc.1`.

## Checking a change to the images

Run the workflow by hand (**Actions → Release → Run workflow**, or
`gh workflow run release.yml`). It builds every image for both architectures
and publishes nothing.

## Package visibility

The images carry the repository as their source, so GitHub links each package
to this public repository and publishes it as public; servers pull without
signing in. To check, an anonymous request for a manifest should answer 200:

```bash
tok=$(curl -s "https://ghcr.io/token?scope=repository:chris-billingham/taskflow-api:pull" | jq -r .token)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $tok" \
  -H "Accept: application/vnd.oci.image.index.v1+json" \
  https://ghcr.io/v2/chris-billingham/taskflow-api/manifests/latest
```

If it doesn't, open the package (**Profile → Packages**), choose **Package
settings → Change visibility**, and make it public.
