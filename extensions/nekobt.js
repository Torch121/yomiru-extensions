// ==YomiruExtension==
// @name         NekoBT
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://nekobt.to/cdn/pfp/null/64
// @package      to.nekobt
// @type         bangumi
// @webSite      https://nekobt.to
// @description  Anime torrent indexer providing high-speed BitTorrent and Magnet streams from NekoBT (nekobt.to).
// ==/YomiruExtension==

export default class extends Extension {
  async req(url, options = {}) {
    const base = (await this.getSetting("nekobt_url")) || "https://nekobt.to";
    const cleanBase = base.replace(/\/+$/, "");
    const fullUrl = url.startsWith("http")
      ? url
      : `${cleanBase}${url.startsWith("/") ? "" : "/"}${url}`;

    return this.request(fullUrl, {
      ...options,
      headers: {
        "Miru-Url": cleanBase,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `${cleanBase}/`,
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
      title: "NekoBT Mirror URL",
      key: "nekobt_url",
      type: "input",
      description: "Base mirror URL for NekoBT (default: https://nekobt.to)",
      defaultValue: "https://nekobt.to",
    });

    await this.registerSetting({
      title: "Default Category",
      key: "default_category",
      type: "radio",
      description: "Default category for catalog browsing (e.g. Anime)",
      defaultValue: "1",
    });

    await this.registerSetting({
      title: "Default Sort",
      key: "default_sort",
      type: "radio",
      description: "Default sorting mode (seeders for popularity or best for relevance)",
      defaultValue: "seeders",
    });
  }

  get filters() {
    return this.getFilterSchema();
  }

  getFilterSchema() {
    return {
      category: {
        title: "Category",
        options: {
          "1": "Anime",
          "0": "All Categories",
        },
      },
      sortBy: {
        title: "Sort By",
        options: {
          "best": "Best Match",
          "seeders": "Seeders (Popular)",
          "latest": "Date Added (Latest)",
          "filesize": "File Size",
          "downloads": "Downloads",
        },
      },
      batch: {
        title: "Batch Filter",
        options: {
          "": "All Releases",
          "true": "Batch Only",
          "false": "Singles Only",
        },
      },
    };
  }

  // 1. Popular Releases (Sorted by seeders)
  async popular(page) {
    const p = Math.max(1, page || 1);
    const category = (await this.getSetting("default_category")) || "1";
    const limit = 50;
    const offset = (p - 1) * limit;

    const res = await this.reqJson(
      `/api/v1/torrents/search?query=&sort_by=seeders&category=${category}&limit=${limit}&offset=${offset}`
    );
    return this._parseResults(res ? res.data : null);
  }

  // 2. Latest Releases (Sorted by latest descending)
  async latest(page) {
    const p = Math.max(1, page || 1);
    const category = (await this.getSetting("default_category")) || "1";
    const limit = 50;
    const offset = (p - 1) * limit;

    const res = await this.reqJson(
      `/api/v1/torrents/search?query=&sort_by=latest&category=${category}&limit=${limit}&offset=${offset}`
    );
    return this._parseResults(res ? res.data : null);
  }

  // 3. Search Torrents by Keyword & Filters
  async search(kw, page, filter) {
    const p = Math.max(1, page || 1);
    const defaultCat = (await this.getSetting("default_category")) || "1";
    const defaultSort = (await this.getSetting("default_sort")) || "seeders";

    const category = filter && filter.category ? filter.category : defaultCat;
    const sortBy = filter && filter.sortBy ? filter.sortBy : defaultSort;
    const batch = filter && filter.batch ? filter.batch : "";
    const limit = 50;
    const offset = (p - 1) * limit;

    let queryToSearch = "";
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";

      // Try Japanese title first if available
      if (jp && jp.trim()) {
        const batchParam = batch ? `&batch=${encodeURIComponent(batch)}` : "";
        const jpRes = await this.reqJson(
          `/api/v1/torrents/search?query=${encodeURIComponent(jp.trim())}&sort_by=${sortBy}&category=${category}&limit=${limit}&offset=${offset}${batchParam}`
        );
        const jpItems = this._parseResults(jpRes ? jpRes.data : null);
        if (jpItems && jpItems.length > 0) {
          return jpItems;
        }
      }
      queryToSearch = en || jp || "";
    } else {
      queryToSearch = String(kw || "").trim();
    }

    if (queryToSearch && queryToSearch !== "") {
      const hasSeasonOrFormat = /\b(s\d{1,2}|season\s*\d{1,2}|part\s*\d{1,2}|cour\s*\d{1,2}|movie|film|gekijouban|ova|ona|special|batch)\b/i.test(queryToSearch);
      const batchParam = batch ? `&batch=${encodeURIComponent(batch)}` : "";
      const baseRes = await this.reqJson(
        `/api/v1/torrents/search?query=${encodeURIComponent(queryToSearch)}&sort_by=${sortBy}&category=${category}&limit=${limit}&offset=${offset}${batchParam}`
      );
      const baseItems = this._parseResults(baseRes ? baseRes.data : null);
      if (baseItems && baseItems.length > 0) {
        return baseItems;
      }

      if (!hasSeasonOrFormat && p === 1) {
        // Fallback to Season 1 specific search if base query yielded no results
        const s1Query = `${queryToSearch} s1`;
        const s1Res = await this.reqJson(
          `/api/v1/torrents/search?query=${encodeURIComponent(s1Query)}&sort_by=${sortBy}&category=${category}&limit=${limit}&offset=${offset}${batchParam}`
        );
        const s1Items = this._parseResults(s1Res ? s1Res.data : null);
        if (s1Items && s1Items.length > 0) {
          return s1Items;
        }
      }

      return baseItems || [];
    }
  }

  // 4. Torrent Details & Episode / File Breakdown
  async detail(url) {
    const torrentId = this._extractTorrentId(url);
    if (!torrentId) {
      throw new Error(`Unable to extract torrent ID from URL: ${url}`);
    }

    const res = await this.reqJson(`/api/v1/torrents/${torrentId}`);
    if (!res || !res.data) {
      throw new Error(`Failed to retrieve torrent details for ID: ${torrentId}`);
    }

    const data = res.data;
    const title = data.title || "NekoBT Release";
    const seeders = data.seeders ?? 0;
    const leechers = data.leechers ?? 0;
    const completed = data.completed ?? 0;
    const fileSize = this._formatBytes(data.filesize);
    const uploader = data.uploader
      ? data.uploader.display_name || data.uploader.username || "Uploader"
      : "Anonymous";
    const date = data.uploaded_at
      ? new Date(data.uploaded_at).toISOString().split("T")[0]
      : "";
    const category = data.category === 1 ? "Anime" : "All Categories";

    // Extract Poster / Cover
    let cover = "https://nekobt.to/cdn/pfp/null/64";
    if (data.screenshots && Array.isArray(data.screenshots) && data.screenshots.length > 0) {
      cover = data.screenshots[0];
    } else if (data.description) {
      const mdImg = data.description.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
      if (mdImg) {
        cover = mdImg[1];
      } else {
        const htmlImg = data.description.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
        if (htmlImg) {
          cover = htmlImg[1];
        }
      }
    }

    // Format Description
    const rawDesc = (data.description || "").replace(/<[^>]+>/g, " ").trim();
    const formattedDesc = [
      `Category: ${category}`,
      `File Size: ${fileSize || "N/A"} • Seeders: ${seeders} • Leechers: ${leechers} • Completed: ${completed}`,
      `Uploader: ${uploader}${date ? ` • Date: ${date}` : ""}`,
      rawDesc ? `\n---\n${rawDesc}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Extract Files
    const files = Array.isArray(data.files) ? data.files : [];
    const videoExts = [".mkv", ".mp4", ".avi", ".ts", ".m4v", ".webm"];
    const videoFiles = files.filter((f) => {
      const name = (f.name || f.path || "").toLowerCase();
      return videoExts.some((ext) => name.endsWith(ext));
    });
    const targetFiles = videoFiles.length > 0 ? videoFiles : files;

    // Filter out extra files
    const extrasKeywords = ["ncop", "nced", "op ", "ed ", "pv", "extra", "menu", "creditless"];
    const isExtra = (name) => {
      const lower = name.toLowerCase();
      return extrasKeywords.some((kw) => lower.includes(kw));
    };

    const mainEpisodes = targetFiles.filter((f) => !isExtra(f.name || f.path || ""));
    const extraEpisodes = targetFiles.filter((f) => isExtra(f.name || f.path || ""));
    const orderedFiles = [...mainEpisodes, ...extraEpisodes];

    const episodes = [];
    const basePath = `/torrents/${torrentId}`;

    if (orderedFiles.length > 1) {
      // Multi-file batch release
      for (let i = 0; i < orderedFiles.length; i++) {
        const f = orderedFiles[i];
        const name = f.name || f.path || `Episode ${i + 1}`;
        const sz = f.length ? this._formatBytes(f.length) : "";
        episodes.push({
          name: sz ? `${name} (${sz})` : name,
          url: `${basePath}#file-${i}`,
        });
      }
    } else if (orderedFiles.length === 1) {
      const f = orderedFiles[0];
      const name = f.name || f.path || title;
      const sz = f.length ? this._formatBytes(f.length) : fileSize;
      episodes.push({
        name: sz ? `${name} (${sz})` : name,
        url: basePath,
      });
    } else {
      episodes.push({
        name: fileSize ? `${title} (${fileSize})` : title,
        url: basePath,
      });
    }

    return {
      title,
      cover,
      desc: formattedDesc,
      episodes: [
        {
          title: orderedFiles.length > 1 ? "Batch Episodes / Files" : "Torrent Media",
          urls: episodes,
        },
      ],
    };
  }

  // 5. Watch Stream Extraction (Direct Magnet & Torrent Resolution)
  async watch(url) {
    const torrentId = this._extractTorrentId(url);
    if (!torrentId) {
      throw new Error(`Unable to extract torrent ID for playback from URL: ${url}`);
    }

    const base = (await this.getSetting("nekobt_url")) || "https://nekobt.to";
    const cleanBase = base.replace(/\/+$/, "");

    const res = await this.reqJson(`/api/v1/torrents/${torrentId}`);
    if (!res || !res.data) {
      throw new Error(`Failed to resolve torrent metainfo for stream: ${torrentId}`);
    }

    const data = res.data;
    const magnetUri = data.magnet || data.private_magnet || null;
    const torrentDownloadUrl = `${cleanBase}/api/v1/torrents/${torrentId}/download?ext=.torrent`;

    if (!magnetUri && !torrentDownloadUrl) {
      throw new Error(`Could not locate BitTorrent or Magnet links for ${url}`);
    }

    const sources = [];
    if (torrentDownloadUrl) {
      sources.push({
        name: "Direct .torrent Metainfo",
        url: torrentDownloadUrl,
        type: "torrent",
        quality: "Auto",
      });
    }
    if (magnetUri) {
      sources.push({
        name: "Magnet Swarm (P2P)",
        url: magnetUri,
        type: "torrent",
        quality: "Auto",
      });
    }

    const primaryUrl = torrentDownloadUrl || magnetUri;

    return {
      type: "torrent",
      url: primaryUrl,
      sources,
      headers: {
        Referer: `${cleanBase}/`,
      },
    };
  }

  // Helper: Extracts numeric torrent ID from given URL / Path
  _extractTorrentId(url) {
    if (!url) return null;
    const clean = url.split("#")[0];
    const match = clean.match(/(?:torrents\/|^)(\d+)/);
    if (match) return match[1];
    const digits = clean.replace(/\D/g, "");
    return digits.length > 0 ? digits : null;
  }

  // Helper: Formats search results array from API payload
  _parseResults(data) {
    if (!data || !data.results || !Array.isArray(data.results)) {
      return [];
    }

    let defaultCover = "https://nekobt.to/cdn/pfp/null/64";
    if (
      data.recommended_media &&
      data.recommended_media.anilist &&
      data.recommended_media.anilist.primary &&
      data.recommended_media.anilist.primary.cover_image
    ) {
      defaultCover = data.recommended_media.anilist.primary.cover_image;
    }

    return data.results.map((item) => {
      const id = item.id;
      const title = item.title || "NekoBT Release";
      const sizeStr = this._formatBytes(item.filesize);
      const seeders = item.seeders ?? 0;
      const leechers = item.leechers ?? 0;

      let cover = defaultCover;
      if (item.screenshots && Array.isArray(item.screenshots) && item.screenshots.length > 0) {
        cover = item.screenshots[0];
      }

      const updateInfo = [sizeStr, `S: ${seeders}`, `L: ${leechers}`]
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
