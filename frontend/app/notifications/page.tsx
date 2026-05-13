"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const typeMeta: Record<string, { icon: string; tint: string }> = {
  follow_request:     { icon: "👤", tint: "linear-gradient(135deg, #6366f1, #8b5cf6)" },
  follow_accepted:    { icon: "✓",  tint: "linear-gradient(135deg, #10b981, #059669)" },
  group_invite:       { icon: "✉️", tint: "linear-gradient(135deg, #f59e0b, #ef4444)" },
  group_join_request: { icon: "👥", tint: "linear-gradient(135deg, #06b6d4, #3b82f6)" },
  group_event:        { icon: "📅", tint: "linear-gradient(135deg, #ec4899, #f43f5e)" },
  post_comment:       { icon: "💬", tint: "linear-gradient(135deg, #8b5cf6, #6366f1)" },
  dm_message:         { icon: "✉",  tint: "linear-gradient(135deg, #0ea5e9, #6366f1)" },
  group_message:      { icon: "🗨", tint: "linear-gradient(135deg, #14b8a6, #06b6d4)" },
};

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  const load = async () => {
    setItems(await api<any[]>("/api/notifications"));
    setRequests(await api<any[]>("/api/follow-requests"));
  };

  useEffect(() => { load(); }, []);

  const safe = async (fn: () => Promise<any>, notifId?: string) => {
    try {
      await fn();
      if (notifId) {
        try { await api(`/api/notifications/${notifId}/read`, { method: "POST" }); } catch {}
      }
    } catch (e) {
      // Action already handled elsewhere (e.g. accepted from group page) — just refresh.
      console.warn("notification action failed:", e);
    } finally {
      load();
    }
  };

  const markRead = (id: string) => safe(async () => {
    await api(`/api/notifications/${id}/read`, { method: "POST" });
  });
  const markAll = async () => { try { await api("/api/notifications/read-all", { method: "POST" }); } catch {} load(); };
  const acceptFollow = (id: string, nid?: string) => safe(() => api(`/api/follow-requests/${id}/accept`, { method: "POST" }), nid);
  const declineFollow = (id: string, nid?: string) => safe(() => api(`/api/follow-requests/${id}/decline`, { method: "POST" }), nid);
  const acceptInv = (id: string, nid?: string) => safe(() => api(`/api/group-invitations/${id}/accept`, { method: "POST" }), nid);
  const declineInv = (id: string, nid?: string) => safe(() => api(`/api/group-invitations/${id}/decline`, { method: "POST" }), nid);
  const acceptJoin = (id: string, nid?: string) => safe(() => api(`/api/group-requests/${id}/accept`, { method: "POST" }), nid);
  const declineJoin = (id: string, nid?: string) => safe(() => api(`/api/group-requests/${id}/decline`, { method: "POST" }), nid);

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>Notifications</h1>
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        <div className="grow" />
        <button className="btn secondary sm" onClick={markAll} disabled={unreadCount === 0}>
          Mark all read
        </button>
      </div>

      {requests.length > 0 && (
        <div className="card">
          <h3>Pending follow requests</h3>
          {requests.map((r) => (
            <div key={r.id} className="row" style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <span className="avatar sm" aria-hidden />
              <span style={{ flex: 1 }}>
                <b>{r.first_name} {r.last_name}</b> wants to follow you
              </span>
              <button className="btn sm" onClick={() => acceptFollow(r.id)}>Accept</button>
              <button className="btn secondary sm" onClick={() => declineFollow(r.id)}>Decline</button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && requests.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 36 }}>🔕</div>
          <h3 style={{ marginBottom: 4 }}>You're all caught up</h3>
          <p className="muted">New activity will show up here.</p>
        </div>
      )}

      {items.map((n) => {
        const p = n.payload || {};
        const meta = typeMeta[n.type] || { icon: "🔔", tint: "var(--surface-3)" };
        const who = p.from_name || p.by_name || "Someone";
        const group = p.group_title ? `"${p.group_title}"` : "your group";
        let body: any = n.type;
        let actions: any = null;
        if (n.type === "follow_request") body = (
          <><b>{who}</b> wants to follow you</>
        );
        if (n.type === "group_invite") {
          body = <><b>{who}</b> invited you to {group}</>;
          actions = (
            <>
              <button className="btn sm" onClick={() => acceptInv(p.invitation_id, n.id)}>Accept</button>
              <button className="btn secondary sm" onClick={() => declineInv(p.invitation_id, n.id)}>Decline</button>
            </>
          );
        }
        if (n.type === "group_join_request") {
          body = <><b>{who}</b> wants to join {group}</>;
          actions = (
            <>
              <button className="btn sm" onClick={() => acceptJoin(p.request_id, n.id)}>Accept</button>
              <button className="btn secondary sm" onClick={() => declineJoin(p.request_id, n.id)}>Decline</button>
            </>
          );
        }
        if (n.type === "group_event") body = (
          <>New event {p.event_title ? <b>"{p.event_title}"</b> : ""} in {group}</>
        );
        if (n.type === "post_comment") body = (
          <><b>{who}</b> commented on your post</>
        );
        if (n.type === "follow_accepted") body = (
          <><b>{who}</b> accepted your follow request</>
        );
        if (n.type === "dm_message") body = (
          <><b>{who}</b>: <span className="muted">{p.content}</span></>
        );
        if (n.type === "group_message") body = (
          <><b>{who}</b> in {group}: <span className="muted">{p.content}</span></>
        );

        return (
          <div
            key={n.id}
            className="card row"
            style={{
              alignItems: "center",
              gap: 14,
              padding: 14,
              borderLeft: n.is_read ? undefined : "3px solid var(--brand-500)",
              background: n.is_read ? "var(--surface)" : "rgba(99,102,241,0.06)",
            }}
          >
            <span
              style={{
                width: 40, height: 40,
                borderRadius: 12,
                background: meta.tint,
                color: "#fff",
                display: "grid", placeItems: "center",
                fontSize: 18,
                flexShrink: 0,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              {meta.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: n.is_read ? 500 : 600 }}>{body}</div>
              <div className="muted" style={{ fontSize: 12 }}>{timeAgo(n.created_at)}</div>
            </div>
            {!n.is_read && actions}
            {!n.is_read && !actions && (
              <button className="btn ghost sm" onClick={() => markRead(n.id)}>Mark read</button>
            )}
          </div>
        );
      })}
    </>
  );
}
