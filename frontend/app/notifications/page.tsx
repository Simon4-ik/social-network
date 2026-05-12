"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  const load = async () => {
    setItems(await api<any[]>("/api/notifications"));
    setRequests(await api<any[]>("/api/follow-requests"));
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => { await api(`/api/notifications/${id}/read`, { method: "POST" }); load(); };
  const markAll = async () => { await api("/api/notifications/read-all", { method: "POST" }); load(); };
  const acceptFollow = async (id: string) => { await api(`/api/follow-requests/${id}/accept`, { method: "POST" }); load(); };
  const declineFollow = async (id: string) => { await api(`/api/follow-requests/${id}/decline`, { method: "POST" }); load(); };
  const acceptInv = async (id: string) => { await api(`/api/group-invitations/${id}/accept`, { method: "POST" }); load(); };
  const declineInv = async (id: string) => { await api(`/api/group-invitations/${id}/decline`, { method: "POST" }); load(); };
  const acceptJoin = async (id: string) => { await api(`/api/group-requests/${id}/accept`, { method: "POST" }); load(); };
  const declineJoin = async (id: string) => { await api(`/api/group-requests/${id}/decline`, { method: "POST" }); load(); };

  return (
    <>
      <div className="row">
        <h2>Notifications</h2>
        <div className="grow" />
        <button className="btn secondary" onClick={markAll}>Mark all read</button>
      </div>

      {requests.length > 0 && (
        <div className="card">
          <h3>Pending follow requests</h3>
          {requests.map((r) => (
            <div key={r.id} className="row" style={{ padding: "6px 0" }}>
              <span>{r.first_name} {r.last_name} wants to follow you</span>
              <div className="grow" />
              <button className="btn" onClick={() => acceptFollow(r.id)}>Accept</button>
              <button className="btn secondary" onClick={() => declineFollow(r.id)}>Decline</button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && <p className="muted">No notifications.</p>}
      {items.map((n) => {
        const p = n.payload || {};
        let body: any = n.type;
        let actions: any = null;
        if (n.type === "follow_request") body = `Follow request from ${p.from}`;
        if (n.type === "group_invite") {
          body = `Invite to group ${p.group_id}`;
          actions = (
            <>
              <button className="btn" onClick={() => acceptInv(p.invitation_id)}>Accept</button>
              <button className="btn secondary" onClick={() => declineInv(p.invitation_id)}>Decline</button>
            </>
          );
        }
        if (n.type === "group_join_request") {
          body = `Join request for your group ${p.group_id}`;
          actions = (
            <>
              <button className="btn" onClick={() => acceptJoin(p.request_id)}>Accept</button>
              <button className="btn secondary" onClick={() => declineJoin(p.request_id)}>Decline</button>
            </>
          );
        }
        if (n.type === "group_event") body = `New event in group ${p.group_id}`;
        if (n.type === "post_comment") body = `New comment on your post`;
        if (n.type === "follow_accepted") body = `${p.by} accepted your follow request`;
        return (
          <div key={n.id} className="card row" style={{ background: n.is_read ? "#fff" : "#fff5e6" }}>
            <div style={{ flex: 1 }}>
              <div>{body}</div>
              <div className="muted">{new Date(n.created_at).toLocaleString()}</div>
            </div>
            {actions}
            {!n.is_read && <button className="btn secondary" onClick={() => markRead(n.id)}>Mark read</button>}
          </div>
        );
      })}
    </>
  );
}
