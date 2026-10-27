// ==YomiruExtension==
// @name         Mangzio
// @version      v1.0.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://www.mangzio.com/brand/apple-touch-icon.png
// @package      com.mangzio
// @type         manga
// @webSite      https://www.mangzio.com/en
// @description  Read high-quality popular and trending manga and manhwa online with fast reader chapters from Mangzio.
// ==/YomiruExtension==

export default class extends Extension {
  async getBaseUrl() {
    const custom = await this.getSetting("mangzio_url");
    if (custom && typeof custom === "string" && custom.trim()) {
      return custom.trim().replace(/\/+$/, "");
    }
    return "https://www.mangzio.com";
  }

  async req(path, options = {}) {
    const base = await this.getBaseUrl();
    const url = path.startsWith("http")
      ? path
      : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

    const headers = Object.assign(
      {
        "Miru-Url": base,
        Referer: `${base}/en`,
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
      title: "Mangzio URL",
      key: "mangzio_url",
      type: "input",
      description: "Homepage URL for Mangzio (Default: https://www.mangzio.com)",
      defaultValue: "https://www.mangzio.com",
    });

    await this.registerSetting({
      title: "Reverse Chapter Order",
      key: "reverseChaptersOrderMangzio",
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

  _extractFlightData(html) {
    if (!html || typeof html !== "string") return "";
    const matches = [
      ...html.matchAll(/self\.__next_f\.push\(\[1,\s*(\"[\s\S]*?\")\]\)/g),
    ];
    return matches
      .map((m) => {
        try {
          return JSON.parse(m[1]);
        } catch (_) {
          return m[1].slice(1, -1);
        }
      })
      .join("");
  }

  async _getCatalog() {
    const html = await this.req("/en/manga");
    const base = await this.getBaseUrl();
    const flight = this._extractFlightData(html);

    if (flight) {
      const idx = flight.indexOf('[{"id":');
      if (idx !== -1) {
        const end = flight.indexOf("}]", idx);
        if (end !== -1) {
          try {
            const raw = JSON.parse(flight.slice(idx, end + 2));
            if (Array.isArray(raw) && raw.length > 0) {
              return raw.map((item) => ({
                title: item.title || item.slug,
                url: `${base}/en/${item.slug}`,
                cover: item.coverImageUrl
                  ? (item.coverImageUrl.startsWith("http")
                      ? item.coverImageUrl
                      : `${base}${item.coverImageUrl.startsWith("/") ? "" : "/"}${item.coverImageUrl}`)
                  : "",
                update: item.chapterCount ? `${item.chapterCount} Chapters` : "",
                alternativeTitle: item.alternativeTitle || "",
                chapterCount: item.chapterCount || 0,
              }));
            }
          } catch (_) {}
        }
      }
    }

    // HTML fallback
    const results = [];
    const cardRegex =
      /<a[^>]+href=["'](\/en\/[a-z0-9-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const href = match[1];
      const inner = match[2];
      if (
        href === "/en" ||
        href === "/en/manga" ||
        href.startsWith("/en/terms") ||
        href.startsWith("/en/privacy")
      ) {
        continue;
      }
      const slug = href.replace(/^\/en\//, "");
      const titleMatch = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const title = titleMatch
        ? this._decodeHtml(titleMatch[1].replace(/<[^>]+>/g, "").trim())
        : slug;

      const imgMatch = inner.match(/<img[^>]+src=["']([^"']+)["']/i);
      const cover = imgMatch ? `${base}${imgMatch[1].trim()}` : "";

      results.push({
        title,
        url: `${base}${href}`,
        cover,
        update: "",
        alternativeTitle: "",
        chapterCount: 0,
      });
    }

    return results;
  }

  async popular(page = 1) {
    const catalog = await this._getCatalog();
    const limit = 24;
    const start = (page - 1) * limit;
    return catalog.slice(start, start + limit);
  }

  async latest(page = 1) {
    const catalog = await this._getCatalog();
    const sorted = [...catalog].sort((a, b) => b.chapterCount - a.chapterCount);
    const limit = 24;
    const start = (page - 1) * limit;
    return sorted.slice(start, start + limit);
  }

  async search(kw, page = 1) {
    const catalog = await this._getCatalog();
    const q = (kw || "").trim().toLowerCase();
    const filtered = catalog.filter((item) => {
      if (item.title && item.title.toLowerCase().includes(q)) return true;
      if (item.url && item.url.toLowerCase().includes(q)) return true;
      if (item.alternativeTitle && item.alternativeTitle.toLowerCase().includes(q)) {
        return true;
      }
      return false;
    });

    const limit = 24;
    const start = (page - 1) * limit;
    return filtered.slice(start, start + limit);
  }

  async detail(url) {
    const html = await this.req(url);
    if (!html || typeof html !== "string") {
      throw new Error(`Failed to load manga details from ${url}`);
    }

    const base = await this.getBaseUrl();
    const slug = url.replace(/^(?:https?:\/\/[^\/]+)?\/en\//, "").replace(/\/+$/, "");
    const flight = this._extractFlightData(html);

    let title = slug;
    let cover = "";
    let desc = "";
    let status = "Ongoing";
    let author = "Unknown";
    let genres = [];
    const chapters = [];

    // Parse from Flight JSON
    if (flight) {
      const needle = `"slug":"${slug}"`;
      const mIdx = flight.indexOf(needle);
      if (mIdx !== -1) {
        const start = flight.lastIndexOf("{", mIdx);
        if (start !== -1) {
          let depth = 0;
          for (let i = start; i < flight.length; i++) {
            if (flight[i] === "{") depth++;
            else if (flight[i] === "}") {
              depth--;
              if (depth === 0) {
                try {
                  const mData = JSON.parse(flight.slice(start, i + 1));
                  if (mData.title) title = mData.title;
                  if (mData.coverImageUrl) {
                    cover = mData.coverImageUrl.startsWith("http")
                      ? mData.coverImageUrl
                      : `${base}${mData.coverImageUrl.startsWith("/") ? "" : "/"}${mData.coverImageUrl}`;
                  }
                  if (mData.synopsis) desc = mData.synopsis;
                  if (mData.status) status = mData.status;
                  if (mData.author) author = mData.author;
                  if (Array.isArray(mData.genres)) genres = mData.genres;
                } catch (_) {}
                break;
              }
            }
          }
        }
      }

      // Extract chapters array
      let chIdx = flight.indexOf('[{"id":');
      while (chIdx !== -1) {
        const end = flight.indexOf("}]", chIdx);
        if (end === -1) break;
        try {
          const arr = JSON.parse(flight.slice(chIdx, end + 2));
          if (Array.isArray(arr) && arr.length > 0 && arr[0].chapterNumber !== undefined) {
            for (const c of arr) {
              const num = c.chapterNumber ?? 0;
              const chTitle = c.chapterTitle || `Chapter ${num}`;
              chapters.push({
                name: chTitle,
                url: `${base}/en/${slug}-en-chapter-${num}`,
              });
            }
            break;
          }
        } catch (_) {}
        chIdx = flight.indexOf('[{"id":', chIdx + 1);
      }
    }

    // Fallback title / cover / desc from HTML meta
    if (!cover) {
      const ogImg = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
      if (ogImg) cover = ogImg[1].trim();
    }
    if (title === slug) {
      const ogTitle = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
      if (ogTitle) title = this._decodeHtml(ogTitle[1].replace(/Manga - Read Online.*$/i, "").trim());
    }
    if (!desc) {
      const ogDesc = html.match(/<meta property=["']og:description["'] content=["']([^"']+)["']/i);
      if (ogDesc) desc = this._decodeHtml(ogDesc[1].trim());
    }

    if ((await this.getSetting("reverseChaptersOrderMangzio")) === "true") {
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

    // Strategy 1: Flight pageImageUrls JSON
    const flight = this._extractFlightData(html);
    if (flight) {
      const pIdx = flight.indexOf('"pageImageUrls":[');
      if (pIdx !== -1) {
        const start = pIdx + '"pageImageUrls":'.length;
        const end = flight.indexOf("]", start);
        if (end !== -1) {
          try {
            const urls = JSON.parse(flight.slice(start, end + 1));
            if (Array.isArray(urls) && urls.length > 0) {
              images = urls;
            }
          } catch (_) {}
        }
      }
    }

    // Strategy 2: HTML img tags
    if (images.length === 0) {
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        const src = match[1].trim();
        if (
          (src.includes("planeptune.us") ||
            src.includes("qubn.us") ||
            src.includes("/uploads/")) &&
          !src.includes("hero-bg") &&
          !src.includes("brand") &&
          !src.includes("cover")
        ) {
          images.push(src);
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

  async checkUpdate(url, lastKnownChapterUrl) {
    const details = await this.detail(url);
    if (!details || !details.episodes || !details.episodes[0]) return false;
    const chapters = details.episodes[0].urls || [];
    if (chapters.length === 0) return false;
    const latestChapter = chapters[chapters.length - 1];
    return latestChapter && latestChapter.url !== lastKnownChapterUrl;
  }
}
