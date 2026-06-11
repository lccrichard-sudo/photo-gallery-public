const CUSDIS_APP_ID = "0341b085-6ee3-4c6c-834d-8115abbaef20";

const cusdisThread = document.getElementById("cusdis_thread");

function injectCustomCommentStyles(doc) {
  if (doc.getElementById("custom-comment-style")) return;
  const style = doc.createElement("style");
  style.id = "custom-comment-style";
  style.textContent = `
    .grid.grid-cols-2 {
      grid-template-columns: 1fr;
    }
    .px-1:has(> label) {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .px-1:has(> label) > label {
      flex-shrink: 0;
      white-space: nowrap;
      margin-bottom: 0;
    }
    .px-1:has(> label) > input,
    .px-1:has(> label) > textarea {
      flex: 1;
      width: auto;
    }
  `;
  doc.head.appendChild(style);
}

function attachIframeStyling() {
  const iframe = cusdisThread.querySelector("iframe");
  if (!iframe || iframe.dataset.styleHookAdded) return;
  iframe.dataset.styleHookAdded = "true";
  iframe.addEventListener("load", () => {
    try {
      injectCustomCommentStyles(iframe.contentDocument);
    } catch (e) {}
  });
}

function updateLightboxComments(photo, albumIdParam, albumTitleParam) {
  const pageId = `photo-${photo.id}`;
  const pageUrl = `${window.location.origin}/album.html?id=${albumIdParam}&photo=${photo.id}`;
  const pageTitle = `${albumTitleParam} - ${photo.title || photo.id}`;

  cusdisThread.setAttribute("data-app-id", CUSDIS_APP_ID);
  cusdisThread.setAttribute("data-page-id", pageId);
  cusdisThread.setAttribute("data-page-url", pageUrl);
  cusdisThread.setAttribute("data-page-title", pageTitle);

  const apply = () => {
    window.CUSDIS.renderTo(cusdisThread);
    attachIframeStyling();
  };

  if (window.CUSDIS && window.CUSDIS.renderTo) {
    apply();
  } else {
    const timer = setInterval(() => {
      if (window.CUSDIS && window.CUSDIS.renderTo) {
        clearInterval(timer);
        apply();
      }
    }, 200);
  }
}
