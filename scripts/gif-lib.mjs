// Pure helpers for the GIF converter job (scripts/gif-convert.mjs): fixed ffmpeg/ffprobe arguments, limit clamping, the retry ladder.
// Nothing a member typed ever reaches these: the only inputs are numbers from config.json and the fixed file names below.
export const IN_FILE = 'in.bin', OUT_FILE = 'out.gif';
const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) && Number(v) >= lo ? Math.min(Number(v), hi) : d);
export const REF_RE = /^[0-9a-f]{24}$/;

/** limits from config.json `gif`, clamped (the Worker clamps the same way in bot/gif.js limits()) */
export function convertLimits(c = {}) {
  return { maxSeconds: num(c.maxSeconds, 15, 1, 15), width: Math.floor(num(c.width, 480, 120, 720)), fps: Math.floor(num(c.fps, 12, 4, 20)), maxOutMb: num(c.maxOutMb, 8, 1, 25) };
}
/** ffprobe: duration of the container, nothing else */
export const probeArgs = (file = IN_FILE) => ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file];
/** ffmpeg: palette-based GIF, local file only (protocol whitelist), no stdin, hard length cap */
export function ffmpegArgs({ width, fps, maxSeconds }, inFile = IN_FILE, outFile = OUT_FILE) {
  const w = Math.floor(width), f = Math.floor(fps);
  return ['-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file', '-t', String(maxSeconds), '-i', inFile,
    '-vf', `fps=${f},scale=${w}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
    '-an', '-loop', '0', '-f', 'gif', outFile];
}
/** smaller and lighter each try when the GIF is over the size cap: [{width, fps}] */
export function ladder({ width, fps }) {
  return [{ width, fps }, { width: Math.max(160, Math.floor(width * 0.75)), fps: Math.max(6, fps - 3) }, { width: Math.max(160, Math.floor(width * 0.55)), fps: Math.max(6, fps - 6) }];
}
export const GIF_MAGIC = (buf) => buf.length > 6 && buf.subarray(0, 4).toString('latin1') === 'GIF8';
