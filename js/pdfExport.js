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
