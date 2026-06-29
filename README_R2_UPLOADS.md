# Port24 Cloudflare R2 uploads

This update moves image uploads from Supabase Storage to Cloudflare R2 through the Vercel serverless API route at `/api/upload-image`.

## Required Vercel environment variables

Add these in Vercel → Project → Settings → Environment Variables:

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=thrylos-united
R2_PUBLIC_BASE_URL=https://your-public-r2-url-or-media-domain
```

Keep your existing Supabase variables too:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

`R2_PUBLIC_BASE_URL` should not end with `/`.

## What now uploads to R2

- article cover images
- article inline images
- profile avatars
- admin site logo
- admin hero/background image

The app stores the final public R2 URL in Supabase.

## Migration script

Use `tools/migrate-supabase-images-to-r2.mjs` to copy old Supabase Storage images to R2 and update Supabase rows.

Required local environment variables:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$env:R2_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"
$env:R2_ACCESS_KEY_ID="YOUR_R2_ACCESS_KEY_ID"
$env:R2_SECRET_ACCESS_KEY="YOUR_R2_SECRET_ACCESS_KEY"
$env:R2_BUCKET="thrylos-united"
$env:R2_PUBLIC_BASE_URL="https://YOUR_PUBLIC_R2_URL"
```

Run a dry-run first:

```powershell
node .\tools\migrate-supabase-images-to-r2.mjs --dry-run
```

Then run the actual migration:

```powershell
node .\tools\migrate-supabase-images-to-r2.mjs
```

Optional table-only runs:

```powershell
node .\tools\migrate-supabase-images-to-r2.mjs --table=articles
node .\tools\migrate-supabase-images-to-r2.mjs --table=profiles
node .\tools\migrate-supabase-images-to-r2.mjs --table=site_settings
```
