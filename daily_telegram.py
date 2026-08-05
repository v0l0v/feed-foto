import json
import os
import re
import subprocess
import time
import urllib.request
from datetime import date, datetime
from pathlib import Path

import requests

DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(DIR, 'resumenes')
PODCAST_DIR = os.path.join(DIR, 'podcast')
META_PATH = os.path.join(DIR, 'podcast_meta.json')

CONFIG = {}
try:
    CONFIG = json.load(open(os.path.join(DIR, 'config.json')))
except Exception:
    pass


def _cfg(key):
    return os.environ.get(key) or CONFIG.get(key)


TG_TOKEN = _cfg('TG_TOKEN')
TG_CHAT_ID = _cfg('TG_CHAT_ID')
GEMINI_KEY = _cfg('GEMINI_KEY')
GEMINI_MODEL = 'gemini-3-flash-preview'
GEMINI_URL = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}'

MAX_RETRIES = 5
RETRY_DELAY = 15


def find_latest_podcast(target_date=None):
    files = sorted(Path(OUT_DIR).glob('*.podcast.md'), reverse=True)
    if target_date:
        for f in files:
            if target_date.isoformat() in f.name:
                return f
        return None
    return files[0] if files else None


def gemini_request(prompt):
    body = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'temperature': 0.7,
            'maxOutputTokens': 2048,
        }
    }
    data = json.dumps(body).encode()
    req = urllib.request.Request(GEMINI_URL, data=data,
                                 headers={'Content-Type': 'application/json'},
                                 method='POST')
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read())
            text = result['candidates'][0]['content']['parts'][0]['text']
            return text.strip()
        except urllib.error.HTTPError as e:
            err = e.read().decode()
            if 'quota' in err.lower() or 'RESOURCE_EXHAUSTED' in err:
                wait = RETRY_DELAY * (attempt + 1)
                print(f'  Cuota excedida, reintentando en {wait}s...')
                time.sleep(wait)
                continue
            print(f'  Error API: {err[:300]}')
            return None
        except (urllib.error.URLError, json.JSONDecodeError, KeyError) as e:
            print(f'  Error: {e}')
            return None
    print('  Se agotaron los reintentos por cuota.')
    return None


def send_telegram(text, parse_mode='HTML'):
    url = f'https://api.telegram.org/bot{TG_TOKEN}/sendMessage'
    try:
        resp = requests.post(url, json={
            'chat_id': TG_CHAT_ID,
            'text': text,
            'parse_mode': parse_mode,
            'disable_web_page_preview': True
        }, timeout=30)
        return resp.json()
    except requests.RequestException as e:
        print(f'  Error Telegram: {e}')
        return None


def send_telegram_audio(audio_path, caption='', filename='podcast.mp3'):
    url = f'https://api.telegram.org/bot{TG_TOKEN}/sendAudio'
    try:
        with open(audio_path, 'rb') as f:
            files = {'audio': (filename, f, 'audio/mpeg')}
            data = {'chat_id': TG_CHAT_ID}
            if caption:
                data['caption'] = caption
            resp = requests.post(url, data=data, files=files, timeout=120)
            return resp.json()
    except requests.RequestException as e:
        print(f'  Error Telegram audio: {e}')
        return None


def generate_audio(text, out_path):
    try:
        subprocess.run([
            'edge-tts',
            '--voice', 'es-ES-ElviraNeural',
            '--text', text,
            '--write-media', out_path
        ], check=True, capture_output=True, text=True, timeout=120)
        return True
    except subprocess.CalledProcessError as e:
        print(f'  Error edge-tts: {e.stderr[:300]}')
        return False
    except FileNotFoundError:
        print('  edge-tts no instalado')
        return False


def clean_text(t):
    t = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
               r'\U0001F1E0-\U0001F1FF\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F'
               r'\U0001FA70-\U0001FAFF\u2702-\u27B0\u24C2-\U0001F251'
               r'\U0001F004\u2600-\u26FF\uFE0F]', '', t)
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


TITLE_MARKER = '---TITLE---'
LOCUTABLE_MARKER = '---LOCUTABLE---'

MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

def fmt_fecha_es(d):
    return f'{d.day} de {MESES_ES[d.month - 1]} de {d.year}'

def build_summary_prompt(podcast_content):
    today = date.today().isoformat()
    return f"""Hoy es {today}. A continuación tienes el texto completo de varios artículos de fotografía.

{podcast_content}

Escribe tu respuesta en TRES secciones separadas por estas líneas exactas:
{TITLE_MARKER}
{LOCUTABLE_MARKER}

PRIMERA SECCIÓN - Un título creativo en español para el episodio del podcast, extraído del contexto de los artículos. Solo el título, sin explicaciones ni notas adicionales.

SEGUNDA SECCIÓN - Solo los resúmenes para redes sociales, con este formato exacto:
- Sin introducciones, sin títulos de programa, sin despedidas, sin notas.
- Por cada artículo: pon el título en negrita **Título** y debajo 2-3 frases de resumen atractivas en español.
- Los resúmenes deben sonar amenos e inspiradores, como para leerlos en una red social.

TERCERA SECCIÓN (solo el texto locutable para el audio del podcast):
- El guion de radio en español, tono natural y cercano.
- Debe sonar bien al leerlo en voz alta.
- Empieza directo con el saludo: "¡Hola, muy buenas!".
- Termina con "¡Nos escuchamos mañana!".
- Sin títulos, sin etiquetas, sin resúmenes, solo la locución."""


def main():
    import sys
    os.makedirs(OUT_DIR, exist_ok=True)
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    today = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()
    print(f'[{ts}] daily_telegram · {today}')

    podcast_file = find_latest_podcast(today)
    if not podcast_file:
        print(f'  No hay archivo .podcast.md para {today}')
        return

    print(f'  Leyendo: {podcast_file.name}')
    content = podcast_file.read_text(encoding='utf-8')

    print('  Enviando a Gemini...')
    prompt = build_summary_prompt(content)
    summary = gemini_request(prompt)

    if not summary:
        print('  No se obtuvo respuesta de Gemini.')
        return

    print(f'  Resumen generado ({len(summary)} chars)')

    header = f'📸 <b>Punto de vista</b> · {fmt_fecha_es(today)}\n\n'

    podcast_title = ''
    locutable = summary
    title_parts = summary.split(TITLE_MARKER, 1)
    if len(title_parts) == 2:
        podcast_title = title_parts[0].strip()
        remaining = title_parts[1]
        loc_parts = remaining.split(LOCUTABLE_MARKER, 1)
        if len(loc_parts) == 2:
            locutable = loc_parts[1].strip()
            full_msg = header + loc_parts[0].strip()
        else:
            full_msg = header + remaining
    else:
        loc_parts = summary.split(LOCUTABLE_MARKER, 1)
        if len(loc_parts) == 2:
            locutable = loc_parts[1].strip()
            full_msg = header + loc_parts[0].strip()
        else:
            full_msg = header + summary

    if len(full_msg) > 4000:
        full_msg = full_msg[:3997] + '...'

    print('  Enviando texto a Telegram...')
    result = send_telegram(full_msg)
    if result and result.get('ok'):
        print('  ✅ Texto enviado')
    else:
        err = result.get('description', '?') if result else '?'
        print(f'  ❌ Error al enviar texto: {err}')

    print('  Generando audio...')
    clean_text_audio = clean_text(locutable)
    if not clean_text_audio:
        print('  ❌ No hay texto locutable para audio')
        return
    os.makedirs(PODCAST_DIR, exist_ok=True)
    audio_path = os.path.join(PODCAST_DIR, f'podcast-{today.isoformat()}.mp3')
    if generate_audio(clean_text_audio, audio_path):
        size = os.path.getsize(audio_path)
        print(f'  Audio generado ({size/1024:.0f} KB)')

        description = clean_text(loc_parts[0]) if len(loc_parts) == 2 else clean_text(summary)

        duration = 0
        try:
            probe = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', audio_path],
                capture_output=True, text=True, timeout=30)
            if probe.returncode == 0:
                duration = int(float(json.loads(probe.stdout)['format']['duration']))
        except Exception:
            duration = 0

        day_image = ''
        img_path = os.path.join(OUT_DIR, f'digest-{today.isoformat()}.image')
        if os.path.exists(img_path):
            try:
                with open(img_path, encoding='utf-8') as f:
                    day_image = f.read().strip()
            except Exception:
                day_image = ''
        images = []
        images_path = os.path.join(OUT_DIR, f'digest-{today.isoformat()}.images.json')
        if os.path.exists(images_path):
            try:
                with open(images_path, encoding='utf-8') as f:
                    images = json.load(f)
            except Exception:
                images = []
        images = [img for img in images if img != day_image]
        meta = []
        if os.path.exists(META_PATH):
            try:
                with open(META_PATH, encoding='utf-8') as f:
                    meta = json.load(f)
            except Exception:
                meta = []
        meta = [m for m in meta if m.get('date') != today.isoformat()]
        entry = {
            'date': today.isoformat(),
            'description': description,
            'image': day_image,
            'images': images,
            'podcast_title': podcast_title,
            'size': size,
            'duration': duration,
        }
        meta.append(entry)
        with open(META_PATH, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        print(f'  Meta del podcast actualizado ({len(meta)} episodios)')

        print('  Enviando audio a Telegram...')
        audio_caption = f'🎙️ <b>Punto de vista</b> · {fmt_fecha_es(today)}'
        if podcast_title:
            audio_caption += f'\n{clean_text(podcast_title)}'
        audio_filename = f'Punto de vista - {today.isoformat()}.mp3'
        result = send_telegram_audio(audio_path, audio_caption, audio_filename)
        if result and result.get('ok'):
            print('  ✅ Audio enviado')
        else:
            err = result.get('description', '?') if result else '?'
            print(f'  ❌ Error al enviar audio: {err}')
    else:
        print('  ❌ Error al generar audio')


if __name__ == '__main__':
    main()
