"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { connectWS } from "@/lib/ws";

type Conv = { users: any[]; groups: any[] };

export default function ChatPage() {
  const { user } = useAuth();
  const [conv, setConv] = useState<Conv>({ users: [], groups: [] });
  const [target, setTarget] = useState<{ kind: "dm" | "group"; id: string; label: string } | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { api<Conv>("/api/conversations").then(setConv).catch(() => {}); }, []);

  useEffect(() => {
    if (!user) return;
    const ws = connectWS((ev) => {
      if (ev.type === "dm") {
        const m = ev.payload;
        if (target?.kind === "dm" && (m.from === target.id || m.to === target.id)) {
          setMessages((prev) => [...prev, m]);
        }
      } else if (ev.type === "group") {
        const m = ev.payload;
        if (target?.kind === "group" && m.group_id === target.id) {
          setMessages((prev) => [...prev, m]);
        }
      }
    });
    wsRef.current = ws;
    return () => ws.close();
  }, [user?.id, target?.id, target?.kind]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const openDM = async (u: any) => {
    setTarget({ kind: "dm", id: u.id, label: `${u.first_name} ${u.last_name}` });
    setMessages(await api(`/api/messages/dm/${u.id}`));
  };
  const openGroup = async (g: any) => {
    setTarget({ kind: "group", id: g.id, label: g.title });
    setMessages(await api(`/api/messages/group/${g.id}`));
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !text.trim() || !wsRef.current) return;
    const env = target.kind === "dm"
      ? { type: "dm", payload: JSON.stringify({ to: target.id, content: text }) }
      : { type: "group", payload: JSON.stringify({ group_id: target.id, content: text }) };
    wsRef.current.send(JSON.stringify(env));
    setText("");
  };

  const addEmoji = (e: string) => setText(text + e);

  return (
    <div className="chat-pane">
      <div className="chat-list">
        <div style={{ padding: 10, fontWeight: 600, borderBottom: "1px solid #e9ecef" }}>People</div>
        {conv.users.map((u) => (
          <div key={u.id} className={"item " + (target?.kind === "dm" && target.id === u.id ? "active" : "")} onClick={() => openDM(u)}>
            {u.first_name} {u.last_name}
          </div>
        ))}
        <div style={{ padding: 10, fontWeight: 600, borderTop: "1px solid #e9ecef", borderBottom: "1px solid #e9ecef" }}>Groups</div>
        {conv.groups.map((g) => (
          <div key={g.id} className={"item " + (target?.kind === "group" && target.id === g.id ? "active" : "")} onClick={() => openGroup(g)}>
            {g.title}
          </div>
        ))}
      </div>

      <div className="chat-thread">
        {!target && <div className="muted">Pick a conversation.</div>}
        {target && (
          <>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{target.label}</div>
            <div className="chat-msgs">
              {messages.map((m) => (
                <div key={m.id} className={"chat-msg " + (m.from === user?.id ? "mine" : "theirs")}>
                  {m.content}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form className="chat-input" onSubmit={send}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
              {["😀","😂","❤️","👍","🎉","🔥"].map((e) => (
                <button key={e} type="button" className="btn secondary" onClick={() => addEmoji(e)} style={{ padding: "6px 8px" }}>{e}</button>
              ))}
              <button className="btn" type="submit">Send</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
