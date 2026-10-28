"""Dev tool: derives raster sizes, favicon and palette from brand/ and reference/.
Run once with: python -I scripts/assets.py   (outputs are committed under src/assets and scripts/)."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
logo_path = os.path.join(root, 'brand', 'LOGO CURSONIC PNG...png')   # RGBA, colourtype 6, transparent regions are pure black
ref_path = os.path.join(root, 'reference', 'CURSONIC 1.jpg.jpeg')
out = os.path.join(root, 'src', 'assets')

im = Image.open(logo_path).convert('RGBA')
a = np.array(im).astype(np.float64)
alpha = a[..., 3] / 255.0
mask = a[..., 3] > 127
ys, xs = np.where(mask)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print('bbox', x0, y0, x1, y1)

# square crop around the mark with a margin
side = int(max(x1 - x0, y1 - y0) * 1.16)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)

def premul_resize(img, size):
    arr = np.array(img).astype(np.float64)
    al = arr[..., 3:4] / 255.0
    pm = np.concatenate([arr[..., :3] * al, arr[..., 3:4]], axis=2)
    chans = [Image.fromarray(pm[..., i].astype(np.float32), mode='F').resize((size, size), Image.LANCZOS) for i in range(4)]
    r = np.stack([np.array(c) for c in chans], axis=2)
    al2 = np.clip(r[..., 3:4], 0, 255)
    rgb = np.where(al2 > 0, r[..., :3] / np.maximum(al2 / 255.0, 1e-6), 0)
    res = np.concatenate([np.clip(rgb, 0, 255), al2], axis=2).round().astype(np.uint8)
    return Image.fromarray(res, 'RGBA')

crop = im.crop(box)
for s in (512, 192, 64):
    premul_resize(crop, s).save(os.path.join(out, f'logo-{s}.png'), optimize=True)
    print('wrote logo', s)

# favicon: polygons read from the mask corners, verified by IoU against the real pixel grid
outer = [(507,798),(1413,540),(1150,1400),(1076,1332),(1224,829),(1113,723),(581,870)]
inner = [(672,956),(1096,841),(979,1249),(860,1134),(689,1292),(623,1229),(791,1070)]
k = 2000 / 1932
def sc(p): return (p[0] * k, p[1] * k)
def snap(p, r=14):
    # move each vertex to the nearest extreme mask pixel within r
    px, py = int(p[0]), int(p[1])
    best, bd = (px, py), 1e9
    for yy in range(py - r, py + r):
        for xx in range(px - r, px + r):
            if 0 <= xx < 2000 and 0 <= yy < 2000 and mask[yy, xx]:
                d = (xx - p[0]) ** 2 + (yy - p[1]) ** 2
                if d < bd: bd, best = d, (xx, yy)
    return best
# outer chevron is one connected piece with concave notch; polygon order as measured
O = [snap(sc(p)) for p in outer]
I = [snap(sc(p)) for p in inner]
test = Image.new('L', (2000, 2000), 0)
d = ImageDraw.Draw(test)
d.polygon(O, fill=255); d.polygon(I, fill=255)
t = np.array(test) > 127
iou = (t & mask).sum() / (t | mask).sum()
print('IoU', round(float(iou), 4))
bx0 = min(p[0] for p in O + I); bx1 = max(p[0] for p in O + I)
by0 = min(p[1] for p in O + I); by1 = max(p[1] for p in O + I)
span = max(bx1 - bx0, by1 - by0) * 1.12
ox = (bx0 + bx1) / 2 - span / 2; oy = (by0 + by1) / 2 - span / 2
def f(p): return f'{(p[0]-ox)*32/span:.1f},{(p[1]-oy)*32/span:.1f}'
colour = '#%02x%02x%02x' % tuple(int(v) for v in a[..., :3][mask].mean(0).round())
# snap fill to a real pixel colour
rgbm = a[..., :3][mask].astype(int)
mean = rgbm.mean(0)
nearest = rgbm[((rgbm - mean) ** 2).sum(1).argmin()]
fill = '#%02x%02x%02x' % tuple(int(v) for v in nearest)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
       f'<path fill="{fill}" fill-rule="evenodd" d="M{" L".join(f(p) for p in O)} Z M{" L".join(f(p) for p in I)} Z"/></svg>\n')
open(os.path.join(out, 'favicon.svg'), 'w').write(svg)
print(svg, fill)

# palette: k-means over every pixel of the reference frame, each centroid snapped to a real pixel coordinate
ref = np.array(Image.open(ref_path).convert('RGB'))
H, W = ref.shape[:2]
flat = ref.reshape(-1, 3).astype(np.float64)
rng = np.random.default_rng(7)
sub = flat[rng.choice(len(flat), 90000, replace=False)]
c = sub[rng.choice(len(sub), 10, replace=False)].copy()
for _ in range(40):
    lab = ((sub[:, None] - c[None]) ** 2).sum(2).argmin(1)
    for i in range(10):
        if (lab == i).any(): c[i] = sub[lab == i].mean(0)
cand = []
for i in range(10):
    dd = ((flat - c[i]) ** 2).sum(1)
    j = int(dd.argmin())
    cand.append({'hex': '#%02x%02x%02x' % tuple(int(v) for v in flat[j]), 'x': j % W, 'y': j // W, 'asset': 'reference/CURSONIC 1.jpg.jpeg', 'share': int((lab == i).sum())})
# logo centroid pixel
j = int(((rgbm - mean) ** 2).sum(1).argmin())
yy, xx = np.where(mask)
cand.append({'hex': fill, 'x': int(xx[j]), 'y': int(yy[j]), 'asset': 'brand/LOGO CURSONIC PNG...png', 'share': int(mask.sum())})
json.dump(cand, open(os.path.join(root, 'scripts', 'palette-candidates.json'), 'w'), indent=1)
for x in cand: print(x)
