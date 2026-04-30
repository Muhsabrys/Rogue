# ⚡ Rogue

**Rogue** is a local, self-hosted alternative to [Overleaf](https://www.overleaf.com/) — a browser-based LaTeX editor that runs entirely on your own machine. No account, no cloud, no internet required.

---

## Features

- 📝 **Syntax-highlighted editor** powered by [CodeMirror](https://codemirror.net/) with a LaTeX/TeX mode
- 📁 **Project management** — create, open and delete projects; each project holds one or more `.tex` files
- ▶ **One-click compilation** — runs `pdflatex` and shows the resulting PDF in-browser
- 📄 **Live PDF preview** — the compiled PDF appears in a side panel alongside the editor
- 📋 **Compilation log** — see the full `pdflatex` output when something goes wrong
- 💾 **Auto-save on compile** — the file is saved before compilation is triggered
- ⌨️ **Keyboard shortcut** — `Ctrl+S` / `Cmd+S` saves the current file

---

## Requirements

| Requirement | Details |
|---|---|
| [Node.js](https://nodejs.org/) ≥ 18 | Runs the local web server |
| [pdflatex](https://www.tug.org/texlive/) | Compiles `.tex` files to PDF |

### Installing pdflatex

**macOS**
```bash
brew install --cask mactex        # full TeX Live (~5 GB)
# or for a minimal install:
brew install basictex
```

**Ubuntu / Debian**
```bash
sudo apt-get install texlive-latex-base texlive-fonts-recommended
```

**Windows**
Install [MiKTeX](https://miktex.org/) or [TeX Live](https://www.tug.org/texlive/).

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Muhsabrys/Rogue.git
cd Rogue

# 2. Install Node dependencies
npm install

# 3. Start the server
npm start

# 4. Open in your browser
#    → http://localhost:3000
```

---

## Usage

1. Click **＋ New Project** to create a project. A starter `main.tex` file is added automatically.
2. Select the project in the left sidebar to open it.
3. Edit the LaTeX source in the editor.
4. Press **▶ Compile** (or `Ctrl+S` then **Compile**) to compile and view the PDF.
5. Switch between the **PDF Preview** and **Compile Log** tabs on the right panel.

---

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |

```bash
PORT=8080 npm start
```

---

## Project storage

Projects are stored locally under a `projects/` directory in the repository root. This directory is excluded from version control via `.gitignore`.

---

## License

[Apache-2.0](LICENSE)
