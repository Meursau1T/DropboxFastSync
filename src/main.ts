import './styles.css';
import { renderApp, renderFileListPublic } from './ui';
import { restoreSession, isAuthenticated } from './auth';

function showSection(section: 'loading' | 'auth' | 'main'): void {
  document.getElementById('loading')!.style.display =
    section === 'loading' ? 'flex' : 'none';
  document.getElementById('auth-section')!.style.display =
    section === 'auth' ? 'block' : 'none';
  document.getElementById('main-section')!.style.display =
    section === 'main' ? 'block' : 'none';
}

async function init(): Promise<void> {
  renderApp();

  showSection('loading');
  document.getElementById('loading-text')!.textContent = 'Starting...';

  try {
    const restored = await restoreSession();
    if (restored && isAuthenticated()) {
      await renderFileListPublic();
      showSection('main');
    } else {
      showSection('auth');
    }
  } catch {
    showSection('auth');
  }
}

init();
