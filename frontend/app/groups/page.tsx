"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

function initials(s: string) {
  return s.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => setGroups(await api("/api/groups"));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/groups", { method: "POST", body: JSON.stringify({ title, description: desc }) });
      setTitle(""); setDesc(""); setOpen(false); load();
    } finally { setBusy(false); }
  };

  const request = async (id: string) => {
    await api(`/api/groups/${id}/request`, { method: "POST" });
    load();
  };

  return (
    <>
      <div className="card card-hero" style={{ padding: "28px 28px" }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0 }}>Groups</h1>
            <p style={{ margin: "4px 0 0", opacity: 0.9 }}>Find your people. Start a community. Plan an event.</p>
          </div>
          <button
            className="btn secondary"
            style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "+ New group"}
          </button>
        </div>
      </div>

      {open && (
        <div className="card">
          <form onSubmit={create}>
            <h3>Create a new group</h3>
            <label>Title</label>
            <input placeholder="Sunset Photographers" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <label>Description</label>
            <textarea placeholder="What is this group about?" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            <div className="row" style={{ marginTop: 12 }}>
              <div className="grow" />
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy || !title.trim()}>
                {busy ? <span className="spinner" /> : "Create group"}
              </button>
            </div>
          </form>
        </div>
      )}

      {groups.length === 0 && (
        <div className="empty">
          <h3 style={{ marginBottom: 4 }}>No groups yet</h3>
          <p className="muted">Be the first to start one.</p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.id} className="card row" style={{ alignItems: "center" }}>
          <span
            className="avatar lg"
            style={{
              background: "linear-gradient(135deg, #6366f1, #ec4899)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 22,
              border: 0,
            }}
          >
            {initials(g.title)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link href={`/groups/${g.id}`} style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
              {g.title}
            </Link>
            {g.description && <div className="muted" style={{ marginTop: 2 }}>{g.description}</div>}
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              <span className="chip">👥 {g.members} {g.members === 1 ? "member" : "members"}</span>
              {g.is_member && <span className="chip success">✓ Joined</span>}
            </div>
          </div>
          {!g.is_member ? (
            <button className="btn secondary" onClick={() => request(g.id)}>Request to join</button>
          ) : (
            <Link href={`/groups/${g.id}`} className="btn">Open</Link>
          )}
        </div>
      ))}
    </>
  );
}
