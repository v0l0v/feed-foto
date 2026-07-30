import json
import os
import re
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path
from html import unescape

DIR = os.path.dirname(os.path.abspath(__file__))

WP_API = 'https://www.thisiscolossal.com/wp-json/wp/v2/posts?categories=496&per_page=20'
LOMO_URL = 'https://www.lomography.com/magazine/'
BOOM_URL = 'https://www.booooooom.com/blog/photo/feed/'


def fetch_colossal():
    all_posts = []
    for page in range(1, 4):
        url = f'{WP_API}&page={page}'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
            if not data:
                break
            for p in data:
                all_posts.append({
                    '_source': 'colossal',
                    '_id': p['id'],
                    '_parsedDate': p['date'],
                    'link': p['link'],
                    'title': p['title']['rendered'],
                    'content': p['content']['rendered']
                })
        except Exception as e:
            print(f'  Error Colossal: {e}')
            break
    return all_posts


def fetch_lomography():
    try:
        result = subprocess.run(
            ['firecrawl', 'scrape', LOMO_URL, '--only-main-content'],
            capture_output=True, text=True, timeout=60, cwd=DIR
        )
        md = result.stdout or result.stderr
    except Exception as e:
        print(f'  Error Firecrawl: {e}')
        return []

    articles = []
    seen = set()
    matches = list(re.finditer(
        r'^(?:- )?### \[(.+?)\]\((https://www\.lomography\.com/magazine/[^)]+)\)', md, re.MULTILINE))
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        url = m.group(2).strip()
        key = re.sub(r'[^a-z0-9]', '', title.lower())[:40]
        if key in seen:
            continue
        seen.add(key)

        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        block = md[m.start():end]

        date_str = ''
        dm = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', block)
        if dm:
            date_str = dm.group(1)

        thumb = ''
        tm = re.search(r'\[!\[.*?\]\(([^)]+)\)\]', block)
        if tm:
            thumb = tm.group(1)

        excerpt_lines = []
        for line in block.split('\n'):
            s = line.strip()
            if not s or s.startswith('###') or s.startswith('[') or s.startswith('written by') or s.startswith('http'):
                continue
            if re.match(r'^\[!\[', s) or s.startswith('#'):
                continue
            excerpt_lines.append(s)
        excerpt = ' '.join(excerpt_lines)
        excerpt = re.sub(r'\[\d+\]\([^)]+\)', '', excerpt).strip()

        articles.append({
            '_source': 'lomography',
            'title': title,
            'link': url,
            'date': date_str,
            'thumbnail': thumb,
            'excerpt': excerpt
        })

    return articles


def fetch_booooooom():
    try:
        req = urllib.request.Request(BOOM_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            xml_data = resp.read()
    except Exception as e:
        print(f'  Error Booooooom: {e}')
        return []

    articles = []
    seen = set()
    try:
        root = ET.fromstring(xml_data)
        for item in root.iter('item'):
            title = ''
            link = ''
            pub_date = ''
            content = ''
            description = ''

            title_el = item.find('title')
            if title_el is not None and title_el.text:
                title = unescape(title_el.text.strip())

            link_el = item.find('link')
            if link_el is not None and link_el.text:
                link = link_el.text.strip()

            pub_el = item.find('pubDate')
            if pub_el is not None and pub_el.text:
                try:
                    dt = datetime.strptime(pub_el.text.strip(),
                                          '%a, %d %b %Y %H:%M:%S %z')
                    pub_date = dt.strftime('%Y-%m-%d')
                except:
                    pub_date = pub_el.text.strip()[:10]

            content_el = item.find('{http://wellformedweb.org/CommentAPI/}encoded')
            if content_el is None:
                content_el = item.find('content:encoded')
            if content_el is not None and content_el.text:
                content = content_el.text.strip()
            else:
                desc_el = item.find('description')
                if desc_el is not None and desc_el.text:
                    content = desc_el.text.strip()

            if not title or not link:
                continue

            key = re.sub(r'[^a-z0-9]', '', title.lower())[:40]
            if key in seen:
                continue
            seen.add(key)

            thumb = ''
            for tm in re.finditer(r'<img[^>]+src="([^"]+)"', content):
                url_img = tm.group(1)
                if 'facebook.com' not in url_img and 'google' not in url_img and 'tracking' not in url_img:
                    thumb = url_img
                    break

            if not thumb and link:
                try:
                    req2 = urllib.request.Request(link, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req2, timeout=10) as resp2:
                        html2 = resp2.read().decode('utf-8', errors='ignore')
                    for tm2 in re.finditer(r'<img[^>]+src="([^"]+)"', html2):
                        url_img2 = tm2.group(1)
                        if 'facebook.com' not in url_img2 and 'google' not in url_img2 and 'tracking' not in url_img2:
                            thumb = url_img2
                            break
                except Exception:
                    pass

            excerpt = re.sub(r'<[^>]+>', '', content)[:300]
            excerpt = unescape(re.sub(r'\s+', ' ', excerpt).strip())

            articles.append({
                '_source': 'boooobooum',
                'title': title,
                'link': link,
                'date': pub_date,
                'thumbnail': thumb,
                'excerpt': excerpt
            })
    except ET.ParseError as e:
        print(f'  Error parsing RSS: {e}')

    return articles


def main():
    ts = date.today().isoformat()
    print(f'[{ts}] Generando datos estáticos...')

    print('  1. Colossal...')
    colossal = fetch_colossal()
    print(f'     {len(colossal)} artículos')

    print('  2. Lomography...')
    lomo = fetch_lomography()
    print(f'     {len(lomo)} artículos')

    print('  3. Booooooom...')
    boom = fetch_booooooom()
    print(f'     {len(boom)} artículos')

    all_entries = sorted(colossal + lomo + boom,
                         key=lambda x: x.get('_parsedDate') or '',
                         reverse=True)

    with open(os.path.join(DIR, 'lomography.json'), 'w') as f:
        json.dump({'items': lomo, 'count': len(lomo), 'updated': ts}, f)

    with open(os.path.join(DIR, 'booooooom.json'), 'w') as f:
        json.dump({'items': boom, 'count': len(boom), 'updated': ts}, f)

    with open(os.path.join(DIR, 'feeds.json'), 'w') as f:
        json.dump({'items': all_entries, 'count': len(all_entries), 'updated': ts}, f)

    print(f'  Guardado: lomography.json, booooooom.json, feeds.json ({len(all_entries)} total)')

    print('  3. Subiendo a GitHub...')
    try:
        result = subprocess.run(
            ['git', 'add', 'lomography.json', 'booooooom.json', 'feeds.json'],
            capture_output=True, text=True, cwd=DIR
        )
        result = subprocess.run(
            ['git', 'commit', '-m', f'chore: update static feeds {ts}'],
            capture_output=True, text=True, cwd=DIR
        )
        if 'nothing to commit' in result.stdout:
            print('     Sin cambios')
            return
        result = subprocess.run(
            ['git', 'push'],
            capture_output=True, text=True, cwd=DIR
        )
        if result.returncode == 0:
            print('     ✅ Push a GitHub OK')
        else:
            print(f'     ⚠️ Error push: {result.stderr[:200]}')
    except Exception as e:
        print(f'     ⚠️ Git error: {e}')


if __name__ == '__main__':
    main()
