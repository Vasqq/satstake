// Re-renders only the given ranges and splices them into the existing silent video, so a fix costs its seconds only.
//   node tools/splice.mjs 23-26 32-38 [--format 9x16]
// Ranges must start and end on whole frames. The spliced result replaces out/video-<format>.mp4.
import { execFileSync } from "node:child_process";
import { renameSync } from "node:fs";
import { join } from "node:path";

const FILM = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const fi = args.indexOf("--format");
const format = fi === -1 ? "16x9" : args[fi + 1];
const ranges = args.filter((a, i) => /^\d/.test(a) && (fi === -1 || i !== fi + 1)).map((r) => r.split("-").map(Number)).sort((a, b) => a[0] - b[0]);
const base = join(FILM, "out", `video-${format}.mp4`);

for (const [a, b] of ranges) execFileSync("node", [join(FILM, "tools/render.mjs"), "--format", format, "--from", String(a), "--to", String(b)], { stdio: "inherit" });

// Pieces in order: the old video between ranges, the new part for each range.
const inputs = ["-i", base];
const pieces = [];
let cursor = 0;
ranges.forEach(([a, b], k) => {
  if (a > cursor) pieces.push(`[0:v]trim=start=${cursor}:end=${a},setpts=PTS-STARTPTS[o${k}]`);
  inputs.push("-i", join(FILM, "out", `part-${format}-${a}-${b}.mp4`));
  pieces.push(`[${k + 1}:v]setpts=PTS-STARTPTS[n${k}]`);
  cursor = b;
});
pieces.push(`[0:v]trim=start=${cursor},setpts=PTS-STARTPTS[tail]`);
const labels = [];
cursor = 0;
ranges.forEach(([a], k) => {
  if (a > cursor) labels.push(`[o${k}]`);
  labels.push(`[n${k}]`);
  cursor = ranges[k][1];
});
labels.push("[tail]");
const graph = `${pieces.join(";")};${labels.join("")}concat=n=${labels.length}:v=1:a=0[v]`;
const tmp = join(FILM, "out", `spliced-${format}.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-movflags", "+faststart", tmp]);
renameSync(tmp, base);
console.log(`spliced ${ranges.map((r) => r.join("-")).join(", ")} into ${base}`);
