// Cloudflare Worker native SVG → PNG rasterizer powered by @resvg/resvg-wasm + bundled Oswald-Bold.ttf.
// Cloudflare Images (env.IMAGES) does not rasterize SVG to PNG; resvg-wasm renders pixel-perfect PNGs in-Worker.
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import oswaldBold from './fonts/Oswald-Bold.ttf';

let ready = null;
const fontBytes = () => (oswaldBold instanceof Uint8Array ? oswaldBold : new Uint8Array(oswaldBold));

async function ensureWasm() {
  if (!ready) ready = initWasm(resvgWasm).catch((e) => { ready = null; throw e; });
  return ready;
}

export async function svgToPng(svg) {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    font: {
      fontBuffers: [fontBytes()],
      defaultFontFamily: 'Oswald',
      loadSystemFonts: false,
    },
  });
  return resvg.render().asPng();
}
