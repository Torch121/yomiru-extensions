// ==YomiruExtension==
// @name         Anikoto
// @version      v1.0.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://anikototv.to/AnikotoTheme/assets/images/favicon.png
// @package      to.anikototv
// @type         bangumi
// @webSite      https://anikototv.to
// @nsfw         false
// @description  Stream high-quality subbed and dubbed anime with multi-resolution M3U8 playback, direct subtitles, and fast servers from Anikoto.
// ==/YomiruExtension==

export default class extends Extension {
  get defaultBaseUrl() {
    return "https://anikototv.to";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("anikoto_url");
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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `${base}/`,
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
      title: "Anikoto URL",
      key: "anikoto_url",
      type: "input",
      description: "Base mirror URL for Anikoto (default: https://anikototv.to)",
      defaultValue: "https://anikototv.to",
    });

    await this.registerSetting({
      title: "Preferred Audio",
      key: "preferred_audio",
      type: "radio",
      description: "Default audio preference (sub or dub)",
      defaultValue: "sub",
    });
  }

  get filters() {
    return this.getFilterSchema();
  }

  getFilterSchema() {
    return {
      type: {
        title: "Type",
        options: {
          "": "All",
          "tv": "TV",
          "movie": "Movie",
          "ova": "OVA",
          "ona": "ONA",
          "special": "Special",
          "music": "Music",
        },
      },
      status: {
        title: "Status",
        options: {
          "": "All",
          "completed": "Finished Airing",
          "releasing": "Currently Airing",
          "not_yet_aired": "Not yet aired",
        },
      },
      rated: {
        title: "Rated",
        options: {
          "": "All",
          "g": "G",
          "pg": "PG",
          "pg_13": "PG-13",
          "r_17": "R - 17+",
          "r_plus": "R+",
          "rx": "Rx",
        },
      },
      score: {
        title: "Score",
        options: {
          "": "All",
          "10": "(10) Masterpiece",
          "9": "(9) Great",
          "8": "(8) Very Good",
          "7": "(7) Good",
          "6": "(6) Fine",
          "5": "(5) Average",
        },
      },
      season: {
        title: "Season",
        options: {
          "": "All",
          "spring": "Spring",
          "summer": "Summer",
          "fall": "Fall",
          "winter": "Winter",
        },
      },
      language: {
        title: "Language",
        options: {
          "": "All",
          "sub": "SUB",
          "dub": "DUB",
        },
      },
      sort: {
        title: "Sort",
        options: {
          "": "Default",
          "trending": "Trending",
          "updated_date": "Recently Updated",
          "added_date": "Recently Added",
          "release_date": "Released Date",
          "title_az": "Name A-Z",
          "avg_score": "Score",
          "most_viewed": "Most Watched",
          "most_followed": "Most Followed",
        },
      },
      genre: {
        title: "Genre",
        multi: true,
        options: {
          "action": "Action",
          "action-adventure": "Action & Adventure",
          "adventure": "Adventure",
          "animation": "Animation",
          "comedy": "Comedy",
          "demons": "Demons",
          "drama": "Drama",
          "ecchi": "Ecchi",
          "fantasy": "Fantasy",
          "historical": "Historical",
          "horror": "Horror",
          "isekai": "Isekai",
          "magic": "Magic",
          "martial-arts": "Martial Arts",
          "mecha": "Mecha",
          "military": "Military",
          "music": "Music",
          "mystery": "Mystery",
          "psychological": "Psychological",
          "romance": "Romance",
          "sci-fi": "Sci-Fi",
          "shounen": "Shounen",
          "slice-of-life": "Slice of Life",
          "supernatural": "Supernatural",
        },
      },
    };
  }

  _parseItems(html) {
    const items = [];
    if (!html) return items;

    const itemBlocks = html.split(/<div class="item\s*"/);
    for (let i = 1; i < itemBlocks.length; i++) {
      const block = itemBlocks[i];

      // Poster & Cover
      const coverMatch =
        block.match(/<img[^>]*?(?:data-src|src)="([^"]+)"/i) ||
        block.match(/src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
      const cover = coverMatch ? coverMatch[1] : "";

      // Title & URL
      const titleMatch =
        block.match(/class="name d-title"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/<a class="name[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/alt="([^"]+)"/i);
      const urlMatch =
        block.match(/class="name d-title"[^>]*href="([^"]+)"/i) ||
        block.match(/<a[^>]*href="([^"]+\/watch\/[^"]+)"/i) ||
        block.match(/href="(\/watch\/[^"]+)"/i);

      if (titleMatch && urlMatch) {
        const rawTitle = titleMatch[1].replace(/<[^>]*>/g, "").trim();
        const rawUrl = urlMatch[1].trim();

        items.push({
          title: rawTitle,
          url: rawUrl,
          cover: cover,
        });
      }
    }
    return items;
  }

  // 1. Popular Anime Releases
  async popular(page) {
    const res = await this.req(`/filter?sort=trending&page=${page || 1}`);
    const html = typeof res === "string" ? res : res.html || (res && res.body) || "";
    return this._parseItems(html);
  }

  // 2. Latest Anime Releases
  async latest(page) {
    const res = await this.req(`/filter?sort=updated_date&page=${page || 1}`);
    const html = typeof res === "string" ? res : res.html || (res && res.body) || "";
    return this._parseItems(html);
  }

  // 3. Search Anime by Keyword & Advanced Filters
  async search(kw, page, filter) {
    let queryToSearch = "";
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      if (jp && jp.trim()) {
        const jpResults = await this._rawSearch(jp.trim(), page, filter);
        if (jpResults && jpResults.length > 0) return jpResults;
      }
      queryToSearch = en || jp || "";
    } else {
      queryToSearch = (kw || "").trim();
    }

    return this._rawSearch(queryToSearch, page, filter);
  }

  async _rawSearch(kw, page, filter) {
    const params = [];
    if (kw && kw.trim()) {
      params.push(`keyword=${encodeURIComponent(kw.trim())}`);
    }
    params.push(`page=${page || 1}`);

    if (filter && typeof filter === "object") {
      for (const [k, v] of Object.entries(filter)) {
        if (v === null || v === undefined || v === "") continue;
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item) params.push(`genre[]=${encodeURIComponent(item)}`);
          }
        } else if (k === "genre" && typeof v === "string") {
          if (v.includes(",")) {
            for (const item of v.split(",")) {
              if (item.trim()) params.push(`genre[]=${encodeURIComponent(item.trim())}`);
            }
          } else {
            params.push(`genre[]=${encodeURIComponent(v)}`);
          }
        } else {
          params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }
      }
    }

    const res = await this.req(`/filter?${params.join("&")}`);
    const html = typeof res === "string" ? res : res.html || (res && res.body) || "";
    return this._parseItems(html);
  }

  // 4. Anime Details & Episodes List
  async detail(url) {
    const res = await this.req(url);
    const html = typeof res === "string" ? res : (res && res.body) || "";

    // Title
    const titleMatch =
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h2 class="title"[^>]*>([\s\S]*?)<\/h2>/i) ||
      html.match(/<meta property="og:title" content="([^"]+)"/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]*>/g, "").replace(/ - Anikoto.*$/, "").trim()
      : "Unknown Anime";

    // Poster
    const coverMatch =
      html.match(/class="poster"[^>]*>[\s\S]*?<img[^>]*?src="([^"]+)"/i) ||
      html.match(/<meta property="og:image" content="([^"]+)"/i);
    const cover = coverMatch ? coverMatch[1] : "";

    // Synopsis
    const descMatch =
      html.match(/class="synopsis[^"]*"[\s\S]*?<div class="content">([\s\S]*?)<\/div>/i) ||
      html.match(/class="synopsis[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<meta name="description" content="([^"]+)"/i);
    const desc = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";

    // Extract Anime ID (mangaId)
    const idMatch =
      html.match(/data-id="(\d+)"/i) ||
      html.match(/const\s+mangaId\s*=\s*(\d+)/i) ||
      html.match(/data-tip="(\d+)"/i);

    if (!idMatch) {
      return { title, cover, desc, episodes: [] };
    }
    const animeId = idMatch[1];

    // Extract slug from URL
    const slugMatch = url.match(/\/watch\/([^/?#]+)/i);
    const slug = slugMatch ? slugMatch[1] : `anime-${animeId}`;

    // Fetch complete episode list via AJAX
    const epRes = await this.req(`/ajax/episode/list/${animeId}`, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Referer: url.startsWith("http") ? url : `${await this.getBaseUrl()}/${url.replace(/^\/+/, "")}`,
      },
    });

    const epData = this.parseJson(epRes);
    const epHtml =
      epData && epData.result
        ? epData.result
        : typeof epRes === "string"
        ? epRes
        : "";

    const subList = [];
    const dubList = [];
    const allList = [];

    // Parse each <li> episode item
    const liRegex = /<li[^>]*>[\s\S]*?<a\s+([^>]+)>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
    let match;
    while ((match = liRegex.exec(epHtml)) !== null) {
      const attrsStr = match[1];
      const innerHtml = match[2];

      const epIdMatch = attrsStr.match(/data-id="([^"]+)"/i);
      const numMatch = attrsStr.match(/data-num="([^"]+)"/i) || innerHtml.match(/<b>(\d+)<\/b>/i);
      const dataIdsMatch = attrsStr.match(/data-ids="([^"]+)"/i);
      const isSub = attrsStr.includes('data-sub="1"');
      const isDub = attrsStr.includes('data-dub="1"');

      const titleSpanMatch = innerHtml.match(/class="d-title"[^>]*>([\s\S]*?)<\/span>/i);
      const epTitle = titleSpanMatch ? titleSpanMatch[1].replace(/<[^>]*>/g, "").trim() : null;

      const num = numMatch ? numMatch[1] : "1";
      const epId = epIdMatch ? epIdMatch[1] : num;
      const dataIds = dataIdsMatch ? dataIdsMatch[1] : "";

      const displayName = epTitle ? `Episode ${num}: ${epTitle}` : `Episode ${num}`;

      // Construct watch URL embedding the server query token
      const subUrl = `/watch/${slug}/ep-${num}?id=${epId}&servers=${encodeURIComponent(dataIds)}&type=sub`;
      const dubUrl = `/watch/${slug}/ep-${num}?id=${epId}&servers=${encodeURIComponent(dataIds)}&type=dub`;

      if (isSub) {
        subList.push({ name: displayName, url: subUrl });
      }
      if (isDub) {
        dubList.push({ name: displayName, url: dubUrl });
      }
      allList.push({
        name: displayName,
        url: `/watch/${slug}/ep-${num}?id=${epId}&servers=${encodeURIComponent(dataIds)}`,
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
    if (episodeGroups.length === 0 && allList.length > 0) {
      episodeGroups.push({
        title: "Default",
        urls: allList,
      });
    }

    return {
      title,
      cover,
      desc,
      episodes: episodeGroups,
    };
  }

  // 5. Video Stream & Subtitle Extraction
  async watch(episodeUrl) {
    let serversToken = null;
    let preferredAudio = (await this.getSetting("preferred_audio")) || "sub";

    // Extract servers token and audio preference from URL
    if (episodeUrl.includes("servers=")) {
      const match = episodeUrl.match(/servers=([^&]+)/i);
      if (match) serversToken = decodeURIComponent(match[1]);
    }

    if (episodeUrl.includes("type=dub") || episodeUrl.includes("lang=dub")) {
      preferredAudio = "dub";
    } else if (episodeUrl.includes("type=sub") || episodeUrl.includes("lang=sub")) {
      preferredAudio = "sub";
    }

    // If servers token is not present, fetch the episode watch page to find it
    if (!serversToken) {
      const pageRes = await this.req(episodeUrl);
      const pageHtml = typeof pageRes === "string" ? pageRes : (pageRes && pageRes.body) || "";
      const mangaIdMatch =
        pageHtml.match(/const\s+mangaId\s*=\s*(\d+)/i) ||
        pageHtml.match(/data-id="(\d+)"/i);

      if (mangaIdMatch) {
        const epRes = await this.req(`/ajax/episode/list/${mangaIdMatch[1]}`, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        const epData = this.parseJson(epRes);
        const epHtml = epData && epData.result ? epData.result : "";
        const tokenMatch = epHtml.match(/data-ids="([^"]+)"/i);
        if (tokenMatch) serversToken = tokenMatch[1];
      }
    }

    if (!serversToken) {
      throw new Error(`Could not resolve servers token for episode: ${episodeUrl}`);
    }

    // Fetch server list HTML (SUB and DUB server buttons)
    const serverRes = await this.req(`/ajax/server/list?servers=${encodeURIComponent(serversToken)}`, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const serverData = this.parseJson(serverRes);
    const serverHtml = serverData && serverData.result ? serverData.result : "";

    // Parse server list
    const subServers = [];
    const dubServers = [];

    const typeBlocks = serverHtml.split(/<div class="type"/i);
    for (let i = 1; i < typeBlocks.length; i++) {
      const block = typeBlocks[i];
      const isDub = block.includes('data-type="dub"');
      const targetList = isDub ? dubServers : subServers;

      const liMatches = block.match(/<li[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi) || [];
      for (const li of liMatches) {
        const linkMatch = li.match(/data-link-id="([^"]+)"/i);
        const nameMatch = li.replace(/<[^>]*>/g, "").trim();
        if (linkMatch) {
          targetList.push({
            name: nameMatch || "Server",
            linkId: linkMatch[1],
            isDub,
          });
        }
      }
    }

    if (subServers.length === 0 && dubServers.length === 0) {
      throw new Error("No playable streaming servers found for this episode.");
    }

    const allSources = [];
    const allSubtitles = [];
    let skipData = null;
    let primaryMasterUrl = null;

    // Helper to resolve an individual server link
    const resolveServer = async (server, lang) => {
      try {
        const embedRes = await this.req(`/ajax/server?get=${encodeURIComponent(server.linkId)}`, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        const embedJson = this.parseJson(embedRes);
        if (!embedJson || embedJson.status !== 200 || !embedJson.result || !embedJson.result.url) {
          return;
        }

        const embedUrl = embedJson.result.url;
        if (embedJson.result.skip_data && !skipData) {
          skipData = embedJson.result.skip_data;
        }

        // Fetch MegaPlay embed player page
        const playerHtml = await this.request(embedUrl, {
          headers: {
            Referer: await this.getBaseUrl(),
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        const playerText = typeof playerHtml === "string" ? playerHtml : (playerHtml && playerHtml.body) || "";
        const dataIdMatch =
          playerText.match(/data-id="(\d+)"/i) ||
          playerText.match(/data-realid="(\d+)"/i);

        if (!dataIdMatch) return;
        const targetId = dataIdMatch[1];

        // Query getSources endpoint
        const srcRes = await this.request(`https://megaplay.buzz/stream/getSources?id=${targetId}`, {
          headers: {
            Referer: embedUrl,
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        const srcData = this.parseJson(srcRes);
        if (!srcData || !srcData.enc) return;

        // Decrypt AES-256-CBC payload using global CryptoJS
        const masterM3u8Url = this._decryptMegaPlayPayload(srcData.enc);
        if (!masterM3u8Url) return;

        if (srcData.intro && !skipData) {
          skipData = { intro: srcData.intro, outro: srcData.outro };
        }

        // Extract subtitles
        if (Array.isArray(srcData.tracks)) {
          for (const t of srcData.tracks) {
            if (!t || !t.file || t.kind === "thumbnails") continue;
            const label = t.label || t.language || "Subtitles";
            if (!allSubtitles.some((s) => s.url === t.file)) {
              allSubtitles.push({
                title: label,
                language: label,
                url: t.file,
                default: Boolean(t.default),
              });
            }
          }
        }

        // Parse resolution variants
        const variants = await this._parseM3u8Variants(masterM3u8Url);
        const upperLang = lang.toUpperCase();

        if (variants.length > 0) {
          for (const v of variants) {
            allSources.push({
              server: `${server.name} (${upperLang}) • ${v.quality}`,
              quality: v.quality,
              url: v.url,
              type: "hls",
              headers: { Referer: "https://megaplay.buzz/" },
              subtitles: allSubtitles,
              skip: skipData,
            });
          }
        }

        // Master playlist stream
        allSources.push({
          server: `${server.name} (${upperLang}) • Master`,
          quality: variants[0]?.quality || "1080p",
          url: masterM3u8Url,
          type: "hls",
          headers: { Referer: "https://megaplay.buzz/" },
          subtitles: allSubtitles,
          skip: skipData,
          qualities: variants,
        });

        if (!primaryMasterUrl && (lang === preferredAudio || allSources.length > 0)) {
          primaryMasterUrl = masterM3u8Url;
        }
      } catch (err) {}
    };

    // Prioritize preferred audio servers first, then fallback audio track
    const primaryGroup = preferredAudio === "dub" ? dubServers : subServers;
    const secondaryGroup = preferredAudio === "dub" ? subServers : dubServers;
    const primaryLang = preferredAudio === "dub" ? "dub" : "sub";
    const secondaryLang = preferredAudio === "dub" ? "sub" : "dub";

    // Resolve primary server (HD-1)
    if (primaryGroup.length > 0) {
      await resolveServer(primaryGroup[0], primaryLang);
    }

    // Resolve secondary server (HD-1 of opposing audio track for instant audio switching)
    if (secondaryGroup.length > 0) {
      await resolveServer(secondaryGroup[0], secondaryLang);
    }

    // Resolve remaining servers
    for (let i = 1; i < primaryGroup.length; i++) {
      await resolveServer(primaryGroup[i], primaryLang);
    }

    if (allSources.length === 0) {
      throw new Error("Unable to extract playable stream from Anikoto servers.");
    }

    return {
      url: primaryMasterUrl || allSources[0].url,
      type: "hls",
      headers: {
        Referer: "https://megaplay.buzz/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      subtitles: allSubtitles,
      skip_data: skipData,
      sources: allSources,
    };
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

      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let currentInf = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("#EXT-X-STREAM-INF:")) {
          currentInf = line;
        } else if (!line.startsWith("#") && currentInf) {
          const resMatch = currentInf.match(/RESOLUTION=(\d+x\d+)/i);
          const resolution = resMatch ? resMatch[1] : null;
          let quality = "1080p";
          if (resolution) {
            const height = parseInt(resolution.split("x")[1], 10);
            if (height >= 1080) quality = "1080p";
            else if (height >= 720) quality = "720p";
            else if (height >= 480) quality = "480p";
            else if (height >= 360) quality = "360p";
          }

          let variantUrl = line;
          if (!variantUrl.startsWith("http")) {
            const base = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
            variantUrl = base + line;
          }

          list.push({
            quality,
            resolution,
            url: variantUrl,
          });

          currentInf = null;
        }
      }
    } catch (_) {}
    return list;
  }
}
