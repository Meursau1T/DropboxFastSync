const DROPBOX_CLIENT_ID = 'tjrp1i7nxodv255';

import { Dropbox, DropboxAuth } from 'dropbox';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { load } from '@tauri-apps/plugin-store';

let dbxAuth: DropboxAuth;
let dbx: Dropbox | null = null;
let currentRedirectUri = '';

const store = await load('store.json');

function createAuth(): DropboxAuth {
  return new DropboxAuth({
    clientId: DROPBOX_CLIENT_ID,
  });
}

function createDropbox(auth: DropboxAuth): Dropbox {
  return new Dropbox({
    auth,
  });
}

export async function startOAuth(): Promise<boolean> {
  dbxAuth = createAuth();

  const port = await invoke<number>('start_oauth');
  currentRedirectUri = `http://127.0.0.1:${port}/callback`;

  const authUrl = (await dbxAuth.getAuthenticationUrl(
    currentRedirectUri,
    undefined,
    'code',
    'offline',
    undefined,
    undefined,
    true,
  )) as string;

  await store.set('codeVerifier', dbxAuth.getCodeVerifier());
  await store.save();

  await openUrl(authUrl);

  // Wait for the OAuth callback via Tauri event
  return new Promise((resolve) => {
    const unlistenPromise = listen<string>('oauth-code', async (event) => {
      (await unlistenPromise)();

      try {
        const code = event.payload;
        const codeVerifier = await store.get<string>('codeVerifier');
        if (codeVerifier) {
          dbxAuth.setCodeVerifier(codeVerifier);
        }

        const response = (await dbxAuth.getAccessTokenFromCode(
          currentRedirectUri,
          code,
        )) as unknown as {
          result: {
            access_token: string;
            refresh_token?: string;
            expires_in: number;
          };
        };

        const { access_token, refresh_token, expires_in } = response.result;

        await store.set('accessToken', access_token);
        if (refresh_token) {
          await store.set('refreshToken', refresh_token);
        }
        await store.set(
          'expiresAt',
          Date.now() + (expires_in || 14400) * 1000,
        );
        await store.save();

        dbxAuth.setAccessToken(access_token);
        if (refresh_token) {
          dbxAuth.setRefreshToken(refresh_token);
        }

        dbx = createDropbox(dbxAuth);
        resolve(true);
      } catch (e) {
        console.error('Failed to exchange code for token:', e);
        resolve(false);
      }
    });
  });
}

export async function restoreSession(): Promise<boolean> {
  const accessToken = await store.get<string>('accessToken');
  if (!accessToken) return false;

  const refreshToken = await store.get<string>('refreshToken');
  const expiresAt = await store.get<number>('expiresAt');

  dbxAuth = createAuth();
  dbxAuth.setAccessToken(accessToken);
  if (refreshToken) {
    dbxAuth.setRefreshToken(refreshToken);
  }

  // Refresh if expired
  if (expiresAt && Date.now() > expiresAt && refreshToken) {
    try {
      await dbxAuth.refreshAccessToken();
      const newAccessToken = dbxAuth.getAccessToken();
      if (newAccessToken) {
        await store.set('accessToken', newAccessToken);
      }
      const newExpiresAt = dbxAuth.getAccessTokenExpiresAt();
      if (newExpiresAt) {
        await store.set('expiresAt', newExpiresAt.getTime());
      }
      await store.save();
    } catch {
      await clearSession();
      return false;
    }
  }

  dbx = createDropbox(dbxAuth);
  return true;
}

export async function clearSession(): Promise<void> {
  await store.delete('accessToken');
  await store.delete('refreshToken');
  await store.delete('expiresAt');
  await store.delete('codeVerifier');
  await store.save();
  dbx = null;
}

export function isAuthenticated(): boolean {
  return dbx !== null;
}

export function getDropbox(): Dropbox | null {
  return dbx;
}
