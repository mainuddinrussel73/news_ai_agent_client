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
  "dailystarbangla",
  "thebusinessstandardbangla",
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
    percentage: 0,
    currentTitle: "",
    site: "",
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


  function getArticleDate(article) {
  const candidates = [
    article.date,
    article.publishedAt,
    article.scrapedAt,
    article.createdAt,
  ];

  for (const d of candidates) {
    if (d && !isNaN(new Date(d))) {
      return new Date(d);
    }
  }

  return new Date(); // final fallback
}


  // =====================================================
  // SOCKETS
  // =====================================================

 useEffect(() => {

  function progressHandler(data) {

    console.log("SOCKET PROGRESS:", data);

    setProgress(prev => ({

      ...prev,

      ...data,

      percentage:
        data.total > 0
          ? Math.floor(
              (data.completed / data.total) * 100
            )
          : 0,
    }));

    // reload articles after scraping finishes
    if (data.status === "done") {

      setTimeout(() => {
        loadArticles();
      }, 1000);
    }
  }

  // connected
  socket.on("connect", () => {
    console.log(
      "Socket connected:",
      socket.id
    );
  });

  // disconnect
  socket.on("disconnect", () => {
    console.log("Socket disconnected");
  });

  // progress
  socket.on(
    "progress",
    progressHandler
  );

  return () => {

    socket.off(
      "progress",
      progressHandler
    );

    socket.off("connect");

    socket.off("disconnect");
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

  const groupedByDateSiteSection = useMemo(() => {
  const grouped = {};

  filteredArticles.forEach((article) => {
    const dateObj = new Date(
      article.date ||
      article.scrapedAt ||
      article.createdAt ||
      Date.now()
    );

    const dateKey = dateObj.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const site = article.site || "unknown";
    const section = article.section || "general";

    // init structure
    if (!grouped[dateKey]) grouped[dateKey] = {};
    if (!grouped[dateKey][site]) grouped[dateKey][site] = {};
    if (!grouped[dateKey][site][section]) {
      grouped[dateKey][site][section] = [];
    }

    grouped[dateKey][site][section].push(article);
  });

  // sort by date DESC
  return Object.entries(grouped).sort(
    (a, b) => new Date(b[0]) - new Date(a[0])
  );
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

      <div
        style={{
          background: "#111827",
          borderRadius: 18,
          padding: 24,
          marginBottom: 30,
        }}
      >

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontWeight: 700,
            }}
          >
            Scraper Progress
          </div>

          <div>
            {progress.percentage || 0}%
          </div>
        </div>

        <div
          style={{
            height: 14,
            background: "#1e293b",
            borderRadius: 999,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: `${
                progress.percentage || 0
              }%`,

              height: "100%",

              background:
                "linear-gradient(90deg,#2563eb,#38bdf8)",

              transition: "0.3s ease",
            }}
          />
        </div>

        <div
          style={{
            color: "#cbd5e1",
            fontSize: 14,
            lineHeight: 1.8,
          }}
        >

          <div>
            Status:
            {" "}
            {progress.status}
          </div>

          <div>
              Site: {progress.site?.name || "unknown"}

          </div>

          <div>
            Progress:
            {" "}
            {progress.completed}
            /
            {progress.total}
          </div>

          {progress.currentTitle && (
            <div
              style={{
                marginTop: 8,
                color: "#94a3b8",
              }}
            >
              Current:
              {" "}
              {progress.currentTitle}
            </div>
          )}

        </div>

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
  groupedByDateSiteSection.map(([date, sites]) => (
    <div key={date} 
    
    style={{ marginBottom: 60 }}
    
    >

      {/* DATE HEADER */}
      <h2 style={{
        fontSize: 28,
        fontWeight: 800,
        color: "#38bdf8",
        marginBottom: 30,
      }}>
        📅 {date}
      </h2>

      {/* SITES */}
      {Object.keys(sites).map((site) => (
        <div key={site} style={{ marginBottom: 40 }}>

          <h3 style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 18,
            color: "#e2e8f0",
            borderLeft: "4px solid #2563eb",
            paddingLeft: 10,
          }}>
            📰 {site}
          </h3>

          {/* SECTIONS */}
          {Object.keys(sites[site]).map((section) => (
            <div key={section} style={{ marginBottom: 30 }}>

              <h4 style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 15,
                color: "#94a3b8",
              }}>
                📂 {section}
              </h4>

              {/* ARTICLES GRID */}
              <div 
              
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 22,
              }}>

                {sites[site][section].map((article, i) => (
                  <div
  key={i}
  onClick={() => openArticle(article)}
  style={{
    background: "#0f172a",
    borderRadius: 16,
    overflow: "hidden",
    cursor: "pointer",
    border: "1px solid #1f2937",
    transition: "all 0.25s ease",
    boxShadow: "0 0 0 rgba(0,0,0,0)",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-4px)";
    e.currentTarget.style.boxShadow =
      "0 10px 25px rgba(0,0,0,0.35)";
    e.currentTarget.style.borderColor = "#2563eb";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = "none";
    e.currentTarget.style.borderColor = "#1f2937";
  }}
>
  {/* IMAGE */}
  {article.image && (
    <div style={{ position: "relative" }}>
      <img
        src={article.image}
        alt=""
        style={{
          width: "100%",
          height: 200,
          objectFit: "cover",
        }}
      />

      {/* PAPER BADGE */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: "rgba(0,0,0,0.65)",
          color: "#fff",
          fontSize: 11,
          padding: "4px 8px",
          borderRadius: 8,
          textTransform: "capitalize",
          backdropFilter: "blur(6px)",
        }}
      >
        📰 {article.site}
      </div>

      {/* DATE BADGE */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(37,99,235,0.9)",
          color: "#fff",
          fontSize: 11,
          padding: "4px 8px",
          borderRadius: 8,
        }}
      >
        📅{" "}
        {article.date
          ? new Date(article.date).toLocaleDateString(
              "en-GB",
              {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }
            )
          : "N/A"}
      </div>
    </div>
  )}

  {/* CONTENT */}
  <div style={{ padding: 18 }}>

    {/* TITLE */}
    <div
      style={{
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1.5,
        color: "#f8fafc",
        marginBottom: 10,
      }}
    >
      {article.title}
    </div>

    {/* SUMMARY */}
    <div
      style={{
        fontSize: 13,
        color: "#94a3b8",
        lineHeight: 1.6,
        marginBottom: 12,
      }}
    >
      {article.summary?.slice(0, 130)}...
    </div>

    {/* FOOTER META */}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11,
        color: "#64748b",
        borderTop: "1px solid #1f2937",
        paddingTop: 10,
      }}
    >
      <span>📂 {article.section || "general"}</span>
      <span>🔗 Read more</span>
    </div>

  </div>
</div>
                ))}

              </div>

            </div>
          ))}

        </div>
      ))}

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