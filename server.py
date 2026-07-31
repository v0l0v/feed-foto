import html
import http.server
import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request

PORT = 8080
DIR = os.path.dirname(os.path.abspath(__file__))
CACHE = {'data': None, 'time': 0, 'ttl': 120}


def is_rate_limited(text):
    return 'rate limit exceeded' in (text or '').lower()


def firecrawl_scrape(url, timeout=60, retries=2):
    for attempt in range(retries + 1):
        try:
            result = subprocess.run(
                ['firecrawl', 'scrape', url, '--only-main-content'],
                capture_output=True, text=True, timeout=timeout, cwd=DIR
            )
        except subprocess.TimeoutExpired:
            return None
        except Exception:
            return None
        md = result.stdout or result.stderr
        if not md:
            return None
        if is_rate_limited(md):
            if attempt < retries:
                time.sleep(10)
                continue
            return None
        return md
    return None

def parse_lomo_articles(md):
    articles = []
    seen = set()

    matches = list(re.finditer(r'^(?:- )?### \[(.+?)\]\((https://www\.lomography\.com/magazine/[^)]+)\)', md, re.MULTILINE))
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        url = m.group(2).strip()
        key = re.sub(r'[^a-z0-9]', '', title.lower())[:40]
        if key in seen:
            continue
        seen.add(key)

        start = m.end()
        end = matches[i+1].start() if i + 1 < len(matches) else len(md)
        block = md[m.start():end]

        date = ''
        dm = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', block)
        if dm:
            date = dm.group(1)
        else:
            date = resolve_lomo_article_date(url) or ''

        thumb = ''
        tm = re.search(r'\[!\[.*?\]\(([^)]+)\)\]', block)
        if tm:
            thumb = tm.group(1)

        excerpt_lines = []
        for line in block.split('\n'):
            s = line.strip()
            if not s or s.startswith('###') or s.startswith('[') or s.startswith('written by') or s.startswith('http'):
                continue
            if re.match(r'^\[!\[', s):
                continue
            if s.startswith('#'):
                continue
            excerpt_lines.append(s)
        excerpt = ' '.join(excerpt_lines)
        excerpt = re.sub(r'\[\d+\]\([^)]+\)', '', excerpt).strip()

        articles.append({
            'title': title,
            'link': url,
            'date': date,
            'thumbnail': thumb,
            'excerpt': excerpt
        })

    return articles[:50]

LOMO_ARTICLE_DATE_CACHE = {}

def resolve_lomo_article_date(url):
    if url in LOMO_ARTICLE_DATE_CACHE:
        return LOMO_ARTICLE_DATE_CACHE[url]
    md = firecrawl_scrape(url, timeout=60)
    if not md:
        LOMO_ARTICLE_DATE_CACHE[url] = None
        return None
    idx = re.search(r'## (?:One|\d+) Likes?|## No Comments|Please login to leave a comment|More Interesting Articles', md)
    clean = md[:idx.start()] if idx else md
    m = re.search(r'\bwritten by\b[^\n]*?\bon\s+(\d{4}-\d{2}-\d{2})', clean, re.IGNORECASE)
    if m:
        LOMO_ARTICLE_DATE_CACHE[url] = m.group(1)
        return m.group(1)
    m = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', clean)
    LOMO_ARTICLE_DATE_CACHE[url] = m.group(1) if m else None
    return LOMO_ARTICLE_DATE_CACHE[url]

def scrape_lomography():
    now = time.time()
    if CACHE['data'] and now - CACHE['time'] < CACHE['ttl']:
        return CACHE['data']
    md = firecrawl_scrape('https://www.lomography.com/magazine/', timeout=60)
    articles = parse_lomo_articles(md or '')
    CACHE['data'] = articles
    CACHE['time'] = now
    return articles

def inline_to_html(text):
    urls = []

    def _save_url(m):
        urls.append(m.group(0))
        return f'\x00{len(urls) - 1}\x00'

    def _restore(i):
        return urls[int(i)]

    text = re.sub(r'https?://[^)\s]+', _save_url, text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'_\*([^*]+)\*_', r'<em>\1</em>', text)
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    text = re.sub(r'_(.+?)_', r'<em>\1</em>', text)
    text = re.sub(r'\[([^\]]+)\]\(\x00(\d+)\x00\)',
                  lambda m: f'<a href="{_restore(m.group(2))}" target="_blank" rel="noopener">{m.group(1)}</a>', text)
    text = re.sub(r'\x00(\d+)\x00', lambda m: _restore(m.group(1)), text)
    return text

def md_to_html(md):
    lines = md.split('\n')
    result = []
    in_list = False
    for line in lines:
        s = line.strip()
        if not s:
            if in_list:
                result.append('</ul>')
                in_list = False
            continue
        img_match = re.match(r'^-?\s*!\[([^\]]*)\]\(([^)]+)\)', s)
        if img_match:
            if in_list:
                result.append('</ul>')
                in_list = False
            result.append(f'<img src="{html.escape(img_match.group(2))}" alt="{html.escape(img_match.group(1))}">')
            continue
        if re.match(r'^-{3,}$', s) or re.match(r'^\*{3,}$', s):
            if in_list:
                result.append('</ul>')
                in_list = False
            result.append('<hr>')
            continue
        hm = re.match(r'^(#{1,3})\s+(.+)$', s)
        if hm:
            if in_list:
                result.append('</ul>')
                in_list = False
            result.append(f'<h{len(hm.group(1))}>{inline_to_html(hm.group(2))}</h{len(hm.group(1))}>')
            continue
        if s.startswith('- ') or s.startswith('* '):
            if not in_list:
                result.append('<ul>')
                in_list = True
            result.append(f'<li>{inline_to_html(s[2:])}</li>')
            continue
        if in_list:
            result.append('</ul>')
            in_list = False
        result.append(f'<p>{inline_to_html(s)}</p>')
    if in_list:
        result.append('</ul>')
    return '\n'.join(result)

SOCIAL_RE = re.compile(
    r'\[([^\]]+)\]\((https://(?:www\.)?(?:instagram\.com|x\.com|twitter\.com|facebook\.com|flickr\.com|tiktok\.com|youtube\.com|bsky\.app|threads\.net)[^)]+)\)',
    re.IGNORECASE
)

LOMO_PROFILE_CACHE = {}

def resolve_lomo_profile(url):
    now = time.time()
    if url in LOMO_PROFILE_CACHE and now - LOMO_PROFILE_CACHE[url]['time'] < 3600:
        return LOMO_PROFILE_CACHE[url]['data']
    md = firecrawl_scrape(url, timeout=30)
    if not md:
        LOMO_PROFILE_CACHE[url] = {'data': None, 'time': now}
        return None
    idx = re.search(r'## (?:One|\d+) Likes?|## No Comments|Please login to leave a comment|More Interesting Articles', md)
    if idx:
        md = md[:idx.start()]
    links = SOCIAL_RE.findall(md)
    links.sort(key=lambda x: (0 if 'instagram.com' in x[1].lower() else 1))
    if links:
        social = {'name': links[0][0], 'url': links[0][1]}
        LOMO_PROFILE_CACHE[url] = {'data': social, 'time': now}
        return social
    LOMO_PROFILE_CACHE[url] = {'data': None, 'time': now}
    return None

ARTICLE_CACHE = {}
BOOM_ARTICLE_CACHE = {}

def boom_credit_platform(raw_name, url):
    h = url.lower()
    platforms = {
        'instagram.com': 'instagram', 'twitter.com': 'x', 'x.com': 'x',
        'facebook.com': 'facebook', 'flickr.com': 'flickr', 'vimeo.com': 'vimeo',
        'youtube.com': 'youtube', 'youtu.be': 'youtube', 'bsky.app': 'bluesky',
        'tiktok.com': 'tiktok', 'threads.net': 'threads',
    }
    for frag, name in platforms.items():
        if frag in h:
            return name
    m = re.search(r' on (\w+)$', raw_name, re.I)
    if m:
        return {'instagram': 'instagram', 'twitter': 'x', 'x': 'x'}.get(m.group(1).lower(), m.group(1).lower())
    return 'web'


def scrape_booooooom_article(url):
    now = time.time()
    if url in BOOM_ARTICLE_CACHE and now - BOOM_ARTICLE_CACHE[url]['time'] < 300:
        return BOOM_ARTICLE_CACHE[url]['data']
    md = firecrawl_scrape(url, timeout=60)
    if not md:
        return None

    md = md.replace('\u2060', '').replace('\u200b', '')
    md = re.sub(r'^\[Submit\][^\n]*\n?', '', md)

    # Recorta promos / footer / related articles en cuanto empiezan
    cut = len(md)
    for pat in (
        r'\[!\[[^\]]*\]\([^)]*\)\]\(https?://(?:www\.|shop\.)?booooooom\.com/',
        r'A Letter From the Founder',
        r"Tomorrow['’]s Talent \d",
        r'Join our Secret Email Club',
        r'\*\*Related Articles\*\*',
        r'Twitter Widget Iframe',
        r'^#{1,6}\s+',
    ):
        m = re.search(pat, md, re.MULTILINE)
        if m and m.start() < cut:
            cut = m.start()
    md = md[:cut].strip()

    images = []
    seen_urls = set()
    for im in re.finditer(r'!\[([^\]]*)\]\(([^)]+)\)', md):
        img_url = im.group(2).strip()
        if img_url in seen_urls:
            continue
        seen_urls.add(img_url)
        images.append({'url': img_url, 'alt': im.group(1)})

    credits = []
    seen_names = set()
    credit_pat = re.compile(r"(?:['’]s (?:Website|Portfolio|Site|Blog))|(?: on (?:Instagram|Twitter|Facebook|Flickr|Vimeo|YouTube|Bluesky|TikTok))$", re.I)
    for cm in re.finditer(r'^_?\[([^\]]+)\]\((https?://[^)]+)\)_?[ \t]*$', md, re.MULTILINE):
        raw_name = cm.group(1).strip().strip('_')
        url = cm.group(2).strip()
        if not credit_pat.search(raw_name):
            continue
        name = re.sub(r"[’']s (?:Website|Portfolio|Site|Blog)$", '', raw_name, flags=re.I)
        name = re.sub(r'\s+on\s+(?:Instagram|Twitter|Facebook|Flickr|Vimeo|YouTube|Bluesky|TikTok)$', '', name, flags=re.I).strip()
        if not name or name.lower() in seen_names:
            continue
        seen_names.add(name.lower())
        credits.append({'name': name, 'url': url, 'platform': boom_credit_platform(raw_name, url)})

    # Los créditos se muestran aparte en el frontend, fuera del contenido
    content_md = re.sub(r'^_?\[[^\]]+\]\((https?://[^)]+)\)_?[ \t]*\n?', '', md, flags=re.MULTILINE)

    data = {'status': 'ok', 'content': md_to_html(content_md), 'images': images, 'credits': credits}
    BOOM_ARTICLE_CACHE[url] = {'data': data, 'time': now}
    return data

def scrape_lomography_article(url, resolve_profiles=True):
    now = time.time()
    if url in ARTICLE_CACHE and now - ARTICLE_CACHE[url]['time'] < 300:
        return ARTICLE_CACHE[url]['data']
    md = firecrawl_scrape(url, timeout=60)
    if not md:
        return None
    idx = re.search(r'## (?:One|\d+) Likes?|## No Comments|Please login to leave a comment|More Interesting Articles', md)
    clean_md = md[:idx.start()] if idx else md
    images = [{'url': m.group(2), 'alt': m.group(1)} for m in re.finditer(r'!\[([^\]]*)\]\(([^)]+)\)', clean_md)]
    body_md = re.split(r'\nwritten by\b', clean_md, maxsplit=1)[0] if re.search(r'\nwritten by\b', clean_md) else clean_md
    content = md_to_html(body_md)
    credits = []
    seen_names = set()
    for cm in re.finditer(r'\[([^\]]+)\]\((https://www\.lomography\.com/homes/[^)]+)\)', clean_md):
        name = cm.group(1).strip()
        if name.lower() not in seen_names:
            seen_names.add(name.lower())
            if resolve_profiles:
                social = resolve_lomo_profile(cm.group(2))
                if social:
                    credits.append({'name': name, 'url': social['url']})
                    continue
            credits.append({'name': name, 'url': cm.group(2)})
    data = {'status': 'ok', 'content': content, 'images': images, 'credits': credits}
    ARTICLE_CACHE[url] = {'data': data, 'time': now}
    return data


SWAN_ARTICLE_CACHE = {}
SWAN_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}


def swan_og_image(url):
    try:
        req = urllib.request.Request(url, headers=SWAN_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            html_page = resp.read().decode('utf-8', errors='ignore')
        m = re.search(r'property="og:image" content="([^"]+)"', html_page)
        return m.group(1) if m else ''
    except Exception:
        return ''


def scrape_swan_article(url):
    now = time.time()
    if url in SWAN_ARTICLE_CACHE and now - SWAN_ARTICLE_CACHE[url]['time'] < 300:
        return SWAN_ARTICLE_CACHE[url]['data']
    md = firecrawl_scrape(url, timeout=60)
    if not md:
        return None

    m = re.search(r'^#{1,6}\s+', md, re.MULTILINE)
    content_md = md[m.start():] if m else md
    content_md = re.sub(r'^#{1,6}[^\n]*\n?', '', content_md, count=1)
    content_md = re.sub(r'^BY\s+\[[^\]]*\]\([^)]*\)\n?', '', content_md, flags=re.MULTILINE)

    cut = len(content_md)
    for pat in (
        r'^Subscribe to our',
        r'^Sign [Uu]p',
        r'^Join our',
        r'^Get our',
        r'^Never miss',
        r'^Bid Online',
        r'^Contact Us',
        r'^About Swann',
        r'^View Lots',
        r'^\*\*\*\s*$',
    ):
        mm = re.search(pat, content_md, re.MULTILINE)
        if mm and mm.start() < cut:
            cut = mm.start()
    content_md = content_md[:cut].strip()
    content_md = re.sub(r'!\[[^\]]*\]\(<[^>]*>\)', '', content_md)
    content_md = re.sub(r'(?<!!)\[\]\([^)]*\)', '', content_md)

    images = []
    seen_urls = set()
    for im in re.finditer(r'!\[([^\]]*)\]\(([^)]+)\)', content_md):
        img_url = im.group(2).strip()
        if img_url.startswith('<') or img_url in seen_urls:
            continue
        seen_urls.add(img_url)
        images.append({'url': img_url, 'alt': im.group(1)})

    data = {'status': 'ok', 'content': md_to_html(content_md), 'images': images,
            'credits': [], 'thumbnail': swan_og_image(url)}
    SWAN_ARTICLE_CACHE[url] = {'data': data, 'time': now}
    return data

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/lomography':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                articles = scrape_lomography()
                data = json.dumps({'status': 'ok', 'items': articles, 'count': len(articles)})
            except subprocess.TimeoutExpired:
                data = json.dumps({'status': 'error', 'message': 'timeout scraping lomography'})
            except Exception as e:
                data = json.dumps({'status': 'error', 'message': str(e)})
            self.wfile.write(data.encode())
        elif parsed.path == '/api/booooooom':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                with open(os.path.join(DIR, 'booooooom.json')) as f:
                    items = json.load(f).get('items', [])
                data = json.dumps({'status': 'ok', 'items': items, 'count': len(items)})
            except Exception as e:
                data = json.dumps({'status': 'error', 'message': str(e)})
            self.wfile.write(data.encode())
        elif parsed.path == '/api/tpj':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                with open(os.path.join(DIR, 'tpj.json')) as f:
                    items = json.load(f).get('items', [])
                data = json.dumps({'status': 'ok', 'items': items, 'count': len(items)})
            except Exception as e:
                data = json.dumps({'status': 'error', 'message': str(e)})
            self.wfile.write(data.encode())
        elif parsed.path == '/api/gspf':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                with open(os.path.join(DIR, 'gspf.json')) as f:
                    items = json.load(f).get('items', [])
                data = json.dumps({'status': 'ok', 'items': items, 'count': len(items)})
            except Exception as e:
                data = json.dumps({'status': 'error', 'message': str(e)})
            self.wfile.write(data.encode())
        elif parsed.path == '/api/swan':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                with open(os.path.join(DIR, 'swan.json')) as f:
                    items = json.load(f).get('items', [])
                data = json.dumps({'status': 'ok', 'items': items, 'count': len(items)})
            except Exception as e:
                data = json.dumps({'status': 'error', 'message': str(e)})
            self.wfile.write(data.encode())
        elif parsed.path == '/api/swan/article':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            qs = urllib.parse.parse_qs(parsed.query)
            url = qs.get('url', [None])[0]
            if not url:
                self.wfile.write(json.dumps({'status': 'error', 'message': 'missing url'}).encode())
                return
            data = scrape_swan_article(url)
            if data is None:
                self.wfile.write(json.dumps({'status': 'error', 'message': 'error scraping article'}).encode())
            else:
                self.wfile.write(json.dumps(data).encode())
        elif parsed.path == '/api/booooooom/article':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            qs = urllib.parse.parse_qs(parsed.query)
            url = qs.get('url', [None])[0]
            if not url:
                self.wfile.write(json.dumps({'status': 'error', 'message': 'missing url'}).encode())
                return
            data = scrape_booooooom_article(url)
            if data is None:
                self.wfile.write(json.dumps({'status': 'error', 'message': 'error scraping article'}).encode())
            else:
                self.wfile.write(json.dumps(data).encode())
        elif parsed.path == '/api/lomography/article':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            qs = urllib.parse.parse_qs(parsed.query)
            url = qs.get('url', [None])[0]
            if not url:
                self.wfile.write(json.dumps({'status': 'error', 'message': 'missing url'}).encode())
                return
            data = scrape_lomography_article(url)
            if data is None:
                self.wfile.write(json.dumps({'status': 'error', 'message': 'error scraping article'}).encode())
            else:
                self.wfile.write(json.dumps(data).encode())
        else:
            super().do_GET()

if __name__ == '__main__':
    os.chdir(DIR)
    server = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Server on http://localhost:{PORT}')
    server.serve_forever()
