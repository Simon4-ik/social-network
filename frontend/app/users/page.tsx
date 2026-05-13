"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, mediaURL } from "@/lib/api";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { api<any[]>("/api/users").then(setUsers).catch(() => {}); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) =>
      `${u.first_name} ${u.last_name} ${u.nickname || ""}`.toLowerCase().includes(s)
    );
  }, [users, q]);

  return (
    <>
      <div className="row" style={{ marginBottom: 14, alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>People</h1>
        <div className="grow" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          style={{ maxWidth: 280, borderRadius: "var(--radius-pill)" }}
        />
      </div>

      {filtered.length === 0 && (
        <div className="empty">
          <h3>No people found</h3>
          <p className="muted">{q ? "Try a different search." : "No users to show yet."}</p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {filtered.map((u) => (
          <Link
            key={u.id}
            href={`/users/${u.id}`}
            className="card interactive"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              padding: 18,
              margin: 0,
              color: "var(--text)",
              gap: 10,
            }}
          >
            {u.avatar_path ? (
              <img className="avatar lg ring" src={mediaURL(u.avatar_path)} alt="" />
            ) : (
              <span className="avatar lg ring" aria-hidden />
            )}
            <div>
              <div style={{ fontWeight: 700 }}>{u.first_name} {u.last_name}</div>
              {u.nickname && <div className="muted">@{String(u.nickname).replace(/^@+/, "")}</div>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
