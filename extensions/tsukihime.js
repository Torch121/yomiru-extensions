// ==YomiruExtension==
// @name         TsukiHime
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://tsukihime.org/favicon.ico
// @package      org.tsukihime
// @type         bangumi
// @webSite      https://tsukihime.org
// @description  Anime torrent indexer providing high-speed BitTorrent and Magnet streams from TsukiHime (tsukihime.org).
// ==/YomiruExtension==

export default class extends Extension {
  async req(url, options = {}) {
    const webBase = (await this.getSetting("tsukihime_url")) || "https://tsukihime.org";
    const apiBase =
      (await this.getSetting("tsukihime_api_url")) || "https://api.tsukihime.org/v1";
    const cleanWeb = webBase.replace(/\/+$/, "");
    const cleanApi = apiBase.replace(/\/+$/, "");

    let fullUrl = url;
    if (!url.startsWith("http")) {
      const normalizedPath = url.startsWith("/") ? url : `/${url}`;
      if (normalizedPath.startsWith("/v1/")) {
        const apiOrigin = cleanApi.replace(/\/v1$/, "");
        fullUrl = `${apiOrigin}${normalizedPath}`;
      } else {
        fullUrl = `${cleanApi}${normalizedPath}`;
      }
    }

    return this.request(fullUrl, {
      ...options,
      headers: {
        "Miru-Url": cleanWeb,
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `${cleanWeb}/`,
        ...(options.headers || {}),
      },
    });
  }

  async reqJson(url, options = {}) {
    const raw = await this.req(url, options);
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_) {
      return null;
    }
  }

  async load() {
    await this.registerSetting({
      title: "TsukiHime Website URL",
      key: "tsukihime_url",
      type: "input",
      description: "Base website URL for TsukiHime (default: https://tsukihime.org)",
      defaultValue: "https://tsukihime.org",
    });

    await this.registerSetting({
      title: "TsukiHime API URL",
      key: "tsukihime_api_url",
      type: "input",
      description: "Base REST API URL for TsukiHime (default: https://api.tsukihime.org/v1)",
      defaultValue: "https://api.tsukihime.org/v1",
    });

    await this.registerSetting({
      title: "Default Source",
      key: "default_source",
      type: "radio",
      description: "Filter torrents by upstream indexer source (empty for all sources)",
      defaultValue: "",
    });

    await this.registerSetting({
      title: "Default Sort",
      key: "default_sort",
      type: "radio",
      description: "Default sorting field (source_date, added_date, or totalsize)",
      defaultValue: "source_date",
    });
  }

  get filters() {
    return this.getFilterSchema();
  }

  getFilterSchema() {
    return {
      main_source: {
        title: "Source",
        options: {
          "": "All Sources",
          "1": "Nyaa",
          "3": "NekoBT",
          "2": "Sukebei",
          "0": "TokyoTosho / Other",
        },
      },
      sortBy: {
        title: "Sort By",
        options: {
          "source_date": "Release Date (Latest)",
          "added_date": "Date Indexed",
          "totalsize": "File Size",
        },
      },
      order: {
        title: "Sort Order",
        options: {
          "desc": "Descending",
          "asc": "Ascending",
        },
      },
      isAdult: {
        title: "Content Filter",
        options: {
          "0": "Non-Adult Only (SFW)",
          "": "All Releases",
          "1": "Adult Only (NSFW)",
        },
      },
    };
  }

  // 1. Popular Releases
  async popular(page) {
    const p = Math.max(1, page || 1);
    const defaultSource = (await this.getSetting("default_source")) || "";
    const defaultSort = (await this.getSetting("default_sort")) || "source_date";
    const limit = 50;
    const offset = (p - 1) * limit;

    let query = `/torrents?limit=${limit}&offset=${offset}&sort_by=${encodeURIComponent(defaultSort)}&order=desc&is_adult=0`;
    if (defaultSource) {
      query += `&main_source=${encodeURIComponent(defaultSource)}`;
    }

    const res = await this.reqJson(query);
    return this._parseResults(res);
  }

  // 2. Latest Releases (Sorted by source_date descending)
  async latest(page) {
    const p = Math.max(1, page || 1);
    const defaultSource = (await this.getSetting("default_source")) || "";
    const limit = 50;
    const offset = (p - 1) * limit;

    let query = `/torrents?limit=${limit}&offset=${offset}&sort_by=source_date&order=desc&is_adult=0`;
    if (defaultSource) {
      query += `&main_source=${encodeURIComponent(defaultSource)}`;
    }

    const res = await this.reqJson(query);
    return this._parseResults(res);
  }

  // 3. Search Torrents by Keyword, BTIH, or Filters
  async search(kw, page, filter) {
    const p = Math.max(1, page || 1);
    const defaultSource = (await this.getSetting("default_source")) || "";
    const defaultSort = (await this.getSetting("default_sort")) || "source_date";

    const mainSource =
      filter && filter.main_source !== undefined ? filter.main_source : defaultSource;
    const sortBy = filter && filter.sortBy ? filter.sortBy : defaultSort;
    const order = filter && filter.order ? filter.order : "desc";
    const isAdult = filter && filter.isAdult !== undefined ? filter.isAdult : "0";

    const limit = 50;
    const offset = (p - 1) * limit;

    let queryToSearch = "";
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";

      if (jp && jp.trim().length >= 2) {
        const jpRes = await this._executeSearchQuery(jp.trim(), limit, offset, mainSource, isAdult);
        if (jpRes && jpRes.length > 0) {
          return jpRes;
        }
      }
      queryToSearch = en || jp || "";
    } else {
      queryToSearch = String(kw || "").trim();
    }

    if (queryToSearch.length >= 2) {
      return this._executeSearchQuery(queryToSearch, limit, offset, mainSource, isAdult);
    }

    // Fallback to filtered catalog browse when query is empty or < 2 chars
    let listUrl = `/torrents?limit=${limit}&offset=${offset}&sort_by=${encodeURIComponent(sortBy)}&order=${encodeURIComponent(order)}`;
    if (mainSource !== "") {
      listUrl += `&main_source=${encodeURIComponent(mainSource)}`;
    }
    if (isAdult !== "") {
      listUrl += `&is_adult=${encodeURIComponent(isAdult)}`;
    }

    const res = await this.reqJson(listUrl);
    return this._parseResults(res);
  }

  async _executeSearchQuery(q, limit, offset, mainSource, isAdult) {
    const trimmed = q.trim();
    // Support direct 40-char hex BTIH lookup
    if (/^[a-fA-F0-9]{40}$/.test(trimmed)) {
      const btihRes = await this.reqJson(`/torrents/btih/${trimmed}`);
      if (btihRes && !btihRes.error && btihRes.id) {
        return this._parseResults({ results: [btihRes] });
      }
    }

    const res = await this.reqJson(
      `/search/torrents?q=${encodeURIComponent(trimmed)}&limit=${limit}&offset=${offset}`
    );
    if (!res || !Array.isArray(res.results)) {
      return [];
    }

    let items = res.results.filter((r) => r && r.state !== "error");
    if (mainSource !== "" && mainSource !== undefined && mainSource !== null) {
      items = items.filter((r) => String(r.main_source) === String(mainSource));
    }
    if (isAdult === "0") {
      items = items.filter((r) => !r.is_adult || r.is_adult === 0);
    } else if (isAdult === "1") {
      items = items.filter((r) => r.is_adult === 1);
    }

    // Prioritize completed multi-file batch releases first so full-season packs match cleanly,
    // while preserving relative search relevance within each group.
    const scored = items.map((item, idx) => {
      const isCompleted = item.state === "completed" ? 1 : 0;
      const isBatch = (item.filecount || 0) > 1 || /batch|\bS\d{1,2}\b/i.test(item.name || "") ? 1 : 0;
      const priority = isCompleted * 2 + isBatch;
      return { item, idx, priority };
    });

    scored.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.idx - b.idx;
    });

    return this._parseResults({ results: scored.map((s) => s.item) });
  }

  // 4. Torrent Details & Episode / File Breakdown
  async detail(url) {
    const torrentId = this._extractTorrentId(url);
    if (!torrentId) {
      throw new Error(`Unable to extract torrent ID from URL: ${url}`);
    }

    const data = await this.reqJson(`/torrents/${torrentId}`);
    if (!data || data.error || !data.id) {
      throw new Error(`Failed to retrieve torrent details for ID: ${torrentId}`);
    }

    const title = data.name || "TsukiHime Release";
    const fileSize = this._formatBytes(data.totalsize);
    const sourceName = this._getSourceName(data.main_source);
    const groupName = data.group && data.group.name ? data.group.name : "Anonymous";
    const date = data.source_date
      ? new Date(data.source_date * 1000).toISOString().split("T")[0]
      : "";

    // Aggregate live swarm stats across trackers
    const trackers = Array.isArray(data.trackers) ? data.trackers : [];
    const seeders = trackers.reduce((max, t) => Math.max(max, t.seeders || 0), 0);
    const leechers = trackers.reduce((max, t) => Math.max(max, t.leechers || 0), 0);
    const completed = trackers.reduce((max, t) => Math.max(max, t.complete || 0), 0);

    // Extract Files
    const files = Array.isArray(data.files) ? data.files : [];
    const videoExts = [".mkv", ".mp4", ".avi", ".ts", ".m4v", ".webm"];
    const videoFiles = files.filter((f) => {
      const name = (f.filename || f.name || f.path || "").toLowerCase();
      return videoExts.some((ext) => name.endsWith(ext));
    });
    const targetFiles = videoFiles.length > 0 ? videoFiles : files;

    // Extract Poster / Cover
    let cover = "https://tsukihime.org/favicon.ico";
    if (data.anime && data.anime.thumbnail) {
      cover = data.anime.thumbnail;
    } else {
      const fileWithFrames = targetFiles.find(
        (f) => Array.isArray(f.vidframes) && f.vidframes.length > 0
      );
      const frameThumb = this._getFrameThumbnail(fileWithFrames);
      if (frameThumb) {
        cover = frameThumb;
      }
    }

    // Audio & Subtitle language badges
    const audioLangs = Array.isArray(data.audiolangs) && data.audiolangs.length > 0
      ? data.audiolangs.map((l) => l.toUpperCase()).join(", ")
      : "";
    const subLangs = Array.isArray(data.sublangs) && data.sublangs.length > 0
      ? data.sublangs.map((l) => l.toUpperCase()).join(", ")
      : "";

    const rawSynopsis =
      data.anime && data.anime.synopsis
        ? data.anime.synopsis.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : "";

    const formattedDesc = [
      `Source: ${sourceName} • Group: ${groupName}${date ? ` • Date: ${date}` : ""}`,
      `File Size: ${fileSize || "N/A"} • Seeders: ${seeders} • Leechers: ${leechers} • Completed: ${completed}`,
      audioLangs || subLangs
        ? [audioLangs ? `Audio: ${audioLangs}` : "", subLangs ? `Subtitles: ${subLangs}` : ""]
            .filter(Boolean)
            .join(" • ")
        : "",
      data.btih ? `BTIH: ${data.btih}` : "",
      rawSynopsis ? `\n---\n${rawSynopsis}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const studios =
      data.anime && Array.isArray(data.anime.studios) ? data.anime.studios : [];

    // Filter out extra files so main episodes are ordered first
    const extrasKeywords = ["ncop", "nced", "op ", "ed ", "pv", "extra", "menu", "creditless"];
    const getBaseName = (f) => {
      const raw = f.filename || f.name || f.path || "";
      return raw.split("/").pop() || raw;
    };
    const isExtra = (name) => {
      const lower = name.toLowerCase();
      return extrasKeywords.some((kw) => lower.includes(kw));
    };

    const mainEpisodes = targetFiles.filter((f) => !isExtra(getBaseName(f)));
    const extraEpisodes = targetFiles.filter((f) => isExtra(getBaseName(f)));
    const orderedFiles = [...mainEpisodes, ...extraEpisodes];

    const episodes = [];
    const basePath = `/torrents/${torrentId}`;

    if (orderedFiles.length > 1) {
      // Multi-file batch release
      for (let i = 0; i < orderedFiles.length; i++) {
        const f = orderedFiles[i];
        const name = getBaseName(f) || `Episode ${i + 1}`;
        const sz = this._formatBytes(f.size || f.length);
        const epObj = {
          name: sz ? `${name} (${sz})` : name,
          url: `${basePath}#file-${i}`,
        };
        const thumb = this._getFrameThumbnail(f);
        if (thumb) {
          epObj.thumbnail = thumb;
        }
        episodes.push(epObj);
      }
    } else {
      // Single-file or unprocessed torrent
      if (orderedFiles.length === 1) {
        const f = orderedFiles[0];
        const name = getBaseName(f) || title;
        const sz = this._formatBytes(f.size || f.length) || fileSize;
        const epObj = {
          name: sz ? `${name} (${sz})` : name,
          url: basePath,
        };
        const thumb = this._getFrameThumbnail(f);
        if (thumb) {
          epObj.thumbnail = thumb;
        }
        episodes.push(epObj);
      } else {
        episodes.push({
          name: fileSize ? `${title} (${fileSize})` : title,
          url: basePath,
        });
      }

      // If this torrent belongs to an indexed anime with other single-episode torrents,
      // also include sibling episode torrents so airing anime show all available episodes.
      if (data.anime && data.anime.id) {
        try {
          const animeTorrents = await this.reqJson(`/animes/${data.anime.id}?limit=100`);
          if (animeTorrents && Array.isArray(animeTorrents.results)) {
            for (const sib of animeTorrents.results) {
              if (!sib || sib.id === data.id || sib.state === "error") continue;
              if (sib.episode_no !== null && sib.episode_no !== undefined) {
                const sibSize = this._formatBytes(sib.totalsize);
                const sibLabel = sibSize ? `${sib.name} (${sibSize})` : sib.name;
                episodes.push({
                  name: sibLabel,
                  url: `/torrents/${sib.id}`,
                });
              }
            }
          }
        } catch (_) {
          // Ignore sibling lookup failure and return primary torrent episode
        }
      }
    }

    return {
      title,
      cover,
      desc: formattedDesc,
      studios,
      episodes: [
        {
          title: orderedFiles.length > 1 ? "Batch Episodes / Files" : "Torrent Media",
          urls: episodes,
        },
      ],
    };
  }

  // 5. Watch Stream Extraction (Direct .torrent CDN, Upstream Mirrors & Magnet Swarm)
  async watch(url) {
    const torrentId = this._extractTorrentId(url);
    if (!torrentId) {
      throw new Error(`Unable to extract torrent ID for playback from URL: ${url}`);
    }

    const webBase = (await this.getSetting("tsukihime_url")) || "https://tsukihime.org";
    const cleanWeb = webBase.replace(/\/+$/, "");

    const data = await this.reqJson(`/torrents/${torrentId}`);
    if (!data || data.error || !data.id) {
      throw new Error(`Failed to resolve torrent metainfo for stream: ${torrentId}`);
    }

    const sources = [];
    const encodedName = encodeURIComponent(data.name || `tsukihime-${data.id}`);

    // 1. TsukiHime Storage CDN .torrent (available for native completed torrents)
    const isSkippedOrUnprocessed = ["skipped", "unprocessed", "error"].includes(
      (data.state || "").toLowerCase()
    );
    const isAnimeTosho = Boolean(data.animetosho) || Number(data.id) > 1000000000;

    if (!isSkippedOrUnprocessed && !isAnimeTosho) {
      sources.push({
        name: "TsukiHime .torrent CDN",
        url: `https://storage.tsukihime.org/torrent/${data.id}/${encodedName}.torrent`,
        type: "torrent",
        quality: "Auto",
      });
    }

    // 2. Upstream indexer direct .torrent mirrors (Nyaa, NekoBT, Sukebei)
    if (data.nyaa_id && Number(data.nyaa_id) > 0) {
      sources.push({
        name: "Nyaa .torrent Mirror",
        url: `https://nyaa.si/download/${data.nyaa_id}.torrent`,
        type: "torrent",
        quality: "Auto",
      });
    }
    if (data.nekobt_id && Number(data.nekobt_id) > 0) {
      sources.push({
        name: "NekoBT .torrent Mirror",
        url: `https://nekobt.to/api/v1/torrents/${data.nekobt_id}/download?ext=.torrent`,
        type: "torrent",
        quality: "Auto",
      });
    }
    if (data.sukebei_id && Number(data.sukebei_id) > 0) {
      sources.push({
        name: "Sukebei .torrent Mirror",
        url: `https://sukebei.nyaa.si/download/${data.sukebei_id}.torrent`,
        type: "torrent",
        quality: "Auto",
      });
    }

    // 3. Magnet URI constructed from BTIH and live tracker list
    const magnetUri = this._buildMagnetUri(data);
    if (magnetUri) {
      sources.push({
        name: "Magnet Swarm (P2P)",
        url: magnetUri,
        type: "torrent",
        quality: "Auto",
      });
    }

    if (sources.length === 0) {
      throw new Error(`Could not locate BitTorrent or Magnet links for ${url}`);
    }

    const primaryUrl = sources[0].url;

    return {
      type: "torrent",
      url: primaryUrl,
      sources,
      headers: {
        Referer: `${cleanWeb}/`,
      },
    };
  }

  // Helper: Builds Magnet URI with live trackers from TsukiHime + curated fallback trackers
  _buildMagnetUri(data) {
    if (!data || !data.btih) return null;
    const btih = String(data.btih).trim();
    if (!btih) return null;

    const dn = encodeURIComponent(data.name || `tsukihime-${data.id}`);
    let magnet = `magnet:?xt=urn:btih:${btih}&dn=${dn}`;

    const seenTrackers = new Set();
    const addTracker = (trUrl) => {
      if (!trUrl || seenTrackers.has(trUrl)) return;
      seenTrackers.add(trUrl);
      magnet += `&tr=${encodeURIComponent(trUrl)}`;
    };

    if (Array.isArray(data.trackers) && data.trackers.length > 0) {
      const sorted = [...data.trackers].sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
      for (const tr of sorted) {
        if (tr && tr.url) addTracker(tr.url);
      }
    }

    const defaultTrackers = [
      "http://nyaa.tracker.wf:7777/announce",
      "https://tracker.nekobt.to/api/tracker/public/announce",
      "udp://tracker.opentrackr.org:1337/announce",
      "udp://open.stealth.si:80/announce",
      "udp://tracker.torrent.eu.org:451/announce",
      "udp://exodus.desync.com:6969/announce",
    ];
    for (const tr of defaultTrackers) {
      addTracker(tr);
    }

    return magnet;
  }

  // Helper: Builds 16:9 episode screenshot URL from TsukiHime vidframes
  _getFrameThumbnail(file) {
    if (!file || !file.id || !Array.isArray(file.vidframes) || file.vidframes.length === 0) {
      return null;
    }
    let fileId = Number(file.id);
    if (isNaN(fileId) || fileId <= 0) return null;

    let base = "https://storage.tsukihime.org";
    if (fileId > 1000000000) {
      fileId -= 1000000000;
      base += "/tosho";
    }
    const hexId = fileId.toString(16).padStart(8, "0").toUpperCase();
    const midIdx = Math.floor(file.vidframes.length / 2);
    const frameTs = file.vidframes[midIdx] ?? file.vidframes[0];
    return `${base}/sframes/${hexId}_${frameTs}.jpg?w=320&h=180`;
  }

  // Helper: Extracts numeric torrent ID from URL / Path
  _extractTorrentId(url) {
    if (!url) return null;
    const clean = String(url).split("#")[0];
    const match = clean.match(/(?:torrents\/|view\/|^)(\d+)/);
    if (match) return match[1];
    const digits = clean.match(/\d+/);
    return digits ? digits[0] : null;
  }

  // Helper: Maps upstream source ID to human-readable name
  _getSourceName(mainSource) {
    switch (Number(mainSource)) {
      case 1:
        return "Nyaa";
      case 2:
        return "Sukebei";
      case 3:
        return "NekoBT";
      default:
        return "TsukiHime";
    }
  }

  // Helper: Formats search/catalog results array from API payload
  _parseResults(data) {
    if (!data || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((item) => {
      const id = item.id;
      const title = item.name || "TsukiHime Release";
      const sizeStr = this._formatBytes(item.totalsize);
      const groupName = item.group && item.group.name ? item.group.name : "";
      const sourceName = this._getSourceName(item.main_source);
      const filesStr = item.filecount && item.filecount > 1 ? `${item.filecount} files` : "";

      let cover = "https://tsukihime.org/favicon.ico";
      if (item.anime && item.anime.thumbnail) {
        cover = item.anime.thumbnail;
      }

      const updateInfo = [sizeStr, filesStr, groupName, sourceName]
        .filter(Boolean)
        .join(" • ");

      return {
        title,
        url: `/torrents/${id}`,
        cover,
        update: updateInfo,
      };
    });
  }

  // Helper: Formats bytes into human-readable unit
  _formatBytes(bytes) {
    if (!bytes) return "";
    const b = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
    if (isNaN(b) || b <= 0) return "";
    const k = 1024;
    const sizes = ["B", "KiB", "MiB", "GiB", "TiB"];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}
