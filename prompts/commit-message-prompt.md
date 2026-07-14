Generate a conventional commit message from this git diff. Output ONLY the commit message.

Format:
<type>(<scope>): <short summary>

<Optional body explaining the change. Separate from subject by a single blank line.>

Rules:

- Use imperative mood.
- Lowercase after the colon — e.g. "feat(scope): add" NOT "feat(scope): Add".
- Do not include any extraneous commentary or markers.

Example:
refactor(ai): migrate providers to SDKs

Replaces direct API/CLI calls for Copilot and Gemini with SDK integrations.
This simplifies code, improves maintainability, and adds dynamic model
fetching. Updates .gitignore for geeto binaries.
