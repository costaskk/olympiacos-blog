# Thrylos Agora

Modern red-white private fan blog with invite-only registration, handle/password login, member posts, images, news links, YouTube embeds, comments, live general chat, private/group chat rooms, typing indicators, user colour customization, a voice room inside the chat popup, and admin-controlled site branding.

This project includes original red-white fallback artwork. Official club logos/photos are not bundled. Add only assets you are allowed to use.

## v5.4 login update

- New **Login** tab on the invite screen.
- New members now choose a handle and password when they use an invite.
- After joining once, they can log back in with the same handle/password.
- No real email is requested from members. The app creates a private internal Supabase Auth address from the handle.
- Invites remain one-use only; the login is for the account created from the invite.

## v5 changes

- Fixed the lower-right chat popup alignment so the message input and Send button stay inside the panel.
- Improved the voice tab so members, mute state, joins/leaves and peer connections update live through Supabase Realtime presence/broadcast.
- Added a cleaner modern feed with highlight cards and stronger red-white styling.
- Chat is now a lower-right popup with two sub-tabs:
  - **Messages**
  - **Voice chat**
- Live messages update automatically without refresh.
- Typing indicators show one or multiple users typing.
- Every user can customize:
  - display name
  - chat colour
  - bio
- Chat bubbles show each user with a distinct colour/avatar.
- Admin-only **Site settings** page added.
- Admin can upload/change:
  - site logo
  - hero/background image
  - invite page wording
  - feed hero wording
  - topbar tagline
  - community card wording
  - footer text
- Supabase schema adds:
  - `profiles.chat_color`
  - `site_settings`
  - `site-assets` storage bucket

## Free deployment stack

Recommended:

- Frontend: Vercel Hobby
- Backend: Supabase Free

## Setup

### 1. Supabase

Create a Supabase project.

Enable/configure:

```txt
Authentication → Providers → Email → Enable Email provider
Authentication → Providers → Email → Confirm email OFF
```

You can leave anonymous sign-ins enabled for older test accounts, but the recommended flow from v5.4 onward is handle + password login. Because members do not provide real email addresses, email confirmation must be OFF.

Then open:

```txt
Supabase → SQL Editor → New Query
```

Paste the full contents of:

```txt
supabase/schema.sql
```

Run it.

### 2. Create your admin/founder invite

Run:

```sql
select public.make_admin_invite();
```

Copy the returned token. It starts with:

```txt
founder-
```

Open your site like this and create the admin with a handle and password:

```txt
https://your-site.vercel.app/?invite=PASTE_TOKEN_HERE
```

The account created with that invite becomes admin. After that, use the Login tab with the same handle and password.

### 3. Configure the frontend

Copy:

```bash
cp .env.example .env.local
```

Fill:

```txt
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY
```

You can find these in:

```txt
Supabase → Project Settings → API
```

### 4. Run locally

```bash
npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
npm run dev
```

### 5. Deploy on Vercel

Push this folder to GitHub, then import it in Vercel.

Use:

```txt
Framework Preset: Vite
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

Add these environment variables in Vercel:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Deploy.

## Updating your existing GitHub repo

From your local project folder:

```powershell
cd "R:\Lyseis\New\olympiacos-anonymous-blog"

Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
npm run build

git status
git add .
git commit -m "Add handle password login"
git push origin main
```

Vercel should redeploy automatically after the push.

## Admin site settings

After you log in as admin, click:

```txt
Site settings
```

From there you can upload a logo/background and edit the wording shown around the site.

Admin uploads are stored in the Supabase bucket:

```txt
site-assets
```

The normal post images bucket remains:

```txt
post-images
```

## Member login

Members join once with an invite token, a handle, and a password. After that, they can use the **Login** tab with only their handle and password.

The app does not ask for a real email. Internally, it creates a private Supabase Auth email from the handle, like `handle@members.thrylos-agora.invalid`, only so Supabase can manage secure password login.

Important: accounts created in old versions with anonymous-only auth cannot be recovered after logout unless the browser still has the old session. Create a new admin invite once, register with handle/password, and use that account going forward.

## Member customization

Each user can open **Your anonymous profile** and change:

- Display name
- Chat colour
- Bio

The chat uses each user's colour for their bubble/avatar so users are visually distinct.

## Voice room

Open the lower-right **Chat** popup, then choose:

```txt
Voice chat
```

Users can join, mute/unmute, and leave. It works best on HTTPS, which Vercel provides automatically.

## Brand assets

You can either upload assets from the admin Site settings page or add static files here:

```txt
public/brand/olympiacos-logo.png
public/brand/olympiacos-hero.jpg
```

Fallback artwork included:

```txt
public/brand/community-crest.svg
public/brand/red-white-hero.svg
```

## Folder structure

```txt
.
├── index.html
├── package.json
├── vercel.json
├── .env.example
├── public/
│   ├── favicon.svg
│   └── brand/
├── src/
│   ├── App.jsx
│   ├── styles.css
│   └── lib/
└── supabase/
    └── schema.sql
```

### Replacing the default logo

Log in with an admin account, click **Site settings**, then use **Site logo → Replace default logo**. Upload a PNG/JPG/WebP/GIF/SVG file, click **Save site settings**, and the new logo will replace the fallback crest across the top bar, invite page, privacy shield, chat/app branding, and browser tab icon. You can also paste a direct logo URL or click **Use default crest** to reset it.

## v5.2 chat and voice update

This version fixes the floating chat layout after switching between Messages and Voice chat. The popup now uses a stable flex layout so the message input and Send button stay aligned at the bottom.

Voice chat additions:

- join with microphone or join as listener
- live room timer
- self mute/unmute
- drop mic and re-enable mic
- automatic live presence/member updates
- the earliest joined member becomes host
- host can make/remove sub-hosts
- host and sub-hosts can allow/take mic rights
- host and sub-hosts can mute a member or mute all
- local browser recording with downloadable `.webm` audio file

The recorder saves locally in the browser of the person who starts the recording. Tell members before recording a call.

## v5.3 voice recording and profile image update

This version improves the live voice room and recording flow:

- microphone capture now requests browser echo cancellation, noise suppression, auto gain control, mono audio, and 48 kHz audio;
- local recordings pass through a browser-side voice chain before recording;
- when recording stops, the app offers both a raw WebM and a cleaned WAV download;
- voice-room members are shown as avatar-only tiles;
- a member avatar lights up when the member is speaking;
- each user can upload a profile image from the profile card and it updates immediately in chat/voice/feed UI;
- profile image changes are also listened for through Supabase Realtime.

Run the full `supabase/schema.sql` again after deploying this update, because this version adds the `profile-images` bucket and makes sure `profiles.avatar_url` exists.

If you have an older noisy `.webm` recording, you can still fix it locally with ffmpeg:

```bash
ffmpeg -i input.webm -af "highpass=f=90,lowpass=f=12000,afftdn=nf=-38,acompressor=threshold=-30dB:ratio=3:attack=5:release=120:makeup=8,dynaudnorm=f=150:g=12:p=0.95,loudnorm=I=-16:TP=-1.5:LRA=11" -ac 1 -ar 48000 output-clean.wav
```

Windows helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\fix-recording.ps1 "C:\Path\to\thrylos-voice.webm"
```


## v5.5 UI polish update

This version adds custom confirmation modals for deleting posts, comments and chat messages, plus a full visual pass for dropdowns, file/image upload controls and action buttons. The delete flow no longer uses the browser default confirm box for moderation actions.

## v5.6 chat rooms and microphone update

This version removes the shared room passphrase flow and replaces it with:

- **General chat** for every registered member.
- **Private messages** by selecting one member.
- **Group chats** by selecting multiple members and optionally adding a room title.
- Live message loading through Supabase Realtime.
- Live typing indicators per selected chat room.
- A microphone input selector in the voice tab.
- A **Refresh mics** button that asks the browser for mic permission and reloads Bluetooth/headset inputs.

Run the full `supabase/schema.sql` again after deploying v5.6 because it adds `chat_threads`, `chat_thread_members`, `chat_messages`, and the `create_chat_thread` RPC.


## v5.7 update

- Chat deletion now updates live for everyone in the selected room.
- Typing indicators are more reliable and clear automatically when a user stops, sends, switches rooms, or closes the popup.
- Voice room presence now sends periodic keep-alive heartbeats, refreshes member state more often, and renegotiates peer audio if a browser temporarily disconnects.
- Mobile and tablet layouts were tightened with a better feed, a safer bottom chat popup, horizontal room picker, and improved touch-sized voice controls.
- Re-run `supabase/schema.sql` once so chat message DELETE events include the old message id/thread id in Realtime.

## v5.8 Port24 editorial layout

This version changes the default identity to **Port24** and adds an editorial sports-blog front page inspired by the logic of RedPointGuard-style sites without copying its design or assets.

Added layout blocks:

- Red Notes numbered latest-post rail
- Latest texts lead story area
- Viewers Top 12-style sidebar list
- Sections/columns navigation
- Media & clips block
- Community strip
- Existing floating chat, private/group rooms, voice chat, admin branding, login and upload features remain in place

Default logo file:

```text
public/brand/port24-logo.png
```

Admins can still replace it from **Site settings**.

## v5.9 Editorial roles and public front page

This version turns Port24 into a more normal editorial blog:

- Guests who open the root URL see the public front page and can read published articles.
- Registered users can still use the member area, chat and voice chat.
- Only users with role `editor`, `moderator`, or `admin` can publish articles.
- Articles have a title, category, excerpt, body, optional cover image, YouTube link, and source link.
- The writer name is shown automatically from the author's display name/profile.
- Categories include Basketball, Football, Ερασιτέχνης, Volleyball, Transfers, Opinion and Media.

After uploading this version, run the full `supabase/schema.sql` again. Then, as admin, promote writers from the Admin panel by setting their role to `editor`.

Guests can enter the member login/join page from the public front page button. Invite links still work with `?invite=TOKEN`.

## v5.9 Editorial article mode

This version turns the site into a public editorial blog with a private member/chat layer.

- Guests can open the front page without logging in and read published articles.
- Articles show title, category, writer name, date, cover image, source link and optional YouTube embed.
- Registered members still use handle/password login and invitation registration.
- Only `editor`, `moderator`, and `admin` roles can publish articles.
- Admins can promote users from **Admin control**: `member`, `editor`, `moderator`, `admin`.
- Categories are: Basketball, Football, Ερασιτέχνης, Volleyball, Transfers, Opinion, Media.
- Chat and voice chat remain available only after login.

Run the full `supabase/schema.sql` after uploading this version because it adds article fields and the new `editor` role.
