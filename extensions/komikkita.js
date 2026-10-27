// ==YomiruExtension==
// @name         KomikKita
// @version      v1.0.0
// @author       Yomiru
// @lang         id
// @license      MIT
// @icon         https://i2.wp.com/komikkita.net/wp-content/uploads/2026/02/cropped-komikkita-icon-small-192x192.png
// @package      net.komikkita
// @type         manga
// @webSite      https://komikkita.net/
// @description  Baca komik manga, manhwa, dan manhua bahasa Indonesia terlengkap dan terupdate di KomikKita.
// ==/YomiruExtension==

export default class extends Extension {
  async getBaseUrl() {
    const custom = await this.getSetting("komikkita_url");
    if (custom && typeof custom === "string" && custom.trim()) {
      return custom.trim().replace(/\/+$/, "");
    }
    return "https://komikkita.net";
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
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "id,en-US;q=0.9,en;q=0.8",
      },
      options.headers || {}
    );

    return await this.request(url, Object.assign({}, options, { headers }));
  }

  async load() {
    await this.registerSetting({
      title: "KomikKita URL",
      key: "komikkita_url",
      type: "input",
      description: "Homepage URL for KomikKita (Default: https://komikkita.net)",
      defaultValue: "https://komikkita.net",
    });

    await this.registerSetting({
      title: "Reverse Chapter Order",
      key: "reverseChaptersOrderKomikKita",
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
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8211;/g, "-")
      .replace(/&#34;/g, '"')
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  _parseCards(html) {
    const list = [];
    if (!html || typeof html !== "string") return list;

    const bsxRegex = /<div[^>]*class=["']bsx["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let bsm;

    while ((bsm = bsxRegex.exec(html)) !== null) {
      const block = bsm[1];
      const linkMatch =
        block.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']*)["']/i) ||
        block.match(/<a[^>]+href=["']([^"']+)["']/i);
      if (!linkMatch) continue;

      const url = linkMatch[1].trim();
      let title = this._decodeHtml((linkMatch[2] || "").trim());
      if (!title) {
        const ttMatch = block.match(/<div[^>]*class=["']tt["'][^>]*>([\s\S]*?)<\/div>/i);
        if (ttMatch) title = this._decodeHtml(ttMatch[1].replace(/<[^>]*>/g, "").trim());
      }

      let cover = "";
      const dataSrcMatch = block.match(/data-src=["']([^"']+)["']/i);
      if (dataSrcMatch && !dataSrcMatch[1].startsWith("data:")) {
        cover = dataSrcMatch[1].trim();
      } else {
        const srcMatch = block.match(/src=["'](https?:\/\/[^"']+)["']/i);
        if (srcMatch && !srcMatch[1].startsWith("data:")) {
          cover = srcMatch[1].trim();
        }
      }

      const epxsMatch = block.match(/<div[^>]*class=["']epxs["'][^>]*>([\s\S]*?)<\/div>/i);
      const update = epxsMatch ? this._decodeHtml(epxsMatch[1].replace(/<[^>]*>/g, "").trim()) : "";

      if (title && url) {
        list.push({ title, url, cover, update });
      }
    }

    return list;
  }

  async latest(page) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const html = await this.req(`/manga/?page=${p}&order=update`);
    return this._parseCards(html);
  }

  async popular(page) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const html = await this.req(`/manga/?page=${p}&order=popular`);
    return this._parseCards(html);
  }

  async search(kw, page) {
    let query = "";
    if (typeof kw === "string") {
      query = kw.trim();
    } else if (kw && typeof kw === "object") {
      query = (kw.query || kw.englishTitle || kw.japaneseTitle || "").trim();
    }
    if (!query) return [];

    const p = Math.max(1, parseInt(page, 10) || 1);
    const endpoint =
      p === 1
        ? `/?s=${encodeURIComponent(query)}`
        : `/page/${p}/?s=${encodeURIComponent(query)}`;

    const html = await this.req(endpoint);
    return this._parseCards(html);
  }

  async detail(url) {
    const html = await this.req(url);
    if (!html || typeof html !== "string") {
      throw new Error(`Failed to load manga details from ${url}`);
    }

    // Title
    const titleMatch = html.match(
      /<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i
    );
    const title = titleMatch
      ? this._decodeHtml(titleMatch[1].replace(/<[^>]*>/g, "").trim())
      : "Unknown";

    // Cover
    let cover = "";
    const coverMatch = html.match(
      /<div[^>]*class=["']thumb["'][^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=["']([^"']+)["']/i
    );
    if (coverMatch && !coverMatch[1].startsWith("data:")) {
      cover = coverMatch[1].trim();
    }

    // Description / Synopsis
    const descMatch = html.match(
      /<div[^>]*class=["'][^"']*entry-content-single[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const desc = descMatch
      ? this._decodeHtml(
          descMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").trim()
        )
      : "N/A";

    // Status
    const statusMatch = html.match(
      /<div[^>]*class=["']imptdt["'][^>]*>\s*Status\s*<i>([^<]+)<\/i>/i
    );
    const status = statusMatch ? statusMatch[1].trim() : "Unknown";

    // Author
    const authorMatch = html.match(
      /<div[^>]*class=["']imptdt["'][^>]*>\s*Author\s*<i>([^<]+)<\/i>/i
    );
    const author = authorMatch ? authorMatch[1].trim() : "Unknown";

    // Genres
    const genres = [];
    const genreRegex = /<span class=["']mgen["']>([\s\S]*?)<\/span>/i;
    const genreBlockMatch = html.match(genreRegex);
    if (genreBlockMatch) {
      const gRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
      let gm;
      while ((gm = gRegex.exec(genreBlockMatch[1])) !== null) {
        const g = this._decodeHtml(gm[1].replace(/<[^>]*>/g, "").trim());
        if (g && !genres.includes(g)) genres.push(g);
      }
    }

    // Parse chapters from #chapterlist
    const chapters = [];
    const chapRegex =
      /<li[^>]*data-num=["']([^"']*)["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<span[^>]*class=["']chapternum["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi;
    let cm;
    while ((cm = chapRegex.exec(html)) !== null) {
      const num = cm[1].trim();
      const rawUrl = cm[2].trim();
      const rawName = cm[3].replace(/<[^>]*>/g, "").trim();
      chapters.push({
        name: this._decodeHtml(rawName || `Chapter ${num}`),
        url: rawUrl,
      });
    }

    if ((await this.getSetting("reverseChaptersOrderKomikKita")) === "true") {
      chapters.reverse();
    }

    return {
      title,
      cover,
      desc,
      status,
      author,
      genres,
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
    let images = [];

    // Strategy 1: ts_reader.run JSON payload
    const tsMatch = html.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
    if (tsMatch) {
      try {
        const data = JSON.parse(tsMatch[1]);
        if (
          data.sources &&
          Array.isArray(data.sources) &&
          data.sources.length > 0 &&
          Array.isArray(data.sources[0].images)
        ) {
          images = data.sources[0].images;
        }
      } catch (_) {}
    }

    // Strategy 2: #readerarea fallback
    if (images.length === 0) {
      const areaMatch = html.match(
        /<div[^>]*id=["']readerarea["'][^>]*>([\s\S]*?)<\/div>/i
      );
      if (areaMatch) {
        const imgRegex = /<img[^>]+(?:data-src|src)=["']([^"']+)["']/gi;
        let m;
        while ((m = imgRegex.exec(areaMatch[1])) !== null) {
          const u = m[1].trim();
          if (!u.startsWith("data:") && !u.includes("lazyload")) {
            images.push(u);
          }
        }
      }
    }

    return {
      urls: images,
      headers: {
        Referer: `${base}/`,
      },
    };
  }
}
