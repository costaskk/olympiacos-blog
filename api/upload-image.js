import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { IncomingForm } from 'formidable';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}

function safePart(value = 'uploads') {
  return String(value)
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 80))
    .filter(Boolean)
    .join('/') || 'uploads';
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function verifySupabaseUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('Missing login token.');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase environment variables on Vercel.');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error('Login session is invalid or expired.');
  return data.user;
}

function parseForm(req) {
  const form = new IncomingForm({
    multiples: false,
    keepExtensions: true,
    maxFileSize: MAX_BYTES,
    allowEmptyFiles: false,
    filter: ({ mimetype }) => ALLOWED_TYPES.has(mimetype || ''),
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const user = await verifySupabaseUser(req);
    const { fields, files } = await parseForm(req);
    const file = first(files.file);
    if (!file) return res.status(400).json({ error: 'No image file was uploaded.' });

    const mimeType = file.mimetype || '';
    if (!ALLOWED_TYPES.has(mimeType)) return res.status(400).json({ error: 'Unsupported image type.' });
    if (file.size > MAX_BYTES) return res.status(400).json({ error: 'Image must be under 12 MB.' });

    const accountId = requiredEnv('R2_ACCOUNT_ID');
    const accessKeyId = requiredEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = requiredEnv('R2_SECRET_ACCESS_KEY');
    const bucket = requiredEnv('R2_BUCKET');
    const publicBaseUrl = requiredEnv('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');

    const folder = safePart(first(fields.folder) || 'uploads');
    const originalName = path.basename(file.originalFilename || 'image').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
    const ext = EXT_BY_TYPE[mimeType] || originalName.split('.').pop() || 'bin';
    const key = `${folder}/${user.id}/${Date.now()}-${randomUUID()}-${originalName || `image.${ext}`}`;

    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(file.filepath),
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    return res.status(200).json({
      url: `${publicBaseUrl}/${key}`,
      key,
      bucket,
    });
  } catch (error) {
    console.error('R2 upload failed:', error);
    return res.status(400).json({ error: error?.message || 'Image upload failed.' });
  }
}
