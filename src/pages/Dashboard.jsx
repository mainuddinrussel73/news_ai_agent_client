import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import io from "socket.io-client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
const socket = io("https://property-recycling-exes.ngrok-free.dev", {
  transports: ["websocket"],
  secure: true,
  reconnection: true
});
const COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#7c3aed",
];



export default function Dashboard() {
  const [darkMode, setDarkMode] = useState(false);
const [fontSize, setFontSize] = useState(18);
  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [progress, setProgress] = useState({ status: "idle", completed: 0, total: 0, logs: [] });
  const [loadingAI, setLoadingAI] = useState(false);
const [aiError, setAiError] = useState(false);
  // 🔥 SOCKET 
  useEffect(() => { 
    socket.on("progress", data => { setProgress(data); }); return () => socket.off("progress"); }, []);
  const [filters, setFilters] = useState({
  site: "all",
  from: "",
  to: ""
});
  const parseDate = (d) => {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
};
const filteredArticles = articles.filter((a) => {
  // ------------------------
  // SITE FILTER
  // ------------------------
  if (filters.site !== "all" && a.site !== filters.site) {
    return false;
  }

  // ------------------------
  // DATE FILTER
  // ------------------------
  const articleDate = parseDate(a.date);
  if (!articleDate) return true;

  const fromDate = filters.from ? new Date(filters.from) : null;
  const toDate = filters.to ? new Date(filters.to) : null;

  if (fromDate && articleDate < fromDate) return false;
  if (toDate && articleDate > toDate) return false;

  return true;
});
    // =========================
  // LOAD NEWS
  // =========================
  useEffect(() => {
    async function loadNews() {
       try {
        const res = await axios.get(
          "https://property-recycling-exes.ngrok-free.dev/api/crawl",
          {
            headers: {
      "ngrok-skip-browser-warning": "true"
    }
          }
        );

        const data = res.data;

        setArticles(data?.articles || data || []);
      } catch (err) {
        console.log(err);
      }
      
    }

    loadNews();
  }, []);

  // =========================
  // SAFE AI ANALYZER
  // =========================
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

  async function analyzeArticle(articleText) {
    const prompt =  `
You are a STRICT JSON SCHEMA ENFORCER.

You MUST return ONLY valid JSON.
NO markdown.
NO backticks.
NO explanations.
NO extra fields.
NO alternative keys.

If you fail to follow schema, return fallback JSON exactly.

-----------------------------
REQUIRED SCHEMA (DO NOT CHANGE)
-----------------------------

{
  "summary": "string",
  "key_points": ["string"],
  "statistics": [
    {
      "label": "string",
      "value": "string or number"
    }
  ],
  "entities": {
    "countries": ["string"],
    "organizations": ["string"],
    "people": ["string"]
  },
  "timeline": [
    {
      "time": "string",
      "text": "string"
    }
  ],
  "causes": ["string"],
  "impacts": ["string"],
  "policy_implications": ["string"],
  "bangladesh_context": "string",
  "sentiment": "string",
  "mindmap": {}
}

-----------------------------
RULES
-----------------------------

1. NEVER use:
   - title / description
   - date / event
   - year / event
   - any alternative naming

2. ONLY use:
   - timeline.time
   - timeline.text
   - statistics.label
   - statistics.value

3. If information is missing:
   use empty array [] or "unknown"

4. Output must be VALID JSON only

-----------------------------
ARTICLE:
${articleText}
`
;

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer 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`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta-llama/llama-3.1-8b-instruct",
            temperature: 0.2,
            messages: [{ role: "user", content: prompt }],
          }),
        }
      );

      const data = await response.json();
      console.log("AI response:", data);

      const content = data?.choices?.[0]?.message?.content;

      if (!content) return fallback();

      const parsed = safeJSONParse(content);

      if (!parsed) return fallback();

      return parsed;
    } catch (err) {
      console.log(err);
      return fallback();
    }
  }
function normalizeStatistics(stats = []) {
  return stats.map((item, i) => {
    // CASE 1: label/value format (new)
    if (item.label || item.value) {
      return {
        name: item.label || `Item ${i + 1}`,
        value: item.value ?? "N/A",
      };
    }

    // CASE 2: old title/value
    if (item.title) {
      return {
        name: item.title,
        value: item.value ?? "N/A",
      };
    }

    // CASE 3: fallback key-value object
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

  // =========================
  // OPEN ARTICLE + AI
  // =========================
  async function openArticle(article) {
    setSelected({
      ...article,
      ai: null,
    });

    setLoadingAI(true);

    try {
      const ai = await analyzeArticle(article.content || "");
      console.log("AI analysis complete:", ai);
      setSelected({
        ...article,
        ai,
      });
    } catch (err) {
       setAiError(true);
      console.log(err);
    }

    setLoadingAI(false);
  }

  // =========================
  // GROUP BY SITE
  // =========================


const grouped = useMemo(() => {
  return filteredArticles.reduce((acc, article) => {
    const key = article.site || "unknown";

    if (!acc[key]) acc[key] = [];
    acc[key].push(article);

    return acc;
  }, {});
}, [filteredArticles]);
  // =========================
  // STATISTICS PARSER
  // =========================
  function parseStatistics(stats = []) {
    return stats
      .map((item, i) => {
        // CASE 1
        // { year: 2026, inflation_rate: 8.71 }

        if (
          typeof item === "object" &&
          !item.title &&
          Object.keys(item).length >= 2
        ) {
          const keys = Object.keys(item);

          const labelKey = keys[0];
          const valueKey = keys[1];

          return {
            name: `${item[labelKey]}`,
            value: Number(item[valueKey]) || 0,
          };
        }

        // CASE 2
        // { title: "...", value: "80" }

        if (item.title) {
          const numeric =
            parseFloat(
              String(item.value || "")
                .replace(/[^\d.-]/g, "")
                .trim()
            ) || 0;

          return {
            name: item.title,
            value: numeric,
          };
        }

        return {
          name: `Item ${i + 1}`,
          value: 0,
        };
      })
      .filter((x) => x.value > 0);
  }

  // =========================
  // MINDMAP
  // =========================
  function renderMindMap(node, level = 0) {
    if (!node) return null;

    if (typeof node === "string") {
      return (
        <div
          style={{
            marginLeft: level * 20,
            marginTop: 8,
          }}
        >
          • {node}
        </div>
      );
    }

    return (
      <div
        style={{
          marginLeft: level * 20,
          marginTop: 10,
          paddingLeft: 10,
          borderLeft: "2px solid #ddd",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: "#111827",
          }}
        >
          {node.title}
        </div>

        {node.description && (
          <div
            style={{
              color: "#6b7280",
              marginTop: 5,
            }}
          >
            {node.description}
          </div>
        )}

        {node.children?.map((child, i) => (
          <div key={i}>{renderMindMap(child, level + 1)}</div>
        ))}
      </div>
    );
  }

  // =========================
  // RENDER
  // =========================
  return (
    <div
      style={{
        background: "#f3f4f6",
        minHeight: "100vh",
        padding: 20,
      }}
    >
      <h1
        style={{
          fontSize: 32,
          fontWeight: 800,
          marginBottom: 30,
        }}
      >
        Bloomberg-style AI News Intelligence Dashboard
      </h1>
       {/* PROGRESS */}
      <div style={{
        border: "1px solid #ddd",
        padding: 15,
        marginBottom: 25,
        borderRadius: 10,
        background: "#fafafa"
      }}>
        <strong>Status:</strong> {progress.status} <br />
        {progress.completed} / {progress.total}

        <div style={{
          height: 8,
          background: "#eee",
          borderRadius: 5,
          marginTop: 10
        }}>
          <div style={{
            width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%`,
            height: "100%",
            background: "#4caf50"
          }} />
        </div>
      </div>
      <div style={{
  display: "flex",
  gap: 12,
  marginBottom: 20,
  flexWrap: "wrap"
}}>
  
  {/* SITE FILTER */}
  <select
    value={filters.site}
    onChange={(e) =>
      setFilters({ ...filters, site: e.target.value })
    }
    style={{ padding: 8, borderRadius: 8 }}
  >
    <option value="all">All Papers</option>
    <option value="prothomalo">Prothom Alo</option>
    <option value="bbc">BBC</option>
    <option value="bdnews24">Bdnews24</option>
    <option value="kalbela">Kalbela</option>
    <option value="newagebangladesh">New Age</option>
    <option value="dailystarbangladesh">Daily Star</option>
    <option value="jugantor">Jugantor</option>
    <option value="ittefaq">Ittefaq</option>
    <option value="thebusinessstandard">Business Standard</option>
  </select>

  {/* FROM DATE */}
  <input
    type="date"
    value={filters.from}
    onChange={(e) =>
      setFilters({ ...filters, from: e.target.value })
    }
    style={{ padding: 8, borderRadius: 8 }}
  />

  {/* TO DATE */}
  <input
    type="date"
    value={filters.to}
    onChange={(e) =>
      setFilters({ ...filters, to: e.target.value })
    }
    style={{ padding: 8, borderRadius: 8 }}
  />

  {/* RESET */}
  <button
    onClick={() =>
      setFilters({ site: "all", from: "", to: "" })
    }
    style={{
      padding: "8px 12px",
      borderRadius: 8,
      background: "#0f172a",
      color: "#fff"
    }}
  >
    Reset
  </button>
</div>
      {Object.keys(grouped).map((site) => (
        <div key={site} style={{ marginBottom: 50 }}>
          <h2
            style={{
              fontSize: 24,
              marginBottom: 20,
              textTransform: "capitalize",
            }}
          >
            {site}
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 20,
            }}
          >
            {grouped[site].map((article, i) => (
              <div
                key={i}
                onClick={() => openArticle(article)}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  overflow: "hidden",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  transition: "0.2s",
                }}
              >
                {article.image && (
                  <img
                    src={article.image}
                    alt=""
                    style={{
                      width: "100%",
                      height: 200,
                      objectFit: "cover",
                    }}
                  />
                )}

                <div style={{ padding: 18 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    {article.title}
                  </div>

                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    {article.summary?.slice(0, 150)}...
                  </div>

                  <div
                    style={{
                      marginTop: 15,
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    <span>{article.section}</span>
                    <span>{article.site}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {/* =========================
    MODAL
========================= */}

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
      padding: "40px 16px"
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: 820,
        margin: "0 auto",
        background: darkMode ? "#0f172a" : "#fff",
color: darkMode ? "#e5e7eb" : "#000",
        borderRadius: 22,
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        position: "relative"
      }}
    >

      {/* CLOSE BUTTON */}
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
          background: "rgba(255,255,255,0.9)",
          cursor: "pointer",
          fontSize: 18,
          fontWeight: 700,
          boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          zIndex: 10
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
            height: 320,
            objectFit: "cover"
          }}
        />
      )}

      <div style={{ padding: "32px" }}>

        {/* TITLE */}
        <h1 style={{
          fontSize: 30,
          lineHeight: 1.35,
          marginBottom: 18,
          color: "#0f172a",
          fontWeight: 700
        }}>
          {selected.title}
        </h1>

        {/* META */}
        <div style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 28,
          fontSize: 13,
          color: "#64748b"
        }}>
          <span>📰 {selected.site || "News"}</span>
          <span>📂 {selected.section}</span>
          <span>
            🕒 {selected.date
              ? new Date(selected.date).toLocaleString()
              : ""}
          </span>
        </div>

        {/* SUMMARY */}
        {selected.summary && (
          <div style={{
            background: darkMode ? "#0f172a" : "#fff",
color: darkMode ? "#e5e7eb" : "#000",
            borderLeft: "4px solid #2563eb",
            padding: "18px 20px",
            borderRadius: 12,
            marginBottom: 36,
            fontSize: 17,
            lineHeight: 1.9,
            color: "#334155"
          }}>
            {selected.summary}
          </div>
        )}

        {/* ARTICLE CONTENT (PRESERVES PARAGRAPH GAP) */}
        <div style={{
            background: darkMode ? "#0f172a" : "#fff",
          fontSize :fontSize || 18,
            lineHeight: 2.1,
          color: "#1e293b",
          marginBottom: 40
        }}>
          {selected.content
            ?.split(/\n|\.\s+/)
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} style={{
                marginBottom: 28,
                textAlign: "justify"
              }}>
                {para}
              </p>
            ))}
        </div>

        {/* ================= AI SECTION ================= */}
        {selected?.ai ? (
          <div style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: 30
          }}>

            <h2 style={{ fontSize: 26, marginBottom: 24 }}>
              🧠 AI Intelligence
            </h2>

            {/* SUMMARY */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 20, marginBottom: 14 }}>
                Executive Summary
              </h3>

              <div style={{
                background: "#f8fafc",
                padding: 22,
                borderRadius: 14,
                lineHeight: 1.9,
                fontSize: 16
              }}>
                {selected.ai.summary}
              </div>
            </div>

            {/* KEY POINTS */}
            {selected.ai.key_points?.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: 20, marginBottom: 18 }}>
                  📌 Key Points
                </h3>
                <ul style={{ paddingLeft: 24, lineHeight: 2 }}>
                  {selected.ai.key_points.map((k, i) => (
                    <li key={i} style={{ marginBottom: 12 }}>{k}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* CAUSES */}
            {selected.ai.causes?.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: 20, marginBottom: 18 }}>
                  ⚠ Causes
                </h3>
                <ul style={{ paddingLeft: 24, lineHeight: 2 }}>
                  {selected.ai.causes.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* IMPACTS */}
            {selected.ai.impacts?.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: 20, marginBottom: 18 }}>
                  📉 Impacts
                </h3>
                <ul style={{ paddingLeft: 24, lineHeight: 2 }}>
                  {selected.ai.impacts.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* POLICY */}
            {selected.ai.policy_implications?.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: 20, marginBottom: 18 }}>
                  🏛 Policy Implications
                </h3>
                <ul style={{ paddingLeft: 24, lineHeight: 2 }}>
                  {selected.ai.policy_implications.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* TIMELINE */}
           {selected.ai.timeline?.map((t, i) => {

  return (
    <div
      key={i}
      style={{
        padding: 16,
        borderRadius: 12,
        background: "#f8fafc",
        marginBottom: 12
      }}
    >
      <strong>{t.text}</strong>
      <div style={{ marginTop: 6 }}>
        {t.time}
      </div>
    </div>
  );
})}

{selected.ai.statistics?.length > 0 && (
  <div style={{ marginBottom: 40 }}>
    <h3 style={{ fontSize: 20, marginBottom: 18 }}>
      📊 Statistics
    </h3>

    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 16
    }}>
      {normalizeStatistics(selected.ai.statistics).map((s, i) => (
        <div
          key={i}
          style={{
            background: "#f8fafc",
            padding: 16,
            borderRadius: 12
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {s.name}
          </div>

          <div style={{ marginTop: 6 }}>
            {typeof s.value === "object"
              ? JSON.stringify(s.value)
              : String(s.value)}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
            {/* ENTITIES */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 20, marginBottom: 18 }}>
                🌍 Entities
              </h3>

              <p><b>Countries:</b> {selected.ai.entities?.countries?.join(", ")}</p>
              <p><b>Organizations:</b> {selected.ai.entities?.organizations?.join(", ")}</p>
              <p><b>People:</b> {selected.ai.entities?.people?.join(", ")}</p>
            </div>

          </div>
        ) : (
          <div>
            {loadingAI ? (
  <div
    style={{
      padding: 20,
      background: "#f8fafc",
      borderRadius: 12,
      textAlign: "center",
      fontSize: 15,
      color: "#334155"
    }}
  >
    ⏳ Analyzing article with AI... please wait
  </div>
) : aiError ? (
  <div
    style={{
      padding: 20,
      background: "#fff1f2",
      borderRadius: 12,
      color: "#be123c",
      fontSize: 15
    }}
  >
    ⚠ AI analysis failed. Please try again later.
  </div>
) : !selected?.ai ? (
  <div
    style={{
      padding: 20,
      background: "#f1f5f9",
      borderRadius: 12,
      color: "#475569",
      fontSize: 15
    }}
  >
    ℹ AI analysis will appear after processing this article.
  </div>
) : null} 
            
          </div>
        )}

        {/* LINK */}
        <a
          href={selected.url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            marginTop: 10,
            color: "#2563eb",
            fontWeight: 600
          }}
        >
          🔗 Read Full Article
        </a>

      </div>
    </div>
  </div>
)}
      
    </div>
  );
}