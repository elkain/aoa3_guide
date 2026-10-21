# AOA3 public guide

This repository is the public website at https://elkain.github.io/aoa3_guide/ .
Deploy from main, repository root. Keep .nojekyll. Use relative asset and data URLs.
Do not publish game package binaries, credentials, personal saves, or private analysis files.

## Every public update

- Read current main before editing; preserve changes from other conversations.
- Add a newest-first entry to releases.json describing only changes actually included in this deployment, in Korean.
- Increment the site version: patch for corrections/data updates; minor for new features/pages; major for incompatible changes.
- Use the actual release date in Asia/Seoul. Site version and game version are separate.
- Run python3 scripts/update-release.py to update the visible version, date, history, and asset version query strings.
- Run node --check app.js for JavaScript changes and validate modified JSON.
- Commit releases.json and generated index.html with the related content changes in the same commit.
- Confirm the GitHub Pages deployment result before claiming publication succeeded.
- Keep previous release entries. Do not claim unrelated or pending changes were shipped.
