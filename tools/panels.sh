# render a few rail debug crops side by side (old | new)
cd /home/claude/shuto3
r() { python3 tools/drawrail.py data/world.orig.json test/maps/p0_$1.png $2 $3 $4 $5 $6 >/dev/null; python3 tools/drawrail.py data/world.json test/maps/p1_$1.png $2 $3 $4 $5 $6 >/dev/null;
python3 -c "
from PIL import Image
a=Image.open('test/maps/p0_$1.png'); b=Image.open('test/maps/p1_$1.png'); w,h=a.size
c=Image.new('RGB',(w*2+8,h),(255,255,255)); c.paste(a,(0,0)); c.paste(b,(w+8,0)); c.save('test/maps/cmp_$1.png')"; }
r tokyo 0 -6000 2200 -3600 0.42
r shinjuku -6200 -7200 -3800 -4600 0.4
r shibuya -5800 -3200 -3400 -400 0.36
r ueno 600 -10200 3000 -7500 0.38
r yokohama -13200 17400 -10600 20200 0.36
r kosugi -10400 3000 -6800 7600 0.25
