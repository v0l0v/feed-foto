import math
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


def draw_aperture(d, cx, cy, r_outer=215, r_ring=140, r_hole=88, n=6):
    d.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], fill=FG)
    d.ellipse([cx - r_ring, cy - r_ring, cx + r_ring, cy + r_ring], fill=BG)
    for i in range(n):
        a0 = i * (2 * math.pi / n)
        a1 = (i + 1) * (2 * math.pi / n)
        hex_i = (cx + r_hole * math.cos(a0), cy + r_hole * math.sin(a0))
        hex_j = (cx + r_hole * math.cos(a1), cy + r_hole * math.sin(a1))
        arc = [(cx + r_ring * math.cos(a), cy + r_ring * math.sin(a))
               for a in (a1, (a0 + a1) / 2, a0)]
        d.polygon([hex_i, hex_j] + arc, fill=FG)
    hole = [(cx + r_hole * math.cos(i * 2 * math.pi / n),
             cy + r_hole * math.sin(i * 2 * math.pi / n)) for i in range(n)]
    d.polygon(hole, fill=BG)
    d.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], fill=FG)


def main():
    img = Image.new('RGB', (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    pad = 64
    d.rounded_rectangle([pad, pad, SIZE - pad, SIZE - pad], radius=90,
                        outline=MUTED, width=3)

    f_word = font('DejaVuSans-ExtraLight.ttf', 150)
    f_sub = font('DejaVuSans.ttf', 74)

    draw_aperture(d, SIZE / 2, 560)
    d.text((SIZE / 2, 950), 'feed·foto', font=f_word, fill=LIGHT, anchor='mm')
    d.line([(430, 1080), (970, 1080)], fill=FG, width=5)
    d.text((SIZE / 2, 1210), 'PODCAST DIARIO', font=f_sub, fill=FG,
           anchor='mm')

    img.save(OUT)
    print(f'Portada generada: {OUT} ({img.size[0]}x{img.size[1]})')


if __name__ == '__main__':
    main()
