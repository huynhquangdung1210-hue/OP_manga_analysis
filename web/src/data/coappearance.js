import { buildCoappearanceInputs } from "./transform";

export const COMMUNITY_PALETTE = [
  "#eb6f92",
  "#c4a7e7",
  "#9ccfd8",
  "#f6c177",
  "#ebbcba",
  "#31748f",
  "#ea9a97",
  "#f4a261",
  "#2a9d8f",
  "#e76f51",
  "#6d597a",
  "#b56576",
  "#355070",
  "#e07a5f",
  "#81b29a",
  "#f2cc8f",
  "#a8dadc",
  "#457b9d",
  "#e63946",
  "#ffafcc",
  "#bde0fe",
  "#ffb703",
  "#219ebc",
  "#023047",
  "#8ecae6"
];

export const OTHER_COMM_COLOR = "#4b4b4b";
export const NO_COMM_COLOR = "#888888";

function createMatrix(n) {
  return Array.from({ length: n }, () => new Uint32Array(n));
}

function fallbackPosition(idx) {
  const seed = Math.sin(idx * 12.9898) * 43758.5453;
  const seed2 = Math.sin((idx + 1) * 78.233) * 12345.6789;
  const frac = (x) => x - Math.floor(x);
  return [frac(seed) * 2 - 1, frac(seed2) * 2 - 1];
}

function cloneMatrix(matrix) {
  return matrix.map((row) => Uint32Array.from(row));
}

function addEpisodeToMatrix(matrix, charIdxs) {
  const len = charIdxs.length;
  for (let i = 0; i < len; i += 1) {
    const a = charIdxs[i];
    for (let j = i + 1; j < len; j += 1) {
      const b = charIdxs[j];
      matrix[a][b] += 1;
      matrix[b][a] += 1;
    }
  }
}

export function buildCoappearanceEngine(episodes, base) {
  const { allChars, charToIdx, epCharIdxs, epIds } = buildCoappearanceInputs(
    episodes,
    base?.all_chars
  );

  const countSize = allChars.length;
  const prefixCounts = [new Uint32Array(countSize)];
  epCharIdxs.forEach((chars) => {
    const prev = prefixCounts[prefixCounts.length - 1];
    const next = Uint32Array.from(prev);
    chars.forEach((idx) => {
      if (Number.isInteger(idx)) next[idx] += 1;
    });
    prefixCounts.push(next);
  });

  const checkpointStep = 50;
  const checkpointIndices = [];
  for (let i = 0; i <= epCharIdxs.length; i += checkpointStep) {
    checkpointIndices.push(i);
  }
  if (checkpointIndices[checkpointIndices.length - 1] !== epCharIdxs.length) {
    checkpointIndices.push(epCharIdxs.length);
  }

  const checkpoints = [];
  let matrix = createMatrix(countSize);
  let nextCheckpoint = checkpointIndices[1] ?? epCharIdxs.length;
  epCharIdxs.forEach((chars, idx) => {
    addEpisodeToMatrix(matrix, chars);
    const currentIndex = idx + 1;
    if (currentIndex === nextCheckpoint) {
      checkpoints.push(cloneMatrix(matrix));
      nextCheckpoint =
        checkpointIndices[checkpoints.length + 1] ?? epCharIdxs.length + 1;
    }
  });

  const positions = Array.isArray(base?.positions) ? base.positions : [];
  const community = Array.isArray(base?.community) ? base.community : [];
  const communityLabels = base?.community_labels || {};
  const communityCentroids = base?.community_centroids || {};

  return {
    allChars,
    charToIdx,
    epCharIdxs,
    epIds,
    prefixCounts,
    checkpoints,
    checkpointIndices,
    positions,
    community,
    communityLabels,
    communityCentroids
  };
}

function coMatrixForPrefix(engine, prefixIndex) {
  const { checkpointIndices, checkpoints, epCharIdxs } = engine;
  if (prefixIndex <= 0) return createMatrix(engine.allChars.length);

  let checkpointIdx = 0;
  for (let i = 0; i < checkpointIndices.length; i += 1) {
    if (checkpointIndices[i] <= prefixIndex) checkpointIdx = i;
  }
  const checkpointEp = checkpointIndices[checkpointIdx];
  const baseMatrix =
    checkpointIdx === 0
      ? createMatrix(engine.allChars.length)
      : cloneMatrix(checkpoints[checkpointIdx - 1]);

  for (let i = checkpointEp; i < prefixIndex; i += 1) {
    addEpisodeToMatrix(baseMatrix, epCharIdxs[i]);
  }
  return baseMatrix;
}

export function buildCoappearanceFigure(engine, controls) {
  const {
    minNode,
    minEdge,
    episodeMax,
    topN,
    hiddenCommunities
  } = controls;
  const { allChars, prefixCounts, epIds } = engine;

  let lo = 0;
  let hi = epIds.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (epIds[mid] <= episodeMax) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const prefixIndex = Math.min(lo, engine.epCharIdxs.length);
  const nodeCounts = prefixCounts[prefixIndex];

  let nodeIndices = Array.from(allChars.keys());
  if (topN) {
    nodeIndices = nodeIndices
      .map((idx) => [idx, nodeCounts[idx]])
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([idx]) => idx);
  }
  const keepSet = new Set(nodeIndices.filter((idx) => nodeCounts[idx] >= minNode));

  const community = engine.community;
  const commCountsGlobal = new Map();
  community.forEach((comm) => {
    if (!Number.isInteger(comm) || comm < 0) return;
    commCountsGlobal.set(comm, (commCountsGlobal.get(comm) || 0) + 1);
  });
  const smallCommsGlobal = new Set(
    Array.from(commCountsGlobal.entries())
      .filter(([, count]) => count < 5)
      .map(([comm]) => comm)
  );
  const communityLabels = engine.communityLabels;
  const hiddenSet = new Set(hiddenCommunities || []);

  const groupIdForComm = (comm) => {
    if (!Number.isInteger(comm) || comm < 0) return "none";
    if (smallCommsGlobal.has(comm)) return "other";
    return String(comm);
  };

  const visibleSet = new Set();
  Array.from(keepSet).forEach((idx) => {
    const comm = community[idx];
    const groupId = groupIdForComm(comm);
    if (hiddenSet.has(groupId)) return;
    visibleSet.add(idx);
  });

  const matrix = coMatrixForPrefix(engine, prefixIndex);
  const edges = [];
  for (const i of visibleSet) {
    for (const j of visibleSet) {
      if (j <= i) continue;
      const w = matrix[i][j];
      if (w < minEdge) continue;
      edges.push([i, j, w]);
    }
  }

  const positions = engine.positions;
  const usePositions = positions.length === allChars.length;
  const getPos = (idx) =>
    usePositions && positions[idx] ? positions[idx] : fallbackPosition(idx);

  const edgeX = [];
  const edgeY = [];
  edges.forEach(([i, j, w]) => {
    const [x0, y0] = getPos(i);
    const [x1, y1] = getPos(j);
    edgeX.push(x0, x1, null);
    edgeY.push(y0, y1, null);
  });

  const nodeX = [];
  const nodeY = [];
  const nodeSize = [];
  const nodeColor = [];
  const nodeText = [];

  Array.from(visibleSet).forEach((idx) => {
    const [x, y] = getPos(idx);
    nodeX.push(x);
    nodeY.push(y);
    const count = nodeCounts[idx];
    nodeSize.push(2 + 4 * Math.log1p(count));
    const comm = community[idx] ?? -1;
    if (!Number.isInteger(comm) || comm < 0) {
      nodeColor.push(NO_COMM_COLOR);
    } else if (smallCommsGlobal.has(comm)) {
      nodeColor.push(OTHER_COMM_COLOR);
    } else {
      nodeColor.push(COMMUNITY_PALETTE[comm % COMMUNITY_PALETTE.length]);
    }
    let commLabel = "No community";
    if (Number.isInteger(comm) && comm >= 0) {
      const baseLabel = communityLabels?.[comm] || `Community ${comm}`;
      commLabel = smallCommsGlobal.has(comm) ? `Other (# ${comm})` : baseLabel;
    }
    nodeText.push(`${allChars[idx]}<br>Appearances: ${count}<br>${commLabel}`);
  });

  return {
    data: [
      {
        x: edgeX,
        y: edgeY,
        mode: "lines",
        line: { width: 1.4, color: "rgba(110,110,110,0.3)" },
        hoverinfo: "skip",
        showlegend: false
      },
      {
        x: nodeX,
        y: nodeY,
        mode: "markers",
        marker: {
          size: nodeSize,
          color: nodeColor,
          line: { width: 1, color: "#ffffff" }
        },
        hoverinfo: "text",
        hovertext: nodeText,
        showlegend: false
      }
    ],
    layout: {
      xaxis: { visible: false },
      yaxis: { visible: false },
      hovermode: "closest",
      margin: { l: 10, r: 10, t: 40, b: 10 },
      title: `Co-appearance network (<= ep ${episodeMax})`
    }
  };
}
