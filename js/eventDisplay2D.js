const SVG_NS = "http://www.w3.org/2000/svg";
const WALL_WIDTH = 640;
const WALL_HEIGHT = 300;
const CAP_SIZE = 180;
const MRD_WIDTH = 420;
const MRD_HEIGHT = 250;

export function initEventDisplay2D({ container, detectorGeometry }) {
  let currentEvent = null;

  function showEvent(event) {
    currentEvent = event;
    render();
  }

  function clear() {
    currentEvent = null;
    renderPlaceholder();
  }

  renderPlaceholder();

  return {
    showEvent,
    clear,
    getExportHtml: () => container.innerHTML,
  };

  function render() {
    if (!currentEvent) {
      renderPlaceholder();
      return;
    }

    const event = currentEvent;
    const title = event.category === "cosmic" ? "A cosmic background event" : `A ${event.truth.eventType} event`;
    container.innerHTML = `
      <div class="event-display-scroll">
        <header class="event-display-header">
          <div>
            <h2>${title}</h2>
            <p>Red square shows reconstructed vertex estimate</p>
          </div>
          <dl>
            <div><dt>PMT hits</dt><dd>${event.response?.totals?.pmtHits ?? 0}</dd></div>
            <div><dt>Total PE</dt><dd>${(event.response?.totals?.pmtCharge ?? 0).toFixed(1)}</dd></div>
            <div><dt>MRD layers</dt><dd>${event.observables.visibleMrdLayersCrossed}</dd></div>
          </dl>
        </header>
        <div class="event-display-figure">
          <div class="event-display-body">
            <section class="event-pmt-block" aria-label="ANNIE PMT charge display">
              <h3>ANNIE PMT Charge Display</h3>
              <div id="top-cap-map" class="event-svg-wrap event-cap-slot"></div>
              <div id="pmt-wall-map" class="event-svg-wrap event-wall-slot"></div>
              <div id="bottom-cap-map" class="event-svg-wrap event-cap-slot"></div>
            </section>
            <section class="event-mrd-column" aria-label="MRD event projections">
              <figure class="event-mrd-panel">
                <figcaption>MRD Side View</figcaption>
                <div id="mrd-side-map" class="event-svg-wrap"></div>
              </figure>
              <figure class="event-mrd-panel">
                <figcaption>MRD Top View</figcaption>
                <div id="mrd-top-map" class="event-svg-wrap"></div>
              </figure>
            </section>
          </div>
        </div>
      </div>
    `;

    renderWallMap(container.querySelector("#pmt-wall-map"), event);
    renderCapMap(container.querySelector("#top-cap-map"), event, "top");
    renderCapMap(container.querySelector("#bottom-cap-map"), event, "bottom");
    renderMrdSideView(container.querySelector("#mrd-side-map"), event);
    renderMrdTopView(container.querySelector("#mrd-top-map"), event);
  }

  function renderPlaceholder() {
    container.innerHTML = `
      <div class="event-display-empty">
        <h2>Event Display</h2>
        <p>Run an event to draw PMT charge maps and MRD hit projections.</p>
      </div>
    `;
  }

  function renderWallMap(root, event) {
    const svg = makeSvg(WALL_WIDTH, WALL_HEIGHT);
    const margin = { left: 58, right: 92, top: 26, bottom: 46 };
    const plot = {
      x: margin.left,
      y: margin.top,
      width: WALL_WIDTH - margin.left - margin.right,
      height: WALL_HEIGHT - margin.top - margin.bottom,
    };
    const tank = detectorGeometry.tank;
    const yMin = tank.centerMeters[1] - tank.heightMeters / 2;
    const yMax = tank.centerMeters[1] + tank.heightMeters / 2;
    const charges = chargeMap(event);
    const chargeMax = getChargeMax(charges);

    addRect(svg, plot.x, plot.y, plot.width, plot.height, "event-map-bg");
    addAxisLabel(svg, plot.x + plot.width / 2, WALL_HEIGHT - 10, "Azimuth around tank wall", "middle");
    addAxisLabel(svg, 14, plot.y + plot.height / 2, "Y vertical", "middle", -90);

    for (let i = 0; i <= 8; i += 1) {
      const x = plot.x + (i / 8) * plot.width;
      addLine(svg, x, plot.y, x, plot.y + plot.height, "event-grid-line");
    }
    for (let i = 0; i <= 5; i += 1) {
      const y = plot.y + (i / 5) * plot.height;
      addLine(svg, plot.x, y, plot.x + plot.width, y, "event-grid-line");
    }


    for (const pmt of detectorGeometry.pmtPositions.filter((entry) => entry.surface === "wall-frame")) {
      const angle = positiveAngle(Math.atan2(pmt.position.z, pmt.position.x));
      const cx = plot.x + (angle / (Math.PI * 2)) * plot.width;
      const cy = plot.y + (1 - (pmt.position.y - yMin) / (yMax - yMin)) * plot.height;
      const charge = charges.get(pmt.id) ?? 0;
      addCircle(svg, cx, cy, 5.4, chargeColor(charge, chargeMax), "event-pmt-circle", `${pmt.id}: ${charge.toFixed(1)} PE`);
    }

    drawVertexOnWall(svg, event, plot, yMin, yMax);
    renderChargeScale(svg, WALL_WIDTH - 66, plot.y + 14, 14, plot.height - 28, chargeMax);
    root.appendChild(svg);
  }

  function renderCapMap(root, event, surface) {
    const svg = makeSvg(CAP_SIZE, CAP_SIZE);
    const center = CAP_SIZE / 2;
    const radius = 64;
    const charges = chargeMap(event);
    const chargeMax = getChargeMax(charges);

    addCircle(svg, center, center, radius + 14, "none", "event-cap-outline");
    addText(svg, center, 23, surface === "top" ? "+Y cap" : "-Y cap", "event-small-label", "middle");

    for (const pmt of detectorGeometry.pmtPositions.filter((entry) => entry.surface === surface)) {
      const cx = center + (pmt.position.x / detectorGeometry.tank.radiusMeters) * radius;
      const cy = center + (pmt.position.z / detectorGeometry.tank.radiusMeters) * radius;
      const charge = charges.get(pmt.id) ?? 0;
      addCircle(svg, cx, cy, 7, chargeColor(charge, chargeMax), "event-pmt-circle", `${pmt.id}: ${charge.toFixed(1)} PE`);
    }

    root.appendChild(svg);
  }

  function renderMrdSideView(root, event) {
    const svg = makeSvg(MRD_WIDTH, MRD_HEIGHT);
    const margin = { left: 36, right: 18, top: 18, bottom: 34 };
    const plot = makeMrdPlot(margin);
    const tank = detectorGeometry.tank;
    const mrd = detectorGeometry.mrd;
    const yMin = tank.centerMeters[1] - Math.max(tank.heightMeters, mrd.heightMeters) / 2 - 0.2;
    const yMax = tank.centerMeters[1] + Math.max(tank.heightMeters, mrd.heightMeters) / 2 + 0.2;
    const zMin = -tank.radiusMeters - 0.25;
    const zMax = mrd.startZMeters + mrd.totalDepthMeters + 0.35;
    const sx = (z) => plot.x + ((z - zMin) / (zMax - zMin)) * plot.width;
    const sy = (y) => plot.y + (1 - (y - yMin) / (yMax - yMin)) * plot.height;

    addRect(svg, plot.x, plot.y, plot.width, plot.height, "event-map-bg");
    addRect(svg, sx(-tank.radiusMeters), sy(tank.centerMeters[1] + tank.heightMeters / 2), sx(tank.radiusMeters) - sx(-tank.radiusMeters), sy(tank.centerMeters[1] - tank.heightMeters / 2) - sy(tank.centerMeters[1] + tank.heightMeters / 2), "event-tank-outline");
    addRect(svg, sx(mrd.startZMeters), sy(tank.centerMeters[1] + mrd.heightMeters / 2), sx(mrd.startZMeters + mrd.totalDepthMeters) - sx(mrd.startZMeters), sy(tank.centerMeters[1] - mrd.heightMeters / 2) - sy(tank.centerMeters[1] + mrd.heightMeters / 2), "event-mrd-outline");
    drawMrdHits(svg, event, sx, sy, "side");
    drawTrack(svg, event, sx, sy, "zy");
    addAxisLabel(svg, plot.x + plot.width / 2, MRD_HEIGHT - 9, "Z beam/downstream", "middle");
    addAxisLabel(svg, 12, plot.y + plot.height / 2, "Y", "middle", -90);
    root.appendChild(svg);
  }

  function renderMrdTopView(root, event) {
    const svg = makeSvg(MRD_WIDTH, MRD_HEIGHT);
    const margin = { left: 36, right: 18, top: 18, bottom: 34 };
    const plot = makeMrdPlot(margin);
    const tank = detectorGeometry.tank;
    const mrd = detectorGeometry.mrd;
    const xMin = -Math.max(tank.radiusMeters, mrd.widthXMeters / 2) - 0.35;
    const xMax = Math.max(tank.radiusMeters, mrd.widthXMeters / 2) + 0.35;
    const zMin = -tank.radiusMeters - 0.25;
    const zMax = mrd.startZMeters + mrd.totalDepthMeters + 0.35;
    const sx = (z) => plot.x + ((z - zMin) / (zMax - zMin)) * plot.width;
    const sy = (x) => plot.y + (1 - (x - xMin) / (xMax - xMin)) * plot.height;

    addRect(svg, plot.x, plot.y, plot.width, plot.height, "event-map-bg");
    addCircle(svg, sx(0), sy(0), Math.abs(sx(tank.radiusMeters) - sx(0)), "none", "event-tank-outline");
    addRect(svg, sx(mrd.startZMeters), sy(mrd.widthXMeters / 2), sx(mrd.startZMeters + mrd.totalDepthMeters) - sx(mrd.startZMeters), sy(-mrd.widthXMeters / 2) - sy(mrd.widthXMeters / 2), "event-mrd-outline");
    drawMrdHits(svg, event, sx, sy, "top");
    drawTrack(svg, event, sx, sy, "zx");
    addAxisLabel(svg, plot.x + plot.width / 2, MRD_HEIGHT - 9, "Z beam/downstream", "middle");
    addAxisLabel(svg, 12, plot.y + plot.height / 2, "X", "middle", -90);
    root.appendChild(svg);
  }

  function drawMrdHits(svg, event, sx, sy, view) {
    const hits = event.observables.crossedMrdLayers ?? [];
    const mrd = detectorGeometry.mrd;
    const hitMaxTime = Math.max(1, ...hits.map((hit) => hit.hitTimeNs ?? 0));

    for (const hit of hits) {
      const point = hit.hitPointMeters;
      const z = layerZ(hit.layerIndex);
      const color = timeColor(hit.hitTimeNs ?? 0, hitMaxTime);
      if (view === "side") {
        if (hit.orientation === "horizontal") {
          const paddleHeight = mrd.heightMeters / mrd.paddleCountPerLayer;
          const y = detectorGeometry.tank.centerMeters[1] - mrd.heightMeters / 2 + (hit.paddleIndex + 0.5) * paddleHeight;
          addRect(svg, sx(z) - 5, sy(y + paddleHeight * 0.36), 10, Math.max(4, sy(y - paddleHeight * 0.36) - sy(y + paddleHeight * 0.36)), color, "event-hit-paddle");
        } else {
          addRect(svg, sx(z) - 5, sy(point[1] + 0.09), 10, Math.max(4, sy(point[1] - 0.09) - sy(point[1] + 0.09)), color, "event-hit-paddle");
        }
      } else if (hit.orientation === "vertical") {
        const paddleWidth = mrd.widthXMeters / mrd.paddleCountPerLayer;
        const x = -mrd.widthXMeters / 2 + (hit.paddleIndex + 0.5) * paddleWidth;
        addRect(svg, sx(z) - 5, sy(x + paddleWidth * 0.36), 10, Math.max(4, sy(x - paddleWidth * 0.36) - sy(x + paddleWidth * 0.36)), color, "event-hit-paddle");
      } else {
        addRect(svg, sx(z) - 5, sy(point[0] + 0.09), 10, Math.max(4, sy(point[0] - 0.09) - sy(point[0] + 0.09)), color, "event-hit-paddle");
      }
    }

    renderTimeScale(svg, MRD_WIDTH - 40, 30, 14, 74, hitMaxTime);
  }

  function drawTrack(svg, event, sx, sy, projection) {
    const track = event.display.muonFullTrack ?? event.display.cosmicTrack;
    if (!track) {
      return;
    }
    const start = track.start;
    const end = track.end;
    const x1 = projection === "zy" ? sx(start[2]) : sx(start[2]);
    const y1 = projection === "zy" ? sy(start[1]) : sy(start[0]);
    const x2 = projection === "zy" ? sx(end[2]) : sx(end[2]);
    const y2 = projection === "zy" ? sy(end[1]) : sy(end[0]);
    addLine(svg, x1, y1, x2, y2, "event-reco-track");
  }

  function drawVertexOnWall(svg, event, plot, yMin, yMax) {
    const vertex = event.display.vertex;
    if (!vertex) {
      return;
    }
    const angle = positiveAngle(Math.atan2(vertex[2], vertex[0]));
    const x = plot.x + (angle / (Math.PI * 2)) * plot.width;
    const y = plot.y + (1 - (vertex[1] - yMin) / (yMax - yMin)) * plot.height;
    addRect(svg, x - 5, y - 5, 10, 10, "event-vertex-marker");
  }

  function layerZ(layerIndex) {
    const mrd = detectorGeometry.mrd;
    return mrd.startZMeters
      + layerIndex * mrd.layerSpacingMeters
      + mrd.absorberThicknessMeters / 2
      + mrd.scintillatorThicknessMeters / 2
      + 0.018;
  }
}

function chargeMap(event) {
  return new Map((event.response?.pmtResponses ?? []).map((hit) => [hit.id, hit.hitCharge ?? 0]));
}

function getChargeMax() {
  return 12;
}

function makeMrdPlot(margin) {
  return {
    x: margin.left,
    y: margin.top,
    width: MRD_WIDTH - margin.left - margin.right,
    height: MRD_HEIGHT - margin.top - margin.bottom,
  };
}

function renderChargeScale(svg, x, y, width, height, chargeMax) {
  const steps = 24;
  for (let i = 0; i < steps; i += 1) {
    const fraction = i / (steps - 1);
    const stepY = y + (1 - fraction) * height;
    addRect(svg, x, stepY, width, height / steps + 1, chargeColor(fraction * chargeMax, chargeMax));
  }
  addText(svg, x + width + 8, y + 4, chargeMax.toFixed(0), "event-small-label", "start");
  addText(svg, x + width + 8, y + height, "0", "event-small-label", "start");
  addText(svg, x + width / 2, y + height + 24, "PMT Hit PE", "event-small-label", "middle");
}

function renderTimeScale(svg, x, y, width, height, maxTime) {
  const steps = 18;
  for (let i = 0; i < steps; i += 1) {
    const fraction = i / (steps - 1);
    const stepY = y + (1 - fraction) * height;
    addRect(svg, x, stepY, width, height / steps + 1, timeColor(fraction * maxTime, maxTime));
  }
  addText(svg, x + width / 2, y - 8, "MRD hit time", "event-small-label", "middle");
  addText(svg, x + width + 7, y + 4, `${maxTime.toFixed(0)} ns`, "event-small-label", "start");
  addText(svg, x + width + 7, y + height, "0", "event-small-label", "start");
}
function chargeColor(charge) {
  if (charge <= 0) {
    return "#16204f";
  }
  if (charge <= 2) {
    return interpolateRgb([22, 32, 79], [37, 102, 216], charge / 2);
  }
  if (charge <= 5) {
    return interpolateRgb([37, 102, 216], [35, 201, 109], (charge - 2) / 3);
  }
  if (charge <= 8) {
    return interpolateRgb([35, 201, 109], [255, 223, 58], (charge - 5) / 3);
  }
  return interpolateRgb([255, 223, 58], [255, 59, 34], Math.min((charge - 8) / 4, 1));
}

function interpolateRgb(start, end, fraction) {
  const t = clamp(fraction, 0, 1);
  return rgb(
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
    start[2] + (end[2] - start[2]) * t,
  );
}

function timeColor(time, maxTime) {
  const t = clamp(time / maxTime, 0, 1);
  return rgb(64 + 191 * t, 224 - 112 * t, 255 - 210 * t);
}

function rgb(r, g, b) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function positiveAngle(angle) {
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeSvg(width, height) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return svg;
}

function addRect(svg, x, y, width, height, fillOrClass, maybeClass) {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", Math.max(0, width));
  rect.setAttribute("height", Math.max(0, height));
  if (maybeClass) {
    rect.setAttribute("fill", fillOrClass);
    rect.setAttribute("class", maybeClass);
  } else if (fillOrClass?.startsWith?.("#") || fillOrClass?.startsWith?.("rgb") || fillOrClass === "none") {
    rect.setAttribute("fill", fillOrClass);
  } else {
    rect.setAttribute("class", fillOrClass);
  }
  svg.appendChild(rect);
  return rect;
}

function addCircle(svg, cx, cy, r, fill, className, title) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", cx);
  circle.setAttribute("cy", cy);
  circle.setAttribute("r", r);
  circle.setAttribute("fill", fill);
  if (className) {
    circle.setAttribute("class", className);
  }
  if (title) {
    const titleNode = document.createElementNS(SVG_NS, "title");
    titleNode.textContent = title;
    circle.appendChild(titleNode);
  }
  svg.appendChild(circle);
  return circle;
}

function addLine(svg, x1, y1, x2, y2, className) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("class", className);
  svg.appendChild(line);
  return line;
}

function addText(svg, x, y, text, className, anchor = "start", rotation = 0) {
  const node = document.createElementNS(SVG_NS, "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("class", className);
  node.setAttribute("text-anchor", anchor);
  if (rotation) {
    node.setAttribute("transform", `rotate(${rotation} ${x} ${y})`);
  }
  node.textContent = text;
  svg.appendChild(node);
  return node;
}

function addAxisLabel(svg, x, y, text, anchor, rotation = 0) {
  return addText(svg, x, y, text, "event-axis-label", anchor, rotation);
}
