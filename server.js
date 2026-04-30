'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3000;

const PROJECTS_DIR = path.join(__dirname, 'projects');
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Resolve a project directory safely; throws if outside PROJECTS_DIR. */
function projectDir(projectId) {
  if (!projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error('Invalid project id');
  }
  const dir = path.resolve(PROJECTS_DIR, projectId);
  if (!dir.startsWith(PROJECTS_DIR + path.sep) && dir !== PROJECTS_DIR) {
    throw new Error('Path traversal detected');
  }
  return dir;
}

/** Resolve a file path inside a project safely. */
function projectFile(projectId, filename) {
  if (!filename || !/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    throw new Error('Invalid filename');
  }
  const dir = projectDir(projectId);
  const file = path.resolve(dir, filename);
  if (!file.startsWith(dir + path.sep)) {
    throw new Error('Path traversal detected');
  }
  return file;
}

const ALLOWED_EXTENSIONS = new Set(['.tex', '.bib', '.cls', '.sty', '.txt', '.md']);

function assertAllowedExtension(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File extension "${ext}" is not allowed`);
  }
}

const DEFAULT_TEX = `\\documentclass{article}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{hyperref}

\\title{My First Document}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Welcome to \\textbf{Rogue} – your local LaTeX editor.

Edit this file, press \\textit{Compile} and see the PDF update on the right.

\\section{Mathematics}
Here is a famous identity:
\\[
  e^{i\\pi} + 1 = 0
\\]

\\end{document}
`;

// ─── API Routes ──────────────────────────────────────────────────────────────

// GET /api/projects  – list all projects
app.get('/api/projects', (req, res) => {
  try {
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projects = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const metaPath = path.join(PROJECTS_DIR, e.name, '.rogue.json');
        let name = e.name;
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          name = meta.name || e.name;
        } catch (_) { /* ignore */ }
        return { id: e.name, name };
      });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects  – create a new project
app.post('/api/projects', (req, res) => {
  try {
    const { name = 'Untitled Project' } = req.body || {};
    const slug = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'project';
    const id = `${slug}-${Date.now()}`;
    const dir = path.join(PROJECTS_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'main.tex'), DEFAULT_TEX, 'utf8');
    fs.writeFileSync(path.join(dir, '.rogue.json'), JSON.stringify({ name }), 'utf8');
    res.status(201).json({ id, name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/projects/:id  – delete a project
app.delete('/api/projects/:id', (req, res) => {
  try {
    const dir = projectDir(req.params.id);
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/projects/:id/files  – list .tex and related files in a project
app.get('/api/projects/:id/files', (req, res) => {
  try {
    const dir = projectDir(req.params.id);
    const entries = fs.readdirSync(dir);
    const files = entries.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ALLOWED_EXTENSIONS.has(ext);
    });
    res.json(files);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/projects/:id/files/:filename  – read a file
app.get('/api/projects/:id/files/:filename', (req, res) => {
  try {
    const file = projectFile(req.params.id, req.params.filename);
    assertAllowedExtension(req.params.filename);
    const content = fs.readFileSync(file, 'utf8');
    res.json({ content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/projects/:id/files/:filename  – create or overwrite a file
app.put('/api/projects/:id/files/:filename', (req, res) => {
  try {
    const file = projectFile(req.params.id, req.params.filename);
    assertAllowedExtension(req.params.filename);
    const { content = '' } = req.body || {};
    fs.writeFileSync(file, content, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/files/:filename  – delete a file
app.delete('/api/projects/:id/files/:filename', (req, res) => {
  try {
    const file = projectFile(req.params.id, req.params.filename);
    assertAllowedExtension(req.params.filename);
    fs.unlinkSync(file);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/projects/:id/compile  – compile main.tex → PDF using pdflatex
app.post('/api/projects/:id/compile', async (req, res) => {
  try {
    const dir = projectDir(req.params.id);
    const { filename = 'main.tex', content } = req.body || {};

    // Optionally save the latest content before compiling
    if (typeof content === 'string') {
      assertAllowedExtension(filename);
      fs.writeFileSync(projectFile(req.params.id, filename), content, 'utf8');
    }

    const texFile = path.basename(filename, '.tex');

    const { stdout, stderr } = await execFileAsync(
      'pdflatex',
      ['-interaction=nonstopmode', '-halt-on-error', `${texFile}.tex`],
      { cwd: dir, timeout: 60000 }
    ).catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || err.message }));

    const pdfPath = path.join(dir, `${texFile}.pdf`);
    const success = fs.existsSync(pdfPath);

    res.json({ success, log: stdout + '\n' + stderr });
  } catch (err) {
    res.status(400).json({ success: false, log: err.message });
  }
});

// GET /api/projects/:id/pdf  – stream the compiled PDF
app.get('/api/projects/:id/pdf', (req, res) => {
  try {
    const dir = projectDir(req.params.id);
    const { filename = 'main' } = req.query;
    const basename = path.basename(filename, '.tex');
    if (!/^[a-zA-Z0-9_-]+$/.test(basename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const pdfPath = path.join(dir, `${basename}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'PDF not found – compile the project first' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀  Rogue is running at http://localhost:${PORT}\n`);
});

module.exports = app; // for testing
