import './styles.css';
import { renderApp, renderFileListPublic, showSection } from './ui';
import { restoreSession, isAuthenticated } from './auth';

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
