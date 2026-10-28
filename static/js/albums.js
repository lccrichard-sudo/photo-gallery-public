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
    const countEl = document.getElementById("album-count");
    countEl.textContent = `共 ${allAlbums.length} 個相簿`;
    fetch("/api/photo_total")
      .then((r) => r.json())
      .then((d) => {
        if (d.total) countEl.textContent = `共 ${allAlbums.length} 個相簿、${d.total} 張相片`;
      })
      .catch(() => {});
    refreshAlbums();
  } catch (err) {
    grid.innerHTML = `<p class="loading">載入失敗：${err.message}</p>`;
  }
}

function getAlbumCover(album) {
  const hasCover = album.primary && album.server && album.secret;
  return hasCover
    ? `https://live.staticflickr.com/${album.server}/${album.primary}_${album.secret}_z.jpg`
    : "";
}

function buildAlbumCard(album) {
  const title = album.title._content || "(未命名)";
  const count = album.photos;
  const cover = getAlbumCover(album);

  const card = document.createElement("a");
  card.href = `album.html?id=${album.id}&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(album.description._content || "")}`;
  card.className = "album-card";
  card.innerHTML = `
    ${cover ? `<img src="${cover}" alt="${title}" loading="lazy">` : ""}
    <div class="album-card-overlay">
      <h2>${title}</h2>
      <p>${count} 張相片</p>
    </div>
  `;
  return card;
}

function renderAlbums(albums, { showLatest = true } = {}) {
  const grid = document.getElementById("albums-grid");
  grid.classList.remove("calendar-mode");
  grid.innerHTML = "";

  if (albums.length === 0) {
    grid.innerHTML = `<p class="loading">沒有符合的相簿</p>`;
    return;
  }

  if (showLatest && latestPhotos.length) {
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

  albums.forEach((album) => grid.appendChild(buildAlbumCard(album)));
}

function matchAlbum(album, keyword) {
  const title = (album.title._content || "").toLowerCase();
  const desc = (album.description._content || "").toLowerCase();
  if (title.includes(keyword) || desc.includes(keyword)) return true;

  const tags = tagsIndex[album.id] || [];
  return tags.some((tag) => tag.toLowerCase().includes(keyword));
}

const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort-select");

function sortAlbums(list, mode) {
  const sorted = [...list];
  const title = (a) => a.title._content || "";
  const byTitle = (a, b) => title(a).localeCompare(title(b), "zh-Hant", { numeric: true });
  const num = (key) => (a, b) => Number(a[key] || 0) - Number(b[key] || 0);
  if (mode === "title-asc") sorted.sort(byTitle);
  else if (mode === "title-desc") sorted.sort((a, b) => byTitle(b, a));
  else if (mode === "photos-desc") sorted.sort((a, b) => num("photos")(b, a));
  else if (mode === "photos-asc") sorted.sort(num("photos"));
  else if (mode === "update-desc") sorted.sort((a, b) => num("date_update")(b, a));
  else if (mode === "update-asc") sorted.sort(num("date_update"));
  else if (mode === "create-desc") sorted.sort((a, b) => num("date_create")(b, a));
  else if (mode === "create-asc") sorted.sort(num("date_create"));
  return sorted;
}

// ── 月曆檢視（依相片拍攝日期）──────────────────────────
let calendarByMonth = new Map();
let calendarMonthKeys = [];
let calendarIndex = 0;
let selectedDayCell = null;
let calendarSeq = 0;

function groupPhotosByMonth(photos) {
  const byMonth = new Map();
  photos.forEach((photo) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(photo.datetaken || "");
    if (!m) return;
    const monthKey = `${m[1]}-${m[2]}`;
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
    const byDay = byMonth.get(monthKey);
    const day = Number(m[3]);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(photo);
  });
  return byMonth;
}

function dayLink(year, month, day) {
  const d = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return `album.html?id=date&d=${d}`;
}

function showDayPhotos(year, month, day, dayPhotos, cellEl) {
  if (selectedDayCell) selectedDayCell.classList.remove("calendar-day-selected");
  cellEl.classList.add("calendar-day-selected");
  selectedDayCell = cellEl;

  const href = dayLink(year, month, day);
  const panel = document.getElementById("calendar-day-panel");
  panel.innerHTML = `<h4 class="calendar-day-panel-title">${year} 年 ${month} 月 ${day} 日・${dayPhotos.length} 張相片
    <a class="calendar-day-panel-link" href="${href}">全部顯示 ›</a></h4>`;
  const list = document.createElement("div");
  list.className = "photos-grid";
  dayPhotos.slice(0, 60).forEach((photo) => {
    const a = document.createElement("a");
    a.className = "photo-thumb";
    a.href = href;
    a.innerHTML = `<img src="${photo.url_m || photo.url_c || photo.url_s}" alt="${photo.title || ""}" loading="lazy">`;
    list.appendChild(a);
  });
  panel.appendChild(list);
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderCalendarMonth() {
  const grid = document.getElementById("albums-grid");
  grid.innerHTML = "";
  selectedDayCell = null;

  const monthKey = calendarMonthKeys[calendarIndex];
  const [year, month] = monthKey.split("-").map(Number);
  const byDay = calendarByMonth.get(monthKey);
  const totalInMonth = [...byDay.values()].reduce((sum, arr) => sum + arr.length, 0);

  const container = document.createElement("div");
  container.className = "calendar-container";

  const monthOptions = calendarMonthKeys
    .map((key, i) => {
      const [y, m] = key.split("-").map(Number);
      return `<option value="${i}" ${i === calendarIndex ? "selected" : ""}>${y} 年 ${m} 月</option>`;
    })
    .join("");

  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  nav.innerHTML = `
    <button id="calendar-prev-btn" class="autoplay-btn" ${calendarIndex >= calendarMonthKeys.length - 1 ? "disabled" : ""}>‹ 較舊</button>
    <h3 class="calendar-current-title">
      <select id="calendar-month-select" class="autoplay-speed">${monthOptions}</select>
      <span class="calendar-month-count">共 ${totalInMonth} 張相片・第 ${calendarIndex + 1}/${calendarMonthKeys.length} 個月</span>
    </h3>
    <button id="calendar-next-btn" class="autoplay-btn" ${calendarIndex <= 0 ? "disabled" : ""}>較新 ›</button>
  `;
  container.appendChild(nav);

  nav.querySelector("#calendar-prev-btn").addEventListener("click", () => {
    if (calendarIndex < calendarMonthKeys.length - 1) {
      calendarIndex++;
      renderCalendarMonth();
    }
  });
  nav.querySelector("#calendar-next-btn").addEventListener("click", () => {
    if (calendarIndex > 0) {
      calendarIndex--;
      renderCalendarMonth();
    }
  });
  nav.querySelector("#calendar-month-select").addEventListener("change", (e) => {
    calendarIndex = parseInt(e.target.value, 10);
    renderCalendarMonth();
  });

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "calendar-grid calendar-weekdays";
  ["日", "一", "二", "三", "四", "五", "六"].forEach((w) => {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = w;
    weekdayRow.appendChild(el);
  });
  container.appendChild(weekdayRow);

  const daysGrid = document.createElement("div");
  daysGrid.className = "calendar-grid";

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-day calendar-day-empty";
    daysGrid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayPhotos = byDay.get(day) || [];
    const cell = document.createElement("div");
    cell.className = "calendar-day";

    if (dayPhotos.length > 0) {
      cell.classList.add("has-albums");
      const covers = dayPhotos
        .slice(0, 4)
        .map((p) => p.url_s || p.url_m)
        .filter(Boolean)
        .map((url) => `<img src="${url}" alt="" loading="lazy">`)
        .join("");
      cell.innerHTML = `
        <div class="calendar-day-covers">${covers}</div>
        <span class="calendar-day-num">${day}</span>
        ${dayPhotos.length > 1 ? `<span class="calendar-day-count">${dayPhotos.length}</span>` : ""}
      `;
      cell.addEventListener("click", () => showDayPhotos(year, month, day, dayPhotos, cell));
    } else {
      cell.innerHTML = `<span class="calendar-day-num">${day}</span>`;
    }
    daysGrid.appendChild(cell);
  }

  container.appendChild(daysGrid);
  grid.appendChild(container);

  const panel = document.createElement("div");
  panel.id = "calendar-day-panel";
  panel.className = "calendar-day-panel";
  grid.appendChild(panel);
}

async function renderCalendar(terms) {
  const grid = document.getElementById("albums-grid");
  grid.classList.add("calendar-mode");
  grid.innerHTML = `<p class="loading">載入全部相片中…</p>`;
  selectedDayCell = null;
  const seq = ++calendarSeq;

  let photos;
  try {
    photos = await loadAllPhotosForSearch();
  } catch (err) {
    if (seq === calendarSeq) grid.innerHTML = `<p class="loading">載入失敗：${err.message}</p>`;
    return;
  }
  if (seq !== calendarSeq || viewMode !== "calendar") return;

  if (terms.length) photos = photos.filter((p) => terms.every((t) => photoText(p).includes(t)));
  calendarByMonth = groupPhotosByMonth(photos);
  calendarMonthKeys = [...calendarByMonth.keys()].sort().reverse();

  if (calendarMonthKeys.length === 0) {
    grid.innerHTML = `<p class="loading">沒有符合的相片</p>`;
    return;
  }

  calendarIndex = 0;
  renderCalendarMonth();
}

let viewMode = "grid";

// ── 符合條件的相片（跨全部相簿）───────────────────────
let allPhotosPromise = null;

function loadAllPhotosForSearch() {
  if (allPhotosPromise) return allPhotosPromise;
  allPhotosPromise = Promise.all(
    allAlbums.map((album) =>
      fetch(`/api/album/${album.id}/photos`)
        .then((r) => r.json())
        .then((data) => ({ album, list: data.photo || [] }))
        .catch(() => ({ album, list: [] }))
    )
  ).then((results) => {
    const byId = new Map();
    results.forEach(({ album, list }) => {
      const title = album.title._content || "";
      list.forEach((photo) => {
        if (!byId.has(photo.id)) byId.set(photo.id, { ...photo, albumTitles: [] });
        byId.get(photo.id).albumTitles.push(title);
      });
    });
    return [...byId.values()];
  });
  return allPhotosPromise;
}

function photoText(photo) {
  const desc = (photo.description && photo.description._content) || "";
  return `${photo.title || ""} ${desc} ${photo.tags || ""} ${photo.albumTitles.join(" ")}`.toLowerCase();
}

const photoMatchBar = document.getElementById("photo-match-bar");
let photoMatchSeq = 0;

async function updatePhotoMatchBar(terms) {
  const seq = ++photoMatchSeq;
  if (!terms.length) {
    photoMatchBar.style.display = "none";
    return;
  }
  try {
    const photos = await loadAllPhotosForSearch();
    if (seq !== photoMatchSeq) return;
    const count = photos.filter((p) => {
      const text = photoText(p);
      return terms.every((t) => text.includes(t));
    }).length;
    if (!count) {
      photoMatchBar.style.display = "none";
      return;
    }
    const q = terms.join(" ");
    photoMatchBar.href = `album.html?id=search&q=${encodeURIComponent(q)}`;
    photoMatchBar.textContent = `找到 ${count} 張符合「${q}」的相片，全部顯示 ›`;
    photoMatchBar.style.display = "block";
  } catch {
    photoMatchBar.style.display = "none";
  }
}

function refreshAlbums() {
  const terms = searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matched = terms.length
    ? allAlbums.filter((album) => terms.every((term) => matchAlbum(album, term)))
    : allAlbums;
  const sorted = sortAlbums(matched, sortSelect.value);
  if (viewMode === "calendar") renderCalendar(terms);
  else renderAlbums(sorted, { showLatest: !terms.length });
  updatePhotoMatchBar(terms);
}

searchInput.addEventListener("input", refreshAlbums);
sortSelect.addEventListener("change", refreshAlbums);

const viewToggleBtn = document.getElementById("view-toggle-btn");
viewToggleBtn.addEventListener("click", () => {
  viewMode = viewMode === "grid" ? "calendar" : "grid";
  viewToggleBtn.textContent = viewMode === "calendar" ? "▦ 格狀檢視" : "🗓 月曆檢視";
  document.body.classList.toggle("calendar-active", viewMode === "calendar");
  refreshAlbums();
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
