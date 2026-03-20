import type { FileInfo } from '@azure/ai-agents';
import { getFoundryAgentsClient } from './initialize';

type FoundryNodeStreamResponse = {
  body?: NodeJS.ReadableStream | null;
};

async function readNodeStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function getFoundryFileInfo(fileId: string): Promise<FileInfo> {
  return getFoundryAgentsClient().files.get(fileId);
}

export async function getFoundryFileArrayBuffer(fileId: string): Promise<ArrayBuffer> {
  const response = (await getFoundryAgentsClient()
    .files.getContent(fileId)
    .asNodeStream()) as FoundryNodeStreamResponse;

  if (!response.body) {
    throw new Error(`Foundry file content response for "${fileId}" did not include a body.`);
  }

  const buffer = await readNodeStream(response.body);
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}
