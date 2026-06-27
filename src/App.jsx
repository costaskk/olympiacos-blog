import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, isConfigured } from './lib/supabase.js';
import { decryptMessage, encryptMessage, makeRoomSecret } from './lib/crypto.js';
import { getYoutubeId, isSafeUrl } from './lib/youtube.js';
import './styles.css';

const BUCKET = 'post-images';
const APP_NAME = 'Thrylos Agora';

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

function roleBadge(role) {
  if (role === 'admin') return 'Founder';
  if (role === 'moderator') return 'Mod';
  return 'Member';
}

function SetupNotice() {
  return (
    <main className="setup-shell">
      <div className="setup-card glass-card">
        <div className="brand-lockup big">
          <span className="crest">Θ</span>
          <div>
            <strong>{APP_NAME}</strong>
            <small>Private red-white blog + encrypted agora</small>
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

function InviteGate({ onProfileReady }) {
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
      <section className="gate-hero">
        <div className="brand-lockup big">
          <span className="crest">Θ</span>
          <div>
            <strong>{APP_NAME}</strong>
            <small>Anonymous. Invite-only. Red-white noise.</small>
          </div>
        </div>
        <h1>A clean private Olympiacos-style blog for members only.</h1>
        <p>
          Post thoughts, images, YouTube links, news, and join the encrypted group chat. No email is requested.
          Your browser keeps the anonymous session, so do not sign out unless you accept losing this identity.
        </p>
        <div className="hero-grid">
          <span>One-use invites</span>
          <span>Encrypted chat</span>
          <span>Image posts</span>
          <span>YouTube embeds</span>
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
          No recovery email is stored. Keep the same browser profile if you want to keep the same account.
        </p>
      </form>
    </main>
  );
}

function Shell({ profile, setProfile, children }) {
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
            <span className="crest">Θ</span>
            <strong>Private screen shield</strong>
            <small>Content is hidden while the tab is not active.</small>
          </div>
        </div>
      )}
      <div className="watermark">{profile?.handle || 'anonymous'} · private members forum</div>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="crest">Θ</span>
          <div>
            <strong>{APP_NAME}</strong>
            <small>Independent fan community</small>
          </div>
        </div>
        <div className="user-chip">
          <span className="status-dot" />
          <span>{displayUser(profile)}</span>
          <em>{roleBadge(profile?.role)}</em>
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
  const canDelete = post.author_id === profile.id || ['admin', 'moderator'].includes(profile.role);
  const imageUrl = useMemo(() => {
    if (!post.image_path) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(post.image_path).data.publicUrl;
  }, [post.image_path]);

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(handle, display_name, role)')
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
        {comments.map((comment) => (
          <div className="comment" key={comment.id}>
            <strong>{displayUser(comment.profiles)}</strong>
            <span>{comment.body}</span>
          </div>
        ))}
        <form className="comment-form" onSubmit={addComment}>
          <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment…" maxLength={2000} />
          <button className="ghost-btn" disabled={busy}>Send</button>
        </form>
      </section>
    </article>
  );
}

function Feed({ profile }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const loadPosts = useCallback(async () => {
    let query = supabase
      .from('posts')
      .select('*, profiles(handle, display_name, role)')
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

function InvitePanel() {
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
      <p>Every invite is unique, one-use, and expires after 30 days.</p>
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
            <span>{formatTime(invite.created_at)}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ChatPanel({ profile }) {
  const [roomSecret, setRoomSecret] = useState(sessionStorage.getItem('room-secret') || '');
  const [messages, setMessages] = useState([]);
  const [plainMessages, setPlainMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  const canDecrypt = roomSecret.trim().length >= 10;

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('encrypted_messages')
      .select('*, profiles(handle, display_name, role)')
      .order('created_at', { ascending: false })
      .limit(100);
    setMessages((data || []).reverse());
  }, []);

  useEffect(() => {
    loadMessages();
    const channel = supabase
      .channel('encrypted-group-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'encrypted_messages' }, loadMessages)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadMessages]);

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
          output.push({ ...message, plain: 'Cannot decrypt with this room key.', failed: true });
        }
      }
      if (!cancelled) setPlainMessages(output);
    }
    decryptAll();
    return () => { cancelled = true; };
  }, [messages, roomSecret, canDecrypt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [plainMessages.length]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim() || !canDecrypt) return;
    setBusy(true);
    try {
      const encrypted = await encryptMessage(draft.trim(), roomSecret);
      const { error } = await supabase.from('encrypted_messages').insert({
        sender_id: profile.id,
        ...encrypted,
      });
      if (error) throw error;
      setDraft('');
    } catch (err) {
      alert(err.message || 'Could not send encrypted message');
    } finally {
      setBusy(false);
    }
  }

  function generateSecret() {
    const secret = makeRoomSecret();
    setRoomSecret(secret);
    sessionStorage.setItem('room-secret', secret);
    navigator.clipboard?.writeText(secret).catch(() => null);
  }

  return (
    <aside className={`chat-card glass-card ${privacyMode ? 'chat-privacy' : ''}`}>
      <div className="chat-head">
        <div>
          <h2>Encrypted group chat</h2>
          <p>Messages are AES-GCM encrypted in the browser before they reach the database.</p>
        </div>
        <label className="toggle-line">
          <input type="checkbox" checked={privacyMode} onChange={(e) => setPrivacyMode(e.target.checked)} />
          Shield
        </label>
      </div>

      <div className="room-key-box">
        <label>
          Group room passphrase
          <input
            type="password"
            value={roomSecret}
            onChange={(e) => setRoomSecret(e.target.value)}
            placeholder="Share this manually with trusted members"
          />
        </label>
        <button type="button" className="ghost-btn" onClick={generateSecret}>Generate</button>
      </div>

      {!canDecrypt && <div className="warning-box">Enter the shared room key to decrypt and send messages.</div>}

      <div className="chat-window" aria-live="polite">
        {plainMessages.length === 0 && <div className="empty-text padded">No readable messages yet.</div>}
        {plainMessages.map((message) => (
          <div className={`chat-line ${message.sender_id === profile.id ? 'mine' : ''} ${message.failed ? 'failed' : ''}`} key={message.id}>
            <strong>{displayUser(message.profiles)}</strong>
            <span>{message.plain}</span>
            <small>{formatTime(message.created_at)}</small>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={canDecrypt ? 'Write encrypted message…' : 'Enter room key first'}
          disabled={!canDecrypt}
          maxLength={2000}
        />
        <button className="primary-btn" disabled={!canDecrypt || busy}>{busy ? '…' : 'Send'}</button>
      </form>
      <p className="tiny-note">
        Screenshot protection is a deterrent only. Browsers cannot block every OS screenshot or camera photo.
      </p>
    </aside>
  );
}

function ProfileCard({ profile, setProfile }) {
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [saved, setSaved] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), bio: bio.trim(), last_seen: new Date().toISOString() })
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
        <span className="avatar">{(displayName || profile.handle || '?').slice(0, 1).toUpperCase()}</span>
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
  }, [loadProfile]);

  if (!isConfigured()) return <SetupNotice />;
  if (loading) return <main className="setup-shell"><div className="glass-card loading-card">Loading private agora…</div></main>;
  if (!session || !profile) return <InviteGate onProfileReady={setProfile} />;

  return (
    <Shell profile={profile} setProfile={setProfile}>
      <main className="dashboard">
        <section className="left-rail">
          <ProfileCard profile={profile} setProfile={setProfile} />
          <InvitePanel />
          <section className="side-card glass-card notice-card">
            <h2>Privacy reality</h2>
            <p>
              The app hides content on blur, blocks print, disables casual copying, and watermarks the screen.
              No website can fully prevent screenshots from the operating system or an external camera.
            </p>
          </section>
        </section>
        <Feed profile={profile} />
        <section className="right-rail">
          <ChatPanel profile={profile} />
        </section>
      </main>
      <footer className="footer-note">
        Independent fan project. No official club marks or assets are included.
      </footer>
    </Shell>
  );
}

createRoot(document.getElementById('root')).render(<App />);
