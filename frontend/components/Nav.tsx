"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { connectWS } from "@/lib/ws";

export default function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [notifCount, setNotifCount] = useState(0);

  const refreshNotifs = async () => {
    try {
      const list = await api<any[]>("/api/notifications");
      setNotifCount(list.filter((n) => !n.is_read).length);
    } catch {}
  };

  useEffect(() => {
    if (!user) { setNotifCount(0); return; }
    refreshNotifs();
    const ws = connectWS((ev) => {
      if (ev.type === "notification") setNotifCount((c) => c + 1);
    });
    return () => ws.close();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="nav">
        <Link href="/" style={{ fontWeight: 700 }}>SocialNet</Link>
        <div className="grow" />
        <Link href="/login">Login</Link>
        <Link href="/register">Register</Link>
      </div>
    );
  }

  return (
    <div className="nav">
      <Link href="/" style={{ fontWeight: 700 }}>SocialNet</Link>
      <Link href="/">Feed</Link>
      <Link href="/users">People</Link>
      <Link href="/groups">Groups</Link>
      <Link href="/chat">Chat</Link>
      <Link href="/notifications">
        Notifications {notifCount > 0 && <span className="badge">{notifCount}</span>}
      </Link>
      <div className="grow" />
      <Link href={`/users/${user.id}`}>{user.first_name}</Link>
      <button className="btn secondary" onClick={async () => { await logout(); router.push("/login"); }}>Logout</button>
    </div>
  );
}
