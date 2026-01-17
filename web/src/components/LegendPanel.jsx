import { useState } from "react";

export default function LegendPanel({ legendData, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!legendData?.length) return null;

  return (
    <div className={`legend-panel ${isOpen ? "open" : "closed"}`}>
      <div className="legend-panel-header">
        <strong>Sagas & Arcs</strong>
        <button className="legend-toggle" onClick={() => setIsOpen(!isOpen)} type="button">
          {isOpen ? "Hide" : "Show"}
        </button>
      </div>
      <div className="legend-content">
        <div className="legend-container">
          {legendData.map((saga) => (
            <div className="saga-row" key={saga.name}>
              <div className="saga-label" style={{ backgroundColor: saga.color }}>
                {saga.name}
              </div>
              <div className="arc-list">
                {saga.arcs.map((arc) => (
                  <span
                    key={arc.name}
                    className="arc-label"
                    style={{ backgroundColor: arc.color }}
                  >
                    {arc.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
