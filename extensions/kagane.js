// ==YomiruExtension==
// @name         Kagane
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://kagane.si/favicon.ico
// @package      si.kagane
// @type         manga
// @webSite      https://kagane.si
// @nsfw         false
// @description  Read manga, manhwa, and manhua with high-speed reader pages from Kagane.si
// ==/YomiruExtension==

export default class extends Extension {
  constructor() {
    super();
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }

  get defaultBaseUrl() {
    return "https://kagane.si";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("kagane_url");
    return custom && custom.trim() ? custom.trim().replace(/\/+$/, "") : this.defaultBaseUrl;
  }

  async req(pathOrUrl, options = {}) {
    const base = await this.getBaseUrl();
    const fullUrl = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    return this.request(fullUrl, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: `${base}/`,
        ...(options.headers || {}),
      },
    });
  }

  parseJson(res) {
    if (!res) return null;
    if (typeof res === "object") {
      if (res.body) {
        return typeof res.body === "string" ? this.parseJson(res.body) : res.body;
      }
      return res;
    }
    if (typeof res === "string") {
      try {
        return JSON.parse(res);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async load() {
    await this.registerSetting({
      title: "Kagane URL",
      key: "kagane_url",
      type: "input",
      description: "Base mirror URL for Kagane.si",
      defaultValue: "https://kagane.si",
    });
  }

  async _getIntegrityToken() {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry - 30000) {
      return this.cachedToken;
    }

    const res = await this.req("/api/integrity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({}),
    });

    const parsed = this.parseJson(res);
    if (!parsed || !parsed.token) {
      throw new Error("Failed to obtain integrity token from /api/integrity");
    }

    this.cachedToken = parsed.token;
    this.tokenExpiry = parsed.exp ? parsed.exp * 1000 : now + 5 * 60 * 1000;
    return this.cachedToken;
  }

  _formatManga(it, base) {
    if (!it) return null;
    const title = it.title || it.slug || "Unknown Title";
    let cover = "";
    if (it.cover_image_id) {
      cover = `${base}/api/v2/image/${encodeURIComponent(it.cover_image_id)}/compressed`;
    } else if (it.thumbnail) {
      cover = it.thumbnail.startsWith("http") ? it.thumbnail : `${base}${it.thumbnail}`;
    }

    return {
      title,
      cover,
      url: it.series_id || it.slug,
    };
  }

  async popular(page) {
    const base = await this.getBaseUrl();
    const p = Math.max(1, page || 1);
    const res = await this.req(`/api/v2/search/series?size=20&page=${p}&sort=avg_views_week,desc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({}),
    });

    const data = this.parseJson(res);
    const items = data?.content || [];
    return items.map((it) => this._formatManga(it, base)).filter(Boolean);
  }

  async latest(page) {
    const base = await this.getBaseUrl();
    const p = Math.max(1, page || 1);
    const res = await this.req(`/api/v2/search/series?size=20&page=${p}&sort=updated_at,desc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({}),
    });

    const data = this.parseJson(res);
    const items = data?.content || [];
    return items.map((it) => this._formatManga(it, base)).filter(Boolean);
  }

  async search(kw, page, filter) {
    const base = await this.getBaseUrl();
    const p = Math.max(1, page || 1);
    let query = "";

    if (typeof kw === "object" && kw !== null) {
      query = kw.englishTitle || kw.english || kw.japaneseTitle || kw.nativeTitle || kw.query || "";
    } else {
      query = String(kw || "").trim();
    }

    if (!query) {
      return this.popular(page);
    }

    const res = await this.req(`/api/v2/search/series?size=20&page=${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ title: query }),
    });

    const data = this.parseJson(res);
    const items = data?.content || [];
    return items.map((it) => this._formatManga(it, base)).filter(Boolean);
  }

  async detail(seriesIdOrUrl) {
    const base = await this.getBaseUrl();
    let cleanId = seriesIdOrUrl;
    if (typeof cleanId === "string") {
      if (cleanId.includes("/series/")) {
        cleanId = cleanId.split("/series/")[1].split("/")[0].split("?")[0];
      } else if (cleanId.startsWith("http")) {
        cleanId = cleanId.split("/").pop().split("?")[0];
      }
    }

    const seriesRes = await this.req(`/api/v2/series/${encodeURIComponent(cleanId)}`);
    const series = this.parseJson(seriesRes);
    if (!series || !series.series_id) {
      throw new Error(`Manga series not found: ${cleanId}`);
    }

    let books = [];
    try {
      const booksRes = await this.req(`/api/v2/series/${encodeURIComponent(cleanId)}/books`);
      const parsedBooks = this.parseJson(booksRes);
      books = Array.isArray(parsedBooks?.items) ? parsedBooks.items : [];
    } catch (_) {}

    const title = series.title || series.slug || cleanId;
    let cover = "";
    if (series.cover_image_id) {
      cover = `${base}/api/v2/image/${encodeURIComponent(series.cover_image_id)}/compressed`;
    } else if (series.thumbnail) {
      cover = series.thumbnail.startsWith("http") ? series.thumbnail : `${base}${series.thumbnail}`;
    }
    const desc = (series.description || "").trim();

    const formattedChapters = books.map((b) => {
      const chapNum = b.chapter_number ?? "";
      const chapTitle = b.title || "";
      const name = chapTitle
        ? `Ch ${chapNum}: ${chapTitle}`
        : chapNum
        ? `Chapter ${chapNum}`
        : "Chapter";
      return {
        name: name.trim(),
        url: b.book_id || b.id,
      };
    });

    if (formattedChapters.length === 0) {
      formattedChapters.push({
        name: "Chapter 1",
        url: cleanId,
      });
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "Chapters",
          urls: formattedChapters,
        },
      ],
    };
  }

  async watch(bookIdOrUrl) {
    const base = await this.getBaseUrl();
    let bookId = bookIdOrUrl;
    if (typeof bookId === "string" && bookId.includes("/")) {
      const parts = bookId.split("/");
      bookId = parts[parts.length - 1].split("?")[0];
    }

    const token = await this._getIntegrityToken();

    const readRes = await this.req(`/api/v2/books/${encodeURIComponent(bookId)}?intent=Read`, {
      method: "POST",
      headers: {
        "x-integrity-token": token,
        Referer: `${base}/`,
      },
      data: JSON.stringify({}),
    });

    const parsed = this.parseJson(readRes);
    if (!parsed || !parsed.manifest || !Array.isArray(parsed.manifest.pages)) {
      throw new Error(`Failed to load chapter pages for book ${bookId}`);
    }

    const cacheUrl = parsed.cache_url || "https://kstatic.to";
    const accessToken = parsed.access_token || "";
    const pages = parsed.manifest.pages;

    const imageUrls = pages.map((page) => {
      const pageId = page.page_id;
      return `${cacheUrl}/api/v2/books/page/${bookId}/${pageId}.jpg?token=${encodeURIComponent(accessToken)}`;
    });

    return {
      urls: imageUrls,
      headers: {
        Referer: `${base}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    };
  }
}
