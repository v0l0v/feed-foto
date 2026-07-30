import html
import http.server
import json
import os
import re
import subprocess
import time
import urllib.parse

PORT = 8080
DIR = os.path.dirname(os.path.abspath(__file__))
CACHE = {'data': None, 'time': 0, 'ttl': 120}

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

def scrape_lomography():
    now = time.time()
    if CACHE['data'] and now - CACHE['time'] < CACHE['ttl']:
        return CACHE['data']
    result = subprocess.run(
        ['firecrawl', 'scrape', 'https://www.lomography.com/magazine/', '--only-main-content'],
        capture_output=True, text=True, timeout=60, cwd=DIR
    )
    articles = parse_lomo_articles(result.stdout or result.stderr)
    CACHE['data'] = articles
    CACHE['time'] = now
    return articles

def inline_to_html(text):
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
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
    try:
        result = subprocess.run(
            ['firecrawl', 'scrape', url, '--only-main-content'],
            capture_output=True, text=True, timeout=30, cwd=DIR
        )
        md = result.stdout or result.stderr
                idx = re.search(r'## (?:One|\d+) Likes?|## No Comments|Please login to leave a comment|More Interesting Articles', md)
        if idx:
            md = md[:idx.start()]
        links = SOCIAL_RE.findall(md)
        links.sort(key=lambda x: (0 if 'instagram.com' in x[1].lower() else 1))
        if links:
            social = {'name': links[0][0], 'url': links[0][1]}
            LOMO_PROFILE_CACHE[url] = {'data': social, 'time': now}
            return social
    except:
        pass
    LOMO_PROFILE_CACHE[url] = {'data': None, 'time': now}
    return None

ARTICLE_CACHE = {}

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
            now = time.time()
            if url in ARTICLE_CACHE and now - ARTICLE_CACHE[url]['time'] < 300:
                self.wfile.write(json.dumps(ARTICLE_CACHE[url]['data']).encode())
                return
            try:
                result = subprocess.run(
                    ['firecrawl', 'scrape', url, '--only-main-content'],
                    capture_output=True, text=True, timeout=60, cwd=DIR
                )
                md = result.stdout or result.stderr
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
                        social = resolve_lomo_profile(cm.group(2))
                        if social:
                            credits.append({'name': name, 'url': social['url']})
                        else:
                            credits.append({'name': name, 'url': cm.group(2)})
                data = {'status': 'ok', 'content': content, 'images': images, 'credits': credits}
                ARTICLE_CACHE[url] = {'data': data, 'time': now}
                self.wfile.write(json.dumps(data).encode())
            except subprocess.TimeoutExpired:
                self.wfile.write(json.dumps({'status': 'error', 'message': 'timeout scraping article'}).encode())
            except Exception as e:
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode())
        else:
            super().do_GET()

if __name__ == '__main__':
    os.chdir(DIR)
    server = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Server on http://localhost:{PORT}')
    server.serve_forever()
