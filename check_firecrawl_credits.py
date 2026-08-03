import re
import subprocess
import sys


def remaining_credits():
    try:
        out = subprocess.run(['firecrawl', 'credit-usage'],
                             capture_output=True, text=True, timeout=30).stdout
    except Exception:
        return 0
    m = re.search(r'Remaining Credits:\s*([\d,]+)', out)
    if not m:
        return 0
    return int(m.group(1).replace(',', ''))


if __name__ == '__main__':
    need = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    rem = remaining_credits()
    print(f'Créditos Firecrawl restantes: {rem}')
    if rem >= need:
        print(f'Suficientes (>= {need})')
        sys.exit(0)
    print(f'Insuficientes (< {need}) — se salta la acción que gasta créditos')
    sys.exit(1)
