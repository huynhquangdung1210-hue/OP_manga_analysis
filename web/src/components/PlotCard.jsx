export default function PlotCard({ title, subtitle, controls, children }) {
  return (
    <section className="plot-card">
      <div>
        <h3 className="plot-title">{title}</h3>
        {subtitle ? <p className="plot-subtitle">{subtitle}</p> : null}
      </div>
      {controls ? <div className="plot-controls">{controls}</div> : null}
      <div className="plot-wrap">{children}</div>
    </section>
  );
}
