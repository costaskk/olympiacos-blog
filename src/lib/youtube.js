export function getYoutubeId(input) {
  if (!input) return null;
  try {
    const url = new URL(input.trim());
    if (url.hostname.includes('youtu.be')) return url.pathname.replace('/', '').slice(0, 20);
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
      return url.searchParams.get('v');
    }
    return null;
  } catch {
    const match = String(input).match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{6,})/);
    return match ? match[1] : null;
  }
}

export function isSafeUrl(input) {
  if (!input) return true;
  try {
    const url = new URL(input.trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}
