// Regenerates the subset fonts in public/fonts/.
//
// Full Noto Sans SC fonts (~10 MB per weight) are too heavy for the PWA
// precache, so we ship subsets covering ASCII, Latin-1, the full GB2312
// repertoire, and common symbols (~2.3 MB per weight). Code runs use Noto
// Sans Mono, subset to printable ASCII only (~30 KB). Run:
//
//   node scripts/subset-fonts.mjs
//
// Source fonts are downloaded from Google Fonts when font-src/ is empty.
// Requires the subset-font devDependency. Noto Sans SC and Noto Sans Mono are
// licensed under the SIL OFL 1.1 (see public/fonts/OFL.txt).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "font-src");
const outDir = join(root, "public", "fonts");

const WEIGHTS = [
  { weight: 400, name: "regular" },
  { weight: 700, name: "bold" },
];

// Google Fonts only serves TTF to ancient user agents; modern ones get woff2,
// which fontkit (used by pdf-lib at export time) cannot embed.
const TTF_USER_AGENT =
  "Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1";

function buildCharset() {
  let chars = "";
  for (let cp = 0x20; cp <= 0x7e; cp++) chars += String.fromCodePoint(cp);
  for (let cp = 0xa1; cp <= 0xff; cp++) chars += String.fromCodePoint(cp);
  const decoder = new TextDecoder("gb2312");
  const replacement = String.fromCodePoint(0xfffd);
  for (let lead = 0xa1; lead <= 0xf7; lead++) {
    for (let trail = 0xa1; trail <= 0xfe; trail++) {
      const decoded = decoder.decode(new Uint8Array([lead, trail]));
      if (decoded && !decoded.includes(replacement)) chars += decoded;
    }
  }
  chars += "×÷±≈≠≤≥→←↑↓↔↗↘∠⊥∥△▱⊙∴∵°′″‰¼½¾§†‡•…—–‘’“”《》〈〉【】〔〕「」『』、。，；：？！·〜￥";
  chars += "αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩ";
  chars += "∀∂∃∅∇∈∉∋∏∑−∓∕∗∘√∝∞∣∤∥∧∨∩∪∫∬∮≠≡≈≃≅≈⊂⊃⊆⊇⊕⊗⊥⋅⌈⌉⌊⌋";
  chars += "①②③④⑤⑥⑦⑧⑨⑩⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽";
  return [...new Set(chars)].join("");
}

async function fetchFontUrl(family, weight) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`,
    { headers: { "User-Agent": TTF_USER_AGENT } },
  ).then((r) => r.text());
  const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error(`no TTF url found for ${family} weight ${weight}`);
  return url;
}

async function loadSourceFont(family, weight, fileName) {
  const local = join(srcDir, fileName);
  try {
    return await readFile(local);
  } catch {
    const url = await fetchFontUrl(family, weight);
    console.log(`downloading ${url}`);
    const bytes = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
    await mkdir(srcDir, { recursive: true });
    await writeFile(local, bytes);
    return bytes;
  }
}

async function fetchLicense() {
  const url = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt";
  const text = await fetch(url).then((r) => r.text());
  await writeFile(join(outDir, "OFL.txt"), text);
}

await mkdir(outDir, { recursive: true });
const charset = buildCharset();
console.log(`charset: ${charset.length} code points`);

for (const { weight, name } of WEIGHTS) {
  const fileName = `NotoSansSC-${name === "regular" ? "Regular" : "Bold"}.ttf`;
  const input = await loadSourceFont("Noto+Sans+SC", weight, fileName);
  const output = await subsetFont(input, charset, { targetFormat: "truetype" });
  const out = join(outDir, `noto-sans-sc-${name}.ttf`);
  await writeFile(out, output);
  console.log(`${out}: ${(input.length / 1e6).toFixed(2)}MB -> ${(output.length / 1e6).toFixed(2)}MB`);
}

// Mono font for code runs: printable ASCII only (the rest falls back to the
// Noto Sans SC subsets, on screen and in PDF exports alike).
let ascii = "";
for (let cp = 0x20; cp <= 0x7e; cp++) ascii += String.fromCodePoint(cp);
const monoInput = await loadSourceFont("Noto+Sans+Mono", 400, "NotoSansMono-Regular.ttf");
const monoOutput = await subsetFont(monoInput, ascii, { targetFormat: "truetype" });
const monoOut = join(outDir, "noto-sans-mono-regular.ttf");
await writeFile(monoOut, monoOutput);
console.log(
  `${monoOut}: ${(monoInput.length / 1e6).toFixed(2)}MB -> ${(monoOutput.length / 1e6).toFixed(2)}MB`,
);

await fetchLicense();
