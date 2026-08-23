# Geeto

[![npm version](https://badge.fury.io/js/geeto.svg)](https://badge.fury.io/js/geeto)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[![Support Palestine](https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/banner-support.svg)](https://kitabisa.com/campaign/celenganwargapalestina)

[![Stand with Palestine](https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/StandWithPalestine.svg)](https://s.id/standwithpalestine)

**A guided Git workflow for consistent branches, commits, reviews, releases, and cleanup.**

Geeto turns working-tree changes into a clean, merged branch through one interactive CLI. It handles the repetitive Git steps, uses your preferred AI provider for suggestions, and keeps every action available as a standalone command when you need more control.

```text
Stage → Branch → Commit → Push → Merge → Cleanup
```

## Install

```bash
brew tap IDNCraft/geeto
brew trust --formula idncraft/geeto/geeto
brew install geeto
```

Or install from npm:

```bash
npm install -g geeto
```

Requires Git 2.0 or newer. npm installations also require Node.js 18 or newer. See [all installation methods](#installation) for Bun, APT, standalone binaries, and source builds.

## Quick Start

Run Geeto inside a Git repository:

```bash
geeto
```

On the first run, choose an AI provider and follow the guided workflow. Geeto previews generated branch names, commit messages, and release notes before applying them.

[![Geeto terminal demo](https://github.com/IDNCraft/geeto/raw/main/images/demo.png)](https://asciinema.org/a/788604)

[Watch the terminal demo](https://asciinema.org/a/788604)

## Contents

- [Why Geeto](#why-geeto)
- [Workflow](#workflow)
- [AI Providers](#ai-providers)
- [CLI Reference](#cli-reference)
- [Configuration](#configuration)
- [Installation](#installation)
- [Migrating from rust142](#migrating-from-rust142)
- [Development](#development)

---

## Why Geeto

- **Finish the whole branch lifecycle** — Move from local changes to a merged branch without manually chaining Git commands.
- **Keep humans in control** — Review generated names, messages, and release notes before Geeto writes or publishes anything.
- **Use the provider you already trust** — Choose Gemini, OpenRouter, Groq, OpenAI Codex, or OpenCode Zen.
- **Recover interrupted work** — Resume a saved checkpoint instead of repeating completed steps.
- **Stay in one interface** — Manage GitHub, GitLab, releases, Trello tasks, and everyday Git utilities from the terminal.

---

## Workflow

Running `geeto` starts six guided steps:

1. **Stage** — Review working-tree changes and choose what to stage.
2. **Branch** — Generate, edit, or manually enter a branch name.
3. **Commit** — Generate and approve a Conventional Commit message.
4. **Push** — Push the working branch to its remote.
5. **Merge** — Select a target branch and complete the merge.
6. **Cleanup** — Remove merged branches when they are no longer needed.

Geeto saves progress between steps. Use `geeto --resume` after an interruption or `geeto --fresh` to ignore the saved checkpoint. Every workflow step is also available as a standalone command.

## AI Providers

Geeto supports five provider integrations:

| Provider         | Authentication                                       | Runtime notes                                       |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------- |
| **Gemini**       | Google AI Studio API key                             | Project-local or global config                      |
| **OpenRouter**   | OpenRouter API key                                   | Project-local or global config                      |
| **Groq**         | Groq API key                                         | Project-local or global config                      |
| **OpenAI Codex** | OpenAI API key or Codex CLI OAuth with `codex login` | Generation runs with an isolated Geeto runtime home |
| **OpenCode Zen** | Free access or OpenCode Zen API key                  | Runs in an isolated Geeto runtime environment       |

Generated content remains reviewable before use. Change providers or model favorites from the interactive settings menu, or use `geeto --change-model` and `geeto --sync-models` directly.

---

## CLI Reference

### Workflow

| Command              | Description                     |
| -------------------- | ------------------------------- |
| `geeto`              | Full workflow (all 6 steps)     |
| `geeto -s, --stage`  | Stage files interactively       |
| `geeto -sa, -as`     | Stage all changes automatically |
| `geeto -c, --commit` | Create commit with AI message   |
| `geeto -b, --branch` | Create branch with AI name      |
| `geeto -p, --push`   | Push current branch to remote   |
| `geeto -m, --merge`  | Merge branches interactively    |

### Git Tools

| Command                    | Description                         |
| -------------------------- | ----------------------------------- |
| `geeto -cl, --cleanup`     | Clean up local & remote branches    |
| `geeto -sw, --switch`      | Switch branches with fuzzy search   |
| `geeto -cmp, --compare`    | Compare current branch with another |
| `geeto -cp, --cherry-pick` | Cherry-pick from another branch     |
| `geeto -lg, --log`         | View commit history with timeline   |
| `geeto -sh, --stash`       | Manage stashes interactively        |
| `geeto -am, --amend`       | Amend the last commit               |
| `geeto -rw, --reword`      | Edit past commit messages           |
| `geeto -u, --undo`         | Undo the last git action safely     |
| `geeto -rv, --revert`      | Revert the last commit (soft reset) |
| `geeto -al, --alias`       | Install shell aliases for geeto     |
| `geeto -sts, --stats`      | Repository statistics dashboard     |
| `geeto -st, --status`      | Pretty git status overview          |
| `geeto -pl, --pull`        | Pull from remote interactively      |
| `geeto -ft, --fetch`       | Fetch latest from remote            |
| `geeto -sm, --submodules`  | Manage Git submodules               |
| `geeto --abort`            | Abort in-progress operation         |
| `geeto --prune`            | Remove stale remote branches        |

### GitHub / GitLab

| Command                      | Description                                                             |
| ---------------------------- | ----------------------------------------------------------------------- |
| `geeto -pr, --pr`            | Create a Pull Request (GitHub) or Merge Request (GitLab)                |
| `geeto -rvp, --review-pr`    | Review and comment on a Pull Request or Merge Request with AI           |
| `geeto -rvi, --review-issue` | Review and comment on an Issue with AI                                  |
| `geeto -i, --issue`          | Create an Issue                                                         |
| `geeto -t, --tag`            | Manage semver releases, changelogs, tags, and GitHub or GitLab Releases |
| `geeto -rp, --repo`          | Update repository description, topics, and homepage                     |

### Trello

| Command                        | Description                 |
| ------------------------------ | --------------------------- |
| `geeto -tr, --trello`          | Open Trello menu            |
| `geeto -tg, --trello-generate` | Generate AI agent task list |

### Settings

| Command                    | Description                                     |
| -------------------------- | ----------------------------------------------- |
| `geeto --setup-gemini`     | Configure Gemini                                |
| `geeto --setup-openrouter` | Configure OpenRouter                            |
| `geeto --setup-groq`       | Configure Groq                                  |
| `geeto --setup-codex`      | Configure OpenAI Codex with an API key or OAuth |
| `geeto --setup-opencode`   | Configure free or API-key OpenCode Zen access   |
| `geeto --setup-github`     | Configure GitHub access                         |
| `geeto --setup-gitlab`     | Configure GitLab access and instance URL        |
| `geeto --setup-trello`     | Configure Trello access and board               |
| `geeto --change-model`     | Switch AI provider or model                     |
| `geeto --sync-models`      | Refresh available provider models               |
| `geeto --separator`        | Set the branch-name separator                   |

### Options

| Command                | Description                         |
| ---------------------- | ----------------------------------- |
| `geeto -f, --fresh`    | Start fresh (ignore checkpoint)     |
| `geeto -r, --resume`   | Resume from last checkpoint         |
| `geeto -dr, --dry-run` | Simulate commands without executing |
| `geeto -v, --version`  | Show version + update status        |
| `geeto -h, --help`     | Show help                           |

### Management

| Command               | Description                         |
| --------------------- | ----------------------------------- |
| `geeto -up, --update` | Update geeto to the latest version  |
| `geeto --where`       | Show installation path & method     |
| `geeto --uninstall`   | Uninstall geeto with auto-detection |

---

## Trello Integration

Turn selected Trello cards into individual Markdown task files:

```bash
geeto --trello-generate
```

Geeto preserves each card's description and checklists, then writes one file per card to `.geeto/tasks/`.

The project-level `.geeto/` directory is added to `.gitignore` automatically.

---

## Configuration

Gemini, OpenRouter, Groq, GitHub, and GitLab support project and user-level configuration. Project-local config takes priority:

| Location    | Scope                 | Priority                            |
| ----------- | --------------------- | ----------------------------------- |
| `.geeto/`   | Project-local         | **Higher** — overrides global       |
| `~/.geeto/` | Global (all projects) | Fallback when no local config found |

Use global config for shared credentials, then override individual projects when needed. OpenAI Codex and OpenCode Zen access stays user-level. Trello, branch strategy, checkpoints, and model favorites stay project-local.

Run a `--setup-*` command for direct setup, or open **Configure providers, integrations, and defaults** from the main menu. Geeto adds project-local `.geeto/` data to `.gitignore`; `~/.geeto/` remains outside the repository.

### Config files

| File                   | Created by                | Purpose                                                                   |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `gemini.toml`          | `--setup-gemini`          | Gemini API key                                                            |
| `openrouter.toml`      | `--setup-openrouter`      | OpenRouter API key                                                        |
| `groq.toml`            | `--setup-groq`            | Groq API key                                                              |
| `codex.toml`           | `--setup-codex`           | Global OpenAI Codex authentication state                                  |
| `opencode-zen.toml`    | `--setup-opencode`        | Global validated OpenCode Zen access state                                |
| `github.toml`          | `--setup-github`          | GitHub personal access token                                              |
| `gitlab.toml`          | `--setup-gitlab`          | GitLab token + instance URL                                               |
| `trello.toml`          | `--setup-trello`          | Project-local Trello API key, token, and board ID                         |
| `branch-strategy.toml` | `--separator` / first run | Branch separator char and last naming strategy (project-only, not global) |

### State & cache files

These are always project-local — not read from `~/.geeto/`.

| File                      | Created by                        | Purpose                                                                  |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `geeto-state.json`        | Automatically                     | Checkpoint state for workflow recovery (`-r, --resume`)                  |
| `openrouter-model.json`   | `--sync-models`                   | Persisted OpenRouter model list (filtered, text/code only)               |
| `gemini-model.json`       | `--sync-models`                   | Persisted Gemini model list                                              |
| `groq-model.json`         | `--sync-models`                   | Persisted Groq model list                                                |
| `codex-model.json`        | `--setup-codex` / `--sync-models` | Persisted OpenAI Codex model list                                        |
| `opencode-model.json`     | `--sync-models`                   | Persisted OpenCode Zen model favorites                                   |
| `last-ai-suggestion.json` | Every AI call                     | Last raw AI response — inspect when branch/commit suggestions look wrong |

---

## Installation

Choose the package that matches your environment:

### Homebrew

```bash
brew tap IDNCraft/geeto
brew trust --formula idncraft/geeto/geeto
brew install geeto
```

If the legacy tap is still installed, remove it before installing Geeto:

```bash
brew untap rust142/geeto
brew install idncraft/geeto/geeto
```

### npm or Bun

```bash
npm install -g geeto
# or
bun install -g geeto
```

### Debian or Ubuntu

Download the latest `.deb` package for `amd64` or `arm64` from [GitHub Releases](https://github.com/IDNCraft/geeto/releases/latest), then install it:

```bash
sudo dpkg -i geeto_<version>_<architecture>.deb
```

### Standalone Binary

Download the matching binary from [GitHub Releases](https://github.com/IDNCraft/geeto/releases/latest):

| Platform    | Binary              |
| ----------- | ------------------- |
| macOS x64   | `geeto-mac`         |
| macOS ARM64 | `geeto-mac-arm64`   |
| Linux x64   | `geeto-linux`       |
| Linux ARM64 | `geeto-linux-arm64` |
| Windows x64 | `geeto-windows.exe` |

On macOS or Linux, make the downloaded binary executable and move it into `PATH`:

```bash
chmod +x geeto-<platform>
sudo mv geeto-<platform> /usr/local/bin/geeto
```

### From Source

```bash
git clone https://github.com/IDNCraft/geeto.git
cd geeto
bun install
bun run build
bun link
```

### Requirements

| Installation method | Requirements                  |
| ------------------- | ----------------------------- |
| Homebrew / `.deb`   | Git 2.0 or newer              |
| Standalone binary   | Git 2.0 or newer              |
| npm                 | Node.js 18 or newer, Git 2.0+ |
| Bun / source        | Bun 1.0 or newer, Git 2.0+    |

## Migrating from rust142

Geeto moved from `rust142/geeto` to `IDNCraft/geeto`. Existing `.geeto/` project and user configuration remains compatible; do not delete it during migration.

### Homebrew

Remove the legacy formula and tap, then install from IDNCraft:

```bash
brew uninstall geeto
brew untap rust142/geeto
brew tap IDNCraft/geeto
brew trust --formula idncraft/geeto/geeto
brew install idncraft/geeto/geeto
```

### npm or Bun

The package name remains `geeto`, so reinstalling updates the existing global package:

```bash
npm install -g geeto@latest
# or
bun install -g geeto@latest
```

### Source checkout

Point the existing clone at the new repository before pulling updates:

```bash
git remote set-url origin git@github.com:IDNCraft/geeto.git
git remote -v
git pull
```

### Standalone binary or Debian package

Download the replacement binary or `.deb` from [IDNCraft releases](https://github.com/IDNCraft/geeto/releases/latest) and install it over the previous version.

Verify the migrated installation:

```bash
geeto --version
```

## Maintenance

Geeto detects the active installation method for updates, diagnostics, and removal:

```bash
geeto --update       # Install the latest available version
geeto --where        # Show binary, version, config path, and install method
geeto --uninstall    # Remove Geeto after confirmation
```

Use `geeto --version` to print the installed version and update status. During uninstall, Geeto asks separately whether it should remove configuration and shell aliases.

---

## Development

```bash
git clone https://github.com/IDNCraft/geeto.git
cd geeto
bun install

bun run dev            # Development mode (run from source)
bun test               # Documentation regression and unit tests
bun run format:check   # Prettier check for source files
bun run lint           # ESLint
bun run lint:md        # Markdown lint
bun run lint:yaml      # YAML lint
bun run typecheck      # TypeScript type checking
bun run build          # Production build
bun run check:fast     # Formatting, ESLint, Markdown, and YAML lint
bun run check:full     # Typecheck and production build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Contributing

1. Fork the repository
2. Create a branch: `dev#your-feature`
3. Make your changes
4. Run checks: `bun run check:fast && bun run check:full`
5. Submit a Pull Request to `main` branch

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## Support

If Geeto helps your workflow, consider supporting:

- ☕ [Buy me a coffee on Saweria](https://saweria.co/rust142)
- ⭐ Star this repository
- 🐛 [Report bugs or suggest features](https://github.com/IDNCraft/geeto/issues)

---

## License

MIT — see [LICENSE](LICENSE) for details.
