const sagaDef = {
  "East Blue Saga": [
    "Romance Dawn",
    "Orange Town",
    "Syrup Village",
    "Baratie",
    "Arlong Park",
    "Loguetown"
  ],
  "Arabasta Saga": [
    "Reverse Mountain",
    "Whisky Peak",
    "Little Garden",
    "Drum Island",
    "Arabasta"
  ],
  "Sky Island Saga": ["Jaya", "Skypiea"],
  "Water 7 Saga": [
    "Long Ring Long Land",
    "Water 7",
    "Enies Lobby",
    "Post-Enies Lobby"
  ],
  "Thriller Bark Saga": ["Thriller Bark"],
  "Summit War Saga": [
    "Sabaody Archipelago",
    "Amazon Lily",
    "Impel Down",
    "Marineford",
    "Post-War"
  ],
  "Fish-Man Island Saga": ["Return to Sabaody", "Fish-Man Island"],
  "Dressrosa Saga": ["Punk Hazard", "Dressrosa"],
  "Whole Cake Island Saga": ["Zou", "Whole Cake Island", "Levely"],
  "Wano Country Saga": ["Wano Country"],
  "Final Saga": ["Egghead", "Elbaph"]
};

const sagaBaseColors = [
  "#d9896a",
  "#c6a96b",
  "#92b5a3",
  "#6ea3c7",
  "#c28fb0",
  "#b08d79",
  "#9bb26b",
  "#d6b25e",
  "#c77c6d",
  "#6aa7a1",
  "#a091c5"
];

function hexToHsl(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function shiftLightness(hex, delta) {
  const [h, s, l] = hexToHsl(hex);
  const next = Math.max(0, Math.min(1, l + delta));
  return hslToHex(h, s, next);
}

export function buildArcPalettes() {
  const sagaNames = Object.keys(sagaDef);
  const sagaBase = {};
  sagaNames.forEach((name, idx) => {
    sagaBase[name] = sagaBaseColors[idx % sagaBaseColors.length];
  });
  const arcPalette = {};
  sagaNames.forEach((saga) => {
    const arcs = sagaDef[saga];
    const base = sagaBase[saga];
    const shades = arcs.map((_, i) => {
      if (arcs.length === 1) return base;
      const t = i / (arcs.length - 1);
      const delta = -0.12 + 0.24 * t;
      return shiftLightness(base, delta);
    });
    arcs.forEach((arc, idx) => {
      arcPalette[arc] = shades[idx];
    });
  });
  return { sagaDef, sagaBase, arcPalette };
}

export function buildArcBands(episodes, xKey) {
  const { sagaDef: sagaMap, sagaBase, arcPalette } = buildArcPalettes();
  const arcRanges = new Map();
  episodes.forEach((ep) => {
    if (!ep.arc_name || !ep[xKey]) return;
    const key = ep.arc_name;
    const value = ep[xKey];
    if (!arcRanges.has(key)) {
      arcRanges.set(key, { min: value, max: value });
    } else {
      const range = arcRanges.get(key);
      if (value < range.min) range.min = value;
      if (value > range.max) range.max = value;
    }
  });

  const shapes = [];
  const legendTraces = [];
  Object.keys(sagaMap).forEach((saga) => {
    sagaMap[saga].forEach((arc) => {
      const range = arcRanges.get(arc);
      if (!range) return;
      const color = arcPalette[arc] || sagaBase[saga] || "#ddd";
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: range.min,
        x1: range.max,
        y0: 0,
        y1: 1,
        fillcolor: color,
        opacity: 0.4,
        line: { width: 0 }
      });
      legendTraces.push({
        x: [null],
        y: [null],
        mode: "lines",
        name: arc,
        line: { color, width: 12 },
        showlegend: true,
        hoverinfo: "skip"
      });
    });
  });
  return { shapes, legendTraces };
}

export function buildArcMeta(episodes) {
  const { sagaDef: sagaMap, sagaBase, arcPalette } = buildArcPalettes();
  const arcRanges = new Map();
  episodes.forEach((ep) => {
    if (!Number.isInteger(ep.episode_number)) return;
    if (!ep.arc_name) return;
    const entry = arcRanges.get(ep.arc_name) || {
      min: ep.episode_number,
      max: ep.episode_number
    };
    entry.min = Math.min(entry.min, ep.episode_number);
    entry.max = Math.max(entry.max, ep.episode_number);
    arcRanges.set(ep.arc_name, entry);
  });

  const arcs = [];
  Object.keys(sagaMap).forEach((saga) => {
    sagaMap[saga].forEach((arc) => {
      const range = arcRanges.get(arc);
      if (!range) return;
      arcs.push({
        name: arc,
        saga,
        sagaColor: sagaBase[saga] || "#d0c6ba",
        arcColor: arcPalette[arc] || sagaBase[saga] || "#d0c6ba",
        fromEpisode: range.min,
        toEpisode: range.max
      });
    });
  });
  return arcs;
}

export function rollingMean(values, windowSize = 5) {
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((sum, v) => sum + v, 0) / slice.length;
    out.push(avg);
  }
  return out;
}

export function countItems(text) {
  if (!text || typeof text !== "string") return 0;
  return text
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean).length;
}

export function countTechniqueDebuts(text) {
  if (!text || typeof text !== "string") return 0;
  const items = text
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return items.filter((item) => {
    const match = item.match(/([^:]+):\s*(.+)/);
    if (!match) return false;
    const character = match[1].trim();
    if (!character) return false;
    if (character.toLowerCase() === "unattributed") return false;
    return true;
  }).length;
}

export function buildTechniqueSeries(episodes) {
  const rows = [];
  episodes.forEach((ep) => {
    if (!ep.tech_debut) return;
    const items = ep.tech_debut
      .split(/[;,\n]/)
      .map((t) => t.trim())
      .filter(Boolean);
    items.forEach((item) => {
      const match = item.match(/([^:]+):\s*(.+)/);
      if (!match) return;
      rows.push({
        episode_number: ep.episode_number,
        arc_name: ep.arc_name,
        character: match[1].trim(),
        technique: match[2].trim()
      });
    });
  });

  const seen = new Set();
  const deduped = [];
  rows
    .sort((a, b) => a.episode_number - b.episode_number)
    .forEach((row) => {
      const key = `${row.character}::${row.technique}::${row.episode_number}`;
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(row);
    });

  const counts = new Map();
  const totals = deduped.map((row) => {
    const prev = counts.get(row.character) || 0;
    const next = prev + 1;
    counts.set(row.character, next);
    return { ...row, tech_running_total: next };
  });

  const topChars = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([char]) => char);

  return {
    series: totals.filter((row) => topChars.includes(row.character)),
    topChars
  };
}

export function buildTechniqueRunning(episodes) {
  const sorted = episodes
    .filter((ep) => Number.isInteger(ep.episode_number))
    .slice()
    .sort((a, b) => a.episode_number - b.episode_number);

  const debutByEpisode = new Map();
  const totals = new Map();

  sorted.forEach((ep) => {
    const items = (ep.tech_debut || "")
      .split(/[,;\n]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!items.length) return;
    items.forEach((item) => {
      const match = item.match(/([^:]+):\s*(.+)/);
      if (!match) return;
      const character = match[1].trim();
      if (!character) return;
      if (character.toLowerCase() === "unattributed") return;
      totals.set(character, (totals.get(character) || 0) + 1);
      const list = debutByEpisode.get(ep.episode_number) || [];
      list.push(character);
      debutByEpisode.set(ep.episode_number, list);
    });
  });

  const charactersAll = Array.from(totals.keys()).sort();
  const characters = charactersAll.filter((c) => (totals.get(c) || 0) >= 5);

  const counts = new Map(charactersAll.map((c) => [c, 0]));
  const episodesOut = sorted.map((ep) => ({
    episodeNumber: ep.episode_number,
    dateAired: ep.airdate
  }));

  const series = characters.map((character) => ({
    character,
    values: []
  }));

  const avgLine = [];
  episodesOut.forEach((ep) => {
    const debuts = debutByEpisode.get(ep.episodeNumber) || [];
    debuts.forEach((char) => {
      counts.set(char, (counts.get(char) || 0) + 1);
    });

    const activeChars = Array.from(counts.entries()).filter(([, v]) => v > 0);
    const totalTechniques = activeChars.reduce((sum, [, v]) => sum + v, 0);
    const avg = activeChars.length ? totalTechniques / activeChars.length : 0;
    avgLine.push(avg);

    series.forEach((entry) => {
      entry.values.push(counts.get(entry.character) || 0);
    });
  });

  return { episodes: episodesOut, series, avgLine };
}

export function buildCrewLong(episodes) {
  const roles = ["director", "writer", "art_director", "animator"];
  const roleMap = {
    director: "Director",
    writer: "Writer",
    art_director: "Art Director",
    animator: "Animator"
  };
  const rows = [];
  episodes.forEach((ep) => {
    roles.forEach((role) => {
      const person = ep[role];
      if (!person) return;
      rows.push({
        episode_number: ep.episode_number,
        airdate: ep.airdate,
        arc_name: ep.arc_name,
        role: roleMap[role],
        person
      });
    });
  });

  const personFirst = new Map();
  rows.forEach((row) => {
    if (!personFirst.has(row.person)) {
      personFirst.set(row.person, row.episode_number ?? Number.MAX_SAFE_INTEGER);
    } else {
      const current = personFirst.get(row.person);
      if ((row.episode_number ?? Number.MAX_SAFE_INTEGER) < current) {
        personFirst.set(row.person, row.episode_number ?? Number.MAX_SAFE_INTEGER);
      }
    }
  });

  const personOrder = Array.from(personFirst.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([person]) => person);

  return { rows, personOrder };
}

export function buildCrewMetrics(episodes) {
  const roleKeys = ["director", "writer", "art_director", "animator"];
  const roleMap = {
    director: "Director",
    writer: "Writer",
    art_director: "Art Director",
    animator: "Animator"
  };
  const roles = roleKeys.map((key) => roleMap[key]);
  const peopleByRole = new Map();
  roles.forEach((role) => peopleByRole.set(role, new Set()));

  const sorted = episodes
    .filter((ep) => Number.isInteger(ep.episode_number))
    .slice()
    .sort((a, b) => a.episode_number - b.episode_number);

  const totalsByRole = new Map();
  roles.forEach((role) => totalsByRole.set(role, 0));

  const series = [];
  sorted.forEach((ep, idx) => {
    const metrics = {};
    roleKeys.forEach((key) => {
      const role = roleMap[key];
      const person = ep[key];
      if (person) {
        totalsByRole.set(role, totalsByRole.get(role) + 1);
        peopleByRole.get(role).add(person);
      }

      const totalCredits = totalsByRole.get(role);
      const uniquePeople = peopleByRole.get(role).size;
      const episodesSeen = idx + 1;

      metrics[role] = {
        credits: person ? 1 : 0,
        uniquePeople,
        creditsPerPerson: uniquePeople ? totalCredits / uniquePeople : 0,
        avgPerEpisode: episodesSeen ? totalCredits / episodesSeen : 0
      };
    });

    series.push({
      episodeNumber: ep.episode_number,
      dateAired: ep.airdate,
      metrics,
      contributors: {
        Director: ep.director || null,
        Writer: ep.writer || null,
        "Art Director": ep.art_director || null,
        Animator: ep.animator || null
      }
    });
  });

  return { roles, series };
}

export function buildCharacterPresence(episodes, minCount = 20) {
  const appearFull = [];
  episodes.forEach((ep) => {
    if (!Number.isInteger(ep.episode_number)) return;
    (ep.characters_list || []).forEach((character) => {
      if (!character) return;
      appearFull.push({
        episode_number: ep.episode_number,
        arc_name: ep.arc_name,
        character
      });
    });
  });

  const counts = new Map();
  appearFull.forEach((row) => {
    counts.set(row.character, (counts.get(row.character) || 0) + 1);
  });
  const keep = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count >= minCount)
      .map(([name]) => name)
  );

  const appear = appearFull.filter((row) => keep.has(row.character));
  const debutMap = new Map();
  appear.forEach((row) => {
    if (!debutMap.has(row.character)) {
      debutMap.set(row.character, row.episode_number);
    } else if (row.episode_number < debutMap.get(row.character)) {
      debutMap.set(row.character, row.episode_number);
    }
  });

  const maxEp = Math.max(...episodes.map((ep) => ep.episode_number || 0));

  const appearanceCounts = new Map();
  const arcCounts = new Map();
  appear.forEach((row) => {
    const key = row.character;
    appearanceCounts.set(key, (appearanceCounts.get(key) || new Set()).add(row.episode_number));
    if (!arcCounts.has(key)) arcCounts.set(key, new Set());
    if (row.arc_name) arcCounts.get(key).add(row.arc_name);
  });

  const categoryMap = new Map();
  Array.from(keep).forEach((char) => {
    const debutEp = debutMap.get(char) || 0;
    const appearanceSet = appearanceCounts.get(char) || new Set();
    const coverage = appearanceSet.size / (maxEp - debutEp + 1 || 1);
    const arcSpan = (arcCounts.get(char) || new Set()).size;
    if (coverage >= 0.5) {
      categoryMap.set(char, "Core");
    } else if (arcSpan === 3) {
      categoryMap.set(char, "Arc-only");
    } else {
      categoryMap.set(char, "Recurring");
    }
  });

  const characterOrder = Array.from(debutMap.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([char]) => char);

  return { appear, characterOrder, categoryMap };
}

export function buildCoappearanceInputs(episodes, allCharsOverride) {
  const charSet = new Set();
  episodes.forEach((ep) => (ep.characters_list || []).forEach((c) => charSet.add(c)));
  const allChars = allCharsOverride || Array.from(charSet).sort();
  const charToIdx = new Map(allChars.map((c, i) => [c, i]));
  const sorted = episodes
    .filter((ep) => Number.isInteger(ep.episode_number))
    .slice()
    .sort((a, b) => a.episode_number - b.episode_number);
  const epIds = sorted.map((ep) => ep.episode_number);
  const epCharIdxs = sorted.map((ep) =>
    (ep.characters_list || [])
      .map((c) => charToIdx.get(c))
      .filter((idx) => Number.isInteger(idx))
  );
  return { allChars, charToIdx, epCharIdxs, epIds };
}

export { sagaDef };
