# PDF → JPG

Convert PDF pages to JPG images right in your browser. **Maximum quality, very low bytes** — you control the trade-off.

🔒 **100% private.** Everything runs client-side with [pdf.js](https://mozilla.github.io/pdf.js/). Your files are never uploaded to any server.

## Features

- **Drag & drop** (or click to browse) a PDF
- **Quality slider** — tune JPG compression (1–100%); see each page's resulting file size live
- **Resolution slider** — render at 0.5×–4× for sharper output or smaller files
- **Background fill** — JPG has no transparency, so pick white or black
- **Live re-encode** — changing quality re-encodes instantly without re-rendering
- **Download** each page individually, or **all pages as a `.zip`**
- Works **offline** once loaded (single static page)

## Getting the best quality at low size

- Start at **quality ≈ 80%** and **2× resolution** — usually the sweet spot.
- Drop quality toward 70% before lowering resolution; JPG handles photos/scans well.
- For text-heavy pages, keep resolution at 2×+ so glyphs stay crisp.

## Run it locally

It's just static files. Any static server works:

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>. (Opening `index.html` directly also works in most browsers, but a local server avoids module/CORS quirks.)

## How it works

1. `pdf.js` parses the PDF and renders each page onto an HTML `<canvas>`.
2. `canvas.toBlob('image/jpeg', quality)` encodes the JPG.
3. [JSZip](https://stuk.github.io/jszip/) bundles all pages for the "Download all" button.

No build step, no backend, no dependencies to install.
