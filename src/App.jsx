import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, isConfigured } from './lib/supabase.js';
import { getYoutubeId, isSafeUrl } from './lib/youtube.js';
import './styles.css';

const BUCKET = 'post-images';
const SITE_ASSETS_BUCKET = 'site-assets';
const PROFILE_IMAGES_BUCKET = 'profile-images';
const APP_NAME = 'Thrylos United';
const MAIN_CREST_LOGO = '/brand/thrylos-united-crest-2026-transparent.png';
const BRAND_LOGO_CANDIDATES = [MAIN_CREST_LOGO, '/brand/thrylos-united-crest-2026.png', '/brand/thrylos-united-horizontal-2026.png', '/brand/port24-logo.png', '/brand/olympiacos-logo.png', '/brand/community-crest.svg'];
const BRAND_HERO = '/brand/red-white-hero.svg';
const MAGAZINE_LOGO = MAIN_CREST_LOGO;
const MAGAZINE_HERO = '/brand/thrylos-red-stand-hero.svg';
const OFFICIAL_HERO = '/brand/olympiacos-hero.jpg';
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const MIC_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};

function micConstraintsForDevice(deviceId = '') {
  const constraints = { ...MIC_CONSTRAINTS };
  if (deviceId) constraints.deviceId = { exact: deviceId };
  return constraints;
}

function friendlyMicError(error) {
  const name = error?.name || '';
  const message = error?.message || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission is blocked. Allow the microphone from the browser address-bar/site settings and Windows microphone privacy settings.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone input was found. In Windows Sound settings, make sure your Bluetooth headset mic is connected as an input device, then press Refresh mics.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The microphone is busy or could not start. Close Discord/Steam/other voice apps, reconnect the headset, then try again.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'That microphone could not be opened with the selected settings. Choose System default or press Refresh mics.';
  }
  return message || 'Microphone permission failed. Check browser and Windows microphone settings.';
}


const DEFAULT_SITE_SETTINGS = {
  site_title: 'Thrylos United',
  tagline: 'Ολυμπιακός blog με υπογραφή.',
  header_tagline: 'Independent red-white blog & community',
  gate_heading: 'The private red-white blog for matchday, news and member opinions.',
  gate_intro: 'Read columns, publish reactions, share images and YouTube clips, follow matchday notes, and keep live talk inside general, private and group rooms.',
  feed_eyebrow: 'THRYLOS UNITED · RED-WHITE COMMUNITY',
  feed_heading: 'Latest texts, red notes, opinions and member posts.',
  feed_intro: 'An editorial-style members area inspired by modern sports blogs: featured notes, latest texts, columns, media posts, member rooms and live voice.',
  community_title: 'Thrylos United community hub',
  community_text: 'A clean private board for general Olympiakos discussion, matchday reactions, news links, columns, media and live rooms.',
  footer_text: 'Thrylos United · independent red-white community.',
  logo_url: '',
  hero_url: '',
};


function cleanBrandText(value, fallback = '') {
  const raw = String(value ?? fallback ?? '');
  return raw
    .replace(/PORT\s*24/gi, 'Thrylos United')
    .replace(/Port24/gi, 'Thrylos United')
    .replace(/PORT24/g, 'THRYLOS UNITED');
}

function cleanPublicEyebrow(value) {
  const cleaned = cleanBrandText(value || 'THRYLOS UNITED').trim();
  return cleaned || 'THRYLOS UNITED';
}

const CHAT_COLORS = ['#e31b2f', '#ffffff', '#ffb703', '#2dd4bf', '#60a5fa', '#c084fc', '#fb7185', '#34d399'];
const AUTH_EMAIL_DOMAIN = 'members.port24.invalid';
const ARTICLE_CATEGORIES = [
  { id: 'all', label: 'Όλα' },
  { id: 'basketball', label: 'Μπάσκετ' },
  { id: 'football', label: 'Ποδόσφαιρο' },
  { id: 'erasitexnhs', label: 'Ερασιτέχνης' },
  { id: 'transfers', label: 'Μεταγραφές' },
  { id: 'opinion', label: 'Απόψεις' },
  { id: 'media', label: 'Media' },
];
const ERASITEXNHS_SUBCATEGORIES = [
  'volleyball',
  'polo',
  'water_polo',
  'handball',
  'women_basketball',
  'womens_basketball',
  'women_football',
  'womens_football',
  'women_polo',
  'womens_polo',
  'women_water_polo',
  'womens_water_polo',
  'women_volleyball',
  'womens_volleyball',
];
function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('el-GR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}



const ATHENS_TZ = 'Europe/Athens';

function getTimeZoneOffsetMs(date, timeZone = ATHENS_TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function athensLocalInputToIso(value = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, ATHENS_TZ);
  return new Date(utcGuess.getTime() - offset).toISOString();
}

function isoToAthensLocalInput(value) {
  if (!value) return defaultAthensScheduleInput(1);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return defaultAthensScheduleInput(1);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATHENS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function defaultAthensScheduleInput(hoursAhead = 1) {
  return isoToAthensLocalInput(new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString());
}

function athensFormat(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('el-GR', {
    timeZone: ATHENS_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function articleStatus(article) {
  const raw = String(article?.status || 'published').toLowerCase();
  if (raw === 'hidden' || raw === 'draft') return raw;
  if (!article?.published_at) return raw === 'scheduled' ? 'scheduled' : 'published';
  const publishTime = new Date(article.published_at).getTime();
  if (Number.isNaN(publishTime)) return raw === 'scheduled' ? 'scheduled' : 'published';
  if (publishTime > Date.now()) return 'scheduled';
  return raw === 'hidden' || raw === 'draft' ? raw : 'published';
}

function articleIsPublic(article) {
  if (!article) return false;
  return articleStatus(article) === 'published';
}

function articleStatusLabel(article) {
  const status = articleStatus(article);
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'hidden') return 'Hidden';
  if (status === 'draft') return 'Draft';
  return 'Published';
}

function timeUntilLabel(value) {
  const diff = new Date(value).getTime() - Date.now();
  if (!value || Number.isNaN(diff)) return '';
  if (diff <= 0) return 'public now';
  const totalSeconds = Math.ceil(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function PublishCountdown({ value, onDone }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!value) return undefined;
    const diff = new Date(value).getTime() - now;
    if (diff <= 0) onDone?.();
    return undefined;
  }, [now, onDone, value]);
  return <span className="countdown-chip">Public in {timeUntilLabel(value)}</span>;
}

function firstInlineImageUrl(article) {
  const images = safeJsonArray(article?.extra_images);
  const first = images.find((item) => item?.url || item?.path);
  if (!first) return '';
  return first.url || first.path || '';
}

function articleCoverUrl(article, fallback = '') {
  const raw = article?.image_path || article?.image_url || firstInlineImageUrl(article) || '';
  if (!raw) return fallback || '';
  if (typeof raw === 'object') return articleCoverUrl({ image_path: raw.url || raw.path }, fallback);
  const value = String(raw).trim();
  if (!value || value === 'null' || value === 'undefined') return fallback || '';
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  return publicAssetUrl(BUCKET, value);
}

function nextScheduledTimeFromArticles(items = []) {
  const now = Date.now();
  const times = items
    .filter((article) => String(article?.status || '').toLowerCase() === 'scheduled')
    .map((article) => new Date(article.published_at).getTime())
    .filter((time) => Number.isFinite(time) && time > now)
    .sort((a, b) => a - b);
  return times[0] || null;
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeHandle(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

function memberLoginEmail(handle = '') {
  return `${normalizeHandle(handle)}@${AUTH_EMAIL_DOMAIN}`;
}

function friendlyAuthError(error) {
  const message = error?.message || String(error || '');
  if (/invalid login credentials/i.test(message)) return 'Wrong handle or password.';
  if (/email.*confirm|confirm.*email|not confirmed/i.test(message)) {
    return 'Supabase email confirmations are enabled. Disable email confirmations for this private app, then try again.';
  }
  if (/password/i.test(message) && /six|6|weak|short/i.test(message)) return 'Password must be at least 6 characters.';
  return message || 'Authentication failed.';
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
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function navigateTo(url) {
  document.body.classList.add('page-is-leaving');
  window.setTimeout(() => {
    window.location.assign(url);
  }, 90);
}

function preloadImage(url) {
  if (!url || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}

function allowCopyTarget(target) {
  return Boolean(target?.closest?.('input, textarea, [contenteditable="true"], .copy-allowed'));
}

async function uploadImageFile(file, folder = 'articles') {
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are allowed.');
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult?.data?.session?.access_token || '';
  if (!token) throw new Error('Your login session expired. Please log in again.');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  const response = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Cloudflare upload failed with HTTP ${response.status}`);
  }
  if (!payload?.url) throw new Error('Cloudflare upload did not return an image URL.');
  return payload.url;
}

function profileAvatarUrl(profile) {
  return publicAssetUrl(PROFILE_IMAGES_BUCKET, profile?.avatar_url || '');
}

function getInitials(name = '?') {
  const clean = String(name || '?').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return clean.slice(0, 1).toUpperCase();
}

function UserAvatar({ profile, name, color, className = '', title = '' }) {
  const displayName = name || displayUser(profile);
  const src = profileAvatarUrl(profile) || profile?.avatar_url || '';
  const safeColor = color || userColor(profile);
  return (
    <span className={`user-avatar ${className}`.trim()} style={{ '--member-color': safeColor, background: safeColor }} title={title || displayName}>
      {src ? <img src={src} alt={displayName} loading="lazy" decoding="async" /> : <span>{getInitials(displayName)}</span>}
    </span>
  );
}


function ConfirmModal({ open, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', eyebrow = 'MODERATION ACTION', mark = '!', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel?.(); }}>
      <section className={`confirm-modal ${tone}`} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div className="modal-mark" aria-hidden="true">{mark}</div>
        <div className="modal-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h2 id="confirm-modal-title">{title}</h2>
          <p>{body}</p>
        </div>
        <div className="modal-actions">
          <button className="ghost-btn" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className="danger-btn modal-confirm-btn" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function createVoiceProcessingChain(audioContext, source, destination) {
  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 90;

  const lowpass = audioContext.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 12000;

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -32;
  compressor.knee.value = 24;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  const gain = audioContext.createGain();
  gain.gain.value = 1.65;

  source.connect(highpass);
  highpass.connect(compressor);
  compressor.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(destination);
  return { highpass, compressor, lowpass, gain };
}

function startVoiceMeter(stream, onLevel) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !stream) return () => null;
  const context = new AudioContextClass();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.42;
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let raf = 0;
  let lastSpeaking = false;
  let lastSent = 0;
  const tick = () => {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const speaking = rms > 0.018;
    const now = Date.now();
    if (speaking !== lastSpeaking || now - lastSent > 900) {
      lastSpeaking = speaking;
      lastSent = now;
      onLevel?.(speaking, rms);
    }
    raf = window.requestAnimationFrame(tick);
  };
  tick();
  return () => {
    if (raf) window.cancelAnimationFrame(raf);
    source.disconnect();
    analyser.disconnect();
    context.close().catch(() => null);
  };
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function createCleanWavFromRecording(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !blob?.size) throw new Error('Audio cleanup is not supported in this browser.');
  const context = new AudioContextClass();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) mono[i] += data[i] / audioBuffer.numberOfChannels;
  }
  await context.close().catch(() => null);

  const frameSize = Math.max(160, Math.floor(sampleRate * 0.02));
  const rmsValues = [];
  for (let i = 0; i < mono.length; i += frameSize) {
    let sum = 0;
    const end = Math.min(mono.length, i + frameSize);
    for (let j = i; j < end; j += 1) sum += mono[j] * mono[j];
    rmsValues.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  const sorted = [...rmsValues].sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.22)] || 0.002;
  const threshold = Math.max(0.004, noise * 2.6);
  let envelope = 0;
  let peak = 0;
  let rmsSum = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const target = Math.abs(mono[i]) > threshold ? 1 : 0.12;
    envelope += (target - envelope) * (target > envelope ? 0.08 : 0.006);
    mono[i] *= envelope;
    peak = Math.max(peak, Math.abs(mono[i]));
    rmsSum += mono[i] * mono[i];
  }
  const currentRms = Math.sqrt(rmsSum / Math.max(1, mono.length));
  const rmsGain = currentRms > 0 ? 0.125 / currentRms : 1;
  const peakGain = peak > 0 ? 0.92 / peak : 1;
  const gain = Math.min(18, rmsGain, peakGain);
  for (let i = 0; i < mono.length; i += 1) mono[i] = Math.max(-0.98, Math.min(0.98, mono[i] * gain));
  return encodeWav(mono, sampleRate);
}

function applyDocumentBranding(settings = DEFAULT_SITE_SETTINGS) {
  const title = cleanBrandText(settings.site_title, APP_NAME);
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
  if (role === 'editor') return 'Writer';
  return 'Member';
}

function isStaff(role) {
  return role === 'admin' || role === 'moderator';
}

function canPublishArticles(role) {
  return role === 'admin' || role === 'moderator' || role === 'editor';
}

function stripGreekTonos(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC');
}

function appCaps(value = '') {
  return stripGreekTonos(value).toLocaleUpperCase('el-GR');
}

function canonicalArticleCategory(category = '') {
  const normalized = String(category || '').trim().toLowerCase();
  if (ERASITEXNHS_SUBCATEGORIES.includes(normalized)) return 'erasitexnhs';
  return normalized || 'all';
}

function categoryLabel(category) {
  const normalized = canonicalArticleCategory(category);
  return ARTICLE_CATEGORIES.find((item) => item.id === normalized)?.label || 'Γενικά';
}

function categoryCaps(category) {
  return appCaps(categoryLabel(category));
}

function articleCategoryFilterValues(category = '') {
  const normalized = canonicalArticleCategory(category);
  if (normalized === 'all') return [];
  if (normalized === 'erasitexnhs') return ['erasitexnhs', ...ERASITEXNHS_SUBCATEGORIES];
  return [normalized];
}

function applyArticleCategoryFilter(query, category = '') {
  const values = articleCategoryFilterValues(category);
  if (!values.length) return query;
  return values.length === 1 ? query.eq('category', values[0]) : query.in('category', values);
}

function normalizeArticleTextValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((item) => normalizeArticleTextValue(item)).filter(Boolean).join('\n\n');
  }
  if (typeof value === 'object') {
    const priority = ['content', 'body', 'text', 'article_text', 'article_body', 'body_text', 'description', 'summary'];
    return priority.map((key) => normalizeArticleTextValue(value[key])).filter(Boolean).join('\n\n');
  }
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function articleBodyText(article = {}) {
  const candidates = [
    article?.content,
    article?.body,
    article?.text,
    article?.article_text,
    article?.article_body,
    article?.body_text,
    article?.main_text,
    article?.full_text,
    article?.description,
    article?.summary,
  ];
  for (const candidate of candidates) {
    const text = normalizeArticleTextValue(candidate);
    if (text) return text;
  }
  return normalizeArticleTextValue(article?.excerpt || '');
}

function magazineCaps(value = '') {
  return appCaps(String(value || ''));
}


function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeParagraphs(value = '') {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseMediaLinks(value = '') {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(isSafeUrl)
    .slice(0, 12);
}

function getSpotifyEmbedUrl(url = '') {
  if (!isSafeUrl(url) || !/spotify\.com/i.test(url)) return '';
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const typeIndex = parts.findIndex((part) => ['track', 'album', 'playlist', 'episode', 'show'].includes(part));
    if (typeIndex === -1 || !parts[typeIndex + 1]) return '';
    return `https://open.spotify.com/embed/${parts[typeIndex]}/${parts[typeIndex + 1]}`;
  } catch {
    return '';
  }
}

function MediaEmbed({ url }) {
  const youtubeId = getYoutubeId(url);
  const spotifyUrl = getSpotifyEmbedUrl(url);
  if (youtubeId) {
    return <div className="video-frame"><iframe title="YouTube video" src={`https://www.youtube-nocookie.com/embed/${youtubeId}`} allowFullScreen /></div>;
  }
  if (spotifyUrl) {
    return <div className="spotify-frame"><iframe title="Spotify embed" src={spotifyUrl} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" /></div>;
  }
  if (isSafeUrl(url)) {
    return <a className="source-link media-link-card" href={url} target="_blank" rel="noreferrer">Άνοιγμα media link</a>;
  }
  return null;
}

function ArticleInlineFigure({ item, index }) {
  const src = item?.url || publicAssetUrl(BUCKET, item?.path);
  if (!src) return null;
  return (
    <figure className="article-inline-figure" key={`${src}-${index}`}>
      <img src={src} alt={item.caption || `Article image ${index + 1}`} loading="lazy" decoding="async" />
      {(item.caption || item.source_url) && (
        <figcaption>
          {item.caption && <span>{item.caption}</span>}
          {item.source_url && isSafeUrl(item.source_url) && <a href={item.source_url} target="_blank" rel="noreferrer">πηγή εικόνας</a>}
        </figcaption>
      )}
    </figure>
  );
}

function normalizeImagePlacement(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function ArticleContentWithImages({ content = '', images = [], fallbackText = '' }) {
  const paragraphs = normalizeParagraphs(content || fallbackText);
  const imageItems = safeJsonArray(images).filter((item) => item?.path || item?.url);
  const placed = new Set();

  return (
    <div className="article-reader-content article-page-body">
      {imageItems.map((item, imageIndex) => {
        const position = normalizeImagePlacement(item.after_paragraph, null);
        if (position === 0) {
          placed.add(imageIndex);
          return <ArticleInlineFigure key={`before-${imageIndex}`} item={item} index={imageIndex} />;
        }
        return null;
      })}

      {paragraphs.map((paragraph, paragraphIndex) => (
        <React.Fragment key={`paragraph-${paragraphIndex}`}>
          <p>{paragraph}</p>
          {imageItems.map((item, imageIndex) => {
            const fallbackPosition = Math.min(paragraphs.length || 1, imageIndex + 1);
            const position = normalizeImagePlacement(item.after_paragraph, fallbackPosition);
            if (position === paragraphIndex + 1) {
              placed.add(imageIndex);
              return <ArticleInlineFigure key={`after-${paragraphIndex}-${imageIndex}`} item={item} index={imageIndex} />;
            }
            return null;
          })}
        </React.Fragment>
      ))}

      {imageItems.map((item, imageIndex) => {
        const position = normalizeImagePlacement(item.after_paragraph, Math.min(paragraphs.length || 1, imageIndex + 1));
        if (!placed.has(imageIndex) || position > paragraphs.length) {
          placed.add(imageIndex);
          return <ArticleInlineFigure key={`end-${imageIndex}`} item={item} index={imageIndex} />;
        }
        return null;
      })}
    </div>
  );
}

function ArticleMediaGallery({ images = [] }) {
  return <ArticleContentWithImages images={images} />;
}

function ArticleSources({ article }) {
  const notes = String(article?.source_notes || '').trim();
  const articleSource = article?.source_url;
  const imageSource = article?.image_source_url;
  if (!notes && !articleSource && !imageSource) return null;
  return (
    <div className="article-sources-box">
      <strong>Πηγές / credits</strong>
      {articleSource && isSafeUrl(articleSource) && <a href={articleSource} target="_blank" rel="noreferrer">Πηγή άρθρου</a>}
      {imageSource && isSafeUrl(imageSource) && <a href={imageSource} target="_blank" rel="noreferrer">Πηγή κεντρικής εικόνας</a>}
      {notes && <p>{notes}</p>}
    </div>
  );
}

function ArticlePreviewCard({ draft, profile }) {
  const media = parseMediaLinks(draft.mediaLinks || draft.video_url || '');
  const images = safeJsonArray(draft.extra_images);
  const cover = draft.cover_preview || draft.image_url || '';
  return (
    <article className="article-page-card glass-card live-preview-card">
      {cover && <img className="article-page-cover image-fade-in" src={cover} alt="Article cover preview" loading="eager" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
      <div className="article-page-content">
        <span className="kind-pill">{categoryCaps(draft.category)}</span>
        <h1>{draft.title || 'Τίτλος άρθρου'}</h1>
        <div className="article-byline article-page-byline">
          <UserAvatar profile={profile} className="comment-avatar" />
          <span>Γράφει: <strong>{displayUser(profile)}</strong> · preview</span>
        </div>
        {draft.excerpt && <p className="article-page-excerpt">{draft.excerpt}</p>}
        <ArticleContentWithImages
          content={draft.content}
          images={images}
          fallbackText="Το κείμενο του άρθρου θα εμφανίζεται εδώ. Κάθε αλλαγή γραμμής γίνεται ξεχωριστή παράγραφος."
        />
        {media.map((url, index) => <MediaEmbed key={`${url}-${index}`} url={url} />)}
        <ArticleSources article={draft} />
      </div>
    </article>
  );
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
        loading="eager"
        decoding="async"
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
            <strong>{cleanBrandText(settings.site_title, APP_NAME)}</strong>
            <small>{cleanBrandText(settings.tagline, DEFAULT_SITE_SETTINGS.tagline)}</small>
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

function InviteGate({ onProfileReady, settings = DEFAULT_SITE_SETTINGS, session = null }) {
  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get('invite') ? 'register' : 'login');
  const [invite, setInvite] = useState(new URLSearchParams(window.location.search).get('invite') || '');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notice, setNotice] = useState('');

  async function readProfileForUser(userId) {
    const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (profileError || !data) throw new Error('This login does not have a finished profile yet. Open the Join with invite tab and finish the invite setup.');
    return data;
  }

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const cleanHandle = normalizeHandle(handle);
      if (cleanHandle.length < 3) throw new Error('Handle must be at least 3 characters.');
      if (password.length < 6) throw new Error('Password must be at least 6 characters.');

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: memberLoginEmail(cleanHandle),
        password,
      });
      if (authError) throw new Error(friendlyAuthError(authError));
      if (!data?.user) throw new Error('Login failed. Try again.');

      const profileData = await readProfileForUser(data.user.id);
      onProfileReady(profileData);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function register(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const cleanHandle = normalizeHandle(handle);
      const cleanInvite = invite.trim();
      if (cleanHandle.length < 3) throw new Error('Handle must be at least 3 characters.');
      if (password.length < 6) throw new Error('Password must be at least 6 characters.');

      let activeUser = session?.user || null;

      if (activeUser && !activeUser.email) {
        throw new Error('This browser is still signed in with an older anonymous session. Sign out first, then create the new login-enabled account with your invite.');
      }

      if (!activeUser) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: memberLoginEmail(cleanHandle),
          password,
          options: {
            data: {
              handle: cleanHandle,
              display_name: displayName.trim() || cleanHandle,
            },
          },
        });

        if (signUpError) throw new Error(friendlyAuthError(signUpError));

        if (!signUpData?.session?.user) {
          throw new Error('Account was created but no session was returned. In Supabase, disable email confirmation for this private app, then use Login with the same handle and password.');
        }

        activeUser = signUpData.session.user;
      }

      const { data, error: rpcError } = await supabase.rpc('accept_invite', {
        raw_token: cleanInvite,
        chosen_handle: cleanHandle,
        chosen_display_name: displayName.trim() || cleanHandle,
      });
      if (rpcError) throw rpcError;
      onProfileReady(data);
      setNotice('Account created. From now on, log in with your handle and password.');
    } catch (err) {
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
            <strong>{cleanBrandText(settings.site_title, APP_NAME)}</strong>
            <small>{cleanBrandText(settings.tagline, DEFAULT_SITE_SETTINGS.tagline)}</small>
          </div>
        </div>
        <h1>{settings.gate_heading}</h1>
        <p>{settings.gate_intro}</p>
        <div className="hero-grid">
          <span>One-use invite links</span>
          <span>Handle + password login</span>
          <span>Live general chat</span>
          <span>Private & group rooms</span>
        </div>
      </section>

      <section className="gate-card glass-card">
        <div className="gate-tabs" role="tablist" aria-label="Member access">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>Login</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setNotice(''); }}>Join with invite</button>
        </div>

        <div className="gate-public-return">
          <button type="button" className="ghost-btn compact" onClick={() => navigateTo('/')}>← Back to public front page</button>
        </div>

        {mode === 'login' ? (
          <form className="gate-form" onSubmit={login}>
            <h2>Login</h2>
            <p className="gate-intro-text">Use the handle and password you chose when you joined with an invite.</p>
            <label>
              Handle
              <input
                value={handle}
                onChange={(e) => setHandle(normalizeHandle(e.target.value))}
                placeholder="costaskk"
                minLength={3}
                maxLength={24}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your private password"
                type="password"
                minLength={6}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <div className="error-box">{error}</div>}
            {notice && <div className="success-box">{notice}</div>}
            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? 'Logging in…' : 'Login'}
            </button>
            <p className="tiny-note">No real email is needed. The app uses a private internal login address behind the scenes.</p>
          </form>
        ) : (
          <form className="gate-form" onSubmit={register}>
            <h2>Enter with invite</h2>
            {session?.user && !session.user.email && (
              <div className="warning-box">You are currently using an older anonymous browser session. To create a login-enabled account, sign out first, then join with an invite using a handle and password.</div>
            )}
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
                onChange={(e) => setHandle(normalizeHandle(e.target.value))}
                placeholder="gate7_anon"
                minLength={3}
                maxLength={24}
                autoComplete="username"
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
            <label>
              Login password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                type="password"
                minLength={6}
                autoComplete="new-password"
                required
              />
            </label>
            {error && <div className="error-box">{error}</div>}
            {notice && <div className="success-box">{notice}</div>}
            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? 'Creating account…' : 'Join privately'}
            </button>
            <p className="tiny-note">After joining once, use the Login tab with the same handle and password. Invites remain one-use only.</p>
          </form>
        )}
      </section>
    </main>
  );
}

function PageLoadingBar({ active }) {
  return active ? <div className="page-loading-bar" aria-hidden="true" /> : null;
}

function Shell({ profile, setProfile, settings = DEFAULT_SITE_SETTINGS, view, setView, children }) {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const shellPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const inEditorStudio = shellPath === '/editor' || shellPath === '/login';

  async function signOut() {
    await supabase.auth.signOut();
    setLogoutOpen(false);
    setProfile(null);
    window.history.replaceState({}, '', '/');
  }

  return (
    <div className="app-shell copy-protected">
      <ConfirmModal
        open={logoutOpen}
        eyebrow="ACCOUNT SESSION"
        mark="↪"
        tone="neutral"
        title="Sign out of Thrylos United?"
        body="You will return to the public front page. You can log back in from the hidden editor page using your handle and password."
        confirmLabel="Sign out"
        cancelLabel="Stay logged in"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={signOut}
      />
      <header className="topbar">
        <div className="brand-lockup">
          <BrandMark settings={settings} />
          <div>
            <strong>{cleanBrandText(settings.site_title, APP_NAME)}</strong>
            <small>{cleanBrandText(settings.header_tagline, DEFAULT_SITE_SETTINGS.header_tagline)}</small>
          </div>
        </div>
        <div className="user-chip">
          <span className="status-dot" />
          <span>{displayUser(profile)}</span>
          <em>{roleBadge(profile?.role)}</em>
          <button
            type="button"
            className="ghost-btn compact"
            onClick={() => navigateTo(inEditorStudio ? '/' : '/editor')}
          >
            {inEditorStudio ? 'Public page' : 'Editor'}
          </button>
          {profile?.role === 'admin' && (
            <button type="button" className="ghost-btn compact" onClick={() => setView(view === 'admin-site' ? 'feed' : 'admin-site')}>
              {view === 'admin-site' ? 'Blog' : 'Site settings'}
            </button>
          )}
          <button type="button" className="ghost-btn compact" onClick={() => setLogoutOpen(true)}>Sign out</button>
        </div>
      </header>
      {children}
    </div>
  );
}

function Composer({ profile, onCreated, editingArticle = null, onCancelEdit }) {
  const allowed = canPublishArticles(profile?.role);
  const isEditing = Boolean(editingArticle?.id);
  const canEditThis = isEditing ? (profile?.role === 'admin' || editingArticle.author_id === profile?.id) : allowed;
  const [title, setTitle] = useState(editingArticle?.title || '');
  const [category, setCategory] = useState(editingArticle?.category || 'basketball');
  const [excerpt, setExcerpt] = useState(editingArticle?.excerpt || '');
  const [content, setContent] = useState(editingArticle?.content || '');
  const [mediaLinks, setMediaLinks] = useState([editingArticle?.video_url, ...safeJsonArray(editingArticle?.media_urls)].filter(Boolean).join('\n'));
  const [sourceUrl, setSourceUrl] = useState(editingArticle?.source_url || '');
  const [sourceNotes, setSourceNotes] = useState(editingArticle?.source_notes || '');
  const [imageSourceUrl, setImageSourceUrl] = useState(editingArticle?.image_source_url || '');
  const [coverImage, setCoverImage] = useState(null);
  const [existingCoverUrl, setExistingCoverUrl] = useState(editingArticle?.image_path || '');
  const [existingInlineImages, setExistingInlineImages] = useState(safeJsonArray(editingArticle?.extra_images));
  const [inlineImages, setInlineImages] = useState([]);
  const [mainImageChoice, setMainImageChoice] = useState(editingArticle?.image_path ? 'existing-cover' : 'cover');
  const [publishMode, setPublishMode] = useState(() => {
    const status = articleStatus(editingArticle);
    if (status === 'scheduled') return 'schedule';
    if (status === 'hidden' || status === 'draft') return 'hidden';
    return 'now';
  });
  const [scheduledAt, setScheduledAt] = useState(() => (editingArticle?.published_at ? isoToAthensLocalInput(editingArticle.published_at) : defaultAthensScheduleInput(1)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const coverPreview = useMemo(() => (coverImage ? URL.createObjectURL(coverImage) : ''), [coverImage]);
  const inlinePreviews = useMemo(() => inlineImages.map((item) => ({ ...item, preview: URL.createObjectURL(item.file) })), [inlineImages]);

  useEffect(() => () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    inlinePreviews.forEach((item) => item.preview && URL.revokeObjectURL(item.preview));
  }, [coverPreview, inlinePreviews]);

  if (!allowed && !isEditing) {
    return (
      <section className="composer glass-card editor-locked-card">
        <span className="eyebrow">READING MODE</span>
        <h2>Πρόσβαση ανάγνωσης</h2>
        <p>Μπορείς να διαβάζεις και να συμμετέχεις στην κοινότητα. Η δημοσίευση άρθρων ενεργοποιείται από τη διαχείριση.</p>
      </section>
    );
  }

  if (!canEditThis) {
    return (
      <section className="composer glass-card editor-locked-card">
        <span className="eyebrow">NO ACCESS</span>
        <h2>This article cannot be edited from this account.</h2>
        <p>Editors can edit only their own articles. Admin can edit every article.</p>
      </section>
    );
  }

  function updateInlineImage(index, patch) {
    setInlineImages((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateExistingInlineImage(index, patch) {
    setExistingInlineImages((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function removeInlineImage(index) {
    setInlineImages((items) => items.filter((_, itemIndex) => itemIndex !== index));
    if (mainImageChoice === `inline-${index}`) setMainImageChoice(coverImage ? 'cover' : (existingCoverUrl ? 'existing-cover' : ''));
  }

  function removeExistingInlineImage(index) {
    setExistingInlineImages((items) => items.filter((_, itemIndex) => itemIndex !== index));
    if (mainImageChoice === `existing-inline-${index}`) setMainImageChoice(existingCoverUrl ? 'existing-cover' : (coverImage ? 'cover' : ''));
  }

  function addInlineImages(files) {
    const maxLeft = 12 - inlineImages.length - existingInlineImages.length;
    const picked = Array.from(files || [])
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, Math.max(0, maxLeft))
      .map((file) => ({ file, caption: '', source_url: '', after_paragraph: Math.max(1, normalizeParagraphs(content).length || 1) }));
    if (picked.length) setInlineImages((items) => [...items, ...picked]);
  }

  async function uploadArticleImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Only image uploads are allowed.');
    if (file.size > 12 * 1024 * 1024) throw new Error('Each image must be under 12 MB.');
    return uploadImageFile(file, `articles/${profile.id}`);
  }

  function computePublishFields() {
    if (publishMode === 'hidden') return { status: 'hidden', published_at: null };
    if (publishMode === 'schedule') {
      const iso = athensLocalInputToIso(scheduledAt);
      if (!iso) throw new Error('Add a valid Athens publish date and time.');
      if (new Date(iso).getTime() <= Date.now() - 60000) throw new Error('Scheduled publish time must be in the future.');
      return { status: 'scheduled', published_at: iso };
    }
    return { status: 'published', published_at: new Date().toISOString() };
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      if (!profile?.id) throw new Error('Your session is not ready. Refresh and log in again.');
      if (!canPublishArticles(profile?.role)) throw new Error('This account does not have writer access. Ask an admin to promote it to Writer.');
      if (isEditing && profile?.role !== 'admin' && editingArticle.author_id !== profile.id) throw new Error('Editors can edit only their own articles.');
      if (!title.trim()) throw new Error('Add an article title.');
      if (!content.trim()) throw new Error('Write the article body first.');
      if (sourceUrl.trim() && !isSafeUrl(sourceUrl.trim())) throw new Error('Article source URL must start with http:// or https://');
      if (imageSourceUrl.trim() && !isSafeUrl(imageSourceUrl.trim())) throw new Error('Image source URL must start with http:// or https://');
      const media = parseMediaLinks(mediaLinks);
      if (mediaLinks.trim() && media.length === 0) throw new Error('Add valid YouTube/Spotify/media links, one per line.');
      [...existingInlineImages, ...inlineImages].forEach((item, index) => {
        if (item.source_url?.trim() && !isSafeUrl(item.source_url.trim())) throw new Error(`Inline image ${index + 1} source URL must start with http:// or https://`);
      });

      const uploadedInline = existingInlineImages.map((item, index) => ({
        path: item.path || item.url || '',
        caption: item.caption?.trim() || '',
        source_url: item.source_url?.trim() || '',
        after_paragraph: normalizeImagePlacement(item.after_paragraph, index + 1),
      })).filter((item) => item.path);

      for (const item of inlineImages) {
        const path = await uploadArticleImage(item.file);
        uploadedInline.push({
          path,
          caption: item.caption?.trim() || '',
          source_url: item.source_url?.trim() || '',
          after_paragraph: normalizeImagePlacement(item.after_paragraph, uploadedInline.length + 1),
        });
      }

      let uploadedCover = null;
      if (coverImage) uploadedCover = await uploadArticleImage(coverImage);

      let mainImagePath = uploadedCover || (mainImageChoice === 'existing-cover' ? existingCoverUrl : null);
      if (mainImageChoice.startsWith('existing-inline-')) {
        const index = Number(mainImageChoice.replace('existing-inline-', ''));
        if (existingInlineImages[index]?.path || existingInlineImages[index]?.url) mainImagePath = existingInlineImages[index].path || existingInlineImages[index].url;
      }
      if (mainImageChoice.startsWith('inline-')) {
        const index = Number(mainImageChoice.replace('inline-', ''));
        const existingCount = existingInlineImages.length;
        if (uploadedInline[existingCount + index]?.path) mainImagePath = uploadedInline[existingCount + index].path;
      }
      if (!mainImagePath && uploadedInline[0]?.path) mainImagePath = uploadedInline[0].path;

      const cleanExcerpt = excerpt.trim() || content.trim().replace(/\s+/g, ' ').slice(0, 220);
      const cleanedContent = content.trim().replace(/\r\n/g, '\n');
      const publishFields = computePublishFields();
      const record = {
        title: title.trim(),
        category,
        excerpt: cleanExcerpt,
        content: cleanedContent,
        image_path: mainImagePath || null,
        video_url: media[0] || null,
        source_url: sourceUrl.trim() || null,
        media_urls: media,
        extra_images: uploadedInline,
        image_source_url: imageSourceUrl.trim() || null,
        source_notes: sourceNotes.trim() || null,
        status: publishFields.status,
        published_at: publishFields.published_at,
        updated_at: new Date().toISOString(),
      };

      if (isEditing) {
        const { error: updateError } = await supabase.from('articles').update(record).eq('id', editingArticle.id);
        if (updateError) throw new Error(`${updateError.message}. Run the latest supabase/schema.sql in Supabase SQL Editor, then try again.`);
      } else {
        const { error: insertError } = await supabase.from('articles').insert({ ...record, author_id: profile.id });
        if (insertError) throw new Error(`${insertError.message}. Run the latest supabase/schema.sql in Supabase SQL Editor, then try again.`);
      }

      if (!isEditing) {
        setTitle('');
        setCategory('basketball');
        setExcerpt('');
        setContent('');
        setMediaLinks('');
        setSourceUrl('');
        setSourceNotes('');
        setImageSourceUrl('');
        setCoverImage(null);
        setExistingCoverUrl('');
        setExistingInlineImages([]);
        setInlineImages([]);
        setMainImageChoice('cover');
        setPublishMode('now');
        setScheduledAt(defaultAthensScheduleInput(1));
      }
      const statusMessage = publishFields.status === 'scheduled'
        ? `Article saved. It will become public on ${athensFormat(publishFields.published_at)} Athens time.`
        : publishFields.status === 'hidden'
          ? 'Article saved as hidden. It remains visible only inside the editor list.'
          : 'Article published. It is now visible on the public front page.';
      setSuccess(isEditing ? `Article updated. ${statusMessage}` : statusMessage);
      onCreated?.();
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      setError(err.message || 'Could not save article');
    } finally {
      setBusy(false);
    }
  }

  const paragraphCount = Math.max(1, normalizeParagraphs(content).length);
  const allInlinePreviewItems = [
    ...existingInlineImages.map((item) => ({ ...item, preview: publicAssetUrl(BUCKET, item.path || item.url) })),
    ...inlinePreviews,
  ];

  const previewDraft = {
    title,
    category,
    excerpt,
    content,
    mediaLinks,
    source_url: sourceUrl,
    image_source_url: imageSourceUrl,
    source_notes: sourceNotes,
    cover_preview: mainImageChoice === 'existing-cover'
      ? publicAssetUrl(BUCKET, existingCoverUrl)
      : mainImageChoice.startsWith('existing-inline-')
        ? publicAssetUrl(BUCKET, existingInlineImages[Number(mainImageChoice.replace('existing-inline-', ''))]?.path || existingInlineImages[Number(mainImageChoice.replace('existing-inline-', ''))]?.url)
        : mainImageChoice.startsWith('inline-')
          ? inlinePreviews[Number(mainImageChoice.replace('inline-', ''))]?.preview
          : coverPreview,
    extra_images: allInlinePreviewItems.map((item, index) => ({ url: item.preview || publicAssetUrl(BUCKET, item.path || item.url), caption: item.caption, source_url: item.source_url, after_paragraph: normalizeImagePlacement(item.after_paragraph, index + 1) })),
    status: publishMode === 'hidden' ? 'hidden' : publishMode === 'schedule' ? 'scheduled' : 'published',
    published_at: publishMode === 'schedule' ? athensLocalInputToIso(scheduledAt) : null,
  };

  return (
    <section className="studio-composer-shell">
      <form className="composer glass-card article-composer pro-article-composer" onSubmit={submit}>
        <div className="composer-head pro-composer-head">
          <div>
            <span className="eyebrow">THRYLOS UNITED STUDIO</span>
            <h2>{isEditing ? 'Edit article' : 'New article'}</h2>
            <p>{isEditing ? 'Update the text, media, visibility and publishing time.' : 'Write long-form posts with a cover image, inline media, sources and live preview before publishing.'}</p>
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {ARTICLE_CATEGORIES.filter((item) => item.id !== 'all').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>

        <div className="article-editor-grid">
          <div className="article-editor-main">
            <label>
              Article title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Π.χ. Η επόμενη μέρα του Ολυμπιακού" maxLength={180} required />
            </label>
            <label>
              Short intro / excerpt
              <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="A short summary for the front page…" rows={3} maxLength={420} />
            </label>
            <label className="body-writer-label">
              Full article body
              <textarea
                className="article-body-writer"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write the full article here. Every line break becomes a new paragraph on the site."
                rows={30}
                maxLength={100000}
                required
              />
            </label>
          </div>

          <aside className="article-editor-side glass-card">
            <span className="eyebrow">VISIBILITY</span>
            <div className="publish-options">
              <label className={publishMode === 'now' ? 'active' : ''}>
                <input type="radio" checked={publishMode === 'now'} onChange={() => setPublishMode('now')} />
                <span><strong>Publish now</strong><small>Visible immediately on the public page.</small></span>
              </label>
              <label className={publishMode === 'schedule' ? 'active' : ''}>
                <input type="radio" checked={publishMode === 'schedule'} onChange={() => setPublishMode('schedule')} />
                <span><strong>Schedule</strong><small>Choose Athens date and time.</small></span>
              </label>
              <label className={publishMode === 'hidden' ? 'active' : ''}>
                <input type="radio" checked={publishMode === 'hidden'} onChange={() => setPublishMode('hidden')} />
                <span><strong>Hide from public</strong><small>Keep it in the editor list only.</small></span>
              </label>
            </div>
            {publishMode === 'schedule' && (
              <label>
                Athens publish time
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                <small className="field-help">This time is interpreted as Athens, Greece time.</small>
              </label>
            )}

            <span className="eyebrow">MEDIA</span>
            <label className="upload-label pro-upload-label">
              <span>Main/cover image</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { setCoverImage(e.target.files?.[0] || null); setMainImageChoice('cover'); }} />
              <em>{coverImage ? coverImage.name : existingCoverUrl ? 'Current cover image is active. Upload to replace it.' : 'Upload the main article image'}</em>
            </label>
            <label>
              Main image source / credit URL
              <input value={imageSourceUrl} onChange={(e) => setImageSourceUrl(e.target.value)} placeholder="https://..." />
            </label>

            <div className="main-image-picker">
              <strong>Main article image</strong>
              {existingCoverUrl && <label><input type="radio" checked={mainImageChoice === 'existing-cover'} onChange={() => setMainImageChoice('existing-cover')} /> Keep current cover</label>}
              {coverImage && <label><input type="radio" checked={mainImageChoice === 'cover'} onChange={() => setMainImageChoice('cover')} /> Use new cover image</label>}
              {existingInlineImages.map((item, index) => (
                <label key={`existing-main-${index}`}><input type="radio" checked={mainImageChoice === `existing-inline-${index}`} onChange={() => setMainImageChoice(`existing-inline-${index}`)} /> Use saved inline image {index + 1}</label>
              ))}
              {inlinePreviews.map((item, index) => (
                <label key={`new-main-${index}`}><input type="radio" checked={mainImageChoice === `inline-${index}`} onChange={() => setMainImageChoice(`inline-${index}`)} /> Use new inline image {index + 1}</label>
              ))}
              {!existingCoverUrl && !coverImage && existingInlineImages.length === 0 && inlinePreviews.length === 0 && <small>No image uploaded yet.</small>}
            </div>

            <label className="upload-label pro-upload-label">
              <span>Inline article images</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(e) => addInlineImages(e.target.files)} />
              <em>Add more images for the article body/gallery</em>
            </label>
            {(existingInlineImages.length > 0 || inlinePreviews.length > 0) && (
              <div className="inline-image-list">
                {existingInlineImages.map((item, index) => (
                  <div className="inline-image-editor" key={`existing-${item.path || item.url}-${index}`}>
                    <img src={publicAssetUrl(BUCKET, item.path || item.url)} alt="Saved inline preview" loading="lazy" decoding="async" />
                    <input value={item.caption || ''} onChange={(e) => updateExistingInlineImage(index, { caption: e.target.value })} placeholder="Italic caption under this image" />
                    <input value={item.source_url || ''} onChange={(e) => updateExistingInlineImage(index, { source_url: e.target.value })} placeholder="Image source URL" />
                    <label className="inline-placement-control">
                      Show image after paragraph
                      <select value={String(normalizeImagePlacement(item.after_paragraph, index + 1))} onChange={(e) => updateExistingInlineImage(index, { after_paragraph: Number(e.target.value) })}>
                        <option value="0">Before the first paragraph</option>
                        {Array.from({ length: paragraphCount }, (_, paragraphIndex) => (
                          <option key={paragraphIndex + 1} value={paragraphIndex + 1}>After paragraph {paragraphIndex + 1}</option>
                        ))}
                        <option value={paragraphCount + 1}>After the article text</option>
                      </select>
                    </label>
                    <button type="button" className="ghost-btn compact" onClick={() => removeExistingInlineImage(index)}>Remove</button>
                  </div>
                ))}
                {inlinePreviews.map((item, index) => (
                  <div className="inline-image-editor" key={`${item.file.name}-${index}`}>
                    <img src={item.preview} alt="Inline preview" loading="lazy" decoding="async" />
                    <input value={item.caption} onChange={(e) => updateInlineImage(index, { caption: e.target.value })} placeholder="Italic caption under this image" />
                    <input value={item.source_url} onChange={(e) => updateInlineImage(index, { source_url: e.target.value })} placeholder="Image source URL" />
                    <label className="inline-placement-control">
                      Show image after paragraph
                      <select value={String(normalizeImagePlacement(item.after_paragraph, index + 1))} onChange={(e) => updateInlineImage(index, { after_paragraph: Number(e.target.value) })}>
                        <option value="0">Before the first paragraph</option>
                        {Array.from({ length: paragraphCount }, (_, paragraphIndex) => (
                          <option key={paragraphIndex + 1} value={paragraphIndex + 1}>After paragraph {paragraphIndex + 1}</option>
                        ))}
                        <option value={paragraphCount + 1}>After the article text</option>
                      </select>
                    </label>
                    <button type="button" className="ghost-btn compact" onClick={() => removeInlineImage(index)}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            <label>
              YouTube / Spotify / media embeds
              <textarea value={mediaLinks} onChange={(e) => setMediaLinks(e.target.value)} placeholder="One link per line. YouTube and Spotify embed automatically." rows={5} />
            </label>
            <label>
              Article source URL
              <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
            </label>
            <label>
              Extra source notes / credits
              <textarea value={sourceNotes} onChange={(e) => setSourceNotes(e.target.value)} placeholder="Optional credits, references, image notes…" rows={4} maxLength={2000} />
            </label>
          </aside>
        </div>

        {error && <div className="error-box">{error}</div>}
        {success && <div className="success-box">{success}</div>}
        <div className="editor-form-actions">
          {isEditing && <button className="ghost-btn" type="button" onClick={onCancelEdit}>Cancel edit</button>}
          <button className="primary-btn publish-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : isEditing ? 'Save changes' : publishMode === 'schedule' ? 'Schedule article' : publishMode === 'hidden' ? 'Save hidden article' : 'Publish article'}</button>
        </div>
      </form>

      <section className="live-preview-section">
        <div className="preview-heading">
          <span className="eyebrow">LIVE PREVIEW</span>
          <h2>How it will appear</h2>
          {publishMode === 'schedule' && <p>Scheduled for {scheduledAt ? `${scheduledAt.replace('T', ' ')} Athens time` : 'a future Athens time'}.</p>}
          {publishMode === 'hidden' && <p>This article is hidden from public pages until you publish or schedule it.</p>}
        </div>
        <ArticlePreviewCard draft={previewDraft} profile={profile} />
      </section>
    </section>
  );
}


function PostCard({ post, profile, onChanged }) {
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const author = post.profiles;
  const youtubeId = getYoutubeId(post.video_url);
  const canDelete = profile && (post.author_id === profile.id || isStaff(profile.role));
  const imageUrl = useMemo(() => {
    if (!post.image_path) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(post.image_path).data.publicUrl;
  }, [post.image_path]);

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(handle, display_name, role, chat_color, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments(data || []);
  }, [post.id]);

  useEffect(() => {
    loadComments();
    const channel = supabase
      .channel(`comments-${post.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${post.id}` }, loadComments)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadComments)
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

  function deletePost() {
    setDeleteTarget({
      kind: 'post',
      title: 'Delete this post?',
      body: 'This removes the post from the members feed. Comments attached to it will no longer be visible.',
      confirmLabel: 'Delete post',
    });
  }

  function deleteComment(commentId) {
    setDeleteTarget({
      kind: 'comment',
      commentId,
      title: 'Delete this comment?',
      body: 'This comment will be removed from the discussion thread for every member.',
      confirmLabel: 'Delete comment',
    });
  }

  async function confirmDeleteTarget() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    if (target.kind === 'post') {
      const { error } = await supabase.from('posts').delete().eq('id', post.id);
      if (error) alert(error.message);
      onChanged?.();
      return;
    }
    if (target.kind === 'comment') {
      const { error } = await supabase.from('comments').delete().eq('id', target.commentId);
      if (error) alert(error.message);
      loadComments();
    }
  }

  return (
    <article className="post-card glass-card">
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteTarget?.title}
        body={deleteTarget?.body}
        confirmLabel={deleteTarget?.confirmLabel}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteTarget}
      />
      <header className="post-header">
        <div className="post-author-lockup">
          <UserAvatar profile={author} className="post-avatar" />
          <div>
            <strong>{displayUser(author)}</strong>
            <small>@{author?.handle || 'anon'} · {formatTime(post.published_at || post.created_at)}</small>
          </div>
        </div>
        <div className="post-actions">
          <span className={`kind-pill ${post.category || post.kind}`}>{categoryCaps(post.category)}</span>
          {canDelete && <button className="danger-mini-btn" type="button" onClick={deletePost}>Delete</button>}
        </div>
      </header>

      {post.category && <span className="article-category-pill">{categoryCaps(post.category)}</span>}
      {post.title && <h2 className="article-title">{post.title}</h2>}
      {post.excerpt && <p className="article-excerpt">{post.excerpt}</p>}
      <p className="post-content">{post.content}</p>

      {imageUrl && <img className="post-image image-fade-in" src={imageUrl} alt="Post upload" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}

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
                <span className="comment-author">
                  <UserAvatar profile={comment.profiles} className="comment-avatar" />
                  <strong>{displayUser(comment.profiles)}</strong>
                </span>
                {canDeleteComment && <button className="danger-mini-btn" type="button" onClick={() => deleteComment(comment.id)}>Delete</button>}
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
        <span className="eyebrow">{cleanPublicEyebrow(settings.feed_eyebrow)}</span>
        <h1>{cleanBrandText(settings.feed_heading, DEFAULT_SITE_SETTINGS.feed_heading)}</h1>
        <p>{cleanBrandText(settings.feed_intro, DEFAULT_SITE_SETTINGS.feed_intro)}</p>
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
        <p>Use the feed for longer thoughts and the popup chat for instant red-white talk.</p>
      </article>
      <article className="highlight-card glass-card">
        <span className="highlight-kicker">MEDIA</span>
        <strong>Images & YouTube</strong>
        <p>Upload pictures, embed clips, and keep source links attached to news posts.</p>
      </article>
      <article className="highlight-card glass-card">
        <span className="highlight-kicker">ROOM</span>
        <strong>Chat & voice</strong>
        <p>The lower-right chat updates live, supports private rooms, and includes a voice tab.</p>
      </article>
      <article className="highlight-card glass-card member-highlight" style={{ '--member-color': userColor(profile) }}>
        <span className="highlight-kicker">YOU</span>
        <strong>{displayUser(profile)}</strong>
        <p>Your name, colour and profile image are shown across chat and voice.</p>
      </article>
    </section>
  );
}


function editorialTitle(text = '') {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'Untitled member post';
  return clean.length > 88 ? `${clean.slice(0, 88).trim()}…` : clean;
}

function sectionLabel(kind = 'article', category = '') {
  if (category) return categoryLabel(category);
  if (kind === 'news') return 'News';
  if (kind === 'video') return 'Video';
  if (kind === 'image') return 'Media';
  return 'Article';
}

function sectionCaps(kind = 'article', category = '') {
  if (category) return categoryCaps(category);
  return appCaps(sectionLabel(kind, category));
}

function EditorialBoard({ posts, profile, settings = DEFAULT_SITE_SETTINGS, onFilter }) {
  const redNotes = posts.slice(0, 12);
  const latest = posts.slice(0, 6);
  const media = posts.filter((post) => post.kind === 'image' || post.kind === 'video').slice(0, 4);
  const columns = posts.filter((post) => post.kind === 'post' || post.kind === 'news').slice(0, 5);
  const top = posts.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 12);

  return (
    <section className="editorial-board">
      <div className="red-notes-panel glass-card">
        <div className="panel-title-row">
          <span className="eyebrow">RED NOTES</span>
          <button type="button" className="mini-link-btn" onClick={() => onFilter?.('all')}>All posts</button>
        </div>
        <ol className="red-notes-list">
          {redNotes.length === 0 && <li><span>01</span><strong>No notes yet.</strong><em>Publish the first one.</em></li>}
          {redNotes.map((post, index) => (
            <li key={post.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{(post.title || editorialTitle(post.content))}</strong>
              <em>{formatTime(post.published_at || post.created_at)}</em>
            </li>
          ))}
        </ol>
      </div>

      <div className="editorial-main glass-card">
        <div className="panel-title-row">
          <span className="eyebrow">ΤΕΛΕΥΤΑΙΑ ΚΕΙΜΕΝΑ</span>
          <span className="section-count">{latest.length} latest</span>
        </div>
        <div className="lead-story">
          {latest[0] ? (
            <>
              <span className={`kind-pill ${latest[0].kind}`}>{sectionCaps(latest[0].kind, latest[0].category)}</span>
              <h2>{editorialTitle(latest[0].content)}</h2>
              <p>{String(latest[0].content || '').slice(0, 220)}{String(latest[0].content || '').length > 220 ? '…' : ''}</p>
              <small>{displayUser(latest[0].profiles)} · {formatTime(latest[0].created_at)}</small>
            </>
          ) : (
            <>
              <span className="kind-pill">Start</span>
              <h2>Build the first front-page story.</h2>
              <p>Use the composer below to publish the first Thrylos United text, news item, image or video.</p>
            </>
          )}
        </div>
        <div className="latest-story-grid">
          {latest.slice(1).map((post) => (
            <article key={post.id} className="latest-story-card">
              <span>{sectionLabel(post.kind, post.category)}</span>
              <strong>{(post.title || editorialTitle(post.content))}</strong>
              <small>{displayUser(post.profiles)} · {formatTime(post.published_at || post.created_at)}</small>
            </article>
          ))}
        </div>
      </div>

      <aside className="editorial-side">
        <div className="glass-card side-rank-card">
          <div className="panel-title-row"><span className="eyebrow">VIEWERS TOP 12</span></div>
          <ol>
            {top.map((post, index) => (
              <li key={post.id}><span>{index + 1}</span><strong>{(post.title || editorialTitle(post.content))}</strong></li>
            ))}
            {top.length === 0 && <li><span>1</span><strong>No entries yet</strong></li>}
          </ol>
        </div>
        <div className="glass-card side-sections-card">
          <div className="panel-title-row"><span className="eyebrow">ΣΤΗΛΕΣ</span></div>
          <button type="button" onClick={() => onFilter?.('basketball')}>Basketball</button>
          <button type="button" onClick={() => onFilter?.('football')}>Football</button>
          <button type="button" onClick={() => onFilter?.('erasitexnhs')}>Ερασιτέχνης</button>
          <button type="button" onClick={() => onFilter?.('transfers')}>Transfers</button>
        </div>
      </aside>

      <div className="editorial-strip glass-card">
        <div>
          <span className="eyebrow">COMMUNITY</span>
          <strong>{cleanBrandText(settings.community_title, DEFAULT_SITE_SETTINGS.community_title)}</strong>
          <p>{cleanBrandText(settings.community_text, DEFAULT_SITE_SETTINGS.community_text)}</p>
        </div>
        <div className="strip-actions">
          <button type="button" className="ghost-btn compact" onClick={() => onFilter?.('all')}>Latest feed</button>
          <button type="button" className="ghost-btn compact" onClick={() => onFilter?.('video')}>Videos</button>
        </div>
      </div>

      {media.length > 0 && (
        <div className="editorial-media glass-card">
          <div className="panel-title-row"><span className="eyebrow">MEDIA & CLIPS</span></div>
          <div className="media-mini-grid">
            {media.map((post) => (
              <article key={post.id}>
                <span>{sectionLabel(post.kind, post.category)}</span>
                <strong>{(post.title || editorialTitle(post.content))}</strong>
              </article>
            ))}
          </div>
        </div>
      )}

      {columns.length > 0 && (
        <div className="editorial-columns glass-card">
          <div className="panel-title-row"><span className="eyebrow">COLUMNS</span></div>
          <div className="column-link-grid">
            {columns.map((post) => (
              <article key={post.id}>
                <strong>{(post.title || editorialTitle(post.content))}</strong>
                <small>{displayUser(post.profiles)} · {formatTime(post.published_at || post.created_at)}</small>
              </article>
            ))}
          </div>
        </div>
      )}
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
      <span className="typing-mini-stack" aria-hidden="true">
        {people.slice(0, 4).map((person, index) => (
          <i key={`${person.name || 'member'}-${index}`} style={{ '--member-color': person.color || '#e31b2f' }} />
        ))}
      </span>
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
      .select('*, profiles(handle, display_name, role, chat_color, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter !== 'all') query = query.eq('category', filter);
    const { data, error } = await query;
    if (!error) setPosts(data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadPosts();
    const channel = supabase
      .channel('posts-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, loadPosts)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadPosts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadPosts]);

  return (
    <section className="feed-column">
      <FeedHero profile={profile} settings={settings} />
      <EditorialBoard posts={posts} profile={profile} settings={settings} onFilter={setFilter} />
      <HomeHighlights profile={profile} />
      {canPublishArticles(profile?.role) ? <Composer profile={profile} onCreated={loadPosts} /> : <div className="glass-card editor-note"><span className="eyebrow">READING MODE</span><strong>Έχεις πρόσβαση ανάγνωσης.</strong><p>Η δημοσίευση άρθρων ενεργοποιείται από τη διαχείριση.</p></div>}
      <div className="feed-toolbar glass-card">
        <strong>{filter === 'all' ? 'Latest feed' : `Latest ${filter}`}</strong>
        <div className="filter-tabs">
          {['all', ...ARTICLE_CATEGORIES.filter((item) => item.id !== 'all').map((item) => item.id)].map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'Όλα' : categoryLabel(item)}</button>
          ))}
        </div>
      </div>
      {loading && <div className="glass-card loading-card">Loading posts…</div>}
      {!loading && posts.length === 0 && <div className="glass-card loading-card">Δεν υπάρχουν ακόμα άρθρα.</div>}
      {posts.map((post) => <PostCard key={post.id} post={post} profile={profile} onChanged={loadPosts} />)}
    </section>
  );
}


function PublicArticleCard({ post, onOpen }) {
  const author = post.profiles;
  const imageUrl = articleCoverUrl(post, '');
  return (
    <article className="public-article-card glass-card" onClick={() => onOpen?.(post)} role="button" tabIndex={0}>
      {imageUrl && <img src={imageUrl} alt="Article cover" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
      <div className="public-article-body">
        <span className="kind-pill">{categoryCaps(post.category)}</span>
        <h2>{post.title || editorialTitle(articleBodyText(post))}</h2>
        <p>{post.excerpt || String(post.content || '').slice(0, 210)}</p>
        <small>Γράφει: {displayUser(author)} · {formatTime(post.published_at || post.created_at)}</small>
      </div>
    </article>
  );
}

function PublicArticleListItem({ post, onOpen }) {
  const author = post.profiles;
  const imageUrl = articleCoverUrl(post, '');
  return (
    <article className="public-article-list-item glass-card" onClick={() => onOpen?.(post)} role="button" tabIndex={0}>
      {imageUrl ? (
        <img src={imageUrl} alt="Article cover" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      ) : (
        <div className="article-list-image-fallback" aria-hidden="true">THRYLOS</div>
      )}
      <div className="article-list-copy">
        <h2>{post.title || editorialTitle(articleBodyText(post))}</h2>
        <p>{post.excerpt || String(post.content || '').replace(/\s+/g, ' ').slice(0, 260)}</p>
        <div className="article-list-footer">
          <small>Γράφει: <strong>{displayUser(author)}</strong> · {formatTime(post.published_at || post.created_at)}</small>
          <span className="kind-pill article-list-category">{categoryCaps(post.category)}</span>
        </div>
      </div>
    </article>
  );
}


function MagazineLogo({ settings = DEFAULT_SITE_SETTINGS }) {
  return (
    <img
      className="magazine-brand-logo"
      src={MAGAZINE_LOGO}
      alt={`${cleanBrandText(settings.site_title, APP_NAME)} logo`}
      loading="eager"
      decoding="async"
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = settings?.logo_url || BRAND_LOGO_CANDIDATES[0];
      }}
    />
  );
}

function PublicMagazineLatestItem({ post, onOpen }) {
  const thumb = articleCoverUrl(post, '');
  return (
    <button className="magazine-latest-item" type="button" onClick={() => onOpen?.(post)}>
      {thumb ? (
        <img src={thumb} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      ) : (
        <span className="magazine-thumb-fallback" aria-hidden="true">TU</span>
      )}
      <span>
        <em>{categoryCaps(post.category)}</em>
        <strong>{post.title || editorialTitle(articleBodyText(post))}</strong>
        <small>{formatTime(post.published_at || post.created_at)}</small>
      </span>
    </button>
  );
}

function PublicMagazineArticleCard({ post, onOpen }) {
  const author = post.profiles;
  const imageUrl = articleCoverUrl(post, '');
  return (
    <article className="magazine-article-card" onClick={() => onOpen?.(post)} role="button" tabIndex={0}>
      {imageUrl ? (
        <img src={imageUrl} alt="Article cover" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      ) : (
        <div className="magazine-card-fallback" aria-hidden="true"><span>THRYLOS</span></div>
      )}
      <div className="magazine-article-copy">
        <span className="magazine-small-category">{categoryCaps(post.category)}</span>
        <h3>{post.title || editorialTitle(articleBodyText(post))}</h3>
        <p>{post.excerpt || String(articleBodyText(post) || '').replace(/\s+/g, ' ').slice(0, 170)}</p>
        <small>{formatTime(post.published_at || post.created_at)} · Γράφει {displayUser(author)}</small>
      </div>
    </article>
  );
}

function PublicMagazinePage({ settings = DEFAULT_SITE_SETTINGS, profile = null }) {
  const [articles, setArticles] = useState([]);
  const [category, setCategory] = useState('all');
  const [activeSlide, setActiveSlide] = useState(0);
  const [nextScheduledPublicAt, setNextScheduledPublicAt] = useState(null);

  const openArticle = useCallback((article) => {
    if (!article?.id) return;
    navigateTo(`/v2/article/${article.id}`);
  }, []);

  const loadArticles = useCallback(async () => {
    const nowIso = new Date().toISOString();
    let query = supabase
      .from('articles')
      .select('*, profiles(handle, display_name, role, chat_color, avatar_url)')
      .in('status', ['published', 'scheduled'])
      .lte('published_at', nowIso)
      .order('published_at', { ascending: false })
      .limit(80);
    query = applyArticleCategoryFilter(query, category);
    const { data } = await query;
    setArticles((data || []).filter(articleIsPublic));
    setActiveSlide(0);

    let upcomingQuery = supabase
      .from('articles')
      .select('id,published_at,status,category')
      .eq('status', 'scheduled')
      .gt('published_at', nowIso)
      .order('published_at', { ascending: true })
      .limit(1);
    upcomingQuery = applyArticleCategoryFilter(upcomingQuery, category);
    const { data: upcoming } = await upcomingQuery;
    setNextScheduledPublicAt(upcoming?.[0]?.published_at || null);
  }, [category]);

  useEffect(() => {
    loadArticles();
    const channel = supabase
      .channel('public-magazine-articles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, loadArticles)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadArticles)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadArticles]);

  useEffect(() => {
    if (!nextScheduledPublicAt) return undefined;
    const delay = Math.max(500, new Date(nextScheduledPublicAt).getTime() - Date.now() + 1100);
    const timer = window.setTimeout(loadArticles, delay);
    return () => window.clearTimeout(timer);
  }, [loadArticles, nextScheduledPublicAt]);

  const featured = useMemo(() => articles.slice(0, 5), [articles]);
  const current = featured[activeSlide] || featured[0] || articles[0] || null;
  const latest = useMemo(() => articles.slice(0, 8), [articles]);
  const featuredCount = featured.length;
  const goToSlide = useCallback((direction) => {
    setActiveSlide((value) => {
      if (featuredCount <= 1) return 0;
      return (value + direction + featuredCount) % featuredCount;
    });
  }, [featuredCount]);
  const allArticleList = [...articles].sort((a, b) => {
    const aTime = new Date(a?.published_at || a?.created_at || 0).getTime() || 0;
    const bTime = new Date(b?.published_at || b?.created_at || 0).getTime() || 0;
    return bTime - aTime;
  });

  useEffect(() => {
    if (featuredCount <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((value) => (value + 1) % featuredCount);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [featuredCount]);

  const currentImage = articleCoverUrl(current, settings.hero_url || MAGAZINE_HERO);

  useEffect(() => {
    preloadImage(currentImage);
    featured.slice(0, 3).forEach((item) => {
      if (articleCoverUrl(item)) preloadImage(articleCoverUrl(item));
    });
  }, [currentImage, featured]);

  return (
    <main className="magazine-page-shell">
      <header className="magazine-top-strip">
        <nav aria-label="Quick links">
          <button type="button" onClick={() => navigateTo('/')}>{appCaps('Κλασική έκδοση')}</button>
          <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Σύνδεση')}</button>
          <button type="button" onClick={() => navigateTo('/editor')}>CHAT</button>
          <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Φωνητικά δωμάτια')}</button>
          <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Γίνε μέλος')}</button>
        </nav>
        <div className="magazine-socials" aria-label="Social links">
          <span>𝕏</span><span>◎</span><span>▶</span><span>♪</span>
          {profile ? <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Ο λογαριασμός μου')}</button> : <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Μέλος')}</button>}
        </div>
      </header>

      <section className="magazine-hero-brand" style={{ '--magazine-hero': `url(${settings.hero_url || MAGAZINE_HERO})` }}>
        <div className="magazine-brand-block">
          <MagazineLogo settings={settings} />
          <div>
            <h1>{cleanBrandText(settings.site_title, APP_NAME)}</h1>
            <p>{appCaps('Η κοινότητα του Θρύλου')}</p>
          </div>
        </div>
      </section>

      <nav className="magazine-category-nav" aria-label="Article categories">
        <button className={category === 'all' ? 'active' : ''} type="button" onClick={() => setCategory('all')} aria-label="All articles">⌂</button>
        {ARTICLE_CATEGORIES.filter((item) => item.id !== 'all').map((item) => (
          <button key={item.id} className={category === item.id ? 'active' : ''} type="button" onClick={() => setCategory(item.id)}>
            {categoryCaps(item.id)}
          </button>
        ))}
        <button type="button" className="magazine-search-button" aria-label="Search">⌕</button>
      </nav>

      {current && (
        <section className="magazine-feature-grid">
          <article className="magazine-feature-card" style={{ '--feature-image': `url(${currentImage})` }}>
            {featuredCount > 1 && (
              <>
                <button className="magazine-arrow left" type="button" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); goToSlide(-1); }} aria-label="Previous article">‹</button>
                <button className="magazine-arrow right" type="button" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); goToSlide(1); }} aria-label="Next article">›</button>
              </>
            )}
            <div className="magazine-feature-copy">
              <span className="magazine-feature-category">{categoryCaps(current.category)}</span>
              <h2>{magazineCaps(current.title || editorialTitle(articleBodyText(current)))}</h2>
              <p>{current.excerpt || String(articleBodyText(current) || '').replace(/\s+/g, ' ').slice(0, 210)}</p>
              <button className="magazine-read-more" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openArticle(current); }}>ΔΙΑΒΑΣΕ ΠΕΡΙΣΣΟΤΕΡΑ</button>
            </div>
            {featuredCount > 1 && (
              <div className="magazine-dots" aria-label="Featured articles">
                {featured.map((article, index) => <button key={article.id} className={activeSlide === index ? 'active' : ''} type="button" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setActiveSlide(index); }} aria-label={`Show article ${index + 1}`} />)}
              </div>
            )}
          </article>

          <aside className="magazine-sidebar-card">
            <div className="magazine-section-head">
              <h2>{appCaps('Τελευταία Κείμενα')}</h2>
            </div>
            <div className="magazine-latest-list">
              {latest.map((post) => <PublicMagazineLatestItem key={post.id} post={post} onOpen={openArticle} />)}
            </div>
            <button className="magazine-all-link" type="button" onClick={() => document.getElementById('magazine-all-articles')?.scrollIntoView({ behavior: 'smooth' })}>{appCaps('Όλα τα Κείμενα')} ›</button>
          </aside>
        </section>
      )}

      <section id="magazine-all-articles" className="magazine-content-grid">
        <div className="magazine-all-articles">
          <div className="magazine-section-head wide">
            <h2>{appCaps('Όλα τα Άρθρα')}</h2>
            <small>{allArticleList.length} άρθρα · ταξινόμηση με βάση την ημερομηνία δημοσίευσης</small>
          </div>
          {allArticleList.length > 0 ? (
            <div className="magazine-article-grid">
              {allArticleList.map((post) => <PublicMagazineArticleCard key={post.id} post={post} onOpen={openArticle} />)}
            </div>
          ) : (
            <div className="magazine-empty-card">
              <span>THRYLOS UNITED</span>
              <h2>Δεν υπάρχουν ακόμα δημοσιευμένα άρθρα.</h2>
              <p>Το πρώτο κείμενο ετοιμάζεται. Μείνε συντονισμένος.</p>
            </div>
          )}
        </div>
        <aside className="magazine-sponsor-stack">
          <div className="magazine-sponsor-card">
            <span>{appCaps('Χορηγός επικοινωνίας')}</span>
            <strong>YOUR<br />BRAND</strong>
          </div>
          <div className="magazine-logo-guide-card">
            <img src={MAGAZINE_LOGO} alt="Thrylos United logo" loading="lazy" decoding="async" />
            <strong>Νέο red-white λογότυπο</strong>
            <small>Χρησιμοποιείται μόνο στην εναλλακτική έκδοση. Μπορείς αργότερα να το κάνεις βασικό από τα Site settings.</small>
          </div>
        </aside>
      </section>

      <footer className="magazine-footer">
        <div className="magazine-footer-brand">
          <img src={MAGAZINE_LOGO} alt="" loading="lazy" decoding="async" />
          <span><strong>{cleanBrandText(settings.site_title, APP_NAME)}</strong><small>{appCaps('Η κοινότητα του Θρύλου')}</small></span>
        </div>
        <nav>
          <button type="button" onClick={() => navigateTo('/')}>{appCaps('Κλασική έκδοση')}</button>
          <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Επικοινωνία')}</button>
          <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Διαφήμιση')}</button>
          <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Όροι χρήσης')}</button>
        </nav>
      </footer>
    </main>
  );
}

function PublicFrontPage({ settings = DEFAULT_SITE_SETTINGS, profile = null }) {
  const [articles, setArticles] = useState([]);
  const [category, setCategory] = useState('all');
  const [activeSlide, setActiveSlide] = useState(0);
  const [nextScheduledPublicAt, setNextScheduledPublicAt] = useState(null);
  const openArticle = useCallback((article) => {
    if (!article?.id) return;
    navigateTo(`/article/${article.id}`);
  }, []);

  const loadArticles = useCallback(async () => {
    const nowIso = new Date().toISOString();
    let query = supabase
      .from('articles')
      .select('*, profiles(handle, display_name, role, chat_color, avatar_url)')
      .in('status', ['published', 'scheduled'])
      .lte('published_at', nowIso)
      .order('published_at', { ascending: false })
      .limit(60);
    query = applyArticleCategoryFilter(query, category);
    const { data } = await query;
    setArticles((data || []).filter(articleIsPublic));
    setActiveSlide(0);

    let upcomingQuery = supabase
      .from('articles')
      .select('id,published_at,status,category')
      .eq('status', 'scheduled')
      .gt('published_at', nowIso)
      .order('published_at', { ascending: true })
      .limit(1);
    upcomingQuery = applyArticleCategoryFilter(upcomingQuery, category);
    const { data: upcoming } = await upcomingQuery;
    setNextScheduledPublicAt(upcoming?.[0]?.published_at || null);
  }, [category]);

  useEffect(() => {
    loadArticles();
    const channel = supabase
      .channel('public-articles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, loadArticles)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadArticles)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadArticles]);

  useEffect(() => {
    if (!nextScheduledPublicAt) return undefined;
    const delay = Math.max(500, new Date(nextScheduledPublicAt).getTime() - Date.now() + 1100);
    const timer = window.setTimeout(loadArticles, delay);
    return () => window.clearTimeout(timer);
  }, [loadArticles, nextScheduledPublicAt]);

  const featured = articles.slice(0, 5);
  const leadArticle = featured[0] || articles[0] || null;
  const current = featured[activeSlide] || leadArticle || null;
  const articleTimestamp = (article) => new Date(article?.published_at || article?.created_at || 0).getTime() || 0;
  const allArticleList = [...articles].sort((a, b) => articleTimestamp(b) - articleTimestamp(a));

  useEffect(() => {
    if (featuredCount <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((value) => (value + 1) % featuredCount);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [featuredCount]);

  const currentImage = articleCoverUrl(current, settings.hero_url || BRAND_HERO);

  useEffect(() => {
    preloadImage(currentImage);
    featured.slice(0, 3).forEach((item) => {
      if (articleCoverUrl(item)) preloadImage(articleCoverUrl(item));
    });
  }, [currentImage, featured]);

  return (
    <main className="public-site-shell port24-public-shell">
      <header className="public-topbar port24-topbar glass-card">
        <div className="brand-lockup"><BrandMark settings={settings} /><div><strong>{cleanBrandText(settings.site_title, APP_NAME)}</strong><small>{cleanBrandText(settings.header_tagline, DEFAULT_SITE_SETTINGS.header_tagline)}</small></div></div>
        {profile && (
          <button className="ghost-btn compact" type="button" onClick={() => navigateTo('/editor')}>
            Editor
          </button>
        )}
      </header>

      <section className="public-hero port24-hero glass-card" style={{ '--hero-image': `url(${settings.hero_url || BRAND_HERO})` }}>
        <div className="hero-copy">
          <span className="eyebrow">THRYLOS UNITED</span>
          <h1>Όλος ο ερυθρόλευκος παλμός σε άρθρα, απόψεις και ρεπορτάζ.</h1>
          <p>Ποδόσφαιρο, μπάσκετ, Ερασιτέχνης, μεταγραφές, γνώμες και media από την κοινότητα του Thrylos United.</p>
        </div>
        <div className="hero-stat-strip">
          <span><b>{articles.length}</b> άρθρα</span>
          <span><b>{ARTICLE_CATEGORIES.length - 1}</b> κατηγορίες</span>
          <span><b>Live</b> updates</span>
        </div>
      </section>

      <nav className="public-category-bar port24-category-bar glass-card" aria-label="Article categories">
        {['all', ...ARTICLE_CATEGORIES.filter((item) => item.id !== 'all').map((item) => item.id)].map((item) => (
          <button key={item} className={category === item ? 'active' : ''} type="button" onClick={() => setCategory(item)}>
            <span>{item === 'all' ? 'Όλα' : categoryLabel(item)}</span>
          </button>
        ))}
      </nav>

      {current && (
        <section className="front-feature-layout">
          <aside className="glass-card public-latest-rail port24-latest-rail front-latest-rail">
            <span className="eyebrow">ΤΕΛΕΥΤΑΙΑ ΚΕΙΜΕΝΑ</span>
            {articles.slice(0, 12).map((post) => {
              const thumb = articleCoverUrl(post, '');
              return (
                <button key={post.id} type="button" onClick={() => openArticle(post)}>
                  {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
                  <span><strong>{post.title || editorialTitle(articleBodyText(post))}</strong><small>{formatTime(post.published_at || post.created_at)} · {categoryLabel(post.category)}</small></span>
                </button>
              );
            })}
          </aside>

          <section className="article-carousel glass-card carousel-title-on-image carousel-title-only">
            <button className="carousel-image" type="button" onClick={() => openArticle(current)} style={{ '--carousel-image': `url(${currentImage})` }} aria-label="Open featured article">
              <span className="article-category-pill">{categoryCaps(current.category)}</span>
              <span className="carousel-image-copy">
                <span className="eyebrow">ΝΕΟ ΑΡΘΡΟ</span>
                <strong>{magazineCaps(current.title || editorialTitle(articleBodyText(current)))}</strong>
                <small>{current.excerpt || String(current.content || '').replace(/\s+/g, ' ').slice(0, 180)}</small>
              </span>
            </button>
            <div className="carousel-meta-strip">
              <div className="carousel-byline">
                <UserAvatar profile={current.profiles} className="comment-avatar" />
                <span>Γράφει: <strong>{displayUser(current.profiles)}</strong><small>{formatTime(current.published_at || current.created_at)}</small></span>
              </div>
              {featuredCount > 1 && (
                <div className="carousel-dots" aria-label="Featured articles">
                  {featured.map((article, index) => (
                    <button key={article.id} className={activeSlide === index ? 'active' : ''} type="button" onClick={() => setActiveSlide(index)} aria-label={`Show article ${index + 1}`} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>
      )}

      {allArticleList.length > 0 && (
        <section className="all-articles-feed glass-card">
          <div className="section-heading-line">
            <span className="eyebrow">ΟΛΑ ΤΑ ΑΡΘΡΑ</span>
            <small>{allArticleList.length} άρθρα · νεότερα πρώτα</small>
          </div>
          <div className="all-articles-scroll">
            {allArticleList.map((post) => <PublicArticleListItem key={post.id} post={post} onOpen={openArticle} />)}
          </div>
        </section>
      )}

      {articles.length === 0 && (
        <div className="glass-card loading-card port24-empty-state">
          <span className="eyebrow">COMING SOON</span>
          <h2>Δεν υπάρχουν ακόμα δημοσιευμένα άρθρα.</h2>
          <p>Το πρώτο κείμενο ετοιμάζεται. Μείνε συντονισμένος για νέα άρθρα, γνώμες και ρεπορτάζ.</p>
        </div>
      )}

      {/* Article cards open as standalone pages: /article/:id */}
    </main>
  );
}


function ArticlePage({ settings = DEFAULT_SITE_SETTINGS, articleId, profile = null, variant = 'classic' }) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(null);

  const isMagazineArticle = variant === 'magazine';
  const goHome = useCallback(() => {
    navigateTo(isMagazineArticle ? '/v2' : '/');
  }, [isMagazineArticle]);

  const loadArticle = useCallback(async () => {
    if (!articleId) {
      setError('Το άρθρο δεν βρέθηκε.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('articles')
      .select('*, profiles(handle, display_name, role, chat_color, avatar_url)')
      .eq('id', articleId)
      .maybeSingle();
    if (queryError) {
      setError(queryError.message || 'Δεν ήταν δυνατή η φόρτωση του άρθρου.');
      setArticle(null);
    } else if (!data || !articleIsPublic(data)) {
      const status = articleStatus(data);
      if (status === 'scheduled' && data?.published_at) {
        setRetryAt(data.published_at);
        setError(`Το άρθρο θα γίνει διαθέσιμο στις ${athensFormat(data.published_at)}.`);
      } else {
        setRetryAt(null);
        setError('Το άρθρο δεν βρέθηκε ή δεν είναι ακόμα διαθέσιμο.');
      }
      setArticle(null);
    } else {
      setRetryAt(null);
      setArticle(data);
    }
    setLoading(false);
  }, [articleId]);

  useEffect(() => {
    loadArticle();
    const channel = supabase
      .channel(`public-article-page-${articleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles', filter: `id=eq.${articleId}` }, loadArticle)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadArticle)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [articleId, loadArticle]);

  useEffect(() => {
    if (!retryAt) return undefined;
    const delay = Math.max(500, new Date(retryAt).getTime() - Date.now() + 1100);
    const timer = window.setTimeout(loadArticle, delay);
    return () => window.clearTimeout(timer);
  }, [loadArticle, retryAt]);

  if (isMagazineArticle) {
    return (
      <main className="magazine-page-shell magazine-article-page">
        <header className="magazine-top-strip">
          <nav aria-label="Quick links">
            <button type="button" onClick={() => navigateTo('/')}>{appCaps('Κλασική έκδοση')}</button>
            <button type="button" onClick={() => navigateTo('/v2')}>{appCaps('Αρχική V2')}</button>
            <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Σύνδεση')}</button>
            <button type="button" onClick={() => navigateTo('/editor')}>CHAT</button>
          </nav>
          <div className="magazine-socials" aria-label="Social links">
            <span>𝕏</span><span>◎</span><span>▶</span><span>♪</span>
            {profile ? <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Ο λογαριασμός μου')}</button> : <button type="button" onClick={() => navigateTo('/editor')}>{appCaps('Μέλος')}</button>}
          </div>
        </header>

        <section className="magazine-article-brand" style={{ '--magazine-hero': `url(${settings.hero_url || MAGAZINE_HERO})` }}>
          <button className="magazine-article-brand-link" type="button" onClick={goHome}>
            <MagazineLogo settings={settings} />
            <span>
              <strong>{cleanBrandText(settings.site_title, APP_NAME)}</strong>
              <small>{appCaps('Η κοινότητα του Θρύλου')}</small>
            </span>
          </button>
        </section>

        {loading && <div className="magazine-article-loading">Loading article…</div>}

        {!loading && error && (
          <section className="magazine-article-reader magazine-article-error">
            <span className="magazine-feature-category">THRYLOS UNITED</span>
            <h1>ΔΕΝ ΒΡΕΘΗΚΕ ΤΟ ΑΡΘΡΟ</h1>
            <p>{error}</p>
            <button className="magazine-read-more" type="button" onClick={goHome}>{appCaps('Επιστροφή στην αρχική')}</button>
          </section>
        )}

        {!loading && article && (
          <article className="magazine-article-reader">
            {articleCoverUrl(article) && (
              <img className="magazine-article-cover" src={articleCoverUrl(article)} alt="Article cover" loading="eager" decoding="async" fetchPriority="high" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            )}
            <div className="magazine-article-reader-copy">
              <span className="magazine-feature-category">{categoryCaps(article.category)}</span>
              <h1>{article.title || editorialTitle(articleBodyText(article))}</h1>
              <div className="magazine-article-meta">
                <UserAvatar profile={article.profiles} className="comment-avatar" />
                <span>Γράφει: <strong>{displayUser(article.profiles)}</strong> · {formatTime(article.published_at || article.created_at)}</span>
              </div>
              {article.excerpt && <p className="magazine-article-excerpt">{article.excerpt}</p>}
              <ArticleContentWithImages content={articleBodyText(article)} images={article.extra_images} fallbackText={article.excerpt || ''} />
              {parseMediaLinks([article.video_url, ...safeJsonArray(article.media_urls)].filter(Boolean).join('\n')).map((url, index) => (
                <MediaEmbed key={`${url}-${index}`} url={url} />
              ))}
              <ArticleSources article={article} />
            </div>
          </article>
        )}
      </main>
    );
  }

  return (
    <main className="public-site-shell port24-public-shell article-page-shell">
      <header className="public-topbar port24-topbar glass-card article-page-topbar">
        <button className="brand-lockup logo-home-button" type="button" onClick={goHome} aria-label="Back to front page">
          <BrandMark settings={settings} />
          <div><strong>{cleanBrandText(settings.site_title, APP_NAME)}</strong><small>{cleanBrandText(settings.header_tagline, DEFAULT_SITE_SETTINGS.header_tagline)}</small></div>
        </button>
        {profile && (
          <button className="ghost-btn compact" type="button" onClick={() => navigateTo('/editor')}>
            Editor
          </button>
        )}
      </header>

      <section className="public-hero port24-hero glass-card article-page-hero" style={{ '--hero-image': `url(${settings.hero_url || BRAND_HERO})` }}>
        <div className="hero-copy">
          <span className="eyebrow">THRYLOS UNITED</span>
          <h1>Όλος ο ερυθρόλευκος παλμός σε άρθρα, απόψεις και ρεπορτάζ.</h1>
          <p>Ποδόσφαιρο, μπάσκετ, Ερασιτέχνης, μεταγραφές, γνώμες και media από την κοινότητα του Thrylos United.</p>
        </div>
        <div className="hero-stat-strip">
          <span><b>{article ? '1' : '•'}</b> άρθρο</span>
          <span><b>{ARTICLE_CATEGORIES.length - 1}</b> κατηγορίες</span>
          <span><b>Live</b> updates</span>
        </div>
      </section>

      <nav className="public-category-bar port24-category-bar glass-card article-page-category-bar" aria-label="Article categories">
        {['all', ...ARTICLE_CATEGORIES.filter((item) => item.id !== 'all').map((item) => item.id)].map((item) => (
          <button
            key={item}
            className={(canonicalArticleCategory(article?.category) === item || (!article?.category && item === 'all')) ? 'active' : ''}
            type="button"
            onClick={() => navigateTo('/')}
          >
            <span>{item === 'all' ? 'Όλα' : categoryLabel(item)}</span>
          </button>
        ))}
      </nav>

      {loading && <div className="glass-card loading-card article-page-loading">Loading article…</div>}

      {!loading && error && (
        <section className="glass-card article-page-error">
          <span className="eyebrow">THRYLOS UNITED</span>
          <h1>Δεν βρέθηκε το άρθρο.</h1>
          <p>{error}</p>
          <button className="primary-btn" type="button" onClick={goHome}>Επιστροφή στην αρχική</button>
        </section>
      )}

      {!loading && article && (
        <article className="article-page-card glass-card">
          {articleCoverUrl(article) && <img className="article-page-cover image-fade-in" src={articleCoverUrl(article)} alt="Article cover" loading="eager" decoding="async" fetchPriority="high" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
          <div className="article-page-content">
            <span className="kind-pill">{categoryCaps(article.category)}</span>
            <h1>{article.title || editorialTitle(articleBodyText(article))}</h1>
            <div className="article-byline article-page-byline">
              <UserAvatar profile={article.profiles} className="comment-avatar" />
              <span>Γράφει: <strong>{displayUser(article.profiles)}</strong> · {formatTime(article.published_at || article.created_at)}</span>
            </div>
            {article.excerpt && <p className="article-page-excerpt">{article.excerpt}</p>}
            <ArticleContentWithImages content={articleBodyText(article)} images={article.extra_images} fallbackText={article.excerpt || ''} />
            {parseMediaLinks([article.video_url, ...safeJsonArray(article.media_urls)].filter(Boolean).join('\n')).map((url, index) => (
              <MediaEmbed key={`${url}-${index}`} url={url} />
            ))}
            <ArticleSources article={article} />
          </div>
        </article>
      )}
    </main>
  );
}

function InvitePanel({ profile }) {
  const [invites, setInvites] = useState([]);
  const [lastInvite, setLastInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [daysValid, setDaysValid] = useState(30);
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteView, setInviteView] = useState('open');
  const [inviteMessage, setInviteMessage] = useState('');
  const isAdmin = profile?.role === 'admin';

  const loadInvites = useCallback(async () => {
    let query = supabase
      .from('invites')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(inviteView === 'open' ? 100 : 60);

    if (inviteView === 'open') {
      query = query.is('used_at', null).gt('expires_at', new Date().toISOString());
    } else {
      query = query.or(`used_at.not.is.null,expires_at.lte.${new Date().toISOString()}`);
    }

    const { data, error } = await query;
    if (error) {
      setInviteMessage(error.message);
      setInvites([]);
      return;
    }
    setInvites(data || []);
  }, [inviteView]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  async function createInvite() {
    setBusy(true);
    setInviteMessage('');
    const requestedDays = Math.max(1, Math.min(Number(daysValid) || 30, 90));
    const rpcName = isAdmin ? 'admin_create_invite' : 'create_invite';
    const rpcArgs = isAdmin
      ? { invite_role: inviteRole, days_valid: requestedDays }
      : { days_valid: requestedDays };

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    setBusy(false);
    if (error) {
      setInviteMessage(error.message);
      return;
    }
    const link = `${window.location.origin}/editor?invite=${data}`;
    setLastInvite(link);
    setInviteView('open');
    setInviteMessage('Invite created and copied.');
    await navigator.clipboard?.writeText(link).catch(() => null);
    loadInvites();
  }

  async function clearOldInvites() {
    if (!isAdmin) return;
    if (!window.confirm('Delete all used and expired invites from the admin list? Active unused invites will stay.')) return;
    setBusy(true);
    setInviteMessage('');
    const { data, error } = await supabase.rpc('admin_clear_old_invites');
    setBusy(false);
    if (error) {
      setInviteMessage(error.message);
      return;
    }
    setInviteMessage(`Deleted ${data || 0} old invite${Number(data || 0) === 1 ? '' : 's'}.`);
    loadInvites();
  }

  async function revokeInvite(inviteId) {
    if (!isAdmin || !inviteId) return;
    setBusy(true);
    setInviteMessage('');
    const { error } = await supabase.rpc('admin_revoke_invite', { invite_id: inviteId });
    setBusy(false);
    if (error) {
      setInviteMessage(error.message);
      return;
    }
    setInviteMessage('Invite revoked.');
    loadInvites();
  }

  const openCount = invites.filter((invite) => !invite.used_at && new Date(invite.expires_at).getTime() > Date.now()).length;

  return (
    <section className="invite-admin-page glass-card">
      <div className="studio-section-head">
        <div>
          <span className="eyebrow">INVITATIONS</span>
          <h2>Invitation codes</h2>
          <p>Create one-use invite links. The list now shows active unused invites by default, so old/used codes do not clutter the admin page.</p>
        </div>
        <button className="ghost-btn compact" type="button" onClick={loadInvites}>Refresh</button>
      </div>

      <div className="invite-create-grid">
        {isAdmin && (
          <label>
            Invite role
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="member">Member / Reader</option>
              <option value="editor">Writer / Editor</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        )}
        <label>
          Valid for days
          <input type="number" min="1" max="90" value={daysValid} onChange={(e) => setDaysValid(e.target.value)} />
        </label>
        <button className="primary-btn" type="button" onClick={createInvite} disabled={busy}>
          {busy ? 'Working…' : 'Create invite'}
        </button>
      </div>

      {lastInvite && (
        <div className="invite-result invite-result-large">
          <span>Invite link copied:</span>
          <textarea readOnly value={lastInvite} rows={3} onFocus={(e) => e.target.select()} />
          <div className="invite-actions-line">
            <button className="ghost-btn compact" type="button" onClick={() => navigator.clipboard?.writeText(lastInvite)}>Copy again</button>
            <a className="source-link" href={lastInvite} target="_blank" rel="noreferrer">Open link</a>
          </div>
        </div>
      )}

      {inviteMessage && <div className={inviteMessage.toLowerCase().includes('error') ? 'error-box' : 'success-box'}>{inviteMessage}</div>}

      <div className="invite-toolbar">
        <div className="studio-tabs mini-tabs">
          <button type="button" className={inviteView === 'open' ? 'active' : ''} onClick={() => setInviteView('open')}>Unused invites</button>
          <button type="button" className={inviteView === 'old' ? 'active' : ''} onClick={() => setInviteView('old')}>Used / expired</button>
        </div>
        {isAdmin && inviteView === 'old' && (
          <button className="danger-btn compact" type="button" onClick={clearOldInvites} disabled={busy}>Delete old invites</button>
        )}
      </div>

      <div className="invite-list-table">
        <div className="invite-list-head invite-list-head-actions">
          <span>Status</span>
          <span>Role</span>
          <span>Created</span>
          <span>Expires</span>
          <span>Action</span>
        </div>
        {invites.length === 0 && <p className="empty-text padded">{inviteView === 'open' ? 'No unused invites right now.' : 'No used or expired invites in the list.'}</p>}
        {invites.map((invite) => {
          const isOpen = !invite.used_at && new Date(invite.expires_at).getTime() > Date.now();
          return (
            <div className="invite-list-row invite-list-row-actions" key={invite.id}>
              <strong className={isOpen ? 'open' : 'used'}>{isOpen ? 'Unused' : invite.used_at ? 'Used' : 'Expired'}</strong>
              <span>{roleBadge(invite.invite_role || 'member')}</span>
              <span>{formatTime(invite.created_at)}</span>
              <span>{formatTime(invite.expires_at)}</span>
              <span>
                {isAdmin && isOpen ? (
                  <button className="ghost-btn compact" type="button" onClick={() => revokeInvite(invite.id)} disabled={busy}>Revoke</button>
                ) : (
                  <em className="muted-inline">—</em>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {inviteView === 'open' && <p className="tiny-note">Showing {openCount} active one-use invite{openCount === 1 ? '' : 's'}. Used and expired invites are hidden unless you open the Used / expired view.</p>}
    </section>
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
      supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
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
              <option value="editor">writer</option>
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
    return uploadImageFile(file, `branding/${type}`);
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
          <p>Replace the default crest from here. The selected logo is used in the top bar, invite screen, article pages and browser tab icon after saving.</p>
        </div>
        <button className="ghost-btn" type="button" onClick={goBack}>Back to blog</button>
      </section>

      <form className="admin-settings-grid" onSubmit={saveSettings}>
        <section className="glass-card admin-settings-card">
          <h2>Site logo</h2>
          <div className="brand-preview-row brand-preview-strong">
            <BrandMark large settings={liveLogoSettings} />
            <div>
              <strong>{cleanBrandText(form.site_title, APP_NAME)}</strong>
              <small>{logoFile ? `Ready to replace with ${logoFile.name}` : form.logo_url ? 'Custom logo active' : 'Using fallback crest'}</small>
            </div>
          </div>

          <div className="logo-upload-box">
            <div className="logo-upload-preview">
              <img src={effectiveLogo} alt="Current site logo preview" loading="lazy" decoding="async" />
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
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeTypers, setActiveTypers] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [memberList, setMemberList] = useState([]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [newChatTitle, setNewChatTitle] = useState('');
  const [chatError, setChatError] = useState('');
  const bottomRef = useRef(null);
  const chatChannelRef = useRef(null);
  const typingTimersRef = useRef(new Map());
  const lastTypingSentRef = useRef(0);
  const typingStopTimerRef = useRef(null);
  const previousThreadIdRef = useRef('');
  const isOpenRef = useRef(isOpen);
  const activeThreadIdRef = useRef(activeThreadId);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) || null, [threads, activeThreadId]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    localStorage.setItem('chat-popup-open', isOpen ? '1' : '0');
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  function threadMembers(thread) {
    return (thread?.chat_thread_members || []).map((member) => member.profiles).filter(Boolean);
  }

  function threadLabel(thread) {
    if (!thread) return 'General chat';
    if (thread.is_general) return 'General chat';
    if (thread.title && thread.title.trim()) return thread.title.trim();
    const others = threadMembers(thread).filter((member) => member.id !== profile.id);
    if (others.length === 1) return displayUser(others[0]);
    if (others.length > 1) {
      const names = others.slice(0, 3).map(displayUser).join(', ');
      return others.length > 3 ? `${names} +${others.length - 3}` : names;
    }
    return 'Private chat';
  }

  function threadSubtitle(thread) {
    if (!thread) return '';
    if (thread.is_general) return 'Everyone';
    const count = threadMembers(thread).length;
    return `${count || 1} member${count === 1 ? '' : 's'}`;
  }

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, handle, display_name, role, chat_color, avatar_url')
      .neq('id', profile.id)
      .order('display_name', { ascending: true });
    if (!error) setMemberList(data || []);
  }, [profile.id]);

  const loadThreads = useCallback(async () => {
    const { data, error } = await supabase
      .from('chat_threads')
      .select('id, title, is_general, created_by, created_at, updated_at, chat_thread_members(user_id, profiles(id, handle, display_name, role, chat_color, avatar_url))')
      .order('is_general', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) {
      setChatError('Chat tables are not ready yet. Run the latest supabase/schema.sql once.');
      return;
    }

    const next = data || [];
    setChatError('');
    setThreads(next);
    setActiveThreadId((current) => {
      if (current && next.some((thread) => thread.id === current)) return current;
      return next.find((thread) => thread.is_general)?.id || next[0]?.id || '';
    });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!activeThreadIdRef.current) {
      setMessages([]);
      return;
    }
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*, profiles(id, handle, display_name, role, chat_color, avatar_url)')
      .eq('thread_id', activeThreadIdRef.current)
      .order('created_at', { ascending: true })
      .limit(150);
    if (!error) setMessages(data || []);
  }, []);

  const sendTyping = useCallback(async (isTyping, threadIdOverride = '') => {
    const threadId = threadIdOverride || activeThreadIdRef.current;
    if (!chatChannelRef.current || !threadId) return;
    await chatChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        thread_id: threadId,
        user_id: profile.id,
        name: displayUser(profile),
        color: userColor(profile),
        avatar_url: profile.avatar_url || '',
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

  const clearTypingStopTimer = useCallback(() => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  }, []);

  const removeMessageLocally = useCallback((messageId) => {
    if (!messageId) return;
    setMessages((current) => current.filter((message) => message.id !== messageId));
  }, []);

  useEffect(() => {
    loadMembers();
    loadThreads();

    const channel = supabase
      .channel(`member-chat-${profile.id}`, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads' }, loadThreads)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_thread_members' }, () => {
        loadThreads();
        loadMembers();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => {
        loadMembers();
        loadThreads();
        loadMessages();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        const threadId = payload.new?.thread_id || payload.old?.thread_id;
        const messageId = payload.old?.id || payload.new?.id;
        if (payload.eventType === 'DELETE') {
          removeMessageLocally(messageId);
          if (threadId === activeThreadIdRef.current) {
            loadMessages();
          }
          loadThreads();
          return;
        }
        if (threadId === activeThreadIdRef.current) loadMessages();
        loadThreads();
        if (payload.eventType === 'INSERT' && payload.new?.sender_id !== profile.id) {
          clearTyper(payload.new.sender_id);
          if (!isOpenRef.current || threadId !== activeThreadIdRef.current) setUnreadCount((count) => count + 1);
        }
      })
      .on('broadcast', { event: 'message-created' }, ({ payload }) => {
        if (payload?.sender_id) clearTyper(payload.sender_id);
        if (payload?.thread_id === activeThreadIdRef.current) loadMessages();
        loadThreads();
        if (payload?.sender_id !== profile.id && (!isOpenRef.current || payload?.thread_id !== activeThreadIdRef.current)) {
          setUnreadCount((count) => count + 1);
        }
      })
      .on('broadcast', { event: 'message-deleted' }, ({ payload }) => {
        if (!payload?.id) return;
        removeMessageLocally(payload.id);
        if (payload.thread_id === activeThreadIdRef.current) loadMessages();
        loadThreads();
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.user_id === profile.id || payload.thread_id !== activeThreadIdRef.current) return;
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
      clearTypingStopTimer();
      supabase.removeChannel(channel);
      chatChannelRef.current = null;
    };
  }, [clearTyper, clearTypingStopTimer, loadMembers, loadMessages, loadThreads, profile.id, removeMessageLocally]);

  useEffect(() => {
    const previousThreadId = previousThreadIdRef.current;
    if (previousThreadId && previousThreadId !== activeThreadId) sendTyping(false, previousThreadId);
    previousThreadIdRef.current = activeThreadId;
    clearTypingStopTimer();
    setActiveTypers({});
    loadMessages();
  }, [activeThreadId, clearTypingStopTimer, loadMessages, sendTyping]);

  useEffect(() => {
    if (isOpen && activeTab === 'messages') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isOpen, activeTab]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim() || !activeThreadId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('chat_messages').insert({
        thread_id: activeThreadId,
        sender_id: profile.id,
        body: draft.trim(),
      }).select('id, thread_id').single();
      if (error) throw error;

      setDraft('');
      clearTypingStopTimer();
      await sendTyping(false);
      await chatChannelRef.current?.send({
        type: 'broadcast',
        event: 'message-created',
        payload: { id: data?.id, thread_id: data?.thread_id || activeThreadId, sender_id: profile.id },
      }).catch(() => null);
      await loadMessages();
      await loadThreads();
    } catch (err) {
      alert(err.message || 'Could not send message');
    } finally {
      setBusy(false);
    }
  }

  function deleteMessage(messageId) {
    setDeleteTarget({ messageId });
  }

  async function confirmDeleteMessage() {
    if (!deleteTarget?.messageId) return;
    const messageId = deleteTarget.messageId;
    const deletedMessage = messages.find((message) => message.id === messageId);
    const deletedThreadId = deletedMessage?.thread_id || activeThreadIdRef.current;
    setDeleteTarget(null);
    removeMessageLocally(messageId);
    const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
    if (error) {
      alert(error.message);
      await loadMessages();
      return;
    }
    await chatChannelRef.current?.send({
      type: 'broadcast',
      event: 'message-deleted',
      payload: { id: messageId, thread_id: deletedThreadId, deleted_by: profile.id, at: Date.now() },
    }).catch(() => null);
    await loadThreads();
  }

  function updateDraft(value) {
    setDraft(value);
    clearTypingStopTimer();
    if (!value.trim()) {
      sendTyping(false);
      lastTypingSentRef.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentRef.current > 900) {
      lastTypingSentRef.current = now;
      sendTyping(true);
    }
    typingStopTimerRef.current = window.setTimeout(() => {
      lastTypingSentRef.current = 0;
      sendTyping(false);
      typingStopTimerRef.current = null;
    }, 2400);
  }

  function toggleSelectedMember(memberId) {
    setSelectedMemberIds((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]);
  }

  async function createThread(e) {
    e.preventDefault();
    if (selectedMemberIds.length === 0) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('create_chat_thread', {
        thread_title: newChatTitle.trim() || null,
        member_ids: selectedMemberIds,
      });
      if (error) throw error;
      setNewChatOpen(false);
      setSelectedMemberIds([]);
      setNewChatTitle('');
      await loadThreads();
      setActiveThreadId(data);
      setActiveTab('messages');
    } catch (err) {
      alert(err.message || 'Could not create chat');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`chat-popup ${isOpen ? 'open' : 'closed'}`}>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete this chat message?"
        body="This removes the message from the selected chat for everyone who has access to it."
        confirmLabel="Delete message"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteMessage}
      />

      {newChatOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewChatOpen(false); }}>
          <section className="confirm-modal chat-create-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
            <div className="modal-mark" aria-hidden="true">+</div>
            <div className="modal-copy">
              <h2 id="new-chat-title">Create private chat</h2>
              <p>Select one user for a private message or multiple members for a group chat.</p>
              <form className="new-chat-form" onSubmit={createThread}>
                <label>
                  Group title <small>optional</small>
                  <input value={newChatTitle} onChange={(e) => setNewChatTitle(e.target.value)} placeholder="Example: Matchday voice crew" maxLength={80} />
                </label>
                <div className="member-picker" role="listbox" aria-label="Select chat members">
                  {memberList.length === 0 && <span className="empty-text">No other members yet.</span>}
                  {memberList.map((member) => {
                    const selected = selectedMemberIds.includes(member.id);
                    return (
                      <button key={member.id} type="button" className={`member-pick ${selected ? 'selected' : ''}`} onClick={() => toggleSelectedMember(member.id)}>
                        <UserAvatar profile={member} className="member-pick-avatar" />
                        <span><strong>{displayUser(member)}</strong><small>@{member.handle}</small></span>
                        <i>{selected ? '✓' : '+'}</i>
                      </button>
                    );
                  })}
                </div>
                <div className="modal-actions">
                  <button className="ghost-btn" type="button" onClick={() => setNewChatOpen(false)}>Cancel</button>
                  <button className="primary-btn" type="submit" disabled={busy || selectedMemberIds.length === 0}>{busy ? 'Creating…' : 'Create chat'}</button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {!isOpen && (
        <button className="chat-launcher" type="button" onClick={() => setIsOpen(true)} aria-label="Open chat">
          <span className="launcher-icon">💬</span>
          <span>
            <strong>Chat</strong>
            <small>{unreadCount > 0 ? `${unreadCount} new` : 'General, private and voice'}</small>
          </span>
        </button>
      )}

      {isOpen && (
        <aside className="chat-card glass-card popup-card">
          <div className="popup-chat-titlebar">
            <div>
              <span className="eyebrow">LIVE CHAT</span>
              <h2>{activeTab === 'voice' ? 'Voice chat' : 'Messages'}</h2>
            </div>
            <div className="popup-chat-actions">
              <button className="ghost-btn compact" type="button" onClick={() => setNewChatOpen(true)}>New chat</button>
              <button className="ghost-btn compact" type="button" onClick={() => setIsOpen(false)}>Close</button>
            </div>
          </div>

          <div className="chat-subtabs" role="tablist" aria-label="Chat options">
            <button type="button" className={activeTab === 'messages' ? 'active' : ''} onClick={() => setActiveTab('messages')}>Messages</button>
            <button type="button" className={activeTab === 'voice' ? 'active' : ''} onClick={() => setActiveTab('voice')}>Voice chat</button>
          </div>

          {activeTab === 'messages' ? (
            <div className="chat-tab-panel messages-panel no-passphrase-panel">
              {chatError && <div className="warning-box">{chatError}</div>}
              <div className="chat-layout">
                <aside className="thread-list" aria-label="Chats">
                  <button type="button" className="thread-new-btn" onClick={() => setNewChatOpen(true)}>+ Private / group</button>
                  {threads.map((thread) => {
                    const label = threadLabel(thread);
                    return (
                      <button key={thread.id} type="button" className={`thread-button ${thread.id === activeThreadId ? 'active' : ''}`} onClick={() => setActiveThreadId(thread.id)}>
                        <span className="thread-avatar-stack">
                          {thread.is_general ? <span className="thread-general-icon">Θ</span> : threadMembers(thread).slice(0, 3).map((member) => <UserAvatar key={member.id} profile={member} className="thread-mini-avatar" />)}
                        </span>
                        <span className="thread-copy"><strong>{label}</strong><small>{threadSubtitle(thread)}</small></span>
                      </button>
                    );
                  })}
                </aside>

                <section className="thread-panel">
                  <div className="active-thread-head">
                    <div>
                      <strong>{threadLabel(activeThread)}</strong>
                      <small>{activeThread?.is_general ? 'General chat for every member' : 'Private room'}</small>
                    </div>
                    {!activeThread?.is_general && <span className="dm-pill">Private</span>}
                  </div>

                  <div className="chat-window popup-chat-window" aria-live="polite">
                    {messages.length === 0 && <div className="empty-text padded">No messages yet. Start the conversation.</div>}
                    {messages.map((message) => {
                      const canDelete = message.sender_id === profile.id || isStaff(profile.role);
                      const messageProfile = message.sender_id === profile.id ? profile : message.profiles;
                      const color = userColor(messageProfile);
                      return (
                        <div className={`chat-line ${message.sender_id === profile.id ? 'mine' : ''}`} key={message.id} style={{ '--member-color': color }}>
                          <div className="chat-line-head">
                            <div className="chat-author">
                              <UserAvatar profile={messageProfile} color={color} className="chat-avatar" />
                              <strong style={{ color }}>{displayUser(messageProfile)}</strong>
                            </div>
                            {canDelete && <button className="chat-delete-btn" type="button" aria-label="Delete message" onClick={() => deleteMessage(message.id)}>×</button>}
                          </div>
                          <span>{message.body}</span>
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
                      onBlur={() => { clearTypingStopTimer(); sendTyping(false); }}
                      placeholder={activeThreadId ? 'Write message…' : 'Create or select a chat first'}
                      disabled={!activeThreadId}
                      maxLength={2000}
                    />
                    <button className="primary-btn send-message-btn" disabled={!activeThreadId || busy || !draft.trim()}>{busy ? '…' : 'Send'}</button>
                  </form>
                </section>
              </div>
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

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function voiceRoleLabel(role) {
  if (role === 'host') return 'Host';
  if (role === 'cohost') return 'Sub-host';
  if (role === 'speaker') return 'Mic';
  return 'Listener';
}

function VoiceAvatarTile({ stream, profile, name, role = 'speaker', muted = false, color = '#e31b2f', speaking = false }) {
  const ref = useRef(null);
  const [audioSpeaking, setAudioSpeaking] = useState(false);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);
  useEffect(() => {
    if (!stream || muted) {
      setAudioSpeaking(false);
      return undefined;
    }
    return startVoiceMeter(stream, (nextSpeaking) => setAudioSpeaking(nextSpeaking));
  }, [stream, muted]);
  const displayName = name || displayUser(profile);
  const active = !muted && (speaking || audioSpeaking);
  const tileProfile = profile || { display_name: displayName, avatar_url: '', chat_color: color };
  return (
    <div className={`voice-avatar-tile ${active ? 'speaking' : ''} ${muted ? 'muted' : ''}`} style={{ '--member-color': color }} title={`${displayName} · ${voiceRoleLabel(role)}${muted ? ' · muted' : ''}`}>
      <UserAvatar profile={tileProfile} name={displayName} color={color} className="voice-photo" />
      <span className="voice-role-dot">{role === 'host' ? 'H' : role === 'cohost' ? 'S' : role === 'speaker' ? 'M' : 'L'}</span>
      {muted && <span className="voice-muted-dot">×</span>}
      {stream && <audio ref={ref} autoPlay playsInline />}
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
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState({});
  const [roomRoles, setRoomRoles] = useState({});
  const [localRole, setLocalRole] = useState('listener');
  const [micAllowed, setMicAllowed] = useState(false);
  const [localMicActive, setLocalMicActive] = useState(false);
  const [hostId, setHostId] = useState(null);
  const hostIdRef = useRef(null);
  const [roomStartedAt, setRoomStartedAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [recording, setRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recordingName, setRecordingName] = useState('');
  const [cleanWavUrl, setCleanWavUrl] = useState('');
  const [cleanWavName, setCleanWavName] = useState('');
  const [recordingError, setRecordingError] = useState('');
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState(localStorage.getItem('preferred-mic-id') || '');
  const [micStatus, setMicStatus] = useState('');

  const channelRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const activeRef = useRef(false);
  const knownMembersRef = useRef(new Set());
  const joinedAtRef = useRef(null);
  const mutedRef = useRef(false);
  const localRoleRef = useRef('listener');
  const micAllowedRef = useRef(false);
  const roomRolesRef = useRef({});
  const recordingRef = useRef(false);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingAudioContextRef = useRef(null);
  const recordingDestinationRef = useRef(null);
  const recordingSourcesRef = useRef(new Map());
  const speakingRef = useRef(false);
  const lastSpeakingBroadcastRef = useRef(0);
  const lastVoiceHeartbeatRef = useRef(0);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { localRoleRef.current = localRole; }, [localRole]);
  useEffect(() => { micAllowedRef.current = micAllowed; }, [micAllowed]);
  useEffect(() => { roomRolesRef.current = roomRoles; }, [roomRoles]);
  useEffect(() => { hostIdRef.current = hostId; }, [hostId]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);


  useEffect(() => {
    if (!joined) return undefined;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [joined]);

  const loadAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicStatus('This browser cannot list microphones.');
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      setAudioDevices(inputs);
      if (inputs.length === 0) setMicStatus('No microphone inputs found yet. Connect your headset and press Refresh mics.');
      else setMicStatus(`${inputs.length} microphone input${inputs.length === 1 ? '' : 's'} available.`);
    } catch (err) {
      setMicStatus(friendlyMicError(err));
    }
  }, []);

  const refreshMicrophones = useCallback(async () => {
    setMicStatus('Checking microphone permission…');
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const testStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        testStream.getTracks().forEach((track) => track.stop());
      }
      await loadAudioDevices();
    } catch (err) {
      setMicStatus(friendlyMicError(err));
      await loadAudioDevices();
    }
  }, [loadAudioDevices]);

  useEffect(() => {
    loadAudioDevices();
    if (!navigator.mediaDevices?.addEventListener) return undefined;
    navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadAudioDevices);
  }, [loadAudioDevices]);

  useEffect(() => {
    localStorage.setItem('preferred-mic-id', selectedMicId || '');
  }, [selectedMicId]);

  const shouldInitiate = useCallback((peerId) => {
    if (!peerId || peerId === profile.id) return false;
    return String(profile.id).localeCompare(String(peerId)) < 0;
  }, [profile.id]);

  const sendBroadcast = useCallback(async (event, payload) => {
    if (!channelRef.current) return;
    await channelRef.current.send({ type: 'broadcast', event, payload }).catch(() => null);
  }, []);

  const voiceStatePayload = useCallback((overrides = {}) => ({
    from: profile.id,
    name: displayUser(profile),
    color: userColor(profile),
    avatar_url: profile.avatar_url || '',
    muted: mutedRef.current,
    hasMic: Boolean(localStreamRef.current),
    role: localRoleRef.current,
    mic_allowed: micAllowedRef.current,
    speaking: speakingRef.current,
    joined_at: joinedAtRef.current,
    at: Date.now(),
    ...overrides,
  }), [profile]);

  const trackVoiceState = useCallback(async (overrides = {}) => {
    if (!channelRef.current || !joinedAtRef.current) return;
    await channelRef.current.track({
      name: displayUser(profile),
      color: userColor(profile),
      avatar_url: profile.avatar_url || '',
      muted: mutedRef.current,
      role: localRoleRef.current,
      mic_allowed: micAllowedRef.current,
      has_mic: Boolean(localStreamRef.current),
      speaking: speakingRef.current,
      in_voice: true,
      joined_at: joinedAtRef.current,
      ...overrides,
    }).catch(() => null);
  }, [profile]);

  useEffect(() => {
    if (joined && hostId === profile.id && !micAllowedRef.current) {
      micAllowedRef.current = true;
      setMicAllowed(true);
      trackVoiceState({ role: 'host', mic_allowed: true });
    }
  }, [joined, hostId, profile.id, trackVoiceState]);

  useEffect(() => {
    if (!joined || !localStreamRef.current || mutedRef.current) {
      if (speakingRef.current) {
        speakingRef.current = false;
        setLocalSpeaking(false);
        trackVoiceState({ speaking: false });
        sendBroadcast('voice-state', {
          from: profile.id,
          name: displayUser(profile),
          muted: mutedRef.current,
          hasMic: Boolean(localStreamRef.current),
          role: localRoleRef.current,
          avatar_url: profile.avatar_url || '',
          speaking: false,
        });
      }
      return undefined;
    }

    return startVoiceMeter(localStreamRef.current, (speaking, level) => {
      const cleanSpeaking = !mutedRef.current && speaking;
      const changed = cleanSpeaking !== speakingRef.current;
      speakingRef.current = cleanSpeaking;
      setLocalSpeaking(cleanSpeaking);
      const now = Date.now();
      if (changed || now - lastSpeakingBroadcastRef.current > 1200) {
        lastSpeakingBroadcastRef.current = now;
        trackVoiceState({ speaking: cleanSpeaking, level });
        sendBroadcast('voice-state', {
          from: profile.id,
          name: displayUser(profile),
          muted: mutedRef.current,
          hasMic: Boolean(localStreamRef.current),
          role: localRoleRef.current,
          avatar_url: profile.avatar_url || '',
          speaking: cleanSpeaking,
          level,
        });
      }
    });
  }, [joined, localMicActive, profile, sendBroadcast, trackVoiceState]);

  useEffect(() => {
    if (!joined) return;
    trackVoiceState({ avatar_url: profile.avatar_url || '', name: displayUser(profile), color: userColor(profile) });
  }, [joined, profile.avatar_url, profile.display_name, profile.chat_color, trackVoiceState]);

  useEffect(() => {
    if (!joined) return undefined;
    const heartbeat = async () => {
      lastVoiceHeartbeatRef.current = Date.now();
      const payload = voiceStatePayload();
      await trackVoiceState({
        name: payload.name,
        color: payload.color,
        avatar_url: payload.avatar_url,
        muted: payload.muted,
        role: payload.role,
        mic_allowed: payload.mic_allowed,
        has_mic: payload.hasMic,
        speaking: payload.speaking,
      });
      await sendBroadcast('voice-heartbeat', payload);
      if (profile.id === hostIdRef.current && Object.keys(roomRolesRef.current).length > 0) {
        await sendBroadcast('voice-role-sync', { from: profile.id, roles: roomRolesRef.current, at: Date.now() });
      }
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 8500);
    return () => window.clearInterval(timer);
  }, [joined, profile.id, sendBroadcast, trackVoiceState, voiceStatePayload]);


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

  const renegotiatePeer = useCallback(async (peerId, peerName = 'Member') => {
    if (!activeRef.current || peerId === profile.id) return;
    const pc = peersRef.current.get(peerId);
    if (!pc || pc.signalingState === 'closed') return;
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await sendBroadcast('voice-signal', {
        from: profile.id,
        fromName: displayUser(profile),
        to: peerId,
        kind: 'offer',
        sdp: offer,
        peerName,
      });
    } catch (err) {
      console.warn('Voice renegotiation failed', err);
    }
  }, [profile, sendBroadcast]);

  const renegotiateAll = useCallback(async () => {
    const jobs = [];
    peersRef.current.forEach((pc, peerId) => {
      const member = voiceMembers[peerId];
      jobs.push(renegotiatePeer(peerId, member?.name || remoteNames[peerId] || 'Member'));
    });
    await Promise.allSettled(jobs);
  }, [remoteNames, renegotiatePeer, voiceMembers]);

  useEffect(() => {
    if (!joined) return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      trackVoiceState();
      sendBroadcast('voice-heartbeat', voiceStatePayload());
      renegotiateAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [joined, renegotiateAll, sendBroadcast, trackVoiceState, voiceStatePayload]);

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

    const scheduleReconnect = () => {
      if (!activeRef.current || pc.signalingState === 'closed') return;
      window.setTimeout(() => {
        if (!activeRef.current || pc.signalingState === 'closed') return;
        if (['disconnected', 'failed'].includes(pc.connectionState) || ['disconnected', 'failed'].includes(pc.iceConnectionState)) {
          try { pc.restartIce?.(); } catch { /* ignored */ }
          renegotiatePeer(peerId, peerName);
        }
      }, 1200);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'closed') closePeer(peerId);
      else if (['failed', 'disconnected'].includes(pc.connectionState)) scheduleReconnect();
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'closed') closePeer(peerId);
      else if (['failed', 'disconnected'].includes(pc.iceConnectionState)) scheduleReconnect();
    };

    return pc;
  }, [closePeer, profile, renegotiatePeer, sendBroadcast]);

  const createOffer = useCallback(async (peerId, peerName) => {
    if (!activeRef.current || peerId === profile.id) return;
    try {
      getPeer(peerId, peerName);
      await renegotiatePeer(peerId, peerName);
    } catch (err) {
      console.warn('Voice offer failed', err);
    }
  }, [getPeer, profile.id, renegotiatePeer]);

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

  const getEffectiveRole = useCallback((userId, info = {}) => {
    if (userId === hostId) return 'host';
    return roomRolesRef.current[userId]?.role || info.role || 'listener';
  }, [hostId]);

  const syncPresence = useCallback((channel) => {
    const state = channel.presenceState();
    const nextMembers = {};
    Object.entries(state).forEach(([userId, presences]) => {
      const latest = presences?.[presences.length - 1] || {};
      const roleOverride = roomRolesRef.current[userId]?.role;
      nextMembers[userId] = {
        id: userId,
        name: latest.name || (userId === profile.id ? displayUser(profile) : 'Member'),
        color: latest.color || '#e31b2f',
        avatar_url: latest.avatar_url || '',
        muted: Boolean(latest.muted),
        role: roleOverride || latest.role || 'listener',
        micAllowed: Boolean(latest.mic_allowed),
        hasMic: Boolean(latest.has_mic),
        speaking: Boolean(latest.speaking),
        joinedAt: latest.joined_at || new Date().toISOString(),
      };
    });

    Array.from(knownMembersRef.current).forEach((peerId) => {
      if (peerId !== profile.id && !nextMembers[peerId]) closePeer(peerId);
    });

    const sorted = Object.values(nextMembers).sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
    const nextHost = sorted[0]?.id || null;
    setHostId(nextHost);
    setRoomStartedAt(sorted[0]?.joinedAt || joinedAtRef.current);
    setVoiceMembers(nextMembers);

    if (!activeRef.current) return;
    Object.entries(nextMembers).forEach(([peerId, info]) => {
      if (peerId !== profile.id && !knownMembersRef.current.has(peerId) && shouldInitiate(peerId)) {
        window.setTimeout(() => createOffer(peerId, info.name), 250);
      }
    });
  }, [closePeer, createOffer, profile, shouldInitiate]);

  const setLocalMuted = useCallback(async (nextMuted) => {
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    if (nextMuted) {
      speakingRef.current = false;
      setLocalSpeaking(false);
    }
    await trackVoiceState({ muted: nextMuted, speaking: nextMuted ? false : speakingRef.current });
    await sendBroadcast('voice-state', {
      from: profile.id,
      name: displayUser(profile),
      muted: nextMuted,
      hasMic: Boolean(localStreamRef.current),
      role: localRoleRef.current,
      avatar_url: profile.avatar_url || '',
      speaking: speakingRef.current,
    });
  }, [profile, sendBroadcast, trackVoiceState]);

  const enableMic = useCallback(async () => {
    setVoiceError('');
    if (!micAllowedRef.current && localRoleRef.current !== 'host' && localRoleRef.current !== 'cohost' && hostIdRef.current !== profile.id) {
      setVoiceError('A host or sub-host needs to give you mic rights first.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('This browser does not support microphone voice chat.');
      return;
    }
    if (localStreamRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micConstraintsForDevice(selectedMicId),
        video: false,
      });
      localStreamRef.current = stream;
      setLocalMicActive(true);
      mutedRef.current = false;
      setMuted(false);
      peersRef.current.forEach((pc) => {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      });
      await trackVoiceState({ muted: false, has_mic: true, mic_allowed: true });
      await sendBroadcast('voice-state', {
        from: profile.id,
        name: displayUser(profile),
        muted: false,
        hasMic: true,
        role: localRoleRef.current,
        avatar_url: profile.avatar_url || '',
        speaking: speakingRef.current,
      });
      await renegotiateAll();
    } catch (err) {
      setVoiceError(friendlyMicError(err));
    }
  }, [profile, renegotiateAll, selectedMicId, sendBroadcast, trackVoiceState]);

  const disableMic = useCallback(async (forcedMuted = true) => {
    const stream = localStreamRef.current;
    if (stream) {
      peersRef.current.forEach((pc) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track && stream.getTracks().includes(sender.track)) {
            try { pc.removeTrack(sender); } catch { /* ignored */ }
          }
        });
      });
      stream.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
    setLocalMicActive(false);
    mutedRef.current = forcedMuted;
    setMuted(forcedMuted);
    speakingRef.current = false;
    setLocalSpeaking(false);
    await trackVoiceState({ muted: forcedMuted, has_mic: false, speaking: false });
    await sendBroadcast('voice-state', {
      from: profile.id,
      name: displayUser(profile),
      muted: forcedMuted,
      hasMic: false,
      role: localRoleRef.current,
      avatar_url: profile.avatar_url || '',
      speaking: speakingRef.current,
    });
    await renegotiateAll();
  }, [profile, renegotiateAll, sendBroadcast, trackVoiceState]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
  }, []);

  const stopVoice = useCallback(async () => {
    activeRef.current = false;
    setJoined(false);
    setMuted(false);
    setMicAllowed(false);
    setLocalRole('listener');
    setLocalMicActive(false);
    setRemoteStreams({});
    setRemoteNames({});
    setRemoteStates({});
    setVoiceMembers({});
    setHostId(null);
    setRoomStartedAt(null);
    setLocalSpeaking(false);
    speakingRef.current = false;
    knownMembersRef.current.clear();

    if (recordingRef.current) stopRecording();
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
    joinedAtRef.current = null;
  }, [profile.id, sendBroadcast, stopRecording]);

  const applyRoleChange = useCallback(async (targetId, role) => {
    setRoomRoles((current) => ({ ...current, [targetId]: { role, updatedAt: Date.now() } }));
    if (targetId !== profile.id) return;

    localRoleRef.current = role;
    setLocalRole(role);
    const allowed = role === 'speaker' || role === 'cohost' || role === 'host';
    micAllowedRef.current = allowed;
    setMicAllowed(allowed);

    if (!allowed) await disableMic(true);
    await trackVoiceState({ role, mic_allowed: allowed, has_mic: Boolean(localStreamRef.current), muted: mutedRef.current });
  }, [disableMic, profile.id, trackVoiceState]);

  async function startVoice(mode) {
    setVoiceError('');
    setRecordingError('');
    if (joined) return;

    const wantsMic = mode === 'speaker';
    if (wantsMic && !navigator.mediaDevices?.getUserMedia) {
      setVoiceError('This browser does not support microphone voice chat.');
      return;
    }

    try {
      joinedAtRef.current = new Date().toISOString();
      activeRef.current = true;
      setJoined(true);
      setNowTick(Date.now());
      setRoomStartedAt(joinedAtRef.current);
      micAllowedRef.current = wantsMic;
      setMicAllowed(wantsMic);
      localRoleRef.current = wantsMic ? 'speaker' : 'listener';
      setLocalRole(wantsMic ? 'speaker' : 'listener');
      mutedRef.current = !wantsMic;
      setMuted(!wantsMic);

      if (wantsMic) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: micConstraintsForDevice(selectedMicId),
          video: false,
        });
        localStreamRef.current = stream;
        setLocalMicActive(true);
        mutedRef.current = false;
        setMuted(false);
      }

      const channel = supabase
        .channel('live-voice-room', { config: { presence: { key: profile.id }, broadcast: { self: false } } })
        .on('presence', { event: 'sync' }, () => syncPresence(channel))
        .on('broadcast', { event: 'voice-join' }, ({ payload }) => {
          if (!payload || payload.from === profile.id) return;
          setRemoteNames((current) => ({ ...current, [payload.from]: payload.name || 'Member' }));
          setRemoteStates((current) => ({ ...current, [payload.from]: { ...(current[payload.from] || {}), avatar_url: payload.avatar_url || current[payload.from]?.avatar_url || '', role: payload.role || current[payload.from]?.role } }));
          if (shouldInitiate(payload.from)) createOffer(payload.from, payload.name);
          if (profile.id === hostIdRef.current && Object.keys(roomRolesRef.current).length > 0) {
            channel.send({
              type: 'broadcast',
              event: 'voice-role-sync',
              payload: { from: profile.id, roles: roomRolesRef.current },
            }).catch(() => null);
          }
        })
        .on('broadcast', { event: 'voice-leave' }, ({ payload }) => {
          if (payload?.from && payload.from !== profile.id) closePeer(payload.from);
        })
        .on('broadcast', { event: 'voice-state' }, ({ payload }) => {
          if (!payload || payload.from === profile.id) return;
          setRemoteNames((current) => ({ ...current, [payload.from]: payload.name || current[payload.from] || 'Member' }));
          setRemoteStates((current) => ({
            ...current,
            [payload.from]: {
              ...(current[payload.from] || {}),
              muted: Boolean(payload.muted),
              hasMic: Boolean(payload.hasMic),
              speaking: Boolean(payload.speaking),
              avatar_url: payload.avatar_url || current[payload.from]?.avatar_url || '',
              role: payload.role || current[payload.from]?.role,
              lastSeen: Date.now(),
            },
          }));
        })
        .on('broadcast', { event: 'voice-heartbeat' }, ({ payload }) => {
          if (!payload || payload.from === profile.id) return;
          setRemoteNames((current) => ({ ...current, [payload.from]: payload.name || current[payload.from] || 'Member' }));
          setRemoteStates((current) => ({
            ...current,
            [payload.from]: {
              ...(current[payload.from] || {}),
              muted: Boolean(payload.muted),
              hasMic: Boolean(payload.hasMic),
              speaking: Boolean(payload.speaking),
              avatar_url: payload.avatar_url || current[payload.from]?.avatar_url || '',
              role: payload.role || current[payload.from]?.role,
              color: payload.color || current[payload.from]?.color,
              lastSeen: Date.now(),
            },
          }));
        })
        .on('broadcast', { event: 'voice-role' }, async ({ payload }) => {
          if (!payload?.targetId || !payload?.role) return;
          await applyRoleChange(payload.targetId, payload.role);
        })
        .on('broadcast', { event: 'voice-role-sync' }, ({ payload }) => {
          if (!payload?.roles || payload.from === profile.id) return;
          setRoomRoles((current) => ({ ...current, ...payload.roles }));
          const myRole = payload.roles?.[profile.id]?.role;
          if (myRole) applyRoleChange(profile.id, myRole);
        })
        .on('broadcast', { event: 'voice-force-mute' }, ({ payload }) => {
          if (payload?.targetId === profile.id) setLocalMuted(true);
        })
        .on('broadcast', { event: 'voice-mute-all' }, ({ payload }) => {
          if (payload?.from !== profile.id) setLocalMuted(true);
        })
        .on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
          handleSignal(payload);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              name: displayUser(profile),
              color: userColor(profile),
              avatar_url: profile.avatar_url || '',
              muted: mutedRef.current,
              role: localRoleRef.current,
              mic_allowed: micAllowedRef.current,
              has_mic: Boolean(localStreamRef.current),
              speaking: speakingRef.current,
              in_voice: true,
              joined_at: joinedAtRef.current,
            });
            syncPresence(channel);
            await channel.send({
              type: 'broadcast',
              event: 'voice-join',
              payload: { from: profile.id, name: displayUser(profile), color: userColor(profile), avatar_url: profile.avatar_url || '', role: localRoleRef.current },
            });
          }
        });

      channelRef.current = channel;
    } catch (err) {
      activeRef.current = false;
      setJoined(false);
      setLocalMicActive(false);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setVoiceError(friendlyMicError(err));
    }
  }

  async function toggleMute() {
    await setLocalMuted(!mutedRef.current);
  }

  async function assignVoiceRole(targetId, role) {
    await applyRoleChange(targetId, role);
    await sendBroadcast('voice-role', {
      from: profile.id,
      fromName: displayUser(profile),
      targetId,
      role,
      at: Date.now(),
    });
  }

  async function forceMute(targetId) {
    await sendBroadcast('voice-force-mute', { from: profile.id, targetId });
  }

  async function muteAll() {
    await setLocalMuted(true);
    await sendBroadcast('voice-mute-all', { from: profile.id, fromName: displayUser(profile) });
  }

  function connectStreamToRecorder(stream, key) {
    const audioContext = recordingAudioContextRef.current;
    const destination = recordingDestinationRef.current;
    if (!audioContext || !destination || !stream || recordingSourcesRef.current.has(key)) return;
    try {
      const source = audioContext.createMediaStreamSource(stream);
      const nodes = createVoiceProcessingChain(audioContext, source, destination);
      recordingSourcesRef.current.set(key, { source, nodes });
    } catch (err) {
      console.warn('Could not add stream to recording mix', err);
    }
  }

  function startRecording() {
    setRecordingError('');
    if (!joined) return;
    if (!window.MediaRecorder) {
      setRecordingError('This browser does not support voice recording.');
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setRecordingError('This browser does not support audio mixing for recording.');
      return;
    }

    try {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      if (cleanWavUrl) URL.revokeObjectURL(cleanWavUrl);
      setRecordingUrl('');
      setRecordingName('');
      setCleanWavUrl('');
      setCleanWavName('');
      recordedChunksRef.current = [];
      recordingSourcesRef.current.clear();

      const audioContext = new AudioContextClass();
      const destination = audioContext.createMediaStreamDestination();
      recordingAudioContextRef.current = audioContext;
      recordingDestinationRef.current = destination;

      if (localStreamRef.current) connectStreamToRecorder(localStreamRef.current, `local-${profile.id}`);
      Object.entries(remoteStreams).forEach(([peerId, stream]) => connectStreamToRecorder(stream, `remote-${peerId}`));

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const recorderOptions = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
      const recorder = new MediaRecorder(destination.stream, recorderOptions);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || 'audio/webm' });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        setRecordingName(`thrylos-voice-raw-${stamp}.webm`);
        try {
          const cleanBlob = await createCleanWavFromRecording(blob);
          const cleanUrl = URL.createObjectURL(cleanBlob);
          setCleanWavUrl(cleanUrl);
          setCleanWavName(`thrylos-voice-clean-${stamp}.wav`);
        } catch (err) {
          setRecordingError(err.message || 'Clean WAV conversion failed. You can still download the WebM.');
        }
        recordingAudioContextRef.current?.close().catch(() => null);
        recordingAudioContextRef.current = null;
        recordingDestinationRef.current = null;
        recordingSourcesRef.current.clear();
      };
      recorder.start(1000);
      setRecording(true);
    } catch (err) {
      setRecordingError(err.message || 'Could not start recording.');
      setRecording(false);
    }
  }

  useEffect(() => {
    if (!recording) return;
    if (localStreamRef.current) connectStreamToRecorder(localStreamRef.current, `local-${profile.id}`);
    Object.entries(remoteStreams).forEach(([peerId, stream]) => connectStreamToRecorder(stream, `remote-${peerId}`));
  }, [recording, remoteStreams, localMicActive, profile.id]);

  useEffect(() => () => { stopVoice(); }, [stopVoice]);

  const roomStartedTime = roomStartedAt ? new Date(roomStartedAt).getTime() : null;
  const elapsed = joined && roomStartedTime ? formatDuration(nowTick - roomStartedTime) : '00:00';
  const selfRole = joined && profile.id === hostId ? 'host' : localRole;
  const canUseMic = micAllowed || selfRole === 'host' || selfRole === 'cohost';
  const canModerateVoice = joined && (selfRole === 'host' || selfRole === 'cohost' || profile.role === 'admin');
  const canManageCohosts = joined && (selfRole === 'host' || profile.role === 'admin');
  const memberEntries = Object.entries(voiceMembers).filter(([id]) => id !== profile.id);
  const memberCount = joined ? Math.max(1, Object.keys(voiceMembers).length) : 0;

  return (
    <aside className={`voice-card ${compact ? 'inside-chat' : 'glass-card'}`}>
      <div className="voice-head improved">
        <div>
          <span className="eyebrow">VOICE ROOM</span>
          <h2>Live voice room</h2>
          <p>Join with your microphone or enter as a listener. The room updates live for every member.</p>
        </div>
        <div className="voice-status-stack">
          <span className={joined ? 'voice-status on' : 'voice-status'}>{joined ? 'Live' : 'Off'}</span>
          {joined && <span className="voice-timer">{elapsed}</span>}
        </div>
      </div>

      {voiceError && <div className="error-box">{voiceError}</div>}
      {recordingError && <div className="error-box">{recordingError}</div>}

      <div className="mic-picker-card">
        <label>
          Microphone input
          <select value={selectedMicId} onChange={(event) => setSelectedMicId(event.target.value)} disabled={joined && localMicActive}>
            <option value="">System default microphone</option>
            {audioDevices.map((device, index) => (
              <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <button className="ghost-btn compact" type="button" onClick={refreshMicrophones}>Refresh mics</button>
        {micStatus && <small>{micStatus}</small>}
      </div>

      {!joined ? (
        <div className="join-mode-grid">
          <button className="primary-btn" type="button" onClick={() => startVoice('speaker')}>Join with mic</button>
          <button className="ghost-btn" type="button" onClick={() => startVoice('listener')}>Listen only</button>
        </div>
      ) : (
        <>
          <div className="voice-room-summary">
            <span><strong>{memberCount}</strong><small>members</small></span>
            <span><strong>{voiceRoleLabel(selfRole)}</strong><small>your role</small></span>
            <span><strong>{localMicActive ? (muted ? 'Muted' : 'Open') : 'Off'}</strong><small>your mic</small></span>
          </div>

          <div className="voice-actions upgraded">
            {canUseMic ? (
              localMicActive ? (
                <>
                  <button className="ghost-btn" type="button" onClick={toggleMute}>{muted ? 'Unmute self' : 'Mute self'}</button>
                  <button className="ghost-btn" type="button" onClick={() => disableMic(true)}>Drop mic</button>
                </>
              ) : (
                <button className="primary-btn" type="button" onClick={enableMic}>Enable mic</button>
              )
            ) : (
              <span className="listener-pill">Listener mode</span>
            )}
            {canModerateVoice && <button className="ghost-btn" type="button" onClick={muteAll}>Mute all</button>}
            {!recording ? (
              <button className="ghost-btn record-btn" type="button" onClick={startRecording}>Record</button>
            ) : (
              <button className="danger-btn" type="button" onClick={stopRecording}>Stop recording</button>
            )}
            <button className="danger-btn" type="button" onClick={stopVoice}>Leave</button>
          </div>

          {(recording || recordingUrl || cleanWavUrl) && (
            <div className="recording-box">
              {recording && <span className="recording-live"><i /> Recording clean local mix…</span>}
              {cleanWavUrl && <a className="ghost-link primary-download" href={cleanWavUrl} download={cleanWavName || 'voice-clean.wav'}>Download cleaned WAV</a>}
              {recordingUrl && <a className="ghost-link" href={recordingUrl} download={recordingName || 'voice-raw.webm'}>Download raw WebM</a>}
              <small>The app records through a voice filter and also creates a cleaned WAV copy after you stop.</small>
            </div>
          )}
        </>
      )}

      <div className="voice-members voice-avatar-grid" aria-label="Voice room members">
        <div className="voice-member-row compact" style={{ '--member-color': userColor(profile) }}>
          <VoiceAvatarTile
            profile={profile}
            name={joined ? displayUser(profile) : 'Not connected'}
            role={selfRole}
            muted={!localMicActive || muted}
            color={userColor(profile)}
            speaking={localSpeaking}
          />
          {joined && <small className="voice-name-chip">You · {voiceRoleLabel(selfRole)}</small>}
        </div>
        {memberEntries.map(([peerId, info]) => {
          const stream = remoteStreams[peerId];
          const effectiveRole = getEffectiveRole(peerId, info);
          const state = remoteStates[peerId] || {};
          const isPeerMuted = Boolean(state.muted || info.muted || effectiveRole === 'listener');
          const peerName = remoteNames[peerId] || info.name || 'Member';
          const color = info.color || '#e31b2f';
          const memberProfile = {
            display_name: peerName,
            handle: peerName,
            chat_color: color,
            avatar_url: state.avatar_url || info.avatar_url || '',
          };
          return (
            <div className="voice-member-row compact" key={peerId} style={{ '--member-color': color }}>
              <VoiceAvatarTile
                stream={stream}
                profile={memberProfile}
                name={peerName}
                role={effectiveRole}
                muted={isPeerMuted}
                color={color}
                speaking={Boolean(state.speaking || info.speaking)}
              />
              <small className="voice-name-chip">{peerName} · {voiceRoleLabel(effectiveRole)}</small>
              {canModerateVoice && (
                <div className="voice-control-row avatar-controls">
                  {canManageCohosts && (
                    effectiveRole === 'cohost' ? (
                      <button type="button" className="tiny-action" onClick={() => assignVoiceRole(peerId, 'speaker')}>Remove sub-host</button>
                    ) : (
                      <button type="button" className="tiny-action" onClick={() => assignVoiceRole(peerId, 'cohost')}>Make sub-host</button>
                    )
                  )}
                  {effectiveRole === 'listener' ? (
                    <button type="button" className="tiny-action" onClick={() => assignVoiceRole(peerId, 'speaker')}>Allow mic</button>
                  ) : (
                    <button type="button" className="tiny-action" onClick={() => assignVoiceRole(peerId, 'listener')}>Take mic</button>
                  )}
                  <button type="button" className="tiny-action danger" onClick={() => forceMute(peerId)}>Mute</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="tiny-note">
        {joined ? 'Host controls are live. Sub-hosts can mute members, mute all, and manage mic rights.' : 'Use listener mode when you only want to hear the room.'}
      </p>
    </aside>
  );
}

function ProfileCard({ profile, setProfile }) {
  const [handle, setHandle] = useState(profile.handle || '');
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [chatColor, setChatColor] = useState(userColor(profile));
  const [bio, setBio] = useState(profile.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [avatarPreview, setAvatarPreview] = useState(profileAvatarUrl(profile));
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  useEffect(() => {
    setHandle(profile.handle || '');
    setDisplayName(profile.display_name || '');
    setChatColor(userColor(profile));
    setBio(profile.bio || '');
    setAvatarUrl(profile.avatar_url || '');
    setAvatarPreview(profileAvatarUrl(profile));
  }, [profile]);

  async function saveProfile(e) {
    e.preventDefault();
    const nextHandle = normalizeHandle(handle);
    const nextDisplayName = displayName.trim();

    if (nextHandle.length < 3) {
      alert('Username must be at least 3 characters and can use letters, numbers and underscore only.');
      return;
    }
    if (nextDisplayName.length < 1 || nextDisplayName.length > 48) {
      alert('Display name must be 1-48 characters.');
      return;
    }

    if (nextHandle !== profile.handle) {
      const { error: authError } = await supabase.auth.updateUser({
        email: memberLoginEmail(nextHandle),
      });
      if (authError) {
        alert(friendlyAuthError(authError));
        return;
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        handle: nextHandle,
        display_name: nextDisplayName,
        chat_color: chatColor,
        bio: bio.trim(),
        avatar_url: avatarUrl || null,
        last_seen: new Date().toISOString(),
      })
      .eq('id', profile.id)
      .select('*')
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setHandle(data.handle || nextHandle);
    setProfile(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  async function uploadAvatar(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert('Profile image must be under 3 MB.');
      return;
    }

    setAvatarBusy(true);
    const oldPreview = avatarPreview;
    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);

    let publicUrl = '';
    try {
      publicUrl = await uploadImageFile(file, `avatars/${profile.id}`);
    } catch (uploadError) {
      alert(uploadError?.message || 'Avatar upload failed.');
      setAvatarPreview(oldPreview);
      URL.revokeObjectURL(localPreview);
      setAvatarBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl, last_seen: new Date().toISOString() })
      .eq('id', profile.id)
      .select('*')
      .single();

    if (error) {
      alert(error.message);
      setAvatarPreview(oldPreview);
      URL.revokeObjectURL(localPreview);
    } else {
      setAvatarUrl(publicUrl);
      setAvatarPreview(publicUrl);
      setProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }
    setAvatarBusy(false);
  }

  async function removeAvatar() {
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: null, last_seen: new Date().toISOString() })
      .eq('id', profile.id)
      .select('*')
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setAvatarUrl('');
    setAvatarPreview('');
    setProfile(data);
  }

  async function changePassword(e) {
    e.preventDefault();
    setPasswordMessage('');
    if (newPassword.length < 6) {
      setPasswordMessage('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('The new password fields do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      if (currentPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: memberLoginEmail(profile.handle),
          password: currentPassword,
        });
        if (signInError) throw new Error(friendlyAuthError(signInError));
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(friendlyAuthError(error));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password changed. Use the new password next time you log in.');
    } catch (err) {
      setPasswordMessage(err.message || 'Password change failed.');
    } finally {
      setPasswordBusy(false);
    }
  }

  const previewProfile = { ...profile, handle, display_name: displayName, chat_color: chatColor, avatar_url: avatarPreview || avatarUrl };

  return (
    <aside className="side-card glass-card">
      <h2>Your anonymous profile</h2>
      <div className="profile-big">
        <UserAvatar profile={previewProfile} className="avatar profile-photo" />
        <div>
          <strong>{displayName || profile.display_name || profile.handle}</strong>
          <small>@{handle || profile.handle} · {roleBadge(profile.role)}</small>
        </div>
      </div>
      <form onSubmit={saveProfile} className="profile-form">
        <label className="avatar-upload-box">
          Profile image
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => uploadAvatar(e.target.files?.[0])} disabled={avatarBusy} />
          <span>{avatarBusy ? 'Uploading…' : 'Upload an avatar. It appears instantly in chat and voice.'}</span>
        </label>
        {avatarPreview && <button className="ghost-btn compact" type="button" onClick={removeAvatar}>Remove profile image</button>}
        <div className="profile-edit-grid">
          <label>
            Username / login handle
            <input value={handle} onChange={(e) => setHandle(normalizeHandle(e.target.value))} minLength={3} maxLength={24} required />
            <small className="tiny-note">Changing this also changes the handle you use to log in.</small>
          </label>
          <label>
            Display name / writer name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} required />
            <small className="tiny-note">This is the name shown under your articles and in chat.</small>
          </label>
        </div>
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

      <div className="password-panel">
        <button className="ghost-btn compact" type="button" onClick={() => { setPasswordOpen(!passwordOpen); setPasswordMessage(''); }}>
          {passwordOpen ? 'Close password change' : 'Change password'}
        </button>
        {passwordOpen && (
          <form className="profile-form password-change-form" onSubmit={changePassword}>
            <label>
              Current password
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" placeholder="Current password" />
              <small className="tiny-note">Recommended for safety. Leave blank only if Supabase asks for a recent login.</small>
            </label>
            <label>
              New password
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} autoComplete="new-password" placeholder="At least 6 characters" required />
            </label>
            <label>
              Confirm new password
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} autoComplete="new-password" placeholder="Repeat new password" required />
            </label>
            {passwordMessage && <div className={passwordMessage.includes('changed') ? 'success-box' : 'error-box'}>{passwordMessage}</div>}
            <button className="primary-btn" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Changing…' : 'Save new password'}</button>
          </form>
        )}
      </div>
    </aside>
  );
}


function PublicArticleHome({ settings = DEFAULT_SITE_SETTINGS, onEnterMembers }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null);

  const loadPublicArticles = useCallback(async () => {
    let query = supabase
      .from('articles')
      .select('*, profiles(handle, display_name, role, chat_color, avatar_url)')
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(60);
    query = applyArticleCategoryFilter(query, category);
    const { data } = await query;
    setArticles(data || []);
    setLoading(false);
  }, [category]);

  useEffect(() => {
    loadPublicArticles();
    const channel = supabase
      .channel('public-editorial-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, loadPublicArticles)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadPublicArticles)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadPublicArticles]);

  const lead = articles[0];
  const rest = articles.slice(1);

  return (
    <main className="public-site-shell">
      <header className="public-topbar glass-card">
        <div className="brand-lockup">
          <BrandMark settings={settings} />
          <div>
            <strong>{cleanBrandText(settings.site_title, APP_NAME)}</strong>
            <small>{cleanBrandText(settings.header_tagline, DEFAULT_SITE_SETTINGS.header_tagline)}</small>
          </div>
        </div>
        <button className="primary-btn compact" type="button" onClick={onEnterMembers}>Σύνδεση</button>
      </header>

      <section className="public-hero glass-card" style={{ '--hero-image': `url(${settings.hero_url || BRAND_HERO})` }}>
        <span className="eyebrow">THRYLOS UNITED</span>
        <h1>Άρθρα, γνώμες και νέα από την ερυθρόλευκη κοινότητα.</h1>
        <p>Διάβασε κείμενα ανά κατηγορία: μπάσκετ, ποδόσφαιρο, ερασιτέχνης, μεταγραφές, media και απόψεις.</p>
        <div className="public-category-row">
          {ARTICLE_CATEGORIES.map((item) => (
            <button key={item.id} className={category === item.id ? 'active' : ''} type="button" onClick={() => setCategory(item.id)}>{item.label}</button>
          ))}
        </div>
      </section>

      {loading && <div className="glass-card loading-card">Loading articles…</div>}
      {!loading && articles.length === 0 && <div className="glass-card loading-card">No articles have been published yet.</div>}

      {lead && (
        <section className="public-layout">
          <article className="public-lead-card glass-card" onClick={() => setSelected(lead)} role="button" tabIndex={0}>
            {articleCoverUrl(lead) && <img src={articleCoverUrl(lead)} alt="Article cover" loading="eager" decoding="async" fetchPriority="high" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
            <div>
              <span className="article-category-pill">{categoryCaps(lead.category)}</span>
              <h2>{lead.title || lead.content.slice(0, 90)}</h2>
              <p>{lead.excerpt || lead.content.slice(0, 220)}</p>
              <small>By {displayUser(lead.profiles)} · {formatTime(lead.created_at)}</small>
            </div>
          </article>
          <aside className="public-sidebar glass-card">
            <span className="eyebrow">LATEST</span>
            {articles.slice(0, 8).map((article, index) => (
              <button className="public-latest-row" key={article.id} type="button" onClick={() => setSelected(article)}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>{article.title || article.content.slice(0, 80)}<small>{displayUser(article.profiles)} · {categoryLabel(article.category)}</small></span>
              </button>
            ))}
          </aside>
        </section>
      )}

      <section className="public-grid">
        {rest.map((article) => (
          <article className="public-article-card glass-card" key={article.id} onClick={() => setSelected(article)} role="button" tabIndex={0}>
            {articleCoverUrl(article) && <img src={articleCoverUrl(article)} alt="Article cover" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
            <span className="article-category-pill">{categoryCaps(article.category)}</span>
            <h3>{article.title || article.content.slice(0, 80)}</h3>
            <p>{article.excerpt || article.content.slice(0, 160)}</p>
            <small>By {displayUser(article.profiles)} · {formatTime(article.published_at || article.created_at)}</small>
          </article>
        ))}
      </section>

      {selected && (
        <div className="modal-backdrop article-reader-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <article className="article-reader glass-card">
            <button className="ghost-btn compact article-close" type="button" onClick={() => setSelected(null)}>Close</button>
            {articleCoverUrl(selected) && <img className="article-reader-cover" src={articleCoverUrl(selected)} alt="Article cover" loading="eager" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
            <span className="article-category-pill">{categoryCaps(selected.category)}</span>
            <h1>{selected.title || 'Thrylos United article'}</h1>
            <div className="article-byline">
              <UserAvatar profile={selected.profiles} className="comment-avatar" />
              <span>By <strong>{displayUser(selected.profiles)}</strong> · {formatTime(selected.created_at)}</span>
            </div>
            <p className="article-reader-body">{selected.content}</p>
            {selected.source_url && isSafeUrl(selected.source_url) && <a className="source-link" href={selected.source_url} target="_blank" rel="noreferrer">Open source</a>}
            {getYoutubeId(selected.video_url) && (
              <div className="video-frame"><iframe title="YouTube video" src={`https://www.youtube-nocookie.com/embed/${getYoutubeId(selected.video_url)}`} allowFullScreen /></div>
            )}
          </article>
        </div>
      )}
    </main>
  );
}


function ArticleManager({ profile, onEdit }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());

  const loadArticles = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('articles')
      .select('*, profiles(handle, display_name, role, chat_color, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (profile?.role !== 'admin') query = query.eq('author_id', profile.id);
    const { data } = await query;
    setArticles(data || []);
    setLoading(false);
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    loadArticles();
    const channel = supabase
      .channel('editor-article-manager')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, loadArticles)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadArticles)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadArticles]);

  useEffect(() => {
    const pulse = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(pulse);
  }, []);

  useEffect(() => {
    const nextTime = nextScheduledTimeFromArticles(articles);
    if (!nextTime) return undefined;
    const timer = window.setTimeout(loadArticles, Math.max(500, nextTime - Date.now() + 1100));
    return () => window.clearTimeout(timer);
  }, [articles, loadArticles]);

  async function confirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target?.id) return;
    const { error } = await supabase.from('articles').delete().eq('id', target.id);
    if (error) alert(error.message);
    loadArticles();
  }

  return (
    <section className="glass-card editor-clean-panel">
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete article?"
        body="This article will be removed from the public page and the editor list."
        confirmLabel="Delete article"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <div className="clean-panel-head">
        <div>
          <span className="eyebrow">ARTICLES</span>
          <h2>{profile?.role === 'admin' ? 'All articles' : 'My articles'}</h2>
          <p className="panel-subtitle">Published, scheduled and hidden articles stay here. Scheduled articles show their countdown until public release.</p>
        </div>
        <button className="ghost-btn compact" type="button" onClick={loadArticles}>Refresh</button>
      </div>
      {loading && <p className="empty-text">Loading articles…</p>}
      {!loading && articles.length === 0 && <p className="empty-text">No articles yet.</p>}
      <div className="editor-article-list enhanced-article-list">
        {articles.map((article) => {
          void clockTick;
          const status = articleStatus(article);
          const imageSrc = articleCoverUrl(article, '');
          const canManage = article.author_id === profile.id || profile.role === 'admin';
          return (
            <article key={article.id} className={`editor-article-row article-status-${status}`}>
              {imageSrc ? <img src={imageSrc} alt="" loading="lazy" decoding="async" /> : <div className="article-placeholder-thumb">TU</div>}
              <div className="editor-article-row-main">
                <div className="article-row-titleline">
                  <strong>{article.title || editorialTitle(article.content)}</strong>
                  <span className={`article-status-pill ${status}`}>{articleStatusLabel(article)}</span>
                </div>
                <small>{categoryLabel(article.category)} · {displayUser(article.profiles)} · Created {formatTime(article.published_at || article.created_at)}</small>
                {status === 'scheduled' && <small className="schedule-line">Athens publish time: {athensFormat(article.published_at)} · <PublishCountdown value={article.published_at} onDone={loadArticles} /></small>}
                {status === 'hidden' && <small className="schedule-line">Hidden from public pages. Use Edit to publish or schedule it.</small>}
                <p>{article.excerpt || String(article.content || '').slice(0, 180)}</p>
                <details className="editor-mini-preview">
                  <summary>Preview in editor</summary>
                  <ArticlePreviewCard draft={{ ...article, mediaLinks: [article.video_url, ...safeJsonArray(article.media_urls)].filter(Boolean).join('\n'), cover_preview: imageSrc }} profile={article.profiles || profile} />
                </details>
              </div>
              {canManage && (
                <div className="article-row-actions">
                  <button className="ghost-btn compact" type="button" onClick={() => onEdit?.(article)}>Edit</button>
                  <button className="danger-mini-btn" type="button" onClick={() => setDeleteTarget(article)}>Delete</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}


function EditorDashboard({ profile, setProfile, settings, setView }) {
  const [tab, setTab] = useState(canPublishArticles(profile?.role) ? 'write' : 'articles');
  const [editingArticle, setEditingArticle] = useState(null);
  const tabs = [
    canPublishArticles(profile?.role) && ['write', editingArticle ? 'Editing' : 'New article'],
    ['articles', 'Articles'],
    ['profile', 'Profile'],
    profile?.role === 'admin' && ['invites', 'Invites'],
  ].filter(Boolean);

  function startEdit(article) {
    setEditingArticle(article);
    setTab('write');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearEdit(nextTab = 'articles') {
    setEditingArticle(null);
    setTab(nextTab);
  }

  return (
    <main className="editor-studio-page">
      <section className="editor-studio-hero glass-card">
        <div>
          <span className="eyebrow">THRYLOS UNITED STUDIO</span>
          <h1>Thrylos United publishing studio</h1>
          <p>Write articles, schedule publishing in Athens time, manage drafts/hidden articles and update your writer profile.</p>
        </div>
        <div className="editor-quick-actions">
          <button className="ghost-btn" type="button" onClick={() => window.open('/', '_self')}>Public page</button>
          {profile?.role === 'admin' && <button className="primary-btn compact" type="button" onClick={() => setView('admin-site')}>Site settings</button>}
        </div>
      </section>

      <nav className="editor-tabs glass-card">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} type="button" onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      <section className="editor-tab-body">
        {tab === 'write' && <Composer key={editingArticle?.id || 'new'} profile={profile} editingArticle={editingArticle} onCancelEdit={() => clearEdit('articles')} onCreated={() => clearEdit('articles')} />}
        {tab === 'articles' && <ArticleManager profile={profile} onEdit={startEdit} />}
        {tab === 'profile' && <ProfileCard profile={profile} setProfile={setProfile} />}
        {tab === 'invites' && profile?.role === 'admin' && <InvitePanel profile={profile} />}
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SITE_SETTINGS);
  const [view, setView] = useState('feed');
  const [pageSettling, setPageSettling] = useState(true);
  const [showMemberGate, setShowMemberGate] = useState(new URLSearchParams(window.location.search).has('invite'));
  const rawPath = window.location.pathname.replace(/\/+$/, '');
  const currentPath = rawPath.toLowerCase();
  const articleMatch = rawPath.match(/^\/article\/([0-9a-fA-F-]{8,})$/);
  const v2ArticleMatch = rawPath.match(/^\/(?:v2|red-home|magazine)\/article\/([0-9a-fA-F-]{8,})$/);
  const articleId = (v2ArticleMatch || articleMatch) ? (v2ArticleMatch?.[1] || articleMatch?.[1] || '') : '';
  const articleVariant = v2ArticleMatch ? 'magazine' : 'classic';
  const editorMode = currentPath === '/editor' || currentPath === '/login';
  const publicAltMode = currentPath === '/v2' || currentPath === '/red-home' || currentPath === '/magazine';

  const refreshSiteSettings = useCallback(async () => {
    const next = await loadSiteSettings();
    setSiteSettings(next);
    applyDocumentBranding(next);
  }, []);

  useEffect(() => {
    applyDocumentBranding(siteSettings);
  }, [siteSettings]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPageSettling(false), 240);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const preventContext = (event) => event.preventDefault();
    const preventCopy = (event) => {
      if (!allowCopyTarget(event.target)) event.preventDefault();
    };
    const preventSelect = (event) => {
      if (!allowCopyTarget(event.target)) event.preventDefault();
    };
    document.addEventListener('contextmenu', preventContext);
    document.addEventListener('copy', preventCopy);
    document.addEventListener('cut', preventCopy);
    document.addEventListener('selectstart', preventSelect);
    return () => {
      document.removeEventListener('contextmenu', preventContext);
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('cut', preventCopy);
      document.removeEventListener('selectstart', preventSelect);
    };
  }, []);

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

  if (!isConfigured()) return <><PageLoadingBar active={pageSettling} /><SetupNotice settings={siteSettings} /></>;
  if (loading) return <><PageLoadingBar active /><main className="setup-shell"><div className="glass-card loading-card loading-state-card"><span className="loading-spinner" />Loading members area…</div></main></>;
  if (!session || !profile) {
    if (articleId) return <><PageLoadingBar active={pageSettling} /><ArticlePage settings={siteSettings} articleId={articleId} variant={articleVariant} /></>;
    if (publicAltMode) return <><PageLoadingBar active={pageSettling} /><PublicMagazinePage settings={siteSettings} /></>;
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
    if (params.has('invite') || params.has('login') || path === '/editor' || path === '/login') {
      return <><PageLoadingBar active={pageSettling} /><InviteGate onProfileReady={setProfile} settings={siteSettings} session={session} /></>;
    }
    return <><PageLoadingBar active={pageSettling} /><PublicFrontPage settings={siteSettings} /></>;
  }

  if (articleId) return <><PageLoadingBar active={pageSettling} /><ArticlePage settings={siteSettings} articleId={articleId} profile={profile} variant={articleVariant} /></>;
  if (publicAltMode) return <><PageLoadingBar active={pageSettling} /><PublicMagazinePage settings={siteSettings} profile={profile} /><ChatPanel profile={profile} /></>;

  return (
    <>
      <PageLoadingBar active={pageSettling} />
      <Shell profile={profile} setProfile={setProfile} settings={siteSettings} view={view} setView={setView}>
      {view === 'admin-site' && profile.role === 'admin' ? (
        <AdminSiteSettings
          settings={siteSettings}
          onSettingsChanged={refreshSiteSettings}
          goBack={() => setView('feed')}
        />
      ) : editorMode ? (
        <EditorDashboard profile={profile} setProfile={setProfile} settings={siteSettings} setView={setView} />
      ) : (
        <main className="member-clean-home">
          <PublicFrontPage settings={siteSettings} profile={profile} />
        </main>
      )}
      <ChatPanel profile={profile} />
      <footer className="footer-note">{siteSettings.footer_text}</footer>
      </Shell>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
