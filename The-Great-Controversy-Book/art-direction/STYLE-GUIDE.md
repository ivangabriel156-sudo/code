# Illustration style guide — all 42 chapters

The machine-readable version of this guide is `style-guide.json`; every prompt is assembled from it,
so changing the guide changes every future prompt. Recurring characters are in `characters.json`.

## The look

Cinematic historical painting: the finish of a nineteenth-century academic oil painting with the
framing of an epic film still, matching the sunset paintings in `reference/reference-gamma.pdf`.

- **Palette:** gold, amber, ochre, olive and deep russet; cream highlights; deep brown shadows.
- **Composition:** one clear focal point, depth from foreground to far distance, generous sky.
- **Mood:** dignified, reverent, emotionally clear. Suffering is suggested, never graphic.
- **Format:** 16:9 landscape unless a manifest entry says otherwise; at least two variations per scene.

## Always

- Architecture, clothing, hair and equipment correct for the stated place and period.
- Natural proportions, correct hands, calm natural faces.
- People of the ancient Near East shown with Middle Eastern features and skin tones.
- Believable terrain, vegetation, weather and materials.
- A picture that still reads clearly printed 17 cm wide.

## Never

- Text, lettering, signatures, logos or watermarks in the image.
- Modern objects, clothing or buildings in ancient scenes.
- Wrong-period architecture (medieval castles, Gothic arches, domes or minarets in first-century Jerusalem).
- Distorted faces or hands, duplicated limbs.
- Halos, auras, wings or other fantasy effects unless a scene asks for them.
- Cartoon, anime, 3D-render or stock-photo looks.

## Lighting presets

`golden-hour`, `morning`, `overcast-drama`, `night-fire`, `interior-window`, `museum-raking` — a
manifest entry names one, or gives its own description.

## Period notes

Reusable accuracy notes (`first-century-judea`, `roman-army-first-century`) are attached to scenes by
name. Add a note for each new period as the book moves on (early church, medieval Europe, the
Reformation, nineteenth-century America), so every chapter set in that period gets the same guidance.

## Recurring characters

A recurring character is described once in `characters.json` and gets approved reference images
(for Jesus: a portrait and a full figure). Those references are produced and approved **before** any
scene that includes the character, and are attached to every later prompt for that character, together
with the same written description of face, hair, age, build and clothing.

## Quality bar for approval

Reject a variation if it shows any item from the "Never" list, the wrong period, a face that does
not match the approved character reference, or a focal point that would be lost at print size.
