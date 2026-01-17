import { useMemo } from "react";

function groupArcsBySaga(arcs) {
  return arcs.reduce((acc, arc) => {
    if (!acc[arc.saga]) acc[arc.saga] = [];
    acc[arc.saga].push(arc);
    return acc;
  }, {});
}

export default function SagaArcLegend({ arcs }) {
  const sagaGroups = useMemo(() => groupArcsBySaga(arcs || []), [arcs]);

  if (!arcs?.length) return null;

  return (
    <aside className="metric-legend open global-legend">
      <div className="legend-header">
        <div>
          <strong>Sagas & Arcs</strong>
          <div className="legend-subtitle">Arc shading reference across charts.</div>
        </div>
      </div>
      <div className="legend-body">
        {Object.entries(sagaGroups).map(([saga, arcList]) => (
          <div key={saga} className="legend-group">
            <div className="legend-saga">
              <span
                className="legend-swatch"
                style={{ background: arcList[0]?.sagaColor || "#d0c6ba" }}
              />
              <span>{saga}</span>
            </div>
            {arcList.map((arc) => (
              <div key={arc.name} className="legend-arc">
                <span className="legend-swatch" style={{ background: arc.arcColor }} />
                <span>{arc.name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
