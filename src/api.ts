import { getDropbox, isAuthenticated } from './auth';
import { invoke } from '@tauri-apps/api/core';

export interface DropboxFile {
  name: string;
  path: string;
  size: number;
  client_modified: string;
}

export async function listFiles(): Promise<DropboxFile[]> {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const dbx = getDropbox()!;
  const response = await dbx.filesListFolder({ path: '' });
  const entries = response.result.entries;

  const fileEntries = entries.filter(
    (e) => e['.tag'] === 'file',
  ) as unknown as Array<{
    name: string;
    path_lower?: string;
    path_display?: string;
    size: number;
    client_modified: string;
  }>;

  return fileEntries.map((e) => ({
    name: e.name,
    path: e.path_lower || e.path_display || '',
    size: e.size,
    client_modified: e.client_modified,
  }));
}

export async function uploadFiles(filePaths: string[]): Promise<string[]> {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const dbx = getDropbox()!;
  const results: string[] = [];

  for (const filePath of filePaths) {
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unnamed';
    console.log(`[upload] reading file: ${filePath} -> ${fileName}`);

    const contents = await invoke<number[]>('read_file', { path: filePath });
    console.log(`[upload] read ${contents.length} bytes`);

    const buffer = new Uint8Array(contents).buffer;
    console.log(`[upload] uploading as ArrayBuffer, size=${buffer.byteLength}`);

    const result = await dbx.filesUpload({
      path: `/${fileName}`,
      contents: buffer,
      mode: { '.tag': 'add' },
      autorename: true,
    });
    console.log(`[upload] success: ${result.result.name} (${result.result.size} bytes)`);

    results.push(fileName);
  }

  return results;
}

export async function deleteFile(filePath: string): Promise<void> {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const dbx = getDropbox()!;
  await dbx.filesDeleteV2({ path: filePath });
}
