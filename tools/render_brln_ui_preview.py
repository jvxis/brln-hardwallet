"""Assemble native production-layout renders; contains synthetic fixtures only."""
from pathlib import Path
from PIL import Image, ImageDraw

names = ['hash', 'help', 'pair', 'confirm', 'password', 'cancel-entry',
         'word', 'address-1', 'address-2', 'amount', 'fee', 'sign']
width, height = 504, 310
sheet = Image.new('RGB', (width * 3, height * 4), '#172333')
draw = ImageDraw.Draw(sheet)
for index, name in enumerate(names):
    source = Path('artifacts') / f'ui-device-{name}.ppm'
    image = Image.open(source)
    assert image.size == (240, 135)
    x, y = (index % 3) * width, (index // 3) * height
    draw.text((x + 12, y + 8), name + ' | synthetic fixture | 2x', fill='white')
    sheet.paste(image.resize((480, 270), Image.Resampling.NEAREST), (x + 12, y + 30))
output = Path('docs/assets/device-ui-preview.png')
output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output)
print(output)
