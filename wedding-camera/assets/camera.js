(() => {
  const mySection = document.getElementById("wcam-my-photos");
  const myGrid = document.getElementById("wcam-my-photo-grid");
  const storageKey = "weddingCameraUploadsV1";
  const nameStorageKey = "weddingCameraGuestNameV1";
  if (typeof WeddingCamera === "undefined") return;

  const getMine = () => { try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; } };
  const saveMine = items => localStorage.setItem(storageKey, JSON.stringify(items));
  const getSavedName = () => { try { return localStorage.getItem(nameStorageKey) || ""; } catch { return ""; } };
  const saveName = value => { try { localStorage.setItem(nameStorageKey, value); } catch {} };

  function framedMedia(imageUrl, frameUrl, alt = "") {
    const wrap = document.createElement("div");
    wrap.className = "wcam-photo-media";
    const img = document.createElement("img");
    img.className = "wcam-photo-image";
    img.src = imageUrl;
    img.alt = alt;
    wrap.appendChild(img);
    if (frameUrl) {
      const frame = document.createElement("img");
      frame.className = "wcam-photo-frame";
      frame.src = frameUrl;
      frame.alt = "";
      wrap.appendChild(frame);
    }
    return wrap;
  }

  async function toggleMine(id, token, live, button) {
    button.disabled = true;
    try {
      const body = new FormData(); body.append("token", token); body.append("live", live ? "1" : "0");
      const response = await fetch(`${WeddingCamera.toggleBaseUrl}${id}/live`, { method: "POST", body });
      if (!response.ok) throw new Error("Could not update photo.");
      const data = await response.json();
      saveMine(getMine().map(item => Number(item.id) === Number(id) ? { ...item, live: data.live } : item));
      renderMine();
    } catch (err) { alert(err.message || "Could not update that photo."); }
    finally { button.disabled = false; }
  }

  function renderMine() {
    if (!mySection || !myGrid) return;
    const mine = getMine(); myGrid.innerHTML = ""; mySection.hidden = mine.length === 0;
    mine.forEach(item => {
      const card = document.createElement("article"); card.className = "wcam-my-card";
      card.appendChild(framedMedia(item.thumbnail, item.frame_url, "Your uploaded wedding photo"));
      const button = document.createElement("button"); button.type = "button"; button.className = "wcam-mini-button";
      button.textContent = item.live ? "✓ On Live Wall — Remove" : "Add to Live Wall";
      button.addEventListener("click", () => toggleMine(item.id, item.token, !item.live, button));
      card.appendChild(button); myGrid.appendChild(card);
    });
    const toggleLabel = document.getElementById("wcam-my-photos-toggle-label");
    const panel = document.getElementById("wcam-my-photos-panel");
    if (toggleLabel && panel) {
      toggleLabel.textContent = panel.hidden ? `📷 Show My Pictures (${mine.length})` : `📷 Hide My Pictures (${mine.length})`;
    }
  }

  renderMine();

  // ---- "How does this work?" help modal (works even if uploads are closed) ----
  const helpBtn = document.getElementById("wcam-help-btn");
  const helpModal = document.getElementById("wcam-help-modal");
  const helpClose = document.getElementById("wcam-help-close");
  const helpBackdrop = document.getElementById("wcam-help-backdrop");
  if (helpBtn && helpModal) {
    const openHelp = () => { helpModal.hidden = false; };
    const closeHelp = () => { helpModal.hidden = true; };
    helpBtn.addEventListener("click", openHelp);
    helpClose?.addEventListener("click", closeHelp);
    helpBackdrop?.addEventListener("click", closeHelp);
  }

  // ---- "My Photos" collapsed by default — expand on tap ----
  const myPhotosToggle = document.getElementById("wcam-my-photos-toggle");
  const myPhotosPanel = document.getElementById("wcam-my-photos-panel");
  if (myPhotosToggle && myPhotosPanel) {
    myPhotosToggle.addEventListener("click", () => {
      const expanded = myPhotosPanel.hidden;
      myPhotosPanel.hidden = !expanded;
      myPhotosToggle.setAttribute("aria-expanded", String(expanded));
      renderMine(); // refreshes the "Show/Hide My Pictures (N)" label to match
    });
  }

  const wizard = document.getElementById("wcam-wizard");
  if (!wizard) return;

  // ---- Step navigation ----
  const steps = wizard.querySelectorAll(".wcam-step");
  function goToStep(name) {
    steps.forEach(step => { step.hidden = step.dataset.step !== name; });
  }
  wizard.querySelectorAll("[data-goto]").forEach(button => {
    button.addEventListener("click", () => goToStep(button.dataset.goto));
  });

  const nameInput = document.getElementById("wcam-name");
  if (nameInput) {
    nameInput.value = getSavedName();
    // Explicit first step either way (both start hidden server-side) so
    // there's never a flash of the name field for a returning guest.
    goToStep(nameInput.value ? "method" : "name");
    nameInput.addEventListener("input", () => saveName(nameInput.value));
    nameInput.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); goToStep("method"); }
    });
  } else {
    goToStep("name");
  }

  const filesInput = document.getElementById("wcam-files");
  const reviewGrid = document.getElementById("wcam-review-grid");
  const status = document.getElementById("wcam-status");
  const finalSubmit = document.getElementById("wcam-final-submit");
  const addMoreBtn = document.getElementById("wcam-add-more");

  let items = []; // { blob, name, previewUrl, caption, frameId, frameUrl }

  const frameLabelById = new Map((WeddingCamera.frames || []).map(f => [Number(f.id), f.label]));
  function frameLabel(frameId) { return frameId ? (frameLabelById.get(Number(frameId)) || "Frame") : "No Frame"; }

  function addItems(newItems) {
    items = items.concat(newItems.map(item => ({ frameId: 0, frameUrl: "", ...item })));
  }

  function renderReview() {
    if (!reviewGrid) return;
    reviewGrid.innerHTML = "";
    items.forEach((item, index) => {
      const card = document.createElement("div"); card.className = "wcam-review-card";
      card.dataset.index = String(index);
      card.appendChild(framedMedia(item.previewUrl, item.frameUrl, "Selected photo preview"));
      const badge = document.createElement("span");
      badge.className = "wcam-review-frame-badge";
      badge.textContent = frameLabel(item.frameId);
      card.appendChild(badge);
      const caption = document.createElement("input");
      caption.type = "text"; caption.maxLength = 240; caption.placeholder = "Add a caption (optional)";
      caption.className = "wcam-review-caption";
      caption.value = item.caption;
      caption.addEventListener("input", () => { item.caption = caption.value; });
      card.appendChild(caption);
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "wcam-review-remove"; remove.setAttribute("aria-label", "Remove this photo"); remove.textContent = "×";
      remove.addEventListener("click", event => {
        event.stopPropagation();
        URL.revokeObjectURL(item.previewUrl);
        items.splice(index, 1);
        renderReview();
      });
      card.appendChild(remove);
      // Tap-to-assign fallback: if a frame chip is "active" (tapped, not
      // dragged), tapping a photo applies it — friendlier than dragging on
      // a small screen.
      card.addEventListener("click", () => {
        if (!activeChipFrame) return;
        item.frameId = activeChipFrame.id;
        item.frameUrl = activeChipFrame.url;
        renderReview();
      });
      reviewGrid.appendChild(card);
    });
  }

  // ---- Frame palette: drag a chip onto a photo, or tap-then-tap ----
  const framePalette = document.getElementById("wcam-frame-picker");
  let activeChipFrame = null; // { id, url } selected via tap, for the tap-to-assign fallback

  function setActiveChip(chip) {
    framePalette?.querySelectorAll(".wcam-frame-chip").forEach(c => c.classList.remove("is-active"));
    if (chip) chip.classList.add("is-active");
  }

  function cardAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".wcam-review-card") : null;
  }

  function assignFrameToCard(card, frameId, frameUrl) {
    const index = Number(card.dataset.index);
    if (Number.isNaN(index) || !items[index]) return;
    items[index].frameId = frameId;
    items[index].frameUrl = frameUrl;
    renderReview();
  }

  framePalette?.querySelectorAll(".wcam-frame-chip").forEach(chip => {
    const frameId = Number(chip.dataset.frameId || 0);
    const frameUrl = chip.dataset.frameUrl || "";

    chip.addEventListener("click", () => {
      if (activeChipFrame && activeChipFrame.id === frameId) { activeChipFrame = null; setActiveChip(null); return; }
      activeChipFrame = { id: frameId, url: frameUrl };
      setActiveChip(chip);
    });

    chip.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const startX = event.clientX, startY = event.clientY;
      let dragging = false;
      let ghost = null;

      function moveGhost(x, y) {
        if (ghost) { ghost.style.left = `${x}px`; ghost.style.top = `${y}px`; }
      }

      function onMove(moveEvent) {
        if (!dragging) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 8) return;
          dragging = true;
          ghost = chip.cloneNode(true);
          ghost.classList.add("wcam-frame-drag-ghost");
          document.body.appendChild(ghost);
        }
        moveGhost(moveEvent.clientX, moveEvent.clientY);
        reviewGrid?.querySelectorAll(".wcam-review-card").forEach(c => c.classList.remove("is-drop-target"));
        const target = cardAtPoint(moveEvent.clientX, moveEvent.clientY);
        if (target) target.classList.add("is-drop-target");
      }

      function onUp(upEvent) {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        if (ghost) ghost.remove();
        reviewGrid?.querySelectorAll(".wcam-review-card").forEach(c => c.classList.remove("is-drop-target"));
        if (dragging) {
          const target = cardAtPoint(upEvent.clientX, upEvent.clientY);
          if (target) assignFrameToCard(target, frameId, frameUrl);
        }
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  });

  filesInput?.addEventListener("change", () => {
    const files = Array.from(filesInput.files || []);
    if (!files.length) return;
    addItems(files.map(file => ({ blob: file, name: file.name, previewUrl: URL.createObjectURL(file), caption: "" })));
    filesInput.value = "";
    renderReview();
    goToStep("review");
  });

  // ---- Live in-browser camera capture ----
  const openCameraBtn = document.getElementById("wcam-open-camera");
  const cameraVideo = document.getElementById("wcam-camera-video");
  const cameraCanvas = document.getElementById("wcam-camera-canvas");
  const cameraError = document.getElementById("wcam-camera-error");
  const cameraSwitchBtn = document.getElementById("wcam-camera-switch");
  const cameraShutterBtn = document.getElementById("wcam-camera-shutter");
  const cameraCloseBtn = document.getElementById("wcam-camera-close");
  const cameraShotsEl = document.getElementById("wcam-camera-shots");
  const cameraDoneBtn = document.getElementById("wcam-camera-done");
  const cameraSaveBtn = document.getElementById("wcam-camera-save");
  const cameraFrameGuide = document.getElementById("wcam-camera-frame-guide");
  const cameraFramePreview = document.getElementById("wcam-camera-frame-preview");
  const cameraFrameChipsEl = document.getElementById("wcam-camera-frame-chips");

  let cameraStream = null;
  let facingMode = "environment";
  let cameraShots = []; // { blob, url, frameId, frameUrl }
  let activeCameraFrame = { id: 0, url: "" }; // live-preview frame, Snapchat-style

  const cameraSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  if (openCameraBtn && cameraVideo && cameraSupported()) {
    openCameraBtn.hidden = false;
    openCameraBtn.addEventListener("click", openCamera);

    async function startStream() {
      stopStream();
      if (cameraError) cameraError.hidden = true;
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: false });
        cameraVideo.srcObject = cameraStream;
        if (cameraSwitchBtn) cameraSwitchBtn.hidden = false;
      } catch (err) {
        if (cameraError) { cameraError.textContent = "Could not access your camera. You can still choose photos from your gallery instead."; cameraError.hidden = false; }
      }
    }

    function stopStream() {
      if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
    }

    function setActiveCameraFrame(id, url) {
      activeCameraFrame = { id, url };
      cameraFrameChipsEl?.querySelectorAll(".wcam-frame-chip").forEach(chip => {
        chip.classList.toggle("is-active", Number(chip.dataset.frameId || 0) === id);
      });
      if (cameraFrameGuide) cameraFrameGuide.hidden = id === 0;
      if (cameraFramePreview) cameraFramePreview.src = url || "";
    }

    cameraFrameChipsEl?.querySelectorAll(".wcam-frame-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        setActiveCameraFrame(Number(chip.dataset.frameId || 0), chip.dataset.frameUrl || "");
      });
    });

    function openCamera() {
      goToStep("camera");
      document.body.style.overflow = "hidden";
      setActiveCameraFrame(0, ""); // start fresh each time the camera opens
      renderShots();
      startStream();
    }
    function closeCamera() {
      stopStream();
      document.body.style.overflow = "";
      goToStep("method");
    }

    cameraCloseBtn?.addEventListener("click", closeCamera);
    cameraSwitchBtn?.addEventListener("click", () => { facingMode = facingMode === "environment" ? "user" : "environment"; startStream(); });
    window.addEventListener("pagehide", stopStream);

    cameraShutterBtn?.addEventListener("click", () => {
      if (!cameraVideo.videoWidth) return;
      const vw = cameraVideo.videoWidth, vh = cameraVideo.videoHeight;
      const framed = activeCameraFrame.id !== 0;
      // Framed shots are captured pre-cropped to the same square the guide
      // showed live, so what the guest saw is exactly what they get.
      const size = Math.min(vw, vh);
      const sw = framed ? size : vw, sh = framed ? size : vh;
      const sx = framed ? (vw - size) / 2 : 0, sy = framed ? (vh - size) / 2 : 0;
      cameraCanvas.width = sw;
      cameraCanvas.height = sh;
      cameraCanvas.getContext("2d").drawImage(cameraVideo, sx, sy, sw, sh, 0, 0, sw, sh);
      const shotFrame = activeCameraFrame;
      cameraCanvas.toBlob(blob => {
        if (!blob) return;
        cameraShots.push({ blob, url: URL.createObjectURL(blob), frameId: shotFrame.id, frameUrl: shotFrame.url });
        renderShots();
      }, "image/jpeg", 0.92);
    });

    function renderShots() {
      cameraShotsEl.innerHTML = "";
      cameraShots.forEach((shot, index) => {
        const item = document.createElement("div"); item.className = "wcam-camera-shot";
        item.appendChild(framedMedia(shot.url, shot.frameUrl, `Captured photo ${index + 1}`));
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "wcam-camera-shot-remove"; remove.setAttribute("aria-label", "Remove this photo"); remove.textContent = "×";
        remove.addEventListener("click", () => { URL.revokeObjectURL(shot.url); cameraShots.splice(index, 1); renderShots(); });
        item.appendChild(remove);
        cameraShotsEl.appendChild(item);
      });
      cameraDoneBtn.hidden = cameraShots.length === 0;
      if (cameraSaveBtn) cameraSaveBtn.hidden = cameraShots.length === 0;
    }

    // Saves the just-taken photos to the guest's own device (Photos/camera
    // roll on a phone, via the native share sheet) BEFORE upload, so a
    // network or site hiccup during upload can never lose the actual shots.
    async function saveShotsToPhotos() {
      if (!cameraShots.length) return;
      const files = cameraShots.map((shot, index) => new File([shot.blob], `wedding-photo-${Date.now()}-${index}.jpg`, { type: "image/jpeg" }));
      try {
        if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
          await navigator.share({ files });
        } else {
          files.forEach(file => {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(file);
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 4000);
          });
        }
      } catch (err) {
        if (err && err.name !== "AbortError") {
          alert("Could not save the photos to your device. Your photos are still fine here — you can try again, or just continue.");
        }
      }
    }

    cameraSaveBtn?.addEventListener("click", saveShotsToPhotos);

    cameraDoneBtn?.addEventListener("click", () => {
      if (!cameraShots.length) return;
      addItems(cameraShots.map((shot, index) => ({
        blob: shot.blob,
        name: `camera-${Date.now()}-${index}.jpg`,
        previewUrl: shot.url,
        caption: "",
        frameId: shot.frameId,
        frameUrl: shot.frameUrl,
      })));
      cameraShots = [];
      renderShots();
      stopStream();
      document.body.style.overflow = "";
      renderReview();
      goToStep("review");
    });
  }

  // ---- Faster uploads: shrink each photo client-side before sending it ----
  function resizeForUpload(blob, maxDim = 2400, quality = 0.86) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        if (scale >= 1) { URL.revokeObjectURL(url); resolve(blob); return; }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resized => { URL.revokeObjectURL(url); resolve(resized || blob); }, "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
      img.src = url;
    });
  }

  async function uploadAll(uploadItems) {
    const name = nameInput ? nameInput.value : "";
    const total = uploadItems.length;
    const results = new Array(total);
    let completed = 0;
    status.textContent = `Uploading 0 of ${total}…`;

    async function uploadOne(item, index) {
      const resized = await resizeForUpload(item.blob);
      const body = new FormData();
      body.append("photo", resized, item.name || `photo-${index}.jpg`);
      body.append("guest_name", name);
      body.append("caption", item.caption || "");
      body.append("frame_id", String(item.frameId || 0));
      const response = await fetch(WeddingCamera.uploadUrl, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "One of the photos could not be uploaded.");
      completed++;
      status.textContent = `Uploading ${completed} of ${total}…`;
      results[index] = { id: data.id, token: data.token, live: data.live, thumbnail: data.thumbnail, frame_id: data.frame_id, frame_url: data.frame_url };
    }

    const queue = uploadItems.map((item, index) => ({ item, index }));
    const concurrency = Math.min(3, total);
    async function worker() {
      let next;
      while ((next = queue.shift())) {
        await uploadOne(next.item, next.index);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return results.filter(Boolean);
  }

  finalSubmit?.addEventListener("click", async () => {
    if (!items.length) return;
    finalSubmit.disabled = true;
    if (addMoreBtn) addMoreBtn.disabled = true;
    const batch = items;
    try {
      const uploaded = await uploadAll(batch);
      saveMine([...uploaded, ...getMine()].slice(0, 250));
      status.textContent = batch.length === 1
        ? (WeddingCamera.successSingle || "✨ We got it! Your photo is in the wedding album.")
        : (WeddingCamera.successMulti || "✨ We got them! {count} photos are in the wedding album.").replace("{count}", String(batch.length));
      batch.forEach(item => URL.revokeObjectURL(item.previewUrl));
      items = [];
      renderReview();
      renderMine();
      goToStep("method"); // ready to add another batch right away
    } catch (err) {
      status.textContent = err.message || "Something went wrong. Please try again.";
    } finally {
      finalSubmit.disabled = false;
      if (addMoreBtn) addMoreBtn.disabled = false;
    }
  });

  addMoreBtn?.addEventListener("click", () => goToStep("method"));
})();
