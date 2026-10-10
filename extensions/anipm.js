// ==YomiruExtension==
// @name         Ani.pm
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://ani.pm/icon.png
// @package      pm.ani
// @type         bangumi
// @webSite      https://ani.pm
// @nsfw         false
// @description  Watch Anime Online in HD with multi-language soft/hard subtitles (Arabic, English, French, etc.) and English Dubs from Ani.pm
// ==/YomiruExtension==

export default class extends Extension {
  get defaultBaseUrl() {
    return "https://ani.pm";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("anipm_url");
    return (custom && custom.trim()) ? custom.trim().replace(/\/+$/, "") : this.defaultBaseUrl;
  }

  async req(pathOrUrl, options = {}) {
    const base = await this.getBaseUrl();
    const fullUrl = pathOrUrl.startsWith("http") ? pathOrUrl : `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
    const cleanUrl = encodeURI(decodeURI(fullUrl));

    return this.request(cleanUrl, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
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
      title: "Ani.pm URL",
      key: "anipm_url",
      type: "input",
      description: "Base homepage URL for Ani.pm",
      defaultValue: "https://ani.pm",
    });

    await this.registerSetting({
      title: "Preferred Audio",
      key: "preferred_audio",
      type: "radio",
      description: "Default audio preference (Sub or Dub)",
      defaultValue: "sub",
    });
  }

  _formatCover(path, baseUrl = "https://ani.pm") {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  _parseAnimeItems(items, baseUrl = "https://ani.pm") {
    if (!Array.isArray(items)) return [];
    const results = [];

    for (const item of items) {
      if (!item) continue;
      const id = item.id || item.routeId || item.slug;
      if (!id) continue;

      const title = item.title || item.native || "";
      const cover = this._formatCover(item.poster || item.banner, baseUrl);

      let update = "";
      if (item.episodeCount != null) {
        update = `${item.episodeCount} Ep`;
      } else if (item.epNumber != null) {
        update = `Ep ${item.epNumber}`;
      } else if (item.year != null) {
        update = String(item.year);
      }

      const url = `${baseUrl}/anime/${item.routeId || id}`;

      results.push({
        title: title.trim(),
        url,
        cover,
        update,
      });
    }

    return results;
  }

  // 1. Popular Anime Catalog
  async popular(page) {
    const p = Math.max(1, page || 1);
    const base = await this.getBaseUrl();

    if (p === 1) {
      try {
        const topRes = await this.req("/api/anime/top-watched?range=week");
        const topData = this.parseJson(topRes);
        const topItems = Array.isArray(topData) ? topData : (topData && topData.items) || [];
        if (topItems.length > 0) {
          return this._parseAnimeItems(topItems, base);
        }
      } catch (e) {}
    }

    const catRes = await this.req(`/api/anime/catalog?page=${p}&sort=popular`);
    const catData = this.parseJson(catRes);
    const items = (catData && catData.items) || [];
    return this._parseAnimeItems(items, base);
  }

  // 2. Latest Releases
  async latest(page) {
    const p = Math.max(1, page || 1);
    const base = await this.getBaseUrl();

    if (p === 1) {
      try {
        const latestRes = await this.req("/api/anime/latest-episodes");
        const latestData = this.parseJson(latestRes);
        const latestItems = Array.isArray(latestData) ? latestData : (latestData && latestData.items) || [];
        if (latestItems.length > 0) {
          return this._parseAnimeItems(latestItems, base);
        }
      } catch (e) {}
    }

    const catRes = await this.req(`/api/anime/catalog?page=${p}&sort=latest`);
    const catData = this.parseJson(catRes);
    const items = (catData && catData.items) || [];
    return this._parseAnimeItems(items, base);
  }

  // 3. Search Anime with Japanese-first fallback
  async search(kw, page) {
    const p = Math.max(1, page || 1);
    let queryToSearch = "";

    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      if (jp && jp.trim()) {
        const jpResults = await this._rawSearch(jp.trim(), p);
        if (jpResults && jpResults.length > 0) {
          return jpResults;
        }
      }
      queryToSearch = en || jp || "";
    } else {
      queryToSearch = (kw || "").trim();
    }

    if (!queryToSearch) {
      return this.popular(p);
    }

    return this._rawSearch(queryToSearch, p);
  }

  async _rawSearch(query, p) {
    const base = await this.getBaseUrl();
    if (p === 1) {
      try {
        const searchRes = await this.req(`/api/anime/search?q=${encodeURIComponent(query)}`);
        const searchData = this.parseJson(searchRes);
        const items = Array.isArray(searchData) ? searchData : (searchData && searchData.items) || [];
        if (items.length > 0) {
          return this._parseAnimeItems(items, base);
        }
      } catch (e) {}
    }

    const catRes = await this.req(`/api/anime/catalog?page=${p}&search=${encodeURIComponent(query)}`);
    const catData = this.parseJson(catRes);
    const items = (catData && catData.items) || [];
    return this._parseAnimeItems(items, base);
  }

  _extractId(url) {
    if (!url) return null;
    const str = String(url).trim();

    // /ani/:id
    const anilistMatch = str.match(/(?:ani\.pm\/ani\/|^ani:|^ani\/)(\d+)/i);
    if (anilistMatch) {
      return { id: anilistMatch[1], isAnilist: true };
    }

    // /anime/:slug-:id or /anime/:id or digits
    const animeMatch = str.match(/(?:ani\.pm\/anime\/)?(?:[a-z0-9-]+-)?(\d+)(?:\/\d+)?$/i);
    if (animeMatch) {
      return { id: animeMatch[1], isAnilist: false };
    }

    const plainMatch = str.match(/^(\d+)$/);
    if (plainMatch) {
      return { id: plainMatch[1], isAnilist: false };
    }

    return null;
  }

  // 4. Anime Series Details & Episode List
  async detail(url) {
    const base = await this.getBaseUrl();
    const target = this._extractId(url);

    if (!target) {
      throw new Error(`Unable to resolve anime ID from: ${url}`);
    }

    const endpoint = target.isAnilist
      ? `/api/anime/ani/${target.id}`
      : `/api/anime/series/${target.id}`;

    const res = await this.req(endpoint);
    const data = this.parseJson(res);

    if (!data || data.error) {
      throw new Error(`Failed to load anime details: ${(data && data.error) || "Not found"}`);
    }

    const title = data.title || data.native || "Anime";
    const cover = this._formatCover(data.poster || data.banner, base);
    const desc = data.description || data.synopsis || "";

    const rawEpisodes = Array.isArray(data.episodes) ? data.episodes : [];
    const episodeUrls = [];
    const sourceParam = data.source || (target.isAnilist ? "anilist" : "settlar");

    if (rawEpisodes.length > 0) {
      for (const ep of rawEpisodes) {
        const num = ep.number != null ? ep.number : 1;
        let epName = `Episode ${num}`;
        if (ep.title && ep.title !== `Episode ${num}`) {
          epName = `Episode ${num}: ${ep.title}`;
        }
        episodeUrls.push({
          name: epName,
          url: `${base}/anime/${target.id}/${num}?source=${sourceParam}`,
        });
      }
    } else {
      // Movie / single video fallback
      episodeUrls.push({
        name: "Full Movie",
        url: `${base}/anime/${target.id}/1?source=${sourceParam}`,
      });
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "Episodes",
          urls: episodeUrls,
        },
      ],
    };
  }

  // 5. Streams & Subtitles Extraction
  async watch(url) {
    const base = await this.getBaseUrl();
    const epMatch = url.match(/\/anime\/(\d+)\/(\d+(?:\.\d+)?)/i);
    let animeId = epMatch ? epMatch[1] : null;
    let epNum = epMatch ? parseFloat(epMatch[2]) : 1;

    let isAnilist = false;
    if (url.includes("/ani/")) {
      isAnilist = true;
    }

    if (!animeId) {
      const altMatch = this._extractId(url);
      if (altMatch) {
        animeId = altMatch.id;
        if (altMatch.isAnilist) isAnilist = true;
      }
    }

    if (!animeId) {
      throw new Error(`Invalid episode URL: ${url}`);
    }

    const prefLang = (await this.getSetting("preferred_audio")) || "sub";
    const lang = prefLang === "dub" ? "dub" : "sub";

    // Detect source type: query parameter > URL format > ID magnitude
    const sourceParamMatch = url.match(/[?&]source=([a-z0-9_-]+)/i);
    const explicitSource = sourceParamMatch ? sourceParamMatch[1].toLowerCase() : (isAnilist ? "anilist" : null);

    const sourceCandidates = [];
    if (explicitSource === "anilist") {
      sourceCandidates.push("anilist", "settlar");
    } else if (explicitSource === "settlar") {
      sourceCandidates.push("settlar", "anilist");
    } else {
      const numId = parseInt(animeId, 10);
      if (!isNaN(numId) && numId >= 20000) {
        sourceCandidates.push("anilist", "settlar");
      } else {
        sourceCandidates.push("settlar", "anilist");
      }
    }

    // 1. Fetch playback bootstrap with resilient source fallback
    let bootData = null;
    for (const prefix of sourceCandidates) {
      try {
        const bootstrapUrl = `/api/anime/playback-bootstrap/${prefix}/${animeId}?ep=${epNum}&lang=${lang}&backup=1`;
        const bootRes = await this.req(bootstrapUrl);
        const parsed = this.parseJson(bootRes);
        if (parsed && !parsed.error && (parsed.backupEmbed || parsed.settlarSelection || parsed.anipmPackages || parsed.core)) {
          bootData = parsed;
          break;
        }
      } catch (err) {}
    }

    bootData = bootData || {};

    const resolvedSources = [];
    let subtitles = [];

    // 2. Resolve MegaPlay Stream (Primary direct HLS stream)
    const backupUrl = bootData.backupEmbed && bootData.backupEmbed.url;
    if (backupUrl && backupUrl.includes("megaplay.buzz")) {
      try {
        const mpStreams = await this._resolveMegaPlay(backupUrl, lang);
        if (mpStreams && mpStreams.length > 0) {
          resolvedSources.push(...mpStreams);
          if (mpStreams[0].subtitles && mpStreams[0].subtitles.length > 0) {
            subtitles = mpStreams[0].subtitles;
          }
        }
      } catch (err) {}
    }

    // 3. Fallback: Settlar Direct Backup Stream
    if (bootData.backupEmbed?.direct?.stream) {
      resolvedSources.push({
        server: `Settlar Direct (${lang.toUpperCase()})`,
        url: bootData.backupEmbed.direct.stream,
        type: "hls",
        quality: "Auto",
        headers: {
          Referer: `${base}/`,
        },
      });
    }

    // 4. Fallback: Settlar Embed Session
    if (bootData.settlarSelection) {
      try {
        const sessionUrl = `/api/anime/settlar/session?selection=${encodeURIComponent(bootData.settlarSelection)}&provider=anipm&ep=${epNum}&channel=${lang}&telemetry=0`;
        const sessionRes = await this.req(sessionUrl);
        const sessionData = this.parseJson(sessionRes);
        if (sessionData && sessionData.embedUrl) {
          resolvedSources.push({
            server: `Settlar Player (${lang.toUpperCase()})`,
            url: sessionData.embedUrl,
            type: "iframe",
            quality: "Auto",
            headers: {
              Referer: `${base}/`,
            },
          });
        }
      } catch (err) {}
    }

    if (resolvedSources.length === 0) {
      throw new Error("No playable streaming sources found for this episode.");
    }

    const primarySource = resolvedSources.find(s => s.type === "hls") || resolvedSources[0];

    return {
      url: primarySource.url,
      type: primarySource.type,
      headers: primarySource.headers || { Referer: "https://megaplay.buzz/" },
      subtitles,
      sources: resolvedSources,
    };
  }

  async _resolveMegaPlay(embedUrl, lang = "sub") {
    // Fetch MegaPlay player page
    const pageRes = await this.request(embedUrl, {
      headers: {
        Referer: "https://ani.pm/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });

    const pageHtml = typeof pageRes === "string" ? pageRes : (pageRes && pageRes.body) || "";
    const dataIdMatch = pageHtml.match(/data-id=['"](\d+)['"]/);
    const realIdMatch = pageHtml.match(/data-realid=['"](\d+)['"]/);
    const targetId = dataIdMatch ? dataIdMatch[1] : (realIdMatch ? realIdMatch[1] : null);

    if (!targetId) return [];

    // Query getSources endpoint
    const getSourcesUrl = `https://megaplay.buzz/stream/getSources?id=${targetId}`;
    const srcRes = await this.request(getSourcesUrl, {
      headers: {
        Referer: embedUrl,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });

    const srcData = this.parseJson(srcRes);
    if (!srcData || !srcData.enc) return [];

    // AES-256-CBC Decryption via global CryptoJS
    const masterM3u8Url = this._decryptMegaPlayPayload(srcData.enc);
    if (!masterM3u8Url) return [];

    // Extract subtitles
    const subs = [];
    if (Array.isArray(srcData.tracks)) {
      for (const t of srcData.tracks) {
        if (!t || !t.file) continue;
        const label = t.label || t.language || "Subtitle";
        subs.push({
          title: label,
          language: label,
          url: t.file,
          default: Boolean(t.default),
        });
      }
    }

    // Parse HLS qualities if possible
    const variants = await this._parseM3u8Variants(masterM3u8Url);
    const sources = [];

    if (variants.length > 0) {
      for (const v of variants) {
        sources.push({
          server: `MegaPlay • ${v.quality} (${lang.toUpperCase()})`,
          quality: v.quality,
          url: v.url,
          type: "hls",
          headers: { Referer: "https://megaplay.buzz/" },
          subtitles: subs,
        });
      }
    } else {
      sources.push({
        server: `MegaPlay (${lang.toUpperCase()})`,
        quality: "1080p",
        url: masterM3u8Url,
        type: "hls",
        headers: { Referer: "https://megaplay.buzz/" },
        subtitles: subs,
      });
    }

    return sources;
  }

  _decryptMegaPlayPayload(encStr) {
    if (!encStr || typeof CryptoJS === "undefined") return null;

    try {
      const keyHex = "693f4c4d5441783051362c3a7d35305500000000000000000000000000000000";
      const ivStr = "W0;27ToaUpl_P%'c";

      const key = CryptoJS.enc.Hex.parse(keyHex);
      const iv = CryptoJS.enc.Utf8.parse(ivStr);

      let b64 = encStr.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";

      const decrypted = CryptoJS.AES.decrypt(b64, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const utf8 = decrypted.toString(CryptoJS.enc.Utf8);
      const parsed = JSON.parse(utf8);
      return parsed ? parsed.file : null;
    } catch (e) {
      return null;
    }
  }

  async _parseM3u8Variants(masterUrl) {
    const list = [];
    try {
      const res = await this.request(masterUrl, {
        headers: { Referer: "https://megaplay.buzz/" },
      });
      const text = typeof res === "string" ? res : (res && res.body) || "";
      if (!text || !text.includes("#EXTM3U")) return list;

      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let currentInf = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("#EXT-X-STREAM-INF:")) {
          currentInf = line;
        } else if (!line.startsWith("#") && currentInf) {
          let quality = "Auto";
          const resMatch = currentInf.match(/RESOLUTION=\d+x(\d+)/i);
          if (resMatch) {
            quality = `${resMatch[1]}p`;
          }

          let streamUrl = line;
          if (!streamUrl.startsWith("http")) {
            const baseDir = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
            streamUrl = baseDir + streamUrl;
          }

          list.push({
            quality,
            url: streamUrl,
          });

          currentInf = null;
        }
      }
    } catch (e) {}

    return list;
  }
}
