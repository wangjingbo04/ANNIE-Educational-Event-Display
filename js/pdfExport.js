export async function exportCurrentView({ format, view, sceneDisplay, eventDisplay2D, event }) {
  if (format === "pdf") {
    return exportCurrentViewToPdf({ view, sceneDisplay, eventDisplay2D, event });
  }

  const extension = format === "jpeg" ? "jpg" : "png";
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";

  try {
    const dataUrl = view === "event-display"
      ? await captureEventDisplayAsImage(mimeType)
      : await convertImageDataUrl(sceneDisplay.captureImage(), mimeType);

    downloadDataUrl(dataUrl, `${timestampedFilename()}.${extension}`);
    return true;
  } catch (error) {
    console.warn("Export failed", error);
    return false;
  }
}
export function exportCurrentViewToPdf({ view, sceneDisplay, eventDisplay2D, event }) {
  const title = getEventTitle(event, view);
  const body = view === "event-display"
    ? buildEventDisplayExport(title, eventDisplay2D.getExportHtml())
    : buildSceneExport(title, sceneDisplay.captureImage());

  const exportWindow = window.open("", "annie-pdf-export", "width=1200,height=900");
  if (!exportWindow) {
    return false;
  }

  exportWindow.document.open();
  exportWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <base href="${document.baseURI}" />
        <title>${escapeHtml(title)}</title>
        <link rel="stylesheet" href="css/style.css" />
        <link rel="stylesheet" href="css/eventDisplay.css" />
        <style>
          @page { size: landscape; margin: 0.35in; }
          html, body { width: auto; height: auto; overflow: visible; background: #0c0f12; }
          body { padding: 0; color: #eef4f7; font-family: Arial, Helvetica, sans-serif; }
          .pdf-page { display: grid; gap: 12px; }
          .pdf-title { display: flex; align-items: end; justify-content: space-between; gap: 16px; border-bottom: 1px solid #34404a; padding-bottom: 8px; }
          .pdf-title h1 { margin: 0; font-size: 18px; letter-spacing: 0; }
          .pdf-title p { margin: 0; color: #9fb0bb; font-size: 11px; }
          .pdf-scene-image { width: 100%; max-height: 7in; object-fit: contain; border: 1px solid #34404a; border-radius: 8px; background: #0c0f12; }
          .pdf-event-display #event-display-container { height: auto; overflow: visible; }
          .pdf-event-display .event-display-scroll { height: auto; overflow: visible; padding: 0; }
          .pdf-event-display .event-display-header { margin-top: 0; }
          .pdf-event-display .event-display-figure { max-width: none; }
          .pdf-event-display .event-svg-wrap svg { max-height: none; }
          .pdf-note { color: #9fb0bb; font-size: 10px; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            button { display: none; }
          }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `);
  exportWindow.document.close();
  exportWindow.focus();
  window.setTimeout(() => exportWindow.print(), 350);

  return true;
}

function buildSceneExport(title, imageDataUrl) {
  return `
    <main class="pdf-page">
      <header class="pdf-title">
        <h1>${escapeHtml(title)}</h1>
        <p>3D detector view</p>
      </header>
      <img class="pdf-scene-image" src="${imageDataUrl}" alt="ANNIE 3D event display" />
      <p class="pdf-note">Exported from ANNIE Summer Camp Simulator. Use the browser print dialog to save as PDF.</p>
    </main>
  `;
}

function buildEventDisplayExport(title, displayHtml) {
  return `
    <main class="pdf-page pdf-event-display">
      <header class="pdf-title">
        <h1>${escapeHtml(title)}</h1>
        <p>2D event display</p>
      </header>
      <section id="event-display-container">${displayHtml}</section>
      <p class="pdf-note">Exported from ANNIE Summer Camp Simulator. Use the browser print dialog to save as PDF.</p>
    </main>
  `;
}

function getEventTitle(event, view) {
  if (!event) {
    return view === "event-display" ? "ANNIE 2D Event Display" : "ANNIE 3D Event Display";
  }

  const eventName = event.truth?.eventType ?? "Unknown Event";
  return `${eventName} - ANNIE ${view === "event-display" ? "2D" : "3D"} Event Display`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  })[character]);
}

async function captureEventDisplayAsImage(mimeType) {
  const source = document.querySelector("#event-display-container");
  if (!source) {
    throw new Error("2D event display is not available for export.");
  }

  const sourceRect = source.getBoundingClientRect();
  const width = Math.ceil(Math.max(source.scrollWidth, sourceRect.width, 1200));
  const height = Math.ceil(Math.max(source.scrollHeight, sourceRect.height, 800));
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.fillStyle = "#0c0f12";
  context.fillRect(0, 0, width, height);

  await drawDomText(context, source, sourceRect);
  const svgs = Array.from(source.querySelectorAll("svg"));
  for (const svg of svgs) {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const image = await svgElementToImage(svg);
    context.drawImage(image, rect.left - sourceRect.left, rect.top - sourceRect.top, rect.width, rect.height);
  }

  return canvas.toDataURL(mimeType, mimeType === "image/jpeg" ? 0.95 : undefined);
}

async function drawDomText(context, source, sourceRect) {
  const textNodes = Array.from(source.querySelectorAll("h2, h3, p, figcaption, dt, dd"));
  textNodes.forEach((node) => {
    if (node.closest("svg")) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const style = window.getComputedStyle(node);
    const fontSize = parseFloat(style.fontSize) || 12;
    const fontWeight = style.fontWeight || "400";
    const fontFamily = style.fontFamily || "Arial, sans-serif";
    context.fillStyle = style.color || "#eef4f7";
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    context.textAlign = style.textAlign === "center" ? "center" : "left";
    context.textBaseline = "top";
    const x = rect.left - sourceRect.left + (context.textAlign === "center" ? rect.width / 2 : 0);
    const y = rect.top - sourceRect.top;
    wrapCanvasText(context, node.textContent.trim(), x, y, rect.width, fontSize * 1.25);
  });
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight) {
  if (!text) return;
  const words = text.split(/\s+/);
  let line = "";
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  });
  if (line) context.fillText(line, x, y);
}

function svgElementToImage(svg) {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true);
    inlineSvgStyles(svg, clone);
    const rect = svg.getBoundingClientRect();
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", Math.ceil(rect.width));
    clone.setAttribute("height", Math.ceil(rect.height));
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not rasterize SVG panel."));
    };
    image.src = url;
  });
}

function inlineSvgStyles(sourceNode, cloneNode) {
  const sourceNodes = [sourceNode, ...sourceNode.querySelectorAll("*")];
  const cloneNodes = [cloneNode, ...cloneNode.querySelectorAll("*")];
  sourceNodes.forEach((source, index) => {
    const clone = cloneNodes[index];
    const style = window.getComputedStyle(source);
    const properties = ["fill", "stroke", "stroke-width", "stroke-opacity", "fill-opacity", "opacity", "font-size", "font-family", "font-weight", "text-anchor"];
    clone.setAttribute("style", properties.map((property) => `${property}:${style.getPropertyValue(property)};`).join(""));
  });
}

function svgToDataUrl(svg, width, height, mimeType) {
  return new Promise((resolve) => {
    const image = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    image.onerror = () => resolve(null);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");
      context.fillStyle = "#0c0f12";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(mimeType, mimeType === "image/jpeg" ? 0.95 : undefined));
    };
    image.src = url;
  });
}

function convertImageDataUrl(dataUrl, mimeType) {
  if (mimeType === "image/png") {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve(null);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.fillStyle = "#0c0f12";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL(mimeType, 0.95));
    };
    image.src = dataUrl;
  });
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function timestampedFilename() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `ANNIE_Event_Display_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}









