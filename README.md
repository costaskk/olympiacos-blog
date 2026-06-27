# Thrylos Agora

Modern red-white private fan blog with invite-only anonymous registration, member posts, images, news links, YouTube embeds, comments, live group chat, typing indicators, user colour customization, a voice room inside the group chat popup, and admin-controlled site branding.

This project includes original red-white fallback artwork. Official club logos/photos are not bundled. Add only assets you are allowed to use.

## v5 changes

- Fixed the lower-right chat popup alignment so the message input and Send button stay inside the panel.
- Improved the voice tab so members, mute state, joins/leaves and peer connections update live through Supabase Realtime presence/broadcast.
- Added a cleaner modern feed with highlight cards and stronger red-white styling.
- Group chat is now a lower-right popup with two sub-tabs:
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

Enable:

```txt
Authentication → Providers → Anonymous Sign-Ins
```

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

Open your site like this:

```txt
https://your-site.vercel.app/?invite=PASTE_TOKEN_HERE
```

The account created with that invite becomes admin.

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
git commit -m "Polish chat layout voice room and modern blog UI"
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

## Member customization

Each user can open **Your anonymous profile** and change:

- Display name
- Chat colour
- Bio

The group chat uses each user's colour for their bubble/avatar so users are visually distinct.

## Voice room

Open the lower-right **Group chat** popup, then choose:

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
