// ==YomiruExtension==
// @name         LikeManga
// @version      v1.0.1
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://likemanga.ink/upload/logos/2024/09/fav_1727153781_66f24675e291d.png
// @package      ink.likemanga
// @type         manga
// @webSite      https://likemanga.ink/
// @nsfw         false
// @description  Read free Manga, Manhwa, and Manhua online with fastest updates and high-quality images on LikeManga.
// ==/YomiruExtension==

export default class extends Extension {
  get defaultBaseUrl() {
    return "https://likemanga.ink";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("likemanga_url");
    return (custom && custom.trim()) ? custom.trim().replace(/\/+$/, "") : this.defaultBaseUrl;
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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": `${base}/`,
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
      title: "LikeManga URL",
      key: "likemanga_url",
      type: "input",
      description: "Base domain URL for LikeManga mirror",
      defaultValue: "https://likemanga.ink",
    });

    await this.registerSetting({
      title: "Reverse Order of Chapters",
      key: "reverse_chapters",
      type: "toggle",
      description: "Reverse chapter list to display in ascending order",
      defaultValue: "true",
    });
  }

  _parseItems(html, baseUrl = "https://likemanga.ink") {
    if (!html || typeof html !== "string") return [];
    const items = [];
    const seen = new Set();
    const parts = html.split(/<div class="[^"]*video[^"]*"/i);

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const titleMatch =
        part.match(/class="[^"]*title-manga[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
        part.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*jtip[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
        part.match(/<a[^>]+class="[^"]*jtip[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
        part.match(/<p[^>]+class="[^"]*title-manga[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

      const coverMatch =
        part.match(/<img[^>]+src="([^"]+)"/i) ||
        part.match(/<img[^>]+data-src="([^"]+)"/i);

      const latestChapMatch = part.match(/class="[^"]*list-2-chap[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

      if (titleMatch) {
        let rawUrl = titleMatch[1].trim();
        let title = titleMatch[2].replace(/<[^>]*>/g, "").trim();
        let cover = coverMatch ? coverMatch[1].trim() : "";
        if (cover && !cover.startsWith("http")) {
          cover = `${baseUrl}${cover.startsWith("/") ? "" : "/"}${cover}`;
        }

        const latestChap = latestChapMatch ? latestChapMatch[1].replace(/<[^>]*>/g, "").trim() : "";

        if (title && !seen.has(rawUrl)) {
          seen.add(rawUrl);
          items.push({
            title,
            url: rawUrl,
            cover,
            update: latestChap,
          });
        }
      }
    }

    // Global fallback if parts splitting failed
    if (items.length === 0) {
      const cardMatches = [...html.matchAll(/class="[^"]*title-manga[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      for (const m of cardMatches) {
        const rawUrl = m[1].trim();
        const title = m[2].replace(/<[^>]*>/g, "").trim();
        if (title && !seen.has(rawUrl)) {
          seen.add(rawUrl);
          items.push({
            title,
            url: rawUrl,
            cover: "",
            update: "",
          });
        }
      }
    }

    return items;
  }

  // 1. Popular / Hot Manga
  async popular(page) {
    const base = await this.getBaseUrl();
    const p = page || 1;
    const res = await this.req(`/?act=search&f[status]=all&f[sortby]=hot&page=${p}`);
    const html = typeof res === "string" ? res : res.body || "";
    return this._parseItems(html, base);
  }

  // 2. Latest Updated Manga
  async latest(page) {
    const base = await this.getBaseUrl();
    const p = page || 1;
    const res = await this.req(`/?act=search&f[status]=all&f[sortby]=lastest-chap&page=${p}`);
    const html = typeof res === "string" ? res : res.body || "";
    return this._parseItems(html, base);
  }

  // 3. Search Manga
  async search(kw, page, filter) {
    const base = await this.getBaseUrl();
    const p = page || 1;
    const cleanKw = kw ? encodeURIComponent(kw.trim()) : "";
    const url = `/?act=search&f[status]=all&f[sortby]=lastest-chap&f[keyword]=${cleanKw}&page=${p}`;

    const res = await this.req(url);
    const html = typeof res === "string" ? res : res.body || "";
    return this._parseItems(html, base);
  }

  // 4. Manga Detail & Chapters List
  async detail(url) {
    const base = await this.getBaseUrl();
    const fullMangaUrl = url.startsWith("http") ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;

    const res = await this.req(fullMangaUrl);
    const html = typeof res === "string" ? res : res.body || "";

    const titleMatch =
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "Unknown Title";

    // Extract cover
    const coverMatch =
      html.match(/<img[^>]+src="([^"]*upload\/pages\/[^"]+)"/i) ||
      html.match(/class="card-img-top"[^>]+src="([^"]+)"/i) ||
      html.match(/<img[^>]+src="([^"]+)"[^>]*alt="[^"]*"/i);
    let cover = coverMatch ? coverMatch[1] : "";
    if (cover && !cover.startsWith("http")) {
      cover = `${base}${cover.startsWith("/") ? "" : "/"}${cover}`;
    }

    // Extract summary
    const descMatch =
      html.match(/id="summary_shortened"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/id="summary"[^>]*>([\s\S]*?)<\/div>/i);
    const desc = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "N/A";

    // Extract manga ID
    const mangaIdMatch = html.match(/id="manga_id"[^>]+value="(\d+)"/i);
    let mangaId = mangaIdMatch ? mangaIdMatch[1] : null;
    if (!mangaId) {
      const urlIdMatch = fullMangaUrl.match(/-(\d+)\/?$/);
      if (urlIdMatch) {
        mangaId = urlIdMatch[1];
      }
    }

    // Parse initial chapter list
    const chaptersList = [];
    const chapMatches = [...html.matchAll(/<li[^>]+class="wp-manga-chapter"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const m of chapMatches) {
      chaptersList.push({
        name: m[2].replace(/<[^>]*>/g, "").trim(),
        url: m[1],
      });
    }

    // If there is pagination, fetch remaining chapter pages
    if (mangaId) {
      const navMatches = [...html.matchAll(/load_list_chapter\((\d+)\)/g)];
      if (navMatches.length > 0) {
        const pages = navMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n));
        const maxPage = pages.length > 0 ? Math.max(...pages) : 1;

        if (maxPage > 1) {
          for (let p = 2; p <= maxPage; p++) {
            try {
              const ajaxRes = await this.req(`/?act=ajax&code=load_list_chapter&manga_id=${mangaId}&page_num=${p}`, {
                headers: {
                  "X-Requested-With": "XMLHttpRequest",
                  Referer: fullMangaUrl,
                },
              });
              const ajaxData = this.parseJson(ajaxRes);
              const listChapHtml = ajaxData && ajaxData.list_chap ? ajaxData.list_chap : (typeof ajaxRes === "string" ? ajaxRes : "");

              const pChapMatches = [...listChapHtml.matchAll(/<li[^>]+class="wp-manga-chapter"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
              for (const pm of pChapMatches) {
                chaptersList.push({
                  name: pm[2].replace(/<[^>]*>/g, "").trim(),
                  url: pm[1],
                });
              }
            } catch (_) {
              break;
            }
          }
        }
      }
    }

    // Optionally reverse chapter order to ascending
    if ((await this.getSetting("reverse_chapters")) === "true") {
      chaptersList.reverse();
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "Chapters",
          urls: chaptersList,
        },
      ],
    };
  }

  // 5. Chapter Reader: Extract Pages Images
  async watch(chapterUrl) {
    const base = await this.getBaseUrl();
    const fullChapterUrl = chapterUrl.startsWith("http")
      ? chapterUrl
      : `${base}${chapterUrl.startsWith("/") ? "" : "/"}${chapterUrl}`;

    const res = await this.req(fullChapterUrl);
    const html = typeof res === "string" ? res : res.body || "";

    const images = [];
    const seen = new Set();

    // Primary: .page-chapter img tags
    const imgMatches = [...html.matchAll(/class="page-chapter[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/gi)];
    for (const m of imgMatches) {
      let src = m[1].trim();
      if (!src.startsWith("http")) {
        src = `${base}${src.startsWith("/") ? "" : "/"}${src}`;
      }
      if (!seen.has(src)) {
        seen.add(src);
        images.push(src);
      }
    }

    // Fallback: search all image links matching reader CDN
    if (images.length === 0) {
      const fallbackMatches = [...html.matchAll(/<img[^>]+src="([^"]*(?:mgread\.io|\/manga\/)[^"]*)"/gi)];
      for (const m of fallbackMatches) {
        let src = m[1].trim();
        if (!seen.has(src)) {
          seen.add(src);
          images.push(src);
        }
      }
    }

    return {
      urls: images,
    };
  }
}
