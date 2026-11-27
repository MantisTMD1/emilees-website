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

// Which charts a product gets: tees only (not the women's crop tee, which has its own chart image).
// A "Fit Style" option picks the charts; otherwise "Crop" in the name means the cropped chart.
function sizeChartsFor(product) {
  if (product.type !== "T-Shirt" || /women/i.test(product.title)) return [];
  const fit = product.options.find((o) => /fit/i.test(o.name));
  const values = fit ? fit.values.join(" ") : "";
  const charts = [];
  if (fit ? /standard/i.test(values) : !/crop/i.test(product.title)) charts.push(SIZE_CHARTS.standard);
  if (fit ? /crop/i.test(values) : /crop/i.test(product.title)) charts.push(SIZE_CHARTS.cropped);
  return charts;
}

function sizeChartTable(chart) {
  const section = document.createElement("section");
  section.className = "size-chart";
  const id = `chart-${chart.title.toLowerCase().replace(/\W+/g, "-")}`;
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
  head.append(Object.assign(document.createElement("td")));
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
  return section;
}
