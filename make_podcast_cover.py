import os

from PIL import Image, ImageDraw, ImageFilter

DIR = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(DIR, 'pdv.png')
OUT = os.path.join(DIR, 'podcast-cover.png')
SIZE = 1400
BG = '#0a0a0a'
ACCENT = (255, 1, 0)


def make_glow(size):
    gs = 320
    glow = Image.new('RGBA', (gs, gs), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    c = gs / 2
    r_max = gs / 2
    for i in range(40, 0, -1):
        r = r_max * i / 40
        alpha = int(26 * (1 - i / 40))
        d.ellipse([c - r, c - r, c + r, c + r], fill=ACCENT + (alpha,))
    glow = glow.filter(ImageFilter.GaussianBlur(30))
    return glow.resize((size, size), Image.LANCZOS)


def main():
    logo = Image.open(LOGO).convert('RGBA')
    logo = logo.resize((1240, 1240), Image.LANCZOS)

    img = Image.new('RGBA', (SIZE, SIZE), BG)
    img.alpha_composite(make_glow(SIZE))
    img.alpha_composite(logo, ((SIZE - 1240) // 2, (SIZE - 1240) // 2))
    img = img.convert('RGB')

    img.save(OUT)
    print(f'Portada generada: {OUT} ({img.size[0]}x{img.size[1]})')


if __name__ == '__main__':
    main()
