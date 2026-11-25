# Branching strategy and repository rules

The ZELO repository follows a lightweight **Git Flow** variant tuned for
a small team. This document is the source of truth for what the
protection rules on GitHub enforce — if you discover a mismatch, file
an issue, do not work around the protection.

---

## Long-lived branches

| Branch    | Purpose                                                                  | Direct push? | Default? |
| --------- | ------------------------------------------------------------------------ | ------------ | -------- |
| `develop` | Active integration branch — everything merges here first.                | No           | **Yes**  |
| `main`    | Production-ready snapshot. Only updated by promoting `develop` via PR.   | No           | No       |

> **`develop` is the default branch.** All feature branches start from
> `develop` and are merged back into `develop`. `main` is reserved for
> release-ready promotions reviewed in a separate PR.

---

## Short-lived branches

Branch off `develop`, never off `main`:

| Prefix       | Use for                                          | Example                          |
| ------------ | ------------------------------------------------ | -------------------------------- |
| `feat/`      | new user-facing functionality                    | `feat/emergency-eta`             |
| `fix/`       | bug fixes                                        | `fix/refresh-loop`               |
| `refactor/`  | internal restructuring, no behavior change       | `refactor/extract-asyncHandler`  |
| `docs/`      | documentation-only                               | `docs/branching`                 |
| `test/`      | adding or fixing tests                           | `test/payments-integration`      |
| `chore/`     | tooling, dependencies, build configuration       | `chore/upgrade-prisma`           |

A branch should solve one concern. If you find yourself needing two
unrelated subjects, open two PRs.

---

## Promotion flow

```
feat/* ──PR──▶ develop ──PR──▶ main
   ▲                              │
   └────────────  base for next feature  ───┘
```

1. Create your feature branch off `develop`.
2. Open a PR targeting `develop`. Get **at least one approval**, address
   review comments, resolve all conversations, then squash or rebase.
3. Once a milestone of work is stable in `develop`, open a separate PR
   `develop → main`. The same protection rules apply.

---

## Enforced rules

The following are enforced server-side on both `develop` and `main`:

- 🚫 **Direct pushes are blocked.** Everything merges via a pull request.
- ✅ **At least 1 approving review is required** before a PR can merge.
- 🔄 **Stale reviews are dismissed** automatically when new commits land.
- 💬 **All conversations must be resolved** before merging.
- 📏 **Linear history is required.** Use *Squash and merge* or
  *Rebase and merge* — no merge commits.
- 🚫 **Force-pushes are blocked.**
- 🚫 **Branch deletion is blocked** for `develop` and `main`.
- 🔁 **Last-push approval required** — re-request review after pushing
  new commits.

### Repository-level conveniences

- 🧹 **Head branches are auto-deleted on merge** (keeps the branch list tidy).
- ⚡ **Auto-merge is enabled** — queue a PR to merge as soon as checks pass.
- 🆙 **"Update branch" button is enabled** — bring your PR up to date
  without leaving GitHub.
- 🤝 **CODEOWNERS** auto-assigns reviewers (see `.github/CODEOWNERS`).

---

## When the rules push back

- **"At least 1 approving review is required"** — get a teammate to
  review. Self-approval is not allowed on GitHub.
- **"All conversations must be resolved"** — scroll the PR and click
  *Resolve conversation* on each unresolved thread.
- **"Required status check is expected"** — wait for CI to finish or
  fix what it surfaced; do not pressure an admin to override.
- **"Changes must be made through a pull request"** — open a PR. The
  rule exists so a second pair of eyes sees every change.

Admins (`enforce_admins=false`) have an escape hatch for genuine
emergencies. **Use it sparingly and document why in the commit body.**
