# Agent rules for cromatica

Several agents work in this repo at the same time. Read README.md (Development) for commands.

## Where things live

- `docs/ROADMAP.md` is the plan, `docs/DECISIONS.md` holds the decisions (`D<n>`, newest last). Record a new decision there instead of in code comments or the PR alone.
- Open work is tracked in GitHub Issues and the project board <https://github.com/users/zepocas/projects/3>. Check `gh issue list` before starting, reference the issue in the PR (`fixes #<n>`), and ask before creating or closing issues.
- Keep users' stored data minimal: anything saved in the browser (favourites, autosave) is local, small and needs no account.

## Rendering invariants

- A pixel depends only on the design and its own position (D2, D4). No state between frames or tiles, no neighbour reads outside the neighbour-sampling stage (D46).
- Tiled, worker and single-pass renders must be byte-identical, and a finish at 0 must be bit-identical to off.
- A shader change needs its CPU mirror and a golden test, matching within the existing tolerance.

## Conventions

- Conventional Commits. All changes go through a PR; never push to `main`.
- Comments explain why (conventions, math, invariants), not what the code does or how it got here. The owner finds the current amount excessive.
- New panel controls follow the panel style in README.md (Development) and go behind "+ more" unless they are core.

## One worktree per agent

- `~/code/cromatica` is the user's checkout. It stays on `main` and its dev server runs on port 5173. Never switch its branch, commit in it, or edit tracked files there.
- Do your work in your own worktree, a sibling folder named after the task:
  ```sh
  git -C ~/code/cromatica worktree add ../cromatica-<task> -b <branch> main
  ln -s ../cromatica/node_modules ~/code/cromatica-<task>/node_modules
  ```
- Pick a free port of your own (5174 and up; check with `lsof -iTCP:<port> -sTCP:LISTEN`) and use it for the dev server and the browser tests, which otherwise reuse the server on 5173 and test the wrong checkout:
  ```sh
  npm run dev -- --port <port>
  PORT=<port> npx playwright test
  ```
- After the user merges your branch, remove the worktree: `git worktree remove ../cromatica-<task>`.

## Shared files

- Before committing, check `git branch --show-current` and stage only your own files or hunks. Never `git add -A`, `git add docs` or a bare `git stash`.
- Leave other agents' untracked files (prototypes, `docs/HANDOVER.md`) alone.
