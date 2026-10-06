// ==YomiruExtension==
// @name         MangaTime
// @version      v1.0.2
// @author       Yomiru
// @lang         ar
// @license      MIT
// @icon         https://mangatime.org/brand/v2/icons/icon-192.png
// @package      mangatime.org
// @type         manga
// @webSite      https://mangatime.org
// @nsfw         false
// @description  قراءة المانجا والمانهوا المترجمة للعربية بجودة عالية وسرعة فائقة عبر موقع مانجا تايم (MangaTime).
// ==/YomiruExtension==

export default class extends Extension {
  async req(url, options = {}) {
    const baseUrl = (await this.getSetting("mangatime_url")) || "https://mangatime.org";
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
        "X-MT-Platform": "app",
        Accept: "application/json, text/plain, */*",
        ...(options.headers || {}),
      },
    });
  }

  async load() {
    await this.registerSetting({
      title: "MangaTime URL",
      key: "mangatime_url",
      type: "input",
      description: "رابط الموقع الرسمي لمانجا تايم",
      defaultValue: "https://mangatime.org",
    });

    await this.registerSetting({
      title: "ترتيب الفصول تصاعدياً",
      key: "reverseChaptersOrderMangaTime",
      type: "toggle",
      description: "ترتيب الفصول تصاعدياً من الأول إلى الأخير (الفصل 1، 2، 3...)",
      defaultValue: "true",
    });
  }

  resolveCover(url, base) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    const cleanBase = (base || "https://mangatime.org").replace(/\/+$/, "");
    return `${cleanBase}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  formatTitle(title, slug, altTitles) {
    const cleanTitle = (title || "").trim();
    if (!slug) return cleanTitle || "Unknown Title";

    // Clean and capitalize the Latin slug: e.g. "solo-leveling" -> "Solo Leveling"
    const slugWords = slug
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 0);
    const slugTitle = slugWords
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    if (!cleanTitle) return slugTitle;

    const hasArabic = /[\u0600-\u06FF]/.test(cleanTitle);
    const cleanLower = cleanTitle.toLowerCase();
    const slugLower = slugTitle.toLowerCase();

    // If cleanTitle is already the English/Latin name or matches slug
    if (cleanLower === slugLower) {
      return cleanTitle;
    }

    // For Arabic titles, include the English slug title so Yomiru's matching
    // engine and English search queries can achieve 100% exact matches
    if (hasArabic) {
      return `${slugTitle} (${cleanTitle})`;
    }

    if (!cleanLower.includes(slugLower) && !slugLower.includes(cleanLower)) {
      return `${cleanTitle} (${slugTitle})`;
    }

    return cleanTitle;
  }

  reRankResults(results, query) {
    if (!query || !results || results.length <= 1) return results;

    const cleanQuery = query.toLowerCase().trim();
    const queryTokens = cleanQuery
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);

    function calculateScore(item) {
      const rawTitle = (item.title || "").toLowerCase().trim();
      const slugRaw = (item.slug || "").toLowerCase().trim();
      const slugClean = slugRaw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
      const slugWords = slugClean.split(/\s+/).filter((w) => w.length > 0);
      const altTitles = (item.alternativeTitles || []).map((a) =>
        (typeof a === "string" ? a : a.title || "").toLowerCase().trim()
      );

      let s = 0.0;

      // 1. Exact match on slug, clean title, or any alt title
      if (slugClean === cleanQuery || slugRaw === cleanQuery) {
        s += 500.0;
      } else if (altTitles.some((alt) => alt === cleanQuery)) {
        s += 450.0;
      } else if (rawTitle === cleanQuery) {
        s += 400.0;
      }

      // 2. Prefix match on slug, alt title, or title
      if (s < 400) {
        if (slugClean.startsWith(cleanQuery)) {
          const ratio = cleanQuery.length / Math.max(cleanQuery.length, slugClean.length);
          s += 300.0 * ratio;
        } else if (altTitles.some((alt) => alt.startsWith(cleanQuery))) {
          s += 250.0;
        } else if (rawTitle.startsWith(cleanQuery)) {
          s += 200.0;
        }
      }

      // 3. Typo / prefix stem match on first word of slug (e.g. "vagabon" -> "vagabond")
      if (s < 200 && slugWords.length > 0) {
        const firstWord = slugWords[0];
        if (firstWord.startsWith(cleanQuery) || cleanQuery.startsWith(firstWord)) {
          const ratio = Math.min(cleanQuery.length, firstWord.length) / Math.max(cleanQuery.length, firstWord.length);
          const wordPenalty = 1.0 / Math.sqrt(slugWords.length);
          s += 280.0 * ratio * wordPenalty;
        }
      }

      // 4. Token containment and position
      for (const token of queryTokens) {
        if (slugWords.includes(token)) {
          const idx = slugWords.indexOf(token);
          if (idx === 0) {
            s += 80.0; // Matching first word
          } else {
            s += 20.0; // Matching later word (e.g. "Immortal Vagabond")
          }
        } else if (slugWords.some((w) => w.includes(token))) {
          s += 30.0;
        }
      }

      // 5. Heavy penalty for spin-offs / secondary keywords if query does not request them
      const spinOffWords = ["colored", "digital", "guidebook", "official", "extra", "spinoff", "novel", "webtoon"];
      for (const w of spinOffWords) {
        if (slugWords.includes(w) && !queryTokens.includes(w)) {
          s -= 80.0;
        }
      }

      // 6. Heavy penalty if candidate starts with an unmatched word when query is short
      if (
        slugWords.length > 0 &&
        queryTokens.length > 0 &&
        slugWords[0] !== queryTokens[0] &&
        !slugWords[0].startsWith(queryTokens[0])
      ) {
        s -= 100.0;
      }

      // 7. Minor view count tie-breaker (max 5 points)
      const views = item.viewCount || 0;
      if (s > 0 && views > 0) {
        s += Math.min(5.0, Math.log10(views + 1));
      }

      return s;
    }

    return [...results].sort((a, b) => calculateScore(b) - calculateScore(a));
  }

  async trpc(proc, inputData) {
    const baseUrl = (await this.getSetting("mangatime_url")) || "https://mangatime.org";
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const inp = encodeURIComponent(JSON.stringify({ json: inputData }));
    const url = `${cleanBase}/api/trpc/${proc}?input=${inp}`;
    const res = await this.req(url);
    const data = typeof res === "string" ? JSON.parse(res) : res;
    if (Array.isArray(data)) {
      return data[0]?.result?.data?.json;
    }
    return data?.result?.data?.json;
  }

  async popular(page) {
    const baseUrl = (await this.getSetting("mangatime_url")) || "https://mangatime.org";
    const data = await this.trpc("search.searchSeries", {
      filters: {},
      sortBy: "popularity",
      sortOrder: "desc",
      limit: 20,
      page: page || 1,
    });
    const results = (data && data.results) || [];
    return results.map((item) => ({
      title: this.formatTitle(item.title, item.slug),
      url: `/manga/${item.slug}`,
      cover: this.resolveCover(item.coverUrl, baseUrl),
    }));
  }

  async latest(page) {
    const baseUrl = (await this.getSetting("mangatime_url")) || "https://mangatime.org";
    try {
      const data = await this.trpc("homepage.getLatestReleases", {
        page: page || 1,
        limit: 20,
      });
      const items = (data && data.items) || [];
      if (items.length > 0) {
        return items.map((item) => ({
          title: this.formatTitle(item.title, item.slug),
          url: `/manga/${item.slug}`,
          cover: this.resolveCover(item.coverUrl, baseUrl),
        }));
      }
    } catch (_) {}

    // Fallback: searchSeries sorted by recent
    const searchData = await this.trpc("search.searchSeries", {
      filters: {},
      sortBy: "recent",
      sortOrder: "desc",
      limit: 20,
      page: page || 1,
    });
    const results = (searchData && searchData.results) || [];
    return results.map((item) => ({
      title: this.formatTitle(item.title, item.slug),
      url: `/manga/${item.slug}`,
      cover: this.resolveCover(item.coverUrl, baseUrl),
    }));
  }

  async search(kw, page, filter) {
    const cleanKw = (kw || "").trim();
    if (!cleanKw) {
      return this.latest(page);
    }

    const baseUrl = (await this.getSetting("mangatime_url")) || "https://mangatime.org";

    let items = [];
    // 1. Try searchWorks (returns rich metadata including alternativeTitles, kind, status)
    try {
      const worksData = await this.trpc("search.searchWorks", {
        query: cleanKw,
        limit: 24,
      });
      if (worksData && Array.isArray(worksData.items) && worksData.items.length > 0) {
        items = worksData.items;
      }
    } catch (_) {}

    // 2. Fallback to searchSeries if searchWorks returned empty
    if (items.length === 0) {
      try {
        const seriesData = await this.trpc("search.searchSeries", {
          query: cleanKw,
          sortBy: "relevance",
          sortOrder: "desc",
          limit: 24,
          page: page || 1,
        });
        if (seriesData && Array.isArray(seriesData.results) && seriesData.results.length > 0) {
          items = seriesData.results;
        }
      } catch (_) {}
    }

    // Re-rank results so exact titles/slugs take top priority over partials or unrelated hits
    const results = this.reRankResults(items, cleanKw);

    return results.map((item) => {
      const alts = Array.isArray(item.alternativeTitles)
        ? item.alternativeTitles.map((a) => (typeof a === "string" ? a : a.title || ""))
        : [];
      return {
        title: this.formatTitle(item.title, item.slug, alts),
        url: `/manga/${item.slug}`,
        cover: this.resolveCover(item.coverUrl, baseUrl),
        altTitles: alts,
      };
    });
  }

  extractSlug(url) {
    if (!url) return "";
    const clean = url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
    const parts = clean.split("/");
    return decodeURIComponent(parts[parts.length - 1]);
  }

  async detail(url) {
    const slug = this.extractSlug(url);
    const baseUrl = (await this.getSetting("mangatime_url")) || "https://mangatime.org";
    const series = await this.trpc("content.getSeriesBySlug", { slug });

    if (!series) {
      return {
        title: "Unknown Title",
        cover: "",
        desc: "N/A",
        episodes: [
          {
            title: "Chapters",
            urls: [],
          },
        ],
      };
    }

    const chData = await this.trpc("content.getChapters", {
      seriesId: series.id,
      limit: -1,
      includeUnavailable: true,
    });
    const rawChapters = (chData && chData.chapters) || [];

    const chapters = rawChapters.map((ch, idx) => {
      const chNum = ch.number !== undefined && ch.number !== null ? ch.number : idx + 1;
      let name = `الفصل ${chNum}`;
      if (
        ch.title &&
        ch.title.trim() &&
        ch.title !== `Chapter ${chNum}` &&
        ch.title !== `الفصل ${chNum}` &&
        ch.title !== `Chapter - ${chNum}`
      ) {
        const cleanTitle = ch.title.trim();
        if (cleanTitle.startsWith("الفصل")) {
          name = cleanTitle;
        } else {
          name = `الفصل ${chNum}: ${cleanTitle}`;
        }
      }

      return {
        name,
        url: `/manga/${slug}/chapter/${chNum}?id=${ch.id}`,
      };
    });

    const reverseSetting = await this.getSetting("reverseChaptersOrderMangaTime");
    if (reverseSetting !== "false") {
      chapters.reverse();
    }

    return {
      title: this.formatTitle(series.title, series.slug),
      cover: this.resolveCover(series.coverUrl, baseUrl),
      desc: series.description || "لا يوجد وصف متاح.",
      episodes: [
        {
          title: "Chapters",
          urls: chapters,
        },
      ],
    };
  }

  async watch(url) {
    const baseUrl = (await this.getSetting("mangatime_url")) || "https://mangatime.org";
    const cleanBase = baseUrl.replace(/\/+$/, "");

    let chapterId = null;
    let seriesSlug = null;
    let chapterNumber = null;

    // 1. Look for explicit id in query param: ?id=... or &id=...
    const queryIdMatch = url.match(/[?&]id=([a-f0-9]{24})/i);
    if (queryIdMatch) {
      chapterId = queryIdMatch[1];
    }

    // 2. Look for direct 24-hex id: /chapter/6ac... or string is just 6ac...
    if (!chapterId) {
      const directIdMatch = url.match(/(?:\/chapter\/|^)([a-f0-9]{24})(?:[/?#]|$)/i);
      if (directIdMatch) {
        chapterId = directIdMatch[1];
      }
    }

    // 3. Extract slug and chapter number from path: /(manga|series|...)/:slug/chapter/:num
    const pathMatch = url.match(/(?:manga|manhwa|manhua|webtoon|comic|series)\/([^\/]+)\/chapter\/([^\/?#]+)/i);
    if (pathMatch) {
      seriesSlug = decodeURIComponent(pathMatch[1]);
      const num = parseFloat(decodeURIComponent(pathMatch[2]));
      if (!isNaN(num)) {
        chapterNumber = num;
      }
    }

    let pagesData = null;

    // Primary: fetch by chapterId
    if (chapterId) {
      try {
        pagesData = await this.trpc("content.getChapterPages", { chapterId });
      } catch (_) {}
    }

    // Fallback: fetch by seriesSlug + chapterNumber
    if ((!pagesData || !pagesData.pages || pagesData.pages.length === 0) && seriesSlug && chapterNumber !== null) {
      try {
        pagesData = await this.trpc("content.getChapterPages", {
          seriesSlug,
          chapterNumber,
        });
      } catch (_) {}
    }

    // Web endpoint fallbacks
    if (!pagesData || !pagesData.pages || pagesData.pages.length === 0) {
      if (chapterId) {
        try {
          pagesData = await this.trpc("content.getChapterPagesWeb", { chapterId });
        } catch (_) {}
      }
      if ((!pagesData || !pagesData.pages || pagesData.pages.length === 0) && seriesSlug && chapterNumber !== null) {
        try {
          pagesData = await this.trpc("content.getChapterPagesWeb", {
            seriesSlug,
            chapterNumber,
          });
        } catch (_) {}
      }
    }

    const rawPages = (pagesData && pagesData.pages) || [];
    const pageUrls = rawPages.map((p) => this.resolveCover(p, cleanBase));

    return {
      urls: pageUrls,
      headers: {
        Referer: `${cleanBase}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    };
  }
}
