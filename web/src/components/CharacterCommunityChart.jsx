import { useMemo, useState } from "react";
import PlotlyChart from "./PlotlyChart.jsx";
import { rollingMean } from "../data/transform.js";
import { COMMUNITY_PALETTE, OTHER_COMM_COLOR, NO_COMM_COLOR } from "../data/coappearance.js";

export default function CharacterCommunityChart({ data, arcOrder }) {
  const [selected, setSelected] = useState("all");
  const [legendOpen, setLegendOpen] = useState(true);

  const { plotData, layout, communities, xRange } = useMemo(() => {
    if (!data) return { plotData: [], layout: { title: "" }, communities: [] };

    const episodes = data.episodes;
    const xValues = episodes.map((ep) => ep.episodeNumber);
    const xRange = [
      Math.max(1, episodes[0]?.episodeNumber || 1),
      episodes[episodes.length - 1]?.episodeNumber
    ];

    const activeCommunities = data.communities.map((comm) => {
      let color = COMMUNITY_PALETTE[Number(comm.id) % COMMUNITY_PALETTE.length];
      if (comm.id === "other") color = OTHER_COMM_COLOR;
      if (comm.id === "none") color = NO_COMM_COLOR;
      return { ...comm, color };
    });

    const orderedCommunities = activeCommunities.slice().sort((a, b) => {
      if (a.id === "other") return 1;
      if (b.id === "other") return -1;
      if (a.id === "none") return 1;
      if (b.id === "none") return -1;
      const aIdx = arcOrder?.get?.(a.label);
      const bIdx = arcOrder?.get?.(b.label);
      if (aIdx === undefined && bIdx === undefined) return 0;
      if (aIdx === undefined) return 1;
      if (bIdx === undefined) return -1;
      return aIdx - bIdx;
    });

    const visible =
      selected === "all"
        ? orderedCommunities
        : orderedCommunities.filter((comm) => comm.id === selected);

    const traces = visible.flatMap((comm) => {
      const rolling = rollingMean(comm.values, 10);
      return [
        {
          x: xValues,
          y: comm.values,
          mode: "markers",
          marker: { size: 5, color: comm.color, opacity: 0.6 },
          customdata: episodes.map((ep, idx) => [
            ep.episodeNumber,
            comm.label,
            comm.values[idx],
            rolling[idx]
          ]),
          showlegend: false
        },
        {
          x: xValues,
          y: rolling,
          mode: "lines",
          line: { width: 2.2, color: comm.color },
          showlegend: false
        }
      ];
    });

    return {
      plotData: traces,
      layout: {
        title: "Character appearances by community",
        xaxis: { title: "Episode number", range: xRange },
        yaxis: { title: "Appearances", fixedrange: true },
        showlegend: false,
        dragmode: "pan"
      },
      communities: orderedCommunities,
      xRange
    };
  }, [data, selected, arcOrder]);

  const xClamp = useMemo(() => {
    if (!xRange) return null;
    return { min: xRange[0], max: xRange[1] };
  }, [xRange]);

  const tooltipFormatter = (point) => {
    const custom = point.customdata || [];
    if (!custom.length) return null;
    const [ep, label, actual, rolling] = custom;
    return [
      `<strong>${label}</strong>`,
      `<div>Episode ${ep ?? "-"}</div>`,
      `<div>Appearances: ${actual ?? "-"}</div>`
    ].join("");
  };

  if (!data) return null;

  return (
    <section className="metric-container">
      <div className="metric-controls">
        <div className="control">
          <span>Community</span>
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="all">All communities</option>
            {communities.map((comm) => (
              <option key={comm.id} value={comm.id}>
                {comm.label}
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
              <strong>Communities</strong>
              <div className="legend-subtitle">Labeled by most common debut arc.</div>
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
            {communities.map((comm) => (
              <div key={comm.id} className="legend-arc">
                <span className="legend-swatch" style={{ background: comm.color }} />
                <span>{comm.label} ({comm.count} chars)</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
