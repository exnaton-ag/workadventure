# Exnaton fork of WorkAdventure

This repository is a fork of [workadventure/workadventure](https://github.com/workadventure/workadventure)
with a small set of Exnaton-specific customizations layered on top of an upstream
**release**. This document explains the branching model and how to backport our
customizations onto a new upstream release.

## What we customize

Our changes are **additive only** — no upstream source logic is modified. The complete
overlay is three logical commits:

| Area | Files |
|------|-------|
| **Companions** | `play/src/pusher/data/companions.json` + PNGs in `play/public/resources/customisation/companions/` |
| **Accessories & hats** | `play/src/pusher/data/woka.json` (adds `hat_santa_red`, `hat_brain`, `accessory_trophy`) + PNGs in `play/public/resources/customisation/character_hats/` and `.../character_accessories/` |
| **CI / build** | `.github/workflows/build-exnaton.yml` (builds `linux/arm64` and pushes to our ECR registry) |

## Branch model

| Branch | Role |
|--------|------|
| **`exnaton-overlay`** | **Canonical source of truth.** Contains *only* the overlay commits, based on a recent upstream commit. Everything else is cherry-picked from here. Never merge upstream into it. |
| **`release/vX.Y.Z-exnaton`** | A deployable branch: the upstream release tag `vX.Y.Z` + the `exnaton-overlay` commits cherry-picked on top. One per upstream release. |
| **`exnaton-master`** | Legacy branch that continuously merged `workadventure:master`. Kept for reference/local dev; not part of the release model. |

The `upstream` remote must point at the original project:

```bash
git remote add upstream https://github.com/workadventure/workadventure.git   # once
git fetch upstream --tags
```

## Backporting to a new upstream release

When a new upstream release (e.g. `v1.34.0`) is out, create a fresh release branch and
replay the overlay onto it.

```bash
# 1. Get the new release tag
git fetch upstream --tags
git rev-parse v1.34.0          # sanity: the tag resolves

# 2. Branch from the upstream release tag
git switch -c release/v1.34.0-exnaton v1.34.0

# 3. Replay the overlay. The range form picks up ALL overlay commits
#    (including this doc) regardless of how many there are.
#    <base> is the upstream commit exnaton-overlay is built on — see `git merge-base`:
BASE=$(git merge-base exnaton-overlay upstream/master)
git cherry-pick -x "$BASE"..exnaton-overlay

# 4. Resolve conflicts (see "Conflicts" below), then verify (see "Verification").

# 5. Push
git push -u origin release/v1.34.0-exnaton
```

`cherry-pick -x` uses git's 3-way merge, so any *new* companions/hats that upstream
added in the release are preserved alongside ours.

### Conflicts

Only `companions.json` and `woka.json` can conflict, and only where an entry we appended
lands next to an entry upstream appended. Resolution is mechanical — **keep both blocks**
and make sure the JSON stays valid. The two recurring gotchas (from past fixes):

- **No trailing comma** after the last array element.
- **Trailing newline** at end of file.

## Changing the customizations themselves

Edit on `exnaton-overlay` (not on a release branch), keeping the three-commit structure:

```bash
git switch exnaton-overlay
# ...make changes...
git add -A
git commit --amend --no-verify --no-edit    # fold into the relevant overlay commit
git push --force-with-lease origin exnaton-overlay
```

Then re-apply to the current release branch (drop the stale overlay commits and
re-cherry-pick, or amend the corresponding commit as above). Keep `exnaton-overlay`
rebased onto a recent upstream commit so future cherry-picks stay clean.

> **Note on hooks:** the repo's `pre-commit` hook runs `i18n:check`, which fails locally
> on Apple Silicon due to an esbuild platform mismatch in `node_modules` (a `linux/arm64`
> binary from the Docker/Colima dev stack). Because our overlay is data/asset/CI only,
> commit with `--no-verify`.

## CI / deployment (ECR)

`.github/workflows/build-exnaton.yml` builds the `play` image for `linux/arm64` and pushes
to our ECR registry:

```
458972843250.dkr.ecr.eu-central-1.amazonaws.com/workadventure-play
```

Tags: `<branch-slug>-latest` and an immutable `<branch-slug>-<timestamp>-<sha>`.

**Required GitHub Actions secrets** (repo → Settings → Secrets → Actions):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

The IAM principal needs ECR push permissions (`ecr:GetAuthorizationToken`,
`ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`,
`ecr:CompleteLayerUpload`, `ecr:PutImage`) on the `workadventure-play` repository in
`eu-central-1` (account `458972843250`). The ECR repository must already exist — the
workflow pushes but does not create it.

### Building & pushing the image locally

When you need to build and push a release image by hand (e.g. the CI workflow is not
wired for a given branch, or you want to test before releasing), replicate what the
workflow does. Run from the repo root, checked out on the release branch you want to
ship (e.g. `release/v1.33.0-exnaton`).

**Prerequisites**

- A running Docker engine. On Apple Silicon we use Colima — start it with enough RAM:
  the front build sets `NODE_OPTIONS=--max-old-space-size=16384` (16 GB heap), so give
  the VM headroom (`colima start --memory 16` or more) or the `play` build may OOM.
- AWS credentials with ECR push permission (see above). Authenticate Docker to ECR:
  ```bash
  aws ecr get-login-password --region eu-central-1 --profile <your-profile> \
    | docker login --username AWS --password-stdin 458972843250.dkr.ecr.eu-central-1.amazonaws.com
  ```

**Build** (native `linux/arm64` on Apple Silicon — no emulation; context is the repo
root, Dockerfile is `play/Dockerfile`, matching the CI):

```bash
IMG=458972843250.dkr.ecr.eu-central-1.amazonaws.com/workadventure-play:v1.33.0-exnaton
docker build --platform linux/arm64 -f play/Dockerfile -t "$IMG" .
```

The build is large (full workspace `npm ci` + Vite front build) and takes several
minutes; the resulting image is ~3.5 GB.

**Push:**

```bash
docker push "$IMG"
```

The final `docker push` line reports the pushed digest — that is the authoritative
confirmation. Optionally verify registry-side:

```bash
aws ecr describe-images --repository-name workadventure-play \
  --image-ids imageTag=v1.33.0-exnaton --region eu-central-1 --profile <your-profile>
```

> Use an immutable, release-specific tag (`v<version>-exnaton`) rather than `latest` so
> deployments are reproducible.

## Verification checklist

After building a release branch:

1. **JSON valid** — `node -e "JSON.parse(require('fs').readFileSync('play/src/pusher/data/companions.json','utf8'))"` (and `woka.json`).
2. **Asset URLs resolve** — every `resources/...` `url` in the two JSON files exists under `play/public/`.
3. **Diff is overlay-only** — `git diff vX.Y.Z..HEAD --stat` shows *only* the files in the table above.
4. **App smoke test** (optional) — run the stack (Colima needs ≥8 GiB RAM) and confirm the new companions + santa/brain hats + trophy accessory appear in the WOKA customization screen.
