import json
import os
import subprocess
from datetime import date

from update_static_data import (fetch_colossal, fetch_lomography, fetch_booooooom,
                                fetch_tpj, fetch_swan, fetch_huck, load_previous_items)

DIR = os.path.dirname(os.path.abspath(__file__))


def save_payload(filename, items, all_entries):
    payload = {'items': items, 'count': len(items), 'updated': date.today().isoformat()}
    if filename == 'feeds.json':
        payload = {'items': all_entries, 'count': len(all_entries), 'updated': date.today().isoformat()}
    with open(os.path.join(DIR, filename), 'w') as f:
        json.dump(payload, f, ensure_ascii=False)
    print(f'  Guardado {filename} ({len(items)})')


def main():
    ts = date.today().isoformat()
    print(f'[{ts}] Actualizando listas de feeds...')

    print('  1. Colossal...')
    colossal = fetch_colossal()
    print(f'     {len(colossal)} artículos')

    print('  2. Lomography...')
    lomo = fetch_lomography()
    if not lomo:
        lomo = load_previous_items('lomography.json')
    print(f'     {len(lomo)} artículos')

    print('  3. Booooooom...')
    boom = fetch_booooooom()
    if not boom:
        boom = load_previous_items('booooooom.json')
    print(f'     {len(boom)} artículos')

    print('  4. The Photographic Journal...')
    tpj = fetch_tpj()
    if not tpj:
        tpj = load_previous_items('tpj.json')
    print(f'     {len(tpj)} artículos')

    print('  5. Swann Galleries...')
    swan = fetch_swan()
    if not swan:
        swan = load_previous_items('swan.json')
    print(f'     {len(swan)} artículos')

    print('  6. Huck Magazine...')
    huck = fetch_huck()
    if not huck:
        huck = load_previous_items('huck.json')
    print(f'     {len(huck)} artículos')

    all_entries = sorted(colossal + lomo + boom + tpj + swan + huck,
                         key=lambda x: x.get('_parsedDate') or x.get('date') or '',
                         reverse=True)

    save_payload('lomography.json', lomo, all_entries)
    save_payload('booooooom.json', boom, all_entries)
    save_payload('tpj.json', tpj, all_entries)
    save_payload('swan.json', swan, all_entries)
    save_payload('huck.json', huck, all_entries)
    save_payload('feeds.json', all_entries, all_entries)

    print('  7. Subiendo a GitHub...')
    try:
        subprocess.run(
            ['git', 'add', 'lomography.json', 'booooooom.json', 'tpj.json', 'swan.json', 'huck.json', 'feeds.json'],
            capture_output=True, text=True, cwd=DIR
        )
        res = subprocess.run(
            ['git', 'commit', '-m', f'chore: update static feeds {ts}'],
            capture_output=True, text=True, cwd=DIR
        )
        if 'nothing to commit' in res.stdout:
            print('     Sin cambios')
            return
        if res.returncode != 0:
            print(f'     ⚠️ Error commit: {res.stderr[:300]}')
            return
        pull = subprocess.run(
            ['git', 'pull', '--rebase', '--autostash'],
            capture_output=True, text=True, cwd=DIR
        )
        if pull.returncode != 0:
            print(f'     ⚠️ Rebase fallido: {pull.stderr[:200]}')
            return
        res = subprocess.run(['git', 'push'], capture_output=True, text=True, cwd=DIR)
        if res.returncode == 0:
            print('     ✅ Push a GitHub OK')
        else:
            print(f'     ⚠️ Error push: {res.stderr[:200]}')
    except Exception as e:
        print(f'     ⚠️ Git error: {e}')


if __name__ == '__main__':
    main()
