// ==YomiruExtension==
// @name         AnimeSaga
// @version      v1.0.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://animesaga.net/favicon.ico
// @package      site.animesaga
// @type         bangumi
// @webSite      https://animesaga.net
// @nsfw         false
// @description  Watch subbed and dubbed anime in HD quality on AnimeSaga
// ==/YomiruExtension==

export default class extends Extension {
  get baseUrl() {
    return "https://animesaga.net";
  }

  get vidnestUrl() {
    return "https://new.vidnest.fun";
  }

  async req(url, options = {}) {
    const rawUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    return this.request(rawUrl, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${this.baseUrl}/`,
        ...(options.headers || {}),
      },
    });
  }

  async load() {
    await this.registerSetting({
      title: "AnimeSaga URL",
      key: "animesaga_url",
      type: "input",
      description: "Base homepage URL for AnimeSaga",
      defaultValue: "https://animesaga.net",
    });

    await this.registerSetting({
      title: "Preferred Audio",
      key: "preferred_audio",
      type: "radio",
      description: "Default audio preference (sub or dub)",
      defaultValue: "sub",
    });
  }

  _decryptPayload(b64) {
    if (!b64 || typeof b64 !== "string") return null;
    try {
      const binary = atob(b64.trim());
      const key = "as-secure-stream-key";
      let xor = "";
      for (let i = 0; i < binary.length; i++) {
        xor += String.fromCharCode(
          binary.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
      }
      try {
        return JSON.parse(decodeURIComponent(escape(xor)));
      } catch {
        return JSON.parse(xor);
      }
    } catch {
      return null;
    }
  }

  _decodeVidnestB64(encoded) {
    if (!encoded || typeof encoded !== "string") return null;
    try {
      const custom =
        "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
      const std =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      let standardB64 = "";
      for (let i = 0; i < encoded.length; i++) {
        const c = encoded[i];
        const idx = custom.indexOf(c);
        standardB64 += idx !== -1 ? std[idx] : c;
      }
      const binary = atob(standardB64);
      try {
        return JSON.parse(decodeURIComponent(escape(binary)));
      } catch {
        return JSON.parse(binary);
      }
    } catch {
      return null;
    }
  }

  _normalizeItems(list) {
    const items = [];
    if (!Array.isArray(list)) return items;

    for (const item of list) {
      if (!item) continue;
      const id = String(item.id || item.animeId || "");
      if (!id) continue;

      const titleObj = item.title || {};
      const title =
        titleObj.english ||
        titleObj.romaji ||
        titleObj.native ||
        item.name ||
        item.title ||
        "Unknown Title";

      const cover =
        item.coverImage?.extraLarge ||
        item.coverImage?.large ||
        item.coverImage?.medium ||
        item.cover ||
        item.poster ||
        "";

      items.push({
        title: String(title).trim(),
        url: `/anime/${id}`,
        cover,
      });
    }

    return items;
  }

  // 1. Popular / Trending Catalog
  async popular(page) {
    const p = Math.max(1, page || 1);
    const query = `
      query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
        Page(page: $page, perPage: $perPage) {
          media(sort: $sort, isAdult: false) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              extraLarge
            }
          }
        }
      }
    `;

    try {
      const res = await this.req("/api/anilist-proxy", {
        method: "POST",
        body: JSON.stringify({
          query,
          variables: {
            page: p,
            perPage: 24,
            sort: ["TRENDING_DESC", "POPULARITY_DESC"],
          },
        }),
        headers: { "Content-Type": "application/json" },
      });

      const parsed = typeof res === "string" ? JSON.parse(res) : res;
      const media = parsed?.data?.Page?.media || [];
      return this._normalizeItems(media);
    } catch {
      return this.search("", page);
    }
  }

  // 2. Latest Updates
  async latest(page) {
    const p = Math.max(1, page || 1);
    const query = `
      query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
        Page(page: $page, perPage: $perPage) {
          media(sort: $sort, isAdult: false) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              extraLarge
            }
          }
        }
      }
    `;

    try {
      const res = await this.req("/api/anilist-proxy", {
        method: "POST",
        body: JSON.stringify({
          query,
          variables: {
            page: p,
            perPage: 24,
            sort: ["UPDATED_AT_DESC"],
          },
        }),
        headers: { "Content-Type": "application/json" },
      });

      const parsed = typeof res === "string" ? JSON.parse(res) : res;
      const media = parsed?.data?.Page?.media || [];
      return this._normalizeItems(media);
    } catch {
      return this.popular(page);
    }
  }

  // 3. Search Anime
  async search(kw, page) {
    const p = Math.max(1, page || 1);
    const queryStr = (kw || "").trim();
    if (!queryStr) {
      return this.popular(p);
    }

    // Try fast dedicated search endpoint first
    try {
      const res = await this.req(
        `/api/search?q=${encodeURIComponent(queryStr)}&page=${p}`
      );
      const parsed = typeof res === "string" ? JSON.parse(res) : res;
      const results = parsed?.results || [];
      if (results.length > 0) {
        return this._normalizeItems(results);
      }
    } catch {}

    // Fallback to GraphQL search
    const gql = `
      query ($page: Int, $perPage: Int, $search: String) {
        Page(page: $page, perPage: $perPage) {
          media(search: $search, isAdult: false, sort: [SEARCH_MATCH]) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              extraLarge
            }
          }
        }
      }
    `;

    try {
      const res = await this.req("/api/anilist-proxy", {
        method: "POST",
        body: JSON.stringify({
          query: gql,
          variables: {
            page: p,
            perPage: 24,
            search: queryStr,
          },
        }),
        headers: { "Content-Type": "application/json" },
      });

      const parsed = typeof res === "string" ? JSON.parse(res) : res;
      const media = parsed?.data?.Page?.media || [];
      return this._normalizeItems(media);
    } catch {
      return [];
    }
  }

  // 4. Anime Details & Episodes
  async detail(url) {
    const cleanId = (url.match(/(?:anime|watch)\/(\d+)/i) || url.match(/(\d+)/) || [])[1];
    if (!cleanId) {
      throw new Error(`Invalid AnimeSaga anime identifier: ${url}`);
    }

    let title = "Anime";
    let cover = "";
    let desc = "";

    // 1. Fetch metadata from AniList GraphQL proxy
    try {
      const gql = `
        query ($id: Int) {
          Media(id: $id) {
            title {
              english
              romaji
              native
            }
            coverImage {
              extraLarge
              large
            }
            description(asHtml: false)
          }
        }
      `;
      const mRes = await this.req("/api/anilist-proxy", {
        method: "POST",
        body: JSON.stringify({
          query: gql,
          variables: { id: parseInt(cleanId, 10) },
        }),
        headers: { "Content-Type": "application/json" },
      });

      const mParsed = typeof mRes === "string" ? JSON.parse(mRes) : mRes;
      const media = mParsed?.data?.Media || {};
      title =
        media.title?.english ||
        media.title?.romaji ||
        media.title?.native ||
        title;
      cover =
        media.coverImage?.extraLarge ||
        media.coverImage?.large ||
        "";
      desc = (media.description || "").replace(/<[^>]+>/g, "").trim();
    } catch {}

    // 2. Fetch and decrypt episodes list
    const epRes = await this.req(`/api/episodes/${cleanId}`);
    const epParsed = typeof epRes === "string" ? JSON.parse(epRes) : epRes;

    if (!epParsed || !epParsed.ciphertext) {
      throw new Error(`Failed to retrieve episode list for anime ID: ${cleanId}`);
    }

    const decrypted = this._decryptPayload(epParsed.ciphertext);
    if (!decrypted || !Array.isArray(decrypted.episodes)) {
      throw new Error(`Failed to decrypt episode list for anime ID: ${cleanId}`);
    }

    if (decrypted.title && title === "Anime") {
      title = decrypted.title;
    }

    const subEpisodes = [];
    const dubEpisodes = [];

    const rawEps = decrypted.episodes;
    for (const ep of rawEps) {
      const num = ep.number || 1;
      const epTitle = ep.title ? `Ep. ${num} - ${ep.title}` : `Episode ${num}`;
      const encodedTitle = encodeURIComponent(title);

      if (ep.hasSub !== false) {
        subEpisodes.push({
          name: epTitle,
          url: `/watch/${cleanId}?ep=${num}&type=sub&title=${encodedTitle}`,
        });
      }

      if (ep.hasDub) {
        dubEpisodes.push({
          name: epTitle,
          url: `/watch/${cleanId}?ep=${num}&type=dub&title=${encodedTitle}`,
        });
      }
    }

    const episodeGroups = [];
    if (subEpisodes.length > 0) {
      episodeGroups.push({
        title: "Subbed",
        urls: subEpisodes,
      });
    }
    if (dubEpisodes.length > 0) {
      episodeGroups.push({
        title: "Dubbed",
        urls: dubEpisodes,
      });
    }

    return {
      title,
      cover,
      desc,
      episodes:
        episodeGroups.length > 0
          ? episodeGroups
          : [
              {
                title: "Episodes",
                urls: subEpisodes.length > 0 ? subEpisodes : dubEpisodes,
              },
            ],
    };
  }

  // 5. Video Stream & Subtitle Resolution
  async watch(url) {
    const idMatch = url.match(/(?:watch|anime)\/(\d+)/i) || url.match(/(\d+)/);
    const epMatch = url.match(/[?&]ep=(\d+(?:\.\d+)?)/i);
    const typeMatch = url.match(/[?&]type=(sub|dub)/i);
    const titleMatch = url.match(/[?&]title=([^&]+)/i);

    const animeId = idMatch ? idMatch[1] : "";
    const epNum = epMatch ? epMatch[1] : "1";
    const type = typeMatch ? typeMatch[1] : "sub";
    let animeTitle = titleMatch ? decodeURIComponent(titleMatch[1]) : "";

    if (!animeId) {
      throw new Error(`Cannot parse anime ID from watch URL: ${url}`);
    }

    const resolvedSources = [];
    const resolvedSubtitles = [];

    const addSource = (s) => {
      if (s && s.url && !resolvedSources.some((item) => item.url === s.url)) {
        resolvedSources.push(s);
      }
    };

    const addSubtitle = (sub) => {
      if (sub && sub.url && !resolvedSubtitles.some((item) => item.url === sub.url)) {
        resolvedSubtitles.push(sub);
      }
    };

    // If title was missing, fetch it from episodes endpoint
    if (!animeTitle) {
      try {
        const epRes = await this.req(`/api/episodes/${animeId}`);
        const epJson = typeof epRes === "string" ? JSON.parse(epRes) : epRes;
        if (epJson && epJson.ciphertext) {
          const dec = this._decryptPayload(epJson.ciphertext);
          animeTitle = (dec && dec.title) || "";
        }
      } catch {}
    }

    // Engine 1: Vidnest direct HLS (MegaPlay master.m3u8 1080p + full subtitle tracks)
    try {
      const vUrl = `${this.vidnestUrl}/hianime/anime/${animeId}/${epNum}/${type}/hd-2`;
      const res1 = await this.request(vUrl, {
        headers: { Referer: "https://vidnest.fun/" },
      });
      const parsed1 = typeof res1 === "string" ? JSON.parse(res1) : res1;
      if (parsed1 && parsed1.data) {
        const dec1 = this._decodeVidnestB64(parsed1.data);
        if (dec1) {
          const sources = dec1.sources || dec1.multiSrc || [];
          for (const s of sources) {
            const u = s.file || s.url;
            if (u) {
              addSource({
                server: "Vidnest HD (Primary)",
                quality: "1080p",
                url: u,
                type: "hls",
                headers: {
                  Referer: u.includes("shiora.top")
                    ? "https://megaplay.buzz/"
                    : "https://vidnest.fun/",
                },
              });
            }
          }

          const tracks = dec1.tracks || [];
          for (const t of tracks) {
            if (t.file) {
              addSubtitle({
                title: t.label || t.name || "Subtitles",
                url: t.file,
                lang: t.label || t.lang,
                default: !!t.default,
              });
            }
          }
        }
      }
    } catch {}

    // Engine 2: Aniwave CDN HLS (Echovideo / Roburnt master.m3u8)
    try {
      const aUrl = `${this.vidnestUrl}/aniwave_hls/${animeId}/${epNum}/${type}`;
      const res2 = await this.request(aUrl, {
        headers: { Referer: "https://vidnest.fun/" },
      });
      const parsed2 = typeof res2 === "string" ? JSON.parse(res2) : res2;
      if (parsed2 && parsed2.data) {
        const dec2 = this._decodeVidnestB64(parsed2.data);
        if (dec2) {
          const sources = dec2.sources || dec2.multiSrc || [];
          for (const s of sources) {
            const u = s.url || s.file;
            if (u) {
              addSource({
                server: `Aniwave HLS (${s.server || "Vidplay"})`,
                quality: s.quality || "Auto",
                url: u,
                type: "hls",
                headers: { Referer: s.referer || "https://play.echovideo.ru/" },
              });
            }
          }
        }
      }
    } catch {}

    // Engine 3: Animegg Direct MP4 (via AnimeSaga proxy-video)
    if (animeTitle) {
      try {
        const streamUrl = `/api/stream?v=2&provider=animegg&animeId=${animeId}&episodeNumber=${epNum}&type=${type}&animeTitle=${encodeURIComponent(
          animeTitle
        )}`;
        const res3 = await this.req(streamUrl, {
          headers: { Referer: `${this.baseUrl}/watch/${animeId}?ep=${epNum}` },
        });
        const parsed3 = typeof res3 === "string" ? JSON.parse(res3) : res3;
        if (parsed3 && parsed3.ciphertext) {
          const dec3 = this._decryptPayload(parsed3.ciphertext);
          if (dec3 && dec3.embedUrl && dec3.embedUrl.includes("proxy-video")) {
            addSource({
              server: "AnimeSaga Direct (MP4)",
              quality: "1080p",
              url: `https://animesaga.net${dec3.embedUrl}`,
              type: "mp4",
              headers: { Referer: `${this.baseUrl}/watch/${animeId}?ep=${epNum}` },
            });
          }
        }
      } catch {}
    }

    // Engine 4: Fallback to reanime
    if (resolvedSources.length === 0) {
      try {
        const fallbackUrl = `/api/stream?v=2&provider=reanime&animeId=${animeId}&episodeNumber=${epNum}&type=${type}`;
        const res4 = await this.req(fallbackUrl, {
          headers: { Referer: `${this.baseUrl}/watch/${animeId}?ep=${epNum}` },
        });
        const parsed4 = typeof res4 === "string" ? JSON.parse(res4) : res4;
        if (parsed4 && parsed4.ciphertext) {
          const dec4 = this._decryptPayload(parsed4.ciphertext);
          if (dec4 && dec4.servers) {
            const list = (dec4.servers.sub || []).concat(dec4.servers.dub || []);
            for (const s of list) {
              if (s.linkId && (s.linkId.includes(".m3u8") || s.linkId.includes(".mp4"))) {
                addSource({
                  server: `Flixcloud (${s.name || "HD"})`,
                  quality: "1080p",
                  url: s.linkId,
                  type: s.linkId.includes(".m3u8") ? "hls" : "mp4",
                  headers: { Referer: "https://flixcloud.cc/" },
                });
              }
            }
          }
        }
      } catch {}
    }

    if (resolvedSources.length === 0) {
      throw new Error(
        `No playable video stream found for ${animeTitle || "anime ID " + animeId} Episode ${epNum}`
      );
    }

    return {
      sources: resolvedSources,
      subtitles: resolvedSubtitles,
    };
  }
}
