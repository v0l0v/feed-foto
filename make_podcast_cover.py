import os

from PIL import Image, ImageDraw, ImageFont

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, 'podcast-cover.png')
SIZE = 1400
BG = '#0a0a0a'
FG = '#c8732a'
LIGHT = '#ece6df'
MUTED = '#8a8a8a'
FONT_DIR = '/usr/share/fonts/truetype/dejavu'


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def glyph_font(size):
    candidates = [
        '/usr/share/fonts/truetype/noto/NotoSansSymbols-Medium.ttf',
        '/usr/share/fonts/truetype/noto/NotoSansSymbols-Regular.ttf',
        os.path.join(FONT_DIR, 'DejaVuSans.ttf'),
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.truetype(candidates[0], size)


def main():
    img = Image.new('RGB', (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    pad = 64
    d.rounded_rectangle([pad, pad, SIZE - pad, SIZE - pad], radius=90,
                        outline=MUTED, width=3)

    f_glyph = glyph_font(430)
    f_word = font('DejaVuSans-ExtraLight.ttf', 150)
    f_sub = font('DejaVuSans.ttf', 74)

    d.text((SIZE / 2, 560), '⛶', font=f_glyph, fill=FG, anchor='mm')
    d.text((SIZE / 2, 950), 'feed·foto', font=f_word, fill=LIGHT, anchor='mm')
    d.line([(430, 1080), (970, 1080)], fill=FG, width=5)
    d.text((SIZE / 2, 1210), 'PODCAST DIARIO', font=f_sub, fill=FG,
           anchor='mm')

    img.save(OUT)
    print(f'Portada generada: {OUT} ({img.size[0]}x{img.size[1]})')


if __name__ == '__main__':
    main()
