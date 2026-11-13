---
"@region-snap/core": patch
"@region-snap/vue": patch
"@region-snap/react": patch
---

Scroll capture: fix stitching getting stuck when the overlapping part of two frames has little content (gaps between pages, short centered headings), and fall back to the previous scroll step when several offsets match equally well (repeated content).
