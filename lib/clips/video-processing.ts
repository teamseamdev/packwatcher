import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { runFfmpeg } from "@/lib/ffmpeg";

export type ExtractedFrame = {
  fileName: string;
  filePath: string;
  timestampStart: number;
  timestampEnd: number;
  confidence: number;
  sortOrder: number;
};

export async function withSourceVideo<T>(
  fileName: string,
  blob: Blob,
  callback: (context: { workDir: string; inputPath: string }) => Promise<T>
) {
  const workDir = join(tmpdir(), `packwatcher-clips-${randomUUID()}`);
  const inputPath = join(workDir, sourceExtension(fileName));

  try {
    await mkdir(workDir, { recursive: true });
    await writeFile(inputPath, Buffer.from(await blob.arrayBuffer()));
    return await callback({ workDir, inputPath });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function extractCandidateFrames(inputPath: string, workDir: string) {
  await runFfmpeg([
    "-y",
    "-i", inputPath,
    "-vf", "fps=1/2,scale=640:-1",
    "-frames:v", "18",
    join(workDir, "moment-%03d.jpg")
  ]);

  const frameNames = (await readdir(workDir)).filter((name) => name.startsWith("moment-") && name.endsWith(".jpg")).sort();
  return frameNames.map((fileName, index): ExtractedFrame => {
    const timestampStart = index * 2;
    return {
      fileName,
      filePath: join(workDir, fileName),
      timestampStart,
      timestampEnd: timestampStart + 4,
      confidence: Math.max(0.35, 0.78 - index * 0.02),
      sortOrder: index
    };
  });
}

export async function readFrameBuffer(frame: ExtractedFrame) {
  return readFile(frame.filePath);
}

function sourceExtension(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".mov") return "source.mov";
  if (extension === ".webm") return "source.webm";
  return "source.mp4";
}
