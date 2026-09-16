(() => {
  function drawQr(canvas) {
    if (!canvas || typeof qrcode === "undefined") return;
    const url = canvas.dataset.url || "";
    if (!url) return;
    const size = canvas.width || 220;
    let qr;
    try {
      qr = qrcode(0, "M"); // type 0 = auto-select the smallest QR version that fits
      qr.addData(url);
      qr.make();
    } catch (err) {
      return;
    }
    const count = qr.getModuleCount();
    const scale = size / count;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#1a1a1a";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(Math.round(col * scale), Math.round(row * scale), Math.ceil(scale), Math.ceil(scale));
        }
      }
    }
  }

  document.querySelectorAll("canvas.wcam-qr-canvas, #wcam-admin-qr-canvas").forEach(drawQr);

  // Admin-only extras: copy link, PNG download, NFC tag writing.
  const copyBtn = document.getElementById("wcam-copy-link");
  const urlEl = document.getElementById("wcam-admin-qr-url");
  if (copyBtn && urlEl) {
    copyBtn.addEventListener("click", async () => {
      const text = urlEl.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy Link"; }, 1500);
      } catch (err) {
        window.prompt("Copy this link:", text);
      }
    });
  }

  const downloadBtn = document.getElementById("wcam-download-qr");
  const adminCanvas = document.getElementById("wcam-admin-qr-canvas");
  if (downloadBtn && adminCanvas) {
    downloadBtn.addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = "wedding-camera-qr.png";
      link.href = adminCanvas.toDataURL("image/png");
      link.click();
    });
  }

  const nfcNote = document.getElementById("wcam-nfc-support-note");
  const nfcBtn = document.getElementById("wcam-nfc-write");
  const nfcStatus = document.getElementById("wcam-nfc-status");
  if (nfcNote && nfcBtn && urlEl) {
    if ("NDEFReader" in window) {
      nfcNote.textContent = "Your browser can write NFC tags directly from this page.";
      nfcBtn.hidden = false;
      nfcBtn.addEventListener("click", async () => {
        if (nfcStatus) nfcStatus.textContent = "Hold a blank NFC tag near the back of your phone…";
        try {
          const ndef = new window.NDEFReader();
          await ndef.write({ records: [{ recordType: "url", data: urlEl.textContent.trim() }] });
          if (nfcStatus) nfcStatus.textContent = "✅ Tag written! Test it by tapping your phone on the tag.";
        } catch (err) {
          if (nfcStatus) nfcStatus.textContent = "Could not write the tag (" + (err && err.message ? err.message : "unknown error") + "). Move the tag closer and try again.";
        }
      });
    } else {
      nfcNote.textContent = "This browser can't write NFC tags directly — that currently only works in Chrome for Android over HTTPS.";
    }
  }
})();
