Real browser output of `web/src/lib/scan/device-resize.ts` (D75), made by
running the module itself — transpiled, not copied — with the browser's own
decoder and canvas, on the photos in `web/scripts/checks/fixtures/scan/`.

Browser: Chromium 156 (Claude desktop browser pane), 15 Nov 2026.
Settings: max_edge_px 3000, jpeg_quality 88.

`test_scan_images.py` holds each one against the backend shrinking the same
original: same stored size, same way up, and the phone's file kept as it came.
Safari on a real iPhone is checked by the person, on the phone (D41).
