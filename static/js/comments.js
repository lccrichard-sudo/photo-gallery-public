const CUSDIS_APP_ID = "0341b085-6ee3-4c6c-834d-8115abbaef20";

function updateLightboxComments(photo, albumIdParam, albumTitleParam) {
  const pageId = `photo-${photo.id}`;
  const pageUrl = `${window.location.origin}/album.html?id=${albumIdParam}&photo=${photo.id}`;
  const pageTitle = `${albumTitleParam} - ${photo.title || photo.id}`;

  const apply = () => {
    window.CUSDIS.setData({
      appId: CUSDIS_APP_ID,
      pageId,
      pageTitle,
      pageUrl,
    });
    window.CUSDIS.setTheme("dark");
  };

  if (window.CUSDIS) {
    apply();
  } else {
    const timer = setInterval(() => {
      if (window.CUSDIS) {
        clearInterval(timer);
        apply();
      }
    }, 200);
  }
}
