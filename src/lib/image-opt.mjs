import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC_IMG_DIR = path.join(ROOT_DIR, 'public', '_images');
const MANIFEST_PATH = path.join(PUBLIC_IMG_DIR, 'manifest.json');

/** In-memory cache and in-flight deduplication across uz/en/ru parallel builds */
let manifestCache = null;
const inFlight = new Map();

function loadManifest() {
  if (manifestCache) return manifestCache;
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      return manifestCache;
    }
  } catch {
    // ignore corrupt manifest
  }
  manifestCache = {};
  return manifestCache;
}

function saveManifest(manifest) {
  try {
    fs.mkdirSync(PUBLIC_IMG_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  } catch {
    // ignore write errors in read-only environments
  }
}

/**
 * Rewrite slow GitHub / Next.js redirect URLs to direct fast CDN URLs.
 */
export function normalizeImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();

  // 1. https://github.com/<owner>/<repo>/blob/<branch>/<path>?raw=true
  // 2. https://github.com/<owner>/<repo>/raw/<branch>/<path>
  const ghMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/?#]+)\/([^?#]+)(?:\?.*)?$/i
  );
  if (ghMatch) {
    const [, owner, repo, branch, filePath] = ghMatch;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  }

  // 3. Anthropic _next/image w=3840 -> w=1920 for faster upstream fetch
  if (trimmed.includes('anthropic.com/_next/image') && trimmed.includes('w=3840')) {
    return trimmed.replace('w=3840', 'w=1920');
  }

  return trimmed;
}

/**
 * Optimize a remote or local image URL into local static WebP variants
 * (`/_images/<hash>-720w.webp` and `/_images/<hash>-1280w.webp`).
 */
export async function optimizeImage(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (!/^https?:\/\//i.test(rawUrl)) {
    return {
      cardSrc: rawUrl,
      fullSrc: rawUrl,
      srcset: undefined,
      width: undefined,
      height: undefined,
    };
  }

  const manifest = loadManifest();
  const hash = crypto.createHash('sha1').update(rawUrl.trim()).digest('hex').slice(0, 12);
  const cardRel = `/_images/${hash}-720w.webp`;
  const fullRel = `/_images/${hash}-1280w.webp`;
  const cardAbs = path.join(PUBLIC_IMG_DIR, `${hash}-720w.webp`);
  const fullAbs = path.join(PUBLIC_IMG_DIR, `${hash}-1280w.webp`);

  if (manifest[hash] && fs.existsSync(cardAbs) && fs.existsSync(fullAbs)) {
    return manifest[hash];
  }

  if (inFlight.has(hash)) {
    return inFlight.get(hash);
  }

  const job = (async () => {
    const fetchUrl = normalizeImageUrl(rawUrl);
    try {
      fs.mkdirSync(PUBLIC_IMG_DIR, { recursive: true });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'muhammadjon.me-image-optimizer/1.0',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());

      const img = sharp(buf, { failOn: 'none' });
      const meta = await img.metadata();
      const origW = meta.width || 1200;
      const origH = meta.height || 675;

      const cardW = Math.min(origW, 720);
      const cardH = Math.max(1, Math.round((origH * cardW) / origW));
      const fullW = Math.min(origW, 1280);
      const fullH = Math.max(1, Math.round((origH * fullW) / origW));

      await sharp(buf, { failOn: 'none' })
        .resize({ width: cardW, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toFile(cardAbs);

      await sharp(buf, { failOn: 'none' })
        .resize({ width: fullW, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(fullAbs);

      // If dist/_images already exists during build, mirror there too so
      // newly-fetched images in astro build are immediately present in dist/.
      const distImgDir = path.join(ROOT_DIR, 'dist', '_images');
      if (fs.existsSync(path.join(ROOT_DIR, 'dist'))) {
        fs.mkdirSync(distImgDir, { recursive: true });
        fs.copyFileSync(cardAbs, path.join(distImgDir, `${hash}-720w.webp`));
        fs.copyFileSync(fullAbs, path.join(distImgDir, `${hash}-1280w.webp`));
      }

      const entry = {
        cardSrc: cardRel,
        fullSrc: fullRel,
        srcset: `${cardRel} ${cardW}w, ${fullRel} ${fullW}w`,
        width: fullW,
        height: fullH,
        cardWidth: cardW,
        cardHeight: cardH,
      };
      manifest[hash] = entry;
      saveManifest(manifest);
      return entry;
    } catch {
      return {
        cardSrc: fetchUrl,
        fullSrc: fetchUrl,
        srcset: undefined,
        width: undefined,
        height: undefined,
      };
    } finally {
      inFlight.delete(hash);
    }
  })();

  inFlight.set(hash, job);
  return job;
}
