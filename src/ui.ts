import { getCurrentWindow } from '@tauri-apps/api/window';
import { startOAuth, clearSession } from './auth';
import { listFiles, uploadFiles, uploadFileBuffer, deleteFile, type DropboxFile } from './api';

let files: DropboxFile[] = [];

export function renderApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="container">
      <header>
        <h1>fastShare</h1>
        <p class="subtitle">Drop files to upload to Dropbox</p>
      </header>

      <div id="auth-section">
        <button id="login-btn" class="btn-primary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Sign in with Dropbox
        </button>
      </div>

      <div id="main-section" style="display:none">
        <div id="drop-zone">
          <div class="drop-zone-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p class="drop-text">Drop files here to upload</p>
            <p class="drop-hint">or click / Ctrl+V to paste</p>
          </div>
        </div>

        <div id="upload-status" class="status-message" style="display:none"></div>

        <div class="file-list-header">
          <h2>Uploaded Files</h2>
          <button id="refresh-btn" class="btn-secondary">Refresh</button>
        </div>

        <div id="file-list-container">
          <div id="file-list" class="file-list"></div>
          <div id="empty-state" class="empty-state">
            <p>No files uploaded yet</p>
          </div>
        </div>

        <div class="footer">
          <button id="logout-btn" class="btn-secondary">Sign Out</button>
        </div>
      </div>

      <div id="loading" class="loading" style="display:none">
        <div class="spinner"></div>
        <p id="loading-text">Loading...</p>
      </div>
    </div>
  `;

  bindEvents();
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

function showSection(section: 'loading' | 'auth' | 'main'): void {
  const loading = document.getElementById('loading')!;
  const authSection = document.getElementById('auth-section')!;
  const mainSection = document.getElementById('main-section')!;

  loading.style.display = section === 'loading' ? 'flex' : 'none';
  authSection.style.display = section === 'auth' ? 'block' : 'none';
  mainSection.style.display = section === 'main' ? 'block' : 'none';
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
            <span class="file-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
            </span>
            <div class="file-details">
              <span class="file-name" title="${f.path}">${f.name}</span>
              <span class="file-meta">${formatSize(f.size)} · ${formatDate(f.client_modified)}</span>
            </div>
          </div>
          <button class="btn-delete" data-path="${f.path}" title="Delete file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `,
      )
      .join('');

    // Bind delete buttons
    fileList.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = (btn as HTMLElement).dataset.path;
        if (path) handleDelete(path);
      });
    });
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
