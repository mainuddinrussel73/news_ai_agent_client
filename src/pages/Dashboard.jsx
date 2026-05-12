import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import io from "socket.io-client";
import jsPDF from "jspdf";
import "../NotoSansBengali";
import html2canvas from "html2canvas";
import { useRef } from "react";
const API = "https://property-recycling-exes.ngrok-free.dev";

const socket = io(API, {
  transports: ["websocket"],
  secure: true,
  reconnection: true,
  reconnectionAttempts: 10,
});

const PAPERS = [
  "prothomalo",
  "bonikbarta",
  "bbc",
  "bdnews24",
  "aljazeera",
  "dailystarbangladesh",
  "thebusinessstandard",
  "kalbela",
  "kalerkantho",
  "newagebd",
  "ittefaq",
];

export default function Dashboard() {
  // =====================================================
  // STATES
  // =====================================================
const pdfRef = useRef();

  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);

  const [aiError, setAiError] = useState(false);

  const [darkMode, setDarkMode] = useState(false);

  const [fontSize, setFontSize] = useState(12);

  const [aiCache, setAiCache] = useState({});

  const [filters, setFilters] = useState({
    site: "all",
    search: "",
  });

  const [progress, setProgress] = useState({
    status: "idle",
    completed: 0,
    total: 0,
    site: "",
    section: "",
    articles: 0,
  });


  function sanitizeFileName(name = "article") {
  return name
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}
async function downloadPDF(article) {

  try {

    const response = await fetch(
      `${API}/api/pdf`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          article,
        }),
      }
    );

    const blob = await response.blob();

    const url =
      window.URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = "article.pdf";

    document.body.appendChild(a);

    a.click();

    a.remove();

  } catch (err) {
    console.log(err);
  }
}

  // =====================================================
  // LOAD ARTICLES
  // =====================================================

  async function loadArticles() {
    try {
      setLoading(true);

      const res = await axios.get(`${API}/api/articles`, {
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      });

      const data = res.data?.articles || res.data || [];

      setArticles(data);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // JSON SAFE PARSER
  // =====================================================

  function safeJSONParse(text) {
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);

      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (err) {
          return null;
        }
      }

      return null;
    }
  }

  // =====================================================
  // FALLBACK AI
  // =====================================================

  function fallback() {
    return {
      summary: "",
      key_points: [],
      statistics: [],
      entities: {
        countries: [],
        organizations: [],
        people: [],
      },
      timeline: [],
      causes: [],
      impacts: [],
      policy_implications: [],
      bangladesh_context: "unknown",
      sentiment: "neutral",
      mindmap: {},
    };
  }

  // =====================================================
  // AI ANALYZER
  // =====================================================

  async function analyzeArticle(articleText) {
    try {
      // IMPORTANT:
      // THIS SHOULD BE MOVED TO BACKEND
      // NEVER EXPOSE API KEY IN FRONTEND

      const response = await axios.post(
        `${API}/api/analyze`,
        {
          text: articleText,
        },
        {
          headers: {
            "ngrok-skip-browser-warning": "true",
          },
        }
      );

      const content = response.data?.content;

      if (!content) return fallback();

      const cleaned = content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsed = safeJSONParse(cleaned);

      if (!parsed) return fallback();

      return parsed;
    } catch (err) {
      console.log(err);
      return fallback();
    }
  }

  // =====================================================
  // OPEN ARTICLE
  // =====================================================

  async function openArticle(article) {
    setAiError(false);

    // OPEN MODAL IMMEDIATELY

    setSelected({
      ...article,
      ai: null,
    });

    // CACHE CHECK

    if (aiCache[article.url]) {
      setSelected({
        ...article,
        ai: aiCache[article.url],
      });

      return;
    }

    setLoadingAI(true);

    try {
      const ai = await analyzeArticle(article.content || "");

      // SAVE CACHE

      setAiCache((prev) => ({
        ...prev,
        [article.url]: ai,
      }));

      // SAFE UPDATE

      setSelected((prev) => ({
        ...prev,
        ai,
      }));
    } catch (err) {
      console.log(err);
      setAiError(true);
    } finally {
      setLoadingAI(false);
    }
  }

  // =====================================================
  // START SCRAPER
  // =====================================================

  async function startScraping(site) {
    try {
      await axios.post(
        `${API}/api/scrape/${site}`,
        {},
        {
          headers: {
            "ngrok-skip-browser-warning": "true",
          },
        }
      );
    } catch (err) {
      console.log(err);
    }
  }

  // =====================================================
  // NORMALIZE STATISTICS
  // =====================================================

  function normalizeStatistics(stats = []) {
    return stats.map((item, i) => {
      if (item.label || item.value) {
        return {
          name: item.label || `Item ${i + 1}`,
          value: item.value ?? "N/A",
        };
      }

      if (item.title) {
        return {
          name: item.title,
          value: item.value ?? "N/A",
        };
      }

      const keys = Object.keys(item || {});

      if (keys.length >= 2) {
        return {
          name: String(item[keys[0]]),
          value: String(item[keys[1]]),
        };
      }

      return {
        name: `Item ${i + 1}`,
        value: "N/A",
      };
    });
  }

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    loadArticles();
  }, []);

  // =====================================================
  // SOCKETS
  // =====================================================

  useEffect(() => {
    const progressHandler = (data) => {
      setProgress(data);

      if (data.status === "done") {
        loadArticles();
      }
    };

    socket.on("progress", progressHandler);

    return () => {
      socket.off("progress", progressHandler);
    };
  }, []);

  // =====================================================
  // FILTERED
  // =====================================================

  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      if (
        filters.site !== "all" &&
        article.site !== filters.site
      ) {
        return false;
      }

      if (
        filters.search &&
        !article.title
          ?.toLowerCase()
          .includes(filters.search.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [articles, filters]);

  // =====================================================
  // GROUPED
  // =====================================================

  const grouped = useMemo(() => {
    return filteredArticles.reduce((acc, article) => {
      const site = article.site || "unknown";

      if (!acc[site]) {
        acc[site] = [];
      }

      acc[site].push(article);

      return acc;
    }, {});
  }, [filteredArticles]);

  // =====================================================
  // UI
  // =====================================================

  return (
    <div
      style={{
        background: "#0f172a",
        minHeight: "100vh",
        color: "#fff",
        padding: 24,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* MODAL ANIMATION */}

      <style>
        {`
        @keyframes modalAnim {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translateY(0px) scale(1);
          }
        }
      `}
      </style>

      {/* HEADER */}

      <div style={{ marginBottom: 35 }}>
        <h1
          style={{
            fontSize: 38,
            fontWeight: 800,
            marginBottom: 10,
          }}
        >
          AI News Intelligence Dashboard
        </h1>

        <div
          style={{
            color: "#94a3b8",
            fontSize: 15,
          }}
        >
          Real-time geopolitical & economic news analysis
        </div>
      </div>

      {/* TOP BAR */}

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 30,
          alignItems: "center",
        }}
      >
        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            background: "#1e293b",
            color: "#fff",
          }}
        >
          {darkMode ? "☀ Light" : "🌙 Dark"}
        </button>

        <div>
          Font Size:
          <input
            type="range"
            min="14"
            max="28"
            value={fontSize}
            onChange={(e) =>
              setFontSize(Number(e.target.value))
            }
            style={{
              marginLeft: 12,
            }}
          />
        </div>
      </div>

      {/* SCRAPER BUTTONS */}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 35,
        }}
      >
        {PAPERS.map((site) => (
          <button
            key={site}
            onClick={() => startScraping(site)}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "#1e293b",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Scrape {site}
          </button>
        ))}
      </div>

      {/* FILTERS */}

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 35,
        }}
      >
        <select
          value={filters.site}
          onChange={(e) =>
            setFilters({
              ...filters,
              site: e.target.value,
            })
          }
          style={{
            padding: 12,
            borderRadius: 12,
            border: "none",
            background: "#1e293b",
            color: "#fff",
          }}
        >
          <option value="all">All Papers</option>

          {PAPERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search article..."
          value={filters.search}
          onChange={(e) =>
            setFilters({
              ...filters,
              search: e.target.value,
            })
          }
          style={{
            padding: 12,
            borderRadius: 12,
            border: "none",
            width: 300,
            background: "#1e293b",
            color: "#fff",
          }}
        />
      </div>

      {/* LOADING */}

      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
          }}
        >
          Loading Articles...
        </div>
      )}

      {/* ARTICLES */}

      {!loading &&
        Object.keys(grouped).map((site) => (
          <div
            key={site}
            style={{
              marginBottom: 50,
            }}
          >
            <h2
              style={{
                marginBottom: 22,
                textTransform: "capitalize",
                fontSize: 26,
              }}
            >
              {site}
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill,minmax(260px,1fr))",
                gap: 22,
              }}
            >
              {grouped[site].map((article, i) => (
                <div
                  key={i}
                  onClick={() => openArticle(article)}
                  style={{
                    background: "#111827",
                    borderRadius: 18,
                    overflow: "hidden",
                    cursor: "pointer",
                    transition: "0.2s",
                  }}
                >
                  {article.image && (
                    <img
                      src={article.image}
                      alt=""
                      style={{
                        width: "100%",
                        height: 220,
                        objectFit: "cover",
                      }}
                    />
                  )}

                  <div
                    style={{
                      padding: 22,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 18,
                        lineHeight: 1.6,
                        marginBottom: 15,
                      }}
                    >
                      {article.title}
                    </div>

                    <div
                      style={{
                        color: "#94a3b8",
                        lineHeight: 1.7,
                        fontSize: 14,
                      }}
                    >
                      {article.summary?.slice(0, 150)}...
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      {/* MODAL */}

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.72)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            overflowY: "auto",
            padding: 30,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: darkMode ? "#0f172a" : "#fff",
              color: darkMode ? "#e5e7eb" : "#111",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              maxWidth: 1000,
              margin: "0 auto",
              borderRadius: 22,
              overflow: "hidden",
              animation: "modalAnim 0.25s ease",
            }}
          >
            {/* CLOSE */}

            <button
              onClick={() => setSelected(null)}
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "none",
                background: "white",
                cursor: "pointer",
                fontSize: 18,
                fontWeight: 700,
                zIndex: 10,
              }}
            >
              ✕
            </button>

            {/* IMAGE */}

            {selected.image && (
              <img
                src={selected.image}
                alt=""
                style={{
                  width: "100%",
                  height: 180,
                  objectFit: "cover",
                }}
              />
            )}

            {/* BODY */}

            <div
              style={{
                padding: 20,
              }}
            >
              <h1
                style={{
                  fontSize: 34,
                  lineHeight: 1.4,
                  marginBottom: 25,
                }}
              >
                {selected.title}
              </h1>

              {/* META */}

              <div
                style={{
                  display: "flex",
                  gap: 20,
                  marginBottom: 30,
                  color: "#64748b",
                  fontSize: 14,
                  flexWrap: "wrap",
                }}
              >
                <span>📰 {selected.site}</span>

                <span>📂 {selected.section}</span>

                <span>
                  🕒
                  {selected.date
                    ? new Date(
                        selected.date
                      ).toLocaleString()
                    : ""}
                </span>
              </div>

              {/* CONTENT */}

              <div
                ref={pdfRef}
                style={{
                  background: darkMode
                    ? "#0b1220"
                    : "#faf7f2",

                  color: darkMode
                    ? "#e5e7eb"
                    : "#1a1a1a",

                  maxWidth: "900px",
                  margin: "0 auto",

                  padding: "10px 18px",

                  fontFamily:
                    "Georgia, 'Times New Roman', serif",

                  fontSize: fontSize,
                  lineHeight: 1.7,

                  borderRadius: 14,
                }}
              >
                {selected.content
                  ?.split(/\n|\.\s+/)
                  .filter(Boolean)
                  .map((para, i) => (
                    <p
                      key={i}
                      style={{
                        marginBottom: 28,
                        textIndent: "22px",
                      }}
                    >
                      {para.trim()}.
                    </p>
                  ))}
              </div>

              {/* AI SECTION */}

              <div
                style={{
                  marginTop: 40,
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: 30,
                }}
              >
                <h2
                  style={{
                    fontSize: 28,
                    marginBottom: 24,
                  }}
                >
                  🧠 AI Intelligence
                </h2>

                {/* LOADING */}

                {loadingAI && (
                  <div
                    style={{
                      background: "#f8fafc",
                      padding: 20,
                      borderRadius: 14,
                    }}
                  >
                    ⏳ Analyzing article...
                  </div>
                )}

                {/* ERROR */}

                {aiError && (
                  <div
                    style={{
                      background: "#fff1f2",
                      padding: 20,
                      borderRadius: 14,
                      color: "#be123c",
                    }}
                  >
                    AI analysis failed.
                  </div>
                )}

                {/* AI CONTENT */}

                {selected.ai && (
                  <>
                    {/* SUMMARY */}

                    <div style={{ marginBottom: 40 }}>
                      <h3
                        style={{
                          marginBottom: 16,
                          fontSize: 22,
                        }}
                      >
                        Executive Summary
                      </h3>

                      <div
                        style={{
                          background: "#f8fafc",
                          padding: 22,
                          borderRadius: 14,
                          color: "#111",
                          lineHeight: 1.9,
                        }}
                      >
                        {selected.ai.summary}
                      </div>
                    </div>

                    {/* KEY POINTS */}

                    {selected.ai.key_points?.length > 0 && (
                      <div style={{ marginBottom: 40 }}>
                        <h3
                          style={{
                            marginBottom: 18,
                            fontSize: 22,
                          }}
                        >
                          📌 Key Points
                        </h3>

                        <ul
                          style={{
                            paddingLeft: 22,
                            lineHeight: 2,
                          }}
                        >
                          {selected.ai.key_points.map(
                            (k, i) => (
                              <li key={i}>{k}</li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                    {/* STATISTICS */}

                    {selected.ai.statistics?.length >
                      0 && (
                      <div style={{ marginBottom: 40 }}>
                        <h3
                          style={{
                            marginBottom: 18,
                            fontSize: 22,
                          }}
                        >
                          📊 Statistics
                        </h3>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit,minmax(220px,1fr))",
                            gap: 16,
                          }}
                        >
                          {normalizeStatistics(
                            selected.ai.statistics
                          ).map((s, i) => (
                            <div
                              key={i}
                              style={{
                                background:
                                  "#f8fafc",
                                padding: 18,
                                borderRadius: 12,
                                color: "#111",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                }}
                              >
                                {s.name}
                              </div>

                              <div
                                style={{
                                  marginTop: 8,
                                }}
                              >
                                {String(s.value)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ENTITIES */}

                    <div style={{ marginBottom: 40 }}>
                      <h3
                        style={{
                          marginBottom: 18,
                          fontSize: 22,
                        }}
                      >
                        🌍 Entities
                      </h3>

                      <p>
                        <b>Countries:</b>{" "}
                        {selected.ai.entities?.countries?.join(
                          ", "
                        )}
                      </p>

                      <p>
                        <b>Organizations:</b>{" "}
                        {selected.ai.entities?.organizations?.join(
                          ", "
                        )}
                      </p>

                      <p>
                        <b>People:</b>{" "}
                        {selected.ai.entities?.people?.join(
                          ", "
                        )}
                      </p>
                    </div>

                    {/* TIMELINE */}

                    {selected.ai.timeline?.length >
                      0 && (
                      <div style={{ marginBottom: 40 }}>
                        <h3
                          style={{
                            marginBottom: 18,
                            fontSize: 22,
                          }}
                        >
                          🕒 Timeline
                        </h3>

                        {selected.ai.timeline.map(
                          (t, i) => (
                            <div
                              key={i}
                              style={{
                                background:
                                  "#f8fafc",
                                padding: 16,
                                borderRadius: 12,
                                marginBottom: 12,
                                color: "#111",
                              }}
                            >
                              <strong>
                                {t.text}
                              </strong>

                              <div
                                style={{
                                  marginTop: 6,
                                }}
                              >
                                {t.time}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ARTICLE LINK */}

                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 20,
                    color: "#2563eb",
                    fontWeight: 700,
                  }}
                >
                  🔗 Read Full Article
                </a>
                <button
  onClick={() => downloadPDF(selected)}
  style={{
    padding: "10px 18px",
    border: "none",
    marginTop: 20,
    borderRadius: 12,
    background: "#7c3aed",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  }}
>
  ⬇ Download PDF
</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}