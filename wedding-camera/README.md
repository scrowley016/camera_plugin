# Wedding Camera v0.7.1

Version 0.3 adds reversible Canva-style photo frames plus more admin controls while keeping the v0.1/v0.2 upload flow and shortcodes compatible.

## New in v0.3

### Settings & Frames
WordPress Admin → Wedding Camera → Settings & Frames

Controls:
- Open/close guest uploads
- Choose whether Live is checked by default
- Set maximum photo size
- Show/hide captions on the wall
- Show/hide guest names on the wall
- Turn featured-photo moments on/off
- Set Live Wall refresh interval
- Set featured-photo interval
- Turn guest frames on/off
- Add/remove/rename up to 12 frame overlays from the WordPress Media Library

### Canva frame workflow
1. In Canva, create a **custom size design at exactly 1080 × 1080 px (square)**.
2. Leave the center transparent so the photo can show through.
3. Export as **PNG with transparent background**.
4. Upload it under Wedding Camera → Settings & Frames → Add Canva Frame.
5. Give it a guest-friendly name such as Woodland, Polaroid, Just Married, Disco, etc.
6. Save settings.

Every framed photo across the whole plugin (guest review screen, Live Wall, My Photos, admin) is cropped into this same 1080×1080 square before the frame is applied, so a frame built at this exact size will line up correctly everywhere — no more guessing at proportions.

Guests will then see No Frame plus your frame choices on the camera page.

Frames are stored as metadata/overlays. The original guest photo is NOT modified, so an admin can change or remove a frame later.

## Photo admin improvements
The Photos screen now includes filters for:
- All
- Live
- Private
- Favorites

Each photo also has:
- Live toggle
- Favorite toggle
- Guest-name edit
- Caption edit
- Frame selector
- Original-file link
- Delete

## Existing shortcodes still work

Camera:
`[wedding_camera]`

Live wall:
`[wedding_photo_wall]`

Optional Live Wall attributes remain supported:
`[wedding_photo_wall camera_url="https://example.com/camera" qr_image="https://example.com/qr.png" eyebrow="Shannon + Alex" title="The Wedding Through Your Eyes" date="10 · 16 · 26"]`

## Frame design note
Because every framed photo is cropped to fill a square, decorative edge frames work best — keep important artwork within about the outer 8% border and avoid anything that depends on one exact photo crop. A wide landscape or tall portrait photo will have its longer side trimmed slightly to fit the square, same as most social apps.


## v0.4

Adds editable guest camera-page text in Wedding Camera → Settings & Frames, including the heading, intro, upload button, Live Wall checkbox text, submit button, and success messages.

## v0.5

### Live in-browser camera
The `[wedding_camera]` page now has a "📷 Take a Photo" button next to "Choose Photos". It opens a live camera preview (front/back switch on phones, webcam on laptops), lets guests snap multiple shots in a row, remove any before continuing, and adds them straight into the same upload queue as gallery-picked files — same name/caption/frame/Live Wall options apply to all of them. If a guest's browser or device won't allow camera access, the button hides itself automatically and gallery upload still works exactly as before.

### Share & QR
New page: WordPress Admin → Wedding Camera → Share & QR.
- Auto-detects which published page uses `[wedding_camera]` and builds its link, or set a URL by hand.
- Live QR preview, one-click "Copy Link", and "Download QR (PNG)" for print shops, invitations, or your own signage.
- Editable heading/subtext for the on-page share card.
- **NFC tags:** on phones/browsers that support Web NFC (Chrome for Android), a "Write NFC Tag" button writes the camera link straight to a blank tag — just tap it to a tag and hold. Everywhere else, copy the link shown and use any NFC-tag-writing app (e.g. "NFC Tools") instead.

### `[wedding_camera_qr]` shortcode
Drop this on any page or post for a printable/scannable share card guests can see on-screen, or that you print and cut out for tables, favors, or a welcome sign:
```
[wedding_camera_qr]
[wedding_camera_qr heading="Scan Me!" subtext="Send us your favorite moment" copies="6"]
```
`copies` (1–12) repeats the card so you can print a full sheet of matching table cards at once — the shortcode's page includes print-friendly CSS, so File → Print produces clean, cut-ready cards with no browser chrome.
`url`, `eyebrow`, and `size` (QR pixel size) are also available as optional attributes.

QR codes are generated entirely in the guest's/admin's browser (via a bundled, MIT-licensed encoder) — no third-party services or network calls involved.

## v0.5.1

Fixes a bug where the camera/wall/QR pages could render with no styling at all (invisible text, unstyled boxes, non-working-looking controls) on some themes and page builders — the stylesheet was only being enqueued from inside the shortcode itself, which is often too late for WordPress to include it in `<head>`. Styles are now enqueued as early as possible, and the plugin also inlines its CSS directly into each shortcode's output as a fallback, so styling can no longer silently fail to load.

## v0.5.2

Two more reliability fixes:
- The camera page now blocks the browser's default form submit at the earliest possible moment, independent of whether the rest of the upload script manages to load. Previously, if something on a guest's device prevented the upload script from running, submitting the form fell back to a native browser submission that reloaded the page with a useless `?photo=filename.jpg` in the URL and silently lost their selected photos. Now it just won't submit that way, full stop.
- Any JavaScript error on the page (ours or a conflicting theme/plugin script) now shows as a small dismissible red banner at the top of the page, so a broken page can be diagnosed from a screenshot alone — no browser devtools needed.

## v0.5.3

Two root-cause fixes found by inspecting an actual affected page's saved HTML:

- The camera and Live Wall pages rely on WordPress's `wp_localize_script()` to inject their configuration (upload URL, settings, etc.) as a small `<script>var WeddingCamera = {...}</script>` block. On at least one real host that block was silently missing from the page entirely — the plugin's script would load fine, immediately notice its config was undefined, and quietly do nothing at all (no console error, no preview, no working buttons, and a plain browser form submit that reloads the page instead of uploading). That configuration is now also printed directly and reliably as part of the shortcode's own HTML output, independent of `wp_localize_script()`.
- Text could render invisibly (white on white) inside text inputs and some buttons on themes/browsers using dark mode: we set an explicit light background on those controls but never set an explicit text color, so a browser in dark mode could supply its own light default text color for native form controls. The plugin's guest-facing pages now explicitly opt out of native dark-mode form-control styling, and all inputs/buttons set their text color explicitly.

## v0.6.0

### Scrolling-rows Live Wall layout
The Live Wall (`[wedding_photo_wall]`) has a new default layout: photos flow across a few horizontal rows that continuously drift sideways (alternating direction row to row), instead of the previous static Pinterest-style grid. Great for a TV or projector at the reception. Configure it under Wedding Camera → Settings & Frames → Live Wall:
- **Layout** — Scrolling rows (new default) or Classic grid (the old static layout, still available).
- **Number of scrolling rows** — 2 to 5.

Each photo always scrolls in the same row (so photos don't visually jump between rows as new ones arrive), and a row only restarts its motion when a new photo actually lands in it — otherwise the scroll never stutters. Motion respects the "reduce motion" accessibility setting (falls back to a manually-scrollable strip). The Featured Photo spotlight overlay still works the same as before, on top of either layout.

Also fixes a pre-existing bug: saving the main Settings & Frames form could silently erase the Share & QR page's camera URL and share card text, since that form didn't include those fields. Settings are now merged rather than replaced.

## v0.6.1

The Featured Photo moment no longer covers the screen. It's now a permanent, non-blocking banner ("✨ Featured Moment") pinned near the top of the Live Wall, above the scrolling rows/grid, that quietly crossfades to a new photo periodically instead of popping up as a full-screen overlay. The rest of the wall — and the guest scanning a QR code below it — is never covered or dimmed.

## v0.7.0

### Guest camera page is now a step-by-step wizard
Rebuilt `[wedding_camera]` as a small app-like flow instead of one long form:
1. **Name** — one input, then Continue.
2. **Add Photos** — "📷 Take Photos" or the gallery/file picker.
3. **Camera** (if chosen) — a larger, more immersive live camera screen (front/back switch, multi-shot, retake), unchanged capability-wise but now its own full step.
4. **Review** — thumbnails of everything selected/captured, an optional frame picker, and an optional per-photo caption field on each one. Leave captions blank and just tap upload — nothing is required. A "+ Add More Photos" button loops back to step 2 without losing what's already been picked.

### Every upload goes to the Live Wall
Removed the "Add to the Live Photo Wall" checkbox — there's no reason for guests to opt out at upload time. Every guest photo now appears on the wall automatically. An admin can still hide any individual photo afterward from Wedding Camera → Photos, and a guest can still remove their own photo from the wall later via "My Photos" on the camera page.

### Live Wall photos are shuffled, not just newest-first
Both wall layouts (scrolling rows and classic grid) now mix photos into a randomized order instead of strict recency, so it doesn't just read top-to-bottom as "most recent first." Existing photos never jump around mid-view — new arrivals are the only thing that get shuffled in.

### Faster uploads
Uploading many photos (e.g. 12 at once) was slow for two reasons, both fixed:
- Photos now upload **3 at a time in parallel** instead of one at a time.
- Each photo is **resized/compressed in the guest's browser** before it's sent (capped at 2400px on the long edge, ~86% JPEG quality — plenty sharp for the wall and prints, dramatically smaller than a raw phone photo) — a huge win for both upload time and the server's own image-processing time. The server additionally skips generating any image size the plugin doesn't actually use.

### Live Wall motion on mobile
If the scrolling rows still don't appear to move on a specific phone, the most common cause is that phone's **Reduce Motion** accessibility setting (Settings → Accessibility → Motion on iOS) — the plugin deliberately respects it and falls back to a manually-scrollable strip, since that's the right thing to do for anyone who's turned it on for a real reason. Turning it off on that device confirms whether that's the cause. Independently, this release also tightens the default scroll speed and adds a few mobile-Safari-specific CSS properties for reliability.

## v0.7.1

- Removed "(optional)" from the name field — it reads cleaner and the field was already optional.
- The guest's name is now remembered on their device (localStorage) after their first upload, so returning to `[wedding_camera]` later — especially the common case of one phone uploading several batches over the course of the wedding — has it pre-filled instead of asking again.
- **Fixed the frame picker going off-screen on iPhone instead of scrolling in place.** Root cause: `<fieldset>` elements have a browser-default sizing quirk where they refuse to shrink below their content's natural width, so a wide row of frame options pushed the whole page wider than the screen instead of scrolling contained within its own box.
- **Frames can now be assigned per photo, by drag-and-drop (or tap-then-tap on a small screen).** The review step shows a row of frame chips above the photo grid — drag one onto any photo, or tap a frame then tap a photo to apply it. Each photo can have its own frame or none at all.
- **Fixed frames rendering inconsistently across the site** — the actual root cause of "frames seem a little off." Several places had a generic image-sizing CSS rule that unintentionally also applied to the frame overlay itself, silently cropping or shrinking the frame art differently in different contexts (My Photos, the Live Wall, the admin Photos screen) even though it looked correct in the guest's own review screen. Every framed photo is now consistently cropped into the same square before the frame is applied, everywhere the plugin shows one.
- **Exact Canva frame size: 1080 × 1080 px, square, transparent PNG.** Every framed photo across the whole plugin is now cropped into this exact square before the frame is applied, so a frame built at this size will line up correctly everywhere (guest review screen, Live Wall, My Photos, admin). Keep important artwork within about the outer 8% border, since the longer side of non-square photos gets trimmed slightly to fit — same as most social apps.
