# AI Literacy module videos

Drop a file here and it appears in the module automatically — the page
probes for each path and keeps its "video to follow" note until the file
really loads. No code change, no redeploy.

The module is bilingual: `<name>.mp4` is played in English and
`<name>.ar.mp4` in Arabic. A slot with no `.ar` file falls back to the
English cut rather than going blank.

| Segment | English | Arabic | What it is |
|---|---|---|---|
| 1 | `segment-1-why.mp4` ✅ | `segment-1-why.ar.mp4` ✅ | ~2 min. Why this, why now. |
| 3 | `segment-3-critique.mp4` ✅ | `segment-3-critique.ar.mp4` ✅ | ~90 sec. Modelling the critique move on a real AI output, thinking aloud. |
| 4 | `segment-4-walkthrough.mp4` | `segment-4-walkthrough.ar.mp4` | ~6 min screencast. InstrucTwin: log in → find your grade → your unit → the lesson → the template → student materials → what to do if the tool is down. |

✅ = present. Segment 4 is still unrecorded in both languages; its slot
shows a "to follow" note and the written steps carry the content.

## Two things to know before committing a video here

**This repository is public.** Anything committed here is readable by
anyone on the internet, signed in or not — the Hub's sign-in gate is
client-side and does not protect files. The InstrucTwin screencast is the
one to watch: if the recording shows real class lists, student names or
student work, do not commit it.

**Git keeps every version of a binary forever.** A re-recorded 80 MB
screencast committed three times is 240 MB in the repo permanently, and
GitHub rejects any single file over 100 MB.

For anything large, or anything showing student data, host it outside the
repo instead and put the embed URL on the slot:

```html
<div class="video-slot" data-state="empty" data-slot="segment-4"
     data-embed="https://www.youtube.com/embed/VIDEO_ID">
```

`data-embed` renders an iframe and takes precedence over `data-src`.
An unlisted YouTube video or a Drive preview link both work.
