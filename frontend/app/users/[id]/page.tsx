"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, mediaURL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);

  const load = async () => {
    const p = await api(`/api/users/${id}`);
    setProfile(p);
    if (p.can_view) {
      api<any[]>(`/api/users/${id}/posts`).then(setPosts).catch(() => {});
      api<any[]>(`/api/users/${id}/followers`).then(setFollowers).catch(() => {});
      api<any[]>(`/api/users/${id}/following`).then(setFollowing).catch(() => {});
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  if (!profile) return <p>Loading…</p>;

  const follow = async () => { await api(`/api/users/${id}/follow`, { method: "POST" }); load(); };
  const unfollow = async () => {
    const name = `${profile.first_name} ${profile.last_name}`;
    if (!confirm(`Unfollow ${name}?`)) return;
    await api(`/api/users/${id}/follow`, { method: "DELETE" });
    load();
  };
  const togglePrivacy = async () => {
    const next = !profile.is_public;
    const msg = next
      ? "Make your profile PUBLIC? Anyone will see your info and posts."
      : "Make your profile PRIVATE? Only followers will see your info.";
    if (!confirm(msg)) return;
    await api(`/api/users/me/privacy`, { method: "PUT", body: JSON.stringify({ is_public: next }) });
    refresh(); load();
  };

  return (
    <>
      <div className="card row">
        {profile.avatar_path ? <img className="avatar" src={mediaURL(profile.avatar_path)} /> : <div className="avatar" />}
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>{profile.first_name} {profile.last_name}</h2>
          {profile.nickname && <div className="muted">@{profile.nickname}</div>}
          {profile.can_view && profile.email && <div className="muted">{profile.email}</div>}
        </div>
        {profile.is_self ? (
          <button className="btn secondary" onClick={togglePrivacy}>
            Profile: {profile.is_public ? "Public" : "Private"} (click to toggle)
          </button>
        ) : (
          <>
            <button className="btn" onClick={follow}>Follow</button>
            <button className="btn secondary" onClick={unfollow}>Unfollow</button>
          </>
        )}
      </div>

      {!profile.can_view && <p className="muted">This profile is private. Follow to see more.</p>}

      {profile.can_view && profile.about_me && (
        <div className="card">
          <h3>About</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{profile.about_me}</p>
        </div>
      )}

      {profile.can_view && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="card" style={{ flex: 1, marginBottom: 0 }}>
              <b>Followers ({followers.length})</b>
              <div className="muted">{followers.map((f) => f.first_name + " " + f.last_name).join(", ") || "—"}</div>
            </div>
            <div className="card" style={{ flex: 1, marginBottom: 0 }}>
              <b>Following ({following.length})</b>
              <div className="muted">{following.map((f) => f.first_name + " " + f.last_name).join(", ") || "—"}</div>
            </div>
          </div>

          <h3>Posts</h3>
          {posts.length === 0 && <p className="muted">No posts.</p>}
          {posts.map((p) => (
            <div key={p.id} className="card">
              <div className="muted">{new Date(p.created_at).toLocaleString()} · {p.privacy}</div>
              <p style={{ whiteSpace: "pre-wrap" }}>{p.content}</p>
              {p.image_path && <img src={mediaURL(p.image_path)} style={{ maxWidth: "100%", borderRadius: 6 }} />}
            </div>
          ))}
        </>
      )}
    </>
  );
}
