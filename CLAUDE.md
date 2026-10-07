# Agent rules for cromatica

Several agents work in this repo at the same time. Read README.md (Development) for commands.

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
