# Wedding Camera v0.6.1

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
1. Create a frame in Canva.
2. Leave the center/background transparent so the photo can show through.
3. Export as PNG with transparency.
4. Upload it under Wedding Camera → Settings & Frames → Add Canva Frame.
5. Give it a guest-friendly name such as Woodland, Polaroid, Just Married, Disco, etc.
6. Save settings.

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
Because guests may upload portrait, landscape, and square photos, decorative edge frames work best. Avoid designs that depend on one exact crop or place critical text very close to the center.


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
