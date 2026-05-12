"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const load = async () => setGroups(await api("/api/groups"));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/groups", { method: "POST", body: JSON.stringify({ title, description: desc }) });
    setTitle(""); setDesc(""); load();
  };

  const request = async (id: string) => {
    await api(`/api/groups/${id}/request`, { method: "POST" });
    alert("Join request sent");
    load();
  };

  return (
    <>
      <h2>Groups</h2>
      <div className="card">
        <form onSubmit={create}>
          <label>Create a new group</label>
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
          <button className="btn" type="submit" style={{ marginTop: 8 }}>Create</button>
        </form>
      </div>

      {groups.map((g) => (
        <div key={g.id} className="card row">
          <div style={{ flex: 1 }}>
            <Link href={`/groups/${g.id}`}><b>{g.title}</b></Link>
            <div className="muted">{g.description}</div>
            <div className="muted">{g.members} members</div>
          </div>
          {!g.is_member && <button className="btn secondary" onClick={() => request(g.id)}>Request to join</button>}
        </div>
      ))}
    </>
  );
}
