import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const LOCAL_SOURCE_ROOT = resolve(
  process.env.CLIPS_LOCAL_STORAGE_DIR || resolve(tmpdir(), "packwatcher-clips", "source-videos")
);

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
  const relativePath = localSourceChunkRelativePath(userId, uploadId, chunkIndex);
  const absolutePath = resolveLocalSourcePath(relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, chunk);
  return localSourceRelativePath(userId, uploadId, fileName);
}

export async function assembleLocalSourceChunks(userId: string, uploadId: string, fileName: string, chunkCount: number) {
  const finalRelativePath = localSourceRelativePath(userId, uploadId, fileName);
  const finalAbsolutePath = resolveLocalSourcePath(finalRelativePath);
  const missingChunks = await missingLocalSourceChunks(userId, uploadId, chunkCount);

  if (missingChunks.length) {
    return { complete: false as const, finalRelativePath, missingChunks };
  }

  await mkdir(dirname(finalAbsolutePath), { recursive: true });
  await writeFile(finalAbsolutePath, Buffer.alloc(0));

  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = await readFile(resolveLocalSourcePath(localSourceChunkRelativePath(userId, uploadId, index)));
    await appendFile(finalAbsolutePath, chunk);
  }

  await rm(resolveLocalSourcePath(localSourceChunkDirectory(userId, uploadId)), { recursive: true, force: true });

  return { complete: true as const, finalRelativePath, missingChunks: [] as number[] };
}

async function missingLocalSourceChunks(userId: string, uploadId: string, chunkCount: number) {
  const missingChunks: number[] = [];

  for (let index = 0; index < chunkCount; index += 1) {
    try {
      const chunkStat = await stat(resolveLocalSourcePath(localSourceChunkRelativePath(userId, uploadId, index)));
      if (!chunkStat.size) missingChunks.push(index);
    } catch {
      missingChunks.push(index);
    }
  }

  return missingChunks;
}

export async function discardLocalSourceVideo(relativePath: string) {
  await rm(resolveLocalSourcePath(relativePath), { force: true });
}

export async function readLocalSourceVideo(relativePath: string) {
  return readFile(resolveLocalSourcePath(relativePath));
}

function resolveLocalSourcePath(relativePath: string) {
  const absolutePath = resolve(LOCAL_SOURCE_ROOT, relativePath);
  const pathFromRoot = relative(LOCAL_SOURCE_ROOT, absolutePath);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("Invalid local source video path.");
  }
  return absolutePath;
}

function localSourceRelativePath(userId: string, uploadId: string, fileName: string) {
  const safeUploadId = uploadId.replace(/[^a-zA-Z0-9-]/g, "");
  return `${userId}/${safeUploadId}${sourceExtension(fileName)}`;
}

function localSourceChunkDirectory(userId: string, uploadId: string) {
  const safeUploadId = uploadId.replace(/[^a-zA-Z0-9-]/g, "");
  return `${userId}/${safeUploadId}.parts`;
}

function localSourceChunkRelativePath(userId: string, uploadId: string, chunkIndex: number) {
  return `${localSourceChunkDirectory(userId, uploadId)}/${chunkIndex}.part`;
}

function sourceExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mov")) return ".mov";
  if (lower.endsWith(".webm")) return ".webm";
  return ".mp4";
}
