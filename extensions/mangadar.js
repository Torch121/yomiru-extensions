// ==YomiruExtension==
// @name         MangaDar
// @version      v1.0.0
// @author       Yomiru
// @lang         ar
// @license      MIT
// @icon         https://mangadar.com/wp-content/uploads/2026/07/favicon-300x300.png
// @package      mangadar.com
// @type         manga
// @webSite      https://mangadar.com
// @nsfw         false
// @description  قراءة المانجا والمانهوا المترجمة للعربية بجودة عالية وسرعة فائقة عبر موقع مانجا دار (MangaDar).
// ==/YomiruExtension==

export default class extends Extension {
  async req(url, options = {}) {
    const baseUrl = (await this.getSetting("mangadar_url")) || "https://mangadar.com";
    const cleanBase = baseUrl.replace(/\/+$/, "");
    let fullUrl = url;
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
      fullUrl = `${cleanBase}${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
    }

    return this.request(fullUrl, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `${cleanBase}/`,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        ...(options.headers || {}),
      },
    });
  }

  async load() {
    await this.registerSetting({
      title: "MangaDar URL",
      key: "mangadar_url",
      type: "input",
      description: "رابط الموقع الرسمي لمانجا دار",
      defaultValue: "https://mangadar.com",
    });

    await this.registerSetting({
      title: "ترتيب الفصول تصاعدياً",
      key: "reverseChaptersOrderMangaDar",
      type: "toggle",
      description: "ترتيب الفصول تصاعدياً من الأول إلى الأخير (الفصل 1، 2، 3...)",
      defaultValue: "true",
    });
  }

  parseCards(html) {
    const list = [];
    const seen = new Set();
    const aRegex = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/g;
    let match;

    while ((match = aRegex.exec(html)) !== null) {
      const attrs = match[1];
      const inner = match[2];

      if (!attrs.includes("group block") && !attrs.includes("group flex")) {
        continue;
      }

      const hrefMatch = attrs.match(/href=["'](https?:\/\/[^"']*\/manga\/[^\/"']+\/?)["']/);
      if (!hrefMatch) continue;

      const url = hrefMatch[1];
      if (seen.has(url)) continue;
      seen.add(url);

      const h3Match = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      let title = h3Match ? h3Match[1].replace(/<[^>]+>/g, "").trim() : "";
      if (!title) {
        const altMatch = inner.match(/<img[^>]+alt=["']([^"']+)["']/);
        title = altMatch ? altMatch[1].trim() : "";
      }

      const srcMatch = inner.match(/<img[^>]+src=["']([^"']+)["']/);
      let cover = srcMatch ? srcMatch[1].trim() : "";
      if (!cover || cover.startsWith("data:image")) {
        const dataSrc = inner.match(/<img[^>]+data-src=["']([^"']+)["']/);
        cover = dataSrc ? dataSrc[1].trim() : "";
      }

      list.push({
        title: title || "Unknown Title",
        url: url,
        cover: cover,
      });
    }

    return list;
  }

  async popular(page) {
    const path = page > 1 ? `/manga/page/${page}/?sort=popular` : `/manga/?sort=popular`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : JSON.stringify(res);
    return this.parseCards(html);
  }

  async latest(page) {
    const path = page > 1 ? `/manga/page/${page}/` : `/manga/`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : JSON.stringify(res);
    return this.parseCards(html);
  }

  async search(kw, page, filter) {
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      if (jp && jp.trim()) {
        const jpResults = await this._rawSearch(jp.trim(), page, filter);
        if (jpResults && jpResults.length > 0) {
          return jpResults;
        }
      }
      return this._rawSearch(en || jp || "", page, filter);
    }
    return this._rawSearch(kw, page, filter);
  }

  async _rawSearch(kw, page, filter) {
    const cleanKw = (kw || "").trim();
    if (!cleanKw) {
      return this.latest(page);
    }

    const path =
      page > 1
        ? `/page/${page}/?s=${encodeURIComponent(cleanKw)}&post_type=manga`
        : `/?s=${encodeURIComponent(cleanKw)}&post_type=manga`;

    const res = await this.req(path);
    const html = typeof res === "string" ? res : JSON.stringify(res);
    let cards = this.parseCards(html);

    // Fallback: If page 1 returns 0 results from HTML search, try the AJAX search endpoint
    if (cards.length === 0 && (!page || page === 1)) {
      try {
        const ajaxPath = `/wp-admin/admin-ajax.php?action=mangaverse_search&q=${encodeURIComponent(cleanKw)}`;
        const ajaxRes = await this.req(ajaxPath, {
          headers: {
            Accept: "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
          },
        });
        const ajaxData = typeof ajaxRes === "string" ? JSON.parse(ajaxRes) : ajaxRes;
        if (ajaxData && ajaxData.success && Array.isArray(ajaxData.data)) {
          cards = ajaxData.data.map((item) => ({
            title: (item.title || "").trim() || "Unknown Title",
            url: item.url || "",
            cover: item.cover || "",
          }));
        }
      } catch (_) {}
    }

    return cards;
  }

  async detail(url) {
    const res = await this.req(url);
    const html = typeof res === "string" ? res : JSON.stringify(res);

    // 1. Extract Title
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    let title = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : "";
    if (!title) {
      const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/);
      if (ogTitle) {
        title = ogTitle[1].replace(/جميع فصول مانجا /g, "").replace(/ مترجمة.*$/g, "").trim();
      }
    }

    // 2. Extract Cover
    const ogImg = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/);
    let cover = ogImg ? ogImg[1].trim() : "";
    if (!cover) {
      const coverMatch = html.match(/cover:\s*["'](https?:\/\/[^"']+)["']/);
      cover = coverMatch ? coverMatch[1].trim() : "";
    }

    // 3. Extract Description / Synopsis
    const descMatch = html.match(/<div[^>]*text-neutral-300[^>]*>([\s\S]*?)<\/div>/);
    let desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    if (!desc) {
      const metaDesc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/);
      desc = metaDesc ? metaDesc[1].trim() : "لا يوجد وصف متاح.";
    }

    // 4. Extract Chapters from x-data rows
    let chapters = [];
    const rowsMatch = html.match(/rows:\s*(\[\[[\s\S]*?\]\])/);
    if (rowsMatch) {
      try {
        const rawRows = JSON.parse(rowsMatch[1]);
        if (Array.isArray(rawRows)) {
          chapters = rawRows.map((r, i) => {
            const rawNum = r[1] !== undefined && r[1] !== null ? String(r[1]).trim() : String(i + 1);
            const chName = rawNum.startsWith("الفصل") || rawNum.toLowerCase().startsWith("chapter")
              ? rawNum
              : `الفصل ${rawNum}`;
            return {
              name: chName,
              url: r[2] || "",
            };
          });
        }
      } catch (_) {}
    }

    // Fallback: regex search for chapter URLs if rows failed
    if (chapters.length === 0) {
      const cleanUrl = url.replace(/\/+$/, "");
      const slugMatch = cleanUrl.match(/\/manga\/([^\/]+)/);
      if (slugMatch) {
        const slug = slugMatch[1];
        const chRegex = new RegExp(
          `<a\\s+[^>]*href=["'](https?:\\/\\/[^"']*\\/manga\\/${slug}\\/(\\d+(?:\\.\\d+)?)\\/?)[^"']*["'][^>]*>`,
          "g"
        );
        let m;
        const seenUrls = new Set();
        while ((m = chRegex.exec(html)) !== null) {
          const chUrl = m[1];
          const chNum = m[2];
          if (!seenUrls.has(chUrl)) {
            seenUrls.add(chUrl);
            chapters.push({
              name: `الفصل ${chNum}`,
              url: chUrl,
            });
          }
        }
      }
    }

    // Handle ascending chapter sorting if setting enabled (default true)
    const reverseSetting = await this.getSetting("reverseChaptersOrderMangaDar");
    if (reverseSetting !== "false") {
      chapters.reverse();
    }

    return {
      title: title || "Unknown Title",
      cover: cover,
      desc: desc || "N/A",
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
    const html = typeof res === "string" ? res : JSON.stringify(res);

    let pageUrls = [];

    // 1. Preferred method: Parse embedded mv-pages JSON
    const pagesScript = html.match(
      /<script\s+type=["']application\/json["']\s+id=["']mv-pages-[^"']*["']>([\s\S]*?)<\/script>/
    );
    if (pagesScript && pagesScript[1]) {
      try {
        const parsed = JSON.parse(pagesScript[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          pageUrls = parsed.filter((u) => typeof u === "string" && u.startsWith("http"));
        }
      } catch (_) {}
    }

    // 2. Secondary fallback: Decode base64 data-mds attributes
    if (pageUrls.length === 0) {
      const mdsRegex = /data-mds=["']([^"']+)["']/g;
      let m;
      const seen = new Set();
      while ((m = mdsRegex.exec(html)) !== null) {
        try {
          const decoded = atob(m[1].trim());
          if (decoded && decoded.startsWith("http") && !seen.has(decoded)) {
            seen.add(decoded);
            pageUrls.push(decoded);
          }
        } catch (_) {}
      }
    }

    // 3. Tertiary fallback: Storage images
    if (pageUrls.length === 0) {
      const storageRegex = /https?:\/\/storage\.mangadar\.com\/[^\s"'>]+/g;
      let m;
      const seen = new Set();
      while ((m = storageRegex.exec(html)) !== null) {
        if (!seen.has(m[0])) {
          seen.add(m[0]);
          pageUrls.push(m[0]);
        }
      }
    }

    const baseUrl = (await this.getSetting("mangadar_url")) || "https://mangadar.com";
    return {
      urls: pageUrls,
      headers: {
        Referer: `${baseUrl.replace(/\/+$/, "")}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    };
  }
}
