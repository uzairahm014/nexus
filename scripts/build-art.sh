#!/usr/bin/env bash
# Derives the full NEXUS image set from the two supplied reference artworks.
set -e
SRC1="NEXUS Neon Gaming Universe.png"
SRC2="NEXUS Neon Gaming Universe-1.png"
OUT="client/public/art"
mkdir -p "$OUT"

# Wide cinematic crops
convert "$SRC1" -resize 1920x1080^ -gravity center -extent 1920x1080 -modulate 88,118,100 -quality 86 "$OUT/hero-home.jpg"
convert "$SRC2" -resize 1920x1080^ -gravity center -extent 1920x1080 -modulate 82,124,100 -quality 86 "$OUT/hero-discover.jpg"
convert "$SRC1" -crop 1672x700+0+120 +repage -resize 1920x800^ -gravity center -extent 1920x800 -modulate 92,116,100 -quality 84 "$OUT/hero-games.jpg"
convert "$SRC2" -crop 1672x700+0+160 +repage -resize 1920x800^ -gravity center -extent 1920x800 -modulate 86,120,100 -quality 84 "$OUT/hero-social.jpg"

poster () { # src x y hue bright sat out
  convert "$1" -crop 600x820+"$2"+"$3" +repage -resize 720x960^ -gravity center -extent 720x960 \
    -modulate "$5","$6","$4" -fill "$7" -colorize 18% -quality 85 "$OUT/$8"
}

poster "$SRC1"   0  60 100 96 122 '#3A2C9E' game-neon-racer.jpg
poster "$SRC1" 480 100 108 88 130 '#5B2C9E' game-arena.jpg
poster "$SRC1" 960  40  96 92 118 '#1F4FA8' game-parkour.jpg
poster "$SRC2" 100  90 112 90 126 '#6A2C9E' game-tower.jpg
poster "$SRC2" 700  30  92 98 120 '#2C3FA8' game-party.jpg

banner () { # src x y w h hue bright sat tint out
  convert "$1" -crop "$3"x"$4"+"$2"+"$5" +repage -resize 1600x600^ -gravity center -extent 1600x600 \
    -modulate "$7","$8","$6" -fill "$9" -colorize 14% -quality 84 "$OUT/$10"
}
banner "$SRC1"   0 1672 500 200 100 90 120 '#3A2C9E' banner-live.jpg
banner "$SRC2" 200 1200 500 220 106 86 124 '#5B2C9E' banner-community.jpg
banner "$SRC1" 300 1100 500 260 110 84 118 '#1F4FA8' banner-create.jpg
banner "$SRC2"   0 1672 420 300  96 88 126 '#6A2C9E' banner-marketplace.jpg
convert "$SRC2" -crop 1672x420+0+120 +repage -resize 1600x400^ -gravity center -extent 1600x400 -modulate 90,116,104 -quality 84 "$OUT/banner-profile.jpg"

clip () { # src x y hue bright sat out
  convert "$1" -crop 520x300+"$2"+"$3" +repage -resize 800x450^ -gravity center -extent 800x450 \
    -modulate "$5","$6","$4" -quality 82 "$OUT/$7"
}
clip "$SRC1"   60 300 100 92 120 clip-1.jpg
clip "$SRC1"  620 200 108 88 126 clip-2.jpg
clip "$SRC2"  240 420  96 94 118 clip-3.jpg
clip "$SRC2"  880 240 112 86 124 clip-4.jpg

tile () { # src x y out
  convert "$1" -crop 420x420+"$2"+"$3" +repage -resize 600x600^ -gravity center -extent 600x600 -modulate 92,120,102 -quality 82 "$OUT/$4"
}
tile "$SRC1" 100 120 comm-1.jpg
tile "$SRC1" 700 300 comm-2.jpg
tile "$SRC2" 300 400 comm-3.jpg
tile "$SRC2" 1000 100 comm-4.jpg

convert "$SRC1" -resize 1200x630^ -gravity center -extent 1200x630 -modulate 90,120,100 -quality 85 "$OUT/og.jpg"
ls -la "$OUT"
