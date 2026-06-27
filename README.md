# Thrylos Agora

A clean red-white private fan blog with anonymous invite-only registration, image/news/YouTube posts, comments, one-use invitations, and an encrypted browser-side group chat.

This is an independent fan project. It does not include official Olympiacos logos, club marks, or copyrighted assets.

## What it does

- Anonymous registration: users join with only an invite link, handle, and display name.
- One-use invite system: members can generate unique registration links.
- Blog feed: text posts, news links, images, YouTube embeds, and comments.
- Supabase Storage uploads for images.
- Encrypted group messenger: messages are AES-GCM encrypted in the browser before they are stored.
- Privacy deterrents: blur/shield on tab blur, watermark, disabled right-click, disabled printing.

## Important security limitations

No normal website can fully stop screenshots. This project can deter casual screenshots by hiding the page when the tab loses focus, disabling printing, adding watermarks, and blocking simple right-click/copy behavior, but it cannot block OS-level screenshots, browser dev tools, another phone camera, modified browsers, or screen recording software.

Anonymous Supabase accounts persist in the browser. If a user signs out, clears browser data, changes device, or loses the browser profile, they can lose that anonymous identity because no email recovery exists.

The group chat is encrypted only for people who know the shared room passphrase. Share that passphrase manually with trusted members. If someone leaks the passphrase, they can decrypt messages they can access.

## Free deployment stack

Recommended:

- Frontend: Vercel Hobby plan
- Backend: Supabase Free plan

Supabase Free is enough for small communities, but large image usage and heavy realtime chat can hit free limits. Keep images optimized.

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

Then run this in the SQL Editor:

```sql
select public.make_founder_invite();
```

Copy the returned token. It is your first one-use founder invite. The first account that accepts it becomes the admin/founder.

### 3. Configure the web app

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

### 4. Run locally

```bash
npm install
npm run dev
```

Open the local URL and register using the founder invite token.

### 5. Deploy on Vercel

Option A: GitHub + Vercel

1. Push this folder to a private GitHub repository.
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

## How the encrypted group chat works

1. Members agree on a shared room passphrase outside the site.
2. They enter it into the chat panel.
3. The browser derives an AES-GCM key from the passphrase using PBKDF2.
4. Only ciphertext, IV, salt, sender ID, and timestamp are stored in Supabase.
5. Supabase admins can see metadata and ciphertext, but not readable chat text unless they know the passphrase.

## Recommended production settings

- Keep Supabase RLS enabled.
- Do not expose the service role key in the frontend.
- Keep the Supabase anon key only in `VITE_SUPABASE_ANON_KEY`.
- Do not add official club logos unless you have permission.
- Moderate posts manually if the community grows.
- Use short image sizes to avoid Supabase free storage/egress limits.

## Folder structure

```txt
.
├── index.html
├── package.json
├── vercel.json
├── .env.example
├── public/
│   └── favicon.svg
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
