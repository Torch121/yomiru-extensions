// ==YomiruExtension==
// @name         Otaku Arab
// @version      v1.0.1
// @author       Yomiru
// @lang         ar
// @license      MIT
// @icon         https://otakuarab.com/favicon.ico
// @package      com.otakuarab
// @type         bangumi
// @webSite      https://otakuarab.com
// @nsfw         false
// @description  مشاهدة أحدث مسلسلات وأفلام الأنمي المترجمة أون لاين عبر موقع أوتاكو عرب (Otaku Arab)
// ==/YomiruExtension==

export default class extends Extension {
  constructor() {
    super();
    this.firestoreBase =
      "https://firestore.googleapis.com/v1/projects/test-738e8/databases/(default)/documents";
    this.apiKey = "AIzaSyCXWmGIDp6wG9c-77mYq6STTK2MbTLvz0c";
    this.cachedCatalogue = null;
    this.lastCatalogueFetch = 0;
    this.pageSize = 24;
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

  _parseFirestoreValue(val) {
    if (!val || typeof val !== "object") return val;
    if ("stringValue" in val) return val.stringValue;
    if ("integerValue" in val) return parseInt(val.integerValue, 10);
    if ("doubleValue" in val) return parseFloat(val.doubleValue);
    if ("booleanValue" in val) return val.booleanValue;
    if ("mapValue" in val) {
      const obj = {};
      for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
        obj[k] = this._parseFirestoreValue(v);
      }
      return obj;
    }
    if ("arrayValue" in val) {
      return (val.arrayValue.values || []).map((v) => this._parseFirestoreValue(v));
    }
    return null;
  }

  _parseFirestoreDoc(doc) {
    if (!doc || !doc.fields) return null;
    const obj = {};
    for (const [k, v] of Object.entries(doc.fields)) {
      obj[k] = this._parseFirestoreValue(v);
    }
    return obj;
  }

  async _getCatalogue() {
    const now = Date.now();
    if (this.cachedCatalogue && now - this.lastCatalogueFetch < 10 * 60 * 1000) {
      return this.cachedCatalogue;
    }

    const url = `${this.firestoreBase}/catalogue?key=${this.apiKey}`;
    const res = await this.request(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://otakuarab.com/",
      },
    });

    const col = this.parseJson(res);
    const docs = col?.documents || [];
    const allItems = [];

    for (const doc of docs) {
      if (!doc.name || !doc.name.includes("chunk_")) continue;
      const parsed = this._parseFirestoreDoc(doc);
      if (Array.isArray(parsed?.items)) {
        allItems.push(...parsed.items);
      }
    }

    this.cachedCatalogue = allItems;
    this.lastCatalogueFetch = now;
    return allItems;
  }

  _formatAnime(it) {
    if (!it) return null;
    const id = it.AnimeId || it.id || it.animeId;
    const title = it.AR_Title || it.EN_Title || it.JP_Title || it.title || id;
    const cover = it.imageUrl || it.poster || "";

    return {
      title,
      cover,
      url: id,
    };
  }

  async popular(page) {
    const items = await this._getCatalogue();
    const p = Math.max(1, page || 1);
    const start = (p - 1) * this.pageSize;
    const sorted = [...items].sort((a, b) => {
      const vA = parseInt(a.views || 0, 10);
      const vB = parseInt(b.views || 0, 10);
      return vB - vA;
    });
    return sorted.slice(start, start + this.pageSize).map((it) => this._formatAnime(it)).filter(Boolean);
  }

  async latest(page) {
    const items = await this._getCatalogue();
    const p = Math.max(1, page || 1);
    const start = (p - 1) * this.pageSize;
    return items.slice(start, start + this.pageSize).map((it) => this._formatAnime(it)).filter(Boolean);
  }

  async search(kw, page, filter) {
    const items = await this._getCatalogue();
    let query = "";

    if (typeof kw === "object" && kw !== null) {
      query = kw.arabicTitle || kw.englishTitle || kw.english || kw.japaneseTitle || kw.query || "";
    } else {
      query = String(kw || "").trim();
    }

    const q = query.toLowerCase().trim();
    if (!q) {
      return this.popular(page);
    }

    const matched = items.filter((it) => {
      const ar = (it.AR_Title || "").toLowerCase();
      const en = (it.EN_Title || "").toLowerCase();
      const jp = (it.JP_Title || "").toLowerCase();
      const syn = (it.Synonyms || "").toLowerCase();
      const id = (it.AnimeId || it.id || "").toLowerCase();
      return ar.includes(q) || en.includes(q) || jp.includes(q) || syn.includes(q) || id.includes(q);
    });

    const p = Math.max(1, page || 1);
    const start = (p - 1) * this.pageSize;
    return matched.slice(start, start + this.pageSize).map((it) => this._formatAnime(it)).filter(Boolean);
  }

  async detail(animeIdOrUrl) {
    let cleanId = animeIdOrUrl;
    if (typeof cleanId === "string") {
      if (cleanId.includes("/anime/")) {
        cleanId = cleanId.split("/anime/")[1].split("/")[0].split("?")[0];
      } else if (cleanId.startsWith("http")) {
        cleanId = cleanId.split("/").pop().split("?")[0];
      }
    }

    const items = await this._getCatalogue();
    const found = items.find((it) => (it.AnimeId || it.id) === cleanId) || { id: cleanId };

    let episodes = [];
    try {
      const epUrl = `${this.firestoreBase}/episodes/${encodeURIComponent(cleanId)}?key=${this.apiKey}`;
      const epRes = await this.request(epUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Referer: "https://otakuarab.com/",
        },
      });
      const parsedDoc = this.parseJson(epRes);
      const parsedFields = this._parseFirestoreDoc(parsedDoc);
      episodes = Array.isArray(parsedFields?.items) ? parsedFields.items : [];
    } catch (_) {}

    const title = found.AR_Title || found.EN_Title || found.JP_Title || found.title || cleanId;
    const cover = found.imageUrl || found.poster || "";
    const desc = (found.plot || found.synopsis || found.description || "").trim();

    const formattedEpisodes = episodes.map((ep, idx) => {
      const num = ep.epNum ?? parseInt(ep.Episode, 10) ?? idx + 1;
      return {
        name: `الحلقة ${num}`,
        url: `${cleanId}:${num}`,
      };
    });

    if (formattedEpisodes.length === 0) {
      formattedEpisodes.push({
        name: "الحلقة 1",
        url: `${cleanId}:1`,
      });
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "الحلقات",
          urls: formattedEpisodes,
        },
      ],
    };
  }

  async watch(target) {
    let animeId = target;
    let episodeNumber = 1;

    if (typeof target === "string" && target.includes(":")) {
      const parts = target.split(":");
      animeId = parts[0];
      episodeNumber = parts[1] ? parseFloat(parts[1]) : 1;
    } else if (typeof target === "string" && target.includes("/watch/")) {
      const match = target.match(/\/watch\/([^/]+)\/(\d+)/);
      if (match) {
        animeId = match[1];
        episodeNumber = parseFloat(match[2]);
      }
    }

    const epUrl = `${this.firestoreBase}/episodes/${encodeURIComponent(animeId)}?key=${this.apiKey}`;
    const epRes = await this.request(epUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://otakuarab.com/",
      },
    });

    const parsedDoc = this.parseJson(epRes);
    const parsedFields = this._parseFirestoreDoc(parsedDoc);
    const episodes = Array.isArray(parsedFields?.items) ? parsedFields.items : [];

    const epItem =
      episodes.find((e) => (e.epNum ?? parseInt(e.Episode, 10)) === episodeNumber) ||
      episodes[episodeNumber - 1] ||
      episodes[0];

    if (!epItem) {
      throw new Error(`Episode ${episodeNumber} not found for ${animeId}`);
    }

    const sources = [];

    // 1. MP4Upload server - Direct video extraction
    if (epItem.FRLink) {
      let directMp4 = null;
      try {
        const mp4Html = await this.request(`https://www.mp4upload.com/embed-${epItem.FRLink}.html`, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: "https://otakuarab.com/",
          },
        });
        const htmlStr = typeof mp4Html === "string" ? mp4Html : (mp4Html?.body || "");
        const match =
          htmlStr.match(/player\.src\(\s*(?:\{\s*src\s*:\s*)?["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
          htmlStr.match(/src:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
          htmlStr.match(/https?:\/\/[a-zA-Z0-9_.:-]+\.mp4upload\.com:[0-9]+\/d\/[^\s"'<>]+\/video\.mp4/i);
        if (match) {
          directMp4 = match[1] || match[0];
        }
      } catch (_) {}

      if (directMp4) {
        sources.push({
          name: "MP4Upload (Direct Video)",
          url: directMp4,
          quality: "720p",
          type: "mp4",
          isM3U8: false,
          headers: {
            Referer: "https://www.mp4upload.com/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          },
        });
      } else {
        sources.push({
          name: "MP4Upload (Embed)",
          url: `https://www.mp4upload.com/embed-${epItem.FRLink}.html`,
          quality: "Auto",
          type: "embed",
          isEmbed: true,
          requiresBrowser: true,
          isM3U8: false,
        });
      }
    }

    // 2. OK.ru server
    if (epItem.OKLink) {
      sources.push({
        name: "OK.ru (Embed)",
        url: `https://ok.ru/videoembed/${epItem.OKLink}`,
        quality: "Auto",
        type: "embed",
        isEmbed: true,
        requiresBrowser: true,
        isM3U8: false,
      });
    }

    // 3. Google Drive server
    if (epItem.GDLink) {
      sources.push({
        name: "Google Drive (Embed)",
        url: `https://drive.google.com/file/d/${epItem.GDLink}/preview`,
        quality: "Auto",
        type: "embed",
        isEmbed: true,
        requiresBrowser: true,
        isM3U8: false,
      });
    }

    // 4. MEGA server
    if (epItem.MALink && epItem.MALink.includes("!")) {
      const [n, i] = epItem.MALink.split("!");
      if (n && i) {
        sources.push({
          name: "MEGA (Embed)",
          url: `https://mega.nz/embed/${n}#${i}`,
          quality: "Auto",
          type: "embed",
          isEmbed: true,
          requiresBrowser: true,
          isM3U8: false,
        });
      }
    }

    if (sources.length === 0) {
      throw new Error(`No streaming servers found for ${animeId} episode ${episodeNumber}`);
    }

    const first = sources[0];
    return {
      type: first.type || (first.isM3U8 ? "hls" : "embed"),
      url: first.url,
      headers: {
        Referer: "https://otakuarab.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      subtitles: [],
      sources,
    };
  }
}
