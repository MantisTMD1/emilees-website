"use strict";

// Size charts for tees, in inches, from Mr. Sunshine's size chart images.
// To change a measurement, edit the numbers here.
const SIZE_CHARTS = {
  standard: {
    title: "Standard Tee Size Chart",
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    rows: [
      ["Body Length", "26 3/5", "28", "29 2/5", "30 3/4", "31 3/5", "32 1/2", "33 1/2"],
      ["Body Length Tolerance", "+/- 1 1/4", "+/- 1 1/4", "+/- 1 1/4", "+/- 1 1/4", "+/- 1 1/4", "+/- 1 1/4", "+/- 1 1/4"],
      ["Chest Tolerance", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1"],
      ["Chest Width (Laid Flat)", "18 1/4", "20 1/4", "22", "24", "26", "27 3/4", "29 3/4"],
    ],
  },
  cropped: {
    title: "Cropped Tee Size Chart",
    sizes: ["S", "M", "L", "XL", "2XL"],
    rows: [
      ["Body Length", "20", "21", "22", "23", "24"],
      ["Body Length Tolerance", "+/-1", "+/-1", "+/-1", "+/-1", "+/-1"],
      ["Chest Tolerance", "+/-3/4", "+/-3/4", "+/-3/4", "+/-3/4", "+/-3/4"],
      ["Chest Width (Laid Flat)", "18 1/4", "20 1/4", "22", "24", "26"],
      ["Sleeve Length", "15 5/8", "16 1/2", "17 3/8", "18 3/8", "19 1/4"],
    ],
  },
};

// Hoodie and jacket charts belong to one chart picture each in Shopify, matched by its file name.
// A new chart picture shows as a picture until a table for it is added here.
const JACKET_NOTE = "Please note measurements can vary within 1 inch, this is within our tolerance.";
const CHARTS_BY_IMAGE = {
  // Tipper Frog Hoodie
  "D4B15836-DCF4-40AA-93BA-05F8CF23B28A.jpg": {
    title: "Size Chart",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    rows: [
      ["Body Length", "26 1/2", "27 1/2", "28 1/2", "29 1/2", "30 1/2", "32", "33"],
      ["Body Length Tolerance", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1"],
      ["Chest Tolerance", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1"],
      ["Chest Width (Laid Flat)", "22", "23 1/4", "24 1/2", "25 1/2", "26 3/4", "28", "29"],
      ["Sleeve Length (From Center Back)", "35", "36", "37", "38", "39", "40", "41"],
      ["Sleeve Tolerance", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1", "+/- 1"],
    ],
  },
  // Follow The Glitch Jacket, Shh Jacket
  "18CC5EBC-07B4-4CA3-88B8-4B31EE535CC9.jpg": {
    title: "Size Chart",
    corner: "Measurement",
    sizes: ["SML", "MED", "LRG", "XLG", "2XL", "3XL"],
    rows: [
      ["Body Width (inches)", "21-1/2", "22-1/2", "23-1/2", "24-1/2", "25-1/2", "26-1/2"],
      ["Body Length (inches)", "27-1/2", "28-1/4", "29-1/4", "30", "30-3/4", "31-1/2"],
    ],
    note: JACKET_NOTE,
  },
  // Pixel Garden Jacket
  "E3129003-56C6-4029-9095-1B476F11BA66.jpg": {
    title: "Size Chart",
    corner: "Measurement",
    sizes: ["XSM", "SML", "MED", "LRG", "XLG", "2XL", "3XL"],
    rows: [
      ["Body Width (inches)", "20-1/2", "20-1/2", "22-1/2", "23-1/2", "24-1/2", "25-1/2", "26-1/2"],
      ["Body Length (inches)", "26-1/2", "27-1/4", "28", "28-3/4", "29-1/2", "30-1/2", "31"],
    ],
    note: JACKET_NOTE,
  },
};

// The tables a product gets, and any chart pictures with no table (those stay in the photos).
// Tees (not the women's crop tee, a different brand) all share the Standard/Cropped charts:
// a "Fit Style" option picks them, otherwise "Crop" in the name means the cropped chart.
function sizeChartsFor(product) {
  const fileName = (src) => src.split("/").pop().split("?")[0];
  const charts = [];
  let leftover = product.chartImages || [];
  if (product.type === "T-Shirt" && !/women/i.test(product.title)) {
    const fit = product.options.find((o) => /fit/i.test(o.name));
    const values = fit ? fit.values.join(" ") : "";
    if (fit ? /standard/i.test(values) : !/crop/i.test(product.title)) charts.push(SIZE_CHARTS.standard);
    if (fit ? /crop/i.test(values) : /crop/i.test(product.title)) charts.push(SIZE_CHARTS.cropped);
    leftover = [];
  } else {
    leftover = leftover.filter((src) => {
      const chart = CHARTS_BY_IMAGE[fileName(src)];
      if (chart && !charts.includes(chart)) charts.push(chart);
      return !chart;
    });
  }
  return { charts, leftover };
}

function sizeChartTable(chart) {
  const section = document.createElement("section");
  section.className = "size-chart";
  const id = `chart-${chart.title.toLowerCase().replace(/\W+/g, "-")}-${++sizeChartTable.count}`;
  section.setAttribute("aria-labelledby", id);
  const heading = document.createElement("h2");
  heading.id = id;
  heading.textContent = chart.title;
  const scroller = document.createElement("div");
  scroller.className = "size-chart__scroll";
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  scroller.setAttribute("aria-labelledby", id);
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  if (chart.corner) {
    const corner = document.createElement("th");
    corner.scope = "col";
    corner.textContent = chart.corner;
    head.append(corner);
  } else head.append(document.createElement("td"));
  for (const size of chart.sizes) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = size;
    head.append(th);
  }
  const body = table.createTBody();
  for (const [label, ...cells] of chart.rows) {
    const row = body.insertRow();
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = label;
    row.append(th);
    for (const value of cells) row.insertCell().textContent = value;
  }
  scroller.append(table);
  section.append(heading, scroller);
  if (chart.note) {
    const note = document.createElement("p");
    note.className = "size-chart__note";
    note.textContent = chart.note;
    section.append(note);
  }
  return section;
}
sizeChartTable.count = 0;
