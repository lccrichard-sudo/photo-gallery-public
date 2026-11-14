// ── 中／英 切換：以「中文原文」當索引翻成英文，頁面上動態產生的文字也由 MutationObserver 自動轉換 ──
(function () {
  const CJK = /[　-〿一-鿿＀-￯]/;
  let lang = "zh";
  try { lang = localStorage.getItem("lang") === "en" ? "en" : "zh"; } catch {}

  const DICT = {
    "載入相簿中…": "Loading albums…",
    "載入中…": "Loading…",
    "載入照片中…": "Loading photos…",
    "載入全部相片中…": "Loading all photos…",
    "載入全部照片中…": "Loading all photos…",
    "搜尋相簿名稱、說明、照片標籤…": "Search album names, descriptions, photo tags…",
    "多條件用空格分開": "Separate multiple terms with spaces",
    "搜尋這個相簿的照片標題、說明…": "Search photo titles and descriptions in this album…",
    "搜尋全部相簿的標題、說明、標籤、相簿名稱…": "Search titles, descriptions, tags and album names across all albums…",
    "排列方式": "Sort by",
    "排列：預設順序": "Sort: default order",
    "預設順序": "Default order",
    "相簿名稱（A→Z）": "Album name (A→Z)",
    "相簿名稱（Z→A）": "Album name (Z→A)",
    "相片張數（多→少）": "Photos (most → fewest)",
    "相片張數（少→多）": "Photos (fewest → most)",
    "最近更新（新→舊）": "Recently updated (new → old)",
    "最近更新（舊→新）": "Recently updated (old → new)",
    "建立日期（新→舊）": "Created (new → old)",
    "建立日期（舊→新）": "Created (old → new)",
    "拍攝日期：新 → 舊": "Date taken: new → old",
    "拍攝日期：舊 → 新": "Date taken: old → new",
    "上傳日期：新 → 舊": "Uploaded: new → old",
    "上傳日期：舊 → 新": "Uploaded: old → new",
    "標題：A → Z": "Title: A → Z",
    "標題：Z → A": "Title: Z → A",
    "隨機排列": "Shuffle",
    "18X：隱藏「人體藝術」；18O：顯示": "18X: hide “Human Form”; 18O: show",
    "🗓 月曆檢視": "🗓 Calendar view",
    "▦ 格狀檢視": "▦ Grid view",
    "建立／更新標籤索引": "Build / update tag index",
    "✉ 聯絡我": "✉ Contact me",
    "聯絡我": "Contact me",
    "您的 Email": "Your email",
    "訊息內容": "Message",
    "想說的話…": "Your message…",
    "送出": "Send",
    "傳送中…": "Sending…",
    "已送出，謝謝！": "Sent. Thank you!",
    "傳送失敗，請稍後再試。": "Failed to send. Please try again later.",
    "傳送失敗，請檢查網路連線。": "Failed to send. Please check your connection.",
    "訪客數": "Visitors",
    "← 返回所有相簿": "← Back to all albums",
    "相簿": "Album",
    "相簿 | Richard's Photography": "Album | Richard's Photography",
    "搜尋結果": "Search results",
    "跨全部相簿，符合條件的所有相片": "All matching photos across every album",
    "這一天拍攝的所有相片（跨全部相簿）": "All photos taken on this day (across every album)",
    "最近 72 小時內上傳的相片（不足 10 張則補到 10 張），並標註所在相簿": "Photos uploaded in the last 72 hours (padded to 10 if fewer), labelled with their albums",
    "▶ 自動播放": "▶ Autoplay",
    "⏸ 停止播放": "⏸ Stop",
    "▶ 播放全部": "▶ Play all",
    "相片方向：橫直不分／只挑橫幅／只挑直幅": "Photo orientation: any / landscape only / portrait only",
    "橫直不分": "Any orientation",
    "只挑橫幅": "Landscape only",
    "只挑直幅": "Portrait only",
    "省流量畫質": "Data saver quality",
    "標準畫質": "Standard quality",
    "高畫質": "High quality",
    "放大檢視時是否顯示說明、所在相簿與標籤": "Show caption, albums and tags in the enlarged view",
    "顯示說明": "Show captions",
    "不顯示說明": "Hide captions",
    "⛶ 全螢幕": "⛶ Fullscreen",
    "⛶ 離開全螢幕": "⛶ Exit fullscreen",
    "按讚": "Like",
    "(未命名)": "(Untitled)",
    "最新": "Latest",
    "隨機": "Random",
    "沒有符合的相簿": "No matching albums",
    "沒有符合的相片": "No matching photos",
    "沒有符合的照片": "No matching photos",
    "這個相簿沒有照片": "This album has no photos",
    "找不到相簿 ID": "Album ID not found",
    "全部顯示 ›": "Show all ›",
    "‹ 較舊": "‹ Older",
    "較新 ›": "Newer ›",
    "所在相簿：": "Albums: ",
    "（未放入相簿）": "(not in any album)",
    "沒有符合方向的相片": "No photos match that orientation",
    "這個瀏覽器不支援全螢幕功能": "This browser does not support fullscreen",
    "無法取得相簿清單": "Could not get the album list",
    "索引建立中…": "Building index…",
    "日": "Sun", "一": "Mon", "二": "Tue", "三": "Wed", "四": "Thu", "五": "Fri", "六": "Sat",
  };

  const RULES = [
    [/^共 (\d+) 個相簿、(\d+) 張相片$/, (m) => `${m[1]} albums · ${m[2]} photos`],
    [/^共 (\d+) 個相簿$/, (m) => `${m[1]} albums`],
    [/^(\d+) 張相片$/, (m) => `${m[1]} photos`],
    [/^共 (\d+) 張照片$/, (m) => `${m[1]} photos`],
    [/^符合 (\d+) \/ (\d+) 張照片$/, (m) => `${m[1]} / ${m[2]} photos match`],
    [/^(\d+) 秒$/, (m) => `${m[1]} s`],
    [/^最近上傳的 (\d+) 張相片 ›$/, (m) => `${m[1]} most recently uploaded ›`],
    [/^隨機挑 (\d+) 張，重新整理會換一批$/, (m) => `${m[1]} random photos — refresh for a new batch`],
    [/^(\d+) 年 (\d+) 月 (\d+) 日・(\d+) 張相片\s*$/, (m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")} · ${m[4]} photos`],
    [/^(\d+) 年 (\d+) 月$/, (m) => `${m[1]}-${m[2].padStart(2, "0")}`],
    [/^共 (\d+) 張相片・第 (\d+)\/(\d+) 個月$/, (m) => `${m[1]} photos · month ${m[2]}/${m[3]}`],
    [/^找到 (\d+) 張符合「(.*)」的相片，全部顯示 ›$/, (m) => `Found ${m[1]} photos matching “${m[2]}” — show all ›`],
    [/^索引建立中… (\d+)\/(\d+)$/, (m) => `Building index… ${m[1]}/${m[2]}`],
    [/^索引完成（共 (\d+) 個相簿）$/, (m) => `Index ready (${m[1]} albums)`],
    [/^拍攝於 (.*)$/, (m) => `Taken on ${m[1]}`],
    [/^載入失敗：(.*)$/, (m) => `Failed to load: ${m[1]}`],
    [/^無法載入相簿：(.*)$/, (m) => `Could not load albums: ${m[1]}`],
    [/^無法載入照片：(.*)$/, (m) => `Could not load photos: ${m[1]}`],
  ];

  // 相簿名稱「中文｜English」→ 英文模式只顯示 English；多個名稱用「、」相接
  function pickEnglishTitle(s) {
    return s.split("、").map((seg) => (seg.includes("｜") ? seg.split("｜").pop().trim() : seg)).join(", ");
  }

  function tr(s) {
    if (lang !== "en" || !s) return s;
    const lead = s.match(/^\s*/)[0];
    const tail = s.match(/\s*$/)[0];
    const core = s.trim();
    if (!core || !CJK.test(core)) return s;
    if (DICT[core]) return lead + DICT[core] + tail;
    for (const [re, fn] of RULES) {
      const m = core.match(re);
      if (m) return lead + fn(m) + tail;
    }
    if (core.includes("｜")) return lead + pickEnglishTitle(core) + tail;
    // 相片說明常是「中文說明.  English」：只留英文那段
    const bi = core.match(/\s{2,}([A-Za-z][\s\S]*)$/);
    if (bi) return lead + bi[1] + tail;
    return s;
  }
  window.t = tr;

  const skip = (el) => !el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.nodeName) || el.closest("[data-no-i18n]");

  function syncText(node) {
    if (skip(node.parentNode)) return;
    if (lang === "en") {
      if (node.__tr === undefined || node.data !== node.__tr) {
        if (!CJK.test(node.data)) return;
        node.__zh = node.data;
      }
      const out = tr(node.__zh);
      node.__tr = out;
      if (node.data !== out) node.data = out;
    } else if (node.__tr !== undefined && node.data === node.__tr) {
      node.data = node.__zh;
      node.__tr = undefined;
    }
  }

  const ATTRS = ["placeholder", "title", "alt"];
  function syncAttr(el, name) {
    if (skip(el) || !el.hasAttribute(name)) return;
    const store = el.__i18n || (el.__i18n = {});
    const cur = el.getAttribute(name);
    const rec = store[name];
    if (lang === "en") {
      let zh;
      if (rec && cur === rec.tr) zh = rec.zh;
      else { if (!CJK.test(cur)) return; zh = cur; }
      const out = tr(zh);
      store[name] = { zh, tr: out };
      if (cur !== out) el.setAttribute(name, out);
    } else if (rec && cur === rec.tr) {
      el.setAttribute(name, rec.zh);
      store[name] = undefined;
    }
  }

  function syncTree(root) {
    if (root.nodeType === 3) { syncText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    const base = root.nodeType === 9 ? root.documentElement : root;
    const w = document.createTreeWalker(base, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n = base;
    do {
      if (n.nodeType === 3) syncText(n);
      else if (n.nodeType === 1) ATTRS.forEach((a) => syncAttr(n, a));
    } while ((n = w.nextNode()));
  }

  function updateButton() {
    const btn = document.getElementById("lang-btn");
    if (!btn) return;
    btn.textContent = lang === "en" ? "中" : "EN";
    btn.title = lang === "en" ? "切換成中文" : "Switch to English";
    btn.setAttribute("data-no-i18n", "");
  }

  function setLang(next) {
    lang = next;
    try { localStorage.setItem("lang", lang); } catch {}
    document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
    syncTree(document);
    updateButton();
  }

  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach((n) => syncTree(n));
      else if (m.type === "characterData") syncText(m.target);
      else if (m.type === "attributes") syncAttr(m.target, m.attributeName);
    }
  });

  function init() {
    const btn = document.getElementById("lang-btn");
    if (btn) btn.addEventListener("click", () => setLang(lang === "en" ? "zh" : "en"));
    document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
    syncTree(document);
    updateButton();
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
