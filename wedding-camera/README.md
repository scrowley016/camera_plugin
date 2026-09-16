# Wedding Camera v0.4

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
