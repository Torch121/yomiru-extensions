// ==YomiruExtension==
// @name         Kagane
// @version      v0.0.1
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://raw.githubusercontent.com/keiyoushi/extensions-source/main/src/all/kagane/res/mipmap-xxhdpi/ic_launcher.png
// @package      kagane.to
// @type         manga
// @webSite      https://kagane.to/
// @nsfw         false
// @description  Read Manga, Manhwa, and Webtoons online with high-quality images and official releases on Kagane.
// ==/YomiruExtension==

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

function buildChapterName(book) {
  if (!book) return "Chapter 1";
  const title = (book.title || "").trim();
  const chNo =
    book.chapter_no !== null && book.chapter_no !== undefined
      ? String(book.chapter_no).trim()
      : "";
  const volNo =
    book.volume_no !== null && book.volume_no !== undefined
      ? String(book.volume_no).trim()
      : "";

  if (
    title.toLowerCase().startsWith("chapter") ||
    title.toLowerCase().startsWith("ch.") ||
    title.toLowerCase().startsWith("ep.")
  ) {
    return title;
  }
  if (chNo) {
    const volPrefix = volNo ? `Vol.${volNo} ` : "";
    return `${volPrefix}Chapter ${chNo}${title ? ` - ${title}` : ""}`;
  }
  if (title) {
    return title;
  }
  if (book.sort_no !== undefined && book.sort_no !== null) {
    return `Chapter ${book.sort_no}`;
  }
  return "Chapter 1";
}

export default class extends Extension {
  constructor() {
    super();
    this.integrityToken = null;
    this.integrityExp = 0;
  }

  async req(url, options = {}) {
    const baseUrl = (await this.getSetting("kagane_url")) || "https://kagane.to";
    const customCookie = (await this.getSetting("kagane_cookie")) || "";
    const customUa = (await this.getSetting("kagane_user_agent")) || "";

    const fullUrl = url.startsWith("http")
      ? url
      : `${baseUrl.replace(/\/+$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;

    const headers = {
      "User-Agent":
        customUa ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": `${baseUrl.replace(/\/+$/, "")}/`,
      "Origin": baseUrl.replace(/\/+$/, ""),
      "Accept": "application/json, text/plain, */*",
      ...(customCookie ? { Cookie: customCookie } : {}),
      ...(options.headers || {}),
    };

    const res = await this.request(fullUrl, {
      ...options,
      headers,
    });

    if (
      typeof res === "string" &&
      (res.includes("Just a moment...") || res.includes("cf-mitigated") || res.includes("challenge-platform"))
    ) {
      console.warn(
        "[Kagane] Cloudflare verification required. Open extension settings and tap 'Bypass Cloudflare' or enter your cf_clearance cookie."
      );
    }

    return res;
  }

  async getApiUrl() {
    const apiSetting = await this.getSetting("kagane_api_url");
    if (apiSetting && apiSetting.trim()) {
      return apiSetting.trim().replace(/\/+$/, "");
    }
    const baseUrl = (await this.getSetting("kagane_url")) || "https://kagane.to";
    return `${baseUrl.replace(/\/+$/, "")}/api/v2`;
  }

  async getLangs() {
    const lang = (await this.getSetting("kagane_lang")) || "all";
    if (lang === "all" || !lang) {
      return [
        "en",
        "ja",
        "ko",
        "zh-Hans",
        "zh-Hant",
        "es",
        "es-419",
        "fr",
        "de",
        "pt",
        "pt-BR",
        "ru",
        "it",
        "id",
        "vi",
        "th",
        "pl",
        "hi",
        "ar",
      ];
    }
    if (lang === "zh") {
      return ["zh-Hans", "zh-Hant"];
    }
    return [lang];
  }

  async load() {
    await this.registerSetting({
      title: "Kagane Base URL",
      key: "kagane_url",
      type: "input",
      description: "Homepage URL for Kagane",
      defaultValue: "https://kagane.to",
    });

    await this.registerSetting({
      title: "Kagane API URL",
      key: "kagane_api_url",
      type: "input",
      description: "API URL for Kagane",
      defaultValue: "https://kagane.to/api/v2",
    });

    await this.registerSetting({
      title: "Content Language",
      key: "kagane_lang",
      type: "input",
      description: "Language filter ('all', 'en', 'ja', 'es', 'fr', 'pt', etc.)",
      defaultValue: "all",
    });

    await this.registerSetting({
      title: "Data Saver",
      key: "kagane_data_saver",
      type: "toggle",
      description: "Use compressed images to save network bandwidth",
      defaultValue: "false",
    });

    await this.registerSetting({
      title: "Sort Order of Chapters",
      key: "kagane_reverse_order",
      type: "toggle",
      description: "Sort chapters in ascending numerical order (Chapter 1, 2, 3...)",
      defaultValue: "true",
    });

    await this.registerSetting({
      title: "Custom Cookie",
      key: "kagane_cookie",
      type: "input",
      description: "Custom Cookie string (e.g., cf_clearance=... for Cloudflare)",
      defaultValue: "",
    });

    await this.registerSetting({
      title: "Custom User-Agent",
      key: "kagane_user_agent",
      type: "input",
      description: "User-Agent matching your Cloudflare clearance cookie",
      defaultValue: "",
    });
  }

  async getIntegrityToken() {
    if (this.integrityToken && this.integrityExp && Date.now() < this.integrityExp) {
      return this.integrityToken;
    }

    // 1. Visit homepage to establish session / cookies in runtime cookie jar
    try {
      await this.req("/");
    } catch (_) {}

    // 2. Request integrity token from /api/integrity
    try {
      const res = await this.req("/api/integrity", {
        method: "post",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      const data = parseData(res);
      if (data && data.token) {
        this.integrityToken = data.token;
        this.integrityExp = (data.exp ? data.exp * 1000 : Date.now() + 3600000) - 30000;
        return this.integrityToken;
      }
    } catch (e) {
      console.warn("Failed to retrieve integrity token:", e);
    }

    return "";
  }

  async fetchChallenge(chapterId, isDataSaver) {
    const apiUrl = await this.getApiUrl();
    const integrityToken = await this.getIntegrityToken();

    const headers = {
      "Content-Type": "application/json",
    };
    if (integrityToken) {
      headers["x-integrity-token"] = integrityToken;
    }

    try {
      const res = await this.req(`${apiUrl}/books/${chapterId}?is_datasaver=${isDataSaver}`, {
        method: "post",
        headers,
        body: "{}",
      });
      return parseData(res);
    } catch (e) {
      console.warn(`Challenge request failed for ${chapterId}:`, e);
      return null;
    }
  }

  async latest(page) {
    const apiUrl = await this.getApiUrl();
    const langs = await this.getLangs();
    const pageIndex = Math.max(0, (page || 1) - 1);

    const body = {
      source_type: ["Official", "Unofficial", "Mixed"],
      content_lang: langs,
    };

    const res = await this.req(
      `${apiUrl}/search/series?page=${pageIndex}&size=35&sort=updated_at,desc`,
      {
        method: "post",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const parsed = parseData(res);
    const content = (parsed && parsed.content) || [];

    return content.map((book) => {
      const seriesId = book.series_id || book.id;
      const coverId = book.cover_image_id || book.coverImage;
      const cover = coverId ? `${apiUrl}/image/${coverId}` : "";
      return {
        title: (book.title || "Unknown Title").trim(),
        url: `/series/${seriesId}`,
        cover,
      };
    });
  }

  async search(kw, page) {
    const apiUrl = await this.getApiUrl();
    const langs = await this.getLangs();
    const pageIndex = Math.max(0, (page || 1) - 1);

    const body = {
      title: kw,
      source_type: ["Official", "Unofficial", "Mixed"],
      content_lang: langs,
    };

    const res = await this.req(`${apiUrl}/search/series?page=${pageIndex}&size=35`, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const parsed = parseData(res);
    const content = (parsed && parsed.content) || [];

    return content.map((book) => {
      const seriesId = book.series_id || book.id;
      const coverId = book.cover_image_id || book.coverImage;
      const cover = coverId ? `${apiUrl}/image/${coverId}` : "";
      return {
        title: (book.title || "Unknown Title").trim(),
        url: `/series/${seriesId}`,
        cover,
      };
    });
  }

  async detail(url) {
    const apiUrl = await this.getApiUrl();
    let seriesId = url;
    const match = url.match(/(?:series\/|^)([a-zA-Z0-9_-]+)/);
    if (match) {
      seriesId = match[1];
    }

    const res = await this.req(`${apiUrl}/series/${seriesId}`);
    const details = parseData(res) || {};

    const title = (details.title || "Unknown Title").trim();

    // Cover extraction
    let cover = "";
    if (
      details.series_covers &&
      details.series_covers.length > 0 &&
      details.series_covers[0].image_id
    ) {
      cover = `${apiUrl}/image/${details.series_covers[0].image_id}`;
    } else if (details.cover_image_id) {
      cover = `${apiUrl}/image/${details.cover_image_id}`;
    }

    // Description extraction
    let desc = (details.description || "").trim();
    desc = desc
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (details.edition_info && details.edition_info.trim()) {
      desc = `Edition: ${details.edition_info.trim()}\n\n${desc}`;
    }

    if (
      Array.isArray(details.series_alternate_titles) &&
      details.series_alternate_titles.length > 0
    ) {
      const altTitles = details.series_alternate_titles
        .map((t) => (typeof t === "object" ? t.title : t))
        .filter(Boolean)
        .join("\n• ");
      if (altTitles) {
        desc += `\n\nAssociated Name(s):\n• ${altTitles}`;
      }
    }

    if (Array.isArray(details.series_staff) && details.series_staff.length > 0) {
      const staffList = details.series_staff
        .map((s) => `${s.name} (${s.role || "Staff"})`)
        .join(", ");
      if (staffList) {
        desc += `\n\nStaff: ${staffList}`;
      }
    }

    // Chapters parsing
    const rawBooks = Array.isArray(details.series_books) ? details.series_books : [];

    const groups = {};
    for (let idx = 0; idx < rawBooks.length; idx++) {
      const book = rawBooks[idx];
      const scanlator =
        Array.isArray(book.groups) && book.groups.length > 0 && book.groups[0].title
          ? book.groups.map((g) => g.title).join(", ")
          : "Default";

      if (!groups[scanlator]) {
        groups[scanlator] = [];
      }

      const chapterName = buildChapterName(book);
      const chId = book.book_id || book.id || `${idx}`;
      const chUrl = `/series/${seriesId}/reader/${chId}`;

      let chNum = 0;
      if (book.chapter_no !== undefined && book.chapter_no !== null) {
        const parsedNo = parseFloat(book.chapter_no);
        if (!isNaN(parsedNo)) chNum = parsedNo;
      } else if (book.sort_no !== undefined && book.sort_no !== null) {
        const parsedSort = parseFloat(book.sort_no);
        if (!isNaN(parsedSort)) chNum = parsedSort;
      }

      groups[scanlator].push({
        _num: chNum,
        _idx: idx,
        name: chapterName,
        url: chUrl,
      });
    }

    const ascending = (await this.getSetting("kagane_reverse_order")) !== "false";

    const groupKeys = Object.keys(groups);
    for (const key of groupKeys) {
      groups[key].sort((a, b) => {
        if (a._num !== b._num) {
          return ascending ? a._num - b._num : b._num - a._num;
        }
        return ascending ? a._idx - b._idx : b._idx - a._idx;
      });
    }

    let episodes = [];
    if (groupKeys.length === 1 && groupKeys[0] === "Default") {
      episodes = [
        {
          title: "Chapters",
          urls: groups["Default"].map((c) => ({ name: c.name, url: c.url })),
        },
      ];
    } else {
      episodes = groupKeys.map((key) => ({
        title: key === "Default" ? "Chapters" : key,
        urls: groups[key].map((c) => ({ name: c.name, url: c.url })),
      }));
    }

    if (episodes.length === 0) {
      episodes = [{ title: "Chapters", urls: [] }];
    }

    return {
      title: title || "Unknown Title",
      cover,
      desc: desc || "N/A",
      episodes,
    };
  }

  async watch(url) {
    const baseUrl = (await this.getSetting("kagane_url")) || "https://kagane.to";
    const isDataSaver = (await this.getSetting("kagane_data_saver")) === "true";
    const customCookie = (await this.getSetting("kagane_cookie")) || "";
    const customUa = (await this.getSetting("kagane_user_agent")) || "";

    // Extract chapterId from URL
    let chapterId = url;
    const segments = url.split("/").filter(Boolean);
    if (segments.length > 0) {
      chapterId = segments[segments.length - 1];
    }

    let challenge = await this.fetchChallenge(chapterId, isDataSaver);

    // If challenge failed or token invalid, retry once
    if (!challenge || !challenge.access_token) {
      this.integrityToken = null;
      this.integrityExp = 0;
      challenge = await this.fetchChallenge(chapterId, isDataSaver);
    }

    if (!challenge) {
      throw new Error(`Failed to load chapter pages from Kagane for chapter: ${chapterId}`);
    }

    const cacheUrl = (challenge.cache_url || baseUrl).replace(/\/+$/, "");
    const accessToken = challenge.access_token || "";
    const rawPages = (challenge.manifest && challenge.manifest.pages) || challenge.pages || [];

    const defaultExt = isDataSaver ? "webp" : "jpg";
    const pathPrefix = isDataSaver ? "datasaver/" : "";

    const imageUrls = rawPages.map((page) => {
      const ext = page.ext || defaultExt;
      const pageId = page.page_id || page.pageUuid || page.id || `${page.page_no}`;
      return `${cacheUrl}/api/v2/books/page/${pathPrefix}${chapterId}/${pageId}.${ext}?token=${encodeURIComponent(accessToken)}`;
    });

    return {
      urls: imageUrls,
      headers: {
        Referer: `${baseUrl.replace(/\/+$/, "")}/`,
        Origin: baseUrl.replace(/\/+$/, ""),
        "User-Agent":
          customUa ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...(customCookie ? { Cookie: customCookie } : {}),
      },
    };
  }
}
