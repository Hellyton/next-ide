# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through
[GitHub's private vulnerability reporting](https://github.com/thiagolopes-dev/next-ide/security/advisories/new).

Include the version (shown at the bottom of the sidebar), what an attacker could do, and steps to
reproduce. You should get a first reply within a week.

## Scope

In scope: the next-ide app itself, meaning the Electron main process, the preload bridge, the
renderer, IPC handlers, file and Git access, the terminal, and the release build.

Out of scope: Claude Code, the Claude Agent SDK and the Anthropic API (report those to
[Anthropic](https://www.anthropic.com/responsible-disclosure-policy)), and anything that needs an
attacker who already runs code as your user.

## Design notes

- next-ide stores no credentials. Authentication is handled by the `claude` CLI it launches.
- The renderer runs with `contextIsolation`, `sandbox` and no Node integration. Production builds
  ship a strict Content Security Policy, and in-window navigation is blocked.
- File access from the window goes through the main process, which resolves real paths and
  checks them against the workspace folders you added.
- Tool permissions are decided by Claude Code's own modes and rules. next-ide only shows the
  prompt and passes your answer back.
