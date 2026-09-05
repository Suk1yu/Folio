import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { minify } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');
const sourceAdmin = path.join(publicDir, 'js', 'admin-shared.js');

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyDir(src, dest, skip = new Set()) {
  const entries = await fs.readdir(src, { withFileTypes: true });

  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    if (skip.has(entry.name)) continue;

    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(from, to, new Set());
    } else {
      await fs.copyFile(from, to);
    }
  }
}

function sha256(data) {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex')
    .slice(0, 12);
}

async function buildAdminShared() {
  let source = await fs.readFile(sourceAdmin, 'utf8');

  // Keep the existing classic-script API.
  source += `\n\nObject.assign(window, {\n` +
    `sha256Hex, setupAdminToggle, isAdminMode, logoutAdmin, ensurePinModalExists, ` +
    `openPinModal, closePinModal, ensureAnonSignIn, withTimeout, submitPin, ` +
    `showAdminToast, uploadImageToStorage, loadImageFromFile, readTextFile, ` +
    `drawResizedCanvas, compressImageToDataUrl, drawSquareCroppedCanvas, ` +
    `compressAvatarToDataUrl, sanitizeYearLabel, getLocalReactions, setLocalReaction, ` +
    `getLocalReaction, toggleReaction, submitComment, listenToComments, softDeleteEntry, ` +
    `escapeHtmlShared, moveEntryOrder, renderOrderButtons, ensureCommentSheetExists, ` +
    `insertEmojiAtCursor, getSavedCommentName, getSavedCommentAvatar, renderAvatarMarkup, ` +
    `escapeAttrShared, openNamePopup, closeNamePopup, saveNameFromPopup, handleAvatarFileSelect, ` +
    `openCommentSheet, closeCommentSheet, ensureDetailSheetExists, openDetailSheet, ` +
    `closeDetailSheet, formatRelativeTime, renderCommentSheetList, handleCommentSheetListClick, ` +
    `submitCommentFromSheet, showCommentCooldownHint, ICONS\n});\n`;

  const minified = await minify(source, {
    compress: { passes: 2 },
    mangle: true,
    format: { comments: false },
    sourceMap: false
  });

  if (!minified.code) {
    throw new Error('Terser produced empty admin-shared bundle');
  }

  const obfuscated = JavaScriptObfuscator.obfuscate(minified.code, {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,

    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.75,

    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    splitStrings: false,

    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    selfDefending: false,
    disableConsoleOutput: false
  }).getObfuscatedCode();

  const hash = sha256(obfuscated);
  const fileName = `admin-shared.${hash}.js`;

  const outputAssetsDir = path.join(distDir, 'assets');

  await fs.mkdir(outputAssetsDir, { recursive: true });

  await fs.writeFile(
    path.join(outputAssetsDir, fileName),
    obfuscated,
    'utf8'
  );

  return `/assets/${fileName}`;
}

async function rewriteHtml(htmlPath, adminAsset) {
  let html = await fs.readFile(htmlPath, 'utf8');

  html = html.replace(
    /<script\s+src=["'](?:\.\/)?js\/admin-shared\.js["']\s*><\/script>/gi,
    `<script src="${adminAsset}"></script>`
  );

  html = html
    .replaceAll('href="index.html"', 'href="/"')
    .replaceAll("href='index.html'", "href='/'")
    .replaceAll('href="timeline.html"', 'href="/timeline"')
    .replaceAll("href='timeline.html'", "href='/timeline'")
    .replaceAll('href="gallery.html"', 'href="/gallery"')
    .replaceAll("href='gallery.html'", "href='/gallery'")
    .replaceAll('href="log-devs.html"', 'href="/log-devs"')
    .replaceAll("href='log-devs.html'", "href='/log-devs'");

  await fs.writeFile(htmlPath, html, 'utf8');
}

await rmrf(distDir);
await fs.mkdir(distDir, { recursive: true });

// Copy public files except the readable source admin-shared.js.
await copyDir(
  publicDir,
  distDir,
  new Set(['js'])
);

// Copy firebase-config.js as a public client file.
await fs.mkdir(path.join(distDir, 'js'), { recursive: true });

await fs.copyFile(
  path.join(publicDir, 'js', 'firebase-config.js'),
  path.join(distDir, 'js', 'firebase-config.js')
);

// Copy root assets/ → dist/assets/
const assetsDir = path.join(root, 'assets');
const distAssetsDir = path.join(distDir, 'assets');

try {
  await fs.access(assetsDir);

  await copyDir(assetsDir, distAssetsDir);

  console.log('Copied assets/ → dist/assets/');
} catch {
  console.log('No root assets/ directory found, skipping.');
}

const adminAsset = await buildAdminShared();

for (const name of [
  'index.html',
  'gallery.html',
  'timeline.html',
  'log-devs.html'
]) {
  await rewriteHtml(
    path.join(distDir, name),
    adminAsset
  );
}

console.log(`Built admin-shared: ${adminAsset}`);
console.log('Source admin-shared.js is excluded from dist.');