"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, mediaURL } from "@/lib/api";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => { api<any[]>("/api/users").then(setUsers).catch(() => {}); }, []);
  return (
    <>
      <h2>People</h2>
      {users.map((u) => (
        <Link key={u.id} href={`/users/${u.id}`} className="card row" style={{ display: "flex" }}>
          {u.avatar_path ? <img className="avatar" src={mediaURL(u.avatar_path)} /> : <div className="avatar" />}
          <div>
            <b>{u.first_name} {u.last_name}</b>
            {u.nickname && <span className="muted"> · @{u.nickname}</span>}
          </div>
        </Link>
      ))}
    </>
  );
}
