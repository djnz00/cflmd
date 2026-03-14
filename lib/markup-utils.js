export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function escapeHtmlAttribute(text) {
  return escapeHtml(text).replaceAll("'", '&#39;');
}

export function encodeBase64(text) {
  return Buffer.from(String(text), 'utf8').toString('base64');
}

export function decodeBase64(value) {
  try {
    return value ? Buffer.from(value, 'base64').toString('utf8') : '';
  } catch {
    return '';
  }
}

export function normalizeImageWidth(width) {
  const normalized = String(width ?? '').trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

export function renderAttributeMap(attributes) {
  return Object.entries(attributes)
    .filter(([, value]) => value != null)
    .map(([name, value]) => ` ${name}="${escapeHtmlAttribute(value)}"`)
    .join('');
}
