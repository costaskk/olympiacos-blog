# Thrylos Agora

A clean red-white private fan blog with anonymous invite-only registration, admin/moderator controls, image/news/YouTube posts, comments, one-use invitations, an encrypted browser-side group chat, and a live WebRTC voice room.

This is an independent fan project. It does **not** bundle official Olympiacos logos, club marks, photos, or copyrighted assets. The project includes brand asset slots so you can add official files yourself only if you have the right to use them.

## What it does

- Anonymous registration: normal users join with only an invite link, handle, and display name.
- Dedicated admin/founder setup: create a one-use admin invite from Supabase SQL and register your owner account.
- Admin panel: see recent members, change member/mod/admin roles, delete posts/comments/messages as staff.
- One-use invite system: members can generate unique registration links.
- Blog feed: text posts, news links, images, YouTube embeds, and comments.
- Supabase Storage uploads for images.
- Encrypted group messenger: messages are AES-GCM encrypted in the browser before they are stored.
- Live voice room: WebRTC microphone chat using Supabase Realtime as the free signaling layer.
- Privacy deterrents: blur/shield on tab blur, watermark, disabled right-click, disabled printing.
- Brand slots: drop your allowed logo/background into `public/brand/` and the UI uses them automatically.

## Important security limitations

No normal website can fully stop screenshots. This project can deter casual screenshots by hiding the page when the tab loses focus, disabling printing, adding watermarks, and blocking simple right-click/copy behavior, but it cannot block OS-level screenshots, browser dev tools, another phone camera, modified browsers, or screen recording software.

Anonymous Supabase accounts persist in the browser. If a user signs out, clears browser data, changes device, or loses the browser profile, they can lose that anonymous identity because no email recovery exists.

The group text chat is encrypted only for people who know the shared room passphrase. Share that passphrase manually with trusted members. If someone leaks the passphrase, they can decrypt messages they can access.

The voice chat uses WebRTC media encryption in transit. The free version uses public STUN only, which works for many users but not every strict network. If voice fails for some members, add a TURN provider later.

## Free deployment stack

Recommended:

- Frontend: Vercel Hobby plan
- Backend: Supabase Free plan

Supabase Free is enough for small communities, but large image usage, many realtime chat users, and voice signaling can hit free limits. Keep images optimized.

## Add allowed Olympiacos logo/images

Official assets are not included. If you have permission/right to use them, add these files:

```txt
public/brand/olympiacos-logo.png
public/brand/olympiacos-hero.jpg
```

Recommended:

- `olympiacos-logo.png`: square PNG, 512x512 or larger, transparent background if possible.
- `olympiacos-hero.jpg`: wide stadium/team/fan image, ideally 1920x1080.

After adding them, commit and push again:

```bash
git add public/brand
git commit -m "Add brand assets"
git push
```

If the files are missing, the app falls back to the red-white Θ placeholder.

## Setup

### 1. Create Supabase project

Create a new project in Supabase.

In **Authentication > Providers**, enable **Anonymous Sign-Ins**.

### 2. Install the database schema

Open **Supabase > SQL Editor**, paste the full contents of:

```txt
supabase/schema.sql
```

Run it.

### 3. Create your admin account invite

Run this in Supabase SQL Editor:

```sql
select public.make_admin_invite();
```

Copy the returned token. It starts with `founder-...`.

Open your site with that invite:

```txt
https://your-site.vercel.app/?invite=PASTE_THE_FOUNDER_TOKEN_HERE
```

Choose your anonymous admin handle. The account created from this invite becomes the owner/admin account.

If you already used the first version, the old command still works too:

```sql
select public.make_founder_invite();
```

### 4. Configure the web app

Copy:

```bash
cp .env.example .env.local
```

Fill:

```txt
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY
```

You can find these in **Supabase Project Settings > API**.

### 5. Run locally

```bash
npm install
npm run dev
```

Open the local URL and register using the admin invite token.

### 6. Deploy on Vercel

Option A: GitHub + Vercel

1. Push this folder to your GitHub repository.
2. Import the repository in Vercel.
3. Add these environment variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy.

Option B: Vercel CLI

```bash
npm install -g vercel
vercel
vercel --prod
```

Remember to add the environment variables in the Vercel dashboard.

## How member invites work

1. A registered member opens the invite panel.
2. They click **Create one-use invite**.
3. The app copies a link like:

```txt
https://your-site.vercel.app/?invite=...
```

4. The recipient opens it and picks an anonymous handle.
5. The invite becomes used and cannot be reused.

Normal app-created invites are always `member` invites. Admin/founder invites are created only through Supabase SQL so members cannot accidentally create admin accounts.

## How the admin panel works

When your profile role is `admin`, the left column shows **Admin control**.

You can:

- See latest members.
- Promote a member to moderator.
- Promote another trusted user to admin.
- Demote moderators/admins.
- Delete posts/comments/encrypted message records as staff.

Safety rule: the only admin account cannot demote itself.

## How the encrypted group text chat works

1. Members agree on a shared room passphrase outside the site.
2. They enter it into the chat panel.
3. The browser derives an AES-GCM key from the passphrase using PBKDF2.
4. Only ciphertext, IV, salt, sender ID, and timestamp are stored in Supabase.
5. Supabase admins can see metadata and ciphertext, but not readable chat text unless they know the passphrase.

## How the voice room works

1. Members click **Join voice**.
2. The browser asks for microphone permission.
3. Supabase Realtime is used only for signaling.
4. The actual audio is peer-to-peer WebRTC.
5. Users can mute/unmute and leave.

Voice requires HTTPS in production. Vercel gives HTTPS automatically. Localhost also works for development.

This version is best for a small private group. For a large always-on voice server, later upgrade to LiveKit, Daily, Agora, or another SFU/TURN-based service.

## Recommended production settings

- Keep Supabase RLS enabled.
- Do not expose the service role key in the frontend.
- Keep the Supabase anon key only in `VITE_SUPABASE_ANON_KEY`.
- Do not add official club logos unless you have permission.
- Moderate posts manually if the community grows.
- Use short image sizes to avoid Supabase free storage/egress limits.
- Test voice chat from two different devices after deploying to Vercel.

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
│       ├── README.md
│       ├── olympiacos-logo.png    # add yourself if allowed
│       └── olympiacos-hero.jpg    # add yourself if allowed
├── src/
│   ├── App.jsx
│   ├── styles.css
│   └── lib/
│       ├── crypto.js
│       ├── supabase.js
│       └── youtube.js
└── supabase/
    └── schema.sql
```
