# AGENTS

## Env Config

Generated/modified env config → real local val in `.env` + safe placeholder in `.env.example`.
Secret/credential → never `.env.example`, source, docs.

## Git

After vibecode:

- Commit title → Conventional Commit: `<type>(<scope>): <imperative summary>`.
- Commit body → detailed explanation of what changed, why it changed, and the main impact; separated from title by one blank line.
- Branch → `dev#<lowercase-kebab-context>`, max 3 hyphens after `#`. Example: `dev#hello-world-foryou`.
- Final res → title + body + branch.

## Engineering Loop

All provider-backed tools/workflows → support loop:

`prompt scan` → missing/ambig/explicit choice? `vscode_askQuestions` → execute → validate → recommend.

- Ask feature → support freeform/options/multi-select, provider-independent.
- User answer → active provider workflow.
- Unclear/destructive risk → ask, never guess.
- Secret (password/token/API key) → terminal only; never ask feature.
- Useful follow-up → `Next Recommended Prompt` + highest-value action + prereq/blocker + 1 ready-to-copy prompt.
- Self-contained done → `No follow-up needed`.
- No filler/invented work.
