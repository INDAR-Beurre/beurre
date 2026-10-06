# 🧈 Contributing to Beurre

Thank you for your interest in contributing to **Beurre**! We welcome bug reports, design ideas, code contributions, and documentation improvements.

---

## 🛠️ Development Setup

Beurre is built with [Bun](https://bun.sh) and TypeScript.

### 1. Prerequisites
- **Bun** (v1.0.0 or later): `curl -fsSL https://bun.sh/install | bash`
- Git

### 2. Clone & Install
```bash
git clone https://github.com/INDAR-Beurre/beurre.git
cd beurre
bun install
```

### 3. Run Locally
```bash
# Start interactive REPL
bun run start

# Or link globally for local testing
bun run link
beurre
```

### 4. Run Test Suite
Beurre maintains strict terminal width contracts, UI bounds, and robustness guarantees:
```bash
bun test
```
*All PRs must pass the 878+ unit and integration test suite.*

---

## 🧈 Codebase Architecture & Guidelines

Before making changes, please review [`AGENTS.md`](./AGENTS.md):
- **Aesthetic Philosophy**: Clean Butter Yellow palette (Gold `#FACC15`, Cream `#FEF9C3`, Amber `#F59E0B`).
- **Terminal Width Contracts**: Every line drawn to `stdout` must be bounded by `process.stdout.columns` using `truncate()` and `stringWidth()`. Never allow raw string slicing on ANSI escape sequences.
- **Protocol**: If adding new slash commands, document them in `src/predictive.ts`, `src/repl.ts`, and update test expectations.
- **Changelog**: Append an entry to the `AGENTS.md` living changelog for significant features or fixes.

---

## 🚀 Submitting a Pull Request

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. Commit your changes with clear, semantic commit messages:
   ```bash
   git commit -m "feat(repl): add interactive status drawer"
   ```
3. Push to your fork and submit a Pull Request to `main`.
4. Ensure the GitHub Actions CI pipeline passes cleanly.

---

## 📄 License
By contributing to Beurre, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
