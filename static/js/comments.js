// TODO: 註冊 https://cusdis.com 後，將下方換成你的 App ID
const CUSDIS_APP_ID = "YOUR_APP_ID";

const lightboxComments = document.getElementById("lightbox-comments");

function updateLightboxComments(photo, albumIdParam, albumTitleParam) {
  if (CUSDIS_APP_ID === "YOUR_APP_ID") {
    lightboxComments.style.display = "none";
    return;
  }
  lightboxComments.style.display = "block";

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
