const CUSDIS_APP_ID = "0341b085-6ee3-4c6c-834d-8115abbaef20";

const cusdisThread = document.getElementById("cusdis_thread");

function updateLightboxComments(photo, albumIdParam, albumTitleParam) {
  const pageId = `photo-${photo.id}`;
  const pageUrl = `${window.location.origin}/album.html?id=${albumIdParam}&photo=${photo.id}`;
  const pageTitle = `${albumTitleParam} - ${photo.title || photo.id}`;

  cusdisThread.setAttribute("data-app-id", CUSDIS_APP_ID);
  cusdisThread.setAttribute("data-page-id", pageId);
  cusdisThread.setAttribute("data-page-url", pageUrl);
  cusdisThread.setAttribute("data-page-title", pageTitle);

  const apply = () => window.CUSDIS.renderTo(cusdisThread);

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
