#!/usr/bin/env bash
# 🧈 Beurre — One-line automated installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/INDAR-Beurre/beurre/main/install.sh | bash

set -e

# Butter ANSI Colors
GOLD="\033[38;2;250;204;21m"
CREAM="\033[38;2;254;249;195m"
AMBER="\033[38;2;245;158;11m"
GREEN="\033[38;2;74;222;128m"
RED="\033[38;2;248;113;113m"
DIM="\033[2m"
BOLD="\033[1m"
RESET="\033[0m"

echo -e ""
echo -e "${GOLD}${BOLD}  🧈  B E U R R E${RESET} ${DIM}— L'Agent Fondant & Autonome${RESET}"
echo -e "${DIM}     Minimalist Agentic CLI for Model Aggregator & Relay${RESET}"
echo -e ""

# 1. Check OS
OS="$(uname -s)"
case "${OS}" in
  Linux*)   PLATFORM="linux";;
  Darwin*)  PLATFORM="darwin";;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows";;
  *)        PLATFORM="unknown";;
esac

echo -e "  ${DIM}•${RESET} Detected platform: ${CREAM}${PLATFORM} (${OS})${RESET}"

# 2. Check / Install Bun
if command -v bun >/dev/null 2>&1; then
  BUN_VERSION="$(bun --version)"
  echo -e "  ${GREEN}✔${RESET} Bun is already installed: ${CREAM}v${BUN_VERSION}${RESET}"
else
  echo -e "  ${AMBER}⚡${RESET} Bun not found. Installing official Bun runtime..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- https://bun.sh/install | bash
  else
    echo -e "  ${RED}✖ Error: curl or wget is required to install Bun.${RESET}"
    exit 1
  fi

  # Add Bun to current PATH
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"

  if ! command -v bun >/dev/null 2>&1; then
    echo -e "  ${RED}✖ Error: Failed to initialize Bun in PATH.${RESET}"
    exit 1
  fi
  echo -e "  ${GREEN}✔${RESET} Bun successfully installed: ${CREAM}v$(bun --version)${RESET}"
fi

# 3. Install Beurre globally via Bun
echo -e "  ${AMBER}⚡${RESET} Installing Beurre globally..."
BUN_BIN="${HOME}/.bun/bin"
mkdir -p "${BUN_BIN}"

# Detect if running in an authenticated GitHub environment or public
if [ -n "${GITHUB_TOKEN}" ]; then
  bun add -g "git+https://${GITHUB_TOKEN}@github.com/INDAR-Beurre/beurre.git"
elif [ -n "${GH_TOKEN}" ]; then
  bun add -g "git+https://${GH_TOKEN}@github.com/INDAR-Beurre/beurre.git"
elif command -v gh >/dev/null 2>&1 && gh auth token >/dev/null 2>&1; then
  TOKEN="$(gh auth token)"
  bun add -g "git+https://${TOKEN}@github.com/INDAR-Beurre/beurre.git"
else
  bun add -g "github:INDAR-Beurre/beurre"
fi

# 4. Ensure ~/.bun/bin is in PATH for future shells
SHELL_CONFIG=""
if [ -n "${ZSH_VERSION}" ] || [ -n "${ZDOTDIR}" ] || [ -f "${HOME}/.zshrc" ]; then
  SHELL_CONFIG="${HOME}/.zshrc"
elif [ -f "${HOME}/.bashrc" ]; then
  SHELL_CONFIG="${HOME}/.bashrc"
elif [ -f "${HOME}/.profile" ]; then
  SHELL_CONFIG="${HOME}/.profile"
fi

if [ -n "${SHELL_CONFIG}" ]; then
  if ! grep -q 'BUN_INSTALL' "${SHELL_CONFIG}" 2>/dev/null && ! grep -q '.bun/bin' "${SHELL_CONFIG}" 2>/dev/null; then
    echo -e "  ${DIM}•${RESET} Adding ~/.bun/bin to ${SHELL_CONFIG}..."
    echo -e '\n# Bun' >> "${SHELL_CONFIG}"
    echo -e 'export BUN_INSTALL="$HOME/.bun"' >> "${SHELL_CONFIG}"
    echo -e 'export PATH="$BUN_INSTALL/bin:$PATH"' >> "${SHELL_CONFIG}"
  fi
fi

# 5. Verify installation
BEURRE_EXEC="${BUN_BIN}/beurre"
if [ ! -f "${BEURRE_EXEC}" ] && command -v beurre >/dev/null 2>&1; then
  BEURRE_EXEC="$(command -v beurre)"
fi

if [ -f "${BEURRE_EXEC}" ] || command -v beurre >/dev/null 2>&1; then
  echo -e ""
  echo -e "${GOLD}${BOLD}  ✨ Beurre is ready to melt!${RESET}"
  echo -e "${DIM}  ────────────────────────────────────────────────────────${RESET}"
  echo -e "  Launch the interactive agentic harness:"
  echo -e "    ${GOLD}${BOLD}beurre${RESET}"
  echo -e ""
  echo -e "  Run a one-shot prompt:"
  echo -e "    ${CREAM}beurre \"Inspect repository and summarize files\"${RESET}"
  echo -e ""
  echo -e "  Inspect live relay models:"
  echo -e "    ${CREAM}beurre --models${RESET}"
  echo -e "${DIM}  ────────────────────────────────────────────────────────${RESET}"
  echo -e ""
else
  echo -e "  ${RED}✖ Installation finished, but 'beurre' was not found in ${BUN_BIN}.${RESET}"
  echo -e "    Make sure ${BUN_BIN} is in your PATH."
fi
