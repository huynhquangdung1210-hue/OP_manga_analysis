import { useMemo, useState } from "react";
import PlotlyChart from "./PlotlyChart.jsx";
import { rollingMean } from "../data/transform.js";

const xOptions = [
  { value: "episodeNumber", label: "Episode Number" },
  { value: "dateAired", label: "Date Aired" }
];

const palette = [
  "#c34934",
  "#2c6e6f",
  "#6a4c93",
  "#b07d62",
  "#4b778d",
  "#9b5c6a",
  "#3d5a80",
  "#e07a5f",
  "#81b29a",
  "#f2cc8f",
  "#6d597a",
  "#b56576",
  "#355070",
  "#8d5f45",
  "#4a4e69"
];

function findEpisodeByNumber(data, episodeNumber) {
  return data.find((row) => row.episodeNumber === episodeNumber);
}

export default function TechniqueDebutsChart({ data, arcs }) {
  const [xKey, setXKey] = useState("episodeNumber");
  const [legendOpen, setLegendOpen] = useState(true);

  const { plotData, layout, characters, xRange } = useMemo(() => {
    if (!data) return { plotData: [], layout: { title: "" }, characters: [] };

    const xValues = data.episodes.map((ep) => ep[xKey]);
    const xRange = (() => {
      if (xKey === "dateAired") {
        const dates = data.episodes.map((ep) => ep.dateAired).filter(Boolean);
        if (!dates.length) return [null, null];
        const sorted = dates.slice().sort((a, b) => Date.parse(a) - Date.parse(b));
        return [sorted[0], sorted[sorted.length - 1]];
      }
      return [Math.max(1, data.episodes[0]?.episodeNumber || 1), data.episodes[data.episodes.length - 1]?.episodeNumber];
    })();

    const shapes = [];
    (arcs || []).forEach((arc) => {
      let x0 = arc.fromEpisode;
      let x1 = arc.toEpisode;

      if (xKey === "dateAired") {
        const start = findEpisodeByNumber(data.episodes, arc.fromEpisode);
        const end = findEpisodeByNumber(data.episodes, arc.toEpisode);
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

    const series = data.series || [];
    const traces = series.flatMap((entry, idx) => {
      const color = palette[idx % palette.length];
      const rolling = rollingMean(entry.values, 10);
      return [
        {
          x: xValues,
          y: entry.values,
          mode: "lines",
          line: { width: 2, color },
          customdata: data.episodes.map((ep, idx2) => [
            ep.episodeNumber,
            ep.dateAired,
            entry.character,
            entry.values[idx2],
            rolling[idx2]
          ]),
          showlegend: false
        }
      ];
    });

    traces.push({
      x: xValues,
      y: data.avgLine || [],
      mode: "lines",
      line: { color: "#1f1f1f", width: 2.4, dash: "dash" },
      customdata: data.episodes.map((ep, idx2) => [
        ep.episodeNumber,
        ep.dateAired,
        (data.avgLine || [])[idx2] || 0
      ]),
      showlegend: false
    });

    return {
      plotData: traces,
      layout: {
        title: "Technique debuts by character (running totals)",
        xaxis: {
          title: xKey === "episodeNumber" ? "Episode number" : "Airdate",
          type: xKey === "dateAired" ? "date" : "linear",
          range: xRange
        },
        yaxis: { title: "Running total techniques", fixedrange: true },
        shapes,
        showlegend: false,
        dragmode: "pan"
      },
      characters: series.map((s, idx) => ({
        name: s.character,
        color: palette[idx % palette.length]
      })),
      xRange
    };
  }, [data, arcs, xKey]);

  const xClamp = useMemo(() => {
    if (!xRange) return null;
    const [min, max] = xRange;
    if (!min || !max) return null;
    return { min, max };
  }, [xRange]);

  const tooltipFormatter = (point) => {
    const custom = point.customdata || [];
    if (!custom.length) return null;
    if (custom.length === 3) {
      const [ep, date, avg] = custom;
      return [
        `<strong>Episode ${ep ?? "-"}</strong>`,
        date ? `<div>${date}</div>` : "",
        `<div>Avg techniques/character: ${avg?.toFixed ? avg.toFixed(2) : avg}</div>`
      ].join("");
    }
    const [ep, date, character, actual, rolling] = custom;
    return [
      `<strong>${character}</strong>`,
      `<div>Episode ${ep ?? "-"}</div>`,
      date ? `<div>${date}</div>` : ""
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
      </div>
      <div className="metric-layout">
        <div className="metric-chart">
          <PlotlyChart
            data={plotData}
            layout={layout}
            height={520}
            xClamp={xClamp}
            tooltipFormatter={tooltipFormatter}
          />
        </div>
        <aside className={`metric-legend ${legendOpen ? "open" : ""}`}>
          <div className="legend-header">
            <div>
              <strong>Characters</strong>
              <div className="legend-subtitle">Characters with 10+ techniques.</div>
            </div>
            <button
              type="button"
              className="legend-toggle"
              onClick={() => setLegendOpen((prev) => !prev)}
            >
              {legendOpen ? "Hide" : "Show"}
            </button>
          </div>
          <div className="legend-body">
            {characters.map((item) => (
              <div key={item.name} className="legend-arc">
                <span className="legend-swatch" style={{ background: item.color }} />
                <span>{item.name}</span>
              </div>
            ))}
            <div className="legend-group">
              <div className="legend-saga" style={{ marginTop: "14px" }}>
                <span className="legend-swatch" style={{ background: "#1f1f1f" }} />
                <span>Average techniques per character</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
