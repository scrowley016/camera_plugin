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
  const galleryGrid = document.getElementById("wcam-gallery-grid");
  const status = document.getElementById("wcam-status");

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

  // ---- Everything uploads itself the instant it's taken or picked — no
  // review/submit step. A small persistent queue (3 at a time) runs in the
  // background regardless of which step is on screen; each photo's card
  // shows its own status (uploading / done / failed-tap-to-retry). ----
  let toastTimer = null;
  function showToast(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { status.hidden = true; }, 4000);
  }

  const uploadQueue = [];
  let activeUploads = 0;
  const MAX_CONCURRENT_UPLOADS = 3;

  function enqueueUpload(task) {
    task.status = "pending";
    task.onStatus?.(task);
    uploadQueue.push(task);
    pumpQueue();
  }

  function pumpQueue() {
    while (activeUploads < MAX_CONCURRENT_UPLOADS && uploadQueue.length) {
      const task = uploadQueue.shift();
      activeUploads++;
      runUpload(task).finally(() => { activeUploads--; pumpQueue(); });
    }
  }

  async function runUpload(task) {
    task.status = "uploading";
    task.onStatus?.(task);
    try {
      const resized = await resizeForUpload(task.blob);
      const body = new FormData();
      body.append("photo", resized, task.name);
      body.append("guest_name", nameInput ? nameInput.value : "");
      body.append("caption", "");
      body.append("frame_id", String(task.frameId || 0));
      const response = await fetch(WeddingCamera.uploadUrl, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Upload failed.");
      task.status = "done";
      saveMine([{ id: data.id, token: data.token, live: data.live, thumbnail: data.thumbnail, frame_id: data.frame_id, frame_url: data.frame_url }, ...getMine()].slice(0, 250));
      renderMine();
      showToast(WeddingCamera.successSingle || "✨ We got it! Your photo is in the wedding album.");
    } catch (err) {
      task.status = "error";
      task.errorMessage = err.message || "Could not upload.";
      showToast("⚠️ A photo couldn't upload — tap it to try again.");
    }
    task.onStatus?.(task);
  }

  function attachStatusBadge(card, task) {
    const badge = document.createElement("span");
    badge.className = "wcam-upload-status";
    card.appendChild(badge);
    task.onStatus = t => {
      badge.className = "wcam-upload-status wcam-upload-status-" + t.status;
      badge.textContent = t.status === "uploading" || t.status === "pending" ? "⏳" : t.status === "done" ? "✅" : t.status === "error" ? "⚠️" : "";
      badge.title = t.status === "error" ? "Tap to try again" : "";
    };
    task.onStatus(task);
    card.addEventListener("click", () => { if (task.status === "error") enqueueUpload(task); });
  }

  let taskCounter = 0;

  filesInput?.addEventListener("change", () => {
    const files = Array.from(filesInput.files || []);
    if (!files.length) return;
    filesInput.value = "";
    files.forEach(file => {
      const task = { id: ++taskCounter, blob: file, name: file.name, previewUrl: URL.createObjectURL(file), frameId: 0, frameUrl: "" };
      if (galleryGrid) {
        const card = document.createElement("div"); card.className = "wcam-review-card";
        card.appendChild(framedMedia(task.previewUrl, task.frameUrl, "Selected photo"));
        attachStatusBadge(card, task);
        galleryGrid.appendChild(card);
      }
      enqueueUpload(task);
    });
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
      cameraShots = [];
      cameraShotsEl.innerHTML = "";
      cameraDoneBtn.hidden = true;
      if (cameraSaveBtn) cameraSaveBtn.hidden = true;
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
        const shot = { blob, url: URL.createObjectURL(blob) };
        cameraShots.push(shot);
        const task = { id: ++taskCounter, blob, name: `camera-${Date.now()}.jpg`, previewUrl: shot.url, frameId: shotFrame.id, frameUrl: shotFrame.url };
        renderShotCard(task);
        enqueueUpload(task);
      }, "image/jpeg", 0.92);
    });

    function renderShotCard(task) {
      const item = document.createElement("div"); item.className = "wcam-camera-shot";
      item.appendChild(framedMedia(task.previewUrl, task.frameUrl, "Captured photo"));
      attachStatusBadge(item, task);
      cameraShotsEl.appendChild(item);
      cameraDoneBtn.hidden = false;
      if (cameraSaveBtn) cameraSaveBtn.hidden = false;
    }

    // Saves the just-taken photos to the guest's own device (Photos/camera
    // roll on a phone, via the native share sheet) — belt-and-suspenders
    // alongside the automatic upload, in case of a network or site issue.
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

    // Photos already uploaded themselves as they were taken — "Done" (and
    // the ✕ button) just close the camera, nothing left to do.
    cameraDoneBtn?.addEventListener("click", closeCamera);
  }
})();
