import { useMemo, useState } from "react";
import PlotlyChart from "./PlotlyChart.jsx";
import { rollingMean } from "../data/transform.js";

const xOptions = [
  { value: "episodeNumber", label: "Episode Number" },
  { value: "dateAired", label: "Date Aired" }
];

const yOptions = [
  { value: "characterDebuts", label: "Character Debuts" },
  { value: "characterAppearances", label: "Character Appearances" }
];

function findEpisodeByNumber(data, episodeNumber) {
  return data.find((row) => row.episodeNumber === episodeNumber);
}

export default function UnifiedMetricChart({ data, arcs, annotations }) {
  const [xKey, setXKey] = useState("episodeNumber");
  const [yKey, setYKey] = useState("characterDebuts");

  const { plotData, layout } = useMemo(() => {
    if (!data?.length) {
      return { plotData: [], layout: { title: "" } };
    }

    const xValues = data.map((row) => row[xKey]);
    const yValues = data.map((row) => row[yKey]);
    const rolling = rollingMean(yValues, 10);
    const maxY = Math.max(...yValues, 0);

    const shapes = [];

    (arcs || []).forEach((arc) => {
      let x0 = arc.fromEpisode;
      let x1 = arc.toEpisode;

      if (xKey === "dateAired") {
        const start = findEpisodeByNumber(data, arc.fromEpisode);
        const end = findEpisodeByNumber(data, arc.toEpisode);
        if (!start?.dateAired || !end?.dateAired) return;
        x0 = start.dateAired;
        x1 = end.dateAired;
      }

      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0,
        x1,
        y0: 0,
        y1: 1,
        fillcolor: arc.arcColor,
        opacity: 0.35,
        line: { width: 0 }
      });

    });

    const activeAnnotations = (annotations || []).filter((a) => a.xType === xKey);
    const annotationShapes = activeAnnotations.map((a) => ({
      type: "line",
      xref: "x",
      yref: "paper",
      x0: a.xValue,
      x1: a.xValue,
      y0: 0,
      y1: 1,
      line: { color: "rgba(20,19,26,0.5)", width: 1, dash: "dash" }
    }));

    const annotationBoxes = activeAnnotations.map((a) => ({
      x: a.xValue,
      y: maxY * 0.92,
      text: `<b>${a.title}</b><br>${a.description}`,
      showarrow: true,
      arrowhead: 2,
      ax: 0,
      ay: -40,
      bgcolor: "rgba(255,255,255,0.9)",
      bordercolor: "rgba(20,19,26,0.3)",
      borderwidth: 1,
      font: { size: 11, color: "#14131a" }
    }));

    const hoverAnnotations = activeAnnotations.map((a) => ({
      x: [a.xValue],
      y: [maxY],
      mode: "markers",
      marker: { size: 14, color: "rgba(0,0,0,0)" },
      hoverinfo: "text",
      hovertext: `${a.title}: ${a.description}`,
      showlegend: false
    }));

    const axisTitle = yOptions.find((opt) => opt.value === yKey)?.label || "Metric";
    const xTitle = xOptions.find((opt) => opt.value === xKey)?.label || "X";
    const xRange = (() => {
      if (xKey === "dateAired") {
        const dates = data.map((row) => row.dateAired).filter(Boolean);
        if (!dates.length) return [null, null];
        const sorted = dates.slice().sort((a, b) => Date.parse(a) - Date.parse(b));
        return [sorted[0], sorted[sorted.length - 1]];
      }
      return [Math.max(1, data[0]?.episodeNumber || 1), data[data.length - 1]?.episodeNumber];
    })();

    return {
      plotData: [
        {
          x: xValues,
          y: yValues,
          mode: "markers",
          marker: { size: 6, color: "#14131a" },
          customdata: data.map((row, idx) => [
            row.episodeNumber,
            row.dateAired,
            row[yKey],
            rolling[idx]
          ])
        },
        {
          x: xValues,
          y: rolling,
          mode: "lines",
          line: { color: "#c34934", width: 2.2 },
          showlegend: false
        },
        ...hoverAnnotations
      ],
      layout: {
        title: "Episode analytics overview",
        xaxis: {
          title: xTitle,
          type: xKey === "dateAired" ? "date" : "linear",
          range: xRange
        },
        yaxis: { title: axisTitle, fixedrange: true },
        shapes: [...shapes, ...annotationShapes],
        annotations: annotationBoxes,
        showlegend: false,
        dragmode: "pan",
        transition: { duration: 350, easing: "cubic-in-out" },
        margin: { l: 50, r: 30, t: 50, b: 70 }
      },
      xRange
    };
  }, [data, arcs, annotations, xKey, yKey]);

  const xClamp = useMemo(() => {
    if (!layout?.xaxis?.range) return null;
    const [min, max] = layout.xaxis.range;
    if (!min || !max) return null;
    return { min, max };
  }, [layout]);

  const tooltipFormatter = (point) => {
    const custom = point.customdata || [];
    if (!custom.length) return null;
    const [ep, date, actual, avg] = custom;
    const yLabel = yOptions.find((opt) => opt.value === yKey)?.label || "Metric";
    return [
      `<strong>Episode ${ep ?? "-"}</strong>`,
      date ? `<div>${date}</div>` : "",
      `<div>${yLabel}: ${actual ?? "-"}</div>`
    ].join("");
  };

  return (
    <section className="metric-container">
      <div className="metric-controls">
        <div className="control">
          <span>X Axis</span>
          <select value={xKey} onChange={(event) => setXKey(event.target.value)}>
            {xOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="control">
          <span>Y Axis</span>
          <select value={yKey} onChange={(event) => setYKey(event.target.value)}>
            {yOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="metric-chart">
        <PlotlyChart
          data={plotData}
          layout={layout}
          height={520}
          xClamp={xClamp}
          tooltipFormatter={tooltipFormatter}
        />
      </div>
    </section>
  );
}
