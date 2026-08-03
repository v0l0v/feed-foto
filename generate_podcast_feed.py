import json
import os
from datetime import datetime, timezone
from email.utils import format_datetime

DIR = os.path.dirname(os.path.abspath(__file__))
SITE = 'https://v0l0v.github.io/feed-foto'
RELEASE = 'https://github.com/v0l0v/feed-foto/releases/download/episodios'
COVER = f'{SITE}/podcast-cover.png'
META_PATH = os.path.join(DIR, 'podcast_meta.json')
OUT_PATH = os.path.join(DIR, 'podcast.xml')

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
         'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

CHANNEL_DESC = ('Resumen diario en audio de inspiración fotográfica: Colossal, '
                'Lomography Magazine, Booooooom, The Photographic Journal, '
                'Swann Galleries y Huck Magazine.')


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def cdata(s):
    s = str(s).replace(']]>', ']]]]><![CDATA[>')
    return f'<![CDATA[{s}]]>'


def load_meta():
    try:
        with open(META_PATH, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def item_lines(entry):
    date_str = entry['date']
    d = datetime.strptime(date_str, '%Y-%m-%d')
    pub = format_datetime(datetime(d.year, d.month, d.day, 5, 0, 0, tzinfo=timezone.utc))
    title = entry.get('title') or f'Feed·Foto · {date_str}'
    desc = entry.get('description') or ''
    url = f'{RELEASE}/podcast-{date_str}.mp3'
    size = int(entry.get('size') or 0)
    return [
        '  <item>',
        f'    <title>{esc(title)}</title>',
        f'    <link>{SITE}/</link>',
        f'    <guid isPermaLink="true">{url}</guid>',
        f'    <pubDate>{pub}</pubDate>',
        f'    <description>{cdata(desc)}</description>',
        f'    <enclosure url="{url}" length="{size}" type="audio/mpeg"/>',
        f'    <itunes:image href="{COVER}"/>',
        f'    <itunes:title>{esc(title)}</itunes:title>',
        '    <itunes:author>Feed·Foto</itunes:author>',
        f'    <itunes:summary>{cdata(desc)}</itunes:summary>',
        '    <itunes:explicit>false</itunes:explicit>',
        '  </item>',
    ]


def main():
    meta = sorted(load_meta(), key=lambda e: e.get('date', ''))
    now = format_datetime(datetime.now(timezone.utc))
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" '
        'xmlns:atom="http://www.w3.org/2005/Atom">',
        '<channel>',
        '<title>Feed·Foto — podcast diario</title>',
        f'<link>{SITE}/</link>',
        f'<atom:link href="{SITE}/podcast.xml" rel="self" type="application/rss+xml"/>',
        f'<description>{CHANNEL_DESC}</description>',
        '<language>es</language>',
        f'<lastBuildDate>{now}</lastBuildDate>',
        f'<image><url>{COVER}</url><title>Feed·Foto — podcast diario</title><link>{SITE}/</link></image>',
        f'<itunes:image href="{COVER}"/>',
        '<itunes:author>Feed·Foto</itunes:author>',
        '<itunes:subtitle>Resumen diario de inspiración fotográfica</itunes:subtitle>',
        f'<itunes:summary>{CHANNEL_DESC}</itunes:summary>',
        '<itunes:explicit>false</itunes:explicit>',
        '<itunes:category text="Arts"><itunes:category text="Visual Arts"/></itunes:category>',
    ]
    for entry in meta:
        lines.extend(item_lines(entry))
    lines.append('</channel>')
    lines.append('</rss>')

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'Feed generado: {OUT_PATH} ({len(meta)} episodios)')


if __name__ == '__main__':
    main()
