import { getCurrentWindow } from '@tauri-apps/api/window';
import { fetch } from '@tauri-apps/plugin-http';
import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { createIcons, LogIn, LogOut, RefreshCw, Upload, File, Trash2, Download, Copy } from 'lucide';
import { startOAuth, clearSession } from './auth';
import { listFiles, uploadFiles, uploadFileBuffer, deleteFile, downloadFile, type DropboxFile } from './api';

const lucideIcons = { LogIn, LogOut, RefreshCw, Upload, File, Trash2, Download, Copy };

function initIcons(root?: HTMLElement): void {
  createIcons({ icons: lucideIcons, root });
}

let files: DropboxFile[] = [];

export function renderApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="container">
      <header>
        <h1>FastShare</h1>
        <p class="subtitle">Drop files to upload to Dropbox</p>
        <button id="logout-btn" class="btn-logout" title="Sign Out" style="display:none">
          <i data-lucide="log-out"></i>
        </button>
      </header>

      <div id="auth-section">
        <button id="login-btn" class="btn-primary btn-icon" title="Sign in with Dropbox">
          <i data-lucide="log-in"></i>
        </button>
      </div>

      <div id="main-section" style="display:none">
        <div id="drop-zone">
          <div class="drop-zone-content">
            <i data-lucide="upload"></i>
            <p class="drop-text">Drop files here to upload</p>
            <p class="drop-hint">or click / Ctrl+V to paste</p>
          </div>
        </div>

        <div id="upload-status" class="status-message" style="display:none"></div>

        <div class="file-list-header">
          <h2>Uploaded Files</h2>
          <button id="refresh-btn" class="btn-secondary btn-icon" title="Refresh">
            <i data-lucide="refresh-cw"></i>
          </button>
        </div>

        <div id="file-list-container">
          <div id="file-list" class="file-list"></div>
          <div id="empty-state" class="empty-state">
            <p>No files uploaded yet</p>
          </div>
        </div>

      </div>

      <div id="loading" class="loading" style="display:none">
        <div class="spinner"></div>
        <p id="loading-text">Loading...</p>
      </div>
    </div>
  `;

  bindEvents();
  initIcons();
}

function bindEvents(): void {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const dropZone = document.getElementById('drop-zone');

  loginBtn?.addEventListener('click', handleLogin);
  logoutBtn?.addEventListener('click', handleLogout);
  refreshBtn?.addEventListener('click', handleRefresh);
  dropZone?.addEventListener('click', () => handleClickUpload());

  setupDragDrop();
  setupPaste();
}

export function showSection(section: 'loading' | 'auth' | 'main'): void {
  const loading = document.getElementById('loading')!;
  const authSection = document.getElementById('auth-section')!;
  const mainSection = document.getElementById('main-section')!;
  const logoutBtn = document.getElementById('logout-btn')!;

  loading.style.display = section === 'loading' ? 'flex' : 'none';
  authSection.style.display = section === 'auth' ? 'block' : 'none';
  mainSection.style.display = section === 'main' ? 'block' : 'none';
  logoutBtn.style.display = section === 'main' ? 'inline-flex' : 'none';
}

function setLoading(text: string): void {
  showSection('loading');
  document.getElementById('loading-text')!.textContent = text;
}

function showStatus(message: string, isError = false): void {
  const status = document.getElementById('upload-status')!;
  status.textContent = message;
  status.className = `status-message ${isError ? 'error' : 'success'}`;
  status.style.display = 'block';
  setTimeout(() => {
    status.style.display = 'none';
  }, 5000);
}

async function handleLogin(): Promise<void> {
  setLoading('Opening Dropbox login...');
  const success = await startOAuth();
  if (success) {
    await renderFileList();
    showSection('main');
  } else {
    showSection('auth');
    showStatus('Authentication failed. Please try again.', true);
  }
}

async function handleLogout(): Promise<void> {
  await clearSession();
  files = [];
  renderEmptyFileList();
  showSection('auth');
}

async function handleRefresh(): Promise<void> {
  await renderFileList();
}

async function handleDelete(path: string): Promise<void> {
  try {
    await deleteFile(path);
    showStatus('File deleted successfully');
    await renderFileList();
  } catch (e) {
    showStatus('Failed to delete file', true);
    console.error(e);
  }
}

async function handleDownload(path: string): Promise<void> {
  try {
    showStatus('Downloading...');
    const url = await downloadFile(path);
    const fileName = path.split('/').pop() || 'download';

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    await writeFile(fileName, new Uint8Array(arrayBuffer), { baseDir: BaseDirectory.Download });

    showStatus(`Saved to Downloads/${fileName}`);
  } catch (e) {
    showStatus('Failed to download file', true);
    console.error(e);
  }
}

async function handleCopy(path: string): Promise<void> {
  try {
    showStatus('Copying...');
    const url = await downloadFile(path);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    await writeText(text);
    showStatus('Copied to clipboard');
  } catch (e) {
    showStatus('Failed to copy content', true);
    console.error(e);
  }
}

async function renderFileList(): Promise<void> {
  try {
    files = await listFiles();
    const fileList = document.getElementById('file-list')!;
    const emptyState = document.getElementById('empty-state')!;

    if (files.length === 0) {
      fileList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    fileList.innerHTML = files
      .map(
        (f) => `
        <div class="file-item">
          <div class="file-info">
            <span class="file-icon"><i data-lucide="file"></i></span>
            <div class="file-details">
              <span class="file-name" title="${f.path}">${f.name}</span>
              <span class="file-meta">${formatSize(f.size)} · ${formatDate(f.client_modified)}</span>
            </div>
          </div>
          ${f.name.endsWith('.txt') ? `<button class="btn-copy" data-path="${f.path}" title="Copy content"><i data-lucide="copy"></i></button>` : ''}
          <button class="btn-download" data-path="${f.path}" title="Download file"><i data-lucide="download"></i></button>
          <button class="btn-delete" data-path="${f.path}" title="Delete file"><i data-lucide="trash-2"></i></button>
        </div>
      `,
      )
      .join('');

    // Bind copy, download and delete buttons
    fileList.querySelectorAll('.btn-copy').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = (btn as HTMLElement).dataset.path;
        if (path) handleCopy(path);
      });
    });

    fileList.querySelectorAll('.btn-download').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = (btn as HTMLElement).dataset.path;
        if (path) handleDownload(path);
      });
    });

    fileList.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = (btn as HTMLElement).dataset.path;
        if (path) handleDelete(path);
      });
    });

    initIcons(fileList);
  } catch (e) {
    console.error('Failed to list files:', e);
    showStatus('Failed to load file list', true);
  }
}

export async function renderFileListPublic(): Promise<void> {
  return renderFileList();
}

function renderEmptyFileList(): void {
  const fileList = document.getElementById('file-list')!;
  const emptyState = document.getElementById('empty-state')!;
  fileList.innerHTML = '';
  emptyState.style.display = 'block';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return ts;
  }
}

function setupDragDrop(): void {
  const dropZone = document.getElementById('drop-zone')!;

  // Tauri native drag-drop
  getCurrentWindow().onDragDropEvent(async (event) => {
    console.log('[drag] event type:', event.payload.type);
    if (event.payload.type === 'over') {
      dropZone.classList.add('drag-over');
    } else if (event.payload.type === 'leave') {
      dropZone.classList.remove('drag-over');
    } else if (event.payload.type === 'drop') {
      dropZone.classList.remove('drag-over');
      const paths = event.payload.paths;
      console.log('[drag] dropped files:', paths);
      if (paths.length > 0) {
        await handleUpload(paths);
      }
    }
  });
}

async function handleClickUpload(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = async () => {
    if (input.files && input.files.length > 0) {
      const fileList = Array.from(input.files);
      await handleClipboardFiles(fileList);
    }
  };
  input.click();
}

function setupPaste(): void {
  document.addEventListener('paste', (event: ClipboardEvent) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    const items = event.clipboardData?.items;
    if (!items || items.length === 0) return;

    const files: File[] = [];
    let textContent = '';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      } else if (item.kind === 'string' && item.type === 'text/plain') {
        textContent += event.clipboardData?.getData('text/plain') || '';
      }
    }

    if (files.length > 0 || textContent) {
      event.preventDefault();
      handlePasteUpload(files, textContent);
    }
  });
}

async function handlePasteUpload(files: File[], text: string): Promise<void> {
  const count = files.length + (text ? 1 : 0);
  setLoading(`Uploading ${count} item(s) from clipboard...`);

  const results: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      let name = file.name || `pasted-file-${Date.now()}`;
      if (!name || name === 'image.png') {
        name = `pasted-image-${Date.now()}.png`;
      }
      const data = await file.arrayBuffer();
      const uploadedName = await uploadFileBuffer(name, data);
      results.push(uploadedName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${file.name || 'file'}: ${msg}`);
    }
  }

  if (text) {
    try {
      const name = `pasted-text-${Date.now()}.txt`;
      const encoder = new TextEncoder();
      const data = encoder.encode(text).buffer;
      const uploadedName = await uploadFileBuffer(name, data);
      results.push(uploadedName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`text: ${msg}`);
    }
  }

  showSection('main');
  if (results.length > 0) showStatus(`Uploaded: ${results.join(', ')}`);
  if (errors.length > 0) showStatus(`Failed: ${errors.join(', ')}`, true);
  await renderFileList();
}

async function handleClipboardFiles(files: File[]): Promise<void> {
  setLoading(`Uploading ${files.length} file(s)...`);
  const results: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const data = await file.arrayBuffer();
      const uploadedName = await uploadFileBuffer(file.name, data);
      results.push(uploadedName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${file.name}: ${msg}`);
    }
  }

  showSection('main');
  if (results.length > 0) showStatus(`Uploaded: ${results.join(', ')}`);
  if (errors.length > 0) showStatus(`Failed: ${errors.join(', ')}`, true);
  await renderFileList();
}

async function handleUpload(filePaths: string[]): Promise<void> {
  showSection('main');
  console.log(`[ui] handleUpload called with paths:`, filePaths);
  setLoading(`Uploading ${filePaths.length} file(s)...`);

  try {
    const uploaded = await uploadFiles(filePaths);
    showStatus(`Uploaded: ${uploaded.join(', ')}`);
    await renderFileList();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ui] upload failed:', msg);
    showStatus(`Upload failed: ${msg}`, true);
  }

  showSection('main');
}
