# AISA logo files

Supplied by Brandon on 26 September 2026. `originals/` holds them exactly as
received; everything else is generated from `originals/aisa-seal-white.webp`
(2000 px, white seal on transparent), trimmed to the seal, squared with a 2 %
margin, and re-tinted. Navy is `#29216C`, taken from the official round mark.

| file | use it on |
|---|---|
| `../../AISA_logo.png` | **light** backgrounds — navy seal, transparent, 256 px. The Hub's everyday logo: top bar, menu drawer, certificates, performance-review forms, PD cards. |
| `aisa-seal-white.png` | **dark** backgrounds — white seal, transparent, 256 px. Every dark page footer. |
| `aisa-seal-navy-1024.png`, `aisa-seal-white-1024.png` | print, PDFs, slides — same seals at 1024 px. |
| `originals/aisa-seal-white.webp` | source of the above (2000 px). |
| `originals/aisa-seal-on-navy.jpg` | white seal on a navy rectangle (2000 × 1414), for banners. |
| `originals/aisa-mark-round.png` | the round "AISA" mark without the ring text (256 px). |

The white seal's "AISA" letters are knocked out, so the background shows
through them — on a dark footer that is intended.

**Don't put `AISA_logo` in the name of a white logo.** `certificate.js` finds
its logo with `img[src*="AISA_logo"]`, and a white seal would print invisibly
on the cream certificate.
