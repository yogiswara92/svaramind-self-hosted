import { uploadFile } from './auth';

export async function extractImageUrls(content: any): Promise<string[]> {
  const urls: string[] = [];

  function walk(node: any): void {
    if (!node) return;
    if (node.type === 'image' && node.attrs?.src?.includes('/api/storage/file/')) {
      urls.push(node.attrs.src);
    }
    if (node.content?.length) {
      for (const child of node.content) walk(child);
    }
  }

  for (const node of content?.content || []) walk(node);
  return urls;
}

// Deleting the backing files themselves happens server-side in
// deleteDocument (see backend/src/controllers/notesController.js), which
// already cleans up everything under documents/{workspaceId}/{documentId}/
// via the storage adapter - nothing to do here anymore.
export async function deleteDocumentImages(_workspaceId: string, _documentId: string): Promise<void> {}

export async function extractAndUploadImages(content: any, documentId: string, workspaceId: string): Promise<any> {
  if (!content?.content) return content;

  const imageMap = new Map<string, string>(); // base64 → public_url

  async function processNode(node: any): Promise<void> {
    if (!node) return;

    if (node.type === 'image' && node.attrs?.src?.startsWith('data:')) {
      const base64 = node.attrs.src;
      if (!imageMap.has(base64)) {
        try {
          const url = await uploadImageToStorage(base64, documentId, workspaceId);
          imageMap.set(base64, url);
          node.attrs.src = url;
        } catch (err) {
          console.error('Image upload failed, keeping base64:', err);
        }
      } else {
        node.attrs.src = imageMap.get(base64)!;
      }
    }

    if (node.content?.length) {
      for (const child of node.content) {
        await processNode(child);
      }
    }
  }

  for (const node of content.content || []) {
    await processNode(node);
  }

  return content;
}

async function uploadImageToStorage(dataUrl: string, documentId: string, workspaceId: string): Promise<string> {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 image');

  const [, mimeType, base64] = matches;
  const ext = mimeType.split('/')[1] || 'jpg';
  const filename = `${Date.now()}.${ext}`;
  const path = `documents/${workspaceId}/${documentId}/${filename}`;

  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const file = new File([bytes], filename, { type: mimeType });

  return uploadFile(path, file);
}
