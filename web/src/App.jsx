import { useEffect, useMemo, useState } from "react";
import PlotlyChart from "./components/PlotlyChart.jsx";
import UnifiedMetricChart from "./components/UnifiedMetricChart.jsx";
import CrewCreditsChart from "./components/CrewCreditsChart.jsx";
import TechniqueDebutsChart from "./components/TechniqueDebutsChart.jsx";
import CharacterCommunityChart from "./components/CharacterCommunityChart.jsx";
import LegendPanel from "./components/LegendPanel.jsx";
import { loadEpisodes, loadCoappearanceBase } from "./data/loadData.js";
import {
  buildArcMeta,
  buildCrewMetrics,
  buildTechniqueRunning,
  countItems,
  countTechniqueDebuts
} from "./data/transform.js";
import {
  buildCoappearanceEngine,
  buildCoappearanceFigure,
  COMMUNITY_PALETTE,
  OTHER_COMM_COLOR,
  NO_COMM_COLOR
} from "./data/coappearance.js";

export default function App() {
  const [episodes, setEpisodes] = useState(null);
  const [coBase, setCoBase] = useState(null);
  const [error, setError] = useState(null);

  const [coControls, setCoControls] = useState({
    minNode: 5,
    minEdge: 10,
    episodeMax: 100,
    topN: 300,
    hiddenCommunities: []
  });

  useEffect(() => {
    let mounted = true;
    Promise.all([loadEpisodes(), loadCoappearanceBase()])
      .then(([episodesData, coBaseData]) => {
        if (!mounted) return;
        setEpisodes(episodesData);
        setCoBase(coBaseData);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Failed to load data.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const episodesSorted = useMemo(() => {
    if (!episodes) return [];
    return episodes
      .filter((ep) => Number.isInteger(ep.episode_number))
      .slice()
      .sort((a, b) => a.episode_number - b.episode_number);
  }, [episodes]);

  useEffect(() => {
    if (!episodesSorted.length) return;
    const maxEp = episodesSorted[episodesSorted.length - 1].episode_number;
    setCoControls((prev) => ({
      ...prev,
      episodeMax: maxEp
    }));
  }, [episodesSorted.length]);

  const analyticsData = useMemo(() => {
    if (!episodesSorted.length) return [];
    return episodesSorted.map((ep) => ({
      episodeNumber: ep.episode_number,
      dateAired: ep.airdate,
      characterDebuts: countItems(ep.char_debut),
      characterAppearances: (ep.characters_list || []).length,
      techniqueDebuts: countTechniqueDebuts(ep.tech_debut)
    }));
  }, [episodesSorted]);

  const arcMeta = useMemo(() => {
    if (!episodesSorted.length) return [];
    return buildArcMeta(episodesSorted);
  }, [episodesSorted]);

  const sagaLegend = useMemo(() => {
    if (!arcMeta.length) return [];
    const grouped = new Map();
    arcMeta.forEach((arc) => {
      if (!grouped.has(arc.saga)) {
        grouped.set(arc.saga, { name: arc.saga, color: arc.sagaColor, arcs: [] });
      }
      grouped.get(arc.saga).arcs.push({ name: arc.name, color: arc.arcColor });
    });
    return Array.from(grouped.values());
  }, [arcMeta]);

  const crewMetrics = useMemo(() => {
    if (!episodesSorted.length) return null;
    return buildCrewMetrics(episodesSorted);
  }, [episodesSorted]);

  const techniqueRunning = useMemo(() => {
    if (!episodesSorted.length) return null;
    return buildTechniqueRunning(episodesSorted);
  }, [episodesSorted]);

  const communityAppearance = useMemo(() => {
    if (!episodesSorted.length || !coBase?.all_chars || !coBase?.community) return null;

    const commByChar = new Map();
    coBase.all_chars.forEach((name, idx) => {
      const comm = coBase.community[idx];
      if (Number.isInteger(comm) && comm >= 0) {
        commByChar.set(name, comm);
      }
    });

    const commSizes = new Map();
    commByChar.forEach((comm) => {
      commSizes.set(comm, (commSizes.get(comm) || 0) + 1);
    });

    const commMembers = new Map();
    commByChar.forEach((comm, name) => {
      const set = commMembers.get(comm) || new Set();
      set.add(name);
      commMembers.set(comm, set);
    });

    const commList = Array.from(commMembers.entries())
      .filter(([, members]) => members.size >= 5)
      .map(([comm, members]) => ({
        id: String(comm),
        label: coBase.community_labels?.[comm] || `Community ${comm}`,
        count: members.size,
        members
      }));

    const smallCommMembers = Array.from(commMembers.entries())
      .filter(([, members]) => members.size > 0 && members.size < 5)
      .flatMap(([, members]) => Array.from(members));
    const smallCommCount = smallCommMembers.length;

    const allCharsSeen = new Set();
    episodesSorted.forEach((ep) => {
      (ep.characters_list || []).forEach((char) => allCharsSeen.add(char));
    });
    const noCommChars = Array.from(allCharsSeen).filter((char) => !commByChar.has(char));
    const noCommCount = noCommChars.length;

    if (smallCommCount > 0) {
      commList.push({
        id: "other",
        label: "Other (small communities)",
        count: smallCommCount,
        members: new Set(smallCommMembers)
      });
    }
    if (noCommCount > 0) {
      commList.push({
        id: "none",
        label: "No community",
        count: noCommCount,
        members: new Set(noCommChars)
      });
    }

    const valuesByComm = new Map(
      commList.map((comm) => [comm.id, new Array(episodesSorted.length).fill(0)])
    );

    episodesSorted.forEach((ep, idx) => {
      (ep.characters_list || []).forEach((char) => {
        const comm = commByChar.get(char);
        if (Number.isInteger(comm) && commSizes.get(comm) >= 5) {
          const arr = valuesByComm.get(String(comm));
          if (arr) arr[idx] += 1;
          return;
        }
        if (Number.isInteger(comm) && commSizes.get(comm) < 5) {
          const arr = valuesByComm.get("other");
          if (arr) arr[idx] += 1;
          return;
        }
        const arr = valuesByComm.get("none");
        if (arr) arr[idx] += 1;
      });
    });

    return {
      episodes: episodesSorted.map((ep) => ({
        episodeNumber: ep.episode_number,
        dateAired: ep.airdate
      })),
      communities: commList.map((comm) => ({
        id: comm.id,
        label: comm.label,
        count: comm.count,
        values: valuesByComm.get(comm.id) || []
      }))
    };
  }, [episodesSorted, coBase]);

  const arcOrder = useMemo(() => {
    const map = new Map();
    arcMeta.forEach((arc, idx) => {
      if (!map.has(arc.name)) map.set(arc.name, idx);
    });
    return map;
  }, [arcMeta]);

  const coLegendGlobal = useMemo(() => {
    if (!communityAppearance?.communities?.length) return [];
    const ordered = communityAppearance.communities.slice().sort((a, b) => {
      if (a.id === "other") return 1;
      if (b.id === "other") return -1;
      if (a.id === "none") return 1;
      if (b.id === "none") return -1;
      const aIdx = arcOrder.get(a.label);
      const bIdx = arcOrder.get(b.label);
      if (aIdx === undefined && bIdx === undefined) return 0;
      if (aIdx === undefined) return 1;
      if (bIdx === undefined) return -1;
      return aIdx - bIdx;
    });
    return ordered.map((comm) => {
      let color = COMMUNITY_PALETTE[Number(comm.id) % COMMUNITY_PALETTE.length];
      if (comm.id === "other") color = OTHER_COMM_COLOR;
      if (comm.id === "none") color = NO_COMM_COLOR;
      return { ...comm, color };
    });
  }, [communityAppearance, arcOrder]);

  const coEngine = useMemo(() => {
    if (!episodesSorted.length) return null;
    return buildCoappearanceEngine(episodesSorted, coBase);
  }, [episodesSorted, coBase]);

  const coPlot = useMemo(() => {
    if (!coEngine) return null;
    return buildCoappearanceFigure(coEngine, coControls);
  }, [coEngine, coControls]);


  const stats = useMemo(() => {
    if (!episodesSorted.length) return [];
    const arcCount = new Set(episodesSorted.map((ep) => ep.arc_name).filter(Boolean)).size;
    const charCount = new Set(
      episodesSorted.flatMap((ep) => ep.characters_list || [])
    ).size;
    return [
      `${episodesSorted.length} episodes`,
      `${arcCount} arcs`,
      `${charCount} characters`
    ];
  }, [episodesSorted]);

  if (error) {
    return (
      <main>
        <div className="loading">{error}</div>
      </main>
    );
  }

  if (!episodes) {
    return (
      <main>
        <div className="loading">Loading datasets...</div>
      </main>
    );
  }

  const maxEp = episodesSorted.length
    ? episodesSorted[episodesSorted.length - 1].episode_number
    : 0;

  return (
    <main>
      <section className="hero">
        <h1 className="hero-title">One Piece: A Visualization Project</h1>
        <p className="hero-subtitle">
          Yo-ho-ho-ho! Welcome travelers, aboard this grand adventure into the world of One Piece through a data analytics view! 
          This project is dedicated to visualizing the vast and intricate universe created by Eiichiro Oda, celebrating its characters, story arcs, and the incredible team behind its creation.
        </p>
        <div className="stats">
          {stats.map((stat) => (
            <span className="stat" key={stat}>
              {stat}
            </span>
          ))}
        </div>
      </section>
      {sagaLegend.length > 0 && <LegendPanel legendData={sagaLegend} />}

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Characters Across One Piece</h2>
          <p className="section-desc">
          </p>
        </div>
        <UnifiedMetricChart data={analyticsData} arcs={arcMeta} annotations={[]} />
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">How many named techniques do characters have?</h2>
          <p className="section-desc">
          </p>
        </div>
        {techniqueRunning && (
          <TechniqueDebutsChart data={techniqueRunning} arcs={arcMeta} />
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Honoring the countless people that have worked on One Piece</h2>
          <p className="section-desc">
          </p>
        </div>
        {crewMetrics && (
          <CrewCreditsChart
            series={crewMetrics.series}
            arcs={arcMeta}
            roles={crewMetrics.roles}
          />
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">How often do characters make appearances outside of their primary arc?</h2>
          <p className="section-desc">
            Characters have been grouped into communities by how often they are featured together in an episode. these communities are labeled by the most common debut arc for members within.
          </p>
        </div>
        {communityAppearance && (
          <CharacterCommunityChart data={communityAppearance} arcOrder={arcOrder} />
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">A network visualizing characters and how often they are featured together</h2>
          <p className="section-desc">
            Move the slider around to dynamically see characters' relationships and groups!
          </p>
        </div>
        <section className="metric-container">
          <div className="metric-controls">
            <div className="control">
              <span>Episode max: {coControls.episodeMax}</span>
              <input
                type="range"
                min={1}
                max={maxEp}
                step={10}
                value={coControls.episodeMax}
                onChange={(event) =>
                  setCoControls((prev) => ({
                    ...prev,
                    episodeMax: Number(event.target.value)
                  }))
                }
              />
            </div>
            <div className="control">
              <span>Min eps per node: {coControls.minNode}</span>
              <input
                type="range"
                min={1}
                max={50}
                step={5}
                value={coControls.minNode}
                onChange={(event) =>
                  setCoControls((prev) => ({
                    ...prev,
                    minNode: Number(event.target.value)
                  }))
                }
              />
            </div>
            <div className="control">
              <span>Min edge co: {coControls.minEdge}</span>
              <input
                type="range"
                min={1}
                max={50}
                step={5}
                value={coControls.minEdge}
                onChange={(event) =>
                  setCoControls((prev) => ({
                    ...prev,
                    minEdge: Number(event.target.value)
                  }))
                }
              />
            </div>
            <div className="control">
              <span>Top N nodes: {coControls.topN}</span>
              <input
                type="range"
                min={20}
                max={500}
                step={10}
                value={coControls.topN}
                onChange={(event) =>
                  setCoControls((prev) => ({
                    ...prev,
                    topN: Number(event.target.value)

                  }))
                }
              />
            </div>
            {!coBase && <span className="pill">Run build_web_data.py for community labels</span>}
          </div>
          <div className="metric-layout">
            <div className="metric-chart">
              {coPlot && (
                <PlotlyChart
                  data={coPlot.data}
                  layout={coPlot.layout}
                  height={720}
                  tooltipFormatter={(point) => point.hovertext || point.text || null}
                />
              )}
            </div>
            <aside className="metric-legend open">
              <div className="legend-header">
                <div>
                  <strong>Communities</strong>
                  <div className="legend-subtitle">Labels use most common debut arc.</div>
                </div>
              </div>
              <div className="legend-body">
                {coLegendGlobal.map((item) => {
                  const isActive = !coControls.hiddenCommunities.includes(String(item.id));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`legend-toggle-item ${isActive ? "active" : "inactive"}`}
                      onClick={() => {
                        setCoControls((prev) => {
                          const hidden = new Set(prev.hiddenCommunities);
                          const key = String(item.id);
                          if (hidden.has(key)) {
                            hidden.delete(key);
                          } else {
                            hidden.add(key);
                          }
                          return { ...prev, hiddenCommunities: Array.from(hidden) };
                        });
                      }}
                    >
                      <span className="legend-swatch" style={{ background: item.color }} />
                      <span>
                        {item.label} ({item.count} chars)
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        </section>
      </section>
    </main>
  );
}
