import json
import os
import re
import subprocess
import urllib.request
from datetime import date, datetime

DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(DIR, 'resumenes')
TODAY = date.today()
WP_API = 'https://www.thisiscolossal.com/wp-json/wp/v2/posts'

EMOJI_RE = re.compile(
    '[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
    '\U0001F1E0-\U0001F1FF\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F'
    '\U0001FA70-\U0001FAFF\u2702-\u27B0\u24C2-\U0001F251'
    '\U0001F004\u2596-\u27BF\u2600-\u26FF\uFE0F]'
)

def fetch_colossal_articles():
    all_posts = []
    for page in range(1, 4):
        url = f'{WP_API}?categories=496&per_page=20&page={page}'
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
            if not data:
                break
            all_posts.extend(data)
        except:
            break
    return [p for p in all_posts if p['date'][:10] == TODAY.isoformat()]

def extract_colossal_photographer(html):
    m = re.search(r'All images [©©] ([^,]+)', html)
    if m:
        return m.group(1).strip()
    m = re.search(r'<figcaption[^>]*>([\s\S]*?)</figcaption>', html)
    if m:
        names = re.findall(r'<a[^>]*>([^<]+)</a>', m.group(1))
        if names:
            return names[0].strip()
    m = re.search(r'(?:Photos?|Images?) (?:by|©) ([A-Z][a-z]+ [A-Z][a-z]+)', html)
    if m:
        return m.group(1).strip()
    return None

def extract_colossal_summary(html):
    texts = []
    for m in re.finditer(r'<p[^>]*>(.*?)</p>', html):
        t = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        t = re.sub(r'&#8217;', "'", t)
        t = re.sub(r'&#8211;', '–', t)
        t = re.sub(r'&#\d+;', '', t)
        if len(t) < 40 or re.match(r'^\(.*\)$', t):
            continue
        texts.append(t)
    result = []
    for t in texts:
        result.append(t)
        if len(' '.join(result)) > 400:
            break
    return ' '.join(result)

def process_colossal(post):
    html = post['content']['rendered']
    photographer = extract_colossal_photographer(html)
    summary = extract_colossal_summary(html)
    full = re.sub(r'<[^>]+>', ' ', html)
    full = re.sub(r'&#8217;', "'", full)
    full = re.sub(r'&#8211;', '–', full)
    full = re.sub(r'&#\d+;', '', full)
    full = re.sub(r'\s+', ' ', full).strip()
    return {
        'title': post['title']['rendered'],
        'link': post['link'],
        'photographer': photographer,
        'summary': summary,
        'full_text': full,
        'source': 'Colossal'
    }

def fetch_lomography_articles():
    try:
        result = subprocess.run(
            ['firecrawl', 'scrape', 'https://www.lomography.com/magazine/', '--only-main-content'],
            capture_output=True, text=True, timeout=60, cwd=DIR
        )
        md = result.stdout or result.stderr
    except:
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
        block = md[m.start():matches[i + 1].start() if i + 1 < len(matches) else len(md)]
        dm = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', block)
        if not dm or dm.group(1) != TODAY.isoformat():
            continue
        date_str = dm.group(1)
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
        thumb = ''
        tm = re.search(r'\[!\[.*?\]\(([^)]+)\)\]', block)
        if tm:
            thumb = tm.group(1)
        articles.append({
            'title': title, 'link': url, 'date': date_str,
            'excerpt': excerpt, 'thumbnail': thumb
        })
    return articles

def fetch_lomo_article_content(url):
    try:
        result = subprocess.run(
            ['firecrawl', 'scrape', url, '--only-main-content'],
            capture_output=True, text=True, timeout=45, cwd=DIR
        )
        md = result.stdout or result.stderr
    except:
        return None, [], []
    idx = re.search(r'## (?:One|\d+) Likes?|## No Comments|Please login to leave a comment|More Interesting Articles', md)
    clean_md = md[:idx.start()] if idx else md
    body_md = re.split(r'\nwritten by\b', clean_md, maxsplit=1)[0] if re.search(r'\nwritten by\b', clean_md) else clean_md
    credits = []
    seen_names = set()
    for cm in re.finditer(r'\[([^\]]+)\]\((https://www\.lomography\.com/homes/[^)]+)\)', clean_md):
        name = cm.group(1).strip()
        if name.lower() not in seen_names:
            seen_names.add(name.lower())
            credits.append({'name': name, 'url': cm.group(2)})
    images = [m.group(2) for m in re.finditer(r'!\[([^\]]*)\]\(([^)]+)\)', clean_md)]
    return body_md, credits, images

def extract_lomo_summary(md):
    lines = md.split('\n')
    texts = []
    for line in lines:
        s = line.strip()
        if not s or s.startswith('#') or s.startswith('[') or s.startswith('!['):
            continue
        if re.match(r'^\d+$', s):
            continue
        s = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', s)
        s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)
        s = re.sub(r'\*(.+?)\*', r'\1', s)
        if len(s) > 30:
            texts.append(s)
    result = []
    for t in texts:
        result.append(t)
        if len(' '.join(result)) > 400:
            break
    return ' '.join(result)

def process_lomo(article):
    content_md, credits, images = fetch_lomo_article_content(article['link'])
    if content_md:
        summary = extract_lomo_summary(content_md) or article['excerpt']
        full = content_md
    else:
        summary = article['excerpt']
        full = article['excerpt']
    photographers = [c['name'] for c in credits] if credits else None
    return {
        'title': article['title'],
        'link': article['link'],
        'photographers': photographers,
        'summary': summary,
        'full_text': full,
        'image': article['thumbnail'],
        'source': 'Lomography'
    }

def render_html(colossal_items, lomo_items):
    parts = ['''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inspiración fotográfica · ''' + TODAY.isoformat() + '''</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#222;line-height:1.6;padding:2rem 1rem}
.container{max-width:640px;margin:0 auto}
h1{font-size:1.6rem;font-weight:700;margin-bottom:0.25rem;letter-spacing:-0.02em}
.sub{color:#888;font-size:0.9rem;margin-bottom:2rem}
.source{font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:0.5rem;margin-top:2.5rem}
.source.colossal{color:#d4a017}.source.lomography{color:#e25555}
.card{background:#fff;border-radius:12px;padding:1.5rem;margin-bottom:1rem;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
.card h2{font-size:1.1rem;font-weight:600;margin-bottom:0.5rem}
.card h2 a{color:#222;text-decoration:none}
.card h2 a:hover{text-decoration:underline}
.card .meta{font-size:0.8rem;color:#888;margin-bottom:0.75rem}
.card .sum{color:#444;font-size:0.9rem}
.card .sum a{color:#0366d6}
.photographer{display:inline-block;font-size:0.8rem;color:#555;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid #eee}
.photographer strong{color:#222}
hr{border:none;border-top:1px solid #eee;margin:2rem 0}
.footer{text-align:center;color:#aaa;font-size:0.8rem;margin-top:2rem}
</style>
</head>
<body>
<div class="container">
<h1>Inspiración fotográfica</h1>
<p class="sub">''' + TODAY.isoformat() + ''' · ''' + str(len(colossal_items) + len(lomo_items)) + ''' artículos</p>
''']

    if colossal_items:
        parts.append('<div class="source colossal">Colossal · Fotografía</div>')
        for item in colossal_items:
            photo = ''
            if item['photographer']:
                photo = f'<div class="photographer"><strong>Fotógrafo:</strong> {item["photographer"]}</div>'
            parts.append(f'''<div class="card">
<h2><a href="{item['link']}">{item['title']}</a></h2>
<div class="sum">{item['summary']}</div>
{photo}
</div>''')

    if lomo_items:
        parts.append('<div class="source lomography">Lomography Magazine</div>')
        for item in lomo_items:
            photos = ''
            if item['photographers']:
                photos = '<div class="photographer"><strong>Fotógrafos:</strong> ' + ', '.join(item['photographers']) + '</div>'
            parts.append(f'''<div class="card">
<h2><a href="{item['link']}">{item['title']}</a></h2>
<div class="sum">{item['summary']}</div>
{photos}
</div>''')

    if not colossal_items and not lomo_items:
        parts.append('<p style="color:#888">No hubo artículos hoy.</p>')

    parts.append(f'''</div>
<div class="footer">Generado el {datetime.now().strftime("%Y-%m-%d %H:%M")} · <a href="../index.html">feed·foto</a></div>
</body></html>''')

    return '\n'.join(parts)

def clean_text(t):
    t = EMOJI_RE.sub('', t)
    t = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', t)
    t = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', t)
    t = re.sub(r'<\/?[^>]+>', '', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'\1', t)
    t = re.sub(r'\*(.+?)\*', r'\1', t)
    t = re.sub(r'[_*~`]', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'&#8217;', "'", t)
    t = re.sub(r'&#8211;', '–', t)
    t = re.sub(r'&#\d+;', '', t)
    t = t.replace('\\', '')
    t = re.sub(r'\|', ', ', t)
    return t

def text_summary(item):
    lines = [f'  Artículo: {item["title"]}', f'  Fuente: {item["source"]}']
    if item.get('photographer'):
        lines.append(f'  Fotógrafo: {item["photographer"]}')
    elif item.get('photographers'):
        lines.append(f'  Fotógrafos: {", ".join(item["photographers"])}')
    s = clean_text(item['summary'])
    lines.append(f'  Resumen: {s}')
    return '\n'.join(lines) + '\n'

def render_text(colossal, lomo):
    lines = [f'INSPIRACIÓN FOTOGRÁFICA · {TODAY.isoformat()}',
             f'{len(colossal) + len(lomo)} artículos', '', '=' * 50, '']
    if colossal:
        lines.append('COLOSSAL · FOTOGRAFÍA')
        lines.append('-' * 30)
        for item in colossal:
            lines.append(text_summary(item))
    if lomo:
        lines.append('LOMography MAGAZINE')
        lines.append('-' * 30)
        for item in lomo:
            lines.append(text_summary(item))
    if not colossal and not lomo:
        lines.append('No hubo artículos hoy.')
    return '\n'.join(lines)

def render_podcast(colossal, lomo):
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    lines = [f'# Instrucciones para podcast diario · {TODAY.isoformat()}', '',
             'Eres un productor de podcast especializado en fotografía. Tu tarea es:', '',
             '1. **Leer** el texto completo de cada artículo a continuación.',
             '2. **Resumir** cada artículo en 2-3 frases en español, destacando la inspiración fotográfica.',
             '3. **Redactar un texto locutable** en español, con tono natural y cercano, como para un programa de radio.',
             '4. **Generar el audio** del texto locutable: solo voz, sin música, sin efectos de sonido.',
             '',
             'Formato del resultado final (para enviar por correo):',
             '  - Un texto en español con los resúmenes de todos los artículos del día.',
             '  - Un archivo de audio con la locución de ese texto.',
             '',
             'A continuación tienes el texto completo de cada artículo. Léelos todos',
             'y a partir de ahí genera el resumen locutable. No te saltes ningún artículo.',
             '',
             '---',
             f'_Generado el {now}_',
             '',
             '## Contenido del día',
             '']
    if colossal:
        lines.append('### Colossal · Fotografía')
        lines.append('')
        for item in colossal:
            lines.append(f'**{item["title"]}**')
            if item.get('photographer'):
                lines.append(f'Fotógrafo: {item["photographer"]}')
            lines.append('')
            lines.append(clean_text(item['full_text']))
            lines.append('')
    if lomo:
        lines.append('### Lomography Magazine')
        lines.append('')
        for item in lomo:
            lines.append(f'**{item["title"]}**')
            if item.get('photographers'):
                lines.append(f'Fotógrafos: {", ".join(item["photographers"])}')
            lines.append('')
            lines.append(clean_text(item['full_text']))
            lines.append('')
    if not colossal and not lomo:
        lines.append('No hubo artículos hoy.')
    return '\n'.join(lines)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ts = datetime.now().isoformat()
    print(f'[{ts}] Generando digest de {TODAY}...')

    print('  1. Colossal...')
    posts = fetch_colossal_articles()
    colossal = []
    for p in posts:
        print(f'    → {p["title"]["rendered"][:60]}')
        colossal.append(process_colossal(p))
    print(f'    {len(colossal)} artículos')

    print('  2. Lomography...')
    lomo_articles = fetch_lomography_articles()
    lomo = []
    for a in lomo_articles:
        print(f'    → {a["title"][:60]}')
        lomo.append(process_lomo(a))
    print(f'    {len(lomo)} artículos')

    html = render_html(colossal, lomo)
    podcast = render_podcast(colossal, lomo)
    stem = f'digest-{TODAY.isoformat()}'
    with open(os.path.join(OUT_DIR, f'{stem}.html'), 'w') as f:
        f.write(html)
    with open(os.path.join(OUT_DIR, f'{stem}.podcast.md'), 'w') as f:
        f.write(podcast)
    print(f'  Guardado: {stem}.html, {stem}.podcast.md')

if __name__ == '__main__':
    main()
