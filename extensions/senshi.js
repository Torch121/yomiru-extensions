// ==YomiruExtension==
// @name         Senshi
// @version      v1.0.1
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://senshi.to/favicon.ico
// @package      to.senshi
// @type         bangumi
// @webSite      https://senshi.to
// @nsfw         false
// @description  Stream anime in high definition with English subs and dubs from Senshi.to
// ==/YomiruExtension==

export default class extends Extension {
  get defaultBaseUrl() {
    return "https://senshi.to";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("senshi_url");
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
        "Referer": `${base}/`,
        "Origin": base,
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
      title: "Senshi URL",
      key: "senshi_url",
      type: "input",
      description: "Base mirror URL for Senshi.to",
      defaultValue: "https://senshi.to",
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
          "": "Default",
          "score_desc": "Highest Score",
          "created_at_desc": "Recently Added",
        },
      },
    };
  }

  _formatAnime(item, base) {
    if (!item) return null;
    const title = item.title_english || item.title || "Unknown Title";
    let cover = item.anime_picture || item.poster || item.banner || "";
    if (cover && !cover.startsWith("http")) {
      cover = `${base}${cover.startsWith("/") ? "" : "/"}${cover}`;
    }

    return {
      title,
      cover,
      url: item.public_id || String(item.id),
    };
  }

  async popular(page) {
    const base = await this.getBaseUrl();
    const p = Math.max(1, page || 1);
    const res = await this.req("/anime/filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        sortBy: "score_desc",
        page: p,
        limit: 20,
      }),
    });
    const data = this.parseJson(res);
    const items = data?.data || [];
    return items.map((it) => this._formatAnime(it, base)).filter(Boolean);
  }

  async latest(page) {
    const base = await this.getBaseUrl();
    const p = Math.max(1, page || 1);
    const res = await this.req("/anime/filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        page: p,
        limit: 20,
      }),
    });
    const data = this.parseJson(res);
    const items = data?.data || [];
    return items.map((it) => this._formatAnime(it, base)).filter(Boolean);
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

    const payload = {
      searchTerm: query,
      page: p,
      limit: 20,
    };
    if (filter?.sortBy) {
      payload.sortBy = filter.sortBy;
    }

    const res = await this.req("/anime/filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(payload),
    });
    const data = this.parseJson(res);
    const items = data?.data || [];
    return items.map((it) => this._formatAnime(it, base)).filter(Boolean);
  }

  async detail(idOrPublicId) {
    const base = await this.getBaseUrl();
    let cleanId = idOrPublicId;
    if (typeof cleanId === "string") {
      if (cleanId.includes("/watch/")) {
        const parts = cleanId.split("/watch/")[1].split("/")[0];
        cleanId = parts;
      } else if (cleanId.startsWith("http")) {
        const parts = cleanId.split("/").pop().split("?")[0];
        cleanId = parts;
      }
    }

    const animeRes = await this.req(`/anime/${cleanId}`);
    const anime = this.parseJson(animeRes);
    if (!anime || (!anime.id && !anime.public_id)) {
      throw new Error(`Anime not found: ${cleanId}`);
    }

    let episodes = [];
    try {
      const epRes = await this.req(`/episodes/${anime.id}`);
      const parsedEp = this.parseJson(epRes);
      episodes = Array.isArray(parsedEp) ? parsedEp : [];
    } catch (_) {}

    const title = anime.title_english || anime.title || cleanId;
    let cover = anime.anime_picture || anime.poster || anime.banner || "";
    if (cover && !cover.startsWith("http")) {
      cover = `${base}${cover.startsWith("/") ? "" : "/"}${cover}`;
    }
    const desc = (anime.synopsis || anime.description || "").trim();

    const formattedEpisodes = episodes.map((ep) => {
      const epNum = ep.episode_number ?? 1;
      return {
        name: ep.title ? `Ep ${epNum}: ${ep.title}` : `Episode ${epNum}`,
        url: `${anime.public_id || cleanId}:${anime.id}:${epNum}`,
      };
    });

    if (formattedEpisodes.length === 0) {
      const epCount = anime.episodes_count || 1;
      for (let i = 1; i <= epCount; i++) {
        formattedEpisodes.push({
          name: `Episode ${i}`,
          url: `${anime.public_id || cleanId}:${anime.id}:${i}`,
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
          urls: formattedEpisodes,
        },
      ],
    };
  }

  async _resolveVidcloud(remoteSourceId) {
    try {
      if (typeof globalThis.fetch === "function" && !globalThis.fetch.__senshiWrapped) {
        const origFetch = globalThis.fetch;
        globalThis.fetch = function (resource, init = {}) {
          let customHeaders = {};
          if (init.headers) {
            if (typeof init.headers.forEach === "function") {
              init.headers.forEach((v, k) => {
                customHeaders[k] = v;
              });
            } else if (typeof init.headers === "object") {
              customHeaders = { ...init.headers };
            }
          }
          customHeaders["Origin"] = "https://senshi.to";
          customHeaders["Referer"] = "https://senshi.to/";
          if (!customHeaders["User-Agent"] && !customHeaders["user-agent"]) {
            customHeaders["User-Agent"] =
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
          }
          return origFetch(resource, { ...init, headers: customHeaders });
        };
        globalThis.fetch.__senshiWrapped = true;
      }

      if (!globalThis.__oct) {
        const vendorRes = await this.request("https://cdn.vidcloud.se/vjs/vendor.js", {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: "https://senshi.to/",
            Origin: "https://senshi.to",
          },
        });
        const vendorJs = typeof vendorRes === "string" ? vendorRes : "";
        if (!vendorJs) return null;

        if (typeof globalThis.window === "undefined") {
          globalThis.window = globalThis;
        }
        globalThis.window.location = {
          origin: "https://senshi.to",
          href: "https://senshi.to/watch/" + remoteSourceId,
          hostname: "senshi.to",
        };
        globalThis.location = globalThis.window.location;
        if (typeof globalThis.document === "undefined") {
          globalThis.document = {};
        }
        globalThis.document.currentScript = {
          src: "https://cdn.vidcloud.se/vjs/vendor.js",
          dataset: {},
        };
        if (!globalThis.document.createElement) {
          globalThis.document.createElement = () => ({ tagName: "", setAttribute: () => {}, style: {} });
        }
        if (!globalThis.document.head) {
          globalThis.document.head = { appendChild: () => {} };
        }
        if (!globalThis.document.querySelector) {
          globalThis.document.querySelector = () => null;
        }

        (new Function(vendorJs))();
      }

      if (globalThis.__oct && typeof globalThis.__oct.open === "function") {
        const result = await globalThis.__oct.open(Number(remoteSourceId));
        return Array.isArray(result) ? result[0] : result;
      }
    } catch (_) {}
    return null;
  }

  async watch(target) {
    const base = await this.getBaseUrl();
    let pubId = target;
    let numericId = null;
    let episodeNumber = 1;

    if (typeof target === "string" && target.includes(":")) {
      const parts = target.split(":");
      pubId = parts[0];
      numericId = parseInt(parts[1], 10);
      episodeNumber = parts[2] ? parseInt(parts[2], 10) : 1;
    } else if (typeof target === "string" && target.includes("/watch/")) {
      const match = target.match(/\/watch\/([^/]+)\/(\d+)/);
      if (match) {
        pubId = match[1];
        episodeNumber = parseInt(match[2], 10);
      }
    }

    if (!numericId) {
      const animeRes = await this.req(`/anime/${pubId}`);
      const anime = this.parseJson(animeRes);
      numericId = anime?.id;
    }

    if (!numericId) {
      throw new Error(`Unable to resolve numeric ID for Senshi anime ${pubId}`);
    }

    const embedsRes = await this.req(`/episode-embeds/${numericId}/${episodeNumber}`);
    const embeds = this.parseJson(embedsRes);

    if (!Array.isArray(embeds) || embeds.length === 0) {
      throw new Error(`No episode embeds found for anime ${pubId} episode ${episodeNumber}`);
    }

    const sources = [];
    const subtitles = [];
    const seenUrls = new Set();
    const defaultHeaders = {
      Referer: `${base}/`,
      Origin: base,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    };

    for (const embed of embeds) {
      let label = embed.status || "Sub";
      if (embed.audio_language) {
        label = embed.audio_language.toLowerCase().includes("dub") ? "Dub" : "Sub";
      } else if (label.toLowerCase() === "sub" || label.toLowerCase() === "hardsub") {
        label = "Sub";
      } else if (label.toLowerCase().includes("dub")) {
        label = "Dub";
      }

      // Attempt Vidcloud resolution
      if (embed.remote_source_id) {
        const resolved = await this._resolveVidcloud(embed.remote_source_id);
        const streamUrl = resolved?.source?.[0]?.src || resolved?.src;
        if (streamUrl && !seenUrls.has(streamUrl)) {
          seenUrls.add(streamUrl);
          sources.push({
            name: `Senshi - ${label} (Master 1080p)`,
            url: streamUrl,
            quality: "1080p",
            isM3U8: true,
            headers: defaultHeaders,
          });
        }

        if (Array.isArray(resolved?.tracks)) {
          for (const tr of resolved.tracks) {
            const subUrl = tr.vtt_url || tr.url;
            if (subUrl && (subUrl.endsWith(".vtt") || subUrl.includes(".vtt"))) {
              subtitles.push({
                title: tr.label || "English",
                url: subUrl,
                language: tr.label?.toLowerCase()?.includes("ai") ? "en-ai" : "en",
              });
            }
          }
        }
      }
    }

    // If no Vidcloud stream was resolved, check if any embed has a valid mirror
    if (sources.length === 0) {
      for (const embed of embeds) {
        const label = embed.status || "Mirror";
        if (embed.url && !embed.url.includes("anidap.biz") && !seenUrls.has(embed.url)) {
          seenUrls.add(embed.url);
          sources.push({
            name: `Senshi - ${label} (Mirror)`,
            url: embed.url,
            quality: "Auto",
            isM3U8: true,
            headers: defaultHeaders,
          });
        }
      }
    }

    if (sources.length === 0) {
      sources.push({
        name: "Senshi Web Player",
        url: `${base}/watch/${pubId}/${episodeNumber}`,
        quality: "Auto",
        isM3U8: true,
        headers: defaultHeaders,
      });
    }

    return {
      type: "hls",
      url: sources[0].url,
      headers: defaultHeaders,
      subtitles,
      sources,
    };
  }
}
