import { useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";

function toNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  const time = Date.parse(val);
  return Number.isNaN(time) ? null : time;
}

function formatDate(value, template) {
  const iso = new Date(value).toISOString();
  return template && template.includes("T") ? iso : iso.slice(0, 10);
}

function clampRange(range, clamp) {
  if (!clamp || !range) return range;
  const [min, max] = [toNumber(clamp.min), toNumber(clamp.max)];
  const [start, end] = [toNumber(range[0]), toNumber(range[1])];
  if (min === null || max === null || start === null || end === null) return range;
  if (start >= min && end <= max) return range;
  const span = end - start;
  const clampSpan = max - min;
  if (span >= clampSpan) return [clamp.min, clamp.max];
  let nextStart = start;
  let nextEnd = end;
  if (start < min) {
    nextStart = min;
    nextEnd = min + span;
  }
  if (nextEnd > max) {
    nextEnd = max;
    nextStart = max - span;
  }
  const isDate = typeof clamp.min === "string";
  return isDate
    ? [formatDate(nextStart, clamp.min), formatDate(nextEnd, clamp.max)]
    : [nextStart, nextEnd];
}

export default function PlotlyChart({
  data,
  layout,
  height = 420,
  xClamp,
  tooltipFormatter
}) {
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const baseLayout = useMemo(
    () => ({
      ...layout,
      autosize: true,
      height,
      margin: layout?.margin || { l: 50, r: 30, t: 50, b: 60 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        family: "Space Grotesk, Helvetica Neue, Arial, sans-serif",
        size: 12,
        color: "#14131a"
      },
      hoverlabel: {
        bgcolor: "#f6f2ee",
        bordercolor: "rgba(20, 19, 26, 0.22)",
        font: {
          family: "Space Grotesk, Helvetica Neue, Arial, sans-serif",
          size: 12,
          color: "#14131a"
        },
        align: "left"
      },
      dragmode: layout?.dragmode || "pan"
    }),
    [layout, height]
  );
  const [localLayout, setLocalLayout] = useState(baseLayout);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, html: "" });

  useEffect(() => {
    setLocalLayout(baseLayout);
  }, [baseLayout]);

  const dataWithHover = useMemo(() => {
    if (!tooltipFormatter) return data;
    return data.map((trace) => ({
      ...trace,
      hoverinfo: "none",
      hovertemplate: ""
    }));
  }, [data, tooltipFormatter]);

  const handleRelayout = (event) => {
    if (!xClamp) return;
    const currentRange = localLayout?.xaxis?.range;
    const nextStart = event["xaxis.range[0]"] ?? currentRange?.[0];
    const nextEnd = event["xaxis.range[1]"] ?? currentRange?.[1];
    if (nextStart === undefined || nextEnd === undefined) return;
    const clamped = clampRange([nextStart, nextEnd], xClamp);
    if (!clamped) return;
    setLocalLayout((prev) => ({
      ...prev,
      xaxis: {
        ...(prev?.xaxis || {}),
        range: clamped
      }
    }));
  };

  const handleHover = (event) => {
    if (!tooltipFormatter || !containerRef.current) return;
    const point = event.points?.[0];
    if (!point) return;
    const html = tooltipFormatter(point);
    if (!html) {
      setTooltip((prev) => ({ ...prev, visible: false }));
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = (event.event?.clientX ?? 0) - rect.left + 12;
    const y = (event.event?.clientY ?? 0) - rect.top + 12;
    setTooltip({ visible: true, x, y, html });
  };

  const handleUnhover = () => {
    if (!tooltip.visible) return;
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  return (
    <div ref={containerRef} className="plotly-wrapper">
      <Plot
        data={dataWithHover}
        layout={localLayout}
        config={{
          displayModeBar: false,
          responsive: true,
          scrollZoom: true,
          doubleClick: "reset"
        }}
        onRelayout={handleRelayout}
        onHover={handleHover}
        onUnhover={handleUnhover}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
      {tooltip.visible && (
        <div
          ref={tooltipRef}
          className="custom-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      )}
    </div>
  );
}
