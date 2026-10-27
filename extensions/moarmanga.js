// ==YomiruExtension==
// @name         MoarManga
// @version      v1.0.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://www.moarmanga.com/wp-content/uploads/mangagenz_avatar-150x150.jpg
// @package      com.moarmanga
// @type         manga
// @webSite      https://www.moarmanga.com/en/
// @description  Read free high-quality manga, manhwa, and webcomics online in English from MoarManga.
// ==/YomiruExtension==

export default class extends Extension {
  async getBaseUrl() {
    const custom = await this.getSetting("moarmanga_url");
    if (custom && typeof custom === "string" && custom.trim()) {
      return custom.trim().replace(/\/+$/, "");
    }
    return "https://www.moarmanga.com";
  }

  async req(path, options = {}) {
    const base = await this.getBaseUrl();
    const url = path.startsWith("http")
      ? path
      : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

    const headers = Object.assign(
      {
        "Miru-Url": base,
        Referer: `${base}/en/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      options.headers || {}
    );

    return await this.request(url, Object.assign({}, options, { headers }));
  }

  async load() {
    await this.registerSetting({
      title: "MoarManga URL",
      key: "moarmanga_url",
      type: "input",
      description: "Homepage URL for MoarManga (Default: https://www.moarmanga.com)",
      defaultValue: "https://www.moarmanga.com",
    });

    await this.registerSetting({
      title: "Reverse Chapter Order",
      key: "reverseChaptersOrderMoarManga",
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
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  async _getNonce() {
    try {
      const html = await this.req("/en/");
      const m = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i);
      if (m) return m[1];
    } catch (_) {}
    return "";
  }

  _parseCards(html) {
    if (!html || typeof html !== "string") return [];
    const results = [];
    const cardBlocks = html
      .split(/<div[^>]*class=["'][^"']*\bseries-card\b(?!-)[^"']*["']/i)
      .slice(1);

    for (const block of cardBlocks) {
      const linkMatch =
        block.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["']series-card-link["']/i) ||
        block.match(/<a[^>]+class=["']series-card-link["'][^>]+href=["']([^"']+)["']/i) ||
        block.match(/<a[^>]+href=["']([^"']+)["']/i);
      if (!linkMatch) continue;

      const url = linkMatch[1].trim();

      const titleMatch =
        block.match(/<h3[^>]*class=["']series-card-title["'][^>]*>([\s\S]*?)<\/h3>/i) ||
        block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const title = titleMatch
        ? this._decodeHtml(titleMatch[1].replace(/<[^>]+>/g, "").trim())
        : "Unknown";

      let cover = "";
      const thumbStyleMatch =
        block.match(/class=["'][^"']*series-card-thumb[^"']*["'][^>]*style=["'][^"']*url\(['"]?([^'"\)\s]+)['"]?\)/i) ||
        block.match(/style=["'][^"']*url\(['"]?([^'"\)\s]+)['"]?\)/i);
      if (thumbStyleMatch) {
        cover = thumbStyleMatch[1].trim();
      } else {
        const imgMatch = block.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
        if (imgMatch && !imgMatch[1].startsWith("data:")) {
          cover = imgMatch[1].trim();
        }
      }

      let update = "";
      const chapMatch = block.match(
        /<div[^>]*class=["']series-card-chapters["'][^>]*>([\s\S]*?)<\/div>/i
      );
      if (chapMatch) {
        const cleanCount = chapMatch[1].replace(/<[^>]+>/g, "").trim();
        if (cleanCount) update = `${cleanCount} Chapters`;
      }

      results.push({
        title,
        url,
        cover,
        update,
      });
    }

    return results;
  }

  async popular(page = 1) {
    if (page === 1) {
      const html = await this.req("/en/");
      return this._parseCards(html);
    }

    const nonce = await this._getNonce();
    try {
      const body = `action=mangaverse_load_more&nonce=${nonce}&page=${page}&type=series_grid&lang=en`;
      const res = await this.req("/wp-admin/admin-ajax.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body,
      });
      const data = typeof res === "string" ? JSON.parse(res) : res;
      if (data && data.success && data.data && data.data.html) {
        return this._parseCards(data.data.html);
      }
    } catch (_) {}

    return [];
  }

  async latest(page = 1) {
    if (page === 1) {
      const html = await this.req("/en/");
      return this._parseCards(html);
    }

    const nonce = await this._getNonce();
    try {
      const body = `action=mangaverse_load_more&nonce=${nonce}&page=${page}&type=home&lang=en`;
      const res = await this.req("/wp-admin/admin-ajax.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body,
      });
      const data = typeof res === "string" ? JSON.parse(res) : res;
      if (data && data.success && data.data && data.data.html) {
        return this._parseCards(data.data.html);
      }
    } catch (_) {}

    return [];
  }

  async search(kw, page = 1) {
    if (page === 1) {
      const html = await this.req(`/en/?s=${encodeURIComponent(kw)}&lang=en`);
      return this._parseCards(html);
    }

    const nonce = await this._getNonce();
    try {
      const body = `action=mangaverse_load_more&nonce=${nonce}&page=${page}&type=search&search_query=${encodeURIComponent(
        kw
      )}&lang=en`;
      const res = await this.req("/wp-admin/admin-ajax.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body,
      });
      const data = typeof res === "string" ? JSON.parse(res) : res;
      if (data && data.success && data.data && data.data.html) {
        return this._parseCards(data.data.html);
      }
    } catch (_) {}

    return [];
  }

  async detail(url) {
    const html = await this.req(url);
    if (!html || typeof html !== "string") {
      throw new Error(`Failed to load manga details from ${url}`);
    }

    // Title
    const titleMatch =
      html.match(/<h1[^>]*class=["'][^"']*series-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch
      ? this._decodeHtml(titleMatch[1].replace(/<[^>]+>/g, "").trim())
      : "Unknown";

    // Cover
    let cover = "";
    const thumbMatch =
      html.match(
        /<div[^>]*class=["'][^"']*series-header-thumbnail[^"']*["'][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=["']([^"']+)["']/i
      ) ||
      html.match(
        /<div[^>]*class=["'][^"']*series-thumbnail[^"']*["'][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=["']([^"']+)["']/i
      );
    if (thumbMatch && !thumbMatch[1].startsWith("data:")) {
      cover = thumbMatch[1].trim();
    }

    // Description / Synopsis
    let desc = "";
    const descMatch = html.match(
      /<div[^>]*class=["'][^"']*series-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    if (descMatch) {
      desc = this._decodeHtml(
        descMatch[1]
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );
    }

    // Category ID & total chapters
    let categoryId = null;
    let totalChapters = 0;
    const catMatch = html.match(/data-category=["'](\d+)["']/i);
    if (catMatch) categoryId = catMatch[1];
    const totMatch = html.match(/data-total=["'](\d+)["']/i);
    if (totMatch) totalChapters = parseInt(totMatch[1], 10);

    let nonce = "";
    const nonceMatch = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i);
    if (nonceMatch) nonce = nonceMatch[1];

    // Helper to parse chapter items from HTML
    const parseChapterList = (chHtml) => {
      const chaps = [];
      const blocks = chHtml
        .split(/<article[^>]*class=["'][^"']*chapter-item[^"']*["']/i)
        .slice(1);
      for (const b of blocks) {
        const linkM =
          b.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["']chapter-link["']/i) ||
          b.match(/<a[^>]+class=["']chapter-link["'][^>]+href=["']([^"']+)["']/i) ||
          b.match(/<a[^>]+href=["']([^"']+)["']/i);
        if (!linkM) continue;
        const chapUrl = linkM[1].trim();

        const titleM =
          b.match(/<h3[^>]*class=["']chapter-title["'][^>]*>([\s\S]*?)<\/h3>/i) ||
          b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
        const rawName = titleM
          ? this._decodeHtml(titleM[1].replace(/<[^>]+>/g, "").trim())
          : "";

        chaps.push({
          name: rawName || "Chapter",
          url: chapUrl,
        });
      }
      return chaps;
    };

    const chapters = parseChapterList(html);

    // If there are more chapters than the initial 10, load them via AJAX
    if (categoryId && totalChapters > chapters.length) {
      const totalPages = Math.ceil(totalChapters / 10);
      const usedNonce = nonce || (await this._getNonce());

      const remainingPages = [];
      for (let p = 2; p <= totalPages; p++) remainingPages.push(p);

      const chunkSize = 5;
      for (let i = 0; i < remainingPages.length; i += chunkSize) {
        const chunk = remainingPages.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(async (p) => {
          try {
            const body = `action=mangaverse_load_more&nonce=${usedNonce}&page=${p}&type=series&category_id=${categoryId}&order=desc&lang=en`;
            const res = await this.req("/wp-admin/admin-ajax.php", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
              body,
            });
            const data = typeof res === "string" ? JSON.parse(res) : res;
            if (data && data.success && data.data && data.data.html) {
              return { page: p, chaps: parseChapterList(data.data.html) };
            }
          } catch (_) {}
          return { page: p, chaps: [] };
        });

        const chunkResults = await Promise.all(chunkPromises);
        chunkResults.sort((a, b) => a.page - b.page);
        for (const cr of chunkResults) {
          chapters.push(...cr.chaps);
        }
      }
    }

    if ((await this.getSetting("reverseChaptersOrderMoarManga")) === "true") {
      chapters.reverse();
    }

    return {
      title,
      cover,
      desc,
      status: "Ongoing",
      author: "Unknown",
      genres: [],
      episodes: [
        {
          title: "Chapters",
          urls: chapters,
        },
      ],
    };
  }

  async watch(url) {
    const html = await this.req(url);
    if (!html || typeof html !== "string") {
      throw new Error(`Failed to load chapter reader from ${url}`);
    }

    const base = await this.getBaseUrl();
    const images = [];

    const contentMatch =
      html.match(
        /<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!-- \.entry-content -->/i
      ) ||
      html.match(
        /<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
      );
    const searchArea = contentMatch ? contentMatch[1] : html;

    const imgRegex = /<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(searchArea)) !== null) {
      const fullTag = match[0];
      let src = "";

      const dataSrcMatch = fullTag.match(/data-src=["']([^"']+)["']/i);
      if (dataSrcMatch && !dataSrcMatch[1].startsWith("data:")) {
        src = dataSrcMatch[1].trim();
      } else {
        const regularSrcMatch = fullTag.match(/src=["']([^"']+)["']/i);
        if (regularSrcMatch && !regularSrcMatch[1].startsWith("data:")) {
          src = regularSrcMatch[1].trim();
        }
      }

      if (
        src &&
        !src.includes("avatar") &&
        !src.includes("wallpaper") &&
        !src.startsWith("data:")
      ) {
        images.push(src);
      }
    }

    return {
      urls: images,
      headers: {
        Referer: `${base}/`,
      },
    };
  }

  async checkUpdate(url, lastKnownChapterUrl) {
    const details = await this.detail(url);
    if (!details || !details.episodes || !details.episodes[0]) return false;
    const chapters = details.episodes[0].urls || [];
    if (chapters.length === 0) return false;
    const latestChapter = chapters[chapters.length - 1];
    return latestChapter && latestChapter.url !== lastKnownChapterUrl;
  }
}
