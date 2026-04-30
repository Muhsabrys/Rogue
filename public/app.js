/* ═══════════════════════════════════════════════════
   Rogue – Local LaTeX Editor  |  app.js (frontend)
   ═══════════════════════════════════════════════════ */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
let currentProject = null;   // { id, name }
let currentFile    = null;   // filename string
let cm             = null;   // CodeMirror instance
let isDirty        = false;

// ─── Initialise CodeMirror ────────────────────────────────────────────────────
function initEditor() {
  cm = CodeMirror.fromTextArea(document.getElementById('editor'), {
    mode:              'stex',
    theme:             'dracula',
    lineNumbers:       true,
    lineWrapping:      true,
    matchBrackets:     true,
    autoCloseBrackets: true,
    indentUnit:        2,
    tabSize:           2,
    extraKeys: {
      'Ctrl-S': saveFile,
      'Cmd-S':  saveFile,
    },
  });

  cm.on('change', () => {
    if (!isDirty) {
      isDirty = true;
      updateFileBadge();
    }
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal({ title, body, onConfirm }) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalBackdrop').style.display = 'flex';
  document.getElementById('modalConfirm').onclick = () => {
    onConfirm();
    closeModal();
  };
}
function closeModal() {
  document.getElementById('modalBackdrop').style.display = 'none';
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Projects ─────────────────────────────────────────────────────────────────
async function loadProjects() {
  const projects = await api('GET', '/api/projects');
  const ul = document.getElementById('projectList');
  ul.innerHTML = '';
  projects.forEach(p => {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    if (currentProject && currentProject.id === p.id) li.classList.add('active');
    li.innerHTML = `<span class="item-name" title="${escHtml(p.name)}">${escHtml(p.name)}</span>
                    <button class="list-delete" title="Delete project" data-id="${escHtml(p.id)}">✕</button>`;
    li.querySelector('.item-name').addEventListener('click', () => openProject(p));
    li.querySelector('.list-delete').addEventListener('click', async e => {
      e.stopPropagation();
      await deleteProject(p);
    });
    ul.appendChild(li);
  });
}

async function createProject() {
  openModal({
    title: 'New Project',
    body:  `<input type="text" id="projectNameInput" placeholder="Project name" value="My LaTeX Project" />`,
    onConfirm: async () => {
      const name = document.getElementById('projectNameInput').value.trim() || 'Untitled';
      try {
        const p = await api('POST', '/api/projects', { name });
        await loadProjects();
        await openProject(p);
        showToast(`Created "${p.name}"`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
  // Focus input after modal opens
  setTimeout(() => {
    const inp = document.getElementById('projectNameInput');
    if (inp) { inp.select(); inp.focus(); }
  }, 50);
}

async function deleteProject(p) {
  openModal({
    title: `Delete "${p.name}"?`,
    body:  `<p style="color:var(--text-dim)">This will permanently delete all files in this project.</p>`,
    onConfirm: async () => {
      try {
        await api('DELETE', `/api/projects/${p.id}`);
        if (currentProject && currentProject.id === p.id) {
          currentProject = null;
          currentFile    = null;
          resetEditor();
        }
        await loadProjects();
        showToast(`Deleted "${p.name}"`, 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}

async function openProject(p) {
  currentProject = p;
  currentFile    = null;
  document.getElementById('projectTitle').textContent = p.name;
  document.getElementById('filesSection').style.display = '';
  document.getElementById('compileBtn').disabled = true;
  document.getElementById('saveBtn').disabled    = true;

  // Highlight active project
  document.querySelectorAll('.project-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.id === p.id);
  });

  await loadFiles();
}

// ─── Files ────────────────────────────────────────────────────────────────────
async function loadFiles() {
  if (!currentProject) return;
  const files = await api('GET', `/api/projects/${currentProject.id}/files`);
  const ul = document.getElementById('fileList');
  ul.innerHTML = '';
  files.forEach(f => {
    const li = document.createElement('li');
    li.dataset.name = f;
    if (currentFile === f) li.classList.add('active');
    li.innerHTML = `<span class="item-name" title="${escHtml(f)}">${escHtml(f)}</span>
                    <button class="list-delete" title="Delete file" data-name="${escHtml(f)}">✕</button>`;
    li.querySelector('.item-name').addEventListener('click', () => openFile(f));
    li.querySelector('.list-delete').addEventListener('click', async e => {
      e.stopPropagation();
      await deleteFile(f);
    });
    ul.appendChild(li);
  });

  // Auto-open main.tex if nothing is open
  if (!currentFile && files.includes('main.tex')) {
    await openFile('main.tex');
  }
}

async function openFile(filename) {
  if (isDirty) {
    const save = confirm(`Save changes to "${currentFile}" before opening "${filename}"?`);
    if (save) await saveFile();
  }

  try {
    const { content } = await api('GET', `/api/projects/${currentProject.id}/files/${filename}`);
    currentFile = filename;
    isDirty = false;

    // Show editor, hide placeholder
    document.querySelector('.editor-placeholder').style.display = 'none';
    document.getElementById('editorContainer').querySelector('textarea').style.display = '';

    cm.setValue(content);
    cm.clearHistory();
    cm.refresh();

    document.getElementById('compileBtn').disabled = false;
    document.getElementById('saveBtn').disabled    = false;

    // Highlight active file
    document.querySelectorAll('.file-list li').forEach(li => {
      li.classList.toggle('active', li.dataset.name === filename);
    });

    updateFileBadge();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveFile() {
  if (!currentProject || !currentFile) return;
  try {
    await api('PUT', `/api/projects/${currentProject.id}/files/${currentFile}`, {
      content: cm.getValue(),
    });
    isDirty = false;
    updateFileBadge();
    showToast('Saved', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function newFile() {
  if (!currentProject) return;
  openModal({
    title: 'New File',
    body:  `<input type="text" id="newFileInput" placeholder="filename.tex" value="section.tex" />`,
    onConfirm: async () => {
      const name = document.getElementById('newFileInput').value.trim();
      if (!name) return;
      try {
        await api('PUT', `/api/projects/${currentProject.id}/files/${name}`, { content: '' });
        await loadFiles();
        await openFile(name);
        showToast(`Created "${name}"`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
  setTimeout(() => {
    const inp = document.getElementById('newFileInput');
    if (inp) { inp.select(); inp.focus(); }
  }, 50);
}

async function deleteFile(filename) {
  openModal({
    title: `Delete "${filename}"?`,
    body:  `<p style="color:var(--text-dim)">This action cannot be undone.</p>`,
    onConfirm: async () => {
      try {
        await api('DELETE', `/api/projects/${currentProject.id}/files/${filename}`);
        if (currentFile === filename) {
          currentFile = null;
          resetEditor();
        }
        await loadFiles();
        showToast(`Deleted "${filename}"`, 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}

// ─── Compile ──────────────────────────────────────────────────────────────────
async function compile() {
  if (!currentProject || !currentFile) return;

  const btn = document.getElementById('compileBtn');
  btn.disabled = true;
  btn.classList.add('spinning');
  btn.textContent = '⏳ Compiling';

  // Auto-save before compile
  if (isDirty) await saveFile();

  try {
    const result = await api('POST', `/api/projects/${currentProject.id}/compile`, {
      filename: currentFile,
    });

    document.getElementById('logOutput').textContent = result.log || '(no log)';

    if (result.success) {
      showPdf();
      showToast('Compiled successfully!', 'success');
      // Switch to PDF tab
      activateTab('pdf');
    } else {
      showToast('Compilation failed – check the log', 'error');
      activateTab('log');
    }
  } catch (err) {
    document.getElementById('logOutput').textContent = err.message;
    showToast(err.message, 'error');
    activateTab('log');
  } finally {
    btn.disabled  = false;
    btn.classList.remove('spinning');
    btn.textContent = '▶ Compile';
  }
}

function showPdf() {
  const frame = document.getElementById('pdfFrame');
  const placeholder = document.getElementById('pdfPlaceholder');
  const url = `/api/projects/${currentProject.id}/pdf?t=${Date.now()}`;
  frame.src = url;
  frame.style.display = '';
  placeholder.style.display = 'none';
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────
function resetEditor() {
  cm.setValue('');
  cm.clearHistory();
  isDirty = false;
  document.querySelector('.editor-placeholder').style.display = '';
  document.getElementById('compileBtn').disabled = true;
  document.getElementById('saveBtn').disabled    = true;
  updateFileBadge();
}

function updateFileBadge() {
  const badge = document.getElementById('fileBadge');
  if (!currentFile) { badge.textContent = '—'; return; }
  badge.textContent = isDirty ? `${currentFile} ●` : currentFile;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initEditor();

  // Buttons
  document.getElementById('newProjectBtn').addEventListener('click', createProject);
  document.getElementById('compileBtn').addEventListener('click', compile);
  document.getElementById('saveBtn').addEventListener('click', saveFile);
  document.getElementById('newFileBtn').addEventListener('click', newFile);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', e => {
    if (e.target === document.getElementById('modalBackdrop')) closeModal();
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // Load projects list
  await loadProjects();
});
