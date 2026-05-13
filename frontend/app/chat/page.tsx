"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { connectWS } from "@/lib/ws";

type Conv = {
  users: (MiniUser & { unread: number })[];
  groups: { id: string; title: string; unread: number }[];
};
type MiniUser = { id: string; first_name: string; last_name: string; nickname?: string; avatar_path?: string };
type Target = { kind: "dm" | "group"; id: string; label: string };
type Msg = {
  id: string;
  from: string;
  to?: string;
  group_id?: string;
  content: string;
  created_at: string;
};

const PAGE_SIZE = 30;

function initials(name: string) {
  return name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export default function ChatPage() {
  const { user } = useAuth();
  const [conv, setConv] = useState<Conv>({ users: [], groups: [] });
  const [target, setTarget] = useState<Target | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const targetRef = useRef<Target | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const stickyBottomRef = useRef(true);

  // Keep targetRef in sync so the WS handler always reads the latest target
  useEffect(() => { targetRef.current = target; }, [target]);

  useEffect(() => {
    api<Conv>("/api/conversations").then(setConv).catch(() => {});
  }, []);

  // Open ONE WebSocket for the lifetime of the chat page.
  useEffect(() => {
    if (!user) return;
    const ws = connectWS((ev) => {
      const t = targetRef.current;
      const m = ev.payload as Msg;
      if (ev.type === "dm") {
        const isActive = t?.kind === "dm" && (m.from === t.id || m.to === t.id);
        if (isActive) {
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        } else if (user && m.from !== user.id) {
          // bump unread for the sender
          setConv((c) => ({
            ...c,
            users: c.users.map((u) => u.id === m.from ? { ...u, unread: (u.unread || 0) + 1 } : u),
          }));
        }
      } else if (ev.type === "group") {
        const isActive = t?.kind === "group" && m.group_id === t.id;
        if (isActive) {
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        } else if (user && m.from !== user.id && m.group_id) {
          setConv((c) => ({
            ...c,
            groups: c.groups.map((g) => g.id === m.group_id ? { ...g, unread: (g.unread || 0) + 1 } : g),
          }));
        }
      }
    });
    wsRef.current = ws;
    return () => { ws.close(); wsRef.current = null; };
  }, [user?.id]);

  // Auto-scroll to bottom on new message — but only when the user is already at the bottom.
  useEffect(() => {
    if (loadingOlder) return;
    if (stickyBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loadingOlder]);

  const loadInitial = async (t: Target) => {
    setLoadingOlder(false);
    stickyBottomRef.current = true;
    const url = t.kind === "dm"
      ? `/api/messages/dm/${t.id}?limit=${PAGE_SIZE}`
      : `/api/messages/group/${t.id}?limit=${PAGE_SIZE}`;
    const list = await api<Msg[]>(url);
    setMessages(list);
    setHasMore(list.length === PAGE_SIZE);
    // jump to bottom (no animation on initial load)
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  };

  const clearDMUnread = async (id: string) => {
    setConv((c) => ({ ...c, users: c.users.map((u) => u.id === id ? { ...u, unread: 0 } : u) }));
    try { await api(`/api/messages/dm/${id}/read`, { method: "POST" }); } catch {}
  };
  const clearGroupUnread = async (id: string) => {
    setConv((c) => ({ ...c, groups: c.groups.map((g) => g.id === id ? { ...g, unread: 0 } : g) }));
    try { await api(`/api/messages/group/${id}/read`, { method: "POST" }); } catch {}
  };

  const openDM = async (u: any) => {
    const t: Target = { kind: "dm", id: u.id, label: `${u.first_name} ${u.last_name}` };
    setTarget(t);
    await loadInitial(t);
    clearDMUnread(u.id);
  };

  const openGroup = async (g: any) => {
    const t: Target = { kind: "group", id: g.id, label: g.title };
    setTarget(t);
    await loadInitial(t);
    clearGroupUnread(g.id);
  };

  const loadOlder = useCallback(async () => {
    const t = targetRef.current;
    if (!t || !hasMore || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const before = messages[0].created_at;
    const url = t.kind === "dm"
      ? `/api/messages/dm/${t.id}?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`
      : `/api/messages/group/${t.id}?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`;
    try {
      const older = await api<Msg[]>(url);
      const sc = scrollRef.current;
      const prevH = sc?.scrollHeight ?? 0;
      const prevTop = sc?.scrollTop ?? 0;
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === PAGE_SIZE);
      requestAnimationFrame(() => {
        if (sc) sc.scrollTop = prevTop + (sc.scrollHeight - prevH);
        setLoadingOlder(false);
      });
    } catch {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages]);

  const onScroll = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    const distFromBottom = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
    stickyBottomRef.current = distFromBottom < 80;
    if (sc.scrollTop < 60 && hasMore && !loadingOlder) {
      loadOlder();
    }
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const t = targetRef.current;
    const trimmed = text.trim();
    if (!t || !trimmed) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Send payload as a plain object — backend Envelope.Payload is json.RawMessage,
    // so it needs the inner JSON to be an object, not a JSON-encoded string.
    const env =
      t.kind === "dm"
        ? { type: "dm", payload: { to: t.id, content: trimmed } }
        : { type: "group", payload: { group_id: t.id, content: trimmed } };
    ws.send(JSON.stringify(env));
    setText("");
    setShowEmoji(false);
    stickyBottomRef.current = true;
  };

  const addEmoji = (e: string) => setText((s) => s + e);

  // Group consecutive messages by day for date separators
  const rendered: React.ReactNode[] = [];
  let lastDay = "";
  for (const m of messages) {
    const day = fmtDay(m.created_at);
    if (day !== lastDay) {
      rendered.push(
        <div key={"day-" + m.id} className="chat-day">{day}</div>
      );
      lastDay = day;
    }
    rendered.push(
      <div key={m.id} className={"chat-msg " + (m.from === user?.id ? "mine" : "theirs")}>
        <div>{m.content}</div>
        <div className="chat-time">{fmtTime(m.created_at)}</div>
      </div>
    );
  }

  return (
    <div className="chat-pane">
      <div className="chat-list">
        <div className="section">People</div>
        {conv.users.length === 0 && <div className="muted" style={{ padding: "8px 14px" }}>No conversations yet.</div>}
        {conv.users.map((u) => {
          const active = target?.kind === "dm" && target.id === u.id;
          const unread = u.unread || 0;
          return (
            <div key={u.id} className={"item " + (active ? "active" : "")} onClick={() => openDM(u)}>
              <span
                className="avatar sm"
                style={{
                  background: "var(--gradient-brand)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  border: 0,
                }}
              >
                {initials(`${u.first_name} ${u.last_name}`)}
              </span>
              <span style={{ flex: 1, fontWeight: unread > 0 ? 600 : 400 }}>{u.first_name} {u.last_name}</span>
              {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
            </div>
          );
        })}
        <div className="section">Groups</div>
        {conv.groups.length === 0 && <div className="muted" style={{ padding: "8px 14px" }}>No groups yet.</div>}
        {conv.groups.map((g) => {
          const active = target?.kind === "group" && target.id === g.id;
          const unread = g.unread || 0;
          return (
            <div key={g.id} className={"item " + (active ? "active" : "")} onClick={() => openGroup(g)}>
              <span
                className="avatar sm"
                style={{
                  background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  border: 0,
                }}
              >
                {initials(g.title)}
              </span>
              <span style={{ flex: 1, fontWeight: unread > 0 ? 600 : 400 }}>{g.title}</span>
              {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
            </div>
          );
        })}
      </div>

      <div className="chat-thread">
        {!target && (
          <div className="empty" style={{ margin: 16, flex: 1, display: "grid", placeItems: "center", border: 0, background: "transparent" }}>
            <div>
              <div style={{ fontSize: 44 }}>💬</div>
              <h3>Pick a conversation</h3>
              <p className="muted">Select someone from the left to start chatting.</p>
            </div>
          </div>
        )}
        {target && (
          <>
            <div className="chat-header">
              <span
                className="avatar sm"
                style={{
                  background: target.kind === "dm" ? "var(--gradient-brand)" : "linear-gradient(135deg, #f59e0b, #ef4444)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  border: 0,
                }}
              >
                {initials(target.label)}
              </span>
              <span>{target.label}</span>
              <span className="chip" style={{ marginLeft: "auto" }}>
                {target.kind === "dm" ? "Direct" : "Group"}
              </span>
            </div>
            <div className="chat-msgs" ref={scrollRef} onScroll={onScroll}>
              {loadingOlder && (
                <div style={{ textAlign: "center", padding: 8 }}>
                  <span className="spinner" style={{ borderColor: "rgba(99,102,241,0.25)", borderTopColor: "var(--brand-500)" }} />
                </div>
              )}
              {!hasMore && messages.length > 0 && (
                <div className="chat-day" style={{ marginBottom: 4 }}>Beginning of conversation</div>
              )}
              {messages.length === 0 && <div className="muted" style={{ textAlign: "center", padding: 20 }}>Say hi 👋</div>}
              {rendered}
              <div ref={endRef} />
            </div>
            <form className="chat-input" onSubmit={send}>
              <button
                type="button"
                className="btn ghost icon"
                aria-label="Emoji"
                onClick={() => setShowEmoji((v) => !v)}
              >
                😀
              </button>
              {showEmoji && (
                <div className="emoji-bar">
                  {["😀","😂","❤️","👍","🎉","🔥","😮","😢","🙏"].map((e) => (
                    <button key={e} type="button" onClick={() => addEmoji(e)}>{e}</button>
                  ))}
                </div>
              )}
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message…"
                autoFocus
              />
              <button className="btn icon" type="submit" disabled={!text.trim()} aria-label="Send">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13" />
                  <path d="M22 2l-7 20-4-9-9-4 20-7Z" />
                </svg>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
