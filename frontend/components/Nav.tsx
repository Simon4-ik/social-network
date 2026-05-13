"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, mediaURL } from "@/lib/api";
import { connectWS } from "@/lib/ws";

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "feed":
      return (
        <svg {...common}>
          <path d="M3 12 12 4l9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15 20c0-2.6 1.5-4.5 4-4.5 1.6 0 3 .8 3 2.5" />
        </svg>
      );
    case "groups":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3" />
          <circle cx="5" cy="13" r="2.5" />
          <circle cx="19" cy="13" r="2.5" />
          <path d="M6 21c0-3 2.7-5 6-5s6 2 6 5" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-11.7 7.1L4 21l1.9-5.3A8 8 0 1 1 21 12Z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  if (!user) {
    return (
      <div className="nav">
        <Link href="/" className="nav-brand">
          <span className="nav-brand-mark">S</span>
          SocialNet
        </Link>
        <div className="grow" />
        <Link href="/login" className="nav-link">Login</Link>
        <Link href="/register" className="btn sm">Get started</Link>
      </div>
    );
  }

  return (
    <div className="nav">
      <Link href="/" className="nav-brand">
        <span className="nav-brand-mark">S</span>
        SocialNet
      </Link>
      <Link href="/" className={"nav-link " + (isActive("/") ? "active" : "")}>
        <Icon name="feed" /> Feed
      </Link>
      <Link href="/users" className={"nav-link " + (isActive("/users") ? "active" : "")}>
        <Icon name="people" /> People
      </Link>
      <Link href="/groups" className={"nav-link " + (isActive("/groups") ? "active" : "")}>
        <Icon name="groups" /> Groups
      </Link>
      <Link href="/chat" className={"nav-link " + (isActive("/chat") ? "active" : "")}>
        <Icon name="chat" /> Chat
      </Link>
      <Link href="/notifications" className={"nav-link " + (isActive("/notifications") ? "active" : "")}>
        <Icon name="bell" /> Notifications
        {notifCount > 0 && <span className="badge" key={notifCount}>{notifCount}</span>}
      </Link>
      <div className="grow" />
      <Link href={`/users/${user.id}`} className="nav-user">
        {user.avatar_path ? (
          <img className="avatar sm" src={mediaURL(user.avatar_path)} alt="" />
        ) : (
          <span className="avatar sm" aria-hidden />
        )}
        {user.first_name}
      </Link>
      <button
        className="btn ghost icon"
        aria-label="Log out"
        title="Log out"
        onClick={async () => { await logout(); router.push("/login"); }}
      >
        <Icon name="logout" />
      </button>
    </div>
  );
}
