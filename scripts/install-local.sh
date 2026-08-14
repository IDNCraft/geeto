#!/usr/bin/env bash
# Build geeto binary and install to /usr/local/bin
# Usage: bun run install:local

set -euo pipefail

INSTALL_DIR="/usr/local/bin"
BIN_NAME="geeto"

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

# Prefer Homebrew bin if it exists and already has geeto
BREW_BIN="/opt/homebrew/bin"
if [ -f "$BREW_BIN/$BIN_NAME" ]; then
  INSTALL_DIR="$BREW_BIN"
fi

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) TARGET="bun-darwin-arm64" ;;
      *)     TARGET="bun-darwin-x64" ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      aarch64|arm64) TARGET="bun-linux-arm64" ;;
      *)             TARGET="bun-linux-x64" ;;
    esac
    ;;
  *)
    echo "❌ Unsupported OS: $OS (only macOS and Linux supported)"
    exit 1
    ;;
esac

echo "⚡ Building geeto..."
echo "   Platform: $OS $ARCH → $TARGET"
echo ""

# Step 1: TypeScript compile
echo "📦 Compiling TypeScript..."
bun run build

# Step 2: Build native binary
echo "🔨 Building binary (target: $TARGET)..."
bun build --compile --minify --sourcemap "lib/index.js" --target="$TARGET" --outfile "$BIN_NAME"

# Keep the OpenCode Zen runtime outside the compiled binary.
OPENCODE_RUNTIME_DIR="$HOME/.geeto/opencode-zen/bin"
OPENCODE_SOURCE_BINARY="node_modules/opencode-ai/bin/opencode.exe"
if [ -f "$OPENCODE_SOURCE_BINARY" ]; then
  mkdir -p "$OPENCODE_RUNTIME_DIR"
  cp "$OPENCODE_SOURCE_BINARY" "$OPENCODE_RUNTIME_DIR/opencode"
  chmod +x "$OPENCODE_RUNTIME_DIR/opencode"
  "$OPENCODE_RUNTIME_DIR/opencode" --version >/dev/null 2>&1 || rm -f "$OPENCODE_RUNTIME_DIR/opencode"
fi

CODEX_TARGET_TRIPLE=""
CODEX_PACKAGE=""
CODEX_BINARY_NAME="codex"
case "$OS:$ARCH" in
  Linux:x86_64) CODEX_PACKAGE="@openai/codex-linux-x64"; CODEX_TARGET_TRIPLE="x86_64-unknown-linux-musl" ;;
  Linux:aarch64|Linux:arm64) CODEX_PACKAGE="@openai/codex-linux-arm64"; CODEX_TARGET_TRIPLE="aarch64-unknown-linux-musl" ;;
  Darwin:x86_64) CODEX_PACKAGE="@openai/codex-darwin-x64"; CODEX_TARGET_TRIPLE="x86_64-apple-darwin" ;;
  Darwin:arm64) CODEX_PACKAGE="@openai/codex-darwin-arm64"; CODEX_TARGET_TRIPLE="aarch64-apple-darwin" ;;
esac
if [ -n "$CODEX_TARGET_TRIPLE" ]; then
  CODEX_SOURCE_VENDOR="node_modules/$CODEX_PACKAGE/vendor/$CODEX_TARGET_TRIPLE"
  if [ ! -f "$CODEX_SOURCE_VENDOR/codex-package.json" ]; then
    CODEX_SOURCE_VENDOR="node_modules/@openai/codex/node_modules/$CODEX_PACKAGE/vendor/$CODEX_TARGET_TRIPLE"
  fi
  CODEX_RUNTIME_VENDOR="$HOME/.geeto/codex-runtime/vendor/$CODEX_TARGET_TRIPLE"
  if [ -f "$CODEX_SOURCE_VENDOR/codex-package.json" ]; then
    mkdir -p "$CODEX_RUNTIME_VENDOR"
    cp -R "$CODEX_SOURCE_VENDOR/." "$CODEX_RUNTIME_VENDOR/"
    chmod +x "$CODEX_RUNTIME_VENDOR/bin/$CODEX_BINARY_NAME"
    "$CODEX_RUNTIME_VENDOR/bin/$CODEX_BINARY_NAME" --version >/dev/null 2>&1 || rm -rf "$CODEX_RUNTIME_VENDOR"
  fi
fi

# Step 3: Install to /usr/local/bin
echo ""
if [ -f "$INSTALL_DIR/$BIN_NAME" ]; then
  echo "♻️  Replacing existing $INSTALL_DIR/$BIN_NAME"
else
  echo "📥 Installing to $INSTALL_DIR/$BIN_NAME"
fi

# Use sudo if needed
if [ -w "$INSTALL_DIR" ]; then
  cp -f "$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
  chmod +x "$INSTALL_DIR/$BIN_NAME"
else
  sudo cp -f "$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
  sudo chmod +x "$INSTALL_DIR/$BIN_NAME"
fi

# Ad-hoc codesign for macOS (prevents "killed" on launch)
if [ "$OS" = "Darwin" ]; then
  codesign --force --sign - "$INSTALL_DIR/$BIN_NAME" 2>/dev/null || true
fi

# Cleanup local binary
rm -f "$BIN_NAME"

echo ""
echo "✅ geeto installed at $INSTALL_DIR/$BIN_NAME"
echo "   Run: geeto --version"
