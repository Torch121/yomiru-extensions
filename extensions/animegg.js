// ==YomiruExtension==
// @name         AnimeGG
// @version      v0.1.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://www.animegg.org/images/anime.png
// @package      animegg.org
// @type         bangumi
// @webSite      https://www.animegg.org
// @description  Watch Anime Online with high-quality subbed and dubbed streaming from AnimeGG.
// ==/YomiruExtension==

export default class extends Extension {
  async req(url, options = {}) {
    const base = (await this.getSetting("animegg_url")) || "https://www.animegg.org";
    const fullUrl = url.startsWith("http") ? url : `${base}${url}`;
    return this.request(fullUrl, {
      ...options,
      headers: {
        "Miru-Url": base,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...(options.headers || {}),
      },
    });
  }

  async load() {
    await this.registerSetting({
      title: "AnimeGG URL",
      key: "animegg_url",
      type: "input",
      description: "Base mirror URL for AnimeGG",
      defaultValue: "https://www.animegg.org",
    });

    await this.registerSetting({
      title: "Preferred Audio",
      key: "preferred_audio",
      type: "radio",
      description: "Default audio preference for streaming (sub or dub)",
      defaultValue: "sub",
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
          "": "Default (Popular)",
          "hits": "Popularity",
          "createdAt": "Recently Added",
        },
      },
      status: {
        title: "Status",
        options: {
          "": "All",
          "true": "Ongoing",
          "false": "Completed",
        },
      },
      genre: {
        title: "Genre",
        options: {
          "": "All",
          "action": "Action",
          "adventure": "Adventure",
          "comedy": "Comedy",
          "drama": "Drama",
          "fantasy": "Fantasy",
          "horror": "Horror",
          "magic": "Magic",
          "mecha": "Mecha",
          "military": "Military",
          "music": "Music",
          "mystery": "Mystery",
          "romance": "Romance",
          "scifi": "Sci-Fi",
          "shounen": "Shounen",
          "slice": "Slice of Life",
          "sports": "Sports",
          "supernatural": "Supernatural",
          "demons": "Demons",
          "historical": "Historical",
          "kids": "Kids",
        },
      },
    };
  }

  // 1. Popular Anime Catalog
  async popular(page) {
    const p = Math.max(1, page || 1);
    const start = (p - 1) * 25;
    const res = await this.req(`/popular-series?sortBy=hits&sortDirection=DESC&limit=25&start=${start}`);
    const html = typeof res === "string" ? res : res.html || "";
    return this._parseSeriesList(html);
  }

  // 2. Latest Ongoing Anime Releases
  async latest(page) {
    const p = Math.max(1, page || 1);
    const start = (p - 1) * 10;
    const res = await this.req(`/releases?limit=10&start=${start}`);
    const html = typeof res === "string" ? res : res.html || "";
    const items = this._parseReleaseList(html);
    if (items.length > 0) return items;

    // Fallback to newly added series
    const fStart = (p - 1) * 25;
    const fRes = await this.req(`/popular-series?sortBy=createdAt&sortDirection=DESC&limit=25&start=${fStart}`);
    const fHtml = typeof fRes === "string" ? fRes : fRes.html || "";
    return this._parseSeriesList(fHtml);
  }

  // 3. Search Anime by Keyword & Advanced Filters
  async search(kw, page, filter) {
    const p = Math.max(1, page || 1);
    const start = (p - 1) * 25;

    // If a genre filter is selected, query the genre directory
    if (filter && filter.genre && filter.genre.trim() !== "") {
      const genre = encodeURIComponent(filter.genre.trim().toLowerCase());
      const res = await this.req(`/genre/${genre}?start=${start}`);
      const html = typeof res === "string" ? res : res.html || "";
      return this._parseSeriesList(html);
    }

    // If status or sort filters are selected, query popular-series with parameters
    if (filter && (filter.sortBy || filter.status)) {
      const params = ["limit=25", `start=${start}`];
      if (filter.sortBy && filter.sortBy !== "") {
        params.push(`sortBy=${encodeURIComponent(filter.sortBy)}`);
        params.push("sortDirection=DESC");
      }
      if (filter.status && filter.status !== "") {
        params.push(`ongoing=${encodeURIComponent(filter.status)}`);
      }
      const res = await this.req(`/popular-series?${params.join("&")}`);
      const html = typeof res === "string" ? res : res.html || "";
      return this._parseSeriesList(html);
    }

    // Standard keyword search
    if (kw && kw.trim() !== "") {
      const res = await this.req(`/search/?q=${encodeURIComponent(kw.trim())}`);
      const html = typeof res === "string" ? res : res.html || "";
      return this._parseSearchList(html);
    }

    // Default to popular catalog
    return this.popular(page);
  }

  // 4. Series Details & Episode List
  async detail(url) {
    const path = url.startsWith("http") ? url : url.startsWith("/series/") ? url : `/series/${url}`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : "";

    // Title
    let title = "";
    const titleMatch =
      html.match(/<div class="rightpop">[\s\S]*?<h1>([^<]+)<\/h1>/) ||
      html.match(/<div class="title">[\s\S]*?<h1>([^<]+)<\/h1>/) ||
      html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // Cover Image
    let cover = "";
    const coverMatch =
      html.match(/<div class="media-left"[\s\S]*?<img[^>]+src="([^"]+)"/) ||
      html.match(/<img[^>]+src="(https:\/\/vidcache[^"]+)"/);
    if (coverMatch) {
      cover = coverMatch[1].trim();
    }

    // Synopsis / Description
    let desc = "";
    const descMatch =
      html.match(/<p class="ptext">([\s\S]*?)<\/p>/) ||
      html.match(/<div class="infoami">([\s\S]*?)<\/div>/) ||
      html.match(/<meta name="description" content="([^"]+)"/);
    if (descMatch) {
      desc = descMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Extract Episodes list
    const subEpisodes = [];
    const dubEpisodes = [];
    const itemRegex = /<li[^>]*>[\s\S]*?<\/li>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
      const li = match[0];
      const linkMatch = li.match(
        /<a href="([^"]+)" class="anm_det_pop"><strong>([^<]+)<\/strong><\/a>(?:<i class="anititle">([^<]+)<\/i>)?/
      );
      if (!linkMatch) continue;

      const epUrl = linkMatch[1];
      const epNum = linkMatch[2].trim();
      const epName = (linkMatch[3] || "").trim();
      const fullLabel = epName ? `${epNum}: ${epName}` : epNum;

      const hasSub = li.includes("btn-subbed") || !li.includes("btn-dubbed");
      const hasDub = li.includes("btn-dubbed");

      if (hasSub) {
        subEpisodes.push({
          name: fullLabel,
          url: `${epUrl}#subbed`,
        });
      }
      if (hasDub) {
        dubEpisodes.push({
          name: fullLabel,
          url: `${epUrl}#dubbed`,
        });
      }
    }

    // Episodes are listed descending on the website, reverse so episode 1 is first
    subEpisodes.reverse();
    dubEpisodes.reverse();

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
      episodes: episodeGroups.length > 0 ? episodeGroups : [
        {
          title: "Episodes",
          urls: subEpisodes.length > 0 ? subEpisodes : dubEpisodes,
        },
      ],
    };
  }

  // 5. Watch Stream Extraction
  async watch(url) {
    const isDub = url.includes("#dubbed");
    const cleanPath = url.split("#")[0];
    const res = await this.req(cleanPath);
    const html = typeof res === "string" ? res : "";

    let embedId = null;

    if (isDub) {
      const dubMatch =
        html.match(/href=['"]#dubbed[^'"]*['"][^>]*data-id=['"](\d+)['"]/) ||
        html.match(/id=['"]dubbed[^'"]*['"][\s\S]*?iframe[^>]+src=['"]\/embed\/(\d+)['"]/);
      if (dubMatch) embedId = dubMatch[1];
    } else {
      const subMatch =
        html.match(/href=['"]#subbed[^'"]*['"][^>]*data-id=['"](\d+)['"]/) ||
        html.match(/id=['"]subbed[^'"]*['"][\s\S]*?iframe[^>]+src=['"]\/embed\/(\d+)['"]/);
      if (subMatch) embedId = subMatch[1];
    }

    if (!embedId) {
      const fallbackMatch = html.match(/iframe[^>]+src=['"]\/embed\/(\d+)['"]/);
      if (fallbackMatch) embedId = fallbackMatch[1];
    }

    if (!embedId) {
      throw new Error(`Could not find video player embed ID for ${cleanPath}`);
    }

    const embedUrl = `/embed/${embedId}`;
    const embedRes = await this.req(embedUrl, {
      headers: {
        Referer: `https://www.animegg.org${cleanPath}`,
      },
    });
    const embedHtml = typeof embedRes === "string" ? embedRes : "";

    const vsMatch = embedHtml.match(/var videoSources = (\[[\s\S]*?\]);/);
    if (!vsMatch) {
      throw new Error(`No video sources available for embed ID ${embedId}`);
    }

    // Parse video sources
    const rawSources = vsMatch[1];
    const sourceRegex = /file:\s*['"]([^'"]+)['"](?:,\s*label:\s*['"]([^'"]+)['"])?/g;
    const sources = [];
    let sMatch;
    while ((sMatch = sourceRegex.exec(rawSources)) !== null) {
      sources.push({
        file: sMatch[1],
        label: sMatch[2] || "Auto",
      });
    }

    if (sources.length === 0) {
      // Check backup bk encoded stream
      const bkMatch = rawSources.match(/bk:\s*['"]([A-Za-z0-9+/=]+)['"]/);
      if (bkMatch && bkMatch[1]) {
        try {
          const decodedBk = decodeURIComponent(atob(bkMatch[1]));
          return {
            type: "mp4",
            url: decodedBk,
            headers: {
              Referer: `https://www.animegg.org/embed/${embedId}`,
            },
          };
        } catch (_) {}
      }
      throw new Error(`Video file stream not found in player embed ${embedId}`);
    }

    // Prefer highest available resolution (1080p > 720p > 480p > 360p)
    const bestSource =
      sources.find((s) => s.label === "1080p") ||
      sources.find((s) => s.label === "720p") ||
      sources.find((s) => s.label === "480p") ||
      sources[0];

    const streamUrl = bestSource.file.startsWith("http")
      ? bestSource.file
      : `https://www.animegg.org${bestSource.file}`;

    return {
      type: "mp4",
      url: streamUrl,
      headers: {
        Referer: `https://www.animegg.org/embed/${embedId}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    };
  }

  // --- Internal Parsing Helpers ---
  _parseSeriesList(html) {
    const items = [];
    const cardRegex = /<li class="fea">([\s\S]*?)<\/li>/g;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
      const block = match[1];
      const linkMatch = block.match(/<div class="rightpop"><a href="([^"]+)">([^<]+)<\/a>/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);

      if (linkMatch) {
        items.push({
          url: linkMatch[1].trim(),
          title: linkMatch[2].trim(),
          cover: imgMatch ? imgMatch[1].trim() : "",
        });
      }
    }
    return items;
  }

  _parseReleaseList(html) {
    const items = [];
    const releaseRegex = /<li class="fea release">([\s\S]*?)<\/li>/g;
    let match;

    while ((match = releaseRegex.exec(html)) !== null) {
      const block = match[1];
      const linkMatch = block.match(/<a href="(\/series\/[^"]+)"[^>]*>([^<]+)<\/a>/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);

      if (linkMatch) {
        items.push({
          url: linkMatch[1].trim(),
          title: linkMatch[2].trim(),
          cover: imgMatch ? imgMatch[1].trim() : "",
        });
      }
    }
    return items;
  }

  _parseSearchList(html) {
    const items = [];
    const searchRegex = /<a href="(\/series\/[^"]+)" class="mse">([\s\S]*?)<\/a>/g;
    let match;

    while ((match = searchRegex.exec(html)) !== null) {
      const url = match[1].trim();
      const block = match[2];
      const titleMatch = block.match(/<h2>([^<]+)<\/h2>/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);

      if (titleMatch) {
        items.push({
          url,
          title: titleMatch[1].trim(),
          cover: imgMatch ? imgMatch[1].trim() : "",
        });
      }
    }
    return items;
  }
}
