# The Great Controversy — Illustrated Study Edition

An automated production system for a large-print, richly illustrated study edition of Ellen G. White's
*The Great Controversy* (1888), designed for elderly readers. Structured chapter content goes in; a
paginated, print-size A4 PDF with real (selectable) text comes out.

## Current status

| Item | Status |
| --- | --- |
| Publishing system (templates, pagination, QA, PDF export) | Working |
| Chapter 1 layout proof | `output/chapter-01/chapter-01-DRAFT.pdf` — 26 pages, QA clean |
| `reference-gamma.pdf` (visual reference) | **Not received.** The design follows the written brief (burgundy, cream, gold, serif headings) and has not been matched against the reference. |
| `ellen-white-source.pdf` (source text) | **Not received.** Its license could not be inspected. |
| Chapter 1 text | **Draft.** Written from general knowledge of the chapter, not from a verified source. Every "Ellen White's View" panel must be checked against a verified public-domain 1888 text before approval. |
| Illustrations | **None generated.** No image-generation service is connected. The proof shows labelled placeholders. |
| Map and timeline | Real — drawn as vector artwork in the chapter folder. |
| Chapters 2–42 | Not started (waiting for Chapter 1 approval). |

## Commands

```bash
npm run build -- 1 --draft --preview   # proof PDF; missing pictures become labelled placeholders
npm run build -- 1                     # final PDF; refuses to build if any picture is missing
npm run images -- 1 --list             # show every illustration prompt for a chapter
npm run images -- 1                    # generate missing illustrations (needs OPENAI_API_KEY)
```

Requires Node 20+ and Playwright with Chromium (`npm i playwright && npx playwright install chromium`).
If Chromium lives somewhere unusual, set `CHROMIUM_PATH`.

## Connecting image generation

`scripts/generate-images.mjs` calls the OpenAI Images API. Set `OPENAI_API_KEY` (optionally
`IMAGE_MODEL`, `IMAGE_QUALITY`) and run `npm run images -- 1`. This integration has **not been tested**
— no key was available when it was written. Without a key the script stops, explains what is missing,
and creates nothing. Pictures made any other way can simply be saved into
`chapters/chapter-NN/images/` under the filenames listed by `--list`.

All prompts share the art direction in `scripts/art-direction.json`, which keeps the look consistent
across the 42 chapters.

## Project layout

```
book.json                     book-wide settings (title, edition, Bible version)
assets/fonts/                 Playfair Display + Source Serif 4 (SIL Open Font License)
assets/images/                shared artwork (ornaments, book cover) — empty for now
chapters/chapter-NN/
  content.json                the chapter: cover, illustration list with prompts, eight sections
  images/                     that chapter's illustrations, maps and diagrams
templates/
  blocks.mjs                  content blocks: paragraph, verse box, panels, timeline, people, lessons…
  document.mjs                chapter cover + document assembly
  paginate.js                 automatic pagination (runs in the browser)
styles/book.css               visual identity and typography
scripts/
  build.mjs                   content → HTML → QA → PDF
  qa.mjs                      automated quality control
  generate-images.mjs         illustration generation
  art-direction.json          shared illustration style
output/chapter-NN/            PDFs and QA reports
```

## Writing a chapter

Each chapter is one `content.json` with a `cover`, an `images` list (id, filename, alt text, prompt)
and `sections`. The eight study sections use the ids `story`, `background`, `meaning`, `visual`,
`scripture`, `lessons`, `questions`, `application`; QA fails the build if one is missing.

Each section picks a page template — `narrative`, `history`, `visual`, `bible`, `reflection` or
`guide` — which changes the page's background, banding and framing while keeping the same brand.

Block types: `p`, `heading`, `image`, `svg`, `verse`, `panel`, `timeline`, `people`, `lessons`,
`questions`, `legend`, `parts`. Text accepts `*italic*` and `**bold**`.

Every panel declares where its content comes from, and the label is printed on the page:

| `kind` | Printed label | Use for |
| --- | --- | --- |
| (`verse` block) | Scripture · KJV | Bible quotations, word for word |
| `history` | History | Historical facts, naming the ancient source where possible |
| `egw` | Ellen White's View | Her interpretation, paraphrased |
| `note` | Study Note | Explanations added by this edition's editors |
| `apply` | For Your Life | Personal application |

## Typography (points)

| Element | Size | Brief |
| --- | --- | --- |
| Chapter title | 36 | 30–36 |
| Section heading | 28 | 25–30 |
| Subheadings | 21–22 | 21–24 |
| Bible passages | 19 | 18–20 |
| Main text | 18 (opening paragraph 19) | 17–19 |
| Captions / labels / running heads | 12–15 | never below 12 on the printed page |

Pagination never shrinks text. A block that does not fit moves to a new page; long panels divide
between paragraphs and the continuation keeps its source label.

## Quality control

Every build checks, and refuses to export the PDF on any error:

- all eight sections are present
- every text element is within the size ranges above, and nothing is below its minimum
- no content overflows a page, sticks out past the page edge, or is clipped
- no blocks overlap; map labels stay inside the map and do not collide
- every image loaded; images below 150 dpi at printed size are reported
- pages less than 35% full are reported as warnings

The automated checks do not replace looking at the pages: use `--preview` and read the PDF.

## Print notes

The PDF is A4 portrait, RGB, with fonts embedded and no bleed. That is right for screen reading and
desktop or digital printing. A commercial offset printer will normally ask for 3 mm bleed and CMYK
conversion; that step is not built yet.
