// ==YomiruExtension==
// @name         AniSnatch
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://anisnatch.to/favicon.ico
// @package      to.anisnatch
// @type         bangumi
// @webSite      https://anisnatch.to
// @nsfw         false
// @description  Watch anime online in HD with multi-server SUB, DUB, and soft subtitles, multi-resolution M3U8 playback, and skip intro/outro times from AniSnatch.
// ==/YomiruExtension==

export default class extends Extension {
  get defaultBaseUrl() {
    return "https://anisnatch.to";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("anisnatch_url");
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
      title: "AniSnatch Mirror URL",
      key: "anisnatch_url",
      type: "input",
      description: "Base mirror URL for AniSnatch (default: https://anisnatch.to)",
      defaultValue: "https://anisnatch.to",
    });

    await this.registerSetting({
      title: "Preferred Audio",
      key: "preferred_audio",
      type: "radio",
      description: "Default audio preference (SUB, Soft-SUB, or DUB)",
      defaultValue: "sub",
      options: {
        sub: "SUB (Hardcoded)",
        "soft-sub": "Soft-SUB (Multi-Language Subtitles)",
        dub: "DUB (English Dubbed)",
      },
    });

    await this.registerSetting({
      title: "Preferred Server",
      key: "preferred_server",
      type: "select",
      description: "Default streaming server preference",
      defaultValue: "auto",
      options: {
        auto: "Auto (Fastest Priority)",
        "snatch-cdn": "SnatchCDN",
        vidwish: "Vidwish",
        megaplay: "Megaplay",
        "allmanga-yt": "AniYT",
        "allmanga-ok": "OkCDN",
      },
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
          "1": "Movie",
          "2": "TV",
          "3": "OVA",
          "4": "ONA",
          "5": "Special",
          "6": "Music",
        },
      },
      status: {
        title: "Status",
        options: {
          "": "All",
          "1": "Finished Airing",
          "2": "Currently Airing",
          "3": "Not yet aired",
        },
      },
      rated: {
        title: "Rated",
        options: {
          "": "All",
          "1": "G",
          "2": "PG",
          "3": "PG-13",
          "4": "R",
          "5": "R+",
          "6": "Rx",
        },
      },
      language: {
        title: "Language",
        options: {
          "": "All",
          "1": "SUB",
          "2": "DUB",
        },
      },
      sort: {
        title: "Sort",
        options: {
          "popularity": "Popularity",
          "recently": "Recently Added",
          "score": "Score",
          "a-z": "Name A-Z",
          "newest": "Newest",
          "oldest": "Oldest",
          "default": "Default",
        },
      },
    };
  }

  // ==========================================
  // Cryptographic & Protocol Handshake Helpers
  // ==========================================

  _decryptConfig(configToken, metaToken, version, serverTime) {
    const binaryToken = atob(configToken);
    const key = `${metaToken}${version}${serverTime}`;
    let decrypted = "";
    for (let i = 0; i < binaryToken.length; i++) {
      decrypted += String.fromCharCode(binaryToken.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return JSON.parse(decrypted);
  }

  _strToHex(str) {
    const s = String(str);
    let hex = "";
    for (let i = 0; i < s.length; i++) {
      hex += s.charCodeAt(i).toString(16);
    }
    return hex;
  }

  _iCipher(str, mode, rounds, alphabet) {
    let current = str;
    const len = alphabet.length;

    for (let k = 0; k < rounds; k++) {
      let out = "";
      for (let b = 0; b < current.length; b++) {
        const char = current[b];
        const pos = alphabet.indexOf(char);
        if (pos !== -1) {
          let w;
          if (mode === "enc") {
            w = pos + 5 < len ? pos + 5 : 5 - (len - pos);
          } else {
            w = pos - 5 >= 0 ? pos - 5 : len + pos - 5;
          }
          out += alphabet[w];
        } else {
          out += char;
        }
      }
      current = out.split("").reverse().join("");
    }
    return current;
  }

  _oCipher(str, mode, alphabet) {
    if (mode === "enc") {
      const rounds = Math.floor(10 * Math.random() + 1);
      return this._iCipher(str, "enc", rounds, alphabet);
    }
    for (let y = 1; y <= 10; y++) {
      const candidate = this._iCipher(str, "dec", y, alphabet);
      if (candidate.indexOf("strSMCconvert") !== -1) {
        return candidate;
      }
    }
    return false;
  }

  _dEncrypt(value, alphabet) {
    const b64 = btoa(unescape(encodeURIComponent(String(value))));
    const hex = this._strToHex(b64);
    const rand = Math.floor(10 * Math.random() + 1);
    return this._oCipher(
      this._iCipher(hex, "enc", rand, alphabet) + "strSMCconvert" + rand,
      "enc",
      alphabet
    );
  }

  _wSum(token) {
    let sum = 0;
    for (let i = 0; i < token.length; i++) {
      sum += token.charCodeAt(i);
    }
    return String(sum);
  }

  _buildApiPayload(params, alphabet, accurateTime) {
    const serialized = JSON.stringify(params);
    const s_val = this._dEncrypt(serialized, alphabet);
    const c_val = this._dEncrypt(accurateTime + 500, alphabet);
    const l_val = this._wSum(c_val);

    const chunks = [];
    for (let idx = 0; idx < s_val.length; idx += 25) {
      chunks.push(s_val.substring(idx, idx + 25));
    }

    const indexed = chunks.map((chunk, idx) => ({ id: idx, data: chunk }));
    const dataChunks = [];
    const keyIndices = [];

    while (indexed.length > 0) {
      const r = Math.floor(Math.random() * indexed.length);
      const item = indexed.splice(r, 1)[0];
      dataChunks.push(item.data);
      keyIndices.push(item.id);
    }

    return {
      payload: {
        data: dataChunks,
        key: keyIndices,
        token: c_val,
        authenticator: l_val,
      },
      authenticator: l_val,
    };
  }

  async _unpackApiResponse(base64Buffer, mark, authenticator) {
    if (!base64Buffer) return null;

    // Convert base64 response into binary string
    const rawBinary = atob(base64Buffer);

    // Marker searching
    let markIndex = -1;
    const markLen = mark.length;

    for (let i = 0; i <= rawBinary.length - markLen; i++) {
      let found = true;
      for (let j = 0; j < markLen; j++) {
        if (rawBinary.charCodeAt(i + j) !== mark[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        markIndex = i;
        break;
      }
    }

    if (markIndex === -1) {
      try {
        return JSON.parse(rawBinary);
      } catch (err) {
        throw new Error("AniSnatch binary marker not found in response.");
      }
    }

    const payloadBinary = rawBinary.slice(markIndex + markLen);
    let xorBinary = "";
    for (let k = 0; k < payloadBinary.length; k++) {
      xorBinary += String.fromCharCode(
        payloadBinary.charCodeAt(k) ^ authenticator.charCodeAt(k % authenticator.length)
      );
    }

    const xorB64 = btoa(xorBinary);

    // 1. Native Yomiru GZIP decompression bridge
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
        return JSON.parse(zlib.gunzipSync(buf).toString("utf8"));
      } catch (_) {}
    }

    throw new Error("Unable to decompress AniSnatch GZIP payload in this runtime.");
  }

  _encodeFilterQuery(params = {}) {
    const queryParts = [];
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined || v === "") continue;
      queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
    const qs = queryParts.join("&");
    const b64 = btoa(qs).replace(/=/g, "");
    return b64.split("").reverse().join("");
  }

  async _ensureSession(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this._session && this._sessionExpiresAt > now + 30000) {
      return this._session;
    }

    const seedRes = await this.req("/search?keyword=frieren");
    const html = typeof seedRes === "string" ? seedRes : seedRes.body || "";

    const metaTokenMatch = html.match(/meta\s+name="token"\s+content="([^"]+)"/i);
    const configTokenMatch = html.match(/configToken\s*=\s*'([^']+)'/i);
    const versionMatch = html.match(/version\s*=\s*'([^']+)'/i);
    const serverTimeMatch = html.match(/serverTime\s*=\s*(\d+)/i);

    if (!metaTokenMatch || !configTokenMatch || !versionMatch || !serverTimeMatch) {
      throw new Error("Failed to extract security tokens from AniSnatch bootstrap page.");
    }

    const metaToken = metaTokenMatch[1];
    const configToken = configTokenMatch[1];
    const version = versionMatch[1];
    const serverTime = parseInt(serverTimeMatch[1], 10);

    const config = this._decryptConfig(configToken, metaToken, version, serverTime);
    const alphabet = config.key;
    const mark = config.mark;

    const clientTime = Math.floor(now / 1000);
    const timeOffset = serverTime - clientTime + 60;
    const accurateTime = () => Math.floor(Date.now() / 1000 + timeOffset);

    // Call /api/init to obtain snatchToken & proxys
    const initPayload = this._buildApiPayload({ token: null }, alphabet, accurateTime());
    const initUrl = `/api/init/${accurateTime()}`;

    const initRaw = await this.req(initUrl, {
      method: "POST",
      binary: true,
      encoding: "base64",
      headers: { "Content-Type": "application/json" },
      data: initPayload.payload,
    });

    const initB64 = typeof initRaw === "string" ? initRaw : initRaw.body || "";
    const initJson = await this._unpackApiResponse(initB64, mark, initPayload.authenticator);

    if (!initJson || !initJson.success) {
      throw new Error(`AniSnatch init handshake failed: ${initJson?.message || "Unknown"}`);
    }

    this._session = {
      metaToken,
      version,
      alphabet,
      mark,
      accurateTime,
      snatchToken: initJson.token,
      proxys: initJson.proxys || {},
    };
    this._sessionExpiresAt = now + 1800000;
    return this._session;
  }

  async _apiPost(endpoint, params = {}, retry = true) {
    const session = await this._ensureSession();
    const time = session.accurateTime();

    const { payload, authenticator } = this._buildApiPayload(params, session.alphabet, time);
    const url = `/api/${endpoint}/${time}`;

    const resRaw = await this.req(url, {
      method: "POST",
      binary: true,
      encoding: "base64",
      headers: { "Content-Type": "application/json" },
      data: payload,
    });

    const b64 = typeof resRaw === "string" ? resRaw : resRaw.body || "";

    try {
      const data = await this._unpackApiResponse(b64, session.mark, authenticator);
      if (data && data.success === false && data.message?.toLowerCase().includes("session") && retry) {
        await this._ensureSession(true);
        return this._apiPost(endpoint, params, false);
      }
      return data;
    } catch (err) {
      if (retry) {
        await this._ensureSession(true);
        return this._apiPost(endpoint, params, false);
      }
      throw err;
    }
  }

  _parseItems(list) {
    if (!Array.isArray(list)) return [];
    const items = [];

    for (const item of list) {
      if (!item) continue;
      const id = String(item.id || item.animeId || "");
      const title = (item.title_en || item.title || "Untitled").trim();
      const cover = item.picture || item.cover || "";

      if (id && title) {
        items.push({
          title,
          url: `/anime/${id}`,
          cover,
        });
      }
    }
    return items;
  }

  // ==========================================
  // Public Extension Contract Methods
  // ==========================================

  // 1. Popular Anime Releases
  async popular(page) {
    const q = this._encodeFilterQuery({
      "score-start": 1,
      "score-end": 10,
      sort: "popularity",
    });
    const res = await this._apiPost("filter", { query: q, page: Number(page) || 1 });
    const list = res?.data?.anime || res?.data || [];
    return this._parseItems(list);
  }

  // 2. Latest Anime Releases
  async latest(page) {
    const q = this._encodeFilterQuery({
      "score-start": 1,
      "score-end": 10,
      sort: "recently",
    });
    const res = await this._apiPost("filter", { query: q, page: Number(page) || 1 });
    const list = res?.data?.anime || res?.data || [];
    return this._parseItems(list);
  }

  // 3. Search Anime by Keyword & Filters
  async search(kw, page, filter) {
    let queryToSearch = "";
    if (typeof kw === "object" && kw !== null) {
      queryToSearch = kw.englishTitle || kw.japaneseTitle || kw.nativeTitle || kw.query || "";
    } else {
      queryToSearch = (kw || "").trim();
    }

    if (queryToSearch && (!filter || Object.keys(filter).length === 0)) {
      const res = await this._apiPost("search", {
        keyword: queryToSearch,
        page: Number(page) || 1,
      });
      const list = res?.data?.anime || res?.data || [];
      return this._parseItems(list);
    }

    const filterParams = {
      "score-start": filter?.scoreStart || 1,
      "score-end": filter?.scoreEnd || 10,
      sort: filter?.sort || (queryToSearch ? "default" : "popularity"),
      type: filter?.type || "",
      status: filter?.status || "",
      rated: filter?.rated || "",
      language: filter?.language || "",
    };

    const q = this._encodeFilterQuery(filterParams);
    const res = await this._apiPost("filter", { query: q, page: Number(page) || 1 });
    const list = res?.data?.anime || res?.data || [];
    return this._parseItems(list);
  }

  // 4. Anime Details & Episodes List
  async detail(url) {
    const idMatch =
      url.match(/\/anime\/(\d+)/i) ||
      url.match(/\/watch\/anime-(\d+)/i) ||
      url.match(/anime-(\d+)/i) ||
      url.match(/^(\d+)$/);

    const animeId = idMatch ? idMatch[1] : url.replace(/[^\d]/g, "");
    if (!animeId) {
      throw new Error(`Unable to resolve AniSnatch anime ID from: ${url}`);
    }

    // Fetch details
    const animeRes = await this._apiPost("anime", { id: Number(animeId) });
    const anime = animeRes?.data?.anime || animeRes?.data || {};
    const info = anime.info || {};

    const title = (anime.title_en || anime.title || "Unknown Anime").trim();
    const cover = anime.picture || info.picture || "";
    const desc = (info.synopsis || anime.synopsis || "").trim();

    // Fetch episodes using session token
    const session = await this._ensureSession();
    const epRes = await this._apiPost("loadEPs", {
      id: Number(animeId),
      token: session.snatchToken,
    });

    const rawEps = epRes?.episodes || [];
    const subList = [];
    const dubList = [];
    const defaultList = [];

    for (const ep of rawEps) {
      const num = ep.number || 1;
      const epTitle = ep.title ? `Episode ${num}: ${ep.title}` : `Episode ${num}`;
      const subUrl = `/watch/anime-${animeId}/ep-${num}?type=sub`;
      const dubUrl = `/watch/anime-${animeId}/ep-${num}?type=dub`;

      if (ep.sub !== false) {
        subList.push({ name: epTitle, url: subUrl });
      }
      if (ep.dub === true) {
        dubList.push({ name: epTitle, url: dubUrl });
      }
      defaultList.push({ name: epTitle, url: `/watch/anime-${animeId}/ep-${num}` });
    }

    const episodeGroups = [];
    if (subList.length > 0) {
      episodeGroups.push({ title: "SUB", urls: subList });
    }
    if (dubList.length > 0) {
      episodeGroups.push({ title: "DUB", urls: dubList });
    }
    if (episodeGroups.length === 0 && defaultList.length > 0) {
      episodeGroups.push({ title: "Default", urls: defaultList });
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
    const urlMatch =
      episodeUrl.match(/anime-(\d+)\/ep-(\d+)/i) || episodeUrl.match(/(\d+)[/-](\d+)/);

    if (!urlMatch) {
      throw new Error(`Unable to parse anime and episode number from: ${episodeUrl}`);
    }

    const animeId = urlMatch[1];
    const epNum = Number(urlMatch[2]);

    let audioPref = (await this.getSetting("preferred_audio")) || "sub";
    if (episodeUrl.includes("type=dub")) {
      audioPref = "dub";
    } else if (episodeUrl.includes("type=sub")) {
      audioPref = "sub";
    }

    const serverPref = (await this.getSetting("preferred_server")) || "auto";

    const session = await this._ensureSession();

    // Fetch servers from /api/loadSVs
    const svRes = await this._apiPost("loadSVs", {
      id: Number(animeId),
      ep: epNum,
      token: session.snatchToken,
    });

    const s = svRes?.server || {};
    const subServers = Array.isArray(s.sub) ? s.sub : [];
    const dubServers = Array.isArray(s.dub) ? s.dub : [];
    const softSubServers = Array.isArray(s["soft-sub"]) ? s["soft-sub"] : [];

    let pool = [];
    if (audioPref === "dub") {
      pool = [...dubServers, ...subServers, ...softSubServers];
    } else if (audioPref === "soft-sub") {
      pool = [...softSubServers, ...subServers, ...dubServers];
    } else {
      pool = [...subServers, ...softSubServers, ...dubServers];
    }

    if (pool.length === 0) {
      throw new Error(`No video playback servers found for anime ${animeId} episode ${epNum}`);
    }

    // If preferred server specified, move it to front
    if (serverPref !== "auto") {
      pool.sort((a, b) => {
        if (a.server === serverPref) return -1;
        if (b.server === serverPref) return 1;
        return (b.priority || 0) - (a.priority || 0);
      });
    }

    const proxyKey =
      Object.keys(session.proxys).length > 0 ? Object.keys(session.proxys).join("~") : "1~2~3~4~5";

    let primarySource = null;
    let allSubtitles = [];
    let skipData = null;
    const allSources = [];

    // Try resolving primary server then fallbacks
    for (let i = 0; i < Math.min(pool.length, 3); i++) {
      const srv = pool[i];
      try {
        const playerPath = `/video/${srv.source}-${proxyKey}-none`;
        const playerRes = await this.req(playerPath);
        const playerHtml = typeof playerRes === "string" ? playerRes : playerRes.body || "";

        const iframeMatch =
          playerHtml.match(/<iframe[^>]+id="player"[^>]+src="([^"]+)"/i) ||
          playerHtml.match(/<iframe[^>]+src="([^"]+)"/i);

        if (!iframeMatch) continue;
        const embedUrl = iframeMatch[1];

        // Fetch embed iframe
        const embedRes = await this.request(embedUrl, {
          headers: {
            Referer: await this.getBaseUrl(),
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        const embedHtml = typeof embedRes === "string" ? embedRes : embedRes.body || "";
        const sourceMatch = embedHtml.match(/const\s+source\s*=\s*({[\s\S]*?});\s*<\/script>/i);
        if (!sourceMatch) continue;

        let sourceObj;
        try {
          sourceObj = new Function(`return ${sourceMatch[1]};`)();
        } catch (_) {
          continue;
        }

        const m3u8Url = sourceObj?.src?.url;
        if (!m3u8Url) continue;

        // Collect subtitles
        if (Array.isArray(sourceObj.subtitles)) {
          for (const sub of sourceObj.subtitles) {
            if (!sub || !sub.file || sub.label === "NONE") continue;
            const label = sub.label || sub.language || "Subtitles";
            if (!allSubtitles.some((st) => st.url === sub.file)) {
              allSubtitles.push({
                title: label,
                language: label,
                url: sub.file,
                default: Boolean(sub.default),
              });
            }
          }
        }

        // Collect skip intervals
        if (Array.isArray(sourceObj.skips) && !skipData) {
          skipData = {};
          for (const sk of sourceObj.skips) {
            if (sk.label?.toLowerCase().includes("intro")) {
              skipData.intro = [sk.start, sk.end];
            } else if (sk.label?.toLowerCase().includes("outro")) {
              skipData.outro = [sk.start, sk.end];
            }
          }
        }

        // Parse resolution variants
        const variants = await this._parseM3u8Variants(m3u8Url, embedUrl);
        const serverName = srv.title || srv.server || "Server";

        if (variants.length > 0) {
          for (const v of variants) {
            allSources.push({
              server: `${serverName} • ${v.quality}`,
              quality: v.quality,
              url: v.url,
              type: "hls",
              headers: { Referer: embedUrl },
              subtitles: allSubtitles,
              skip: skipData,
            });
          }
        }

        allSources.push({
          server: `${serverName} • Auto`,
          quality: "auto",
          url: m3u8Url,
          type: "hls",
          headers: { Referer: embedUrl },
          subtitles: allSubtitles,
          skip: skipData,
          qualities: variants,
        });

        if (!primarySource) {
          primarySource = {
            url: m3u8Url,
            headers: { Referer: embedUrl },
          };
        }
      } catch (_) {}
    }

    if (!primarySource && allSources.length === 0) {
      throw new Error("Unable to extract playable stream from AniSnatch servers.");
    }

    return {
      url: primarySource ? primarySource.url : allSources[0].url,
      type: "hls",
      headers: primarySource ? primarySource.headers : allSources[0].headers,
      subtitles: allSubtitles,
      skip_data: skipData,
      sources: allSources,
    };
  }

  async _parseM3u8Variants(masterUrl, referer) {
    try {
      const res = await this.request(masterUrl, {
        headers: {
          Referer: referer,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      const text = typeof res === "string" ? res : res.body || "";
      if (!text || !text.includes("#EXT-X-STREAM-INF")) return [];

      const lines = text.split("\n");
      const variants = [];
      let currentResolution = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("#EXT-X-STREAM-INF")) {
          const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
          currentResolution = resMatch ? resMatch[1] : null;
        } else if (line && !line.startsWith("#")) {
          let quality = "auto";
          if (currentResolution) {
            const height = currentResolution.split("x")[1];
            quality = `${height}p`;
          }
          let variantUrl = line;
          if (!variantUrl.startsWith("http")) {
            const base = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
            variantUrl = `${base}${line.replace(/^\/+/, "")}`;
          }
          variants.push({ quality, url: variantUrl });
          currentResolution = null;
        }
      }
      return variants;
    } catch (_) {
      return [];
    }
  }
}
