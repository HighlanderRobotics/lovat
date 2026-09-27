#!/usr/bin/env sh

# Prefer the exact nvm runtime from .nvmrc without requiring nvm to be loaded in
# the calling shell. Homebrew's versioned Node 22 is the fallback.
NVM_NODE_DIR="${NVM_DIR:-$HOME/.nvm}/versions/node/v$(cat "$SERVER_DIR/.nvmrc")/bin"
if [ -x "$NVM_NODE_DIR/node" ]; then
  PATH="$NVM_NODE_DIR:$PATH"
  export PATH
elif command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(`.`)[0]')" = "22" ]; then
  :
elif command -v brew >/dev/null 2>&1; then
  NODE_22_PREFIX=$(brew --prefix node@22 2>/dev/null || true)
  if [ -x "$NODE_22_PREFIX/bin/node" ]; then
    PATH="$NODE_22_PREFIX/bin:$PATH"
    export PATH
  fi
fi
