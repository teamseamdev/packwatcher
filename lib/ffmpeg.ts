import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const WINDOWS_FFMPEG_CANDIDATES = [
  "C:\\ffmpeg\\bin\\ffmpeg.exe",
  "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
  "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe"
];

export function resolveFfmpegBinary() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  if (process.platform === "win32") {
    const match = WINDOWS_FFMPEG_CANDIDATES.find((candidate) => existsSync(/* turbopackIgnore: true */ candidate));
    if (match) return match;
  }

  return "ffmpeg";
}

export function ffmpegInstallMessage() {
  return [
    "FFmpeg is required for PackWatcher Clips local analysis and export, but the server could not start it.",
    "Install FFmpeg and make sure ffmpeg is on PATH, or set FFMPEG_PATH in .env.local to the full ffmpeg.exe path.",
    "On Windows, winget install Gyan.FFmpeg is the quickest route."
  ].join(" ");
}

export function runFfmpeg(args: string[]) {
  const binary = resolveFfmpegBinary();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`${ffmpegInstallMessage()} ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}. ${stderr.slice(-1200)}`));
    });
  });
}
