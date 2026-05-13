"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, mediaURL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString();
}

const privacyLabel: Record<string, { label: string; cls: string }> = {
  public:         { label: "Public",             cls: "chip brand" },
  almost_private: { label: "Followers only",     cls: "chip success" },
  private:        { label: "Selected followers", cls: "chip rose" },
  group:          { label: "Group",              cls: "chip warn" },
};

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { refresh } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);

  const load = async () => {
    const p = await api<any>(`/api/users/${id}`);
    setProfile(p);
    if (p.can_view) {
      api<any[]>(`/api/users/${id}/posts`).then(setPosts).catch(() => {});
      api<any[]>(`/api/users/${id}/followers`).then(setFollowers).catch(() => {});
      api<any[]>(`/api/users/${id}/following`).then(setFollowing).catch(() => {});
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  if (!profile) return <p className="muted">Loading…</p>;

  const nick = profile.nickname?.replace(/^@+/, "");

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
      {/* Profile header */}
      <div className="card">
        <div className="row profile-hero" style={{ alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {profile.avatar_path ? (
            <img
              className="avatar lg ring"
              src={mediaURL(profile.avatar_path)}
              alt=""
              style={{ width: 88, height: 88, borderWidth: 3 }}
            />
          ) : (
            <span
              className="avatar lg ring"
              aria-hidden
              style={{ width: 88, height: 88, borderWidth: 3 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>
              {profile.first_name} {profile.last_name}
            </h2>
            {nick && <div className="muted">@{nick}</div>}
            {profile.can_view && profile.email && (
              <div className="muted" style={{ marginTop: 4 }}>✉ {profile.email}</div>
            )}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {profile.is_self ? (
              <button
                className="btn secondary"
                onClick={togglePrivacy}
                title="Click to toggle profile visibility"
              >
                {profile.is_public ? "🌐 Public profile" : "🔒 Private profile"}
              </button>
            ) : (
              <>
                <button className="btn" onClick={follow}>Follow</button>
                <button className="btn secondary" onClick={unfollow}>Unfollow</button>
              </>
            )}
          </div>
        </div>
      </div>

      {!profile.can_view && (
        <div className="empty">
          <div style={{ fontSize: 36 }}>🔒</div>
          <h3 style={{ marginBottom: 4 }}>This profile is private</h3>
          <p className="muted">Follow to see their posts and activity.</p>
        </div>
      )}

      {profile.can_view && profile.about_me && (
        <div className="card">
          <h3>About</h3>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{profile.about_me}</p>
        </div>
      )}

      {profile.can_view && (
        <>
          <div className="row" style={{ gap: 12, marginBottom: 14 }}>
            <div className="stat">
              <div className="value">{followers.length}</div>
              <div className="label">Followers</div>
            </div>
            <div className="stat">
              <div className="value">{following.length}</div>
              <div className="label">Following</div>
            </div>
            <div className="stat">
              <div className="value">{posts.length}</div>
              <div className="label">Posts</div>
            </div>
          </div>

          {(followers.length > 0 || following.length > 0) && (
            <div className="card">
              {followers.length > 0 && (
                <>
                  <h3>Followers</h3>
                  <div className="row wrap" style={{ marginBottom: 8 }}>
                    {followers.map((f) => (
                      <span key={f.id} className="chip">{f.first_name} {f.last_name}</span>
                    ))}
                  </div>
                </>
              )}
              {following.length > 0 && (
                <>
                  <h3 style={{ marginTop: followers.length > 0 ? 12 : 0 }}>Following</h3>
                  <div className="row wrap">
                    {following.map((f) => (
                      <span key={f.id} className="chip">{f.first_name} {f.last_name}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <h3 style={{ marginTop: 6 }}>Posts</h3>
          {posts.length === 0 && (
            <div className="empty">No posts to show.</div>
          )}
          {posts.map((p) => {
            const tag = privacyLabel[p.privacy] || { label: p.privacy, cls: "chip" };
            return (
              <div key={p.id} className="card">
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{timeAgo(p.created_at)}</span>
                  <div className="grow" />
                  <span className={tag.cls}>{tag.label}</span>
                </div>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{p.content}</p>
                {p.image_path && (
                  <img src={mediaURL(p.image_path)} alt="" style={{ width: "100%", maxHeight: 520, objectFit: "cover", borderRadius: 12, marginTop: 10 }} />
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
