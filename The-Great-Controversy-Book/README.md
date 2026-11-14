# The Great Controversy — Illustrated Study Edition

An automated production system for a large-print, richly illustrated study edition of Ellen G. White's
*The Great Controversy* (1888), designed for elderly readers. Structured chapter content goes in; a
paginated, print-size A4 PDF with real (selectable) text comes out.

## Current status

| Item | Status |
| --- | --- |
| Publishing system (templates, pagination, QA, PDF export) | Working |
| Visual identity | Matched to `reference/reference-gamma.pdf`: Cormorant Garamond headings, Source Sans 3 text, and its burgundy, cream, beige and gold sampled from the file. Type is much larger than the reference, for elderly readers. |
| Chapter 1 layout proof | `output/chapter-01/chapter-01-DRAFT.pdf` — 28 pages, QA clean |
| Illustration pipeline (manifest, prompts, approval workflow, reports, PDF insertion) | Working; tested with synthetic test cards only |
| Google Flow | **Not connected.** No image has been generated. See `docs/FLOW-WORKFLOW.md`. |
| Illustrations | **0 of 8 for Chapter 1**, plus 2 character references outstanding. The proof shows labelled placeholders. |
| Source text | Two copies of the 1888 text, split into 42 chapters. See `source/README.md` for provenance and the licence note. |
| Chapter 1 text | **Draft, checked against the 1888 source.** Ellen White's ideas are paraphrased and labelled; two short sentences are quoted word for word. Awaiting the owner's review. |
| Map and timeline | Real — drawn as vector artwork in the chapter folder. |
| Chapters 2–42 | Not started (waiting for Chapter 1 approval). |

## Commands

```bash
npm run build -- 1 --draft --preview   # proof PDF; unapproved pictures become labelled placeholders
npm run build -- 1                     # final PDF; refuses to build until every picture is approved
npm run images -- status 1             # illustration report for a chapter
npm run images -- next 1               # the next picture to produce, with its full prompt
npm run images -- help                 # every workflow command
```

Requires Node 20+ and Playwright with Chromium (`npm i playwright && npx playwright install chromium`).
If Chromium lives somewhere unusual, set `CHROMIUM_PATH`.

## Illustrations

Pictures are made in Google Flow and controlled from this project:

- `chapters/chapter-NN/image-manifest.json` lists every picture a chapter needs: scene, period,
  characters, environment, style, camera, lighting, aspect ratio, page, filename, and its generation
  and approval status. The build writes the real page number back into the manifest.
- `art-direction/style-guide.json` (explained in `STYLE-GUIDE.md`) holds the one style used for all
  42 chapters; `art-direction/characters.json` holds recurring characters and their reference images.
- `scripts/images.mjs` runs the workflow: confirm, ingest, review, approve, reject, revise,
  regenerate, pause, resume, report. It never contacts Flow and never spends credits.
- Approved pictures are saved to `assets/images/chapter-NN/` and placed in the PDF automatically.
  Unapproved variations stay in a local candidates folder that git ignores.

The full procedure and the options for connecting Flow are in `docs/FLOW-WORKFLOW.md`.

## Project layout

```
book.json                     book-wide settings (title, edition, Bible version)
reference/                    the Gamma visual reference
source/                       the 1888 text, by chapter (public-domain scan committed; licensed working copy local only)
art-direction/                style guide and recurring-character references for all chapters
assets/fonts/                 Cormorant Garamond + Source Sans 3 (SIL Open Font License)
assets/images/chapter-NN/     approved illustrations, one folder per chapter
assets/images/characters/     approved character reference images
chapters/chapter-NN/
  content.json                the chapter text: cover and eight sections
  image-manifest.json         the chapter's illustration plan and status
  images/                     maps and diagrams (vector), plus local unapproved candidates
templates/
  blocks.mjs                  content blocks: paragraph, verse box, panels, timeline, people, lessons…
  document.mjs                chapter cover + document assembly
  paginate.js                 automatic pagination (runs in the browser)
styles/book.css               visual identity and typography
scripts/
  build.mjs                   content → HTML → QA → PDF
  qa.mjs                      automated quality control
  images.mjs                  illustration workflow commands
  image-lib.mjs               manifests, prompt builder, image validation, reports
docs/FLOW-WORKFLOW.md         Google Flow connection options and the step-by-step workflow
output/chapter-NN/            PDFs, QA report, image report
```

## Writing a chapter

Each chapter is one `content.json` with a `cover` and `sections`, plus an `image-manifest.json`;
image blocks refer to manifest ids. The eight study sections use the ids `story`, `background`, `meaning`, `visual`,
`scripture`, `lessons`, `questions`, `application`; QA fails the build if one is missing.

Each section picks a page template — `narrative`, `history`, `visual`, `bible`, `reflection` or
`guide` — which changes the page's background, banding and framing while keeping the same brand.

Block types: `p`, `heading`, `image`, `svg`, `verse`, `panel`, `timeline`, `people`, `lessons`,
`questions`, `legend`, `parts`, `egwquote`. Text accepts `*italic*` and `**bold**`.

Every panel declares where its content comes from, and the label is printed on the page:

| `kind` | Printed label | Use for |
| --- | --- | --- |
| (`verse` block) | Scripture · KJV | Bible quotations, word for word |
| `history` | History | Historical facts, naming the ancient source where possible |
| `egw` | Ellen White's View | Her interpretation, paraphrased |
| (`egwquote` block) | Ellen White's Words | A short word-for-word quotation from the 1888 text |
| `note` | Study Note | Explanations added by this edition's editors |
| `apply` | For Your Life | Personal application |

## Typography (points)

| Element | Size | Brief |
| --- | --- | --- |
| Chapter title | 36 | 30–36 |
| Section heading | 30 | 25–30 |
| Subheadings | 23–24 | 21–24 |
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
- every image loaded; images below 150 dpi at printed size, or cropped by their frame, are reported
- a final build fails if any illustration is unapproved, missing, or still a placeholder
- pages less than 35% full are reported as warnings

The automated checks do not replace looking at the pages: use `--preview` and read the PDF.

## Print notes

The PDF is A4 portrait, RGB, with fonts embedded and no bleed. That is right for screen reading and
desktop or digital printing. A commercial offset printer will normally ask for 3 mm bleed and CMYK
conversion; that step is not built yet.
