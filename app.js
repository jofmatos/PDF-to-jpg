import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const controls = document.getElementById("controls");
const qualityInput = document.getElementById("quality");
const qualityValue = document.getElementById("quality-value");
const scaleInput = document.getElementById("scale");
const scaleValue = document.getElementById("scale-value");
const bgSelect = document.getElementById("bg");
const downloadAllBtn = document.getElementById("download-all");
const resetBtn = document.getElementById("reset");
const statusEl = document.getElementById("status");
const pagesEl = document.getElementById("pages");

// Holds the parsed PDF and rendered results so we can re-export on settings change.
let pdfDoc = null;
let baseName = "page";
let rendered = []; // { pageNum, canvas, blob, url }
let rerenderTimer = null;

qualityInput.addEventListener("input", () => {
  qualityValue.textContent = qualityInput.value;
  scheduleReexport();
});
scaleInput.addEventListener("input", () => {
  scaleValue.textContent = Number(scaleInput.value).toFixed(2);
  scheduleRerender();
});
bgSelect.addEventListener("change", scheduleRerender);

downloadAllBtn.addEventListener("click", downloadAllZip);
resetBtn.addEventListener("click", reset);

// --- Drop zone wiring ---
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) loadPdf(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  })
);
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) loadPdf(file);
});

// --- Core ---
async function loadPdf(file) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    setStatus("⚠️ That doesn't look like a PDF.");
    return;
  }
  baseName = file.name.replace(/\.pdf$/i, "") || "page";
  setStatus(`<span class="spinner"></span>Reading PDF…`);
  clearPages();

  try {
    const buffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    controls.hidden = false;
    await renderAll();
  } catch (err) {
    console.error(err);
    setStatus("⚠️ Could not read that PDF. It may be corrupt or password-protected.");
  }
}

async function renderAll() {
  if (!pdfDoc) return;
  revokeUrls();
  rendered = [];
  clearPages();
  downloadAllBtn.disabled = true;

  const scale = Number(scaleInput.value);
  const total = pdfDoc.numPages;

  for (let n = 1; n <= total; n++) {
    setStatus(`<span class="spinner"></span>Rendering page ${n} of ${total}…`);
    const canvas = await renderPageToCanvas(n, scale);
    const entry = { pageNum: n, canvas, blob: null, url: null };
    rendered.push(entry);
    await exportEntry(entry);
    addCard(entry);
  }

  downloadAllBtn.disabled = false;
  reportTotal();
}

async function renderPageToCanvas(pageNum, scale) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  // JPG has no alpha — paint the chosen background first.
  ctx.fillStyle = bgSelect.value;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

function exportEntry(entry) {
  const quality = Number(qualityInput.value) / 100;
  return new Promise((resolve) => {
    entry.canvas.toBlob(
      (blob) => {
        if (entry.url) URL.revokeObjectURL(entry.url);
        entry.blob = blob;
        entry.url = URL.createObjectURL(blob);
        resolve();
      },
      "image/jpeg",
      quality
    );
  });
}

// Re-encode existing canvases at new quality (no re-render needed).
async function reexportAll() {
  if (!rendered.length) return;
  setStatus(`<span class="spinner"></span>Re-encoding…`);
  for (const entry of rendered) {
    await exportEntry(entry);
    updateCard(entry);
  }
  reportTotal();
}

function scheduleReexport() {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(reexportAll, 180);
}
function scheduleRerender() {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(renderAll, 180);
}

// --- UI helpers ---
function addCard(entry) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.page = entry.pageNum;
  card.innerHTML = `
    <img alt="Page ${entry.pageNum}" />
    <div class="card-body">
      <div class="card-meta">
        <span>Page ${entry.pageNum}</span>
        <span class="size"></span>
      </div>
      <a class="btn primary download" download>⬇ Download JPG</a>
    </div>`;
  pagesEl.appendChild(card);
  updateCard(entry);
}

function updateCard(entry) {
  const card = pagesEl.querySelector(`.card[data-page="${entry.pageNum}"]`);
  if (!card) return;
  const img = card.querySelector("img");
  const link = card.querySelector(".download");
  const size = card.querySelector(".size");
  img.src = entry.url;
  link.href = entry.url;
  link.download = `${baseName}-${String(entry.pageNum).padStart(3, "0")}.jpg`;
  size.textContent = formatBytes(entry.blob.size);
}

function reportTotal() {
  const total = rendered.reduce((sum, e) => sum + (e.blob?.size || 0), 0);
  const pages = rendered.length;
  setStatus(`✅ ${pages} page${pages > 1 ? "s" : ""} ready — ${formatBytes(total)} total.`);
}

async function downloadAllZip() {
  if (!rendered.length) return;
  setStatus(`<span class="spinner"></span>Zipping…`);
  const zip = new JSZip();
  for (const entry of rendered) {
    const name = `${baseName}-${String(entry.pageNum).padStart(3, "0")}.jpg`;
    zip.file(name, entry.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${baseName}-jpg.zip`);
  reportTotal();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reset() {
  revokeUrls();
  pdfDoc = null;
  rendered = [];
  clearPages();
  controls.hidden = true;
  downloadAllBtn.disabled = true;
  fileInput.value = "";
  setStatus("");
}

function clearPages() {
  pagesEl.innerHTML = "";
}

function revokeUrls() {
  rendered.forEach((e) => e.url && URL.revokeObjectURL(e.url));
}

function setStatus(html) {
  statusEl.innerHTML = html;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
