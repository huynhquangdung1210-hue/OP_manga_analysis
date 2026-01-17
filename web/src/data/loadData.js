export async function loadEpisodes() {
  const res = await fetch("/data/episodes.json");
  if (!res.ok) {
    throw new Error("episodes.json not found. Run scripts/build_web_data.py.");
  }
  return res.json();
}

export async function loadCoappearanceBase() {
  const res = await fetch("/data/coappearance_base.json");
  if (!res.ok) {
    return null;
  }
  return res.json();
}
