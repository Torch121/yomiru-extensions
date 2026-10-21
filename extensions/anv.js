// ==YomiruExtension==
// @name         Anv
// @version      v1.0.1
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://anv.to/favicon.ico
// @package      to.anv
// @type         bangumi
// @webSite      https://anv.to
// @nsfw         false
// @description  Stream high-quality subbed and dubbed anime with fast multi-resolution M3U8 playback from Anv.to
// ==/YomiruExtension==

export default class extends Extension {
  get defaultBaseUrl() {
    return "https://anv.to";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("anv_url");
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
        "Referer": `${base}/browse`,
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
      title: "Anv URL",
      key: "anv_url",
      type: "input",
      description: "Base mirror URL for Anv.to",
      defaultValue: "https://anv.to",
    });
  }

  get filters() {
    return this.getFilterSchema();
  }

  getFilterSchema() {
    return {
      sortBy: {
        title: "Sort By",
        options: {
          "": "Default (Trending)",
          "POPULARITY_DESC": "Popularity",
          "UPDATED_AT_DESC": "Recently Updated",
          "SCORE_DESC": "Average Score",
          "START_DATE_DESC": "Release Date",
        },
      },
    };
  }

  async _catalogQuery(operation, variables = {}) {
    const res = await this.req("/api/catalog", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify({
        operation,
        variables,
      }),
    });

    const parsed = this.parseJson(res);
    return parsed?.data;
  }

  _formatAnime(item) {
    if (!item) return null;
    const title =
      item.title?.english || item.title?.romaji || item.title?.native || item.slug || "Unknown Title";
    const cover =
      item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || "";

    return {
      title,
      cover,
      url: item.slug || String(item.id),
    };
  }

  async popular(page) {
    const p = Math.max(1, page || 1);
    const data = await this._catalogQuery("PopularAnime", {
      page: p,
      perPage: 20,
    });
    const media = data?.Page?.media || [];
    return media.map((it) => this._formatAnime(it)).filter(Boolean);
  }

  async latest(page) {
    const p = Math.max(1, page || 1);
    const data = await this._catalogQuery("BrowseAnime", {
      page: p,
      perPage: 20,
      sort: ["UPDATED_AT_DESC"],
    });
    const media = data?.Page?.media || [];
    return media.map((it) => this._formatAnime(it)).filter(Boolean);
  }

  async search(kw, page, filter) {
    const p = Math.max(1, page || 1);
    let query = "";

    if (typeof kw === "object" && kw !== null) {
      query = kw.englishTitle || kw.english || kw.japaneseTitle || kw.nativeTitle || kw.query || "";
    } else {
      query = String(kw || "").trim();
    }

    if (!query) {
      const sort = filter?.sortBy ? [filter.sortBy] : ["POPULARITY_DESC"];
      const data = await this._catalogQuery("BrowseAnime", {
        page: p,
        perPage: 20,
        sort,
      });
      const media = data?.Page?.media || [];
      return media.map((it) => this._formatAnime(it)).filter(Boolean);
    }

    const data = await this._catalogQuery("SearchAnime", {
      search: query,
      page: p,
    });
    const media = data?.Page?.media || [];
    return media.map((it) => this._formatAnime(it)).filter(Boolean);
  }

  async detail(slugOrUrl) {
    let cleanSlug = slugOrUrl;
    if (typeof cleanSlug === "string") {
      if (cleanSlug.includes("/anime/")) {
        const parts = cleanSlug.split("/anime/")[1].split("/")[0].split("?")[0];
        cleanSlug = parts.replace(/^\d+-/, "");
      } else if (cleanSlug.startsWith("http")) {
        const parts = cleanSlug.split("/").pop().split("?")[0];
        cleanSlug = parts.replace(/^\d+-/, "");
      }
    }

    const data = await this._catalogQuery("AnimeDetail", { slug: cleanSlug });
    const media = data?.Media;
    if (!media) {
      throw new Error(`Anime not found for slug: ${cleanSlug}`);
    }

    const title =
      media.title?.english || media.title?.romaji || media.title?.native || media.slug || "Unknown Title";
    const cover = media.coverImage?.extraLarge || media.coverImage?.large || "";
    const desc = (media.description || "").replace(/<[^>]*>/g, "").trim();

    const episodes = [];
    if (Array.isArray(media.streamingEpisodes) && media.streamingEpisodes.length > 0) {
      media.streamingEpisodes.forEach((ep, idx) => {
        const epNumMatch = ep.title ? ep.title.match(/(?:Episode|ep\.?)\s*(\d+(?:\.\d+)?)/i) : null;
        const num = epNumMatch ? parseFloat(epNumMatch[1]) : idx + 1;
        episodes.push({
          name: ep.title || `Episode ${num}`,
          url: `${media.slug}:${media.id}:${media.idMal || 0}:${num}`,
        });
      });
    } else {
      const total = media.episodes || (media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : 1);
      for (let i = 1; i <= Math.max(1, total); i++) {
        episodes.push({
          name: `Episode ${i}`,
          url: `${media.slug}:${media.id}:${media.idMal || 0}:${i}`,
        });
      }
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "Episodes",
          urls: episodes,
        },
      ],
    };
  }

  async watch(target) {
    const base = await this.getBaseUrl();
    let slug = target;
    let anilistId = null;
    let malId = null;
    let episodeNumber = 1;

    if (typeof target === "string" && target.includes(":")) {
      const parts = target.split(":");
      slug = parts[0];
      anilistId = parts[1] && parts[1] !== "null" && parts[1] !== "0" ? parseInt(parts[1], 10) : null;
      malId = parts[2] && parts[2] !== "null" && parts[2] !== "0" ? parseInt(parts[2], 10) : null;
      episodeNumber = parts[3] ? parseFloat(parts[3]) : 1;
    } else if (typeof target === "string" && target.includes("-episode-")) {
      const match = target.match(/\/anime\/([a-zA-Z0-9_\-]+)-episode-(\d+)/);
      if (match) {
        slug = match[1].replace(/^\d+-/, "");
        episodeNumber = parseFloat(match[2]);
      }
    }

    if (!anilistId) {
      const details = await this.detail(slug);
      const epUrl = details.episodes?.[0]?.urls?.[episodeNumber - 1]?.url || details.episodes?.[0]?.urls?.[0]?.url;
      if (epUrl && epUrl.includes(":")) {
        const parts = epUrl.split(":");
        anilistId = parseInt(parts[1], 10);
        malId = parseInt(parts[2], 10);
      }
    }

    // Step 1: Request watch page to acquire shiro_watch session cookie
    const watchPageUrl = `/anime/${slug}-episode-${episodeNumber}`;
    const pageRes = await this.req(watchPageUrl, {
      fullResponse: true,
      headers: {
        Referer: `${base}/anime/${slug}`,
      },
    });

    let cookie = "";
    const pageObj = typeof pageRes === "string" ? this.parseJson(pageRes) : pageRes;
    const pageHeaders = pageObj?.headers;
    const setCookie = pageHeaders?.["set-cookie"] || pageHeaders?.["Set-Cookie"];
    if (setCookie) {
      const match = String(setCookie).match(/shiro_watch=([^;]+)/);
      if (match) {
        cookie = match[1];
      }
    }

    const defaultHeaders = {
      Referer: `${base}/`,
      Origin: base,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    };
    if (cookie) {
      defaultHeaders["Cookie"] = `shiro_watch=${cookie}`;
    }

    // Step 2: Request stream sources
    const epRes = await this.req("/api/episode", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: `${base}${watchPageUrl}`,
        ...(cookie ? { Cookie: `shiro_watch=${cookie}` } : {}),
      },
      data: JSON.stringify({
        anilistId,
        malId,
        episode: episodeNumber,
      }),
    });

    const epData = this.parseJson(epRes);
    const sources = [];
    const subtitles = [];

    if (epData && epData.variants && Array.isArray(epData.variants)) {
      for (const variant of epData.variants) {
        const variantLabel = variant.label || variant.id || "Sub";
        for (const src of variant.sources || []) {
          const streamUrl = src.url.startsWith("http") ? src.url : `${base}${src.url}`;
          sources.push({
            name: `${variantLabel} - ${src.label || src.id || "Stream"}`,
            url: streamUrl,
            quality: "Auto",
            isM3U8: true,
            headers: { ...defaultHeaders },
          });

          if (Array.isArray(src.tracks)) {
            for (const t of src.tracks) {
              if (t.url) {
                subtitles.push({
                  title: t.label || "Subtitle",
                  url: t.url.startsWith("http") ? t.url : `${base}${t.url}`,
                  language: t.language || "en",
                });
              }
            }
          }
        }
      }
    }

    const primaryUrl = sources[0]?.url || "";
    if (!primaryUrl) {
      throw new Error(`No stream available for ${slug} episode ${episodeNumber}`);
    }

    return {
      type: "hls",
      url: primaryUrl,
      headers: defaultHeaders,
      subtitles,
      sources,
    };
  }
}
