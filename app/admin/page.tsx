"use client";

import { useState } from "react";

interface LogRow {
  id: number;
  ip: string;
  path: string | null;
  method: string | null;
  user_agent: string | null;
  referer: string | null;
  created_at: string;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/logs?limit=100&token=${encodeURIComponent(token)}`
      );
      if (res.status === 401) {
        setError("토큰이 올바르지 않습니다.");
        setLogs([]);
        setTotal(null);
        return;
      }
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? null);
    } catch {
      setError("불러오기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    window.location.href = `/api/admin/logs?format=csv&limit=100&token=${encodeURIComponent(
      token
    )}`;
  }

  async function prune() {
    if (!confirm("보관 정책에 따라 오래된 로그를 정리할까요?")) return;
    const res = await fetch(
      `/api/admin/logs?token=${encodeURIComponent(token)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const d = await res.json();
      alert(
        `정리 완료: 기간초과 ${d.deletedByAge}건, 한도초과 ${d.deletedByCount}건 삭제. 남은 로그 ${d.remaining}건.`
      );
      load();
    } else {
      alert("정리 실패 (토큰 확인)");
    }
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        접속 로그 관리자
      </h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        최근 접속한 IP 주소와 시간을 확인하고 CSV로 내려받을 수 있습니다.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          type="password"
          placeholder="관리자 토큰"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          style={{ flex: 1, minWidth: 200, padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button onClick={load} disabled={loading || !token} style={btn("#2563eb")}>
          {loading ? "불러오는 중…" : "조회"}
        </button>
        <button onClick={downloadCsv} disabled={!token || logs.length === 0} style={btn("#059669")}>
          로그 다운로드 (CSV)
        </button>
        <button onClick={prune} disabled={!token} style={btn("#b45309")}>
          오래된 로그 정리
        </button>
      </div>

      {error && <p style={{ color: "#dc2626", marginBottom: 12 }}>{error}</p>}
      {total !== null && (
        <p style={{ fontSize: 13, color: "#444", marginBottom: 8 }}>
          전체 로그 {total.toLocaleString()}건 · 최근 {logs.length}건 표시
        </p>
      )}

      {logs.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                <th style={th}>#</th>
                <th style={th}>IP 주소</th>
                <th style={th}>접속 시간 (UTC)</th>
                <th style={th}>User-Agent</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={td}>{l.id}</td>
                  <td style={{ ...td, fontFamily: "monospace" }}>{l.ip}</td>
                  <td style={td}>{l.created_at}</td>
                  <td style={{ ...td, color: "#777", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.user_agent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", whiteSpace: "nowrap" };
function btn(bg: string): React.CSSProperties {
  return {
    padding: "8px 14px",
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    opacity: 1,
  };
}
