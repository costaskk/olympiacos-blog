import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, isConfigured } from './lib/supabase.js';
import { decryptMessage, encryptMessage, makeRoomSecret } from './lib/crypto.js';
import { getYoutubeId, isSafeUrl } from './lib/youtube.js';
import './styles.css';

const BUCKET = 'post-images';
const SITE_ASSETS_BUCKET = 'site-assets';
const APP_NAME = 'Thrylos Agora';
const BRAND_LOGO_CANDIDATES = ['/brand/olympiacos-logo.png', '/brand/community-crest.svg'];
const BRAND_HERO = '/brand/red-white-hero.svg';
const OFFICIAL_HERO = '/brand/olympiacos-hero.jpg';
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const DEFAULT_SITE_SETTINGS = {
  site_title: 'Thrylos Agora',
  tagline: 'Anonymous. Invite-only. Red-white agora.',
  header_tagline: 'Independent red-white community',
  gate_heading: 'A clean private red-white blog built for matchday talk.',
  gate_intro: 'Post matchday reactions, transfer thoughts, images, YouTube links, and news. Join the live group room with messages and voice, using only a one-use invite.',
  feed_eyebrow: 'ΘΡΥΛΟΣ AGORA · MEMBERS BOARD',
  feed_heading: 'The red-white feed for news, reactions and member posts.',
  feed_intro: 'A polished members-only board for match reactions, transfer rumours, news links, images, clips and live community talk.',
  community_title: 'Red-white community hub',
  community_text: 'Post carefully, keep the board clean, and use the floating room for live matchday conversation.',
  footer_text: 'Private red-white members area · built for clean matchday discussion.',
  logo_url: '',
  hero_url: '',
};

const CHAT_COLORS = ['#e31b2f', '#ffffff', '#ffb703', '#2dd4bf', '#60a5fa', '#c084fc', '#fb7185', '#34d399'];

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('el-GR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function displayUser(profile) {
  if (!profile) return 'anonymous';
  return profile.display_name || profile.handle || 'anonymous';
}

function userColor(profile) {
  const color = profile?.chat_color || '';
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#e31b2f';
}

function publicAssetUrl(bucket, path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function applyDocumentBranding(settings = DEFAULT_SITE_SETTINGS) {
  const title = settings.site_title || APP_NAME;
  document.title = title;

  const faviconUrl = settings.logo_url || '/favicon.svg';
  let favicon = document.querySelector('link[rel=\"icon\"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.href = faviconUrl;
}

async function loadSiteSettings() {
  if (!isConfigured()) return DEFAULT_SITE_SETTINGS;
  const { data, error } = await supabase.from('site_settings').select('key,value');
  if (error || !data) return DEFAULT_SITE_SETTINGS;
  const settings = { ...DEFAULT_SITE_SETTINGS };
  data.forEach((row) => {
    if (row?.key && Object.prototype.hasOwnProperty.call(settings, row.key)) {
      settings[row.key] = row.value || '';
    }
  });
  return settings;
}

function roleBadge(role) {
  if (role === 'admin') return 'Founder';
  if (role === 'moderator') return 'Mod';
  return 'Member';
}

function isStaff(role) {
  return role === 'admin' || role === 'moderator';
}

function BrandMark({ large = false, settings = DEFAULT_SITE_SETTINGS }) {
  const [assetIndex, setAssetIndex] = useState(0);
  const candidates = [settings?.logo_url, ...BRAND_LOGO_CANDIDATES].filter(Boolean);
  const src = candidates[assetIndex] || BRAND_LOGO_CANDIDATES[0];
  return (
    <span className={`crest crest-image ${large ? 'large' : ''}`}>
      <img
        src={src}
        alt={`${settings?.site_title || APP_NAME} logo`}
        onError={() => {
          if (assetIndex < candidates.length - 1) setAssetIndex(assetIndex + 1);
        }}
      />
    </span>
  );
}

function SetupNotice({ settings = DEFAULT_SITE_SETTINGS }) {
  return (
    <main className="setup-shell">
      <div className="setup-card glass-card">
        <div className="brand-lockup big">
          <BrandMark large settings={settings} />
          <div>
            <strong>{settings.site_title || APP_NAME}</strong>
            <small>{settings.tagline}</small>
          </div>
        </div>
        <h1>Connect Supabase first</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Supabase URL and anon key.
          Then run <code>npm install</code> and <code>npm run dev</code>.
        </p>
      </div>
    </main>
  );
}

function InviteGate({ onProfileReady, settings = DEFAULT_SITE_SETTINGS }) {
  const [invite, setInvite] = useState(new URLSearchParams(window.location.search).get('invite') || '');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function register(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const { data: sessionData, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;
      if (!sessionData?.user) throw new Error('Anonymous sign-in failed. Check that anonymous sign-ins are enabled in Supabase Auth.');

      const { data, error: rpcError } = await supabase.rpc('accept_invite', {
        raw_token: invite.trim(),
        chosen_handle: handle.trim(),
        chosen_display_name: displayName.trim() || handle.trim(),
      });
      if (rpcError) throw rpcError;
      onProfileReady(data);
    } catch (err) {
      await supabase.auth.signOut();
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate-shell">
      <section className="gate-hero" style={{ '--hero-image': `url(${settings.hero_url || BRAND_HERO})`, '--official-hero-image': `url(${settings.hero_url || OFFICIAL_HERO})` }}>
        <div className="brand-lockup big">
          <BrandMark large settings={settings} />
          <div>
            <strong>{settings.site_title || APP_NAME}</strong>
            <small>{settings.tagline}</small>
          </div>
        </div>
        <h1>{settings.gate_heading}</h1>
        <p>{settings.gate_intro}</p>
        <div className="hero-grid">
          <span>One-use invite links</span>
          <span>Clean moderated feed</span>
          <span>Live popup chat</span>
          <span>Voice room tab</span>
        </div>
      </section>

      <form className="gate-card glass-card" onSubmit={register}>
        <h2>Enter with invite</h2>
        <label>
          Invite token or full invite link
          <input
            value={invite}
            onChange={(e) => {
              const value = e.target.value;
              try {
                const url = new URL(value);
                setInvite(url.searchParams.get('invite') || value);
              } catch {
                setInvite(value);
              }
            }}
            placeholder="founder-... or one-use token"
            required
          />
        </label>
        <label>
          Anonymous handle
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="gate7_anon"
            minLength={3}
            maxLength={24}
            required
          />
        </label>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Red Member"
            maxLength={48}
          />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-btn" type="submit" disabled={busy}>
          {busy ? 'Creating anonymous account…' : 'Join privately'}
        </button>
        <p className="tiny-note">
          Admin setup uses a special founder invite. Normal users still need only an anonymous invite link.
        </p>
      </form>
    </main>
  );
}

function Shell({ profile, setProfile, settings = DEFAULT_SITE_SETTINGS, view, setView, children }) {
  const [safeShield, setSafeShield] = useState(false);

  useEffect(() => {
    const blur = () => setSafeShield(true);
    const focus = () => setSafeShield(false);
    const vis = () => setSafeShield(document.hidden);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  async function signOut() {
    const ok = window.confirm('This is an anonymous account. If you sign out, you may lose access to this identity. Continue?');
    if (!ok) return;
    await supabase.auth.signOut();
    setProfile(null);
  }

  return (
    <div className="app-shell" onContextMenu={(e) => e.preventDefault()}>
      {safeShield && (
        <div className="privacy-shield">
          <div>
            <BrandMark large settings={settings} />
            <strong>Private screen shield</strong>
            <small>Content is hidden while the tab is not active.</small>
          </div>
        </div>
      )}
      <div className="watermark">{profile?.handle || 'anonymous'} · private members forum</div>
      <header className="topbar">
        <div className="brand-lockup">
          <BrandMark settings={settings} />
          <div>
            <strong>{settings.site_title || APP_NAME}</strong>
            <small>{settings.header_tagline}</small>
          </div>
        </div>
        <div className="user-chip">
          <span className="status-dot" />
          <span>{displayUser(profile)}</span>
          <em>{roleBadge(profile?.role)}</em>
          {profile?.role === 'admin' && (
            <button type="button" className="ghost-btn compact" onClick={() => setView(view === 'admin-site' ? 'feed' : 'admin-site')}>
              {view === 'admin-site' ? 'Blog' : 'Site settings'}
            </button>
          )}
          <button type="button" className="ghost-btn compact" onClick={signOut}>Sign out</button>
        </div>
      </header>
      {children}
    </div>
  );
}

function Composer({ profile, onCreated }) {
  const [kind, setKind] = useState('post');
  const [content, setContent] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (!content.trim()) throw new Error('Write something first.');
      if (sourceUrl && !isSafeUrl(sourceUrl)) throw new Error('Source URL must start with http:// or https://');
      if (videoUrl && !getYoutubeId(videoUrl)) throw new Error('Use a valid YouTube link.');

      let imagePath = null;
      if (image) {
        if (!image.type.startsWith('image/')) throw new Error('Only image uploads are allowed.');
        if (image.size > 10 * 1024 * 1024) throw new Error('Image must be under 10 MB.');
        const safeName = image.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
        imagePath = `${profile.id}/${randomId()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(imagePath, image, {
          cacheControl: '3600',
          upsert: false,
        });
        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await supabase.from('posts').insert({
        author_id: profile.id,
        kind,
        content: content.trim(),
        video_url: videoUrl.trim() || null,
        source_url: sourceUrl.trim() || null,
        image_path: imagePath,
      });
      if (insertError) throw insertError;

      setContent('');
      setVideoUrl('');
      setSourceUrl('');
      setImage(null);
      onCreated?.();
    } catch (err) {
      setError(err.message || 'Could not publish post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="composer glass-card" onSubmit={submit}>
      <div className="composer-head">
        <h2>Publish</h2>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="post">Text post</option>
          <option value="news">News</option>
          <option value="image">Image</option>
          <option value="video">YouTube</option>
        </select>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a clean post, match reaction, transfer thought, or news summary…"
        rows={6}
        maxLength={12000}
      />
      <div className="composer-grid">
        <label>
          Image
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setImage(e.target.files?.[0] || null)} />
        </label>
        <label>
          YouTube URL
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/..." />
        </label>
        <label>
          Source/news URL
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
        </label>
      </div>
      {error && <div className="error-box">{error}</div>}
      <button className="primary-btn" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish post'}</button>
    </form>
  );
}

function PostCard({ post, profile, onChanged }) {
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);
  const author = post.profiles;
  const youtubeId = getYoutubeId(post.video_url);
  const canDelete = post.author_id === profile.id || isStaff(profile.role);
  const imageUrl = useMemo(() => {
    if (!post.image_path) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(post.image_path).data.publicUrl;
  }, [post.image_path]);

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(handle, display_name, role, chat_color)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments(data || []);
  }, [post.id]);

  useEffect(() => {
    loadComments();
    const channel = supabase
      .channel(`comments-${post.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${post.id}` }, loadComments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadComments, post.id]);

  async function addComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('comments').insert({
      post_id: post.id,
      author_id: profile.id,
      body: commentText.trim(),
    });
    setBusy(false);
    if (!error) setCommentText('');
  }

  async function deletePost() {
    if (!window.confirm('Delete this post?')) return;
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) alert(error.message);
    onChanged?.();
  }

  async function deleteComment(commentId) {
    if (!window.confirm('Delete this comment?')) return;
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) alert(error.message);
    loadComments();
  }

  return (
    <article className="post-card glass-card">
      <header className="post-header">
        <div>
          <strong>{displayUser(author)}</strong>
          <small>@{author?.handle || 'anon'} · {formatTime(post.created_at)}</small>
        </div>
        <div className="post-actions">
          <span className={`kind-pill ${post.kind}`}>{post.kind}</span>
          {canDelete && <button className="ghost-btn compact" type="button" onClick={deletePost}>Delete</button>}
        </div>
      </header>

      <p className="post-content">{post.content}</p>

      {imageUrl && <img className="post-image" src={imageUrl} alt="Post upload" loading="lazy" />}

      {youtubeId && (
        <div className="video-frame">
          <iframe
            title="YouTube video"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      )}

      {post.source_url && isSafeUrl(post.source_url) && (
        <a className="source-link" href={post.source_url} target="_blank" rel="noreferrer">
          Open source / news link
        </a>
      )}

      <section className="comments">
        <h3>Comments</h3>
        {comments.length === 0 && <p className="empty-text">No comments yet.</p>}
        {comments.map((comment) => {
          const canDeleteComment = comment.author_id === profile.id || isStaff(profile.role);
          return (
            <div className="comment" key={comment.id}>
              <div className="comment-topline">
                <strong>{displayUser(comment.profiles)}</strong>
                {canDeleteComment && <button type="button" onClick={() => deleteComment(comment.id)}>Delete</button>}
              </div>
              <span>{comment.body}</span>
            </div>
          );
        })}
        <form className="comment-form" onSubmit={addComment}>
          <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment…" maxLength={2000} />
          <button className="ghost-btn" disabled={busy}>Send</button>
        </form>
      </section>
    </article>
  );
}


function FeedHero({ profile, settings = DEFAULT_SITE_SETTINGS }) {
  return (
    <section className="feed-hero glass-card" style={{ '--hero-image': `url(${settings.hero_url || BRAND_HERO})`, '--official-hero-image': `url(${settings.hero_url || OFFICIAL_HERO})` }}>
      <div className="feed-hero-copy">
        <span className="eyebrow">{settings.feed_eyebrow}</span>
        <h1>{settings.feed_heading}</h1>
        <p>{settings.feed_intro}</p>
      </div>
      <div className="feed-hero-card">
        <strong>@{profile.handle}</strong>
        <span>{roleBadge(profile.role)} access</span>
        <small>Use the composer below to publish to the private feed.</small>
      </div>
    </section>
  );
}


function HomeHighlights({ profile }) {
  return (
    <section className="home-highlights">
      <article className="highlight-card glass-card">
        <span className="highlight-kicker">MATCHDAY</span>
        <strong>Live reactions</strong>
        <p>Use the feed for longer thoughts and the popup room for instant red-white talk.</p>
      </article>
      <article className="highlight-card glass-card">
        <span className="highlight-kicker">MEDIA</span>
        <strong>Images & YouTube</strong>
        <p>Upload pictures, embed clips, and keep source links attached to news posts.</p>
      </article>
      <article className="highlight-card glass-card">
        <span className="highlight-kicker">ROOM</span>
        <strong>Chat & voice</strong>
        <p>The lower-right group room updates live and includes a voice tab for members.</p>
      </article>
      <article className="highlight-card glass-card member-highlight" style={{ '--member-color': userColor(profile) }}>
        <span className="highlight-kicker">YOU</span>
        <strong>{displayUser(profile)}</strong>
        <p>Your name and chat colour are shown across the live room.</p>
      </article>
    </section>
  );
}

function TypingIndicator({ typers }) {
  const people = Object.values(typers).filter(Boolean);
  if (people.length === 0) return null;

  let label = '';
  if (people.length === 1) label = `${people[0].name || people[0]} is typing…`;
  else if (people.length === 2) label = `${people[0].name || people[0]} and ${people[1].name || people[1]} are typing…`;
  else if (people.length === 3) label = `${people[0].name || people[0]}, ${people[1].name || people[1]} and ${people[2].name || people[2]} are typing…`;
  else label = `${people.length} people are typing…`;

  return (
    <div className="typing-indicator" aria-live="polite">
      <span className="typing-dots"><i /><i /><i /></span>
      <span>{label}</span>
    </div>
  );
}

function Feed({ profile, settings = DEFAULT_SITE_SETTINGS }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const loadPosts = useCallback(async () => {
    let query = supabase
      .from('posts')
      .select('*, profiles(handle, display_name, role, chat_color)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter !== 'all') query = query.eq('kind', filter);
    const { data, error } = await query;
    if (!error) setPosts(data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadPosts();
    const channel = supabase
      .channel('posts-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, loadPosts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadPosts]);

  return (
    <section className="feed-column">
      <FeedHero profile={profile} settings={settings} />
      <HomeHighlights profile={profile} />
      <Composer profile={profile} onCreated={loadPosts} />
      <div className="feed-toolbar glass-card">
        <strong>Latest posts</strong>
        <div className="filter-tabs">
          {['all', 'post', 'news', 'image', 'video'].map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
      </div>
      {loading && <div className="glass-card loading-card">Loading posts…</div>}
      {!loading && posts.length === 0 && <div className="glass-card loading-card">No posts yet. Publish the first one.</div>}
      {posts.map((post) => <PostCard key={post.id} post={post} profile={profile} onChanged={loadPosts} />)}
    </section>
  );
}

function InvitePanel({ profile }) {
  const [invites, setInvites] = useState([]);
  const [lastInvite, setLastInvite] = useState('');
  const [busy, setBusy] = useState(false);

  const loadInvites = useCallback(async () => {
    const { data } = await supabase
      .from('invites')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    setInvites(data || []);
  }, []);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  async function createInvite() {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_invite', { days_valid: 30 });
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    const link = `${window.location.origin}${window.location.pathname}?invite=${data}`;
    setLastInvite(link);
    await navigator.clipboard?.writeText(link).catch(() => null);
    loadInvites();
  }

  return (
    <aside className="side-card glass-card">
      <h2>Invite system</h2>
      <p>Every invite is unique, one-use, and expires after 30 days. Invites created here are normal member invites.</p>
      <button className="primary-btn full" type="button" onClick={createInvite} disabled={busy}>
        {busy ? 'Creating…' : 'Create one-use invite'}
      </button>
      {lastInvite && (
        <div className="invite-result">
          <span>Copied invite link:</span>
          <textarea readOnly value={lastInvite} rows={3} />
        </div>
      )}
      <div className="mini-list">
        {invites.map((invite) => (
          <div key={invite.id}>
            <strong>{invite.used_at ? 'Used' : 'Open'}</strong>
            <span>{invite.invite_role || 'member'} · {formatTime(invite.created_at)}</span>
          </div>
        ))}
      </div>
      {profile.role === 'admin' && <p className="tiny-note">Admin/founder invites are created from Supabase SQL only, so they are not accidentally generated by members.</p>}
    </aside>
  );
}

function AdminPanel({ profile }) {
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({ members: 0, posts: 0, messages: 0 });
  const [busyId, setBusyId] = useState('');

  const loadAdminData = useCallback(async () => {
    if (profile.role !== 'admin') return;
    const [{ data: memberRows }, postCount, messageCount] = await Promise.all([
      supabase.from('profiles').select('id, handle, display_name, role, created_at, last_seen').order('created_at', { ascending: false }).limit(50),
      supabase.from('posts').select('id', { count: 'exact', head: true }),
      supabase.from('encrypted_messages').select('id', { count: 'exact', head: true }),
    ]);
    setMembers(memberRows || []);
    setStats({ members: memberRows?.length || 0, posts: postCount.count || 0, messages: messageCount.count || 0 });
  }, [profile.role]);

  useEffect(() => { loadAdminData(); }, [loadAdminData]);

  async function setRole(memberId, role) {
    setBusyId(memberId);
    const { error } = await supabase.rpc('admin_set_user_role', { target_user: memberId, new_role: role });
    setBusyId('');
    if (error) alert(error.message);
    loadAdminData();
  }

  if (profile.role !== 'admin') return null;

  return (
    <aside className="side-card glass-card admin-panel">
      <h2>Admin control</h2>
      <div className="admin-stats">
        <span><strong>{stats.members}</strong><small>members shown</small></span>
        <span><strong>{stats.posts}</strong><small>posts</small></span>
        <span><strong>{stats.messages}</strong><small>chat messages</small></span>
      </div>
      <div className="member-list">
        {members.map((member) => (
          <div className="member-row" key={member.id}>
            <div>
              <strong>@{member.handle}</strong>
              <small>{displayUser(member)} · {roleBadge(member.role)}</small>
            </div>
            <select value={member.role} disabled={busyId === member.id} onChange={(e) => setRole(member.id, e.target.value)}>
              <option value="member">member</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
            </select>
          </div>
        ))}
      </div>
    </aside>
  );
}


function AdminSiteSettings({ settings, onSettingsChanged, goBack }) {
  const [form, setForm] = useState({ ...DEFAULT_SITE_SETTINGS, ...settings });
  const [logoFile, setLogoFile] = useState(null);
  const [heroFile, setHeroFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [heroPreview, setHeroPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ ...DEFAULT_SITE_SETTINGS, ...settings });
  }, [settings]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  useEffect(() => {
    if (!heroFile) {
      setHeroPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(heroFile);
    setHeroPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [heroFile]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function uploadBrandAsset(file, type) {
    if (!file) return '';
    if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Brand images must be under 5 MB.');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const safeExt = ext.replace(/[^a-z0-9]/g, '') || 'png';
    const path = `branding/${type}-${Date.now()}-${randomId()}.${safeExt}`;
    const { error: uploadError } = await supabase.storage.from(SITE_ASSETS_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    return publicAssetUrl(SITE_ASSETS_BUCKET, path);
  }

  async function saveSettings(e) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      const next = { ...form };
      if (logoFile) next.logo_url = await uploadBrandAsset(logoFile, 'logo');
      if (heroFile) next.hero_url = await uploadBrandAsset(heroFile, 'hero');

      const rows = Object.entries(DEFAULT_SITE_SETTINGS).map(([key]) => ({
        key,
        value: String(next[key] || ''),
      }));

      const { error: upsertError } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
      if (upsertError) throw upsertError;
      setForm(next);
      setLogoFile(null);
      setHeroFile(null);
      setSaved(true);
      applyDocumentBranding(next);
      await onSettingsChanged?.();
      setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err.message || 'Could not save site settings');
    } finally {
      setBusy(false);
    }
  }

  const liveLogoSettings = { ...form, logo_url: logoPreview || form.logo_url };
  const effectiveLogo = logoPreview || form.logo_url || '/brand/community-crest.svg';
  const effectiveHero = heroPreview || form.hero_url || BRAND_HERO;

  return (
    <main className="admin-site-page">
      <section className="admin-site-hero glass-card">
        <div>
          <span className="eyebrow">ADMIN SITE SETTINGS</span>
          <h1>Customize the logo, hero image and wording.</h1>
          <p>Replace the default crest from here. The selected logo is used in the top bar, invite screen, privacy shield and browser tab icon after saving.</p>
        </div>
        <button className="ghost-btn" type="button" onClick={goBack}>Back to blog</button>
      </section>

      <form className="admin-settings-grid" onSubmit={saveSettings}>
        <section className="glass-card admin-settings-card">
          <h2>Site logo</h2>
          <div className="brand-preview-row brand-preview-strong">
            <BrandMark large settings={liveLogoSettings} />
            <div>
              <strong>{form.site_title || APP_NAME}</strong>
              <small>{logoFile ? `Ready to replace with ${logoFile.name}` : form.logo_url ? 'Custom logo active' : 'Using fallback crest'}</small>
            </div>
          </div>

          <div className="logo-upload-box">
            <div className="logo-upload-preview">
              <img src={effectiveLogo} alt="Current site logo preview" />
            </div>
            <div>
              <strong>Replace default logo</strong>
              <p>Upload PNG, JPG, WebP, GIF or SVG. Square images work best. Save settings after selecting the file.</p>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            </div>
          </div>

          <label>
            Logo URL
            <input value={form.logo_url} onChange={(e) => updateField('logo_url', e.target.value)} placeholder="https://... or /brand/olympiacos-logo.png" />
          </label>
          <div className="button-row split-actions">
            <button className="ghost-btn" type="button" onClick={() => { setLogoFile(null); updateField('logo_url', ''); }}>Use default crest</button>
            {form.logo_url && <a className="ghost-btn" href={form.logo_url} target="_blank" rel="noreferrer">Open current logo</a>}
          </div>
        </section>

        <section className="glass-card admin-settings-card">
          <h2>Hero/background image</h2>
          <div className="hero-upload-preview" style={{ backgroundImage: `url(${effectiveHero})` }} />
          <label>
            Hero/background URL
            <input value={form.hero_url} onChange={(e) => updateField('hero_url', e.target.value)} placeholder="https://... or /brand/olympiacos-hero.jpg" />
          </label>
          <label>
            Upload new hero image
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(e) => setHeroFile(e.target.files?.[0] || null)} />
          </label>
          <button className="ghost-btn" type="button" onClick={() => { setHeroFile(null); updateField('hero_url', ''); }}>Use default hero art</button>
        </section>

        <section className="glass-card admin-settings-card wide">
          <h2>Site wording</h2>
          <div className="settings-two-col">
            <label>Site title<input value={form.site_title} onChange={(e) => updateField('site_title', e.target.value)} maxLength={80} /></label>
            <label>Small tagline<input value={form.tagline} onChange={(e) => updateField('tagline', e.target.value)} maxLength={140} /></label>
            <label>Header tagline<input value={form.header_tagline} onChange={(e) => updateField('header_tagline', e.target.value)} maxLength={140} /></label>
            <label>Feed eyebrow<input value={form.feed_eyebrow} onChange={(e) => updateField('feed_eyebrow', e.target.value)} maxLength={90} /></label>
          </div>
          <label>Invite page headline<input value={form.gate_heading} onChange={(e) => updateField('gate_heading', e.target.value)} maxLength={180} /></label>
          <label>Invite page intro<textarea value={form.gate_intro} onChange={(e) => updateField('gate_intro', e.target.value)} rows={3} maxLength={500} /></label>
          <label>Feed headline<input value={form.feed_heading} onChange={(e) => updateField('feed_heading', e.target.value)} maxLength={180} /></label>
          <label>Feed intro<textarea value={form.feed_intro} onChange={(e) => updateField('feed_intro', e.target.value)} rows={3} maxLength={500} /></label>
          <div className="settings-two-col">
            <label>Community card title<input value={form.community_title} onChange={(e) => updateField('community_title', e.target.value)} maxLength={120} /></label>
            <label>Footer text<input value={form.footer_text} onChange={(e) => updateField('footer_text', e.target.value)} maxLength={240} /></label>
          </div>
          <label>Community card text<textarea value={form.community_text} onChange={(e) => updateField('community_text', e.target.value)} rows={3} maxLength={400} /></label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save site settings'}</button>
        </section>
      </form>
    </main>
  );
}

function ChatPanel({ profile }) {
  const [isOpen, setIsOpen] = useState(() => localStorage.getItem('chat-popup-open') !== '0');
  const [activeTab, setActiveTab] = useState('messages');
  const [roomSecret, setRoomSecret] = useState(sessionStorage.getItem('room-secret') || '');
  const [messages, setMessages] = useState([]);
  const [plainMessages, setPlainMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeTypers, setActiveTypers] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const bottomRef = useRef(null);
  const chatChannelRef = useRef(null);
  const typingTimersRef = useRef(new Map());
  const lastTypingSentRef = useRef(0);
  const isOpenRef = useRef(isOpen);

  const canDecrypt = roomSecret.trim().length >= 10;

  useEffect(() => {
    isOpenRef.current = isOpen;
    localStorage.setItem('chat-popup-open', isOpen ? '1' : '0');
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('encrypted_messages')
      .select('*, profiles(handle, display_name, role, chat_color)')
      .order('created_at', { ascending: false })
      .limit(100);
    setMessages((data || []).reverse());
  }, []);

  const sendTyping = useCallback(async (isTyping) => {
    if (!chatChannelRef.current) return;
    await chatChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: profile.id,
        name: displayUser(profile),
        color: userColor(profile),
        is_typing: isTyping,
        at: Date.now(),
      },
    }).catch(() => null);
  }, [profile]);

  const clearTyper = useCallback((userId) => {
    setActiveTypers((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    const timer = typingTimersRef.current.get(userId);
    if (timer) window.clearTimeout(timer);
    typingTimersRef.current.delete(userId);
  }, []);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel('private-group-chat-room', { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encrypted_messages' }, () => {
        loadMessages();
      })
      .on('broadcast', { event: 'message-created' }, ({ payload }) => {
        if (payload?.sender_id !== profile.id && !isOpenRef.current) {
          setUnreadCount((count) => count + 1);
        }
        loadMessages();
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.user_id === profile.id) return;
        if (!payload.is_typing) {
          clearTyper(payload.user_id);
          return;
        }

        setActiveTypers((current) => ({ ...current, [payload.user_id]: { name: payload.name || 'Member', color: payload.color || '#e31b2f' } }));
        const oldTimer = typingTimersRef.current.get(payload.user_id);
        if (oldTimer) window.clearTimeout(oldTimer);
        const newTimer = window.setTimeout(() => clearTyper(payload.user_id), 3500);
        typingTimersRef.current.set(payload.user_id, newTimer);
      })
      .subscribe();

    chatChannelRef.current = channel;

    return () => {
      typingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      typingTimersRef.current.clear();
      supabase.removeChannel(channel);
      chatChannelRef.current = null;
    };
  }, [clearTyper, loadMessages, profile.id]);

  useEffect(() => {
    let cancelled = false;
    async function decryptAll() {
      if (!canDecrypt) {
        setPlainMessages([]);
        return;
      }
      sessionStorage.setItem('room-secret', roomSecret);
      const output = [];
      for (const message of messages) {
        try {
          const plain = await decryptMessage(message, roomSecret);
          output.push({ ...message, plain, failed: false });
        } catch {
          output.push({ ...message, plain: 'Cannot read with this room key.', failed: true });
        }
      }
      if (!cancelled) setPlainMessages(output);
    }
    decryptAll();
    return () => { cancelled = true; };
  }, [messages, roomSecret, canDecrypt]);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [plainMessages.length, isOpen]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim() || !canDecrypt) return;
    setBusy(true);
    try {
      const encrypted = await encryptMessage(draft.trim(), roomSecret);
      const { data, error } = await supabase.from('encrypted_messages').insert({
        sender_id: profile.id,
        ...encrypted,
      }).select('id').single();
      if (error) throw error;

      setDraft('');
      await sendTyping(false);
      await chatChannelRef.current?.send({
        type: 'broadcast',
        event: 'message-created',
        payload: { id: data?.id, sender_id: profile.id },
      }).catch(() => null);
      loadMessages();
    } catch (err) {
      alert(err.message || 'Could not send message');
    } finally {
      setBusy(false);
    }
  }

  async function deleteMessage(messageId) {
    if (!window.confirm('Delete this message?')) return;
    const { error } = await supabase.from('encrypted_messages').delete().eq('id', messageId);
    if (error) alert(error.message);
    loadMessages();
  }

  function generateSecret() {
    const secret = makeRoomSecret();
    setRoomSecret(secret);
    sessionStorage.setItem('room-secret', secret);
    navigator.clipboard?.writeText(secret).catch(() => null);
  }

  function updateDraft(value) {
    setDraft(value);
    if (!value.trim()) {
      sendTyping(false);
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1200) {
      lastTypingSentRef.current = now;
      sendTyping(true);
    }
  }

  return (
    <div className={`chat-popup ${isOpen ? 'open' : 'closed'}`}>
      {!isOpen && (
        <button className="chat-launcher" type="button" onClick={() => setIsOpen(true)} aria-label="Open group chat">
          <span className="launcher-icon">💬</span>
          <span>
            <strong>Group chat</strong>
            <small>{unreadCount > 0 ? `${unreadCount} new` : 'Messages and voice room'}</small>
          </span>
        </button>
      )}

      {isOpen && (
        <aside className="chat-card glass-card popup-card">
          <div className="popup-chat-titlebar">
            <div>
              <span className="eyebrow">LIVE GROUP ROOM</span>
              <h2>Group chat</h2>
            </div>
            <div className="popup-chat-actions">
              <button className="ghost-btn compact" type="button" onClick={() => setIsOpen(false)}>Close</button>
            </div>
          </div>

          <div className="chat-subtabs" role="tablist" aria-label="Group room options">
            <button type="button" className={activeTab === 'messages' ? 'active' : ''} onClick={() => setActiveTab('messages')}>Messages</button>
            <button type="button" className={activeTab === 'voice' ? 'active' : ''} onClick={() => setActiveTab('voice')}>Voice chat</button>
          </div>

          {activeTab === 'messages' ? (
            <div className="chat-tab-panel messages-panel">
              <div className="room-key-box popup-key-box">
                <label>
                  Group room passphrase
                  <input
                    type="password"
                    value={roomSecret}
                    onChange={(event) => setRoomSecret(event.target.value)}
                    placeholder="Shared room key"
                  />
                </label>
                <button type="button" className="ghost-btn" onClick={generateSecret}>Generate</button>
              </div>

              {!canDecrypt && <div className="warning-box">Enter the shared room key to read and send messages.</div>}

              <div className="chat-window popup-chat-window" aria-live="polite">
                {plainMessages.length === 0 && <div className="empty-text padded">No readable messages yet.</div>}
                {plainMessages.map((message) => {
                  const canDelete = message.sender_id === profile.id || isStaff(profile.role);
                  const color = userColor(message.profiles);
                  return (
                    <div className={`chat-line ${message.sender_id === profile.id ? 'mine' : ''} ${message.failed ? 'failed' : ''}`} key={message.id} style={{ '--member-color': color }}>
                      <div className="chat-line-head">
                        <div className="chat-author">
                          <span className="chat-avatar" style={{ background: color }}>{displayUser(message.profiles).slice(0, 1).toUpperCase()}</span>
                          <strong style={{ color }}>{displayUser(message.profiles)}</strong>
                        </div>
                        {canDelete && <button type="button" onClick={() => deleteMessage(message.id)}>×</button>}
                      </div>
                      <span>{message.plain}</span>
                      <small>{formatTime(message.created_at)}</small>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <TypingIndicator typers={activeTypers} />

              <form className="chat-form popup-chat-form" onSubmit={send}>
                <input
                  value={draft}
                  onChange={(event) => updateDraft(event.target.value)}
                  onBlur={() => sendTyping(false)}
                  placeholder={canDecrypt ? 'Write message…' : 'Enter room key first'}
                  disabled={!canDecrypt}
                  maxLength={2000}
                />
                <button className="primary-btn send-message-btn" disabled={!canDecrypt || busy}>{busy ? '…' : 'Send'}</button>
              </form>
            </div>
          ) : (
            <div className="chat-tab-panel voice-panel">
              <VoiceRoom profile={profile} compact />
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function RemoteAudio({ stream, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="voice-peer">
      <span className="voice-dot" />
      <strong>{label}</strong>
      <audio ref={ref} autoPlay playsInline />
    </div>
  );
}

function VoiceRoom({ profile, compact = false }) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteNames, setRemoteNames] = useState({});
  const [remoteStates, setRemoteStates] = useState({});
  const [voiceMembers, setVoiceMembers] = useState({});
  const channelRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const activeRef = useRef(false);
  const knownMembersRef = useRef(new Set());

  const shouldInitiate = useCallback((peerId) => {
    if (!peerId || peerId === profile.id) return false;
    return String(profile.id).localeCompare(String(peerId)) < 0;
  }, [profile.id]);

  const sendBroadcast = useCallback(async (event, payload) => {
    if (!channelRef.current) return;
    await channelRef.current.send({ type: 'broadcast', event, payload }).catch(() => null);
  }, []);

  const closePeer = useCallback((peerId) => {
    const pc = peersRef.current.get(peerId);
    if (pc) pc.close();
    peersRef.current.delete(peerId);
    knownMembersRef.current.delete(peerId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
    setRemoteNames((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
    setRemoteStates((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const getPeer = useCallback((peerId, peerName = 'Member') => {
    if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(peerId, pc);
    knownMembersRef.current.add(peerId);
    setRemoteNames((current) => ({ ...current, [peerId]: peerName }));

    localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendBroadcast('voice-signal', {
          from: profile.id,
          fromName: displayUser(profile),
          to: peerId,
          kind: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      setRemoteStreams((current) => ({ ...current, [peerId]: stream }));
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        closePeer(peerId);
      }
    };

    return pc;
  }, [closePeer, profile, sendBroadcast]);

  const createOffer = useCallback(async (peerId, peerName) => {
    if (!activeRef.current || peerId === profile.id) return;
    try {
      const pc = getPeer(peerId, peerName);
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await sendBroadcast('voice-signal', {
        from: profile.id,
        fromName: displayUser(profile),
        to: peerId,
        kind: 'offer',
        sdp: offer,
      });
    } catch (err) {
      console.warn('Voice offer failed', err);
    }
  }, [getPeer, profile, sendBroadcast]);

  const handleSignal = useCallback(async (payload) => {
    if (!activeRef.current || payload.to !== profile.id || payload.from === profile.id) return;
    try {
      const pc = getPeer(payload.from, payload.fromName);
      if (payload.kind === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendBroadcast('voice-signal', {
          from: profile.id,
          fromName: displayUser(profile),
          to: payload.from,
          kind: 'answer',
          sdp: answer,
        });
      } else if (payload.kind === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (payload.kind === 'candidate' && payload.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } catch (err) {
      console.warn('Voice signal failed', err);
    }
  }, [getPeer, profile, sendBroadcast]);

  const syncPresence = useCallback((channel) => {
    const state = channel.presenceState();
    const nextMembers = {};
    Object.entries(state).forEach(([userId, presences]) => {
      const latest = presences?.[presences.length - 1] || {};
      nextMembers[userId] = {
        id: userId,
        name: latest.name || (userId === profile.id ? displayUser(profile) : 'Member'),
        color: latest.color || '#e31b2f',
        muted: Boolean(latest.muted),
      };
    });
    setVoiceMembers(nextMembers);

    if (!activeRef.current) return;
    Object.entries(nextMembers).forEach(([peerId, info]) => {
      if (peerId !== profile.id && !knownMembersRef.current.has(peerId) && shouldInitiate(peerId)) {
        window.setTimeout(() => createOffer(peerId, info.name), 250);
      }
    });
  }, [createOffer, profile, shouldInitiate]);

  const stopVoice = useCallback(async () => {
    activeRef.current = false;
    setJoined(false);
    setMuted(false);
    setRemoteStreams({});
    setRemoteNames({});
    setRemoteStates({});
    setVoiceMembers({});
    knownMembersRef.current.clear();

    await sendBroadcast('voice-leave', { from: profile.id });

    if (channelRef.current) {
      await channelRef.current.untrack().catch(() => null);
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, [profile.id, sendBroadcast]);

  async function startVoice() {
    setVoiceError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('This browser does not support microphone voice chat.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;
      activeRef.current = true;
      setJoined(true);

      const channel = supabase
        .channel('live-voice-room', { config: { presence: { key: profile.id }, broadcast: { self: false } } })
        .on('presence', { event: 'sync' }, () => syncPresence(channel))
        .on('broadcast', { event: 'voice-join' }, ({ payload }) => {
          if (!payload || payload.from === profile.id) return;
          setRemoteNames((current) => ({ ...current, [payload.from]: payload.name || 'Member' }));
          if (shouldInitiate(payload.from)) createOffer(payload.from, payload.name);
        })
        .on('broadcast', { event: 'voice-leave' }, ({ payload }) => {
          if (payload?.from !== profile.id) closePeer(payload.from);
        })
        .on('broadcast', { event: 'voice-state' }, ({ payload }) => {
          if (!payload || payload.from === profile.id) return;
          setRemoteStates((current) => ({ ...current, [payload.from]: { muted: Boolean(payload.muted) } }));
        })
        .on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
          handleSignal(payload);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              name: displayUser(profile),
              color: userColor(profile),
              muted: false,
              in_voice: true,
              joined_at: new Date().toISOString(),
            });
            syncPresence(channel);
            await channel.send({
              type: 'broadcast',
              event: 'voice-join',
              payload: { from: profile.id, name: displayUser(profile), color: userColor(profile) },
            });
          }
        });

      channelRef.current = channel;
    } catch (err) {
      activeRef.current = false;
      setJoined(false);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setVoiceError(err.message || 'Microphone permission was denied.');
    }
  }

  async function toggleMute() {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
    await channelRef.current?.track({
      name: displayUser(profile),
      color: userColor(profile),
      muted: next,
      in_voice: true,
      joined_at: new Date().toISOString(),
    }).catch(() => null);
    await sendBroadcast('voice-state', { from: profile.id, name: displayUser(profile), muted: next });
  }

  useEffect(() => () => { stopVoice(); }, [stopVoice]);

  const memberEntries = Object.entries(voiceMembers).filter(([id]) => id !== profile.id);
  const memberCount = Object.keys(voiceMembers).length;

  return (
    <aside className={`voice-card ${compact ? 'inside-chat' : 'glass-card'}`}>
      <div className="voice-head">
        <div>
          <span className="eyebrow">VOICE ROOM</span>
          <h2>Live voice room</h2>
          <p>Join the group audio room. Members connect live and the room list updates automatically.</p>
        </div>
        <span className={joined ? 'voice-status on' : 'voice-status'}>{joined ? 'Live' : 'Off'}</span>
      </div>

      {voiceError && <div className="error-box">{voiceError}</div>}

      <div className="voice-actions">
        {!joined ? (
          <button className="primary-btn full" type="button" onClick={startVoice}>Join voice</button>
        ) : (
          <>
            <button className="ghost-btn" type="button" onClick={toggleMute}>{muted ? 'Unmute mic' : 'Mute mic'}</button>
            <button className="danger-btn" type="button" onClick={stopVoice}>Leave</button>
          </>
        )}
      </div>

      <div className="voice-members">
        <div className="voice-peer self" style={{ '--member-color': userColor(profile) }}>
          <span className="voice-dot" />
          <strong>{joined ? `${displayUser(profile)} ${muted ? '(muted)' : '(you)'}` : 'Not connected'}</strong>
        </div>
        {memberEntries.map(([peerId, info]) => {
          const stream = remoteStreams[peerId];
          const isPeerMuted = remoteStates[peerId]?.muted || info.muted;
          return stream ? (
            <RemoteAudio key={peerId} stream={stream} label={`${remoteNames[peerId] || info.name || 'Member'}${isPeerMuted ? ' (muted)' : ''}`} />
          ) : (
            <div className="voice-peer waiting" key={peerId} style={{ '--member-color': info.color || '#e31b2f' }}>
              <span className="voice-dot" />
              <strong>{info.name || 'Member'} connecting…</strong>
            </div>
          );
        })}
      </div>
      <p className="tiny-note">
        {joined ? `Members in voice: ${memberCount || 1}. Connections update live.` : 'Press Join voice and allow microphone access.'}
      </p>
    </aside>
  );
}

function ProfileCard({ profile, setProfile }) {
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [chatColor, setChatColor] = useState(userColor(profile));
  const [bio, setBio] = useState(profile.bio || '');
  const [saved, setSaved] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), chat_color: chatColor, bio: bio.trim(), last_seen: new Date().toISOString() })
      .eq('id', profile.id)
      .select('*')
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setProfile(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  return (
    <aside className="side-card glass-card">
      <h2>Your anonymous profile</h2>
      <div className="profile-big">
        <span className="avatar" style={{ background: chatColor }}>{(displayName || profile.handle || '?').slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>@{profile.handle}</strong>
          <small>{roleBadge(profile.role)}</small>
        </div>
      </div>
      <form onSubmit={saveProfile} className="profile-form">
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} required />
        </label>
        <label>
          Chat colour
          <div className="color-picker-row">
            <input className="color-input" type="color" value={chatColor} onChange={(e) => setChatColor(e.target.value)} />
            <select value={chatColor} onChange={(e) => setChatColor(e.target.value)}>
              {CHAT_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
            </select>
          </div>
        </label>
        <label>
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} />
        </label>
        <button className="ghost-btn" type="submit">{saved ? 'Saved' : 'Save profile'}</button>
      </form>
    </aside>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SITE_SETTINGS);
  const [view, setView] = useState('feed');

  const refreshSiteSettings = useCallback(async () => {
    const next = await loadSiteSettings();
    setSiteSettings(next);
    applyDocumentBranding(next);
  }, []);

  useEffect(() => {
    applyDocumentBranding(siteSettings);
  }, [siteSettings]);

  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isConfigured()) {
      setLoading(false);
      return;
    }

    refreshSiteSettings();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      if (data.session?.user) loadProfile(data.session.user.id);
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
      if (newSession?.user) loadProfile(newSession.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile, refreshSiteSettings]);

  if (!isConfigured()) return <SetupNotice settings={siteSettings} />;
  if (loading) return <main className="setup-shell"><div className="glass-card loading-card">Loading members area…</div></main>;
  if (!session || !profile) return <InviteGate onProfileReady={setProfile} settings={siteSettings} />;

  return (
    <Shell profile={profile} setProfile={setProfile} settings={siteSettings} view={view} setView={setView}>
      {view === 'admin-site' && profile.role === 'admin' ? (
        <AdminSiteSettings
          settings={siteSettings}
          onSettingsChanged={refreshSiteSettings}
          goBack={() => setView('feed')}
        />
      ) : (
        <main className="dashboard two-column">
          <section className="left-rail">
            <ProfileCard profile={profile} setProfile={setProfile} />
            <AdminPanel profile={profile} />
            <InvitePanel profile={profile} />
          </section>
          <Feed profile={profile} settings={siteSettings} />
          <section className="right-rail">
            <section className="side-card glass-card chants-card">
              <span className="eyebrow">PIRAEUS BOARD</span>
              <h2>{siteSettings.community_title}</h2>
              <p>{siteSettings.community_text}</p>
            </section>
          </section>
        </main>
      )}
      <ChatPanel profile={profile} />
      <footer className="footer-note">{siteSettings.footer_text}</footer>
    </Shell>
  );
}

createRoot(document.getElementById('root')).render(<App />);
