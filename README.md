# One Piece Episode Analyzer

This workspace contains an interactive Jupyter notebook and supporting data for exploring One Piece episode metadata and character co-appearance graphs.

Contents
- `Analyzer.ipynb` — main exploratory notebook with plots and an interactive co-appearance network (ipywidgets + Plotly).
- `scraper.py` — (if present) helper script used to collect/prepare episode JSON files.
- `onepiece_episodes_json/` — directory of per-episode JSON files used by the notebook.

Quick start
1. Create a Python environment (recommended Python 3.8+).

   python -m venv .venv
   .venv\Scripts\activate          # Windows

2. Install the main packages (minimum):

   pip install pandas numpy scipy networkx plotly ipywidgets seaborn matplotlib jupyterlab

   Optional / for serving interactivity: `voila` (pip install voila) or build a `dash`/`panel` app.

3. Launch the notebook:

   jupyter lab

   Open `Analyzer.ipynb` and run cells from the top. The notebook builds a co-appearance network and exposes sliders/widgets to control episode range, node/edge thresholds, and an optional ego filter.

Saving the interactive Plotly graph
- Cell 15 in `Analyzer.ipynb` provides a small widget (filename + Save button) that writes the currently shown Plotly figure to a standalone interactive HTML file (embedded plotly.js). Use it to save a portable, fully interactive file that you can open in any modern browser.

Preserving the slider interactivity in a standalone HTML
There are two approaches depending on your needs:

1. Client-side frames (recommended for a portable HTML):
   - Precompute a Plotly figure for each slider step (episodes or checkpoints) and combine them into a single Plotly `Figure` with `frames` plus a `layout.sliders` control.
   - Export that figure with `fig.write_html(..., include_plotlyjs=True)`.
   - Pros: fully client-side, no server required. Cons: file size grows with number of frames; consider using `checkpoint_step` to downsample.

2. Server-backed widgets (keeps Python callbacks):
   - Serve the notebook with `voila` (keeps ipywidgets + Python callbacks working) or convert the notebook into a small `Dash`/`Panel` app.
   - Pros: full dynamic recomputation, smaller transferred HTML. Cons: requires a running server to host the app.

Notes about the current notebook
- The notebook already builds a cached co-occurrence matrix with configurable `checkpoint_step` to speed building frames or slider updates.
- A Save button (Cell 15) writes the current Plotly figure to disk as `coappearance_graph.html` by default.

Suggestions / next steps
- If you want a portable HTML that preserves the slider, I can implement the Plotly `frames` export (precompute frames at a chosen sampling rate) and add a Save-as-animated-HTML button.
- If you prefer a hosted interactive experience, I can add a `voila` run config or a minimal `requirements.txt`.

License
- This repository has no license file. Add one if you plan to publish or share this work publicly.

If you want one of the follow-ups, tell me which: (a) implement Plotly frames + export, (b) add `requirements.txt`, (c) add a `voila` run cell/README run command, or (d) adjust the default save folder/filename for the HTML export.