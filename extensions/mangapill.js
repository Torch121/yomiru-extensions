// ==YomiruExtension==
// @name         MangaPill
// @version      v1.0.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://mangapill.com/static/favicon/apple-touch-icon.png
// @package      com.mangapill
// @type         manga
// @webSite      https://mangapill.com/
// @description  Read free high-quality manga online in English with fast updates and clean reader pages from MangaPill.
// ==/YomiruExtension==

export default class extends Extension {
  async getBaseUrl() {
    const custom = await this.getSetting("mangapill_url");
    if (custom && typeof custom === "string" && custom.trim()) {
      return custom.trim().replace(/\/+$/, "");
    }
    return "https://mangapill.com";
  }

  async req(path, options = {}) {
    const base = await this.getBaseUrl();
    const url = path.startsWith("http")
      ? path
      : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

    const headers = Object.assign(
      {
        "Miru-Url": base,
        Referer: `${base}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      options.headers || {}
    );

    return await this.request(url, Object.assign({}, options, { headers }));
  }

  async load() {
    await this.registerSetting({
      title: "MangaPill Homepage URL",
      key: "mangapill_url",
      type: "input",
      description: "Homepage URL for MangaPill (Default: https://mangapill.com)",
      defaultValue: "https://mangapill.com",
    });

    await this.registerSetting({
      title: "Reverse Chapter Order",
      key: "reverseChaptersOrderMangapill",
      type: "toggle",
      description: "Reverse chapter ordering in ascending order (Chapter 1 first)",
      defaultValue: "true",
    });
  }

  _decodeHtml(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#34;/g, '"')
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  _parseCards(html) {
    const list = [];
    if (!html || typeof html !== "string") return list;

    // Pattern 1: Search & browse grid card with figure and font-black title
    const cardRegex =
      /<a[^>]+href="(\/manga\/\d+\/[^"]+)"[^>]*>[\s\S]*?<figure[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"[\s\S]*?<\/figure>[\s\S]*?<div[^>]+class="[^"]*(?:font-black|line-clamp-2)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = cardRegex.exec(html)) !== null) {
      const url = m[1];
      const cover = m[2];
      const title = this._decodeHtml(m[3].replace(/<[^>]*>/g, ""));
      if (title && url) {
        list.push({ title, url, cover });
      }
    }

    if (list.length > 0) return list;

    // Pattern 2: Fallback card matcher
    const fallbackRegex =
      /<a[^>]+href="(\/manga\/\d+\/[^"]+)"[^>]*class="relative block"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"[\s\S]*?<\/a>[\s\S]*?<a[^>]+href="\1"[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/gi;
    while ((m = fallbackRegex.exec(html)) !== null) {
      const url = m[1];
      const cover = m[2];
      const title = this._decodeHtml(m[3].replace(/<[^>]*>/g, ""));
      if (title && url) {
        list.push({ title, url, cover });
      }
    }

    return list;
  }

  async popular(page) {
    const p = page || 1;
    const res = await this.req(`/search?type=manga&page=${p}`);
    const items = this._parseCards(res);
    return items.length > 0 ? items : this.latest(page);
  }

  async latest(page) {
    const p = page || 1;
    const res = await this.req(`/chapters?page=${p}`);
    const list = [];
    const seen = new Set();

    if (res && typeof res === "string") {
      const chapCardRegex =
        /<figure[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"[\s\S]*?<\/figure>[\s\S]*?<a[^>]+href="(\/manga\/\d+\/[^"]+)"[^>]*>[\s\S]*?<div[^>]+class="[^"]*(?:line-clamp-2|font-bold)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      let m;
      while ((m = chapCardRegex.exec(res)) !== null) {
        const cover = m[1];
        const url = m[2];
        const title = this._decodeHtml(m[3].replace(/<[^>]*>/g, ""));
        if (url && !seen.has(url)) {
          seen.add(url);
          list.push({ title, url, cover });
        }
      }
    }

    if (list.length > 0) return list;

    // Fallback: /mangas/new?page=...
    const fallbackRes = await this.req(`/mangas/new?page=${p}`);
    return this._parseCards(fallbackRes);
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
    const p = page || 1;
    const cleanKw = kw ? encodeURIComponent(String(kw).trim()) : "";
    const res = await this.req(`/search?q=${cleanKw}&page=${p}`);
    return this._parseCards(res);
  }

  async detail(url) {
    const res = await this.req(url);
    if (!res || typeof res !== "string") {
      throw new Error(`Failed to load manga details from ${url}`);
    }

    const h1Match = res.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = h1Match
      ? this._decodeHtml(h1Match[1].replace(/<[^>]*>/g, ""))
      : "Unknown Title";

    const coverMatch =
      res.match(
        /<div class="[^"]*w-60 h-80[^"]*"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/i
      ) ||
      res.match(
        /<img[^>]+(?:data-src|src)="([^"]+)"[^>]+alt="[^"]*"[^>]+loading="lazy"/i
      ) ||
      res.match(/<figure[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/i);
    const cover = coverMatch ? coverMatch[1] : "";

    const descMatch = res.match(
      /<p class="[^"]*text--secondary[^"]*">([\s\S]*?)<\/p>/i
    );
    const desc = descMatch
      ? this._decodeHtml(
          descMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")
        )
      : "N/A";

    // Parse chapters
    const chapRegex =
      /<a[^>]+href="(\/chapters\/\d+-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const chapters = [];
    let cm;
    while ((cm = chapRegex.exec(res)) !== null) {
      const chapUrl = cm[1];
      const chapName = this._decodeHtml(cm[2].replace(/<[^>]*>/g, ""));
      chapters.push({
        name: chapName || "Chapter",
        url: chapUrl,
      });
    }

    if ((await this.getSetting("reverseChaptersOrderMangapill")) === "true") {
      chapters.reverse();
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "Chapters",
          urls: chapters,
        },
      ],
    };
  }

  async watch(url) {
    const res = await this.req(url);
    if (!res || typeof res !== "string") {
      throw new Error(`Failed to load chapter reader from ${url}`);
    }

    const pageRegex =
      /<img[^>]+class="[^"]*js-page[^"]*"[^>]+(?:data-src|src)="([^"]+)"/gi;
    let images = [];
    let pm;
    while ((pm = pageRegex.exec(res)) !== null) {
      images.push(pm[1]);
    }

    if (images.length === 0) {
      // Fallback: any img in <chapter-page>
      const fallbackRegex =
        /<chapter-page[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/gi;
      while ((pm = fallbackRegex.exec(res)) !== null) {
        images.push(pm[1]);
      }
    }

    const base = await this.getBaseUrl();
    return {
      urls: images,
      headers: {
        Referer: `${base}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    };
  }
}
