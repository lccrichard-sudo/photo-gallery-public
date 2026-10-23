import tagsIndex from "../../album_tags_index.json";
import photoDescriptions from "../../photo_descriptions.json";

const API_URL = "https://api.flickr.com/services/rest/";
const PHOTO_EXTRAS = "url_s,url_m,url_c,url_l,url_h,url_k,url_o,description,tags,date_taken,date_upload";

const LATEST_MIN_COUNT = 10;
const LATEST_FETCH = 500;
const TAIPEI_OFFSET = 8 * 3600;
const FLICKR_CACHE_TTL = 300;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });

async function flickr(env, method, params = {}, ttl = FLICKR_CACHE_TTL) {
  const url = new URL(API_URL);
  const query = {
    method,
    api_key: env.FLICKR_API_KEY,
    format: "json",
    nojsoncallback: 1,
    ...params,
  };
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const resp = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true } });
  return resp.json();
}

async function getAllAlbums(env) {
  const albums = [];
  let page = 1;
  while (true) {
    const data = await flickr(env, "flickr.photosets.getList", {
      user_id: env.FLICKR_USER_ID,
      page,
      per_page: 500,
    });
    if (data.stat !== "ok") throw new Error(data.message);
    albums.push(...data.photosets.photoset);
    if (page >= data.photosets.pages) break;
    page++;
  }
  return albums;
}

async function getAlbumPhotos(env, albumId, extras = PHOTO_EXTRAS) {
  const data = await flickr(env, "flickr.photosets.getPhotos", {
    photoset_id: albumId,
    user_id: env.FLICKR_USER_ID,
    extras,
  });
  if (data.stat !== "ok") throw new Error(data.message);
  return data.photoset;
}

const uploadDay = (photo) => Math.floor((Number(photo.dateupload) + TAIPEI_OFFSET) / 86400);

// 最近一次上傳（台北時間同一天）的公開相片，不足 10 張補到 10 張，並附上所在相簿。
// 所在相簿改用「各相簿的相片清單」反查，subrequest 數固定（相簿數+1），不受張數影響。
async function getLatestPhotos(env) {
  const data = await flickr(env, "flickr.people.getPublicPhotos", {
    user_id: env.FLICKR_USER_ID,
    extras: PHOTO_EXTRAS,
    per_page: LATEST_FETCH,
  }, 600);
  if (data.stat !== "ok") throw new Error(data.message);

  const all = data.photos.photo;
  const lastBatch = all.length ? all.filter((p) => uploadDay(p) === uploadDay(all[0])) : [];
  const photos = lastBatch.length > LATEST_MIN_COUNT ? lastBatch : all.slice(0, LATEST_MIN_COUNT);
  const wanted = new Set(photos.map((p) => p.id));

  const albums = await getAllAlbums(env);
  const sets = await Promise.all(
    albums.map((a) => getAlbumPhotos(env, a.id, "").then((s) => ({ a, s })).catch(() => null))
  );
  const membership = new Map();
  for (const item of sets) {
    if (!item) continue;
    const title = item.a.title._content;
    for (const p of item.s.photo) {
      if (!wanted.has(p.id)) continue;
      if (!membership.has(p.id)) membership.set(p.id, []);
      membership.get(p.id).push({ id: item.a.id, title });
    }
  }
  for (const p of photos) {
    const list = membership.get(p.id) || [];
    p.album_sets = list;
    p.album_titles = list.map((s) => s.title);
  }
  return { photo: photos };
}

// 搜尋索引：即時由 Flickr 組出（標籤＋說明＋本機補充說明），失敗時退回打包的舊索引
async function buildSearchIndex(env) {
  const albums = await getAllAlbums(env);
  const result = {};
  await Promise.all(
    albums.map(async (album) => {
      const tags = new Set();
      try {
        const set = await getAlbumPhotos(env, album.id, "tags,description");
        for (const photo of set.photo) {
          (photo.tags || "").split(/\s+/).filter(Boolean).forEach((t) => tags.add(t));
          const desc = ((photo.description && photo.description._content) || "").trim();
          if (desc) tags.add(desc);
          const local = (photoDescriptions[photo.id] || "").trim();
          if (local) tags.add(local);
        }
        result[album.id] = [...tags].sort();
      } catch {
        if (tagsIndex[album.id]) result[album.id] = tagsIndex[album.id];
      }
    })
  );
  return result;
}

async function hashIp(ip) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

const clientIp = (request) =>
  request.headers.get("CF-Connecting-IP") ||
  (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
  "0.0.0.0";

async function loadLikes(env, photoId) {
  const raw = await env.LIKES.get(photoId);
  return raw ? JSON.parse(raw) : { count: 0, ips: [] };
}

async function handleApi(request, env, url) {
  const path = url.pathname;

  if (path === "/api/albums") return json(await getAllAlbums(env));

  if (path === "/api/photo_total") {
    const data = await flickr(env, "flickr.people.getPublicPhotos", {
      user_id: env.FLICKR_USER_ID,
      per_page: 1,
    });
    if (data.stat !== "ok") throw new Error(data.message);
    return json({ total: Number(data.photos.total) });
  }

  if (path === "/api/search_index") {
    return json(await buildSearchIndex(env).catch(() => tagsIndex), 200, {
      "Cache-Control": "public, max-age=300",
    });
  }
  if (path === "/api/build_index/status") return json({ running: false, done: 0, total: 0 });
  if (path === "/api/build_index") return json({ status: "not_needed" });

  let m = path.match(/^\/api\/album\/([^/]+)\/photos$/);
  if (m) {
    const data = m[1] === "latest" ? await getLatestPhotos(env) : await getAlbumPhotos(env, m[1]);
    return json(data);
  }

  m = path.match(/^\/api\/likes\/([^/]+)$/);
  if (m) {
    const photoId = m[1];
    const ipHash = await hashIp(clientIp(request));
    const entry = await loadLikes(env, photoId);
    if (request.method === "POST") {
      let liked;
      if (entry.ips.includes(ipHash)) {
        entry.ips = entry.ips.filter((x) => x !== ipHash);
        entry.count = Math.max(0, entry.count - 1);
        liked = false;
      } else {
        entry.ips.push(ipHash);
        entry.count += 1;
        liked = true;
      }
      await env.LIKES.put(photoId, JSON.stringify(entry));
      return json({ count: entry.count, liked });
    }
    return json({ count: entry.count, liked_by_ip: entry.ips.includes(ipHash) });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  },
};
