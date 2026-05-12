"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, mediaURL } from "@/lib/api";

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [joinReqs, setJoinReqs] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [evTitle, setEvTitle] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evTime, setEvTime] = useState("");

  const load = async () => {
    const g = await api(`/api/groups/${id}`);
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

  if (!group) return <p>Loading…</p>;

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/posts", { method: "POST", body: JSON.stringify({ content, privacy: "group", group_id: id }) });
    setContent(""); load();
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const isoTime = new Date(evTime).toISOString();
    await api(`/api/groups/${id}/events`, { method: "POST", body: JSON.stringify({ title: evTitle, description: evDesc, event_time: isoTime }) });
    setEvTitle(""); setEvDesc(""); setEvTime(""); load();
  };

  const respond = async (eid: string, response: string) => {
    await api(`/api/events/${eid}/respond`, { method: "POST", body: JSON.stringify({ response }) });
    load();
  };

  const invite = async (userId: string) => {
    await api(`/api/groups/${id}/invite`, { method: "POST", body: JSON.stringify({ user_ids: [userId] }) });
    alert("Invite sent");
  };

  const acceptReq = async (reqId: string) => { await api(`/api/group-requests/${reqId}/accept`, { method: "POST" }); load(); };
  const declineReq = async (reqId: string) => { await api(`/api/group-requests/${reqId}/decline`, { method: "POST" }); load(); };

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{group.title}</h2>
        <p>{group.description}</p>
      </div>

      {!group.is_member && <p className="muted">Join this group to see posts and events.</p>}

      {group.is_member && (
        <>
          <div className="card">
            <h3>Invite members</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {users.filter((u: any) => !members.find((m: any) => m.id === u.id)).map((u: any) => (
                <button key={u.id} className="btn secondary" onClick={() => invite(u.id)}>
                  Invite {u.first_name} {u.last_name}
                </button>
              ))}
              {users.filter((u: any) => !members.find((m: any) => m.id === u.id)).length === 0 && <span className="muted">Everyone is already a member.</span>}
            </div>
          </div>

          {group.is_creator && joinReqs.length > 0 && (
            <div className="card">
              <h3>Pending join requests</h3>
              {joinReqs.map((r: any) => (
                <div key={r.request_id} className="row" style={{ padding: "6px 0" }}>
                  <span>{r.first_name} {r.last_name}</span>
                  <div className="grow" />
                  <button className="btn" onClick={() => acceptReq(r.request_id)}>Accept</button>
                  <button className="btn secondary" onClick={() => declineReq(r.request_id)}>Decline</button>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <form onSubmit={post}>
              <textarea placeholder="Share with the group…" value={content} onChange={(e) => setContent(e.target.value)} rows={2} required />
              <button className="btn" type="submit" style={{ marginTop: 8 }}>Post</button>
            </form>
          </div>

          {posts.map((p: any) => (
            <div key={p.id} className="card">
              <b>{p.author_name}</b> <span className="muted">· {new Date(p.created_at).toLocaleString()}</span>
              <p style={{ whiteSpace: "pre-wrap" }}>{p.content}</p>
            </div>
          ))}

          <div className="card">
            <h3>Create event</h3>
            <form onSubmit={createEvent}>
              <input placeholder="Title" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} required />
              <textarea placeholder="Description" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} rows={2} />
              <input type="datetime-local" value={evTime} onChange={(e) => setEvTime(e.target.value)} required />
              <button className="btn" type="submit" style={{ marginTop: 8 }}>Create event</button>
            </form>
          </div>

          {events.map((ev: any) => (
            <div key={ev.id} className="card">
              <b>{ev.title}</b> · <span className="muted">{new Date(ev.event_time).toLocaleString()}</span>
              <p>{ev.description}</p>
              <div className="row">
                <button className={"btn " + (ev.my_response === "going" ? "" : "secondary")} onClick={() => respond(ev.id, "going")}>
                  Going ({ev.going})
                </button>
                <button className={"btn " + (ev.my_response === "not_going" ? "" : "secondary")} onClick={() => respond(ev.id, "not_going")}>
                  Not going ({ev.not_going})
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
