import { useEffect, useMemo, useState } from "react";
import PlotlyChart from "./PlotlyChart.jsx";
import { rollingMean } from "../data/transform.js";

const xOptions = [
  { value: "episodeNumber", label: "Episode Number" },
  { value: "dateAired", label: "Date Aired" }
];

const modeOptions = [
  { value: "contributors", label: "To see who contributed to each episode" },
  { value: "uniqueCount", label: "To see how many contributors there were to OP" }
];

const rolePalette = ["#2c6e6f", "#c34934", "#6a4c93", "#8a6d3b"];

function findEpisodeByNumber(data, episodeNumber) {
  return data.find((row) => row.episodeNumber === episodeNumber);
}

export default function CrewCreditsChart({ series, arcs, roles }) {
  const [xKey, setXKey] = useState("episodeNumber");
  const [mode, setMode] = useState("contributors");
  const [role, setRole] = useState(roles?.[0] || "Animator");
  const [showArcs, setShowArcs] = useState(true);

  useEffect(() => {
    if (!roles?.length) return;
    if (!roles.includes(role)) {
      setRole(roles[0]);
    }
  }, [roles, role]);

  const { plotData, layout } = useMemo(() => {
    if (!series?.length) return { plotData: [], layout: { title: "" } };

    const xValues = series.map((row) => row[xKey]);
    const shapes = [];

    if (showArcs) {
      (arcs || []).forEach((arc) => {
        let x0 = arc.fromEpisode;
        let x1 = arc.toEpisode;

        if (xKey === "dateAired") {
          const start = findEpisodeByNumber(series, arc.fromEpisode);
          const end = findEpisodeByNumber(series, arc.toEpisode);
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
    }

    const axisTitle =
      mode === "contributors" ? "Contributor" : "Unique contributor count";
    const xTitle = xOptions.find((opt) => opt.value === xKey)?.label || "X";
    const xRange = (() => {
      if (xKey === "dateAired") {
        const dates = series.map((row) => row.dateAired).filter(Boolean);
        if (!dates.length) return [null, null];
        const sorted = dates.slice().sort((a, b) => Date.parse(a) - Date.parse(b));
        return [sorted[0], sorted[sorted.length - 1]];
      }
      return [Math.max(1, series[0]?.episodeNumber || 1), series[series.length - 1]?.episodeNumber];
    })();

    if (mode === "contributors") {
      const points = series
        .filter((row) => row.contributors?.[role])
        .map((row) => ({
          x: row[xKey],
          y: row.contributors[role],
          episodeNumber: row.episodeNumber,
          dateAired: row.dateAired
        }));

      return {
        plotData: [
          {
            x: points.map((p) => p.x),
            y: points.map((p) => p.y),
            mode: "markers",
            marker: { size: 6, color: "#14131a" },
            customdata: points.map((p) => [p.episodeNumber, p.dateAired])
          }
        ],
        layout: {
          title: `${role} contributions by episode`,
          xaxis: { title: xTitle, type: xKey === "dateAired" ? "date" : "linear", range: xRange },
          yaxis: {
            title: axisTitle,
            fixedrange: true,
            automargin: true,
            tickfont: { size: 10 }
          },
          shapes,
          showlegend: false,
          dragmode: "pan",
          transition: { duration: 350, easing: "cubic-in-out" }
        }
      };
    }

    const roleSeries = (roles || []).map((roleName) => {
      const seen = new Set();
      const values = series.map((row) => {
        const person = row.contributors?.[roleName];
        if (person) seen.add(person);
        return seen.size;
      });
      return { role: roleName, values, rolling: rollingMean(values, 10) };
    });

    return {
      plotData: roleSeries.flatMap((entry, idx) => {
        const color = rolePalette[idx % rolePalette.length];
        return [{
          x: xValues,
          y: entry.values,
          mode: "lines",
          line: { color, width: 2.2 },
          customdata: series.map((row, idx2) => [
            row.episodeNumber,
            row.dateAired,
            entry.role,
            entry.values[idx2],
            entry.rolling[idx2]
          ]),
          showlegend: false
        }];
      }),
      layout: {
        title: "Cumulative unique contributors by role",
        xaxis: { title: xTitle, type: xKey === "dateAired" ? "date" : "linear", range: xRange },
        yaxis: { title: axisTitle, fixedrange: true },
        shapes,
        showlegend: false,
        dragmode: "pan",
        transition: { duration: 350, easing: "cubic-in-out" }
      }
    };
  }, [series, arcs, role, roles, xKey, mode, showArcs]);

  const xClamp = useMemo(() => {
    if (!layout?.xaxis?.range) return null;
    const [min, max] = layout.xaxis.range;
    if (!min || !max) return null;
    return { min, max };
  }, [layout]);

  const tooltipFormatter = (point) => {
    const custom = point.customdata || [];
    if (!custom.length) return null;
    if (custom.length === 2) {
      const [ep, date] = custom;
      return [
        `<strong>Episode ${ep ?? "-"}</strong>`,
        date ? `<div>${date}</div>` : "",
        `<div>Contributor: ${point.y ?? "-"}</div>`
      ].join("");
    }
    const [ep, date, roleName, actual, rolling] = custom;
    return [
      `<strong>${roleName}</strong>`,
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
        <div className="control">
          <span>Mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            {modeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {mode === "contributors" && (
          <div className="control">
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {(roles || []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="control toggle">
          <span>Arc shading</span>
          <input
            type="checkbox"
            checked={showArcs}
            onChange={(event) => setShowArcs(event.target.checked)}
          />
        </label>
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
