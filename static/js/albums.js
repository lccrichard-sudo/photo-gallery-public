let allAlbums = [];
let tagsIndex = {};
let latestCover = "";

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
      const first = latest && latest.photo && latest.photo[0];
      if (first) latestCover = first.url_m || first.url_c || first.url_s || "";
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

  if (albums === allAlbums) {
    const latestCard = document.createElement("a");
    latestCard.href = `album.html?id=latest&title=${encodeURIComponent("最新")}&desc=${encodeURIComponent("最近上傳的 10 張相片，並標註所在相簿")}`;
    latestCard.className = "album-card";
    latestCard.innerHTML = `
      ${latestCover ? `<img src="${latestCover}" alt="最新" loading="lazy">` : ""}
      <div class="album-card-overlay">
        <h2>最新</h2>
        <p>最近上傳的 10 張相片</p>
      </div>
    `;
    grid.appendChild(latestCard);

    const rowBreak = document.createElement("div");
    rowBreak.className = "grid-row-break";
    grid.appendChild(rowBreak);
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
