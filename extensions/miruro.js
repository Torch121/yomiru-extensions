// ==YomiruExtension==
// @name         Miruro
// @version      v1.0.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://www.miruro.cx/favicon.ico
// @package      cx.miruro
// @type         bangumi
// @webSite      https://www.miruro.cx
// @nsfw         false
// @description  Stream high-quality anime with multi-track SUB, DUB, and Soft-SUB streams, multi-CDN HLS playback, multilingual subtitles, and intro/outro skip times from Miruro.
// ==/YomiruExtension==

export default class extends Extension {
  get defaultBaseUrl() {
    return "https://www.miruro.cx";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("miruro_url");
    return custom && custom.trim() ? custom.trim().replace(/\/+$/, "") : this.defaultBaseUrl;
  }

  async req(pathOrUrl, options = {}) {
    const base = await this.getBaseUrl();
    const fullUrl = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    return this.request(fullUrl, {
      ...options,
      encoding: "base64",
      headers: {
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Priority": "u=1, i",
        "Referer": `${base}/`,
        "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        ...(options.headers || {}),
      },
    });
  }

  async _decryptPayload(b64OrBuffer) {
    if (!b64OrBuffer) return null;
    let b64 = typeof b64OrBuffer === "string" ? b64OrBuffer : "";
    if (!b64 && typeof Buffer !== "undefined" && Buffer.isBuffer(b64OrBuffer)) {
      b64 = b64OrBuffer.toString("base64");
    }

    const rawBinary = atob(b64);
    const key = "miruro/catalog";
    let xorBinary = "";
    for (let i = 0; i < rawBinary.length; i++) {
      xorBinary += String.fromCharCode(rawBinary.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    const xorB64 = btoa(xorBinary);

    // 1. Native Yomiru bridge decompressor
    if (typeof this.decompressGzip === "function") {
      try {
        const jsonStr = await this.decompressGzip(xorB64);
        if (jsonStr) return JSON.parse(jsonStr);
      } catch (_) {}
    }

    // 2. Node.js environment fallback
    if (typeof require !== "undefined") {
      try {
        const zlib = require("zlib");
        const buf = Buffer.from(xorB64, "base64");
        return JSON.parse(zlib.gunzipSync(buf).toString("utf-8"));
      } catch (_) {}
    }

    return null;
  }

  async load() {
    await this.registerSetting({
      title: "Miruro Mirror URL",
      key: "miruro_url",
      type: "input",
      description: "Base mirror URL for Miruro (default: https://www.miruro.cx)",
      defaultValue: "https://www.miruro.cx",
    });

    await this.registerSetting({
      title: "Preferred Track",
      key: "preferred_track",
      type: "radio",
      description: "Default audio & subtitle preference (SUB, DUB, or Soft-SUB)",
      defaultValue: "sub",
      options: {
        sub: "SUB (Hardcoded)",
        dub: "DUB (English / Dubbed)",
        ssub: "Soft-SUB (Multi-Language Subtitles)",
      },
    });

    await this.registerSetting({
      title: "Preferred Provider",
      key: "preferred_provider",
      type: "radio",
      description: "Default upstream stream provider source",
      defaultValue: "icarus",
      options: {
        icarus: "Icarus (Primary Multi-CDN)",
        anikoto: "Anikoto (MegaPlay / Vidstream)",
        kickassanime: "KickAssAnime (Vid)",
        animepahe: "AnimePahe (Pahe CDN)",
        aniwaves: "AniWaves (Vidplay)",
      },
    });
  }

  get filters() {
    return this.getFilterSchema();
  }

  getFilterSchema() {
    return {
      sort: {
        title: "Sort Order",
        options: {
          "-popularity": "Most Popular",
          "popularity": "Least Popular",
          "-score": "Highest Score",
          "score": "Lowest Score",
          "title": "Title (A-Z)",
          "-title": "Title (Z-A)",
          "-season_year": "Newest Season",
          "season_year": "Oldest Season",
          "-updated_at": "Recently Updated",
        },
      },
      format: {
        title: "Format",
        options: {
          "": "All Formats",
          "TV": "TV Series",
          "TV_SHORT": "TV Short",
          "MOVIE": "Movie",
          "SPECIAL": "Special",
          "OVA": "OVA",
          "ONA": "ONA",
          "MUSIC": "Music",
        },
      },
      status: {
        title: "Status",
        options: {
          "": "All Statuses",
          "RELEASING": "Currently Airing",
          "FINISHED": "Completed",
          "NOT_YET_RELEASED": "Upcoming / Unreleased",
          "CANCELLED": "Cancelled",
          "HIATUS": "On Hiatus",
        },
      },
      season: {
        title: "Season",
        options: {
          "": "All Seasons",
          "WINTER": "Winter",
          "SPRING": "Spring",
          "SUMMER": "Summer",
          "FALL": "Fall",
        },
      },
    };
  }

  _formatAnimeItems(data) {
    const list = Array.isArray(data)
      ? data
      : (data && Array.isArray(data.data) ? data.data : []);

    const items = [];
    for (const item of list) {
      if (!item || !item.id) continue;
      const titleObj = item.title || {};
      const english = titleObj.english || "";
      const romaji = titleObj.romaji || "";
      const native = titleObj.native || "";
      const title = english || romaji || native || "Unknown Anime";

      const slug = (romaji || english || "anime")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      items.push({
        title,
        url: `/watch/${item.id}/${slug}`,
        cover: item.cover_url || item.banner_url || "",
      });
    }
    return items;
  }

  // 1. Popular Anime
  async popular(page) {
    const res = await this.req("/api/v1/anime?sort=-popularity&limit=12");
    const json = await this._decryptPayload(res);
    return this._formatAnimeItems(json);
  }

  // 2. Latest / Trending Releases
  async latest(page) {
    const res = await this.req("/api/v1/anime/trending?limit=12&status=RELEASING");
    const json = await this._decryptPayload(res);
    return this._formatAnimeItems(json);
  }

  // 3. Search Anime
  async search(kw, page, filter) {
    let queryToSearch = "";
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      queryToSearch = en || jp || "";
    } else {
      queryToSearch = (kw || "").trim();
    }

    const params = [];
    if (queryToSearch) {
      params.push(`q=${encodeURIComponent(queryToSearch)}`);
    }
    params.push("limit=15");

    let sortParam = "-popularity";
    if (filter && typeof filter === "object") {
      if (filter.sort) sortParam = filter.sort;
      if (filter.format) params.push(`format=${encodeURIComponent(filter.format)}`);
      if (filter.status) params.push(`status=${encodeURIComponent(filter.status)}`);
      if (filter.season) params.push(`season=${encodeURIComponent(filter.season)}`);
      if (filter.season_year) params.push(`season_year=${encodeURIComponent(filter.season_year)}`);
    }
    params.push(`sort=${encodeURIComponent(sortParam)}`);

    const res = await this.req(`/api/v1/anime?${params.join("&")}`);
    const json = await this._decryptPayload(res);
    return this._formatAnimeItems(json);
  }

  // 4. Anime Details & Episodes List
  async detail(url) {
    let animeId = "";
    const cleanUrl = (url || "").trim();

    if (/^[A-Za-z0-9_-]{20,}$/.test(cleanUrl)) {
      animeId = cleanUrl;
    } else {
      const match = cleanUrl.match(/\/(?:watch|info)\/([A-Za-z0-9_-]+)/i);
      animeId = match ? match[1] : cleanUrl;
    }

    let title = "Unknown Anime";
    let cover = "";
    let desc = "";
    let slug = "anime";

    // 1. Fetch metadata from watch page SSR
    try {
      const pageRes = await this.req(`/watch/${animeId}`, {
        encoding: "utf-8",
        headers: { Accept: "text/html" },
      });
      const html = typeof pageRes === "string" ? pageRes : (pageRes && pageRes.body) || "";
      if (html.includes("__SSR_DATA__")) {
        const rawB64 = html.split("__SSR_DATA__")[1].split('"')[1];
        const ssrData = await this._decryptPayload(rawB64);
        if (ssrData) {
          const titleObj = ssrData.title || {};
          title = titleObj.english || titleObj.romaji || titleObj.native || title;
          cover = ssrData.cover_url || ssrData.banner_url || cover;
          desc = ssrData.description || desc;
          slug = (titleObj.romaji || titleObj.english || "anime")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        }
      }
    } catch (_) {}

    // 2. Fetch complete episode list
    const epRes = await this.req(`/api/v1/anime/${animeId}/episodes?limit=10000`, {
      headers: {
        Referer: `${await this.getBaseUrl()}/watch/${animeId}/${slug}`,
      },
    });

    const epJson = await this._decryptPayload(epRes);
    const rawList = Array.isArray(epJson)
      ? epJson
      : (epJson && Array.isArray(epJson.data) ? epJson.data : []);

    const sortedEpisodes = [...rawList].sort(
      (a, b) => (a.episode_number || 0) - (b.episode_number || 0)
    );

    const subList = [];
    const dubList = [];
    const ssubList = [];

    for (const ep of sortedEpisodes) {
      const num = ep.episode_number || 1;
      const displayName = ep.title ? `Episode ${num}: ${ep.title}` : `Episode ${num}`;

      subList.push({
        name: displayName,
        url: `/watch/${animeId}/${slug}?ep=${num}&track=sub`,
      });
      dubList.push({
        name: displayName,
        url: `/watch/${animeId}/${slug}?ep=${num}&track=dub`,
      });
      ssubList.push({
        name: displayName,
        url: `/watch/${animeId}/${slug}?ep=${num}&track=ssub`,
      });
    }

    const episodeGroups = [];
    if (subList.length > 0) {
      episodeGroups.push({
        title: "SUB",
        urls: subList,
      });
    }
    if (dubList.length > 0) {
      episodeGroups.push({
        title: "DUB",
        urls: dubList,
      });
    }
    if (ssubList.length > 0) {
      episodeGroups.push({
        title: "Soft-SUB",
        urls: ssubList,
      });
    }

    return {
      title,
      cover,
      desc,
      episodes: episodeGroups,
    };
  }

  // 5. Episode Stream & Subtitles Playback
  async watch(episodeUrl) {
    let animeId = "";
    const cleanUrl = (episodeUrl || "").trim();

    if (/^[A-Za-z0-9_-]{20,}$/.test(cleanUrl)) {
      animeId = cleanUrl;
    } else {
      const match = cleanUrl.match(/\/(?:watch|info)\/([A-Za-z0-9_-]+)/i);
      animeId = match ? match[1] : cleanUrl;
    }

    let epNum = 1;
    const epQueryMatch = cleanUrl.match(/[?&]ep=(\d+)/i);
    const epPathMatch = cleanUrl.match(/\/ep-(\d+)/i);
    if (epQueryMatch) {
      epNum = parseInt(epQueryMatch[1], 10);
    } else if (epPathMatch) {
      epNum = parseInt(epPathMatch[1], 10);
    }

    let preferredTrack = await this.getSetting("preferred_track");
    if (cleanUrl.includes("track=dub") || cleanUrl.includes("type=dub")) {
      preferredTrack = "dub";
    } else if (cleanUrl.includes("track=ssub") || cleanUrl.includes("type=ssub")) {
      preferredTrack = "ssub";
    } else if (cleanUrl.includes("track=sub") || cleanUrl.includes("type=sub")) {
      preferredTrack = "sub";
    }
    if (!preferredTrack) preferredTrack = "sub";

    const preferredProvider = (await this.getSetting("preferred_provider")) || "icarus";

    const playRes = await this.req(`/api/v1/anime/${animeId}/episodes/${epNum}/play`, {
      headers: {
        Referer: `${await this.getBaseUrl()}/watch/${animeId}?ep=${epNum}`,
      },
    });

    const playData = await this._decryptPayload(playRes);
    if (!playData || !Array.isArray(playData.tracks)) {
      throw new Error(`Failed to retrieve playback data for episode ${epNum}`);
    }

    const tracks = playData.tracks;
    let selectedTrack = tracks.find((t) => t.track.toLowerCase() === preferredTrack);
    if (!selectedTrack) {
      if (preferredTrack === "sub") {
        selectedTrack = tracks.find((t) => t.track.toLowerCase() === "ssub");
      }
      selectedTrack = selectedTrack || tracks[0];
    }

    if (!selectedTrack || !Array.isArray(selectedTrack.providers) || selectedTrack.providers.length === 0) {
      throw new Error(`No available streaming providers for track '${preferredTrack}'`);
    }

    const providerOrder = [preferredProvider, "icarus", "anikoto", "kickassanime", "animepahe", "aniwaves"];
    const sortedProviders = [...selectedTrack.providers].sort((a, b) => {
      const aIdx = providerOrder.indexOf((a.provider || "").toLowerCase());
      const bIdx = providerOrder.indexOf((b.provider || "").toLowerCase());
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    let primaryStreamUrl = null;
    let streamHeaders = {
      "Origin": "https://ultracloud.cc",
      "Referer": "https://ultracloud.cc/",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    };
    const subtitles = [];

    for (const prov of sortedProviders) {
      const provSubs = Array.isArray(prov.subtitles) ? prov.subtitles : [];
      const servers = Array.isArray(prov.servers) ? prov.servers : [];

      for (const srv of servers) {
        const srvHeaders = srv.headers || {};
        const streams = Array.isArray(srv.streams) ? srv.streams : [];

        for (const strm of streams) {
          if (!strm || !strm.url) continue;

          if (!primaryStreamUrl) {
            primaryStreamUrl = strm.url;
            if (srvHeaders.Origin) streamHeaders["Origin"] = srvHeaders.Origin;
            if (srvHeaders.Referer) streamHeaders["Referer"] = srvHeaders.Referer;
          }

          const rawSubs = [...provSubs, ...(Array.isArray(strm.subtitles) ? strm.subtitles : [])];
          for (const sub of rawSubs) {
            const subUrl = sub.file || sub.url || sub.src;
            if (!subUrl) continue;
            const subLang = sub.language || sub.lang || "en";
            const subLabel = sub.label || sub.title || subLang.toUpperCase();
            const subDefault = !!sub.default;

            if (!subtitles.some((s) => s.file === subUrl)) {
              subtitles.push({
                language: subLang,
                label: subLabel,
                file: subUrl,
                format: sub.format || (subUrl.endsWith(".vtt") ? "vtt" : "ass"),
                default: subDefault,
              });
            }
          }
        }
      }
    }

    if (!primaryStreamUrl) {
      throw new Error("No playable HLS streaming URL found for this episode.");
    }

    return {
      url: primaryStreamUrl,
      headers: streamHeaders,
      subtitles: subtitles,
    };
  }
}
