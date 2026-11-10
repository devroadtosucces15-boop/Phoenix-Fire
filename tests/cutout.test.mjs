import { t, done } from './lib.mjs';
import { decodePng, encodePng, cutoutGreen } from '../bot/cutout.js';
import { portraitPrompt, KIT_TEXT } from '../bot/cardstudio.js';

// 64×64 picture: bright green backdrop, a white-and-red "player" block in the middle with a small green patch inside it.
const W = 64, H = 64, px = new Uint8ClampedArray(W * H * 4);
const set = (x, y, r, g, b) => { const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const body = x >= 20 && x < 44 && y >= 8 && y < 60;
  if (!body) set(x, y, 0, 255, 0);
  else if (x >= 28 && x < 32 && y >= 28 && y < 32) set(x, y, 20, 200, 20); // a green detail wholly inside the figure
  else set(x, y, x % 8 < 3 ? 200 : 255, x % 8 < 3 ? 30 : 255, x % 8 < 3 ? 30 : 255);
}
const png = await encodePng(W, H, px);
const back = await decodePng(png);
t('png codec round-trips', back && back.w === W && back.h === H && back.px.every((v, i) => v === px[i]));
t('decoder refuses non-PNG', (await decodePng(new Uint8Array(64))) === null);

const cut = await cutoutGreen(png);
t('green backdrop removed', !!cut);
const out = await decodePng(cut.png);
const a = (x, y) => out.px[(y * W + x) * 4 + 3];
t('corner and edge backdrop are transparent', a(0, 0) === 0 && a(63, 63) === 0 && a(5, 30) === 0);
t('figure stays opaque', a(36, 20) === 255 && a(24, 50) >= 250);
t('green detail inside the figure survives', a(29, 29) === 255);
t('removed share reported', cut.removed > 0.4 && cut.removed < 0.7);

const flat = await encodePng(8, 8, new Uint8ClampedArray(8 * 8 * 4).fill(255));
t('picture with no green backdrop is left alone', (await cutoutGreen(flat)) === null);
t('prompts describe the kit and the green screen', portraitPrompt(false).includes(KIT_TEXT) && /#00FF00/.test(portraitPrompt(true)) && /Image 1 is the club kit/.test(portraitPrompt(true)) && !/Image 1 is the club kit/.test(portraitPrompt(false)));

done();
