"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

function initials(s: string) {
  return s.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString();
}

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [joinReqs, setJoinReqs] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [showEvent, setShowEvent] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evTime, setEvTime] = useState("");

  const load = async () => {
    const g = await api<any>(`/api/groups/${id}`);
    setGroup(g);
    if (g.is_member) {
      setPosts(await api(`/api/groups/${id}/posts`));
      setEvents(await api(`/api/groups/${id}/events`));
      setMembers(await api(`/api/groups/${id}/members`));
      setUsers(await api(`/api/users`));
      if (g.is_creator) setJoinReqs(await api(`/api/groups/${id}/join-requests`));
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  if (!group) return <p className="muted">Loading…</p>;

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/posts", { method: "POST", body: JSON.stringify({ content, privacy: "group", group_id: id }) });
    setContent(""); load();
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const isoTime = new Date(evTime).toISOString();
    await api(`/api/groups/${id}/events`, { method: "POST", body: JSON.stringify({ title: evTitle, description: evDesc, event_time: isoTime }) });
    setEvTitle(""); setEvDesc(""); setEvTime(""); setShowEvent(false); load();
  };

  const respond = async (eid: string, response: string) => {
    await api(`/api/events/${eid}/respond`, { method: "POST", body: JSON.stringify({ response }) });
    load();
  };

  const invite = async (userId: string) => {
    await api(`/api/groups/${id}/invite`, { method: "POST", body: JSON.stringify({ user_ids: [userId] }) });
  };

  const acceptReq = async (reqId: string) => { await api(`/api/group-requests/${reqId}/accept`, { method: "POST" }); load(); };
  const declineReq = async (reqId: string) => { await api(`/api/group-requests/${reqId}/decline`, { method: "POST" }); load(); };

  const nonMembers = users.filter((u: any) => !members.find((m: any) => m.id === u.id));

  return (
    <>
      <div className="card card-hero">
        <div className="row" style={{ alignItems: "center", gap: 18 }}>
          <span
            className="avatar lg"
            style={{
              background: "rgba(255,255,255,0.2)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 24,
              border: "3px solid rgba(255,255,255,0.4)",
            }}
          >
            {initials(group.title)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 26 }}>{group.title}</h2>
            <p style={{ margin: "4px 0 0", opacity: 0.92 }}>{group.description}</p>
            {group.is_creator && (
              <span className="chip" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", marginTop: 8 }}>
                ✦ Owner
              </span>
            )}
          </div>
        </div>
      </div>

      {!group.is_member && (
        <div className="empty">
          <h3>Members only</h3>
          <p className="muted">Join this group to see posts and events.</p>
        </div>
      )}

      {group.is_member && (
        <>
          {group.is_creator && joinReqs.length > 0 && (
            <div className="card">
              <h3>Pending join requests</h3>
              {joinReqs.map((r: any) => (
                <div key={r.request_id} className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                  <span className="avatar sm" aria-hidden />
                  <span style={{ flex: 1 }}>{r.first_name} {r.last_name}</span>
                  <button className="btn sm" onClick={() => acceptReq(r.request_id)}>Accept</button>
                  <button className="btn secondary sm" onClick={() => declineReq(r.request_id)}>Decline</button>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h3>Invite members</h3>
            {nonMembers.length === 0 ? (
              <p className="muted">Everyone is already a member.</p>
            ) : (
              <div className="row wrap">
                {nonMembers.map((u: any) => (
                  <button key={u.id} className="chip" onClick={() => invite(u.id)} style={{ cursor: "pointer" }}>
                    + {u.first_name} {u.last_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <form onSubmit={post}>
              <textarea
                placeholder="Share something with the group…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={2}
                required
              />
              <div className="row" style={{ marginTop: 10 }}>
                <div className="grow" />
                <button className="btn" type="submit" disabled={!content.trim()}>Post</button>
              </div>
            </form>
          </div>

          {posts.map((p: any) => (
            <div key={p.id} className="card">
              <div className="row" style={{ marginBottom: 6 }}>
                <span className="avatar sm" aria-hidden />
                <div style={{ flex: 1 }}>
                  <b>{p.author_name}</b>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{timeAgo(p.created_at)}</span>
                </div>
              </div>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{p.content}</p>
            </div>
          ))}

          <div className="card">
            <div className="row">
              <h3 style={{ margin: 0 }}>Events</h3>
              <div className="grow" />
              <button className="btn secondary sm" onClick={() => setShowEvent((v) => !v)}>
                {showEvent ? "Cancel" : "+ New event"}
              </button>
            </div>

            {showEvent && (
              <form onSubmit={createEvent} style={{ marginTop: 12 }}>
                <label>Title</label>
                <input placeholder="Picnic in the park" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} required />
                <label>Description</label>
                <textarea value={evDesc} onChange={(e) => setEvDesc(e.target.value)} rows={2} />
                <label>When</label>
                <input type="datetime-local" value={evTime} onChange={(e) => setEvTime(e.target.value)} required />
                <button className="btn" type="submit" style={{ marginTop: 12 }}>Create event</button>
              </form>
            )}
          </div>

          {events.length === 0 && !showEvent && (
            <div className="empty">No upcoming events. Create one above.</div>
          )}
          {events.map((ev: any) => (
            <div key={ev.id} className="card">
              <div className="row">
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 16 }}>{ev.title}</b>
                  <div className="muted">📅 {new Date(ev.event_time).toLocaleString()}</div>
                </div>
              </div>
              {ev.description && <p style={{ marginTop: 8 }}>{ev.description}</p>}
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <button
                  className={"btn " + (ev.my_response === "going" ? "" : "secondary")}
                  onClick={() => respond(ev.id, "going")}
                >
                  ✓ Going · {ev.going}
                </button>
                <button
                  className={"btn " + (ev.my_response === "not_going" ? "" : "secondary")}
                  onClick={() => respond(ev.id, "not_going")}
                >
                  ✕ Not going · {ev.not_going}
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
