let allAlbums = [];
let tagsIndex = {};
let latestPhotos = [];

async function loadAlbums() {
  const grid = document.getElementById("albums-grid");

  try {
    const [albumsRes, indexRes, latestRes] = await Promise.all([
      fetch("/api/albums"),
      fetch("/api/search_index"),
      fetch("/api/album/latest/photos").catch(() => null),
    ]);
    try {
      const latest = latestRes && (await latestRes.json());
      if (latest && latest.photo) latestPhotos = latest.photo;
    } catch {}
    const data = await albumsRes.json();
    tagsIndex = await indexRes.json();

    if (data.error) {
      grid.innerHTML = `<p class="loading">無法載入相簿：${data.error}</p>`;
      return;
    }

    allAlbums = data;
    document.getElementById("album-count").textContent = `共 ${allAlbums.length} 個相簿`;
    renderAlbums(allAlbums);
  } catch (err) {
    grid.innerHTML = `<p class="loading">載入失敗：${err.message}</p>`;
  }
}

function renderAlbums(albums) {
  const grid = document.getElementById("albums-grid");
  grid.innerHTML = "";

  if (albums.length === 0) {
    grid.innerHTML = `<p class="loading">沒有符合的相簿</p>`;
    return;
  }

  if (albums === allAlbums && latestPhotos.length) {
    const href = `album.html?id=latest&title=${encodeURIComponent("最新")}&desc=${encodeURIComponent("最近一次上傳的相片（至少 10 張），並標註所在相簿")}`;
    const tiles = latestPhotos
      .map((photo) => {
        const thumb = photo.url_m || photo.url_c || photo.url_s;
        const albumsLine = (photo.album_titles || []).join("、");
        return `<a class="latest-tile" href="${href}" title="${albumsLine}">
          <img src="${thumb}" alt="${photo.title}" loading="lazy">
          ${albumsLine ? `<span class="photo-album-label">${albumsLine}</span>` : ""}
        </a>`;
      })
      .join("");

    const wrap = document.createElement("section");
    wrap.className = "latest-marquee";
    wrap.innerHTML = `
      <a class="latest-heading" href="${href}">最新 <small>最近上傳的 ${latestPhotos.length} 張相片 ›</small></a>
      <div class="latest-viewport">
        <div class="latest-track" style="animation-duration: ${Math.max(40, latestPhotos.length * 6)}s">${tiles}${tiles}</div>
      </div>
    `;
    grid.appendChild(wrap);
  }

  albums.forEach((album) => {
    const title = album.title._content || "(未命名)";
    const count = album.photos;
    const hasCover = album.primary && album.server && album.secret;
    const cover = hasCover
      ? `https://live.staticflickr.com/${album.server}/${album.primary}_${album.secret}_z.jpg`
      : "";

    const card = document.createElement("a");
    card.href = `album.html?id=${album.id}&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(album.description._content || "")}`;
    card.className = "album-card";
    card.innerHTML = `
      ${hasCover ? `<img src="${cover}" alt="${title}" loading="lazy">` : ""}
      <div class="album-card-overlay">
        <h2>${title}</h2>
        <p>${count} 張相片</p>
      </div>
    `;
    grid.appendChild(card);
  });
}

function matchAlbum(album, keyword) {
  const title = (album.title._content || "").toLowerCase();
  const desc = (album.description._content || "").toLowerCase();
  if (title.includes(keyword) || desc.includes(keyword)) return true;

  const tags = tagsIndex[album.id] || [];
  return tags.some((tag) => tag.toLowerCase().includes(keyword));
}

document.getElementById("search").addEventListener("input", (e) => {
  const terms = e.target.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    renderAlbums(allAlbums);
    return;
  }
  const filtered = allAlbums.filter((album) =>
    terms.every((term) => matchAlbum(album, term))
  );
  renderAlbums(filtered);
});

const buildBtn = document.getElementById("build-index-btn");
const indexStatusEl = document.getElementById("index-status");

async function pollIndexStatus() {
  const res = await fetch("/api/build_index/status");
  const status = await res.json();

  if (status.running) {
    indexStatusEl.textContent = `索引建立中… ${status.done}/${status.total}`;
    buildBtn.disabled = true;
    setTimeout(pollIndexStatus, 1000);
  } else {
    buildBtn.disabled = false;
    if (status.total > 0) {
      indexStatusEl.textContent = `索引完成（共 ${status.total} 個相簿）`;
      const res2 = await fetch("/api/search_index");
      tagsIndex = await res2.json();
    }
  }
}

buildBtn.addEventListener("click", async () => {
  buildBtn.disabled = true;
  indexStatusEl.textContent = "索引建立中…";
  await fetch("/api/build_index", { method: "POST" });
  pollIndexStatus();
});

loadAlbums();
