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

// ── 縮網址：/photo/<關鍵字> ────────────────────────────
const LINK_PREFIX = "link:";
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>縮網址管理</title>
<style>
body{font-family:system-ui,"Microsoft JhengHei",sans-serif;background:#111;color:#eee;margin:0;padding:20px;max-width:760px;margin:0 auto}
h1{font-size:1.3rem}input,button{font:inherit;padding:8px 10px;border-radius:6px;border:1px solid #555;background:#222;color:#eee}
button{cursor:pointer;background:#d4af37;color:#111;border:0;font-weight:600}button.del{background:#733;color:#fff}
.row{display:flex;gap:8px;margin:8px 0;flex-wrap:wrap}.row input{flex:1;min-width:140px}
table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:8px;border-bottom:1px solid #333;text-align:left;word-break:break-all}
.msg{margin:8px 0;color:#d4af37;min-height:1.2em}
</style></head><body>
<h1>縮網址管理</h1>
<div class="row"><input type="password" id="pw" placeholder="管理密碼"><button id="login">登入</button></div>
<div id="panel" style="display:none">
<div class="row"><span style="padding:8px 0">/photo/</span><input id="slug" placeholder="關鍵字（英數、減號）" style="max-width:200px"><input id="target" placeholder="原網址 https://…"><button id="save">建立／更新</button></div>
<div class="msg" id="msg"></div>
<table><thead><tr><th>短網址</th><th>原網址</th><th>點擊</th><th></th></tr></thead><tbody id="list"></tbody></table>
</div>
<script>
const $=(id)=>document.getElementById(id);
let pw=sessionStorage.getItem("linkpw")||"";
const api=(method,body)=>fetch("/api/links",{method,headers:{Authorization:"Bearer "+pw,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}).then(async r=>({ok:r.ok,data:await r.json().catch(()=>({}))}));
async function load(){
  const r=await api("GET");
  if(!r.ok){$("panel").style.display="none";$("msg").textContent="";if(pw)alert("密碼錯誤");return;}
  sessionStorage.setItem("linkpw",pw);$("panel").style.display="block";
  const tb=$("list");tb.innerHTML="";
  r.data.links.forEach(l=>{
    const tr=document.createElement("tr");
    const short=location.origin+"/photo/"+l.slug;
    const a=document.createElement("a");a.href=short;a.textContent="/photo/"+l.slug;a.style.color="#d4af37";a.target="_blank";
    const c1=document.createElement("td");c1.appendChild(a);
    const cp=document.createElement("button");cp.textContent="複製";cp.style.marginLeft="6px";cp.onclick=()=>{navigator.clipboard.writeText(short);$("msg").textContent="已複製 "+short};c1.appendChild(cp);
    const c2=document.createElement("td");c2.textContent=l.url;
    const c3=document.createElement("td");c3.textContent=l.clicks||0;
    const c4=document.createElement("td");const d=document.createElement("button");d.className="del";d.textContent="刪除";
    d.onclick=async()=>{if(confirm("刪除 /photo/"+l.slug+" ？")){await api("DELETE",{slug:l.slug});load();}};c4.appendChild(d);
    tr.append(c1,c2,c3,c4);tb.appendChild(tr);
  });
}
$("login").onclick=()=>{pw=$("pw").value;load();};
$("pw").addEventListener("keydown",e=>{if(e.key==="Enter")$("login").click();});
$("save").onclick=async()=>{
  const r=await api("POST",{slug:$("slug").value,url:$("target").value});
  $("msg").textContent=r.ok?"已儲存："+location.origin+"/photo/"+r.data.slug:(r.data.error||"失敗");
  if(r.ok){$("slug").value="";$("target").value="";load();}
};
if(pw)load();
</script></body></html>`;

async function handleLinks(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.ADMIN_PASSWORD || auth !== `Bearer ${env.ADMIN_PASSWORD}`) {
    return json({ error: "unauthorized" }, 401);
  }
  if (request.method === "GET") {
    const list = await env.LIKES.list({ prefix: LINK_PREFIX });
    const links = await Promise.all(
      list.keys.map(async (k) => ({
        slug: k.name.slice(LINK_PREFIX.length),
        ...JSON.parse((await env.LIKES.get(k.name)) || "{}"),
      }))
    );
    links.sort((a, b) => (b.created || 0) - (a.created || 0));
    return json({ links });
  }
  const body = await request.json().catch(() => ({}));
  const slug = String(body.slug || "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return json({ error: "關鍵字只能用英文字母、數字、減號、底線（最多 40 字）" }, 400);
  if (request.method === "DELETE") {
    await env.LIKES.delete(LINK_PREFIX + slug);
    return json({ ok: true });
  }
  if (request.method === "POST") {
    let target;
    try {
      target = new URL(String(body.url || "").trim());
      if (!["http:", "https:"].includes(target.protocol)) throw new Error();
    } catch {
      return json({ error: "原網址要以 http:// 或 https:// 開頭" }, 400);
    }
    const old = JSON.parse((await env.LIKES.get(LINK_PREFIX + slug)) || "{}");
    await env.LIKES.put(
      LINK_PREFIX + slug,
      JSON.stringify({ url: target.href, clicks: old.clicks || 0, created: old.created || Date.now() })
    );
    return json({ ok: true, slug });
  }
  return json({ error: "method not allowed" }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/admin-links") {
      return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    const sm = url.pathname.match(/^\/photo\/([^/]+)\/?$/);
    if (sm) {
      const key = LINK_PREFIX + decodeURIComponent(sm[1]).toLowerCase();
      const raw = await env.LIKES.get(key);
      if (!raw) return new Response("找不到這個短網址", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      const entry = JSON.parse(raw);
      ctx.waitUntil(env.LIKES.put(key, JSON.stringify({ ...entry, clicks: (entry.clicks || 0) + 1 })).catch(() => {}));
      return Response.redirect(entry.url, 302);
    }

    if (url.pathname === "/api/links") {
      try {
        return await handleLinks(request, env);
      } catch (err) {
        return json({ error: err.message }, 400);
      }
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  },
};
