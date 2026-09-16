(() => {
  const grid = document.getElementById("wcam-wall-grid");
  const rowsContainer = document.getElementById("wcam-wall-rows");
  const empty = document.getElementById("wcam-wall-empty");
  const count = document.getElementById("wcam-photo-count");
  const spotlight = document.getElementById("wcam-spotlight");
  const spotlightImg = document.getElementById("wcam-spotlight-image");
  const spotlightFrame = document.getElementById("wcam-spotlight-frame");
  const spotlightCaption = document.getElementById("wcam-spotlight-caption");
  if ((!grid && !rowsContainer) || typeof WeddingWall === "undefined") return;

  const known = new Set(); let currentPhotos = []; let lastFeatured = null;
  const rowKeys = []; // last-rendered "id,id,id" string per row, to skip untouched rows

  function textFor(photo) {
    const pieces = [];
    if (WeddingWall.showCaptions && photo.caption) pieces.push(photo.caption);
    if (WeddingWall.showGuestNames && photo.guest_name) pieces.push(`— ${photo.guest_name}`);
    return pieces.join(" ");
  }

  function media(photo) {
    const wrap = document.createElement("div"); wrap.className = "wcam-photo-media";
    const img = document.createElement("img"); img.src = photo.thumbnail || photo.url; img.alt = ""; img.loading = "eager"; img.className = "wcam-photo-image"; wrap.appendChild(img);
    if (photo.frame_url) { const frame = document.createElement("img"); frame.src = photo.frame_url; frame.alt = ""; frame.className = "wcam-photo-frame"; wrap.appendChild(frame); }
    return wrap;
  }

  function makeCard(photo) {
    const card = document.createElement("figure"); card.className = "wcam-wall-card"; card.dataset.id = photo.id; card.appendChild(media(photo));
    const text = textFor(photo); if (text) { const caption = document.createElement("figcaption"); caption.textContent = text; card.appendChild(caption); }
    return card;
  }

  function makeRowCard(photo) {
    const card = document.createElement("figure"); card.className = "wcam-wall-row-card"; card.appendChild(media(photo));
    const text = textFor(photo); if (text) { const caption = document.createElement("figcaption"); caption.textContent = text; card.appendChild(caption); }
    return card;
  }

  // Stable per-photo row assignment (based on the photo's own id, not its
  // position in the list) so a photo always lands in the same scrolling row
  // and doesn't jump between rows as new photos arrive ahead of it.
  function bucketByRow(photos, rowCount) {
    const buckets = Array.from({ length: rowCount }, () => []);
    photos.forEach(photo => buckets[Number(photo.id) % rowCount].push(photo));
    return buckets;
  }

  function renderRows(photos) {
    const rowCount = Math.max(2, Math.min(5, Number(WeddingWall.rows) || 3));
    const buckets = bucketByRow(photos, rowCount);
    buckets.forEach((rowPhotos, index) => {
      const key = rowPhotos.map(p => p.id).join(",");
      if (rowKeys[index] === key) return; // nothing changed for this row, leave its animation running
      rowKeys[index] = key;

      let rowEl = rowsContainer.querySelector(`.wcam-wall-row[data-row="${index}"]`);
      if (!rowEl) {
        rowEl = document.createElement("div");
        rowEl.className = "wcam-wall-row";
        rowEl.dataset.row = String(index);
        const track = document.createElement("div");
        track.className = "wcam-wall-track";
        rowEl.appendChild(track);
        rowsContainer.appendChild(rowEl);
      }

      rowEl.hidden = rowPhotos.length === 0;
      if (!rowPhotos.length) return;

      const track = rowEl.querySelector(".wcam-wall-track");
      track.innerHTML = "";
      // Duplicate the row's content once so a 0%->-50% translateX loops seamlessly.
      rowPhotos.forEach(photo => track.appendChild(makeRowCard(photo)));
      rowPhotos.forEach(photo => track.appendChild(makeRowCard(photo)));
      track.style.animationDuration = `${Math.max(18, rowPhotos.length * 5)}s`;
    });
  }

  function showFeature() {
    if (!WeddingWall.featureEnabled || !spotlight || currentPhotos.length === 0) return;
    let choices = currentPhotos.filter(p => String(p.id) !== String(lastFeatured)); if (!choices.length) choices = currentPhotos;
    const photo = choices[Math.floor(Math.random() * choices.length)]; if (!photo) return; lastFeatured = photo.id;

    const applyPhoto = () => {
      spotlightImg.src = photo.url || photo.thumbnail;
      if (photo.frame_url) { spotlightFrame.src = photo.frame_url; spotlightFrame.hidden = false; } else { spotlightFrame.removeAttribute("src"); spotlightFrame.hidden = true; }
      spotlightCaption.textContent = textFor(photo);
    };

    if (spotlight.hidden) {
      // First photo: show immediately, no fade-out-then-in needed.
      spotlight.hidden = false;
      applyPhoto();
      return;
    }

    // Already showing something: crossfade to the new photo instead of a
    // blocking modal — the rest of the page is never covered or dimmed.
    spotlight.classList.add("is-fading");
    setTimeout(() => { applyPhoto(); spotlight.classList.remove("is-fading"); }, 400);
  }

  async function refresh() {
    try {
      const response = await fetch(`${WeddingWall.liveUrl}?_=${Date.now()}`, { cache: "no-store" }); if (!response.ok) return;
      const data = await response.json(); const photos = Array.isArray(data.photos) ? data.photos : []; currentPhotos = photos; if (count) count.textContent = String(photos.length);
      if (spotlight && spotlight.hidden && photos.length) showFeature();
      if (rowsContainer) {
        renderRows(photos);
      } else if (grid) {
        const liveIds = new Set(photos.map(p => String(p.id)));
        grid.querySelectorAll("[data-id]").forEach(el => { if (!liveIds.has(String(el.dataset.id))) { known.delete(String(el.dataset.id)); el.classList.add("is-leaving"); setTimeout(() => el.remove(), 350); } });
        photos.slice().reverse().forEach(photo => { const id = String(photo.id); if (!known.has(id)) { known.add(id); grid.prepend(makeCard(photo)); } });
      }
      empty.hidden = photos.length > 0;
    } catch (_) {}
  }

  refresh(); setInterval(refresh, Number(WeddingWall.refreshEveryMs || 7000));
  if (WeddingWall.featureEnabled) setInterval(showFeature, Number(WeddingWall.featureEveryMs || 25000));
})();
