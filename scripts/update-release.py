"""Render public release notes from releases.json. Run before every deployment."""
from pathlib import Path
from datetime import date
from html import escape
import json
import re

root = Path(__file__).resolve().parent.parent
releases = json.loads((root / 'releases.json').read_text())['releases']
assert releases, 'At least one release is required'
versions = []
for release in releases:
    assert re.fullmatch(r'\d+\.\d+\.\d+', release['version']), 'Use major.minor.patch'
    versions.append(tuple(map(int, release['version'].split('.'))))
    date.fromisoformat(release['date'])
    assert release['changes'] and all(isinstance(c, str) and c.strip() for c in release['changes'])
assert versions == sorted(set(versions), reverse=True), 'Versions must be unique, newest first'
assert [r['date'] for r in releases] == sorted([r['date'] for r in releases], reverse=True), 'Dates must be newest first'
latest = releases[0]
version = escape(latest['version'])
updated = escape(latest['date'])
entries = ''.join(
    '<section class="release-entry"><h3>v' + escape(r['version']) +
    ' <time datetime="' + escape(r['date']) + '">' + escape(r['date']) +
    '</time></h3><ul>' + ''.join('<li>' + escape(c) + '</li>' for c in r['changes']) +
    '</ul></section>' for r in releases
)
block = ('<!-- release:start -->\n'
    '<section class="site-release" aria-label="사이트 버전 및 업데이트 내역">'
    '<div class="release-summary"><span>사이트 <strong>v' + version + '</strong></span>'
    '<span>최종 업데이트 <time datetime="' + updated + '">' + updated + '</time></span></div>'
    '<details><summary>업데이트 내역 보기</summary>' + entries + '</details>'
    '<p class="release-note">위 버전은 공략 사이트의 버전입니다. 게임 버전은 화면 상단에 표시됩니다.</p>'
    '</section>\n<!-- release:end -->')
index = root / 'index.html'
html = index.read_text()
if '<!-- release:start -->' in html:
    html = re.sub(r'<!-- release:start -->.*?<!-- release:end -->', lambda m: block, html, flags=re.S)
else:
    assert '<footer>' in html
    html = html.replace('<footer>', block + '\n    <footer>', 1)
html = re.sub(r'(href="style\.css|src="app\.js)(?:\?v=[^"]*)?"', lambda m: m[1] + '?v=' + version + '"', html)
if 'href="release.css' not in html:
    html = html.replace('</head>', '  <link rel="stylesheet" href="release.css?v=' + version + '">\n</head>')
else:
    html = re.sub(r'href="release\.css(?:\?v=[^"]*)?"', 'href="release.css?v=' + version + '"', html)
index.write_text(html)
print('Release v' + latest['version'] + ' · ' + latest['date'])
