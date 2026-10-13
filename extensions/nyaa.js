// ==YomiruExtension==
// @name         Nyaa
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://nyaa.si/static/favicon.png
// @package      si.nyaa
// @type         bangumi
// @webSite      https://nyaa.si
// @description  Anime torrent indexer providing high-speed BitTorrent and Magnet streams from Nyaa.si.
// ==/YomiruExtension==

export default class extends Extension {
  async req(url, options = {}) {
    const base = (await this.getSetting("nyaa_url")) || "https://nyaa.si";
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
        ...(options.headers || {}),
      },
    });
  }

  async load() {
    await this.registerSetting({
      title: "Nyaa Mirror URL",
      key: "nyaa_url",
      type: "input",
      description: "Base mirror URL for Nyaa (default: https://nyaa.si)",
      defaultValue: "https://nyaa.si",
    });

    await this.registerSetting({
      title: "Default Category",
      key: "default_category",
      type: "radio",
      description: "Default category for catalog browsing (e.g. Anime - English-translated)",
      defaultValue: "1_2",
    });

    await this.registerSetting({
      title: "Default Sort",
      key: "default_sort",
      type: "radio",
      description: "Default sorting mode (seeders for popularity or id for newest releases)",
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
          "1_2": "Anime - English-translated",
          "1_0": "Anime - All",
          "1_3": "Anime - Non-English-translated",
          "1_4": "Anime - Raw",
          "1_1": "Anime - Music Video",
          "0_0": "All Categories",
        },
      },
      filter: {
        title: "Filter",
        options: {
          "0": "No filter",
          "1": "No remakes",
          "2": "Trusted only",
        },
      },
      sortBy: {
        title: "Sort By",
        options: {
          "seeders": "Seeders (Popular)",
          "id": "Date Added (Latest)",
          "size": "File Size",
          "downloads": "Downloads",
          "comments": "Comments",
        },
      },
      sortOrder: {
        title: "Sort Order",
        options: {
          "desc": "Descending",
          "asc": "Ascending",
        },
      },
    };
  }

  // 1. Popular Releases (Sorted by seeders)
  async popular(page) {
    const p = Math.max(1, page || 1);
    const category = (await this.getSetting("default_category")) || "1_2";
    const res = await this.req(`/?f=0&c=${category}&s=seeders&o=desc&p=${p}`);
    const html = typeof res === "string" ? res : res.html || "";
    return this._parseTorrentTable(html);
  }

  // 2. Latest Releases (Sorted by date/id descending)
  async latest(page) {
    const p = Math.max(1, page || 1);
    const category = (await this.getSetting("default_category")) || "1_2";
    const res = await this.req(`/?f=0&c=${category}&s=id&o=desc&p=${p}`);
    const html = typeof res === "string" ? res : res.html || "";
    return this._parseTorrentTable(html);
  }

  // 3. Search Torrents by Keyword & Filters
  async search(kw, page, filter) {
    const p = Math.max(1, page || 1);
    const defaultCat = (await this.getSetting("default_category")) || "1_2";
    const defaultSort = (await this.getSetting("default_sort")) || "seeders";

    const category = filter && filter.category ? filter.category : defaultCat;
    const f = filter && filter.filter ? filter.filter : "0";
    const sortBy = filter && filter.sortBy ? filter.sortBy : defaultSort;
    const sortOrder = filter && filter.sortOrder ? filter.sortOrder : "desc";

    let queryToSearch = "";
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";

      // If Japanese title available, try searching with Japanese query first
      if (jp && jp.trim()) {
        const jpQuery = encodeURIComponent(jp.trim());
        const jpRes = await this.req(
          `/?f=${f}&c=${category}&q=${jpQuery}&s=${sortBy}&o=${sortOrder}&p=${p}`
        );
        const jpHtml = typeof jpRes === "string" ? jpRes : jpRes.html || "";
        const jpItems = this._parseTorrentTable(jpHtml);
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
      if (!hasSeasonOrFormat && p === 1) {
        // Target Season 1 batches specifically first (e.g. "jujutsu kaisen s1")
        const s1Query = encodeURIComponent(`${queryToSearch} s1`);
        const s1Res = await this.req(
          `/?f=${f}&c=${category}&q=${s1Query}&s=${sortBy}&o=${sortOrder}&p=${p}`
        );
        const s1Html = typeof s1Res === "string" ? s1Res : s1Res.html || "";
        const s1Items = this._parseTorrentTable(s1Html);
        if (s1Items && s1Items.length > 0) {
          const baseQ = encodeURIComponent(queryToSearch);
          const baseRes = await this.req(
            `/?f=${f}&c=${category}&q=${baseQ}&s=${sortBy}&o=${sortOrder}&p=${p}`
          );
          const baseHtml = typeof baseRes === "string" ? baseRes : baseRes.html || "";
          const baseItems = this._parseTorrentTable(baseHtml);
          const seen = new Set(s1Items.map((r) => r.url || r.title));
          const merged = [...s1Items];
          for (const item of (baseItems || [])) {
            const key = item.url || item.title;
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(item);
            }
          }
          return merged;
        }
      }

      const q = encodeURIComponent(queryToSearch);
      const res = await this.req(
        `/?f=${f}&c=${category}&q=${q}&s=${sortBy}&o=${sortOrder}&p=${p}`
      );
      const html = typeof res === "string" ? res : res.html || "";
      return this._parseTorrentTable(html);
    }

    return this.popular(page);
  }

  // 4. Torrent Details & Episode / File Breakdown
  async detail(url) {
    const cleanUrl = url.split("#")[0];
    const path = cleanUrl.startsWith("http")
      ? cleanUrl
      : cleanUrl.startsWith("/view/")
      ? cleanUrl
      : `/view/${cleanUrl}`;

    const res = await this.req(path);
    const html = typeof res === "string" ? res : "";

    // Extract Title
    let title = "";
    const titleMatch =
      html.match(/<h3 class="panel-title">([\s\S]*?)<\/h3>/) ||
      html.match(/<div class="panel-heading">[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    // Extract Metadata from rows
    let category = "Anime";
    let date = "";
    let submitter = "";
    let seeders = "0";
    let leechers = "0";
    let fileSize = "";
    let completed = "0";

    const rowRegex = /<div class="row">([\s\S]*?)<\/div>/g;
    let rMatch;
    while ((rMatch = rowRegex.exec(html)) !== null) {
      const rowContent = rMatch[1];
      if (rowContent.includes("Category:")) {
        const m = rowContent.match(/<div class="col-md-5">([\s\S]*?)<\/div>/);
        if (m) category = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (rowContent.includes("Date:")) {
        const m = rowContent.match(/<div class="col-md-5"[^>]*>([\s\S]*?)<\/div>/);
        if (m) date = m[1].replace(/<[^>]+>/g, "").trim();
      }
      if (rowContent.includes("Submitter:")) {
        const m = rowContent.match(/<a[^>]+href="\/user\/[^"]*"[^>]*>([^<]+)<\/a>/);
        if (m) submitter = m[1].trim();
      }
      if (rowContent.includes("Seeders:")) {
        const m = rowContent.match(/<span style="color:\s*green;">(\d+)<\/span>/);
        if (m) seeders = m[1].trim();
      }
      if (rowContent.includes("Leechers:")) {
        const m = rowContent.match(/<span style="color:\s*red;">(\d+)<\/span>/);
        if (m) leechers = m[1].trim();
      }
      if (rowContent.includes("File size:")) {
        const m = rowContent.match(/<div class="col-md-5">([^<]+)<\/div>/);
        if (m) fileSize = m[1].trim();
      }
      if (rowContent.includes("Completed:")) {
        const m = rowContent.match(/<div class="col-md-5">(\d+)<\/div>/);
        if (m) completed = m[1].trim();
      }
    }

    // Extract Poster / Cover from Description
    let cover = "https://nyaa.si/static/favicon.png";
    const descMatch = html.match(/id="torrent-description"[\s\S]*?>([\s\S]*?)<\/div>/);
    let descBody = "";
    if (descMatch) {
      descBody = descMatch[1].trim();
      // Look for first markdown image ![alt](url)
      const mdImg = descBody.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
      if (mdImg) {
        cover = mdImg[1];
      } else {
        // Look for HTML img tag
        const htmlImg = descBody.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
        if (htmlImg) {
          cover = htmlImg[1];
        }
      }
    }

    // Format Full Description with Telemetry & Technical Specs
    const cleanDescText = descBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const formattedDesc = [
      `Category: ${category}`,
      `File Size: ${fileSize || "N/A"} • Seeders: ${seeders} • Leechers: ${leechers} • Completed: ${completed}`,
      `Uploader: ${submitter || "Anonymous"} • Date: ${date}`,
      cleanDescText ? `\n---\n${cleanDescText}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Extract File List from .torrent-file-list (leaf files only, ignoring folder li tags)
    const files = [];
    const fileListMatch = html.match(/class="torrent-file-list[^"]*"[\s\S]*?<\/div>/);
    if (fileListMatch) {
      const fileLiRegex = /<li[^>]*>(?:(?!<ul[\s>])[\s\S])*?<i class="fa fa-file"><\/i>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = fileLiRegex.exec(fileListMatch[0])) !== null) {
        const inner = liMatch[1];
        const sMatch = inner.match(/<span class="file-size">\(([^)]+)\)<\/span>/);
        const fSize = sMatch ? sMatch[1] : "";
        const nameClean = inner
          .replace(/<span class="file-size">[\s\S]*?<\/span>/, "")
          .replace(/<[^>]+>/g, "")
          .trim();

        if (nameClean) {
          files.push({
            name: nameClean,
            size: fSize,
          });
        }
      }
    }

    // Filter video files
    const videoExts = [".mkv", ".mp4", ".avi", ".ts", ".m4v", ".webm"];
    const videoFiles = files.filter((f) =>
      videoExts.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    const targetFiles = videoFiles.length > 0 ? videoFiles : files;

    // Ensure main episodes are sorted before extras/specials so Episode 1 is S01E01
    const extrasKeywords = ["ncop", "nced", "op ", "ed ", "pv", "extra", "menu", "creditless"];
    const isExtra = (name) => {
      const lower = name.toLowerCase();
      return extrasKeywords.some((kw) => lower.includes(kw));
    };

    const mainEpisodes = targetFiles.filter((f) => !isExtra(f.name));
    const extraEpisodes = targetFiles.filter((f) => isExtra(f.name));
    const orderedFiles = [...mainEpisodes, ...extraEpisodes];

    const episodes = [];
    if (orderedFiles.length > 1) {
      // Multi-file batch release
      for (let i = 0; i < orderedFiles.length; i++) {
        const f = orderedFiles[i];
        episodes.push({
          name: f.size ? `${f.name} (${f.size})` : f.name,
          url: `${path}#file-${i}`,
        });
      }
    } else if (orderedFiles.length === 1) {
      const f = orderedFiles[0];
      episodes.push({
        name: f.size ? `${f.name} (${f.size})` : f.name,
        url: path,
      });
    } else {
      episodes.push({
        name: title || "Torrent Stream",
        url: path,
      });
    }

    return {
      title: title || "Nyaa Release",
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
    const cleanUrl = url.split("#")[0];
    const path = cleanUrl.startsWith("http")
      ? cleanUrl
      : cleanUrl.startsWith("/view/")
      ? cleanUrl
      : `/view/${cleanUrl}`;

    const res = await this.req(path);
    const html = typeof res === "string" ? res : "";

    // 1. Extract Magnet Link
    let magnetUri = null;
    const magnetMatch =
      html.match(/href="(magnet:\?[^"]+)"/) ||
      html.match(/href='(magnet:\?[^']+)'/);
    if (magnetMatch) {
      magnetUri = magnetMatch[1].replace(/&amp;/g, "&");
    }

    const base = (await this.getSetting("nyaa_url")) || "https://nyaa.si";
    const cleanBase = base.replace(/\/+$/, "");

    // 2. Extract .torrent download URL (/download/)
    let torrentDownloadUrl = null;
    const torrentMatch =
      html.match(/href="(\/download\/\d+\.torrent)"/) ||
      html.match(/href='(\/download\/\d+\.torrent)'/);
    if (torrentMatch) {
      const tPath = torrentMatch[1];
      torrentDownloadUrl = tPath.startsWith("http")
        ? tPath
        : `${cleanBase}${tPath.startsWith("/") ? "" : "/"}${tPath}`;
    }

    if (!magnetUri && !torrentDownloadUrl) {
      throw new Error(`Could not locate BitTorrent or Magnet links for ${path}`);
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

  // Helper: Parses table rows from Nyaa search & catalog listings
  _parseTorrentTable(html) {
    if (!html) return [];
    const items = [];
    const rowRegex = /<tr class="([^"]*)">([\s\S]*?)<\/tr>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
      const rowContent = match[2];
      if (rowContent.includes("<th")) continue; // Skip table header

      // Extract View Link & Title
      const viewLinkMatch =
        rowContent.match(/<a href="(\/view\/\d+)" title="([^"]+)">/) ||
        rowContent.match(/<a href="(\/view\/\d+)"[^>]*>([^<]+)<\/a>/);
      if (!viewLinkMatch) continue;

      const viewPath = viewLinkMatch[1];
      const title = viewLinkMatch[2]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();

      // Extract Size
      let size = "";
      const sizeMatch = rowContent.match(/<td class="text-center">([0-9.]+\s*(?:GiB|MiB|KiB|TiB|B))<\/td>/);
      if (sizeMatch) {
        size = sizeMatch[1];
      }

      // Extract Seeders
      let seeders = "0";
      const seedersMatch = rowContent.match(
        /<td class="text-center"[^>]*>(\d+)<\/td>\s*<td class="text-center"[^>]*>(\d+)<\/td>\s*<td class="text-center"[^>]*>(\d+)<\/td>\s*<\/tr>/
      );
      if (seedersMatch) {
        seeders = seedersMatch[1];
      } else {
        const allTdMatches = [...rowContent.matchAll(/<td class="text-center">(\d+)<\/td>/g)];
        if (allTdMatches.length >= 3) {
          seeders = allTdMatches[0][1];
        }
      }

      // Extract category icon
      let catIcon = "https://nyaa.si/static/favicon.png";
      const catMatch = rowContent.match(/<img src="([^"]+)" alt="([^"]+)" class="category-icon">/);
      if (catMatch) {
        const iconPath = catMatch[1];
        catIcon = iconPath.startsWith("http") ? iconPath : `https://nyaa.si${iconPath}`;
      }

      items.push({
        title,
        url: viewPath,
        cover: catIcon,
        update: `${seeders} seeds • ${size || "P2P"}`,
      });
    }

    return items;
  }
}
