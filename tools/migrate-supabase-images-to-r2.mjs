import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
];

for (const name of REQUIRED) {
  if (!process.env[name]) {
    console.error(`Missing environment variable: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.R2_BUCKET;
const publicBase = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_TABLE = process.argv.find((arg) => arg.startsWith('--table='))?.split('=')[1] || '';

function isHttp(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function normalizePath(value) {
  return String(value || '').trim().replace(/^\/+/, '');
}

function extFromContentType(contentType = '') {
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('avif')) return 'avif';
  return 'bin';
}

async function objectExists(table, id, column, value) {
  if (!value || isHttp(value)) return false;
  if (table === 'articles' && column === 'extra_images') return Array.isArray(value) && value.length > 0;
  return true;
}

async function downloadSupabaseObject(storageBucket, objectPath) {
  const { data, error } = await supabase.storage.from(storageBucket).download(objectPath);
  if (error) throw error;
  const arrayBuffer = await data.arrayBuffer();
  return {
    body: Buffer.from(arrayBuffer),
    contentType: data.type || 'application/octet-stream',
  };
}

async function uploadBufferToR2(buffer, contentType, key) {
  if (DRY_RUN) return `${publicBase}/${key}`;
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${publicBase}/${key}`;
}

async function migrateOne({ storageBucket, oldPath, targetPrefix }) {
  const cleanPath = normalizePath(oldPath);
  const { body, contentType } = await downloadSupabaseObject(storageBucket, cleanPath);
  const fileName = cleanPath.split('/').pop() || `image.${extFromContentType(contentType)}`;
  const key = `${targetPrefix}/${Date.now()}-${randomUUID()}-${fileName}`.replace(/\/+/g, '/');
  return uploadBufferToR2(body, contentType, key);
}

async function updateRow(table, id, patch) {
  if (DRY_RUN) {
    console.log(`[dry-run] update ${table} ${id}`, patch);
    return;
  }
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) throw error;
}

async function migrateArticles() {
  if (ONLY_TABLE && ONLY_TABLE !== 'articles') return;
  const { data, error } = await supabase.from('articles').select('id, image_path, extra_images');
  if (error) throw error;
  for (const row of data || []) {
    const patch = {};
    if (row.image_path && !isHttp(row.image_path)) {
      console.log(`Migrating article cover: ${row.id}`);
      patch.image_path = await migrateOne({ storageBucket: 'post-images', oldPath: row.image_path, targetPrefix: `articles/${row.id}/cover` });
    }
    if (Array.isArray(row.extra_images)) {
      const next = [];
      let changed = false;
      for (const item of row.extra_images) {
        if (item?.path && !isHttp(item.path)) {
          console.log(`Migrating article inline image: ${row.id}`);
          next.push({ ...item, path: await migrateOne({ storageBucket: 'post-images', oldPath: item.path, targetPrefix: `articles/${row.id}/inline` }) });
          changed = true;
        } else {
          next.push(item);
        }
      }
      if (changed) patch.extra_images = next;
    }
    if (Object.keys(patch).length) await updateRow('articles', row.id, patch);
  }
}

async function migrateProfiles() {
  if (ONLY_TABLE && ONLY_TABLE !== 'profiles') return;
  const { data, error } = await supabase.from('profiles').select('id, avatar_url');
  if (error) throw error;
  for (const row of data || []) {
    if (row.avatar_url && !isHttp(row.avatar_url)) {
      console.log(`Migrating avatar: ${row.id}`);
      const avatar_url = await migrateOne({ storageBucket: 'profile-images', oldPath: row.avatar_url, targetPrefix: `avatars/${row.id}` });
      await updateRow('profiles', row.id, { avatar_url });
    }
  }
}

async function migrateSiteSettings() {
  if (ONLY_TABLE && ONLY_TABLE !== 'site_settings') return;
  const { data, error } = await supabase.from('site_settings').select('key, value').in('key', ['logo_url', 'hero_url']);
  if (error) throw error;
  for (const row of data || []) {
    if (row.value && !isHttp(row.value)) {
      console.log(`Migrating site setting: ${row.key}`);
      const value = await migrateOne({ storageBucket: 'site-assets', oldPath: row.value, targetPrefix: `branding/${row.key}` });
      if (!DRY_RUN) {
        const { error: updateError } = await supabase.from('site_settings').update({ value }).eq('key', row.key);
        if (updateError) throw updateError;
      } else {
        console.log(`[dry-run] update site_settings ${row.key}`, value);
      }
    }
  }
}

try {
  await migrateArticles();
  await migrateProfiles();
  await migrateSiteSettings();
  console.log(DRY_RUN ? 'Dry run finished.' : 'Migration finished.');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
