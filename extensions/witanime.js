// ==YomiruExtension==
// @name         WitAnime
// @version      v1.0.3
// @author       Yomiru
// @lang         ar
// @license      MIT
// @icon         https://witanime.site/assets/images/favicon.ico
// @package      site.witanime
// @type         bangumi
// @webSite      https://witanime.site
// @nsfw         false
// @description  مشاهدة وتحميل أفضل مسلسلات وأفلام الأنمي المترجمة أون لاين بجودة عالية عبر WitAnime
// ==/YomiruExtension==

export default class extends Extension {
  get baseUrl() {
    return "https://witanime.site";
  }

  constructor() {
    super();
    this.titleToSlugCache = {};
    this.titleToTargetCache = {};
  }

  decodeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  toSlug(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  looksLikeMovie(title, candidateTitles, totalExpected) {
    if (totalExpected === 1) return true;
    const all = [title || ""]
      .concat(candidateTitles || [])
      .join(" ")
      .toLowerCase();
    return (
      all.indexOf("movie") !== -1 ||
      all.indexOf("film") !== -1 ||
      all.indexOf("gekijouban") !== -1 ||
      all.indexOf("فيلم") !== -1 ||
      all.indexOf("劇場版") !== -1
    );
  }

  generateSearchVariations(rawTitle) {
    if (!rawTitle) return [];
    const list = [];
    const add = (s) => {
      const trimmed = (s || "").trim();
      if (trimmed && list.indexOf(trimmed) === -1) {
        list.push(trimmed);
      }
    };

    add(rawTitle);

    // Strip "Movie", "The Movie", "Film", "Gekijouban", "劇場版", "فيلم"
    const stripped = rawTitle
      .replace(/\b(the\s+)?movie\b/gi, "")
      .replace(/\bfilm\b/gi, "")
      .replace(/\bgekijouban\b/gi, "")
      .replace(/فيلم/g, "")
      .replace(/劇場版/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped) add(stripped);

    // Subtitle split before : or -
    if (rawTitle.indexOf(":") !== -1) {
      const parts = rawTitle.split(":");
      add(parts[0]);
      if (parts.length > 1) add(parts.slice(1).join(" "));
    }
    if (rawTitle.indexOf(" - ") !== -1) {
      const parts2 = rawTitle.split(" - ");
      add(parts2[0]);
      if (parts2.length > 1) add(parts2.slice(1).join(" "));
    }

    return list;
  }

  async searchAnimeTarget(title, candidateTitles, isMovie, totalExpected) {
    const clean = (title || "").trim();
    const expectedMovie =
      isMovie || this.looksLikeMovie(clean, candidateTitles, totalExpected);
    const cacheKey = clean + "|isMovie:" + expectedMovie;
    if (this.titleToTargetCache && this.titleToTargetCache[cacheKey]) {
      return this.titleToTargetCache[cacheKey];
    }

    const titlesToTry = [];
    const candidates = [title].concat(candidateTitles || []);
    for (let i = 0; i < candidates.length; i++) {
      const variations = this.generateSearchVariations(candidates[i]);
      for (let j = 0; j < variations.length; j++) {
        const v = variations[j];
        if (titlesToTry.indexOf(v) === -1) titlesToTry.push(v);
      }
    }

    let bestOverallTarget = null;
    let highestOverallScore = -1;

    for (let qi = 0; qi < titlesToTry.length; qi++) {
      const query = titlesToTry[qi];
      try {
        const searchUrl =
          this.baseUrl + "/search?q=" + encodeURIComponent(query);
        const res = await this.request(searchUrl, {
          headers: { Referer: this.baseUrl + "/" },
        });
        const html =
          typeof res === "string"
            ? res
            : res && res.body
            ? res.body
            : JSON.stringify(res);
        if (!html) continue;

        const linkRegex =
          /<a[^>]+href=["'](?:https?:\/\/witanime\.site)?\/(anime|movie)\/([a-zA-Z0-9_-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        let queryBestTarget = null;
        let queryHighestScore = -1;
        const normalizedTarget = query.toLowerCase();

        while ((match = linkRegex.exec(html)) !== null) {
          const kind = match[1].toLowerCase();
          const slug = match[2];
          const inner = match[3] || "";
          const altMatch = inner.match(/alt=["']([^"']*)["']/i);
          const itemTitle = (altMatch && altMatch[1] ? altMatch[1] : slug).trim();
          const normalizedItemTitle = itemTitle.toLowerCase();
          const isResultMovie = kind === "movie" || inner.indexOf("فيلم") !== -1;

          let score = 0;

          // 1. Movie vs TV series scoring bonus / penalty
          if (expectedMovie) {
            if (isResultMovie) {
              score += 150;
            } else {
              score -= 80;
            }
          } else {
            if (!isResultMovie) {
              score += 50;
            } else {
              score -= 40;
            }
          }

          // 2. Title and slug comparison
          const cleanTitle = normalizedItemTitle.replace(/[^\w\s]/g, "").trim();
          const cleanQuery = normalizedTarget.replace(/[^\w\s]/g, "").trim();
          const querySlug = this.toSlug(normalizedTarget);

          if (cleanTitle === cleanQuery || slug === querySlug) {
            score += 100;
          } else if (
            cleanTitle.indexOf(cleanQuery) === 0 ||
            slug.indexOf(querySlug) === 0
          ) {
            score += 80;
          } else if (
            cleanTitle.indexOf(cleanQuery) !== -1 ||
            cleanQuery.indexOf(cleanTitle) !== -1
          ) {
            score += 60;
          } else if (
            slug.indexOf(querySlug) !== -1 ||
            querySlug.indexOf(slug) !== -1
          ) {
            score += 50;
          } else {
            // Word overlap
            const qWords = cleanQuery
              .split(/\s+/)
              .filter((w) => w.length > 2);
            const tWords = cleanTitle
              .split(/\s+/)
              .filter((w) => w.length > 2);
            let overlap = 0;
            for (let wi = 0; wi < qWords.length; wi++) {
              if (tWords.indexOf(qWords[wi]) !== -1) overlap++;
            }
            score += overlap * 20;
          }

          if (score > queryHighestScore) {
            queryHighestScore = score;
            queryBestTarget = {
              slug: slug,
              isMovie: isResultMovie,
              title: itemTitle,
              detailUrl: isResultMovie
                ? this.baseUrl + "/movie/" + slug
                : this.baseUrl + "/anime/" + slug,
              watchUrl: isResultMovie
                ? this.baseUrl + "/watch/movie/" + slug
                : this.baseUrl + "/watch/" + slug + "/1",
            };
          }
        }

        if (queryBestTarget && queryHighestScore > highestOverallScore) {
          highestOverallScore = queryHighestScore;
          bestOverallTarget = queryBestTarget;
          if (highestOverallScore >= 200) {
            break;
          }
        }
      } catch (err) {
        continue;
      }
    }

    if (bestOverallTarget) {
      this.titleToTargetCache[cacheKey] = bestOverallTarget;
      this.titleToSlugCache[clean] = bestOverallTarget.slug;
      return bestOverallTarget;
    }

    const fallbackSlug = this.toSlug(clean);
    const fallbackTarget = {
      slug: fallbackSlug,
      isMovie: expectedMovie,
      title: clean,
      detailUrl: expectedMovie
        ? this.baseUrl + "/movie/" + fallbackSlug
        : this.baseUrl + "/anime/" + fallbackSlug,
      watchUrl: expectedMovie
        ? this.baseUrl + "/watch/movie/" + fallbackSlug
        : this.baseUrl + "/watch/" + fallbackSlug + "/1",
    };
    this.titleToTargetCache[cacheKey] = fallbackTarget;
    this.titleToSlugCache[clean] = fallbackSlug;
    return fallbackTarget;
  }

  parseAnimeCards(html) {
    if (!html || typeof html !== "string") return [];
    const results = [];
    const seen = {};

    const cardRegex =
      /<a[^>]+href=["']((?:https?:\/\/witanime\.site)?\/(?:anime|movie)\/([a-zA-Z0-9_-]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
      const rawLink = match[1];
      const slug = match[2];
      const inner = match[3] || "";

      let link = rawLink;
      if (link.indexOf("http") !== 0) {
        link =
          this.baseUrl + (link.indexOf("/") === 0 ? "" : "/") + link;
      }

      if (
        seen[link] ||
        link.endsWith("/browse") ||
        link.endsWith("/movies") ||
        link.indexOf("/watch/") !== -1
      ) {
        continue;
      }
      seen[link] = true;

      const altMatch = inner.match(/alt=["']([^"']*)["']/i);
      const titleMatch = inner.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
      const srcMatch =
        inner.match(/src=["']([^"']+)["']/i) ||
        inner.match(/data-src=["']([^"']+)["']/i);

      let title = "";
      if (altMatch && altMatch[1]) {
        title = altMatch[1].trim();
      } else if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      } else {
        title = slug;
      }

      const cover = srcMatch ? srcMatch[1].trim() : "";

      if (title) {
        results.push({
          title: this.decodeHtml(title),
          url: link,
          cover: cover,
        });
      }
    }

    return results;
  }

  async popular(page) {
    return this.latest(page);
  }

  async latest(page) {
    const p = page || 1;
    const url =
      p > 1
        ? this.baseUrl + "/browse?page=" + p
        : this.baseUrl + "/browse";
    const res = await this.request(url, {
      headers: { Referer: this.baseUrl + "/" },
    });
    const html =
      typeof res === "string"
        ? res
        : res && res.body
        ? res.body
        : JSON.stringify(res);
    return this.parseAnimeCards(html);
  }

  async search(kw, page) {
    const p = page || 1;
    const url =
      this.baseUrl + "/search?q=" + encodeURIComponent(kw) + "&page=" + p;
    const res = await this.request(url, {
      headers: { Referer: this.baseUrl + "/" },
    });
    const html =
      typeof res === "string"
        ? res
        : res && res.body
        ? res.body
        : JSON.stringify(res);

    const cards = this.parseAnimeCards(html);
    if (cards.length > 0) {
      return cards;
    }

    // Fallback: Smart scoring target lookup across variations
    const target = await this.searchAnimeTarget(kw);
    if (target && target.slug) {
      return [
        {
          title: target.title || kw,
          url: target.detailUrl,
          cover: "",
        },
      ];
    }

    return [];
  }

  async detail(url) {
    let fullUrl = url;
    if (fullUrl.indexOf("http") !== 0) {
      if (fullUrl.indexOf("/anime/") === 0 || fullUrl.indexOf("/movie/") === 0) {
        fullUrl = this.baseUrl + fullUrl;
      } else {
        const cleanSlug = this.toSlug(fullUrl);
        const looksMovie = this.looksLikeMovie(fullUrl);
        fullUrl =
          this.baseUrl + (looksMovie ? "/movie/" : "/anime/") + cleanSlug;
      }
    }

    let isMovieEntry = fullUrl.indexOf("/movie/") !== -1;

    const res = await this.request(fullUrl, {
      headers: { Referer: this.baseUrl + "/" },
    });
    const html =
      typeof res === "string"
        ? res
        : res && res.body
        ? res.body
        : JSON.stringify(res);

    // Title
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch
      ? this.decodeHtml(titleMatch[1].replace(/<[^>]+>/g, "").trim())
      : "";

    // Cover
    const coverMatch =
      html.match(/<img[^>]*src=["'](https:\/\/images\.witanime\.site\/posters\/[^"']+)["']/i) ||
      html.match(/<img[^>]*src=["'](https:\/\/images\.witanime\.site\/banners\/[^"']+)["']/i) ||
      html.match(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["'][^"']*poster[^"']*["']/i) ||
      html.match(/<img[^>]*src=["']([^"']+)["']/i);
    const cover = coverMatch ? coverMatch[1] : "";

    // Description
    const descMatch =
      html.match(/<p[^>]*class=["'][^"']*leading-relaxed[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) ||
      html.match(/<p[^>]*class=["'][^"']*story[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const desc = descMatch
      ? this.decodeHtml(descMatch[1].replace(/<[^>]+>/g, "").trim())
      : "";

    // Check if page indicates it's a Movie
    if (!isMovieEntry) {
      isMovieEntry =
        this.looksLikeMovie(title) ||
        (html.indexOf("فيلم") !== -1 && html.indexOf("نوع الأنمي : فيلم") !== -1);
    }

    if (isMovieEntry) {
      const movieSlugMatch = fullUrl.match(/\/movie\/([a-zA-Z0-9_-]+)/);
      const slug = movieSlugMatch ? movieSlugMatch[1] : this.toSlug(title);
      let watchUrl = this.baseUrl + "/watch/movie/" + slug;

      const watchMatch = html.match(
        /href=["'](https?:\/\/witanime\.site\/watch\/movie\/[^"']+)["']/i
      );
      if (watchMatch && watchMatch[1]) {
        watchUrl = watchMatch[1];
      }

      return {
        title: title || "Movie",
        cover: cover,
        desc: desc,
        episodes: [
          {
            title: "فيلم كامل",
            urls: [
              {
                name: "Full Movie",
                url: watchUrl,
              },
            ],
          },
        ],
      };
    }

    // ── Standard TV Anime Series Episode Scraping ──
    const animeSlugMatch = fullUrl.match(/\/anime\/([a-zA-Z0-9_-]+)/);
    const slug = animeSlugMatch ? animeSlugMatch[1] : this.toSlug(title);

    const epNumbers = [];
    const epNumberSet = {};

    const epPattern = new RegExp(
      'href=["\'](?:https?:\\/\\/witanime\\.site)?\\/watch\\/' +
        slug +
        '\\/([0-9.]+)[^"\']*["\']',
      "gi"
    );
    let match;
    while ((match = epPattern.exec(html)) !== null) {
      const num = parseFloat(match[1]);
      if (!isNaN(num) && !epNumberSet[num]) {
        epNumberSet[num] = true;
        epNumbers.push(num);
      }
    }

    // General fallback regex if slug in URL differed slightly
    if (epNumbers.length === 0) {
      const generalEpPattern =
        /href=["'](?:https?:\/\/witanime\.site)?\/watch\/[a-zA-Z0-9_-]+\/([0-9.]+)[^"']*["']/gi;
      while ((match = generalEpPattern.exec(html)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num) && !epNumberSet[num]) {
          epNumberSet[num] = true;
          epNumbers.push(num);
        }
      }
    }

    const episodes = [];

    if (epNumbers.length > 0) {
      epNumbers.sort((a, b) => a - b);
      for (let i = 0; i < epNumbers.length; i++) {
        const epNum = epNumbers[i];
        const epStr = epNum % 1 === 0 ? epNum.toString() : epNum.toString();
        episodes.push({
          name: "Episode " + epStr,
          url: this.baseUrl + "/watch/" + slug + "/" + epStr,
        });
      }
    } else {
      // Fallback: 12 episodes if unreleased or client-rendered
      for (let i = 1; i <= 12; i++) {
        episodes.push({
          name: "Episode " + i,
          url: this.baseUrl + "/watch/" + slug + "/" + i,
        });
      }
    }

    return {
      title: title || "Anime",
      cover: cover,
      desc: desc,
      episodes: [
        {
          title: "الحلقات",
          urls: episodes,
        },
      ],
    };
  }

  unpack(script) {
    if (!script || typeof script !== "string") return "";
    const evalIdx = script.indexOf("eval(function(p,a,c,k,e,d)");
    if (evalIdx === -1) return script;
    let endIdx = script.indexOf("</script>", evalIdx);
    if (endIdx === -1) endIdx = script.length;
    let block = script.substring(evalIdx, endIdx).trim();
    if (block.indexOf("eval(") === 0) {
      block = block.slice(5);
      if (block.endsWith(";")) block = block.slice(0, -1);
      if (block.endsWith(")")) block = block.slice(0, -1);
    }
    try {
      return eval("(" + block + ")") || "";
    } catch (e) {
      try {
        const m = block.match(
          /return\s+p\s*\}\s*\(\s*([\s\S]*?)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\s\S]*?)\.split\(['"|]/
        );
        if (!m) return "";
        let p = eval(m[1]);
        const a = parseInt(m[2], 10);
        let c = parseInt(m[3], 10);
        const k = eval(m[4]).split("|");
        while (c--) {
          if (k[c]) {
            p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]);
          }
        }
        return p;
      } catch (err) {
        return "";
      }
    }
  }

  findDirectMediaUrls(text) {
    if (!text || typeof text !== "string") return [];
    const urls = [];
    const seen = {};

    const addUrl = (u) => {
      if (!u) return;
      let clean = u.replace(/\\\//g, "/").trim();
      if (clean.indexOf("//") === 0) clean = "https:" + clean;
      if (
        clean.indexOf("http") === 0 &&
        !seen[clean] &&
        clean.indexOf("/embed") === -1 &&
        !clean.endsWith(".html") &&
        !clean.endsWith(".htm") &&
        clean.indexOf("stream-gate") === -1
      ) {
        seen[clean] = true;
        urls.push(clean);
      }
    };

    const mediaMatches = text.match(
      /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>]*)?/gi
    );
    if (mediaMatches) {
      for (let i = 0; i < mediaMatches.length; i++) addUrl(mediaMatches[i]);
    }

    const keyMatches = text.match(
      /(?:file|src|source|url)\s*:\s*["'](https?:[^"']+)["']/gi
    );
    if (keyMatches) {
      for (let j = 0; j < keyMatches.length; j++) {
        const m = keyMatches[j].match(/["'](https?:[^"']+)["']/i);
        if (m && m[1]) {
          const u = m[1];
          if (
            u.indexOf(".m3u8") !== -1 ||
            u.indexOf(".mp4") !== -1 ||
            u.indexOf("/hls/") !== -1
          ) {
            addUrl(u);
          }
        }
      }
    }

    const tagMatches = text.match(
      /<(?:source|video)[^>]+src=["']([^"']+)["']/gi
    );
    if (tagMatches) {
      for (let k = 0; k < tagMatches.length; k++) {
        const tm = tagMatches[k].match(/src=["']([^"']+)["']/i);
        if (tm && tm[1]) addUrl(tm[1]);
      }
    }

    return urls;
  }

  async extractOkRu(embedUrl) {
    if (!embedUrl) return null;
    try {
      const res = await this.request(embedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          Referer: this.baseUrl,
        },
      });
      const html =
        typeof res === "string"
          ? res
          : res && res.body
          ? res.body
          : JSON.stringify(res);
      const optMatch = html.match(/data-options=["']([^"']+)["']/i);
      if (!optMatch) return null;
      const decodedJson = this.decodeHtml(optMatch[1]);
      const opts = JSON.parse(decodedJson);
      const meta =
        opts && opts.flashvars && opts.flashvars.metadata
          ? JSON.parse(opts.flashvars.metadata)
          : null;
      if (!meta) return null;

      if (meta.hlsMasterPlaylistUrl) {
        return {
          url: meta.hlsMasterPlaylistUrl,
          type: "hls",
          isDirectVideo: true,
          headers: {
            Referer: "https://ok.ru/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }

      if (Array.isArray(meta.videos) && meta.videos.length > 0) {
        const best = meta.videos[meta.videos.length - 1];
        return {
          url: best.url,
          type: "mp4",
          quality: best.name,
          isDirectVideo: true,
          headers: {
            Referer: "https://ok.ru/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async extractMp4Upload(embedUrl) {
    if (!embedUrl) return null;
    try {
      const res = await this.request(embedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          Referer: "https://www.mp4upload.com/",
        },
      });
      const html =
        typeof res === "string"
          ? res
          : res && res.body
          ? res.body
          : JSON.stringify(res);
      const unpacked = this.unpack(html);
      const searchIn = unpacked + " " + html;
      const srcMatch =
        searchIn.match(/player\.src\(["'](https?:[^"']+\.mp4[^"']*)["']\)/i) ||
        searchIn.match(/src:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        searchIn.match(/https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?/i);
      if (srcMatch) {
        const videoUrl = srcMatch[1] || srcMatch[0];
        if (
          videoUrl.indexOf("/embed") === -1 &&
          !videoUrl.endsWith(".html") &&
          !videoUrl.endsWith(".htm")
        ) {
          return {
            url: videoUrl,
            type: "mp4",
            isDirectVideo: true,
            headers: {
              Referer: "https://www.mp4upload.com/",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            },
          };
        }
      }
    } catch (e) {}
    return null;
  }

  async extractYourUpload(embedUrl) {
    if (!embedUrl) return null;
    try {
      const res = await this.request(embedUrl, {
        headers: {
          Referer: "https://www.yourupload.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      const html =
        typeof res === "string"
          ? res
          : res && res.body
          ? res.body
          : JSON.stringify(res);
      const unpacked = this.unpack(html);
      const direct = this.findDirectMediaUrls(unpacked + " " + html);
      if (direct.length > 0) {
        return {
          url: direct[0],
          type: "mp4",
          isDirectVideo: true,
          headers: {
            Referer: "https://www.yourupload.com/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async extractStreamWish(embedUrl) {
    if (!embedUrl) return null;
    try {
      const res = await this.request(embedUrl, {
        headers: {
          Referer: embedUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      const html =
        typeof res === "string"
          ? res
          : res && res.body
          ? res.body
          : JSON.stringify(res);
      const unpacked = this.unpack(html);
      const direct = this.findDirectMediaUrls(unpacked + " " + html);
      if (direct.length > 0) {
        const videoUrl = direct[0];
        return {
          url: videoUrl,
          type: videoUrl.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async extractFilemoon(embedUrl) {
    if (!embedUrl) return null;
    try {
      const res = await this.request(embedUrl, {
        headers: {
          Referer: embedUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      const html =
        typeof res === "string"
          ? res
          : res && res.body
          ? res.body
          : JSON.stringify(res);
      const unpacked = this.unpack(html);
      const direct = this.findDirectMediaUrls(unpacked + " " + html);
      if (direct.length > 0) {
        const videoUrl = direct[0];
        return {
          url: videoUrl,
          type: videoUrl.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async extractGoogleDrive(embedUrl) {
    if (!embedUrl) return null;
    try {
      const fileIdMatch =
        embedUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
        embedUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : null;
      if (!fileId) return null;

      const ucUrl =
        "https://drive.usercontent.google.com/download?id=" +
        fileId +
        "&export=download";
      const res = await this.request(ucUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      const html =
        typeof res === "string"
          ? res
          : res && res.body
          ? res.body
          : JSON.stringify(res);
      const formMatch = html.match(
        /<form[^>]+action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i
      );
      if (formMatch) {
        const action =
          formMatch[1] || "https://drive.usercontent.google.com/download";
        const formContent = formMatch[2] || "";
        const inputMatches = formContent.match(
          /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/gi
        );
        const params = [];
        if (inputMatches) {
          for (let i = 0; i < inputMatches.length; i++) {
            const im = inputMatches[i].match(
              /name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/i
            );
            if (im)
              params.push(
                encodeURIComponent(im[1]) + "=" + encodeURIComponent(im[2])
              );
          }
        }
        const videoUri =
          action + (action.indexOf("?") === -1 ? "?" : "&") + params.join("&");
        return {
          url: videoUri,
          type: "mp4",
          isDirectVideo: true,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }

      return {
        url: ucUrl,
        type: "mp4",
        isDirectVideo: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      };
    } catch (e) {}
    return null;
  }

  async extractYonaplay(embedUrl, defaultQuality) {
    if (!embedUrl) return [];
    const sources = [];
    try {
      const res = await this.request(embedUrl, {
        headers: {
          Referer: this.baseUrl + "/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      const html =
        typeof res === "string"
          ? res
          : res && res.body
          ? res.body
          : JSON.stringify(res);
      const unpacked = this.unpack(html);
      const combined = unpacked + " " + html;

      const direct = this.findDirectMediaUrls(combined);
      if (direct.length > 0) {
        const m3u8Url = direct[0];
        sources.push({
          url: m3u8Url,
          type: m3u8Url.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
          server:
            "WitAnime • YONAPLAY (" + (defaultQuality || "Auto") + " - Direct)",
          quality: defaultQuality || "Auto",
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        });
      }

      const iframeMatches = combined.match(/<iframe[^>]+src=["']([^"']+)["']/gi);
      if (iframeMatches) {
        for (let i = 0; i < iframeMatches.length; i++) {
          const srcMatch = iframeMatches[i].match(/src=["']([^"']+)["']/i);
          if (srcMatch && srcMatch[1]) {
            let subUrl = srcMatch[1];
            if (subUrl.indexOf("//") === 0) subUrl = "https:" + subUrl;
            const subSource = await this.resolveEmbedDirectStream(
              subUrl,
              embedUrl
            );
            if (subSource && subSource.url) {
              sources.push({
                url: subSource.url,
                type: subSource.type || "hls",
                server:
                  "WitAnime • YONAPLAY (" + (defaultQuality || "HD") + " - Direct)",
                quality: defaultQuality || "HD",
                isDirectVideo: true,
                headers: subSource.headers,
              });
            }
          }
        }
      }
    } catch (e) {}
    return sources;
  }

  async resolveEmbedDirectStream(streamUrl, referer, authHeaders) {
    if (!streamUrl) return null;
    const lower = streamUrl.toLowerCase();

    // Ignore known non-stream download sites
    if (
      lower.indexOf("mega.nz") !== -1 ||
      lower.indexOf("4shared.com") !== -1 ||
      lower.indexOf("uptobox.com") !== -1 ||
      lower.indexOf("mediafire.com") !== -1 ||
      lower.indexOf("1fichier.com") !== -1
    ) {
      return null;
    }

    // Direct video extensions
    if (
      lower.indexOf(".m3u8") !== -1 &&
      lower.indexOf(".html") === -1 &&
      lower.indexOf(".htm") === -1
    ) {
      return {
        url: streamUrl,
        type: "hls",
        isDirectVideo: true,
        headers: authHeaders || { Referer: referer || this.baseUrl + "/" },
      };
    }

    if (
      lower.indexOf(".mp4") !== -1 &&
      lower.indexOf(".html") === -1 &&
      lower.indexOf(".htm") === -1
    ) {
      return {
        url: streamUrl,
        type: "mp4",
        isDirectVideo: true,
        headers: authHeaders || { Referer: referer || this.baseUrl + "/" },
      };
    }

    if (lower.indexOf("ok.ru") !== -1 || lower.indexOf("odnoklassniki") !== -1) {
      return await this.extractOkRu(streamUrl);
    }
    if (lower.indexOf("mp4upload") !== -1) {
      return await this.extractMp4Upload(streamUrl);
    }
    if (lower.indexOf("yourupload") !== -1 || lower.indexOf("yupoo") !== -1) {
      return await this.extractYourUpload(streamUrl);
    }
    if (
      lower.indexOf("streamwish") !== -1 ||
      lower.indexOf("awish") !== -1 ||
      lower.indexOf("wishembed") !== -1
    ) {
      return await this.extractStreamWish(streamUrl);
    }
    if (lower.indexOf("filemoon") !== -1) {
      return await this.extractFilemoon(streamUrl);
    }
    if (
      lower.indexOf("drive.google.com") !== -1 ||
      lower.indexOf("docs.google.com") !== -1
    ) {
      return await this.extractGoogleDrive(streamUrl);
    }

    // Generic sniffer
    try {
      const res = await this.request(streamUrl, {
        headers: {
          Referer: referer || this.baseUrl + "/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      const html =
        typeof res === "string"
          ? res
          : res && res.body
          ? res.body
          : JSON.stringify(res);
      const unpacked = this.unpack(html);
      const direct = this.findDirectMediaUrls(unpacked + " " + html);
      if (direct.length > 0) {
        const videoUrl = direct[0];
        return {
          url: videoUrl,
          type: videoUrl.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
          isDirectVideo: true,
          headers: {
            Referer: streamUrl,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}

    return null;
  }

  async watch(url) {
    let watchUrl = url;
    if (watchUrl.indexOf("http") !== 0) {
      if (watchUrl.indexOf("/watch/") === 0) {
        watchUrl = this.baseUrl + watchUrl;
      } else {
        watchUrl = this.baseUrl + "/watch/" + watchUrl;
      }
    }

    const res = await this.request(watchUrl, {
      headers: {
        Referer: this.baseUrl + "/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      },
    });
    const html =
      typeof res === "string"
        ? res
        : res && res.body
        ? res.body
        : JSON.stringify(res);

    // 1. Extract CSRF token
    let csrfMatch = html.match(
      /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i
    );
    let csrfToken = csrfMatch ? csrfMatch[1] : "";

    if (!csrfToken) {
      try {
        const homeRes = await this.request(this.baseUrl, {
          headers: { Referer: this.baseUrl + "/" },
        });
        const homeHtml =
          typeof homeRes === "string"
            ? homeRes
            : homeRes && homeRes.body
            ? homeRes.body
            : JSON.stringify(homeRes);
        csrfMatch = homeHtml.match(
          /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i
        );
        csrfToken = csrfMatch ? csrfMatch[1] : "";
      } catch (err) {}
    }

    // 2. Extract sourcesUrl
    const sourcesUrlMatch = html.match(/sourcesUrl:\s*["']([^"']+)["']/i);
    const sourcesPath = sourcesUrlMatch
      ? sourcesUrlMatch[1].replace(/\\\//g, "/")
      : watchUrl.replace(/\/$/, "") + "/sources";
    const fullSourcesUrl =
      sourcesPath.indexOf("http") === 0
        ? sourcesPath
        : this.baseUrl +
          (sourcesPath.indexOf("/") === 0 ? "" : "/") +
          sourcesPath;

    let manifest = await this.request(fullSourcesUrl, {
      method: "POST",
      data: {},
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-TOKEN": csrfToken,
        Referer: watchUrl,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      },
    });

    if (typeof manifest === "string") {
      try {
        manifest = JSON.parse(manifest);
      } catch (e) {
        manifest = {};
      }
    }

    const sources = [];
    const seenStreamUrls = {};
    const players =
      manifest && typeof manifest === "object" && manifest.players
        ? manifest.players
        : {};

    const isPlayableServer = (label) => {
      const l = (label || "").toLowerCase();
      if (
        l.indexOf("mega") !== -1 ||
        l.indexOf("4shared") !== -1 ||
        l.indexOf("uptobox") !== -1 ||
        l.indexOf("mediafire") !== -1 ||
        l.indexOf("1fichier") !== -1 ||
        l.indexOf("turbobit") !== -1
      ) {
        return false;
      }
      return true;
    };

    // Priority rankings for streaming hosts
    const getServerPriority = (label) => {
      const l = (label || "").toLowerCase();
      if (l.indexOf("ok") !== -1) return 1;
      if (l.indexOf("mp4upload") !== -1) return 2;
      if (l.indexOf("yourupload") !== -1) return 3;
      if (l.indexOf("streamwish") !== -1) return 4;
      if (l.indexOf("filemoon") !== -1) return 5;
      if (l.indexOf("videa") !== -1) return 6;
      if (l.indexOf("yonaplay") !== -1) return 7;
      if (l.indexOf("hgcloud") !== -1 || l.indexOf("dhcplay") !== -1) return 8;
      if (l.indexOf("gdrive") !== -1 || l.indexOf("google") !== -1) return 9;
      return 10;
    };

    // Collect server candidates across all qualities
    const candidates = [];
    const qualities = Object.keys(players);
    if (qualities.length === 0) {
      qualities.push("FHD", "HD", "SD");
    }

    for (let qi = 0; qi < qualities.length; qi++) {
      const q = qualities[qi];
      const serverList = players[q] || [];
      if (!Array.isArray(serverList)) continue;

      for (let si = 0; si < serverList.length; si++) {
        const s = serverList[si];
        if (!s || !s.token) continue;
        const rawLabel = (s.label || "Server").toString().trim();
        if (!isPlayableServer(rawLabel)) continue;

        const pPriority = getServerPriority(rawLabel);
        const qWeight = q === "FHD" ? 0 : q === "HD" ? 20 : 40;

        candidates.push({
          quality: q,
          label: rawLabel,
          token: s.token,
          rank: pPriority + qWeight,
        });
      }
    }

    candidates.sort((a, b) => a.rank - b.rank);

    for (let ci = 0; ci < candidates.length; ci++) {
      const item = candidates[ci];
      try {
        const authHeaders = {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-TOKEN": csrfToken,
          Referer: watchUrl,
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        };

        // 1. Authorize token via POST /watch/stream-source/$token
        try {
          await this.request(
            this.baseUrl + "/watch/stream-source/" + item.token,
            {
              method: "POST",
              data: {},
              headers: authHeaders,
            }
          );
        } catch (_) {}

        // 2. Resolve 302 redirect location via GET /watch/stream-gate/$token
        const gateUrl = this.baseUrl + "/watch/stream-gate/" + item.token;
        let streamUrl = gateUrl;

        try {
          const gateRes = await this.request(gateUrl, {
            followRedirects: false,
            fullResponse: true,
            headers: {
              Referer: watchUrl,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            },
          });

          if (gateRes && typeof gateRes === "object") {
            const h = gateRes.headers || {};
            const loc =
              h.location ||
              h.Location ||
              gateRes.url ||
              "";
            if (loc) {
              streamUrl =
                loc.indexOf("http") === 0 ? loc : this.baseUrl + loc;
            } else if (gateRes.body && typeof gateRes.body === "string") {
              const m = gateRes.body.match(
                /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i
              );
              if (m) streamUrl = m[0];
            }
          }
        } catch (_) {
          // Fall back to gateUrl
        }

        const cleanLabel = item.label || "Server";
        const lowerLabel = cleanLabel.toLowerCase();

        // 3. Unpack Yonaplay multi-server container if present
        if (
          lowerLabel.indexOf("yonaplay") !== -1 ||
          streamUrl.indexOf("yonaplay") !== -1
        ) {
          const yonaSources = await this.extractYonaplay(
            streamUrl,
            item.quality
          );
          if (yonaSources.length > 0) {
            for (let yi = 0; yi < yonaSources.length; yi++) {
              const ys = yonaSources[yi];
              if (ys && ys.url && !seenStreamUrls[ys.url]) {
                seenStreamUrls[ys.url] = true;
                sources.push(ys);
              }
            }
            if (sources.length >= 6) break;
            continue;
          }
        }

        const streamHeaders = {
          Referer: watchUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        };

        // 4. Attempt direct video resolution for embeds
        const direct = await this.resolveEmbedDirectStream(
          streamUrl,
          watchUrl,
          streamHeaders
        );

        if (direct && direct.url && !seenStreamUrls[direct.url]) {
          seenStreamUrls[direct.url] = true;
          const isHls =
            direct.type === "hls" || direct.url.indexOf(".m3u8") !== -1;
          sources.push({
            server:
              "WitAnime • " +
              cleanLabel.toUpperCase() +
              " (" +
              item.quality +
              " - Direct)",
            quality: item.quality,
            url: direct.url,
            type: isHls ? "hls" : "mp4",
            headers: direct.headers || streamHeaders,
          });
        } else if (streamUrl && !seenStreamUrls[streamUrl]) {
          // Robust fallback: if embed cannot be directly unpacked to raw m3u8/mp4,
          // still provide the web embed player URL for Yomiru to play!
          seenStreamUrls[streamUrl] = true;
          sources.push({
            server:
              "WitAnime • " +
              cleanLabel.toUpperCase() +
              " (" +
              item.quality +
              ")",
            quality: item.quality,
            url: streamUrl,
            type: "hls",
            headers: streamHeaders,
          });
        }
      } catch (e) {
        continue;
      }

      if (sources.length >= 6) break;
    }

    // Always provide official web player as fallback at the end
    if (!seenStreamUrls[watchUrl]) {
      sources.push({
        server: "WitAnime Web",
        quality: "Web Player",
        url: watchUrl,
        type: "hls",
        headers: {
          Referer: this.baseUrl + "/",
        },
      });
    }

    return {
      sources: sources,
    };
  }
}
