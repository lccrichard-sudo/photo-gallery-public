const params = new URLSearchParams(window.location.search);
const albumId = params.get("id");
const albumTitle = params.get("title") || "相簿";
const albumDesc = params.get("desc") || "";

document.getElementById("album-title").textContent = albumTitle;
document.getElementById("album-desc").textContent = albumDesc;
document.title = `${albumTitle} | Richard's Photography`;

let photos = [];
let filteredPhotos = [];
let currentIndex = 0;

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxDesc = document.getElementById("lightbox-desc");
const lightboxTags = document.getElementById("lightbox-tags");
const lightboxAlbums = document.getElementById("lightbox-albums");
const qualitySelect = document.getElementById("quality-select");
const QUALITY_STORAGE_KEY = "photo-quality";

function getThumbUrl(photo) {
  return photo.url_m || photo.url_c || photo.url_l || photo.url_s;
}

function renderPhotos() {
  const grid = document.getElementById("photos-grid");
  grid.innerHTML = "";

  if (photos.length === 0) {
    grid.innerHTML = `<p class="loading">這個相簿沒有照片</p>`;
    return;
  }

  if (filteredPhotos.length === 0) {
    grid.innerHTML = `<p class="loading">沒有符合的照片</p>`;
    return;
  }

  filteredPhotos.forEach((photo, index) => {
    const thumb = getThumbUrl(photo);
    const div = document.createElement("div");
    div.className = "photo-thumb";
    const albumsLine = (photo.album_titles || []).join("、");
    div.innerHTML = `<img src="${thumb}" alt="${photo.title}" loading="lazy">` +
      (albumsLine ? `<span class="photo-album-label">${albumsLine}</span>` : "");
    div.addEventListener("click", () => openLightbox(index));
    grid.appendChild(div);
  });
}

function matchPhoto(photo, keyword) {
  const title = (photo.title || "").toLowerCase();
  const desc = ((photo.description && photo.description._content) || "").toLowerCase();
  return title.includes(keyword) || desc.includes(keyword);
}

function updatePhotoCount() {
  const countSpan = document.getElementById("photo-count");
  if (photos.length === 0) {
    countSpan.textContent = "";
  } else if (filteredPhotos.length === photos.length) {
    countSpan.textContent = `共 ${photos.length} 張照片`;
  } else {
    countSpan.textContent = `符合 ${filteredPhotos.length} / ${photos.length} 張照片`;
  }
}

const searchInput = document.getElementById("photo-search");
const sortSelect = document.getElementById("sort-select");

function sortPhotos(list, mode) {
  const sorted = [...list];
  const byTaken = (a, b) => (a.datetaken || "").localeCompare(b.datetaken || "");
  const byTitle = (a, b) => (a.title || "").localeCompare(b.title || "", "zh-Hant", { numeric: true });
  if (mode === "taken-desc") sorted.sort((a, b) => byTaken(b, a));
  else if (mode === "taken-asc") sorted.sort(byTaken);
  else if (mode === "title-asc") sorted.sort(byTitle);
  else if (mode === "title-desc") sorted.sort((a, b) => byTitle(b, a));
  else if (mode === "random") {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  }
  return sorted;
}

function refreshPhotos() {
  const terms = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matched = terms.length
    ? photos.filter((photo) => terms.every((term) => matchPhoto(photo, term)))
    : photos;
  filteredPhotos = sortPhotos(matched, sortSelect.value);
  renderPhotos();
  updatePhotoCount();
}

searchInput.addEventListener("input", refreshPhotos);
sortSelect.addEventListener("change", refreshPhotos);

async function loadPhotos() {
  const grid = document.getElementById("photos-grid");

  if (!albumId) {
    grid.innerHTML = `<p class="loading">找不到相簿 ID</p>`;
    return;
  }

  try {
    const res = await fetch(`/api/album/${albumId}/photos`);
    const data = await res.json();

    if (data.error) {
      grid.innerHTML = `<p class="loading">無法載入照片：${data.error}</p>`;
      return;
    }

    photos = data.photo;
    refreshPhotos();
  } catch (err) {
    grid.innerHTML = `<p class="loading">載入失敗：${err.message}</p>`;
  }
}

function getLargeUrl(photo) {
  const quality = qualitySelect.value;
  if (quality === "low") return photo.url_m || photo.url_c || photo.url_l || photo.url_s || photo.url_o;
  if (quality === "high") return photo.url_o || photo.url_k || photo.url_h || photo.url_l || photo.url_c || photo.url_m;
  return photo.url_c || photo.url_l || photo.url_h || photo.url_m || photo.url_o;
}

function openLightbox(index) {
  currentIndex = index;
  lightbox.classList.add("active");
  showCurrentPhoto();
}

function closeLightbox() {
  lightbox.classList.remove("active");
}

function showCurrentPhoto() {
  const photo = filteredPhotos[currentIndex];
  lightboxImg.src = getLargeUrl(photo);
  lightboxImg.alt = photo.title;
  const desc = (photo.description && photo.description._content) || "";
  lightboxDesc.textContent = desc;
  lightboxDesc.style.display = desc ? "block" : "none";

  if (photo.album_sets) {
    const links = photo.album_sets
      .map((set) => `<a href="album.html?id=${set.id}&title=${encodeURIComponent(set.title)}">${set.title}</a>`)
      .join("、");
    lightboxAlbums.innerHTML = `所在相簿：${links || "（未放入相簿）"}`;
    lightboxAlbums.style.display = "block";
  } else {
    lightboxAlbums.style.display = "none";
  }

  const tags = (photo.tags || "").split(/\s+/).filter(Boolean);
  lightboxTags.innerHTML = tags.map((tag) => `<span class="tag-chip">${tag}</span>`).join("");
  lightboxTags.style.display = tags.length ? "flex" : "none";
}

function showPrev() {
  currentIndex = (currentIndex - 1 + filteredPhotos.length) % filteredPhotos.length;
  showCurrentPhoto();
}

function showNext() {
  currentIndex = (currentIndex + 1) % filteredPhotos.length;
  showCurrentPhoto();
}

lightboxImg.addEventListener("contextmenu", (e) => e.preventDefault());

document.getElementById("lightbox-close").addEventListener("click", () => {
  stopAutoplay();
  closeLightbox();
});
document.getElementById("lightbox-prev").addEventListener("click", () => {
  stopAutoplay();
  showPrev();
});
document.getElementById("lightbox-next").addEventListener("click", () => {
  stopAutoplay();
  showNext();
});

lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) {
    stopAutoplay();
    closeLightbox();
  }
});

document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("active")) return;
  if (e.key === "Escape") {
    stopAutoplay();
    closeLightbox();
  }
  if (e.key === "ArrowLeft") {
    stopAutoplay();
    showPrev();
  }
  if (e.key === "ArrowRight") {
    stopAutoplay();
    showNext();
  }
  if (e.key === " ") {
    e.preventDefault();
    toggleAutoplay();
  }
});

let autoplayTimer = null;

const autoplayBtn = document.getElementById("autoplay-btn");
const autoplaySpeedSelect = document.getElementById("autoplay-speed");
const lightboxAutoplayBtn = document.getElementById("lightbox-autoplay-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");

function getAutoplayInterval() {
  return parseInt(autoplaySpeedSelect.value, 10) || 3000;
}

function startAutoplay() {
  if (autoplayTimer || filteredPhotos.length === 0) return;
  autoplayTimer = setInterval(showNext, getAutoplayInterval());
  autoplayBtn.textContent = "⏸ 停止播放";
  lightboxAutoplayBtn.textContent = "⏸";
}

function stopAutoplay() {
  if (!autoplayTimer) return;
  clearInterval(autoplayTimer);
  autoplayTimer = null;
  autoplayBtn.textContent = "▶ 自動播放";
  lightboxAutoplayBtn.textContent = "▶";
}

function toggleAutoplay() {
  if (autoplayTimer) {
    stopAutoplay();
  } else {
    startAutoplay();
  }
}

autoplayBtn.addEventListener("click", () => {
  if (filteredPhotos.length === 0) return;
  if (!lightbox.classList.contains("active")) {
    openLightbox(0);
  }
  startAutoplay();
});

lightboxAutoplayBtn.addEventListener("click", toggleAutoplay);

autoplaySpeedSelect.addEventListener("change", () => {
  if (!autoplayTimer) return;
  clearInterval(autoplayTimer);
  autoplayTimer = setInterval(showNext, getAutoplayInterval());
});

function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

function requestFullscreenCompat(el) {
  const request =
    el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!request) {
    return Promise.reject(new Error("這個瀏覽器不支援全螢幕功能"));
  }
  return Promise.resolve(request.call(el));
}

function exitFullscreenCompat() {
  const exit =
    document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (exit) return Promise.resolve(exit.call(document));
  return Promise.resolve();
}

function isPseudoFullscreen() {
  return document.body.classList.contains("pseudo-fullscreen");
}

function updateFullscreenBtn() {
  fullscreenBtn.textContent =
    isFullscreen() || isPseudoFullscreen() ? "⛶ 離開全螢幕" : "⛶ 全螢幕";
}

function toggleFullscreen() {
  if (isFullscreen() || isPseudoFullscreen()) {
    document.body.classList.remove("pseudo-fullscreen");
    exitFullscreenCompat().finally(updateFullscreenBtn);
    return;
  }
  requestFullscreenCompat(document.documentElement)
    .then(updateFullscreenBtn)
    .catch(() => {
      document.body.classList.add("pseudo-fullscreen");
      updateFullscreenBtn();
    });
}

fullscreenBtn.addEventListener("click", toggleFullscreen);

["fullscreenchange", "webkitfullscreenchange", "msfullscreenchange"].forEach((evt) => {
  document.addEventListener(evt, updateFullscreenBtn);
});

qualitySelect.addEventListener("change", () => {
  localStorage.setItem(QUALITY_STORAGE_KEY, qualitySelect.value);
  if (lightbox.classList.contains("active")) showCurrentPhoto();
});

const savedQuality = localStorage.getItem(QUALITY_STORAGE_KEY);
if (savedQuality) qualitySelect.value = savedQuality;

// ── 按讚功能 ──────────────────────────────────────────
const LIKES_STORAGE_KEY = "photo-liked-ids";
const likeBtn   = document.getElementById("lightbox-like-btn");
const likeCount = document.getElementById("like-count");

function getLikedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(LIKES_STORAGE_KEY) || "[]")); }
  catch { return new Set(); }
}

function saveLikedSet(set) {
  localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify([...set]));
}

function updateLikeUI(count, liked) {
  likeCount.textContent = count;
  likeBtn.textContent   = liked ? "♥" : "♡";
  likeBtn.classList.toggle("liked", liked);
}

async function loadLikeCount(photoId) {
  try {
    const res  = await fetch(`/api/likes/${photoId}`);
    const data = await res.json();
    const likedLocally = getLikedSet().has(photoId);
    updateLikeUI(data.count, data.liked_by_ip || likedLocally);
  } catch { updateLikeUI(0, false); }
}

likeBtn.addEventListener("click", async () => {
  const photo   = filteredPhotos[currentIndex];
  const photoId = photo.id;
  try {
    const res  = await fetch(`/api/likes/${photoId}`, { method: "POST" });
    const data = await res.json();
    const liked = getLikedSet();
    if (data.liked) { liked.add(photoId); } else { liked.delete(photoId); }
    saveLikedSet(liked);
    updateLikeUI(data.count, data.liked);
  } catch {}
});

// 每次切換照片時更新按讚狀態
const _origShowCurrentPhoto = showCurrentPhoto;
showCurrentPhoto = function () {
  _origShowCurrentPhoto();
  const photo = filteredPhotos[currentIndex];
  if (photo) loadLikeCount(photo.id);
};

loadPhotos();
