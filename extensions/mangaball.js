// ==YomiruExtension==
// @name         MangaBall
// @version      v0.0.3
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://mangaball.com/images/favicon.png
// @package      mangaball.com
// @type         manga
// @webSite      https://mangaball.com/
// @nsfw         false
// @description  Read free Manga, Manhwa, Manhua, and Comics online with fastest updates and high-quality images on MangaBall.
// ==/YomiruExtension==

const BASE_DOMAIN_STORAGE_COVER = "https://bulbasaur.poke-black-and-white.net/covers/";

const LANG_MAP = {
  en: "English",
  vi: "Vietnamese",
  ru: "Russian",
  id: "Indonesian",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  "pt-br": "Portuguese (BR)",
  de: "German",
  it: "Italian",
  ja: "Japanese",
  jp: "Japanese",
  ko: "Korean",
  kr: "Korean",
  zh: "Chinese",
  cn: "Chinese",
  ar: "Arabic",
  th: "Thai",
  tr: "Turkish",
  pl: "Polish",
};

function resolveCover(item) {
  if (!item) return "";
  const img = item.image || item.cover;
  if (!img) return "";
  if (typeof img === "string") {
    if (img.startsWith("http")) return img;
    return `${BASE_DOMAIN_STORAGE_COVER}${img.replace(/^\/+/, "")}`;
  }
  if (img.cdn_mangadex && typeof img.cdn_mangadex === "string" && img.cdn_mangadex.startsWith("http")) {
    return img.cdn_mangadex;
  }
  if (img.cover && img.cover.path) {
    return `${BASE_DOMAIN_STORAGE_COVER}${img.cover.path}`;
  }
  if (img.cdn_mangaupdates && typeof img.cdn_mangaupdates === "string" && img.cdn_mangaupdates.startsWith("http")) {
    return img.cdn_mangaupdates;
  }
  if (img.cdn_mangaupdate && typeof img.cdn_mangaupdate === "string" && img.cdn_mangaupdate.startsWith("http")) {
    return img.cdn_mangaupdate;
  }
  if (img.file && typeof img.file === "string" && img.file.startsWith("http")) {
    return img.file;
  }
  return "";
}

function parseData(res) {
  if (typeof res === "string") {
    try {
      return JSON.parse(res);
    } catch (_) {
      return null;
    }
  }
  return res;
}

export default class extends Extension {
  async req(url, options = {}) {
    const apiBase = (await this.getSetting("mangaball_api")) || "https://api.mangaball.com/api/v1";
    const fullUrl = url.startsWith("http")
      ? url
      : `${apiBase.replace(/\/+$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;

    return this.request(fullUrl, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://mangaball.com/",
        Accept: "application/json, text/plain, */*",
        Origin: "https://mangaball.com",
        ...(options.headers || {}),
      },
    });
  }

  async load() {
    await this.registerSetting({
      title: "MangaBall API URL",
      key: "mangaball_api",
      type: "input",
      description: "Base API URL for MangaBall",
      defaultValue: "https://api.mangaball.com/api/v1",
    });

    await this.registerSetting({
      title: "Sort Order of Chapters",
      key: "reverseChaptersOrderMangaBall",
      type: "toggle",
      description: "Sort chapters in ascending numerical order (Chapter 1, 2, 3...)",
      defaultValue: "true",
    });
  }

  async popular(page) {
    const p = page || 1;
    const res = await this.req(`/title/search-advanced?sort=views&page=${p}&limit=24`);
    const parsed = parseData(res);
    const items = (parsed && parsed.data) || [];
    if (items.length > 0) {
      return items.map((item) => ({
        title: (item.name || "Unknown Title").trim(),
        url: `/title-detail/${item.id || item._id || item.slug}`,
        cover: resolveCover(item),
      }));
    }
    return this.latest(page);
  }

  async latest(page) {
    const res = await this.req(`/title/recently-updated?page=${page}&limit=24`);
    const parsed = parseData(res);
    const items = (parsed && parsed.data) || [];
    return items.map((item) => ({
      title: (item.name || "Unknown Title").trim(),
      url: `/title-detail/${item.id || item._id || item.slug}`,
      cover: resolveCover(item),
    }));
  }

  async search(kw, page) {
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      if (jp && jp.trim()) {
        const jpResults = await this._rawSearch(jp.trim(), page);
        if (jpResults && jpResults.length > 0) {
          return jpResults;
        }
      }
      return this._rawSearch(en || jp || "", page);
    }
    return this._rawSearch(kw, page);
  }

  async _rawSearch(kw, page) {
    const res = await this.req(`/title/search-advanced?keyword=${encodeURIComponent(kw || '')}&page=${page}&limit=20`);
    const parsed = parseData(res);
    const items = (parsed && parsed.data) || [];
    return items.map((item) => ({
      title: (item.name || "Unknown Title").trim(),
      url: `/title-detail/${item.id || item._id || item.slug}`,
      cover: resolveCover(item),
    }));
  }

  async detail(url) {
    let titleId = url;
    const match = url.match(/(?:title-detail\/|^)([a-f0-9]{24})/i);
    if (match) {
      titleId = match[1];
    } else {
      const slugMatch = url.match(/title-detail\/([^\/?#]+)/i);
      if (slugMatch) titleId = slugMatch[1];
    }

    // 1. Fetch title info
    const titleRes = await this.req(`/title/detail/${titleId}`);
    const titleData = (parseData(titleRes) || {}).data || {};
    const actualId = titleData.id || titleData._id || titleId;

    // 2. Fetch chapters list
    const chaptersRes = await this.req(`/title/chapter-listing?title_id=${actualId}&limit=1000`);
    const chaptersList = (parseData(chaptersRes) || {}).data || [];

    // Group chapters by Language AND Scanlation Group to prevent duplicate interleaved releases
    const groups = {};
    for (let idx = 0; idx < chaptersList.length; idx++) {
      const ch = chaptersList[idx];
      const langKey = (ch.lang || "en").toLowerCase();
      const groupName = (ch.group_name || (ch.group && ch.group.name) || "Default").trim();
      const groupKey = `${langKey}___${groupName}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          langKey,
          groupName,
          chapters: [],
        };
      }

      // Numerical chapter parsing
      let chNum = null;
      if (ch.chapter_number !== undefined && ch.chapter_number !== null && ch.chapter_number !== "") {
        const n = parseFloat(ch.chapter_number);
        if (!isNaN(n)) chNum = n;
      }
      if (chNum === null && ch.number !== undefined && ch.number !== null && ch.number !== "") {
        const n = parseFloat(ch.number);
        if (!isNaN(n)) chNum = n;
      }
      if (chNum === null && ch.name) {
        const m = ch.name.match(/(?:chapter|ch\.?|ep\.?)\s*(\d+(?:\.\d+)?)/i);
        if (m) {
          chNum = parseFloat(m[1]);
        } else {
          const numM = ch.name.match(/(\d+(?:\.\d+)?)/);
          if (numM) chNum = parseFloat(numM[1]);
        }
      }
      if (chNum === null) chNum = 0;

      const rawName = (ch.name || "").trim();
      let name;
      if (
        rawName.toLowerCase().startsWith("chapter") ||
        rawName.toLowerCase().startsWith("ch.") ||
        rawName.toLowerCase().startsWith("capitulo")
      ) {
        name = rawName;
      } else if (chNum > 0) {
        name = `Chapter ${chNum}${rawName ? ` - ${rawName}` : ""}`;
      } else {
        name = rawName
          ? (rawName.toLowerCase().startsWith("vol") ? `Chapter 0 - ${rawName}` : rawName)
          : "Chapter 0";
      }

      const chUrl = `/chapter-detail/${ch.id || ch._id}?chapter=${encodeURIComponent(chNum)}`;
      groups[groupKey].chapters.push({
        _num: chNum,
        _idx: idx,
        name,
        url: chUrl,
      });
    }

    const ascending = (await this.getSetting("reverseChaptersOrderMangaBall")) !== "false";

    // Sort chapters within each group numerically
    for (const k of Object.keys(groups)) {
      groups[k].chapters.sort((a, b) => {
        if (a._num !== b._num) {
          return ascending ? a._num - b._num : b._num - a._num;
        }
        return ascending ? a._idx - b._idx : b._idx - a._idx;
      });
    }

    // Sort groups: English first, then by language; within language, group with highest chapter count first
    const groupKeys = Object.keys(groups);
    groupKeys.sort((a, b) => {
      const ga = groups[a];
      const gb = groups[b];
      if (ga.langKey !== gb.langKey) {
        if (ga.langKey === "en") return -1;
        if (gb.langKey === "en") return 1;
        return ga.langKey.localeCompare(gb.langKey);
      }
      return gb.chapters.length - ga.chapters.length;
    });

    const episodes = groupKeys.map((k) => {
      const g = groups[k];
      const langTitle = LANG_MAP[g.langKey] || g.langKey.toUpperCase();
      return {
        title: `${langTitle} - ${g.groupName}`,
        urls: g.chapters.map((c) => ({
          name: c.name,
          url: c.url,
        })),
      };
    });

    const desc = Array.isArray(titleData.description)
      ? titleData.description.join("\n\n")
      : (titleData.description || "N/A");

    return {
      title: titleData.name || "Unknown Title",
      cover: resolveCover(titleData),
      desc: desc.trim() || "N/A",
      episodes: episodes.length > 0 ? episodes : [{ title: "Chapters", urls: [] }],
    };
  }

  async watch(url) {
    let chapterId = url;
    const match = url.match(/(?:chapter-detail\/|^)([a-f0-9]{24})/i);
    if (match) {
      chapterId = match[1];
    }

    let images = [];

    // 1. Try direct API
    try {
      const res = await this.req(`/chapter/detail?chapter_id=${chapterId}`);
      const data = parseData(res);
      if (data && data.data && data.data.chapter && Array.isArray(data.data.chapter.pages)) {
        images = data.data.chapter.pages;
      }
    } catch (_) {}

    // 2. HTML Fallback scraping if API fails
    if (!images || images.length === 0) {
      try {
        const html = await this.request(`https://mangaball.com/chapter-detail/${chapterId}`, {
          headers: {
            Referer: "https://mangaball.com/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        if (typeof html === "string") {
          const pagesMatch = html.match(/"pages":\s*\[(.*?)\]/);
          if (pagesMatch) {
            const imgMatches = pagesMatch[1].match(/https?:\/\/[^"'\\]+/g);
            if (imgMatches) images = imgMatches;
          }
        }
      } catch (_) {}
    }

    return {
      urls: images || [],
      headers: {
        Referer: "https://mangaball.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    };
  }
}
