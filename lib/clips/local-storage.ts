import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const LOCAL_SOURCE_ROOT = resolve(/* turbopackIgnore: true */ process.cwd(), ".local-clips", "source-videos");

export const LOCAL_SOURCE_BUCKET = "local-source-videos";

export async function writeLocalSourceVideo(userId: string, fileName: string, buffer: Buffer) {
  const extension = sourceExtension(fileName);
  const relativePath = `${userId}/${randomUUID()}${extension}`;
  const absolutePath = resolveLocalSourcePath(relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  return relativePath;
}

export async function writeLocalSourceChunk(userId: string, uploadId: string, fileName: string, chunk: Buffer, chunkIndex: number) {
  const relativePath = localSourceRelativePath(userId, uploadId, fileName);
  const absolutePath = resolveLocalSourcePath(relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });

  if (chunkIndex === 0) {
    await writeFile(absolutePath, chunk);
  } else {
    await appendFile(absolutePath, chunk);
  }

  return relativePath;
}

export async function discardLocalSourceVideo(relativePath: string) {
  await rm(resolveLocalSourcePath(relativePath), { force: true });
}

export async function readLocalSourceVideo(relativePath: string) {
  return readFile(resolveLocalSourcePath(relativePath));
}

function resolveLocalSourcePath(relativePath: string) {
  const absolutePath = resolve(LOCAL_SOURCE_ROOT, relativePath);
  if (!absolutePath.startsWith(LOCAL_SOURCE_ROOT)) {
    throw new Error("Invalid local source video path.");
  }
  return absolutePath;
}

function localSourceRelativePath(userId: string, uploadId: string, fileName: string) {
  const safeUploadId = uploadId.replace(/[^a-zA-Z0-9-]/g, "");
  return `${userId}/${safeUploadId}${sourceExtension(fileName)}`;
}

function sourceExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mov")) return ".mov";
  if (lower.endsWith(".webm")) return ".webm";
  return ".mp4";
}
