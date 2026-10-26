# Repository Instructions

- Never include `codex` in branch names or pull request titles.
- Never merge a pull request into `main` unless the user explicitly asks the agent to perform the merge and then confirms when asked immediately before the merge. Requests to review, fix, prepare, finish, or get a pull request ready do not count as merge authorization. Once the pull request is ready, report its status and ask for confirmation; merge only after a clear follow-up confirmation.
- For existing/open pull requests, do not amend, squash, rebase-rewrite, or force-push follow-up changes. Make new commits and push normally unless explicitly asked to rewrite history.
- Do not commit local build artifacts such as `dist/`, `build/`, or generated wheel/sdist files.
- Never commit user recordings (`server/voices/`), model weights, or the macOS AppleDouble (`._*`) files — they are git-ignored; keep it that way.
- The Apache-2.0 `LICENSE` (with the original copyright notice) must stay in the repo; the README carries the upstream credit.
