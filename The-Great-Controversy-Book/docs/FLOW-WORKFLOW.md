# Google Flow illustration workflow

Google Flow is the image platform for this book. This file records how it can be connected, what
was and was not verified, and the step-by-step workflow.

## Connection status

**Not connected.** The pipeline was built in a cloud session that has no browser signed in to a
Google account, so nothing has been submitted to Flow and no image has been generated. Everything
on the project side (manifest, prompts, approval gates, validation, PDF insertion, reports) was
tested with synthetic test cards in a throw-away copy; none of those files are in this repository.

## Ways to connect (researched November 2026)

| Option | Finding | Verdict |
| --- | --- | --- |
| Official Flow API | None found. Flow is a Google Labs web application. | Not available |
| Claude driving your own signed-in browser (Claude in Chrome, or the Claude desktop app's browser) | Uses your existing Google session on your computer. No extra software, no credentials leave the browser. Claude reads the prompt from `images.mjs`, asks you before each submission, and files the downloads. | **Recommended** |
| You operate Flow by hand | Always works. `images.mjs prompt` prints what to paste and which references to attach; you download the results and `ingest` them. | Works today |
| Unofficial Flow MCP servers (several exist on GitHub) | All are third-party browser automation of a logged-in Chrome profile; none are endorsed by Google. At least one deliberately hides that the browser is automated. Their source code has **not** been reviewed and none is installed. | Only after you approve one and its code is reviewed |
| Third-party "Flow API" resellers | Unofficial wrappers that need access to your Google session. | Not recommended |
| A custom Playwright script against Flow | Possible on your own computer with a browser profile kept outside the project, but it must be written against the live page and breaks when Google changes it. Not written, because the page could not be seen from here. | Possible later |
| Google's official Gemini API | The image models Flow uses are offered to developers through this API, with reference-image support. It is not Flow and is billed separately. | Fallback if Flow automation proves unreliable |

Scripted control of Flow may be restricted by Google's terms of service, and the page layout can
change without notice. Check the terms for your account before relying on unattended automation.

## Rules that always apply

1. **No credits without a yes.** Nothing is submitted until you confirm that specific picture.
   `images.mjs submit` refuses without `--confirmed`, and whoever drives the browser (Claude or you)
   submits only after that go-ahead is recorded.
2. **One picture at a time, in book order.** The next picture is locked until the current one is
   approved, unless you choose `--batch`.
3. **Character references first.** A scene with Jesus cannot be submitted until both Jesus
   references are approved; they are attached to every such scene.
4. **Only approved pictures reach the book.** Candidates stay in a local folder that git ignores.
5. **No secrets in the project.** No password, cookie or token is stored here. Any browser profile
   stays outside this folder; `.gitignore` also blocks the usual profile and download folders.

## The loop for one picture

```bash
node scripts/images.mjs next 1                      # shows the picture, its prompt and references
node scripts/images.mjs submit 1 ch01-cover --confirmed   # your go-ahead to spend credits
#   …generate in Flow: paste the prompt, attach the listed references, 16:9, 2+ variations, download…
node scripts/images.mjs ingest 1 ch01-cover ~/Downloads/a.png ~/Downloads/b.png
node scripts/images.mjs review 1 ch01-cover         # side-by-side sheet in output/chapter-01/review/
node scripts/images.mjs approve 1 ch01-cover 2      # copies it into assets/images/chapter-01/ and rebuilds the PDF
```

Other decisions:

```bash
node scripts/images.mjs reject 1 ch01-cover all --reason "Temple looks medieval"
node scripts/images.mjs note 1 ch01-cover "Make the Temple taller and whiter."   # add to the prompt
node scripts/images.mjs edit 1 ch01-cover lighting "overcast-drama"              # change a prompt field
node scripts/images.mjs regenerate 1 ch01-cover     # new round; needs a new submit --confirmed
node scripts/images.mjs pause 1    /    resume 1
node scripts/images.mjs approve-batch 1 --variation 1
node scripts/images.mjs status 1                    # report: required, generated, approved, pending, rejected, missing, failed
```

Use `characters` instead of a chapter number for the character references.

## Order of work for Chapter 1

1. `char-jesus-portrait`, then `char-jesus-full-figure` (target `characters`)
2. `ch01-cover` — Jesus weeping over Jerusalem
3. `ch01-temple`, `ch01-stones`, `ch01-pella`, `ch01-siege`, `ch01-fire`, `ch01-arch`, `ch01-bible`

## When Claude drives the browser

In a Claude session that can control your signed-in browser, ask it to "run the Flow workflow for
chapter 1". For each picture it should: run `next`, show you the prompt, wait for your yes, run
`submit --confirmed`, generate in Flow with the listed references, download every variation, run
`ingest` and `review`, show you the review sheet, and wait for your decision. It must stop on any
sign-in prompt, quota warning or unexpected page and ask you.

Details of Flow's own controls (where references are attached, which aspect ratios and download
sizes exist) are not written here because they could not be checked from this session.
