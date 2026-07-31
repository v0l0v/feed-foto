const WP_API = 'https://www.thisiscolossal.com/wp-json/wp/v2/posts?categories=496&per_page=20';
const POST_API = 'https://www.thisiscolossal.com/wp-json/wp/v2/posts';

document.addEventListener('DOMContentLoaded', () => {
  loadFeeds();
  document.getElementById('count-colossal').addEventListener('click', () => setFilter('colossal'));
  document.getElementById('count-lomography').addEventListener('click', () => setFilter('lomography'));
  document.getElementById('count-booooooom').addEventListener('click', () => setFilter('booooooom'));
  document.getElementById('count-tpj').addEventListener('click', () => setFilter('tpj'));
  document.getElementById('count-swan').addEventListener('click', () => setFilter('swan'));
  document.getElementById('count-gspf').addEventListener('click', () => setFilter('gspf'));
});

let __activeFilter = null;

async function loadFeeds() {
  const [colossal, lomo, boom, tpj, swan, gspf] = await Promise.all([fetchColossal(), fetchLomography(), fetchBooooooom(), fetchTpj(), fetchSwan(), fetchGspf()]);
  window.__allEntries = [...colossal, ...lomo, ...boom, ...tpj, ...swan, ...gspf].sort((a, b) => (b._parsedDate || 0) - (a._parsedDate || 0));
  if (!window.__allEntries.length) { showEmpty(); return; }
  applyFilter();
}

async function fetchColossal() {
  const all = new Map();
  for (let page = 1; page <= 3; page++) {
    let data;
    try { data = await (await fetch(`${WP_API}&page=${page}`)).json(); } catch {}
    if (!Array.isArray(data) || !data.length) break;
    for (const p of data) {
      if (all.has(p.id)) continue;
      all.set(p.id, {
        _source: 'colossal',
        _id: p.id,
        _parsedDate: new Date(p.date),
        link: p.link,
        title: p.title.rendered,
        content: p.content.rendered
      });
    }
  }
  return [...all.values()];
}

async function fetchLomography() {
  // Try live API first (VPS mode)
  try {
    const resp = await fetch('/api/lomography');
    const data = await resp.json();
    if (data && data.status === 'ok' && data.items.length) return normalizeLomo(data.items);
  } catch {}
  // Fallback: static JSON (GitHub Pages)
  try {
    const resp = await fetch('lomography.json');
    const data = await resp.json();
    if (data && data.items) return normalizeLomo(data.items);
  } catch {}
  return [];
}

function normalizeLomo(items) {
  return items.map(i => ({
    _source: 'lomography',
    _id: i.link || i._id,
    _parsedDate: (i.date || i._parsedDate) ? new Date(i.date || i._parsedDate) : null,
    link: i.link,
    title: i.title,
    content: i.content || i.excerpt,
    thumbnail: i.thumbnail
  }));
}

async function fetchBooooooom() {
  // Try live API first (VPS mode)
  try {
    const resp = await fetch('/api/booooooom');
    const data = await resp.json();
    if (data && data.status === 'ok' && data.items.length) return normalizeBoom(data.items);
  } catch {}
  // Fallback: static JSON (GitHub Pages)
  try {
    const resp = await fetch('booooooom.json');
    const data = await resp.json();
    if (data && data.items) return normalizeBoom(data.items);
  } catch {}
  return [];
}

function normalizeBoom(items) {
  return items.map(i => ({
    _source: 'booooooom',
    _id: i.link || i._id,
    _parsedDate: (i.date || i._parsedDate) ? new Date(i.date || i._parsedDate) : null,
    link: i.link,
    title: i.title,
    content: i.content || i.excerpt,
    thumbnail: i.thumbnail
  }));
}

async function fetchTpj() {
  // Try live API first (VPS mode)
  try {
    const resp = await fetch('/api/tpj');
    const data = await resp.json();
    if (data && data.status === 'ok' && data.items.length) return normalizeTpj(data.items);
  } catch {}
  // Fallback: static JSON (GitHub Pages)
  try {
    const resp = await fetch('tpj.json');
    const data = await resp.json();
    if (data && data.items) return normalizeTpj(data.items);
  } catch {}
  return [];
}

function normalizeTpj(items) {
  return items.map(i => ({
    _source: 'tpj',
    _id: i.link || i._id,
    _parsedDate: (i.date || i._parsedDate) ? new Date(i.date || i._parsedDate) : null,
    link: i.link,
    title: i.title,
    content: i.content || i.excerpt,
    thumbnail: i.thumbnail
  }));
}

async function fetchSwan() {
  // Try live API first (VPS mode)
  try {
    const resp = await fetch('/api/swan');
    const data = await resp.json();
    if (data && data.status === 'ok' && data.items.length) return normalizeSwan(data.items);
  } catch {}
  // Fallback: static JSON (GitHub Pages)
  try {
    const resp = await fetch('swan.json');
    const data = await resp.json();
    if (data && data.items) return normalizeSwan(data.items);
  } catch {}
  return [];
}

function normalizeSwan(items) {
  return items.map(i => ({
    _source: 'swan',
    _id: i.link || i._id,
    _parsedDate: (i.date || i._parsedDate) ? new Date(i.date || i._parsedDate) : null,
    link: i.link,
    title: i.title,
    content: i.content || i.excerpt,
    thumbnail: i.thumbnail
  }));
}

async function fetchGspf() {
  // Try live API first (VPS mode)
  try {
    const resp = await fetch('/api/gspf');
    const data = await resp.json();
    if (data && data.status === 'ok' && data.items.length) return normalizeGspf(data.items);
  } catch {}
  // Fallback: static JSON (GitHub Pages)
  try {
    const resp = await fetch('gspf.json');
    const data = await resp.json();
    if (data && data.items) return normalizeGspf(data.items);
  } catch {}
  return [];
}

function normalizeGspf(items) {
  return items.map(i => ({
    _source: 'gspf',
    _id: i.link || i._id,
    _parsedDate: (i.date || i._parsedDate) ? new Date(i.date || i._parsedDate) : null,
    link: i.link,
    title: i.title,
    content: i.content || i.excerpt,
    thumbnail: i.thumbnail
  }));
}

function extractImg(post) {
  if (post.thumbnail) return post.thumbnail;
  const m = (post.content || '').match(/<img[^>]+src=["']([^"']+)["']/);
  return m ? m[1] : null;
}

function applyFilter() {
  const entries = __activeFilter ? window.__allEntries.filter(e => e._source === __activeFilter) : window.__allEntries;
  render(entries);
  document.getElementById('count-colossal').classList.toggle('active', __activeFilter === 'colossal');
  document.getElementById('count-lomography').classList.toggle('active', __activeFilter === 'lomography');
  document.getElementById('count-booooooom').classList.toggle('active', __activeFilter === 'booooooom');
  document.getElementById('count-tpj').classList.toggle('active', __activeFilter === 'tpj');
  document.getElementById('count-swan').classList.toggle('active', __activeFilter === 'swan');
  document.getElementById('count-gspf').classList.toggle('active', __activeFilter === 'gspf');
}

function setFilter(source) {
  __activeFilter = __activeFilter === source ? null : source;
  applyFilter();
}

function render(entries) {
  const el = document.getElementById('entries');
  el.innerHTML = entries.slice(0, 100).map(e => {
    const src = extractImg(e);
    return `<div class="card" data-color="?" data-id="${e._id}" data-source="${e._source}" onclick="openModal(this)">
      <div class="card-inner">
        <div class="card-skeleton"></div>
        ${src ? `<img class="card-image" src="${src}" alt="" loading="lazy" onload="imgLoaded(this)" onerror="imgError(this)">` : ''}
        <div class="card-overlay"></div>
      </div>
      <div class="card-info">
        <div class="card-source">${e._source === 'lomography' ? 'Lomography Magazine' : e._source === 'booooooom' ? 'Booooooom' : e._source === 'tpj' ? 'The Photographic Journal' : e._source === 'swan' ? 'Swann Galleries' : e._source === 'gspf' ? 'Gothenburg Street Photo Fest' : 'Colossal · Fotografía'}</div>
        <div class="card-title"><a href="${e.link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${e.title}</a></div>
        <div class="card-meta">
          <span class="card-date">${e._parsedDate ? fmtDate(e._parsedDate) : ''}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('loader').classList.add('hide');
    const total = Math.min(entries.length, 100);
  const colossal = entries.slice(0, 100).filter(e => e._source === 'colossal').length;
  const lomo = entries.slice(0, 100).filter(e => e._source === 'lomography').length;
  const boom = entries.slice(0, 100).filter(e => e._source === 'booooooom').length;
  const tpj = entries.slice(0, 100).filter(e => e._source === 'tpj').length;
  const swan = entries.slice(0, 100).filter(e => e._source === 'swan').length;
  const gspf = total - colossal - lomo - boom - tpj - swan;
  document.getElementById('count-colossal').textContent = `Colossal ${colossal}`;
  document.getElementById('count-lomography').textContent = `Lomography ${lomo}`;
  document.getElementById('count-booooooom').textContent = `Booooooom ${boom}`;
  document.getElementById('count-tpj').textContent = `Photographic Journal ${tpj}`;
  document.getElementById('count-swan').textContent = `Swann ${swan}`;
  document.getElementById('count-gspf').textContent = `GSPF ${gspf}`;
  document.getElementById('footer-info').textContent = total + ' fotografías';
}

function fmtDate(d) {
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function imgLoaded(img) {
  img.classList.add('loaded');
  const card = img.closest('.card');
  card.querySelector('.card-skeleton')?.remove();
  const overlay = card.querySelector('.card-overlay');
  if (card.dataset.color === '?') {
    card.dataset.color = '1';
    overlay.className = 'card-overlay color';
  }
}

function imgError(img) {
  img.remove();
  const card = img.closest('.card');
  card.querySelector('.card-skeleton')?.remove();
  card.querySelector('.card-overlay')?.remove();
  const info = card.querySelector('.card-info');
  if (info) info.style.opacity = '1';
  if (card.dataset.color === '?') {
    card.dataset.color = '1';
  }
}


function showEmpty() {
  document.getElementById('loader').classList.add('hide');
  document.getElementById('empty').classList.remove('hide');
}

function cleanContent(html) {
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root');
  root.querySelectorAll('div.entry-header, div.post-title, div.post-meta, div.post-share-group, .wp-block-spacer, div[style*="height:"], div[aria-hidden="true"]').forEach(el => el.remove());
  return root.innerHTML;
}

function extractImages(html) {
  const items = [];
  const seen = new Set();
  const imgRe = /<img[^>]+src="([^"]+)"/g;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const before = html.substring(0, m.index);
    const inFigure = before.lastIndexOf('<figure') > before.lastIndexOf('</figure>');
    let caption = '';
    if (inFigure) {
      const after = html.substring(m.index);
      const capMatch = after.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/);
      if (capMatch && capMatch.index < (after.indexOf('</figure>') === -1 ? Infinity : after.indexOf('</figure>'))) {
        caption = capMatch[1].replace(/<[^>]+>/g, '').trim();
      }
    }
    items.push({ url, caption });
  }
  return items;
}

function extractColossalPhotographers(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const list = [];
  const seen = new Set();
  doc.querySelectorAll('figcaption a[href]').forEach(a => {
    const name = a.textContent.trim();
    const href = a.getAttribute('href');
    if (name && href && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      list.push({ name, url: href });
    }
  });
  return list;
}

function isShareLink(url) {
  return /facebook\.com\/(?:sharer|sharing|dialog\/share|plugins|login|share)/.test(url.toLowerCase());
}

function isOwnDomain(href) {
  try {
    const h = new URL(href).hostname.toLowerCase();
    return h.endsWith('thisiscolossal.com') || h.endsWith('lomography.com') || h.endsWith('booooooom.com');
  } catch {
    return false;
  }
}

const WEBSITE_TEXT_RE = /\b(?:web[\s-]*site|web[\s-]*shop|portfolio)\b|\bweb\b|\bsite\b/i;

function extractSocialLinks(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const links = [];
  const seen = new Set();
  const seenYT = new Set();
  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    const text = a.textContent.trim();
    if (!href || !text) return;
    let url = href;
    const h = href.toLowerCase();
    if (h.includes('instagram.com')) {
      const m = href.match(/instagram\.com\/([^/?]+)/);
      const label = m ? m[1] : 'Instagram';
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'instagram', text: label, url }); }
    } else if (h.includes('youtube.com') || h.includes('youtu.be')) {
      let channel, label;
      const atM = href.match(/youtube\.com\/@([^/?]+)/);
      const userM = href.match(/youtube\.com\/user\/([^/?]+)/);
      const cM = href.match(/youtube\.com\/c\/([^/?]+)/);
      const chM = href.match(/youtube\.com\/channel\/([^/?]+)/);
      if (atM) { channel = atM[1].toLowerCase(); label = atM[1]; }
      else if (userM) { channel = userM[1].toLowerCase(); label = userM[1]; }
      else if (cM) { channel = cM[1].toLowerCase(); label = 'Canal'; }
      else if (chM) { channel = chM[1]; label = 'Canal'; }
      else if (href.match(/youtube\.com\/watch\b/) || href.match(/youtu\.be\//)) { label = 'Video'; }
      if (channel && seenYT.has(channel)) return;
      if (channel) seenYT.add(channel);
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'youtube', text: label || 'YouTube', url }); }
    } else if (h.includes('twitter.com') || h.includes('x.com')) {
      const m = href.match(/(?:twitter|x)\.com\/([^/?]+)/);
      const label = m ? m[1] : 'X';
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'x', text: label, url }); }
    } else if (h.includes('vimeo.com')) {
      const m = href.match(/vimeo\.com\/([^/?]+)/);
      const label = m ? m[1] : 'Vimeo';
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'vimeo', text: label, url }); }
    } else if (h.includes('flickr.com')) {
      const m = href.match(/flickr\.com\/([^/?]+)/);
      const label = m ? m[1] : 'Flickr';
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'flickr', text: label, url }); }
    } else if (h.includes('tiktok.com')) {
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'tiktok', text: 'TikTok', url }); }
    } else if (h.includes('facebook.com')) {
      if (isShareLink(url)) return;
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'facebook', text: text, url }); }
    } else if (h.includes('bsky.app')) {
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'bluesky', text: text, url }); }
    } else if (h.includes('threads.net')) {
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'threads', text: text, url }); }
    } else if (WEBSITE_TEXT_RE.test(text) && /^https?:\/\//i.test(href) && !isOwnDomain(href)) {
      try { url = new URL(href).origin + '/'; } catch { return; }
      if (!seen.has(url)) { seen.add(url); links.push({ platform: 'web', text: 'Web', url }); }
    }
  });
  const order = ['instagram', 'youtube', 'x', 'vimeo', 'flickr', 'tiktok', 'facebook', 'bluesky', 'threads', 'web'];
  links.sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform));
  return links;
}

function renderLomoArticle(body, entry, data) {
  const images = data.images || [];
  const creditsHTML = (data.credits && data.credits.length) ? '<div class="modal-photographers"><span class="photographer-label">Fotógrafos</span>' + data.credits.map(c => '<a href="' + c.url + '" target="_blank" rel="noopener" class="photographer-link">' + c.name + '</a>').join(', ') + '</div>' : '';
  const lomoLinks = data.content ? extractSocialLinks(data.content) : [];
  const linksHTML = lomoLinks.length ? '<div class="modal-links">' + lomoLinks.map(l => '<a href="' + l.url + '" target="_blank" rel="noopener" class="modal-link-tag link-' + l.platform + '">' + l.text + '</a>').join('') + '</div>' : '';
  body.innerHTML = `
    <div class="modal-tools">
      ${images.length ? `<button class="modal-tool-btn" onclick="openGallery()">Galería (${images.length})</button>` : ''}
      <button class="modal-tool-btn" onclick="toggleFullscreen()">Pantalla completa</button>
      <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
    </div>
    ${linksHTML}
    <div class="modal-title-group">
      <h2 class="modal-title">${entry.title}</h2>
      <div class="modal-meta">
        <span class="modal-source">Lomography Magazine</span>
        ${entry._parsedDate ? '<span class="modal-sep">·</span><span class="modal-date">' + fmtDate(entry._parsedDate) + '</span>' : ''}
      </div>
    </div>
    <div class="modal-article">
      <div class="modal-article-content">${data.content}</div>
      ${creditsHTML}
      <div class="modal-footer" style="padding-top:2rem">
        <a href="${entry.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
      </div>
    </div>
  `;
  body.dataset.lomoImages = JSON.stringify(images.map(i => ({ url: i.url, caption: i.alt || '' })));
}

function renderBoomArticle(body, entry, data) {
  const images = data.images || [];
  const creditLinks = (data.credits || []).filter(c => !isShareLink(c.url)).map(c => ({ platform: c.platform || 'web', text: c.name, url: c.url }));
  const socialLinks = data.content ? extractSocialLinks(data.content) : [];
  const boomLinks = [...creditLinks, ...socialLinks];
  const linksHTML = boomLinks.length ? '<div class="modal-links">' + boomLinks.map(l => '<a href="' + l.url + '" target="_blank" rel="noopener" class="modal-link-tag link-' + l.platform + '">' + l.text + '</a>').join('') + '</div>' : '';
  body.innerHTML = `
    <div class="modal-tools">
      ${images.length ? `<button class="modal-tool-btn" onclick="openGallery()">Galería (${images.length})</button>` : ''}
      <button class="modal-tool-btn" onclick="toggleFullscreen()">Pantalla completa</button>
      <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
    </div>
    ${linksHTML}
    <div class="modal-title-group">
      <h2 class="modal-title">${entry.title}</h2>
      <div class="modal-meta">
        <span class="modal-source">Booooooom</span>
        ${entry._parsedDate ? '<span class="modal-sep">·</span><span class="modal-date">' + fmtDate(entry._parsedDate) + '</span>' : ''}
      </div>
    </div>
    <div class="modal-article">
      <div class="modal-article-content">${data.content}</div>
      <div class="modal-footer" style="padding-top:2rem">
        <a href="${entry.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
      </div>
    </div>
  `;
  body.dataset.lomoImages = JSON.stringify(images.map(i => ({ url: i.url, caption: i.alt || '' })));
}

function renderTpjArticle(body, entry) {
  const content = cleanContent(entry.content || '');
  const images = extractImages(content);
  const socialLinks = extractSocialLinks(content);
  const linksHTML = socialLinks.length ? '<div class="modal-links">' + socialLinks.map(l => '<a href="' + l.url + '" target="_blank" rel="noopener" class="modal-link-tag link-' + l.platform + '">' + l.text + '</a>').join('') + '</div>' : '';
  body.innerHTML = `
    <div class="modal-tools">
      ${images.length ? `<button class="modal-tool-btn" onclick="openGallery()">Galería (${images.length})</button>` : ''}
      <button class="modal-tool-btn" onclick="toggleFullscreen()">Pantalla completa</button>
      <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
    </div>
    ${linksHTML}
    <div class="modal-title-group">
      <h2 class="modal-title">${entry.title}</h2>
      <div class="modal-meta">
        <span class="modal-source">The Photographic Journal</span>
        ${entry._parsedDate ? '<span class="modal-sep">·</span><span class="modal-date">' + fmtDate(entry._parsedDate) + '</span>' : ''}
      </div>
    </div>
    <div class="modal-article">
      <div class="modal-article-content">${content}</div>
      <div class="modal-footer" style="padding-top:2rem">
        <a href="${entry.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
      </div>
    </div>
  `;
  body.dataset.lomoImages = JSON.stringify(images.map(i => ({ url: i.url, caption: i.caption || '' })));
}

function renderSwanArticle(body, entry, data) {
  const images = data.images || [];
  const thumb = data.thumbnail || entry.thumbnail;
  const thumbHTML = (!images.length && thumb) ? `<div class="modal-article" style="padding-bottom:0"><img src="${thumb}" alt="" class="modal-swan-thumb" loading="lazy"></div>` : '';
  body.innerHTML = `
    <div class="modal-tools">
      ${images.length ? `<button class="modal-tool-btn" onclick="openGallery()">Galería (${images.length})</button>` : ''}
      <button class="modal-tool-btn" onclick="toggleFullscreen()">Pantalla completa</button>
      <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
    </div>
    ${thumbHTML}
    <div class="modal-title-group">
      <h2 class="modal-title">${entry.title}</h2>
      <div class="modal-meta">
        <span class="modal-source">Swann Galleries</span>
        ${entry._parsedDate ? '<span class="modal-sep">·</span><span class="modal-date">' + fmtDate(entry._parsedDate) + '</span>' : ''}
      </div>
    </div>
    <div class="modal-article">
      <div class="modal-article-content">${data.content}</div>
      <div class="modal-footer" style="padding-top:2rem">
        <a href="${entry.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
      </div>
    </div>
  `;
  body.dataset.lomoImages = JSON.stringify(images.map(i => ({ url: i.url, caption: i.alt || '' })));
}

function renderGspfArticle(body, entry) {
  const content = cleanContent(entry.content || '');
  const images = extractImages(content);
  const socialLinks = extractSocialLinks(content);
  const linksHTML = socialLinks.length ? '<div class="modal-links">' + socialLinks.map(l => '<a href="' + l.url + '" target="_blank" rel="noopener" class="modal-link-tag link-' + l.platform + '">' + l.text + '</a>').join('') + '</div>' : '';
  body.innerHTML = `
    <div class="modal-tools">
      ${images.length ? `<button class="modal-tool-btn" onclick="openGallery()">Galería (${images.length})</button>` : ''}
      <button class="modal-tool-btn" onclick="toggleFullscreen()">Pantalla completa</button>
      <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
    </div>
    ${linksHTML}
    <div class="modal-title-group">
      <h2 class="modal-title">${entry.title}</h2>
      <div class="modal-meta">
        <span class="modal-source">Gothenburg Street Photo Fest</span>
        ${entry._parsedDate ? '<span class="modal-sep">·</span><span class="modal-date">' + fmtDate(entry._parsedDate) + '</span>' : ''}
      </div>
    </div>
    <div class="modal-article">
      <div class="modal-article-content">${content}</div>
      <div class="modal-footer" style="padding-top:2rem">
        <a href="${entry.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
      </div>
    </div>
  `;
  body.dataset.lomoImages = JSON.stringify(images.map(i => ({ url: i.url, caption: i.caption || '' })));
}

async function openModal(card) {
  const id = card.dataset.id;
  const source = card.dataset.source;
  const body = document.getElementById('modal-body');
  body.innerHTML = '<div class="modal-loading">cargando…</div>';
  document.getElementById('modal').classList.remove('hide');

  if (source === 'lomography') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    let data = null;
    try {
      const resp = await fetch(`/api/lomography/article?url=${encodeURIComponent(entry.link)}`);
      const d = await resp.json();
      if (d.status === 'ok') data = d;
    } catch {}
    if (!data) {
      try {
        const resp = await fetch('lomography_articles.json');
        const cache = await resp.json();
        const cached = (cache.articles || cache)[entry.link];
        if (cached && cached.status === 'ok') data = cached;
      } catch {}
    }
    if (data) {
      renderLomoArticle(body, entry, data);
    } else {
      body.innerHTML = `
        <div class="modal-tools">
          <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
        </div>
        <div class="modal-title-group">
          <h2 class="modal-title">${entry.title}</h2>
          <div class="modal-meta">
            <span class="modal-source">Lomography Magazine</span>
            ${entry._parsedDate ? '<span class="modal-sep">·</span><span class="modal-date">' + fmtDate(entry._parsedDate) + '</span>' : ''}
          </div>
        </div>
        <div class="modal-article">
          <p class="modal-error">no se pudo cargar el contenido desde este servidor</p>
          <div class="modal-footer" style="padding-top:2rem">
            <a href="${entry.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
          </div>
        </div>
      `;
    }
    return;
  }

  if (source === 'booooooom') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    let data = null;
    try {
      const resp = await fetch(`/api/booooooom/article?url=${encodeURIComponent(entry.link)}`);
      const d = await resp.json();
      if (d.status === 'ok') data = d;
    } catch {}
    if (!data) {
      try {
        const resp = await fetch('booooooom_articles.json');
        const cache = await resp.json();
        const cached = (cache.articles || cache)[entry.link];
        if (cached && cached.status === 'ok') data = cached;
      } catch {}
    }
    if (data) {
      renderBoomArticle(body, entry, data);
    } else {
      body.innerHTML = `
        <div class="modal-tools">
          <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
        </div>
        <div class="modal-title-group">
          <h2 class="modal-title">${entry.title}</h2>
          <div class="modal-meta">
            <span class="modal-source">Booooooom</span>
            ${entry._parsedDate ? '<span class="modal-sep">·</span><span class="modal-date">' + fmtDate(entry._parsedDate) + '</span>' : ''}
          </div>
        </div>
        <div class="modal-article">
          <p class="modal-error">no se pudo cargar el contenido desde este servidor</p>
          <div class="modal-footer" style="padding-top:2rem">
            <a href="${entry.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
          </div>
        </div>
      `;
    }
    return;
  }

  if (source === 'tpj') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    renderTpjArticle(body, entry);
    return;
  }

  if (source === 'swan') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    let data = null;
    try {
      const resp = await fetch(`/api/swan/article?url=${encodeURIComponent(entry.link)}`);
      const d = await resp.json();
      if (d.status === 'ok') data = d;
    } catch {}
    if (!data) {
      try {
        const resp = await fetch('swan_articles.json');
        const cache = await resp.json();
        const cached = (cache.articles || cache)[entry.link];
        if (cached && cached.status === 'ok') data = cached;
      } catch {}
    }
    if (data) {
      renderSwanArticle(body, entry, data);
    } else {
      body.innerHTML = `
        <div class="modal-tools">
          <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
        </div>
        <div class="modal-title-group">
          <h2 class="modal-title">${entry.title}</h2>
          <div class="modal-meta">
            <span class="modal-source">Swann Galleries</span>
            ${entry._parsedDate ? '<span class="modal-sep">·</span><span class="modal-date">' + fmtDate(entry._parsedDate) + '</span>' : ''}
          </div>
        </div>
        <div class="modal-article">
          <p class="modal-error">no se pudo cargar el contenido desde este servidor</p>
          <div class="modal-footer" style="padding-top:2rem">
            <a href="${entry.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
          </div>
        </div>
      `;
    }
    return;
  }

  if (source === 'gspf') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    renderGspfArticle(body, entry);
    return;
  }

  let post;
  try {
    post = await (await fetch(`${POST_API}/${id}`)).json();
  } catch {}
  if (!post || post.code) {
    body.innerHTML = '<p class="modal-error">error al cargar el artículo</p>';
    return;
  }

  const images = extractImages(post.content.rendered);
  const cleaned = cleanContent(post.content.rendered);
  const photographers = extractColossalPhotographers(post.content.rendered);
  const photoHTML = photographers.length ? '<div class="modal-photographers"><span class="photographer-label">Fotógrafos</span>' + photographers.map(p => '<a href="' + p.url + '" target="_blank" rel="noopener" class="photographer-link">' + p.name + '</a>').join(', ') + '</div>' : '';
  const colossalLinks = extractSocialLinks(post.content.rendered);
  const linksHTML = colossalLinks.length ? '<div class="modal-links">' + colossalLinks.map(l => '<a href="' + l.url + '" target="_blank" rel="noopener" class="modal-link-tag link-' + l.platform + '">' + l.text + '</a>').join('') + '</div>' : '';
  const articleHTML = `
    <div class="modal-article">
      <div class="modal-article-content">${cleaned}</div>
      <div class="modal-footer" style="padding-top:2rem">
        <a href="${post.link}" target="_blank" rel="noopener" class="modal-link-tag">Ver original →</a>
      </div>
    </div>
  `;

  body.innerHTML = `
    <div class="modal-tools">
      ${images.length ? `<button class="modal-tool-btn" onclick="openGallery()">Galería (${images.length})</button>` : ''}
      <button class="modal-tool-btn" onclick="toggleFullscreen()">Pantalla completa</button>
      <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
    </div>
    ${photoHTML}
    ${linksHTML}
    <div class="modal-title-group">
      <h2 class="modal-title">${post.title.rendered}</h2>
      <div class="modal-meta">
        <span class="modal-source">Colossal · Fotografía</span>
        <span class="modal-sep">·</span>
        <span class="modal-date">${fmtDate(new Date(post.date))}</span>
      </div>
    </div>
    ${articleHTML}
  `;
}

function openGallery() {
  const body = document.getElementById('modal-body');
  const article = body.querySelector('.modal-article');
  const titleGroup = body.querySelector('.modal-title-group');
  let images;
  if (body.dataset.lomoImages) {
    images = JSON.parse(body.dataset.lomoImages);
  } else if (article) {
    images = extractImages(article.querySelector('.modal-article-content')?.innerHTML || '');
  }
  if (!images || !images.length) return;

  article.style.display = 'none';
  titleGroup.style.display = 'none';
  body.dataset.mode = 'gallery';
  body.querySelector('.modal-tools').style.display = 'none';

  const gallery = document.createElement('div');
  gallery.className = 'modal-gallery';

  window.__galleryState = { currentIdx: 0, images };

  const updateGallery = () => {
    const s = window.__galleryState;
    if (!s) return;
    const img = s.images[s.currentIdx];
    gallery.innerHTML = `
      <div class="gallery-top">
        <button class="gallery-back" onclick="closeGallery()">← Volver</button>
        <span class="gallery-counter">${s.currentIdx + 1} / ${s.images.length}</span>
      </div>
      <div class="gallery-stage">
        <button class="gallery-nav gallery-prev" onclick="navGallery(-1)" ${s.currentIdx === 0 ? 'style="opacity:0.2;pointer-events:none"' : ''}>‹</button>
        <div class="gallery-frame">
          <img src="${img.url}" alt="" class="gallery-img" loading="lazy">
          ${img.caption ? `<div class="gallery-caption">${img.caption}</div>` : ''}
        </div>
        <button class="gallery-nav gallery-next" onclick="navGallery(1)" ${s.currentIdx === s.images.length - 1 ? 'style="opacity:0.2;pointer-events:none"' : ''}>›</button>
      </div>
    `;
    resetAuto();
  };

  const resetAuto = () => {
    clearTimeout(window.__galleryState.autoTimer);
    window.__galleryState.autoTimer = setTimeout(() => {
      const s = window.__galleryState;
      if (!s) return;
      if (s.currentIdx >= s.images.length - 1) {
        closeGallery();
        return;
      }
      navGallery(1);
    }, 3000);
  };

  window.__galleryState.updateGallery = updateGallery;
  updateGallery();
  body.appendChild(gallery);

  gallery.addEventListener('mouseenter', () => {
    clearTimeout(window.__galleryState?.autoTimer);
  });
  gallery.addEventListener('mouseleave', () => {
    if (window.__galleryState) resetAuto();
  });

  const keyHandler = (e) => {
    if (!window.__galleryState) return;
    if (e.key === 'ArrowLeft') navGallery(-1);
    else if (e.key === 'ArrowRight') navGallery(1);
    else if (e.key === 'Escape') { closeGallery(); closeModal(); }
  };
  document.addEventListener('keydown', keyHandler);
  body.__galleryKeyHandler = keyHandler;
}

function navGallery(dir) {
  const state = window.__galleryState;
  if (!state) return;
  const newIdx = state.currentIdx + dir;
  if (newIdx < 0 || newIdx >= state.images.length) return;
  state.currentIdx = newIdx;
  state.updateGallery();
}

function closeGallery() {
  const body = document.getElementById('modal-body');
  const gallery = body.querySelector('.modal-gallery');
  if (gallery) gallery.remove();
  body.querySelector('.modal-article').style.display = '';
  body.querySelector('.modal-title-group').style.display = '';
  body.querySelector('.modal-tools').style.display = '';
  body.dataset.mode = '';
  if (body.__galleryKeyHandler) {
    document.removeEventListener('keydown', body.__galleryKeyHandler);
    delete body.__galleryKeyHandler;
  }
  if (window.__galleryState) {
    clearTimeout(window.__galleryState.autoTimer);
  }
  delete window.__galleryState;
}

function closeModal() {
  const body = document.getElementById('modal-body');
  if (body.__galleryKeyHandler) {
    document.removeEventListener('keydown', body.__galleryKeyHandler);
    delete body.__galleryKeyHandler;
  }
  if (window.__galleryState) {
    clearTimeout(window.__galleryState.autoTimer);
  }
  delete window.__galleryState;
  body.innerHTML = '';
  body.dataset.mode = '';
  delete body.dataset.lomoImages;
  document.getElementById('modal').classList.add('hide');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

function closeTop() {
  const body = document.getElementById('modal-body');
  if (body.dataset.mode === 'gallery') closeGallery();
  else closeModal();
}
document.getElementById('modal-backdrop').addEventListener('click', closeTop);

let __fullscreenEscape = false;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const fs = !!document.fullscreenElement;
    closeModal();
    if (fs) {
      __fullscreenEscape = true;
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && __fullscreenEscape) {
    __fullscreenEscape = false;
    document.documentElement.requestFullscreen().catch(() => {});
  }
});
