(() => {
  const form = document.getElementById("wcam-upload-form");
  const mySection = document.getElementById("wcam-my-photos");
  const myGrid = document.getElementById("wcam-my-photo-grid");
  const storageKey = "weddingCameraUploadsV1";
  if (typeof WeddingCamera === "undefined") return;

  const getMine = () => { try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; } };
  const saveMine = items => localStorage.setItem(storageKey, JSON.stringify(items));

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
  }

  renderMine();
  if (!form) return;

  const filesInput = document.getElementById("wcam-files");
  const preview = document.getElementById("wcam-preview");
  const status = document.getElementById("wcam-status");
  const submit = form.querySelector(".wcam-submit");
  let objectUrls = [];

  function selectedFrame() {
    const input = form.querySelector('input[name="wcam_frame"]:checked');
    return { id: input ? Number(input.value || 0) : 0, url: input?.dataset?.frameUrl || "" };
  }

  function renderPreview() {
    objectUrls.forEach(URL.revokeObjectURL); objectUrls = [];
    preview.innerHTML = "";
    const files = Array.from(filesInput.files || []); preview.hidden = files.length === 0;
    const frame = selectedFrame();
    files.slice(0, 12).forEach(file => {
      const url = URL.createObjectURL(file); objectUrls.push(url);
      preview.appendChild(framedMedia(url, frame.url, "Selected photo preview"));
    });
    if (files.length > 12) { const more = document.createElement("div"); more.className = "wcam-more"; more.textContent = `+${files.length - 12}`; preview.appendChild(more); }
  }

  filesInput.addEventListener("change", renderPreview);
  form.querySelectorAll('input[name="wcam_frame"]').forEach(input => input.addEventListener("change", () => {
    form.querySelectorAll(".wcam-frame-option").forEach(label => label.classList.toggle("is-selected", label.contains(input) && input.checked));
    renderPreview();
  }));

  // ---- Live in-browser camera capture ----
  const openCameraBtn = document.getElementById("wcam-open-camera");
  const cameraPanel = document.getElementById("wcam-camera-panel");
  const cameraVideo = document.getElementById("wcam-camera-video");
  const cameraCanvas = document.getElementById("wcam-camera-canvas");
  const cameraError = document.getElementById("wcam-camera-error");
  const cameraSwitchBtn = document.getElementById("wcam-camera-switch");
  const cameraShutterBtn = document.getElementById("wcam-camera-shutter");
  const cameraCloseBtn = document.getElementById("wcam-camera-close");
  const cameraShotsEl = document.getElementById("wcam-camera-shots");
  const cameraDoneBtn = document.getElementById("wcam-camera-done");

  let cameraStream = null;
  let facingMode = "environment";
  let cameraShots = []; // { blob, url }

  const cameraSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  if (openCameraBtn && cameraPanel && cameraVideo && cameraSupported()) {
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

    function openCamera() { cameraPanel.hidden = false; renderShots(); startStream(); }
    function closeCamera() { stopStream(); cameraPanel.hidden = true; }

    cameraCloseBtn?.addEventListener("click", closeCamera);
    cameraSwitchBtn?.addEventListener("click", () => { facingMode = facingMode === "environment" ? "user" : "environment"; startStream(); });
    window.addEventListener("pagehide", stopStream);

    cameraShutterBtn?.addEventListener("click", () => {
      if (!cameraVideo.videoWidth) return;
      cameraCanvas.width = cameraVideo.videoWidth;
      cameraCanvas.height = cameraVideo.videoHeight;
      cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
      cameraCanvas.toBlob(blob => {
        if (!blob) return;
        cameraShots.push({ blob, url: URL.createObjectURL(blob) });
        renderShots();
      }, "image/jpeg", 0.92);
    });

    function renderShots() {
      cameraShotsEl.innerHTML = "";
      cameraShots.forEach((shot, index) => {
        const item = document.createElement("div"); item.className = "wcam-camera-shot";
        const img = document.createElement("img"); img.src = shot.url; img.alt = `Captured photo ${index + 1}`;
        item.appendChild(img);
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "wcam-camera-shot-remove"; remove.setAttribute("aria-label", "Remove this photo"); remove.textContent = "×";
        remove.addEventListener("click", () => { URL.revokeObjectURL(shot.url); cameraShots.splice(index, 1); renderShots(); });
        item.appendChild(remove);
        cameraShotsEl.appendChild(item);
      });
      cameraDoneBtn.hidden = cameraShots.length === 0;
    }

    cameraDoneBtn?.addEventListener("click", () => {
      if (!cameraShots.length) return;
      const dt = new DataTransfer();
      Array.from(filesInput.files || []).forEach(file => dt.items.add(file));
      cameraShots.forEach((shot, index) => dt.items.add(new File([shot.blob], `camera-${Date.now()}-${index}.jpg`, { type: "image/jpeg" })));
      filesInput.files = dt.files;
      cameraShots.forEach(shot => URL.revokeObjectURL(shot.url));
      cameraShots = [];
      renderShots();
      closeCamera();
      renderPreview();
    });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const files = Array.from(filesInput.files || []); if (!files.length) return;
    submit.disabled = true; status.textContent = `Uploading 0 of ${files.length}…`;
    const uploaded = []; const frame = selectedFrame();
    try {
      for (let i = 0; i < files.length; i++) {
        status.textContent = `Uploading ${i + 1} of ${files.length}…`;
        const body = new FormData();
        body.append("photo", files[i]); body.append("guest_name", document.getElementById("wcam-name").value);
        body.append("caption", document.getElementById("wcam-caption").value); body.append("live", document.getElementById("wcam-live").checked ? "1" : "0"); body.append("frame_id", String(frame.id));
        const response = await fetch(WeddingCamera.uploadUrl, { method: "POST", body });
        const data = await response.json(); if (!response.ok) throw new Error(data?.message || "One of the photos could not be uploaded.");
        uploaded.push({ id: data.id, token: data.token, live: data.live, thumbnail: data.thumbnail, frame_id: data.frame_id, frame_url: data.frame_url });
      }
      saveMine([...uploaded, ...getMine()].slice(0, 250));
      status.textContent = files.length === 1 ? (WeddingCamera.successSingle || "✨ We got it! Your photo is in the wedding album.") : (WeddingCamera.successMulti || "✨ We got them! {count} photos are in the wedding album.").replace("{count}", String(files.length));
      filesInput.value = ""; preview.innerHTML = ""; preview.hidden = true; renderMine();
    } catch (err) { status.textContent = err.message || "Something went wrong. Please try again."; }
    finally { submit.disabled = false; }
  });
})();
