// ==YomiruExtension==
// @name         WitAnime
// @version      v1.0.6
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

  async extractSoraplay(embedUrl) {
    if (!embedUrl) return null;
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
      const searchIn = unpacked + " " + html;

      // Check for JWPlayer/Video setup object with direct sources
      const setupMatch = searchIn.match(/setup\s*=\s*({[\s\S]*?});/);
      if (setupMatch && setupMatch[1]) {
        const fileMatches = [
          ...setupMatch[1].matchAll(/["']file["']\s*:\s*["']([^"']+)["']/g),
        ];
        if (fileMatches.length > 0) {
          const u = fileMatches[0][1].replace(/\\\//g, "/");
          return {
            url: u,
            type: u.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
            isDirectVideo: true,
            headers: {
              Referer: embedUrl,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            },
          };
        }
      }

      const direct = this.findDirectMediaUrls(searchIn);
      if (direct.length > 0) {
        const u = direct[0];
        return {
          url: u,
          type: u.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
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

  async extractHgcloud(embedUrl) {
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
        const u = direct[0];
        return {
          url: u,
          type: u.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
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
      let meta =
        opts && opts.flashvars && opts.flashvars.metadata
          ? opts.flashvars.metadata
          : null;
      if (typeof meta === "string") {
        try {
          meta = JSON.parse(meta);
        } catch (e) {}
      }
      if (!meta) return null;

      const hlsUrl = meta.hlsManifestUrl || meta.hlsMasterPlaylistUrl;
      if (hlsUrl) {
        return {
          url: hlsUrl,
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

  async extractMailRu(embedUrl) {
    if (!embedUrl) return null;
    try {
      let metaUrl = "";
      const idMatch = embedUrl.match(/(?:embed\/|\/meta\/)([0-9]+)/);
      if (idMatch && idMatch[1]) {
        metaUrl = "https://my.mail.ru/+/video/meta/" + idMatch[1];
      } else {
        const html = await this.request(embedUrl, {
          headers: {
            Referer: this.baseUrl + "/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        });
        const mMatch = html.match(/["']metadataUrl["']\s*:\s*["']([^"']+)["']/i);
        if (mMatch && mMatch[1]) {
          metaUrl = mMatch[1].indexOf("http") === 0 ? mMatch[1] : "https:" + mMatch[1];
        }
      }
      if (!metaUrl) return null;

      const res = await this.request(metaUrl, {
        headers: {
          Referer: embedUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      let meta = typeof res === "string" ? JSON.parse(res) : res;
      if (meta && meta.videos && Array.isArray(meta.videos) && meta.videos.length > 0) {
        const vid = meta.videos[0];
        let u = vid.url || "";
        if (u.indexOf("//") === 0) u = "https:" + u;
        return {
          url: u,
          type: "mp4",
          quality: (vid.key || "FHD").toUpperCase(),
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (_) {}
    return null;
  }

  async extractDotplay(embedUrl) {
    if (!embedUrl) return null;
    try {
      const dotCodeMatch = embedUrl.match(/embed\/([a-zA-Z0-9]+)/);
      if (!dotCodeMatch || !dotCodeMatch[1]) return null;
      const dotCode = dotCodeMatch[1];
      const dotRes = await this.request(
        "https://dotplay.net/api.php?code=" + dotCode,
        {
          headers: {
            Accept: "application/json",
            Referer: embedUrl,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        }
      );
      let dotData = typeof dotRes === "string" ? JSON.parse(dotRes) : dotRes;
      if (dotData && dotData.success && dotData.video_url) {
        let videoUrl = "";
        try {
          const decoded = atob(dotData.video_url);
          videoUrl = decoded.split("|")[0];
        } catch (_) {}
        if (videoUrl && videoUrl.indexOf("http") === 0) {
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
      }
    } catch (_) {}
    return null;
  }

  async extractMp4Upload(rawUrl) {
    if (!rawUrl) return null;
    try {
      let embedUrl = rawUrl;
      const idMatch = rawUrl.match(/mp4upload\.com\/(?:embed-)?([a-zA-Z0-9_-]+)(?:\.html)?/i);
      if (idMatch && idMatch[1]) {
        embedUrl = "https://www.mp4upload.com/embed-" + idMatch[1] + ".html";
      }

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
        searchIn.match(/player\.src\(\s*(?:\{\s*src\s*:\s*)?["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        searchIn.match(/src:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        searchIn.match(/https?:\/\/[a-zA-Z0-9_.:-]+\.mp4upload\.com:[0-9]+\/d\/[^\s"'<>]+\/video\.mp4/i) ||
        searchIn.match(/https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/i);
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
      const searchIn = unpacked + " " + html;

      const ogMatch =
        searchIn.match(/property=["']og:video["']\s+content=["'](https?:[^"']+)["']/i) ||
        searchIn.match(/content=["'](https?:[^"']+)["']\s+property=["']og:video["']/i);
      if (ogMatch && ogMatch[1] && ogMatch[1].indexOf(".mp4") !== -1) {
        return {
          url: ogMatch[1],
          type: "mp4",
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
          },
        };
      }

      const direct = this.findDirectMediaUrls(searchIn);
      if (direct.length > 0) {
        return {
          url: direct[0],
          type: "mp4",
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
        if (params.length > 0) {
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
      }

      const confirmMatch =
        html.match(/[?&]confirm=([a-zA-Z0-9_-]+)/) ||
        html.match(/name=["']confirm["'][^>]+value=["']([^"']+)["']/i);
      const uuidMatch =
        html.match(/[?&]uuid=([a-zA-Z0-9_-]+)/) ||
        html.match(/name=["']uuid["'][^>]+value=["']([^"']+)["']/i);
      if (confirmMatch && confirmMatch[1]) {
        let directUrl =
          "https://drive.usercontent.google.com/download?id=" +
          fileId +
          "&export=download&confirm=" +
          confirmMatch[1];
        if (uuidMatch && uuidMatch[1]) {
          directUrl += "&uuid=" + uuidMatch[1];
        }
        return {
          url: directUrl,
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
    console.log("[Yonaplay] Starting Yonaplay extractor for: " + embedUrl);
    const sources = [];
    try {
      const baseMatch = embedUrl.match(/^(https?:\/\/[^\/]+)/);
      const base = baseMatch ? baseMatch[1] : "https://mid.yonaplay.net";

      // 0. Visit embed page first to establish PHP session & get session cookies
      console.log("[Yonaplay] Step 0: Visiting embed page to establish cookies...");
      await this.request(embedUrl, {
        headers: {
          Referer: this.baseUrl + "/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });

      // 1. Init session
      console.log("[Yonaplay] Step 1: Requesting session initialization from " + base + "/api/init-session.php");
      const initRes = await this.request(base + "/api/init-session.php", {
        method: "POST",
        data: {},
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
          Referer: embedUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      let init = null;
      try {
        init = typeof initRes === "string" ? JSON.parse(initRes) : initRes;
      } catch (err) {
        console.warn("[Yonaplay] Failed to parse init-session response: " + err);
        return [];
      }
      if (!init || !init.success || !init.c || !init.k) {
        console.warn("[Yonaplay] init-session returned unsuccessful: " + JSON.stringify(init));
        return [];
      }

      const code = init.c;
      const pageKey = init.k;
      console.log("[Yonaplay] Session initialized successfully. Code: " + code);

      // 2. Fetch sources list
      console.log("[Yonaplay] Step 2: Requesting server list from " + base + "/api/sources.php");
      const sourcesRes = await this.request(base + "/api/sources.php", {
        method: "POST",
        data: { code: code },
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
          Referer: embedUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      });
      let sData = null;
      try {
        sData = typeof sourcesRes === "string" ? JSON.parse(sourcesRes) : sourcesRes;
      } catch (err) {
        console.warn("[Yonaplay] Failed to parse sources.php response: " + err);
        return [];
      }
      if (!sData || !sData.success || !sData.qualities) {
        console.warn("[Yonaplay] sources.php returned unsuccessful: " + JSON.stringify(sData));
        return [];
      }

      const cryptoObj =
        typeof CryptoJS !== "undefined"
          ? CryptoJS
          : typeof globalThis !== "undefined" && globalThis.CryptoJS
          ? globalThis.CryptoJS
          : typeof window !== "undefined" && window.CryptoJS
          ? window.CryptoJS
          : null;

      if (!cryptoObj) {
        console.error("[Yonaplay] CryptoJS is unavailable in global scope! Cannot decrypt streams.");
        return [];
      }

      const decryptAES = (b64Data, keyStr) => {
        try {
          const keyWords = cryptoObj.SHA256(cryptoObj.enc.Utf8.parse(keyStr));
          const raw = cryptoObj.enc.Base64.parse(b64Data);
          const j1Words = cryptoObj.lib.WordArray.create(raw.words.slice(0, 3).concat([2]), 16);
          const ctWords = cryptoObj.lib.WordArray.create(raw.words.slice(7), raw.sigBytes - 28);
          const dec = cryptoObj.AES.encrypt(ctWords, keyWords, {
            iv: j1Words,
            mode: cryptoObj.mode.CTR,
            padding: cryptoObj.pad.NoPadding,
          });
          return dec.ciphertext.toString(cryptoObj.enc.Utf8);
        } catch (e) {
          console.warn("[Yonaplay] AES decryption error: " + e);
          return "";
        }
      };

      const qKeys = ["fhd", "hd", "sd"];
      for (let qi = 0; qi < qKeys.length; qi++) {
        const qKey = qKeys[qi];
        const qGroup = sData.qualities[qKey];
        if (!qGroup || !Array.isArray(qGroup.servers) || qGroup.servers.length === 0) continue;

        console.log("[Yonaplay] Evaluating " + qGroup.servers.length + " server(s) for quality " + qKey.toUpperCase());

        for (let si = 0; si < qGroup.servers.length; si++) {
          const srv = qGroup.servers[si];
          if (!srv || !srv.token) continue;

          try {
            console.log("[Yonaplay] Requesting token decryption for server: " + (srv.name || "SERVER") + " (" + qKey.toUpperCase() + ")");
            const apiRes = await this.request(base + "/api/api.php", {
              method: "POST",
              data: { code: code, token: srv.token, key: pageKey },
              headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                Accept: "application/json",
                Referer: embedUrl,
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
              },
            });
            let apiData = null;
            try {
              apiData = typeof apiRes === "string" ? JSON.parse(apiRes) : apiRes;
            } catch (err) {
              continue;
            }
            if (!apiData || !apiData.success || !apiData.d) continue;

            const decryptedUrl = decryptAES(apiData.d, pageKey);
            if (!decryptedUrl || decryptedUrl.indexOf("http") !== 0) continue;

            console.log("[Yonaplay] Decrypted URL: " + decryptedUrl);

            if (decryptedUrl.indexOf("dotplay.net") !== -1) {
              const dotDirect = await this.extractDotplay(decryptedUrl);
              if (dotDirect && dotDirect.url) {
                console.log("[Yonaplay] Successfully extracted Dotplay direct stream: " + dotDirect.url);
                sources.push({
                  server:
                    "WitAnime • " +
                    (srv.name || "DOTPLAY").toUpperCase() +
                    " (" +
                    qKey.toUpperCase() +
                    ")",
                  quality: qKey.toUpperCase(),
                  url: dotDirect.url,
                  type: dotDirect.type || "mp4",
                  isDirectVideo: true,
                  headers: dotDirect.headers || {
                    Referer: decryptedUrl,
                    "User-Agent":
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                  },
                });
                if (sources.length >= 2) break;
              }
            } else {
              const subSource = await this.resolveEmbedDirectStream(
                decryptedUrl,
                embedUrl
              );
              if (subSource && subSource.url) {
                console.log("[Yonaplay] Successfully extracted direct stream from decrypted embed: " + subSource.url);
                sources.push({
                  server:
                    "WitAnime • " +
                    (srv.name || "YONAPLAY").toUpperCase() +
                    " (" +
                    (subSource.quality || qKey.toUpperCase()) +
                    ")",
                  quality: subSource.quality || qKey.toUpperCase(),
                  url: subSource.url,
                  type: subSource.type || "mp4",
                  isDirectVideo: true,
                  headers: subSource.headers || {
                    Referer: decryptedUrl,
                    "User-Agent":
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                  },
                });
                if (sources.length >= 2) break;
              }
            }
          } catch (e) {
            console.warn("[Yonaplay] Error processing server " + srv.name + ": " + e);
          }
        }
        if (sources.length >= 2) break;
      }
    } catch (e) {
      console.error("[Yonaplay] Extractor exception: " + e);
    }
    console.log("[Yonaplay] Extractor finished. Found " + sources.length + " source(s).");
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
      lower.indexOf("1fichier.com") !== -1 ||
      lower.indexOf("videa.hu") !== -1 ||
      lower.indexOf("workupload.com") !== -1 ||
      lower.indexOf("gofile.io") !== -1
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

    if (lower.indexOf("soraplay") !== -1) {
      return await this.extractSoraplay(streamUrl);
    }
    if (
      lower.indexOf("drive.google.com") !== -1 ||
      lower.indexOf("docs.google.com") !== -1
    ) {
      return await this.extractGoogleDrive(streamUrl);
    }
    if (lower.indexOf("mp4upload") !== -1) {
      return await this.extractMp4Upload(streamUrl);
    }
    if (lower.indexOf("ok.ru") !== -1 || lower.indexOf("odnoklassniki") !== -1) {
      return await this.extractOkRu(streamUrl);
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
    if (lower.indexOf("hgcloud") !== -1) {
      return await this.extractHgcloud(streamUrl);
    }
    if (
      lower.indexOf("mail.ru") !== -1 ||
      lower.indexOf("video.mail") !== -1
    ) {
      return await this.extractMailRu(streamUrl);
    }
    if (lower.indexOf("dotplay.net") !== -1) {
      return await this.extractDotplay(streamUrl);
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

    console.log("[WitAnime] Starting watch for episode URL: " + watchUrl);

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

    if (html && (html.indexOf("429") !== -1 || html.indexOf("طلبات كثيرة جدًا") !== -1)) {
      console.error("[WitAnime] RATE LIMITED (HTTP 429)! WitAnime origin server is throttling requests from this IP. Please wait a moment before trying again.");
      return {
        sources: [],
        error: "WitAnime is temporarily rate-limiting requests (HTTP 429). Please wait 1-2 minutes and try again."
      };
    }

    // 1. Extract CSRF token
    let csrfMatch = html.match(
      /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i
    );
    let csrfToken = csrfMatch ? csrfMatch[1] : "";

    if (!csrfToken) {
      console.log("[WitAnime] CSRF token not found in watch page, requesting homepage fallback...");
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
      } catch (err) {
        console.warn("[WitAnime] Homepage CSRF fallback error: " + err);
      }
    }

    console.log("[WitAnime] CSRF token: " + (csrfToken ? csrfToken.substring(0, 8) + "..." : "NOT FOUND"));

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

    console.log("[WitAnime] Requesting sources manifest from: " + fullSourcesUrl);

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
        console.warn("[WitAnime] Failed to parse manifest JSON: " + manifest.substring(0, 100));
        manifest = {};
      }
    }

    const players =
      manifest && typeof manifest === "object" && manifest.players
        ? manifest.players
        : {};

    const availablePlayerQualities = Object.keys(players);
    console.log("[WitAnime] Manifest received. Available player qualities: " + availablePlayerQualities.join(", "));

    const isPlayableServer = (label) => {
      const l = (label || "").toLowerCase();
      return (
        l.indexOf("google") !== -1 ||
        l.indexOf("gdrive") !== -1 ||
        l.indexOf("drive") !== -1 ||
        l.indexOf("ok") !== -1 ||
        l.indexOf("odnoklassniki") !== -1 ||
        l.indexOf("yonaplay") !== -1 ||
        l.indexOf("dotplay") !== -1 ||
        l.indexOf("mail") !== -1 ||
        l.indexOf("soraplay") !== -1 ||
        l.indexOf("mp4upload") !== -1 ||
        l.indexOf("hgcloud") !== -1 ||
        l.indexOf("yourupload") !== -1 ||
        l.indexOf("streamwish") !== -1 ||
        l.indexOf("awish") !== -1 ||
        l.indexOf("filemoon") !== -1
      );
    };

    // Priority rankings: Google Drive > OK.ru > Yonaplay/Dotplay > Mail.ru > Soraplay > others
    const getServerPriority = (label) => {
      const l = (label || "").toLowerCase();
      if (l.indexOf("google") !== -1 || l.indexOf("gdrive") !== -1 || l.indexOf("drive") !== -1) return 1;
      if (l.indexOf("ok") !== -1 || l.indexOf("odnoklassniki") !== -1) return 2;
      if (l.indexOf("yonaplay") !== -1 || l.indexOf("dotplay") !== -1) return 3;
      if (l.indexOf("mail") !== -1) return 4;
      if (l.indexOf("soraplay") !== -1) return 5;
      if (l.indexOf("mp4upload") !== -1) return 6;
      if (l.indexOf("yourupload") !== -1) return 7;
      if (l.indexOf("hgcloud") !== -1) return 8;
      if (l.indexOf("streamwish") !== -1 || l.indexOf("awish") !== -1) return 9;
      if (l.indexOf("filemoon") !== -1) return 10;
      return 20;
    };

    // Prioritize FHD servers first. Only fall back to HD/SD if FHD is empty.
    const candidates = [];
    const qualitiesToInspect = ["FHD", "HD", "SD"];

    for (let qi = 0; qi < qualitiesToInspect.length; qi++) {
      const q = qualitiesToInspect[qi];
      const serverList = players[q] || [];
      if (!Array.isArray(serverList) || serverList.length === 0) continue;

      for (let si = 0; si < serverList.length; si++) {
        const s = serverList[si];
        if (!s || !s.token) continue;
        const rawLabel = (s.label || "Server").toString().trim();
        if (!isPlayableServer(rawLabel)) continue;

        candidates.push({
          quality: q,
          label: rawLabel,
          token: s.token,
          isDownload: false,
          rank: getServerPriority(rawLabel) + (q === "FHD" ? 0 : q === "HD" ? 10 : 20),
        });
      }

      // If we found playable candidates in FHD, do NOT queue HD and SD to prevent bursting the server
      if (candidates.length > 0) {
        break;
      }
    }

    // Fallback: If players had zero servers, check downloads (e.g. mp4upload)
    if (candidates.length === 0) {
      console.log("[WitAnime] No player servers found, checking downloads manifest...");
      const downloads =
        manifest && typeof manifest === "object" && manifest.downloads
          ? manifest.downloads
          : {};
      for (let qi = 0; qi < qualitiesToInspect.length; qi++) {
        const q = qualitiesToInspect[qi];
        const dList = downloads[q] || [];
        if (!Array.isArray(dList) || dList.length === 0) continue;

        for (let di = 0; di < dList.length; di++) {
          const d = dList[di];
          if (!d || !d.token) continue;
          const rawLabel = (d.label || "Download").toString().trim();
          if (!isPlayableServer(rawLabel)) continue;

          candidates.push({
            quality: q,
            label: rawLabel,
            token: d.token,
            isDownload: true,
            rank: getServerPriority(rawLabel) + 15,
          });
        }
        if (candidates.length > 0) break;
      }
    }

    candidates.sort((a, b) => a.rank - b.rank);

    // Limit to testing at most 3 top servers to completely prevent rate limiting
    const candidatesToTry = candidates.slice(0, 3);
    console.log(
      "[WitAnime] Candidate selection complete. Testing " +
        candidatesToTry.length +
        " prioritized server(s): " +
        candidatesToTry.map((c) => c.label + " (" + c.quality + ")").join(", ")
    );

    const sources = [];
    const seenStreamUrls = {};

    for (let ci = 0; ci < candidatesToTry.length; ci++) {
      const item = candidatesToTry[ci];
      console.log(
        "[WitAnime] [" +
          (ci + 1) +
          "/" +
          candidatesToTry.length +
          "] Testing: " +
          item.label +
          " (" +
          item.quality +
          ")"
      );

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

        // 1. Authorize token via POST stream-source or download-source
        const sourcePath = item.isDownload
          ? "/watch/download-source/"
          : "/watch/stream-source/";
        try {
          console.log("[WitAnime] Authorizing source token for " + item.label + "...");
          await this.request(this.baseUrl + sourcePath + item.token, {
            method: "POST",
            data: {},
            headers: authHeaders,
          });
        } catch (_) {}

        // 2. Resolve redirect location via GET stream-gate or download-gate
        const gatePath = item.isDownload
          ? "/watch/download-gate/"
          : "/watch/stream-gate/";
        const gateUrl = this.baseUrl + gatePath + item.token;
        console.log("[WitAnime] Resolving gate redirect from: " + gateUrl);
        let streamUrl = "";

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
            if (loc && loc !== gateUrl) {
              streamUrl =
                loc.indexOf("http") === 0 ? loc : this.baseUrl + loc;
            } else if (gateRes.body && typeof gateRes.body === "string") {
              const refreshMatch =
                gateRes.body.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=['"]([^'"]+)['"]/i) ||
                gateRes.body.match(/<a[^>]+href=["']([^"']+)["'][^>]*>Redirecting to/i);
              if (refreshMatch && refreshMatch[1]) {
                const rUrl = refreshMatch[1];
                streamUrl = rUrl.indexOf("http") === 0 ? rUrl : this.baseUrl + rUrl;
              } else {
                const m = gateRes.body.match(
                  /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i
                );
                if (m) streamUrl = m[0];
              }
            }
          }
        } catch (e) {
          console.warn("[WitAnime] Gate request failed: " + e);
        }

        if (!streamUrl) {
          console.warn("[WitAnime] Gate did not return a valid stream redirect for " + item.label);
          continue;
        }

        console.log("[WitAnime] Gate redirected to: " + streamUrl);

        const cleanLabel = item.label || "Server";
        const lowerLabel = cleanLabel.toLowerCase();

        // 3. Unpack Yonaplay multi-server container if present
        if (
          lowerLabel.indexOf("yonaplay") !== -1 ||
          streamUrl.indexOf("yonaplay") !== -1
        ) {
          console.log("[WitAnime] Unpacking Yonaplay embed container...");
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
                console.log("[WitAnime] Added stream source from Yonaplay: " + ys.server + " -> " + ys.url);
              }
            }
            if (sources.length >= 2) {
              console.log("[WitAnime] Reached desired source count (>= 2). Stopping further candidate tests.");
              break;
            }
            continue;
          }
        }

        const streamHeaders = {
          Referer: watchUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        };

        // 4. Resolve direct video stream
        console.log("[WitAnime] Resolving direct media URL from: " + streamUrl);
        const direct = await this.resolveEmbedDirectStream(
          streamUrl,
          watchUrl,
          streamHeaders
        );

        if (direct && direct.url && !seenStreamUrls[direct.url]) {
          seenStreamUrls[direct.url] = true;
          const isHls =
            direct.type === "hls" || direct.url.indexOf(".m3u8") !== -1;
          const sourceObj = {
            server:
              "WitAnime • " +
              cleanLabel.toUpperCase() +
              " (" +
              item.quality +
              ")",
            quality: item.quality,
            url: direct.url,
            type: isHls ? "hls" : "mp4",
            headers: direct.headers || streamHeaders,
          };
          sources.push(sourceObj);
          console.log("[WitAnime] Successfully added playable stream: " + sourceObj.server + " -> " + sourceObj.url);
        }

        // Early exit: stop once we have 2 direct working streams
        if (sources.length >= 2) {
          console.log("[WitAnime] Found " + sources.length + " playable streams. Early exit to avoid rate limits.");
          break;
        }

        // Short throttle pause between candidate attempts
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (e) {
        console.warn("[WitAnime] Exception evaluating candidate " + item.label + ": " + e);
        continue;
      }
    }

    console.log("[WitAnime] watch() completed. Returning " + sources.length + " playable stream source(s).");
    return {
      sources: sources,
    };
  }
}
