// Review aids for the critique loop, made from a rendered video.
//   node tools/review.mjs out/video-16x9.mp4
// writes out/contact-sheet.jpg (2 frames a second, timestamped, full width), out/contact-sheet-360.jpg (the same
// at 360 px a frame, the phone test), and out/strips/strip-<t>.jpg (every frame for 0.6 s around each camera move).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const FILM = new URL("..", import.meta.url).pathname;
const video = join(FILM, process.argv[2] ?? "out/video-16x9.mp4");
const OUT = join(FILM, "out");
const vertical = video.includes("9x16");
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
const stamp = "drawtext=text='%{pts\\:hms}':x=12:y=12:fontsize=28:fontcolor=white:box=1:boxcolor=0x14213dcc:boxborderw=6";
const suffix = vertical ? "-9x16" : "";

ff("-i", video, "-vf", `fps=2,${stamp},scale=${vertical ? 270 : 480}:-1,tile=${vertical ? "12x16" : "8x23"}:padding=4:margin=4:color=white`, "-frames:v", "1", "-q:v", "3", join(OUT, `contact-sheet${suffix}.jpg`));
ff("-i", video, "-vf", `fps=2,${stamp},scale=360:-1,tile=${vertical ? "12x16" : "6x31"}:padding=4:margin=4:color=white`, "-frames:v", "1", "-q:v", "4", join(OUT, `contact-sheet-360${suffix}.jpg`));

mkdirSync(join(OUT, "strips"), { recursive: true });
for (const t of [5, 7.5, 11, 13.5, 21.5, 28, 33, 34, 36.5, 50.5, 55.5, 56.5, 68, 75.5, 78.5, 82.5, 85.5]) {
  ff("-ss", String(t - 0.1), "-t", "0.6", "-i", video, "-vf", `fps=20,scale=${vertical ? 200 : 360}:-1,tile=12x1:padding=2`, "-frames:v", "1", "-q:v", "3", join(OUT, "strips", `strip${suffix}-${t}.jpg`));
}
console.log("review images written");
