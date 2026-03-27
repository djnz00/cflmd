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

export function extractTextAlign(style) {
  const declarations = parseStyleDeclarations(style);
  const value = declarations.get('text-align');
  return value === 'left' || value === 'center' || value === 'right' ? value : null;
}

export function removeStyleProperty(style, property) {
  const declarations = parseStyleDeclarations(style);
  declarations.delete(String(property).trim().toLowerCase());
  return renderStyleDeclarations(declarations);
}

export function setStyleProperty(style, property, value) {
  const declarations = parseStyleDeclarations(style);
  declarations.set(String(property).trim().toLowerCase(), String(value).trim());
  return renderStyleDeclarations(declarations);
}

function parseStyleDeclarations(style) {
  const declarations = new Map();

  for (const declaration of String(style ?? '').split(';')) {
    const separatorIndex = declaration.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim();

    if (!property || !value) {
      continue;
    }

    declarations.set(property, value);
  }

  return declarations;
}

function renderStyleDeclarations(declarations) {
  if (declarations.size === 0) {
    return null;
  }

  return `${Array.from(declarations, ([property, value]) => `${property}: ${value}`).join('; ')};`;
}
