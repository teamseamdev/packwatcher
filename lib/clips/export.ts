import { runFfmpeg } from "@/lib/ffmpeg";

export type ExportOverlayCard = {
  cardName: string;
  estimatedValue: number;
  timestampStart: number;
  timestampEnd: number;
};

export type BuildExportOptions = {
  inputPath: string;
  outputPath: string;
  clipStart: number;
  duration: number;
  productName: string;
  totalCost: number;
  totalPullValue: number;
  profitLoss: number;
  roiPercent: number;
  cropMode: "blurred" | "center_crop";
  cards: ExportOverlayCard[];
};

export async function renderVerticalClip(options: BuildExportOptions) {
  const filter = options.cropMode === "center_crop"
    ? buildCenterCropFilter(options)
    : buildBlurredFilter(options);

  await runFfmpeg([
    "-y",
    "-ss", String(options.clipStart),
    "-t", String(options.duration),
    "-i", options.inputPath,
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    options.outputPath
  ]);
}

function buildBlurredFilter(options: BuildExportOptions) {
  const base = [
    "[0:v]split=2[rawbg][rawfg]",
    "[rawbg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:1,setsar=1[bg]",
    "[rawfg]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[fg]",
    "[bg][fg]overlay=(W-w)/2:(H-h)/2[base]"
  ].join(";");

  return appendOverlays("[base]", options);
}

function buildCenterCropFilter(options: BuildExportOptions) {
  const base = "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[base]";
  return appendOverlays("[base]", options);
}

function appendOverlays(inputLabel: string, options: BuildExportOptions) {
  const profitPrefix = options.profitLoss >= 0 ? "+" : "-";
  const profitText = `Profit: ${profitPrefix}${formatCurrency(Math.abs(options.profitLoss))}`;
  const lines = [
    draw(inputLabel, "title1", options.productName, 58, 64, "white", null),
    draw("[title1]", "summary1", `Cost: ${formatCurrency(options.totalCost)}   Pulls: ${formatCurrency(options.totalPullValue)}`, 38, 164, "white", null),
    draw("[summary1]", "summary2", `${profitText}   ROI: ${options.roiPercent.toFixed(1)}%`, 40, 1800, options.profitLoss >= 0 ? "0xfacc15" : "0xfda4af", null),
    ...options.cards.map((card, index) => {
      const input = index === 0 ? "[summary2]" : `[card${index - 1}]`;
      const output = `card${index}`;
      const start = Math.max(0, card.timestampStart - options.clipStart);
      const end = Math.max(start + 1, card.timestampEnd - options.clipStart);
      return draw(input, output, `${card.cardName || "Card"} - ${formatCurrency(card.estimatedValue)}`, 48, 1430, "white", `between(t\\,${start.toFixed(2)}\\,${end.toFixed(2)})`);
    })
  ];

  const finalLabel = options.cards.length ? `[card${options.cards.length - 1}]` : "[summary2]";
  return `${lines.join(";")};${finalLabel}format=yuv420p[v]`;
}

function draw(input: string, output: string, text: string, size: number, y: number, color: string, enable: string | null) {
  const enablePart = enable ? `:enable='${enable}'` : "";
  return `${input}drawtext=fontfile='${fontFile()}':text='${escapeDrawText(text)}':x=(w-text_w)/2:y=${y}:fontsize=${size}:fontcolor=${color}:box=1:boxcolor=black@0.62:boxborderw=22${enablePart}[${output}]`;
}

function fontFile() {
  return process.platform === "win32" ? "C\\:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
}

function escapeDrawText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
    .replaceAll("%", "\\%")
    .replaceAll(",", "\\,");
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

