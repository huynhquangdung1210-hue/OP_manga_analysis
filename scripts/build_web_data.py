"""
Builds data files for the Vite frontend.

Outputs:
- web/public/data/episodes.json
- web/public/data/coappearance_base.json
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import networkx as nx
from scipy import sparse

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "onepiece_episodes_json"
OUT_DIR = ROOT_DIR / "web/public/data"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def extract_category_names(categories, prefix):
    names = []
    for cat in categories:
        if cat.startswith(prefix):
            raw = cat[len(prefix):]
            names.append(raw.replace("_", " ").strip())
    return names


def first_or_none(seq):
    return seq[0] if seq else None


def parse_characters(text, lexicon=None):
    if not isinstance(text, str):
        return []
    if lexicon:
        tokens = text.split()
        out, i = [], 0
        lex_sorted = sorted(lexicon, key=lambda n: (-len(n.split()), -len(n)))
        while i < len(tokens):
            match = None
            for name in lex_sorted:
                parts = name.split()
                if tokens[i : i + len(parts)] == parts:
                    match = name
                    break
            if match:
                out.append(match)
                i += len(match.split())
            else:
                i += 1
        return out
    pattern = r"[A-Z][\w']+(?:\s(?:D\.|[A-Z][\w']+)){0,3}(?:\s\([^)]*\))?"
    names = re.findall(pattern, text)
    return [re.sub(r"\s*\([^)]*\)$", "", n) for n in names]


def load_episode(fp: Path, name_lexicon=None) -> dict:
    data = json.loads(fp.read_text(encoding="utf-8"))
    categories = data.get("categories") or []
    info = data.get("infobox") or {}
    items = info.get("items") or []

    infobox_items = {item.get("label"): item.get("value_text") for item in items}

    def first_by_data_source(ds_name: str):
        for item in items:
            if item.get("data_source") == ds_name:
                return item.get("value_text")
        return None

    writers = extract_category_names(categories, "Episodes_Written_by_")
    art_directors = extract_category_names(categories, "Episodes_Art_Directed_by_")
    animators = extract_category_names(categories, "Episodes_Animated_by_")
    directors = extract_category_names(categories, "Episodes_Directed_by_")

    writer = first_or_none(writers)
    art_director = first_or_none(art_directors)
    animator = first_or_none(animators)
    director = first_or_none(directors)

    arc_raw = next((c for c in categories if c.endswith("_Arc_Episodes")), None)
    arc_name = arc_raw.replace("_Arc_Episodes", "").replace("_", " ") if arc_raw else None

    sections = data.get("sections") or []

    def section_text(name):
        return next((s.get("text") for s in sections if s.get("heading") == name), None)

    chars_text = section_text("Characters in Order of Appearance")
    characters_list = parse_characters(chars_text, name_lexicon)

    return {
        "episode_number": data.get("episode_number"),
        "title": data.get("title"),
        "url": data.get("url"),
        "page_id": data.get("page_id"),
        "revid": data.get("revid"),
        "categories": categories,
        "infobox_title": info.get("title"),
        "kanji": infobox_items.get("Kanji"),
        "romaji": infobox_items.get("Romaji"),
        "airdate_str": infobox_items.get("Airdate"),
        "format": infobox_items.get("Format"),
        "tech": infobox_items.get("Tech"),
        "characters_infobox": infobox_items.get("Characters"),
        "writer": writer,
        "art_director": art_director,
        "animator": animator,
        "director": director,
        "writers_all": writers,
        "art_directors_all": art_directors,
        "animators_all": animators,
        "directors_all": directors,
        "arc_name": arc_name,
        "arc_raw": arc_raw,
        "char_debut": first_by_data_source("charDebut"),
        "tech_debut": first_by_data_source("techDebut"),
        "short_summary": section_text("Short Summary"),
        "long_summary": section_text("Long Summary"),
        "characters_appearance": chars_text,
        "characters_list": characters_list,
    }


def build_name_lexicon(df):
    names = set()
    if "char_debut" in df.columns:
        for txt in df["char_debut"].dropna():
            names.update(t.strip() for t in re.split(r"[;,\n]", txt) if t.strip())
    if "characters_infobox" in df.columns:
        for txt in df["characters_infobox"].dropna():
            names.update(t.strip() for t in re.split(r"[;,\n]", txt) if t.strip())
    return names


def load_all_episodes():
    episode_files = sorted(DATA_DIR.glob("Episode_*.json"))
    if not episode_files:
        raise FileNotFoundError(f"No episode files found in {DATA_DIR}")
    records = [load_episode(fp) for fp in episode_files]
    episodes_df = pd.DataFrame(records)

    lexicon = build_name_lexicon(episodes_df)

    episodes_df = episodes_df.sort_values("episode_number").copy()
    seen = set()
    chars_running = []
    for _, row in episodes_df.iterrows():
        txt = row.get("char_debut")
        if isinstance(txt, str):
            for name in (t.strip() for t in re.split(r"[,]", txt) if t.strip()):
                seen.add(name)
        parsed = parse_characters(row.get("characters_appearance"), lexicon=seen)
        chars_running.append(parsed)

    episodes_df["characters_list"] = chars_running
    episodes_df["airdate"] = pd.to_datetime(episodes_df["airdate_str"], errors="coerce")
    return episodes_df


def write_episodes_json(df):
    episodes = []
    for _, row in df.iterrows():
        airdate = row["airdate"]
        episodes.append(
            {
                "episode_number": int(row["episode_number"]) if pd.notna(row["episode_number"]) else None,
                "airdate": airdate.date().isoformat() if pd.notna(airdate) else None,
                "arc_name": row.get("arc_name"),
                "char_debut": row.get("char_debut"),
                "tech_debut": row.get("tech_debut"),
                "characters_list": row.get("characters_list") or [],
                "director": row.get("director"),
                "writer": row.get("writer"),
                "art_director": row.get("art_director"),
                "animator": row.get("animator"),
            }
        )
    out_path = OUT_DIR / "episodes.json"
    out_path.write_text(json.dumps(episodes, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}")


def build_coappearance_base(df):
    min_eps_node_default = 3
    min_edge_co_default = 1
    edge_cap = 5.0
    top_n_nodes = 1500

    eps_sorted = df.dropna(subset=["episode_number"]).sort_values("episode_number")
    ep_ids = eps_sorted["episode_number"].to_numpy()
    chars_series = eps_sorted["characters_list"].apply(lambda xs: xs or [])
    all_chars = sorted({c for lst in chars_series for c in lst})
    char_to_idx = {c: i for i, c in enumerate(all_chars)}

    rows, cols, data = [], [], []
    for r, chars in enumerate(chars_series):
        for c in chars:
            rows.append(r)
            cols.append(char_to_idx[c])
            data.append(1)
    A = sparse.coo_matrix((data, (rows, cols)), shape=(len(eps_sorted), len(all_chars))).tocsr()

    prefix_counts = np.zeros((len(ep_ids) + 1, A.shape[1]), dtype=np.int32)
    prefix_counts[1:] = np.cumsum(A.toarray(), axis=0)
    global_node_counts = prefix_counts[-1]

    def build_graph_from_co(co_mat, node_counts, min_eps_node, min_edge_co, top_n=None):
        if top_n:
            top_idx = np.argsort(node_counts)[::-1][:top_n]
            keep_nodes = set(top_idx[node_counts[top_idx] >= min_eps_node])
        else:
            keep_nodes = {i for i, c in enumerate(node_counts) if c >= min_eps_node}
        co_mat = co_mat.tocoo()
        edges = []
        for i, j, w in zip(co_mat.row, co_mat.col, co_mat.data):
            if i >= j:
                continue
            if i not in keep_nodes or j not in keep_nodes:
                continue
            if w < min_edge_co:
                continue
            logw = min(max(math.log1p(w), 1.0), edge_cap)
            edges.append((i, j, logw, w))
        G = nx.Graph()
        for i in keep_nodes:
            G.add_node(i, eps=int(node_counts[i]), size=math.log1p(node_counts[i]))
        for i, j, logw, raw in edges:
            G.add_edge(i, j, weight=logw, raw=int(raw))
        return G

    co_full = (A.T @ A).tocsr()
    co_full.setdiag(0)
    co_full.eliminate_zeros()

    base_G = build_graph_from_co(
        co_full, global_node_counts, min_eps_node_default, min_edge_co_default, top_n=top_n_nodes
    )
    if base_G.number_of_edges() == 0:
        raise ValueError("Base graph is empty; lower thresholds.")
    pos = nx.spring_layout(base_G, k=0.35, seed=42, weight="weight", iterations=300)

    def detect_communities(G, resolution=2.5):
        if G.number_of_nodes() == 0:
            return {}
        comms = list(
            nx.algorithms.community.greedy_modularity_communities(
                G, weight="weight", resolution=resolution
            )
        )
        mapping = {}
        for i, comm in enumerate(comms):
            for n in comm:
                mapping[n] = i
        return mapping

    base_comm_map = detect_communities(base_G)

    # debut arc mapping
    debut_arc = {}
    for _, row in eps_sorted.iterrows():
        arc = row.get("arc_name") or "Unknown"
        for char in row.get("characters_list") or []:
            if char not in debut_arc:
                debut_arc[char] = arc

    comm_to_arcs = defaultdict(list)
    for idx, comm in base_comm_map.items():
        name = all_chars[idx]
        comm_to_arcs[comm].append(debut_arc.get(name, "Unknown"))

    comm_labels = {}
    comm_centroids = {}
    for comm, arcs in comm_to_arcs.items():
        most_common = Counter(arcs).most_common(1)
        comm_labels[comm] = most_common[0][0] if most_common else "Unknown"

        xs, ys = [], []
        for idx, c in base_comm_map.items():
            if c != comm:
                continue
            if idx in pos:
                xs.append(pos[idx][0])
                ys.append(pos[idx][1])
        if xs and ys:
            comm_centroids[comm] = [float(np.mean(xs)), float(np.mean(ys))]

    max_idx = len(all_chars)
    positions = [None] * max_idx
    community = [-1] * max_idx
    for idx in range(max_idx):
        if idx in pos:
            positions[idx] = [float(pos[idx][0]), float(pos[idx][1])]
        community[idx] = int(base_comm_map.get(idx, -1))

    out = {
        "all_chars": all_chars,
        "positions": positions,
        "community": community,
        "community_labels": {str(k): v for k, v in comm_labels.items()},
        "community_centroids": {str(k): v for k, v in comm_centroids.items()},
        "params": {
            "min_eps_node_default": min_eps_node_default,
            "min_edge_co_default": min_edge_co_default,
            "top_n_nodes": top_n_nodes,
        },
    }

    out_path = OUT_DIR / "coappearance_base.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}")


def main():
    df = load_all_episodes()
    write_episodes_json(df)
    build_coappearance_base(df)


if __name__ == "__main__":
    main()
