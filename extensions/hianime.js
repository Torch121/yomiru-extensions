// ==YomiruExtension==
// @name         HiAnime
// @version      v0.2.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://hianime.at/theme/images/icons-192.png
// @package      hianime.at
// @type         bangumi
// @webSite      https://hianime.at
// ==/YomiruExtension==

export default class extends Extension {
  async req(url, options = {}) {
    const base = (await this.getSetting("hianime_url")) || "https://hianime.at";
    return this.request(url, {
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
      title: "HiAnime URL",
      key: "hianime_url",
      type: "input",
      description: "Base homepage URL for HiAnime mirror",
      defaultValue: "https://hianime.at",
    });

    await this.registerSetting({
      title: "Preferred Audio",
      key: "preferred_audio",
      type: "radio",
      description: "Default audio track preference (sub or dub)",
      defaultValue: "sub",
    });
  }

  _parseItems(html) {
    const items = [];
    const itemBlocks = html.split(/<div class="flw-item/);
    for (let i = 1; i < itemBlocks.length; i++) {
      const block = itemBlocks[i];
      const coverMatch = block.match(/<img[^>]*?(?:data-src|src)="([^"]+)"/);
      const titleMatch =
        block.match(/class="film-name"[\s\S]*?<a[^>]*?title="([^"]+)"/) ||
        block.match(/class="film-name"[\s\S]*?<a[^>]*?>([\s\S]*?)<\/a>/) ||
        block.match(/<a[^>]*?title="([^"]+)"/);
      const urlMatch =
        block.match(/class="film-name"[\s\S]*?<a[^>]*?href="([^"]+)"/) ||
        block.match(/<a[^>]*?href="([^"]+)"/);

      if (titleMatch && urlMatch) {
        items.push({
          title: titleMatch[1].replace(/<[^>]*>/g, "").trim(),
          url: urlMatch[1],
          cover: coverMatch ? coverMatch[1] : "",
        });
      }
    }
    return items;
  }

  // 1. Popular Anime Releases
  async popular(page) {
    const res = await this.req(`/most-popular?page=${page || 1}`);
    const html = typeof res === "string" ? res : res.html || "";
    const items = this._parseItems(html);
    return items.length > 0 ? items : this.latest(page);
  }

  // 2. Latest Anime Releases
  async latest(page) {
    const res = await this.req(`/recently-updated?page=${page || 1}`);
    const html = typeof res === "string" ? res : res.html || "";
    return this._parseItems(html);
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
          "r_17": "R",
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
          "updated_date": "Recently Updated",
          "added_date": "Recently Added",
          "release_date": "Released Date",
          "trending": "Trending",
          "title_az": "Name A-Z",
          "avg_score": "Score",
          "mal_score": "MAL Score",
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
          "award-winning": "Award Winning",
          "comedy": "Comedy",
          "demons": "Demons",
          "detective": "Detective",
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
          "parody": "Parody",
          "psychological": "Psychological",
          "romance": "Romance",
          "samurai": "Samurai",
          "school": "School",
          "sci-fi": "Sci-Fi",
          "seinen": "Seinen",
          "shoujo": "Shoujo",
          "shounen": "Shounen",
          "slice-of-life": "Slice of Life",
          "space": "Space",
          "sports": "Sports",
          "supernatural": "Supernatural",
          "super-power": "Super Power",
          "suspense": "Suspense",
          "thriller": "Thriller",
          "time-travel": "Time Travel",
          "vampire": "Vampire",
        },
      },
    };
  }

  // 3. Search Anime by Keyword & Advanced Filters
  async search(kw, page, filter) {
    let queryToSearch = "";
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      if (jp && jp.trim()) {
        const jpResults = await this._rawSearch(jp.trim(), page, filter);
        if (jpResults && jpResults.length > 0) {
          return jpResults;
        }
      }
      queryToSearch = en || jp || "";
    } else {
      queryToSearch = (kw || "").trim();
    }

    return this._rawSearch(queryToSearch, page, filter);
  }

  async _rawSearch(kw, page, filter) {
    let url;
    if (filter && Object.keys(filter).length > 0) {
      const params = [];
      if (kw && kw.trim()) {
        params.push(`keyword=${encodeURIComponent(kw.trim())}`);
      }
      params.push(`page=${page || 1}`);
      for (const [k, v] of Object.entries(filter)) {
        if (v === null || v === undefined || v === '') continue;
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item) params.push(`genre[]=${encodeURIComponent(item)}`);
          }
        } else if (k === 'genre' && typeof v === 'string') {
          if (v.includes(',')) {
            for (const item of v.split(',')) {
              if (item.trim()) params.push(`genre[]=${encodeURIComponent(item.trim())}`);
            }
          } else {
            params.push(`genre[]=${encodeURIComponent(v)}`);
          }
        } else {
          params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }
      }
      url = `/filter?${params.join('&')}`;
    } else {
      url = `/search?keyword=${encodeURIComponent(kw || '')}&page=${page || 1}`;
    }

    const res = await this.req(url);
    const html = typeof res === "string" ? res : res.html || "";
    return this._parseItems(html);
  }

  // 3. Anime Details & Episodes List
  async detail(url) {
    const res = await this.req(url);
    const html = typeof res === "string" ? res : "";

    // Title
    const titleMatch =
      html.match(/<h2 class="film-name[^"]*"[^>]*>([\s\S]*?)<\/h2>/) ||
      html.match(/class="breadcrumb-item dynamic-name active"[^>]*>([\s\S]*?)<\/li>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "Unknown";

    // Poster
    const coverMatch = html.match(/class="anisc-poster"[\s\S]*?<img[^>]*?(?:src|data-src)="([^"]+)"/);
    const cover = coverMatch ? coverMatch[1] : "";

    // Synopsis
    const descMatch = html.match(/class="film-description[^"]*"[\s\S]*?<div class="text">([\s\S]*?)<\/div>/);
    const desc = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";

    // Extract trailing anime ID from URL (e.g. /naruto-1335 -> 1335)
    const idMatch = url.match(/-(\d+)(?:\?|$)/);
    if (!idMatch) {
      return { title, cover, desc, episodes: [] };
    }
    const animeId = idMatch[1];

    // Fetch episode list via theme AJAX endpoint
    const epRes = await this.req(`/api/theme/episode/list/${animeId}`);
    const epHtml =
      typeof epRes === "object" && epRes.html
        ? epRes.html
        : typeof epRes === "string"
        ? epRes
        : "";

    const epRegex = /<a[^>]*?title="([^"]+)"[^>]*?class="[^"]*?ep-item[^"]*"[^>]*?data-id="(\d+)"/g;
    const episodesList = [];
    let epMatch;
    while ((epMatch = epRegex.exec(epHtml)) !== null) {
      episodesList.push({
        name: epMatch[1].trim(),
        url: epMatch[2],
      });
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "Default",
          urls: episodesList,
        },
      ],
    };
  }

  // 4. Video Stream & Subtitle Extraction
  async watch(episodeId) {
    const epId = episodeId.includes("ep=") ? episodeId.match(/ep=(\d+)/)[1] : episodeId;
    const prefAudio = (await this.getSetting("preferred_audio")) || "sub";

    // Fetch available servers for the episode
    const serverRes = await this.req(`/api/theme/episode/servers?episodeId=${epId}`);
    const html =
      typeof serverRes === "object" && serverRes.html
        ? serverRes.html
        : typeof serverRes === "string"
        ? serverRes
        : "";

    // Find server hash (preferring ZokoAnime on preferred audio track)
    let hash = null;
    const serverItems = html.match(/<div class="item server-item"[^>]*>/g) || [];
    for (const item of serverItems) {
      const typeMatch = item.match(/data-type="([^"]+)"/);
      const nameMatch = item.match(/data-server-name="([^"]+)"/);
      const hashMatch = item.match(/data-hash="([^"]+)"/);
      if (!hashMatch) continue;

      const type = typeMatch ? typeMatch[1] : "";
      const name = nameMatch ? nameMatch[1] : "";

      if (type === prefAudio && name.toLowerCase().includes("zoko")) {
        hash = hashMatch[1];
        break;
      }
    }

    // Fallback to any available server
    if (!hash) {
      for (const item of serverItems) {
        const hashMatch = item.match(/data-hash="([^"]+)"/);
        if (hashMatch) {
          hash = hashMatch[1];
          break;
        }
      }
    }

    if (!hash) {
      throw new Error(`No available video server found for episode ${epId}`);
    }

    // Decode embed URL from base64 hash
    const embedUrl = atob(hash);

    // Request embed player frame
    const playerHtml = await this.request(embedUrl, {
      headers: {
        Referer: "https://hianime.at/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const pMatch =
      typeof playerHtml === "string" ? playerHtml.match(/window\.__P="([^"]+)"/) : null;
    if (!pMatch) {
      throw new Error(`Could not extract video player payload from ${embedUrl}`);
    }

    // Deobfuscate otaku embed payload using XOR
    const OBF_KEY = "otaku-embed-v1";
    const binary = atob(pMatch[1]);
    let xor = "";
    for (let i = 0; i < binary.length; i++) {
      xor += String.fromCharCode(binary.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
    }
    const data = JSON.parse(decodeURIComponent(escape(xor)));

    return {
      type: "hls",
      url: data.src,
      headers: {
        Referer: embedUrl,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      subtitles: (data.subtitles || []).map((s) => ({
        title: s.label || s.lang || "Subtitles",
        url: s.src,
      })),
    };
  }
}
