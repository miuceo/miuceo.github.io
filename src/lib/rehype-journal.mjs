/**
 * Newspaper layout for post bodies, derived purely from standard Markdown so
 * the source stays translation-safe (the LLM only ever sees `![alt](url)`):
 *
 *   - a paragraph holding exactly one image  -> <figure class="post-figure">
 *     with the alt text as its caption;
 *   - a paragraph holding two or more images (the editor's Gallery block
 *     writes them on consecutive lines) -> a scroll-snap slider that works
 *     with JS off; the post page adds arrows and a counter on top.
 *
 * Runs after rehype-sanitize, so it only ever wraps nodes that already passed
 * sanitisation, and it never copies attribute values into new attributes
 * other than the image's own src/alt, which sanitize has already vetted.
 * Also optimizes remote post images into local static WebP variants at build time.
 */
import { visit } from 'unist-util-visit';
import { optimizeImage } from './image-opt.mjs';

const isImg = (n) => n.type === 'element' && n.tagName === 'img';
const isFiller = (n) =>
  (n.type === 'text' && !n.value.trim()) || (n.type === 'element' && n.tagName === 'br');

function h(tagName, properties, children = []) {
  return { type: 'element', tagName, properties, children };
}

function text(value) {
  return { type: 'text', value };
}

async function figure(img, className, eager = false) {
  const alt = String(img.properties?.alt ?? '').trim();
  const rawSrc = String(img.properties?.src ?? '');
  const opt = rawSrc ? await optimizeImage(rawSrc) : null;

  const props = {
    ...img.properties,
    src: opt?.fullSrc || rawSrc,
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
  };
  if (eager) {
    props.fetchpriority = 'high';
  }
  if (opt?.srcset) {
    props.srcset = opt.srcset;
    props.sizes = '(max-width: 1060px) 94vw, 920px';
  }
  if (opt?.width && opt?.height) {
    props.width = opt.width;
    props.height = opt.height;
  }

  img.properties = props;
  const children = [img];
  if (alt) children.push(h('figcaption', {}, [text(alt)]));
  return h('figure', { className }, children);
}

export default function rehypeJournal() {
  return async (tree) => {
    const tasks = [];

    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'p' || !parent || index == null) return;
      const kids = node.children;
      if (!kids.length || !kids.every((k) => isImg(k) || isFiller(k))) return;
      const imgs = kids.filter(isImg);
      if (imgs.length === 0) return;

      tasks.push({ parent, index, imgs });
      return 'skip';
    });

    for (const { parent, index, imgs } of tasks) {
      const replacement =
        imgs.length === 1
          ? // The article's opening picture is the lead photo: load it right away.
            await figure(imgs[0], ['post-figure'], parent.type === 'root' && index === 0)
          : h('div', { className: ['gallery'], dataCount: String(imgs.length) }, [
              h(
                'div',
                { className: ['gallery-track'] },
                await Promise.all(imgs.map((img) => figure(img, ['gallery-slide'], false)))
              ),
            ]);

      parent.children[index] = replacement;
    }
  };
}
