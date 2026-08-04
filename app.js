const WP_API = 'https://www.thisiscolossal.com/wp-json/wp/v2/posts?categories=496&per_page=20';
const POST_API = 'https://www.thisiscolossal.com/wp-json/wp/v2/posts';

const BOOM_FEEDS = ['https://www.booooooom.com/blog/photo/feed/'];
const TPJ_FEEDS = [
  'https://thephotographicjournal.com/essays/rss',
  'https://thephotographicjournal.com/interviews/feed',
  'https://thephotographicjournal.com/features/feed',
];
const HUCK_FEEDS = ['https://www.huckmag.com/topic/photography/feed'];
const LENSCULTURE_FEEDS = ['https://www.lensculture.com/feeds/feed.rss'];
const ODLP_FEEDS = ['https://loeildelaphotographie.com/en/feed/'];

const RSS_PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
];
const REFRESH_MS = 10 * 60 * 1000;
const ALL_SOURCES = ['colossal', 'lomography', 'booooooom', 'tpj', 'swan', 'huck', 'lensculture', 'odlp', 'magnum'];
const SOURCES_KEY = 'feedfoto.sources';
const PODCAST_RELEASE = 'https://github.com/v0l0v/puntodevista/releases/download/episodios';
const PODCAST_COVER = 'podcast-cover.png';

let __podcast = null;

function initPodcastPlayers() {
  const entry = document.getElementById('entries');
  if (!entry) return;

  entry.addEventListener('click', (e) => {
    const btn = e.target.closest('.podcast-play');
    if (!btn) return;
    const player = btn.closest('.podcast-player');
    if (!player) return;
    const url = player.dataset.url;
    let audio = player._audio;
    if (!audio) {
      audio = new Audio(url);
      audio.preload = 'none';
      player._audio = audio;
      audio.addEventListener('timeupdate', () => updatePodcastProgress(player, audio));
      audio.addEventListener('loadedmetadata', () => updatePodcastProgress(player, audio));
      audio.addEventListener('ended', () => {
        btn.textContent = '▶';
        const fill = player.querySelector('.podcast-progress-fill');
        if (fill) fill.style.width = '0%';
        const time = player.querySelector('.podcast-time');
        if (time) time.textContent = '0:00 / ' + (audio.duration ? fmtDur(Math.floor(audio.duration)) : '--:--');
      });
    }
    if (audio.paused) {
      audio.play().catch(() => {});
      btn.textContent = '⏸';
    } else {
      audio.pause();
      btn.textContent = '▶';
    }
  });

  entry.addEventListener('input', (e) => {
    const vol = e.target.closest('.podcast-volume');
    if (vol) {
      const player = vol.closest('.podcast-player');
      if (player && player._audio) player._audio.volume = parseFloat(vol.value);
      return;
    }
    const bar = e.target.closest('.podcast-progress');
    if (bar) {
      const player = bar.closest('.podcast-player');
      if (!player || !player._audio || !player._audio.duration) return;
      const rect = bar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      player._audio.currentTime = pct * player._audio.duration;
    }
  });
}

function updatePodcastProgress(player, audio) {
  if (!audio.duration) return;
  const fill = player.querySelector('.podcast-progress-fill');
  const time = player.querySelector('.podcast-time');
  if (fill) fill.style.width = ((audio.currentTime / audio.duration) * 100) + '%';
  if (time) time.textContent = fmtDur(Math.floor(audio.currentTime)) + ' / ' + fmtDur(Math.floor(audio.duration));
}

document.addEventListener('DOMContentLoaded', () => {
  loadSources();
  const btn = document.getElementById('sources-btn');
  const panel = document.getElementById('sources-panel');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.classList.toggle('hide') === false;
    btn.setAttribute('aria-expanded', open);
  });
  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('hide') && !panel.contains(e.target)) {
      panel.classList.add('hide');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  
  // Isolate "All" row click
  document.getElementById('source-all-row').addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;
    e.preventDefault();
    __sources.clear();
    saveSources();
    applyFilter();
  });
  
  document.getElementById('chk-all').addEventListener('change', (e) => {
    if (e.target.checked) __sources.clear();
    else __sources = new Set(ALL_SOURCES);
    saveSources();
    applyFilter();
  });
  
  ALL_SOURCES.forEach(src => {
    const row = document.querySelector(`.source-row[data-src="${src}"]`);
    
    // Checkbox behavior
    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) __sources.add(src);
      else __sources.delete(src);
      saveSources();
      applyFilter();
    });
    
    // Label click behavior (Isolate source)
    row.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      if (__sources.size === 1 && __sources.has(src)) {
        __sources.clear();
      } else {
        __sources.clear();
        __sources.add(src);
      }
      saveSources();
      applyFilter();
    });
  });

  // Podcast button filter trigger
  document.getElementById('podcast-filter-btn').addEventListener('click', () => {
    if (__sources.size === 1 && __sources.has('podcast')) {
      __sources.clear();
    } else {
      __sources.clear();
      __sources.add('podcast');
    }
    saveSources();
    applyFilter();
  });

  loadSources();
  sortSourcesUI();
  loadFeeds();
  fetchPodcastMeta();
  initPodcastPlayers();
  setInterval(() => { if (!document.hidden) refreshFeeds(); }, REFRESH_MS);
});

let __sources = new Set();

function loadSources() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOURCES_KEY));
    if (Array.isArray(saved)) __sources = new Set(saved);
  } catch {}
}

function saveSources() {
  localStorage.setItem(SOURCES_KEY, JSON.stringify([...__sources]));
}

async function loadFeeds() {
  const [colossal, lomo, boom, tpj, swan, huck, lensculture, odlp, magnum] = await Promise.all([fetchColossal(), fetchLomography(), fetchBooooooom(), fetchTpj(), fetchSwan(), fetchHuck(), fetchLensCulture(), fetchOdlp(), fetchMagnum()]);
  window.__allEntries = [...colossal, ...lomo, ...boom, ...tpj, ...swan, ...huck, ...lensculture, ...odlp, ...magnum].sort((a, b) => (b._parsedDate || 0) - (a._parsedDate || 0));
  if (!window.__allEntries.length) { showEmpty(); return; }
  applyFilter();
}

async function refreshFeeds() {
  const scroll = window.scrollY;
  const modalOpen = !document.getElementById('modal').classList.contains('hide');
  await loadFeeds();
  if (!modalOpen) window.scrollTo(0, scroll);
}

async function fetchPodcastMeta() {
  try {
    const resp = await fetch('podcast_meta.json', { cache: 'no-store' });
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) return;
    const sorted = [...data].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    __podcast = { ...sorted[sorted.length - 1], num: sorted.length };
    applyFilter();
  } catch {}
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
  return fetchApiOrJson('/api/lomography', 'lomography.json', normalizeLomo);
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

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function extractRssThumb(html) {
  const m = (html || '').match(/<img[^>]+src="([^"]+)"/);
  if (!m) return null;
  if (/facebook\.com|google|tracking/.test(m[1].toLowerCase())) return null;
  return m[1];
}

async function fetchRssLive(source, feedUrls) {
  for (const proxy of RSS_PROXIES) {
    try {
      const items = [];
      const seen = new Set();
      for (const url of feedUrls) {
        const resp = await fetchWithTimeout(proxy(url), 12000);
        if (!resp.ok) continue;
        const text = await resp.text();
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        for (const el of [...doc.querySelectorAll('item')]) {
          const title = el.querySelector('title')?.textContent?.trim();
          const link = el.querySelector('link')?.textContent?.trim();
          if (!title || !link) continue;
          const key = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
          if (seen.has(key)) continue;
          seen.add(key);
          const pub = el.querySelector('pubDate')?.textContent?.trim();
          const content = el.querySelector('content\\:encoded, description')?.textContent || '';
          items.push({
            _source: source,
            _id: link,
            _parsedDate: pub ? new Date(pub) : null,
            link,
            title,
            content,
            thumbnail: extractRssThumb(content)
          });
        }
      }
      if (items.length) return items;
    } catch {}
  }
  return null;
}

async function fetchApiOrJson(apiPath, jsonFile, normalize) {
  try {
    const resp = await fetch(apiPath);
    const data = await resp.json();
    if (data && data.status === 'ok' && data.items.length) return normalize(data.items);
  } catch {}
  try {
    const resp = await fetch(jsonFile, { cache: 'no-store' });
    const data = await resp.json();
    if (data && data.items) return normalize(data.items);
  } catch {}
  return [];
}

function enrichContent(live, fallback) {
  const byLink = new Map((fallback || []).map(i => [i.link, i]));
  return live.map(i => {
    const f = byLink.get(i.link);
    if (f && (f.content || '').length > (i.content || '').length) {
      return { ...i, content: f.content };
    }
    return i;
  });
}

async function fetchBooooooom() {
  const [live, fallback] = await Promise.all([
    fetchRssLive('booooooom', BOOM_FEEDS),
    fetchApiOrJson('/api/booooooom', 'booooooom.json', normalizeBoom),
  ]);
  if (live && live.length) return enrichContent(live, fallback);
  return fallback;
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
  const [live, fallback] = await Promise.all([
    fetchRssLive('tpj', TPJ_FEEDS),
    fetchApiOrJson('/api/tpj', 'tpj.json', normalizeTpj),
  ]);
  if (live && live.length) return enrichContent(live, fallback);
  return fallback;
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
  return fetchApiOrJson('/api/swan', 'swan.json', normalizeSwan);
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

async function fetchHuck() {
  const [live, fallback] = await Promise.all([
    fetchRssLive('huck', HUCK_FEEDS),
    fetchApiOrJson('/api/huck', 'huck.json', normalizeHuck),
  ]);
  if (live && live.length) return enrichContent(live, fallback);
  return fallback;
}

function normalizeHuck(items) {
  return items.map(i => ({
    _source: 'huck',
    _id: i.link || i._id,
    _parsedDate: (i.date || i._parsedDate) ? new Date(i.date || i._parsedDate) : null,
    link: i.link,
    title: i.title,
    content: i.content || i.excerpt,
    thumbnail: i.thumbnail
  }));
}

async function fetchLensCulture() {
  const [live, fallback] = await Promise.all([
    fetchRssLive('lensculture', LENSCULTURE_FEEDS),
    fetchApiOrJson('/api/lensculture', 'lensculture.json', normalizeLensCulture),
  ]);
  if (live && live.length) return enrichContent(live, fallback);
  return fallback;
}

function normalizeLensCulture(items) {
  return items.map(i => ({
    _source: 'lensculture',
    _id: i.link || i._id,
    _parsedDate: (i.date || i._parsedDate) ? new Date(i.date || i._parsedDate) : null,
    link: i.link,
    title: i.title,
    content: i.content || i.excerpt,
    thumbnail: i.thumbnail
  }));
}

async function fetchOdlp() {
  const [live, fallback] = await Promise.all([
    fetchRssLive('odlp', ODLP_FEEDS),
    fetchApiOrJson('/api/odlp', 'odlp.json', normalizeOdlp),
  ]);
  if (live && live.length) return enrichContent(live, fallback);
  return fallback;
}

function normalizeOdlp(items) {
  return items.map(i => ({
    _source: 'odlp',
    _id: i.link || i._id,
    _parsedDate: (i.date || i._parsedDate) ? new Date(i.date || i._parsedDate) : null,
    link: i.link,
    title: i.title,
    content: i.content || i.excerpt,
    thumbnail: i.thumbnail
  }));
}

async function fetchMagnum() {
  const fallback = await fetchApiOrJson('/api/magnum', 'magnum.json', normalizeMagnum);
  return fallback;
}

function normalizeMagnum(items) {
  return items.map(i => ({
    _source: 'magnum',
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

function isSourceVisible(src) {
  if (__sources.has('podcast')) return false;
  return __sources.size === 0 || __sources.has(src);
}

function isMobile() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function applyFilter() {
  const entries = isMobile() ? window.__allEntries
    : window.__allEntries.filter(e => isSourceVisible(e._source));
  render(entries);
  
  const isPodcastOnly = __sources.size === 1 && __sources.has('podcast');
  document.getElementById('podcast-filter-btn').classList.toggle('active', isPodcastOnly);
  document.getElementById('chk-all').checked = __sources.size === 0;
  
  ALL_SOURCES.forEach(src => {
    document.querySelector(`.source-row[data-src="${src}"] input`)
      .checked = isSourceVisible(src);
  });
  
  if (isPodcastOnly) {
    document.getElementById('sources-btn-count').textContent = 'podcast';
  } else {
    document.getElementById('sources-btn-count').textContent =
      __sources.size === 0 ? 'todas' : `${__sources.size}`;
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDur(sec) {
  sec = parseInt(sec || 0, 10);
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function podcastCardHTML() {
  if (!__podcast) return '';
  if (__sources.size > 0 && !__sources.has('podcast')) return '';
  const e = __podcast;
  const title = `Episodio ${e.num} · ${fmtDateLong(new Date(e.date + 'T00:00:00'))}`;
  const url = `${PODCAST_RELEASE}/podcast-${e.date}.mp3`;
  const images = e.images || [];
  const img = images.length ? images[Math.floor(Math.random() * images.length)] : (e.image || PODCAST_COVER);
  const dur = fmtDur(e.duration);
  const podcastTitle = e.podcast_title || '';
  return `<div class="card podcast-card" data-podcast="1">
    <div class="podcast-inner">
      <div class="podcast-art"><img src="${esc(img)}" alt="" loading="lazy"></div>
      <div class="podcast-body">
        <div class="podcast-badge"><span class="podcast-dot"></span>Podcast · Punto de vista</div>
        <h3 class="podcast-title">${esc(title)}</h3>
        ${podcastTitle ? '<h4 class="podcast-context">' + esc(podcastTitle) + '</h4>' : ''}
        <div class="podcast-player" data-url="${esc(url)}">
          <button class="podcast-play" aria-label="Reproducir">▶</button>
          <div class="podcast-progress"><div class="podcast-progress-fill"></div></div>
          <span class="podcast-time">0:00 / ${dur || '--:--'}</span>
          <input type="range" class="podcast-volume" min="0" max="1" step="0.05" value="1" aria-label="Volumen">
        </div>
        <div class="podcast-meta">
          <span class="podcast-ai">Generado por v0l0v IA</span>
          <a href="podcast.xml" target="_blank" rel="noopener">Feed RSS</a>
        </div>
      </div>
    </div>
  </div>`;
}

function render(entries) {
  const el = document.getElementById('entries');
  el.innerHTML = podcastCardHTML() + entries.slice(0, 100).map(e => {
    const src = extractImg(e);
    return `<div class="card" data-color="?" data-id="${e._id}" data-source="${e._source}" onclick="openModal(this)">
      <div class="card-inner">
        <div class="card-skeleton"></div>
        ${src ? `<img class="card-image" src="${src}" alt="" loading="lazy" onload="imgLoaded(this)" onerror="imgError(this)">` : ''}
        <div class="card-overlay"></div>
      </div>
      <div class="card-info">
        <div class="card-source">${e._source === 'lomography' ? 'Lomography Magazine' : e._source === 'booooooom' ? 'Booooooom' : e._source === 'tpj' ? 'The Photographic Journal' : e._source === 'swan' ? 'Swann Galleries' : e._source === 'huck' ? 'Huck Magazine' : e._source === 'lensculture' ? 'LensCulture' : e._source === 'odlp' ? "L'Œil de la Photographie" : e._source === 'magnum' ? 'Magnum Photos' : 'Colossal · Fotografía'}</div>
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
  const huck = entries.slice(0, 100).filter(e => e._source === 'huck').length;
  const lensculture = entries.slice(0, 100).filter(e => e._source === 'lensculture').length;
  const odlp = entries.slice(0, 100).filter(e => e._source === 'odlp').length;
  const magnum = total - colossal - lomo - boom - tpj - swan - huck - lensculture - odlp;
  document.getElementById('count-colossal').textContent = String(colossal);
  document.getElementById('count-lomography').textContent = String(lomo);
  document.getElementById('count-booooooom').textContent = String(boom);
  document.getElementById('count-tpj').textContent = String(tpj);
  document.getElementById('count-swan').textContent = String(swan);
  document.getElementById('count-huck').textContent = String(huck);
  document.getElementById('count-lensculture').textContent = String(lensculture);
  document.getElementById('count-odlp').textContent = String(odlp);
  document.getElementById('count-magnum').textContent = String(magnum);
  document.getElementById('count-all').textContent = String(total);
  document.getElementById('footer-info').textContent = total + ' fotografías';
  document.getElementById('empty').classList.toggle('hide', entries.length > 0);
}

function fmtDate(d) {
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateLong(d) {
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
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

function renderLensCultureArticle(body, entry, data) {
  const images = data.images || [];
  const socialLinks = data.content ? extractSocialLinks(data.content) : [];
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
        <span class="modal-source">LensCulture</span>
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

function renderOdlpArticle(body, entry, data) {
  const images = data.images || [];
  const socialLinks = data.content ? extractSocialLinks(data.content) : [];
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
        <span class="modal-source">L'Œil de la Photographie</span>
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

function renderMagnumArticle(body, entry, data) {
  const images = data.images || [];
  const socialLinks = data.content ? extractSocialLinks(data.content) : [];
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
        <span class="modal-source">Magnum Photos</span>
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

function renderHuckArticle(body, entry) {
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
        <span class="modal-source">Huck Magazine</span>
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
  incrementReadCount(source);
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

  if (source === 'huck') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    renderHuckArticle(body, entry);
    return;
  }

  if (source === 'lensculture') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    let data = null;
    try {
      const resp = await fetch(`/api/lensculture/article?url=${encodeURIComponent(entry.link)}`);
      const d = await resp.json();
      if (d.status === 'ok') data = d;
    } catch {}
    if (!data) {
      try {
        const resp = await fetch('lensculture_articles.json');
        const cache = await resp.json();
        const cached = (cache.articles || cache)[entry.link];
        if (cached && cached.status === 'ok') data = cached;
      } catch {}
    }
    if (data) {
      renderLensCultureArticle(body, entry, data);
    } else {
      body.innerHTML = `
        <div class="modal-tools">
          <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
        </div>
        <div class="modal-title-group">
          <h2 class="modal-title">${entry.title}</h2>
          <div class="modal-meta">
            <span class="modal-source">LensCulture</span>
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

  if (source === 'odlp') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    let data = null;
    try {
      const resp = await fetch(`/api/odlp/article?url=${encodeURIComponent(entry.link)}`);
      const d = await resp.json();
      if (d.status === 'ok') data = d;
    } catch {}
    if (!data) {
      try {
        const resp = await fetch('odlp_articles.json');
        const cache = await resp.json();
        const cached = (cache.articles || cache)[entry.link];
        if (cached && cached.status === 'ok') data = cached;
      } catch {}
    }
    if (data) {
      renderOdlpArticle(body, entry, data);
    } else {
      body.innerHTML = `
        <div class="modal-tools">
          <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
        </div>
        <div class="modal-title-group">
          <h2 class="modal-title">${entry.title}</h2>
          <div class="modal-meta">
            <span class="modal-source">L'Œil de la Photographie</span>
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

  if (source === 'magnum') {
    const entry = window.__allEntries?.find(e => e._id === id);
    if (!entry) { body.innerHTML = '<p class="modal-error">error</p>'; return; }
    let data = null;
    try {
      const resp = await fetch(`/api/magnum/article?url=${encodeURIComponent(entry.link)}`);
      const d = await resp.json();
      if (d.status === 'ok') data = d;
    } catch {}
    if (!data) {
      try {
        const resp = await fetch('magnum_articles.json');
        const cache = await resp.json();
        const cached = (cache.articles || cache)[entry.link];
        if (cached && cached.status === 'ok') data = cached;
      } catch {}
    }
    if (data) {
      renderMagnumArticle(body, entry, data);
    } else {
      body.innerHTML = `
        <div class="modal-tools">
          <button class="modal-tool-btn" onclick="closeModal()" style="margin-left:auto">← Volver</button>
        </div>
        <div class="modal-title-group">
          <h2 class="modal-title">${entry.title}</h2>
          <div class="modal-meta">
            <span class="modal-source">Magnum Photos</span>
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

function getReadCounts() {
  try {
    return JSON.parse(localStorage.getItem('feedfoto.read_counts')) || {};
  } catch {
    return {};
  }
}

function incrementReadCount(source) {
  if (!source) return;
  const counts = getReadCounts();
  counts[source] = (counts[source] || 0) + 1;
  localStorage.setItem('feedfoto.read_counts', JSON.stringify(counts));
  sortSourcesUI();
}

function sortSourcesUI() {
  const panel = document.getElementById('sources-panel');
  if (!panel) return;
  const counts = getReadCounts();
  const rows = Array.from(panel.querySelectorAll('.source-row:not(.all)'));
  
  rows.sort((a, b) => {
    const srcA = a.dataset.src;
    const srcB = b.dataset.src;
    const countA = counts[srcA] || 0;
    const countB = counts[srcB] || 0;
    return countB - countA;
  });
  
  rows.forEach(row => panel.appendChild(row));
}
