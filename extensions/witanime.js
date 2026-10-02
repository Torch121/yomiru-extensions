// ==MiruExtension==
// @name         WitAnime
// @version      v1.0.2
// @author       Yomiru
// @lang         ar
// @license      MIT
// @icon         https://witanime.site/assets/images/favicon.ico
// @package      site.witanime
// @type         bangumi
// @webSite      https://witanime.site
// @nsfw         false
// @description  مشاهدة وتحميل أفضل مسلسلات وأفلام الأنمي المترجمة أون لاين بجودة عالية عبر WitAnime
// ==/MiruExtension==

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
    var all = [title || ""]
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
    var list = [];
    function add(s) {
      var trimmed = (s || "").trim();
      if (trimmed && list.indexOf(trimmed) === -1) {
        list.push(trimmed);
      }
    }

    add(rawTitle);

    // Strip "Movie", "The Movie", "Film", "Gekijouban", "劇場版", "فيلم"
    var stripped = rawTitle
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
      var parts = rawTitle.split(":");
      add(parts[0]);
      if (parts.length > 1) add(parts.slice(1).join(" "));
    }
    if (rawTitle.indexOf(" - ") !== -1) {
      var parts2 = rawTitle.split(" - ");
      add(parts2[0]);
      if (parts2.length > 1) add(parts2.slice(1).join(" "));
    }

    return list;
  }

  async searchAnimeTarget(title, candidateTitles, isMovie, totalExpected) {
    var clean = (title || "").trim();
    var expectedMovie = isMovie || this.looksLikeMovie(clean, candidateTitles, totalExpected);
    var cacheKey = clean + "|isMovie:" + expectedMovie;
    if (this.titleToTargetCache && this.titleToTargetCache[cacheKey]) {
      return this.titleToTargetCache[cacheKey];
    }

    var titlesToTry = [];
    var candidates = [title].concat(candidateTitles || []);
    for (var i = 0; i < candidates.length; i++) {
      var variations = this.generateSearchVariations(candidates[i]);
      for (var j = 0; j < variations.length; j++) {
        var v = variations[j];
        if (titlesToTry.indexOf(v) === -1) titlesToTry.push(v);
      }
    }

    var bestOverallTarget = null;
    var highestOverallScore = -1;

    for (var qi = 0; qi < titlesToTry.length; qi++) {
      var query = titlesToTry[qi];
      try {
        var searchUrl = this.baseUrl + "/search?q=" + encodeURIComponent(query);
        var res = await this.request(searchUrl, {
          headers: { Referer: this.baseUrl + "/" },
        });
        var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
        if (!html) continue;

        var linkRegex = /<a[^>]+href=["'](?:https?:\/\/witanime\.site)?\/(anime|movie)\/([a-zA-Z0-9_-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var match;
        var queryBestTarget = null;
        var queryHighestScore = -1;
        var normalizedTarget = query.toLowerCase();

        while ((match = linkRegex.exec(html)) !== null) {
          var kind = match[1].toLowerCase();
          var slug = match[2];
          var inner = match[3] || "";
          var altMatch = inner.match(/alt=["']([^"']*)["']/i);
          var itemTitle = (altMatch && altMatch[1] ? altMatch[1] : slug).trim();
          var normalizedItemTitle = itemTitle.toLowerCase();
          var isResultMovie = kind === "movie" || inner.indexOf("فيلم") !== -1;

          var score = 0;

          // 1. Movie vs TV scoring bonus / penalty
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
          var cleanTitle = normalizedItemTitle.replace(/[^\w\s]/g, "").trim();
          var cleanQuery = normalizedTarget.replace(/[^\w\s]/g, "").trim();
          var querySlug = this.toSlug(normalizedTarget);

          if (cleanTitle === cleanQuery || slug === querySlug) {
            score += 100;
          } else if (cleanTitle.indexOf(cleanQuery) === 0 || slug.indexOf(querySlug) === 0) {
            score += 80;
          } else if (cleanTitle.indexOf(cleanQuery) !== -1 || cleanQuery.indexOf(cleanTitle) !== -1) {
            score += 60;
          } else if (slug.indexOf(querySlug) !== -1 || querySlug.indexOf(slug) !== -1) {
            score += 50;
          } else {
            // Word overlap
            var qWords = cleanQuery.split(/\s+/).filter(function(w) { return w.length > 2; });
            var tWords = cleanTitle.split(/\s+/).filter(function(w) { return w.length > 2; });
            var overlap = 0;
            for (var wi = 0; wi < qWords.length; wi++) {
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
              detailUrl: isResultMovie ? (this.baseUrl + "/movie/" + slug) : (this.baseUrl + "/anime/" + slug),
              watchUrl: isResultMovie ? (this.baseUrl + "/watch/movie/" + slug) : (this.baseUrl + "/watch/" + slug + "/1"),
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

    var fallbackSlug = this.toSlug(clean);
    var fallbackTarget = {
      slug: fallbackSlug,
      isMovie: expectedMovie,
      title: clean,
      detailUrl: expectedMovie ? (this.baseUrl + "/movie/" + fallbackSlug) : (this.baseUrl + "/anime/" + fallbackSlug),
      watchUrl: expectedMovie ? (this.baseUrl + "/watch/movie/" + fallbackSlug) : (this.baseUrl + "/watch/" + fallbackSlug + "/1"),
    };
    this.titleToTargetCache[cacheKey] = fallbackTarget;
    this.titleToSlugCache[clean] = fallbackSlug;
    return fallbackTarget;
  }

  async searchAnimeSlug(title, candidateTitles, isMovie) {
    var clean = (title || "").trim();
    if (this.titleToSlugCache && this.titleToSlugCache[clean]) {
      return this.titleToSlugCache[clean];
    }
    var target = await this.searchAnimeTarget(title, candidateTitles, isMovie);
    var slug = target && target.slug ? target.slug : this.toSlug(clean);
    this.titleToSlugCache[clean] = slug;
    return slug;
  }

  unpack(script) {
    if (!script || typeof script !== "string") return "";
    var evalIdx = script.indexOf("eval(function(p,a,c,k,e,d)");
    if (evalIdx === -1) return script;
    var endIdx = script.indexOf("</script>", evalIdx);
    if (endIdx === -1) endIdx = script.length;
    var block = script.substring(evalIdx, endIdx).trim();
    if (block.indexOf("eval(") === 0) {
      block = block.slice(5);
      if (block.endsWith(";")) block = block.slice(0, -1);
      if (block.endsWith(")")) block = block.slice(0, -1);
    }
    try {
      return eval("(" + block + ")") || "";
    } catch (e) {
      try {
        var m = block.match(/return\s+p\s*\}\s*\(\s*([\s\S]*?)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\s\S]*?)\.split\(['"|]/);
        if (!m) return "";
        var p = eval(m[1]);
        var a = parseInt(m[2], 10);
        var c = parseInt(m[3], 10);
        var k = eval(m[4]).split("|");
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
    var urls = [];
    var seen = {};

    function addUrl(u) {
      if (!u) return;
      var clean = u.replace(/\\\//g, "/").trim();
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
    }

    var mediaMatches = text.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>]*)?/gi);
    if (mediaMatches) {
      for (var i = 0; i < mediaMatches.length; i++) addUrl(mediaMatches[i]);
    }

    var keyMatches = text.match(/(?:file|src|source|url)\s*:\s*["'](https?:[^"']+)["']/gi);
    if (keyMatches) {
      for (var j = 0; j < keyMatches.length; j++) {
        var m = keyMatches[j].match(/["'](https?:[^"']+)["']/i);
        if (m && m[1]) {
          var u = m[1];
          if (u.indexOf(".m3u8") !== -1 || u.indexOf(".mp4") !== -1 || u.indexOf("/hls/") !== -1) {
            addUrl(u);
          }
        }
      }
    }

    var tagMatches = text.match(/<(?:source|video)[^>]+src=["']([^"']+)["']/gi);
    if (tagMatches) {
      for (var k = 0; k < tagMatches.length; k++) {
        var tm = tagMatches[k].match(/src=["']([^"']+)["']/i);
        if (tm && tm[1]) addUrl(tm[1]);
      }
    }

    return urls;
  }

  async extractHgcloud(embedUrl) {
    if (!embedUrl) return null;
    var idMatch = embedUrl.match(/\/e\/([a-zA-Z0-9]+)/);
    if (!idMatch) return null;
    var id = idMatch[1];

    var hosts = ["vibuxer.com", "hanerix.com", "audinifer.com", "dhcplay.com"];
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      try {
        var res = await this.request("https://" + host + "/e/" + id, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Referer: this.baseUrl,
          },
        });
        var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
        if (!html || html.length < 50) continue;

        var unpacked = this.unpack(html);
        if (!unpacked) continue;

        var linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[\s\S]*?\});/);
        if (linksMatch) {
          var linksStr = linksMatch[1];
          var hls2 = linksStr.match(/"hls2"\s*:\s*"([^"]+)"/);
          var hls4 = linksStr.match(/"hls4"\s*:\s*"([^"]+)"/);
          if (hls2 && hls2[1]) {
            return {
              url: hls2[1],
              type: "hls",
              isDirectVideo: true,
              headers: {
                Referer: "https://" + host + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            };
          }
          if (hls4 && hls4[1]) {
            return {
              url: "https://" + host + hls4[1],
              type: "hls",
              isDirectVideo: true,
              headers: {
                Referer: "https://" + host + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            };
          }
        }

        var m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/);
        if (m3u8Match) {
          return {
            url: m3u8Match[0],
            type: "hls",
            isDirectVideo: true,
            headers: {
              Referer: "https://" + host + "/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          };
        }
      } catch (err) {}
    }
    return null;
  }

  async extractOkRu(embedUrl) {
    if (!embedUrl) return null;
    try {
      var res = await this.request(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: this.baseUrl,
        },
      });
      var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
      var optMatch = html.match(/data-options=["']([^"']+)["']/i);
      if (!optMatch) return null;
      var decodedJson = this.decodeHtml(optMatch[1]);
      var opts = JSON.parse(decodedJson);
      var meta = opts && opts.flashvars && opts.flashvars.metadata ? JSON.parse(opts.flashvars.metadata) : null;
      if (!meta) return null;

      if (meta.hlsMasterPlaylistUrl) {
        return {
          url: meta.hlsMasterPlaylistUrl,
          type: "hls",
          isDirectVideo: true,
          headers: {
            Referer: "https://ok.ru/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        };
      }

      if (Array.isArray(meta.videos) && meta.videos.length > 0) {
        var best = meta.videos[meta.videos.length - 1];
        return {
          url: best.url,
          type: "mp4",
          quality: best.name,
          isDirectVideo: true,
          headers: {
            Referer: "https://ok.ru/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async extractMp4Upload(embedUrl) {
    if (!embedUrl) return null;
    try {
      var res = await this.request(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.mp4upload.com/",
        },
      });
      var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
      var unpacked = this.unpack(html);
      var searchIn = unpacked + " " + html;
      var srcMatch = searchIn.match(/player\.src\(["'](https?:[^"']+\.mp4[^"']*)["']\)/i) ||
                     searchIn.match(/src:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
                     searchIn.match(/https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?/i);
      if (srcMatch) {
        var videoUrl = srcMatch[1] || srcMatch[0];
        if (videoUrl.indexOf("/embed") === -1 && !videoUrl.endsWith(".html") && !videoUrl.endsWith(".htm")) {
          return {
            url: videoUrl,
            type: "mp4",
            isDirectVideo: true,
            headers: {
              Referer: "https://www.mp4upload.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
      var res = await this.request(embedUrl, {
        headers: {
          Referer: "https://www.yourupload.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
      var unpacked = this.unpack(html);
      var direct = this.findDirectMediaUrls(unpacked + " " + html);
      if (direct.length > 0) {
        return {
          url: direct[0],
          type: "mp4",
          isDirectVideo: true,
          headers: {
            Referer: "https://www.yourupload.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async extractStreamWish(embedUrl) {
    if (!embedUrl) return null;
    try {
      var res = await this.request(embedUrl, {
        headers: {
          Referer: embedUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
      var unpacked = this.unpack(html);
      var direct = this.findDirectMediaUrls(unpacked + " " + html);
      if (direct.length > 0) {
        var videoUrl = direct[0];
        return {
          url: videoUrl,
          type: videoUrl.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async extractFilemoon(embedUrl) {
    if (!embedUrl) return null;
    try {
      var res = await this.request(embedUrl, {
        headers: {
          Referer: embedUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
      var unpacked = this.unpack(html);
      var direct = this.findDirectMediaUrls(unpacked + " " + html);
      if (direct.length > 0) {
        var videoUrl = direct[0];
        return {
          url: videoUrl,
          type: videoUrl.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async extractGoogleDrive(embedUrl) {
    if (!embedUrl) return null;
    try {
      var fileIdMatch = embedUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || embedUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      var fileId = fileIdMatch ? fileIdMatch[1] : null;
      if (!fileId) return null;

      var ucUrl = "https://drive.usercontent.google.com/download?id=" + fileId + "&export=download";
      var res = await this.request(ucUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
      var formMatch = html.match(/<form[^>]+action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i);
      if (formMatch) {
        var action = formMatch[1] || "https://drive.usercontent.google.com/download";
        var formContent = formMatch[2] || "";
        var inputMatches = formContent.match(/<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/gi);
        var params = [];
        if (inputMatches) {
          for (var i = 0; i < inputMatches.length; i++) {
            var im = inputMatches[i].match(/name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/i);
            if (im) params.push(encodeURIComponent(im[1]) + "=" + encodeURIComponent(im[2]));
          }
        }
        var videoUri = action + (action.indexOf("?") === -1 ? "?" : "&") + params.join("&");
        return {
          url: videoUri,
          type: "mp4",
          isDirectVideo: true,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        };
      }

      return {
        url: ucUrl,
        type: "mp4",
        isDirectVideo: true,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      };
    } catch (e) {}
    return null;
  }

  async extractYonaplay(embedUrl, defaultQuality) {
    if (!embedUrl) return [];
    var sources = [];
    try {
      var res = await this.request(embedUrl, {
        headers: {
          Referer: this.baseUrl + "/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
      var unpacked = this.unpack(html);
      var combined = unpacked + " " + html;

      var direct = this.findDirectMediaUrls(combined);
      if (direct.length > 0) {
        var m3u8Url = direct[0];
        sources.push({
          url: m3u8Url,
          type: m3u8Url.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
          server: "WitAnime • YONAPLAY (" + (defaultQuality || "Auto") + " - Direct)",
          quality: defaultQuality || "Auto",
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
      }

      var iframeMatches = combined.match(/<iframe[^>]+src=["']([^"']+)["']/gi);
      if (iframeMatches) {
        for (var i = 0; i < iframeMatches.length; i++) {
          var srcMatch = iframeMatches[i].match(/src=["']([^"']+)["']/i);
          if (srcMatch && srcMatch[1]) {
            var subUrl = srcMatch[1];
            if (subUrl.indexOf("//") === 0) subUrl = "https:" + subUrl;
            var subSource = await this.resolveEmbedDirectStream(subUrl, embedUrl);
            if (subSource && subSource.url) {
              sources.push({
                url: subSource.url,
                type: subSource.type || "hls",
                server: "WitAnime • YONAPLAY (" + (defaultQuality || "HD") + " - Direct)",
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

  async extractGenericMedia(embedUrl, referer) {
    if (!embedUrl) return null;
    try {
      var res = await this.request(embedUrl, {
        headers: {
          Referer: referer || this.baseUrl + "/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
      var unpacked = this.unpack(html);
      var direct = this.findDirectMediaUrls(unpacked + " " + html);
      if (direct.length > 0) {
        var videoUrl = direct[0];
        return {
          url: videoUrl,
          type: videoUrl.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
          isDirectVideo: true,
          headers: {
            Referer: embedUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        };
      }
    } catch (e) {}
    return null;
  }

  async resolveEmbedDirectStream(streamUrl, referer, authHeaders) {
    if (!streamUrl) return null;
    var lower = streamUrl.toLowerCase();

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

    if (lower.indexOf("hgcloud") !== -1 || lower.indexOf("vibuxer") !== -1 || lower.indexOf("hanerix") !== -1 || lower.indexOf("audinifer") !== -1 || lower.indexOf("dhcplay") !== -1) {
      return await this.extractHgcloud(streamUrl);
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
    if (lower.indexOf("streamwish") !== -1 || lower.indexOf("awish") !== -1 || lower.indexOf("wishembed") !== -1) {
      return await this.extractStreamWish(streamUrl);
    }
    if (lower.indexOf("filemoon") !== -1) {
      return await this.extractFilemoon(streamUrl);
    }
    if (lower.indexOf("drive.google.com") !== -1 || lower.indexOf("docs.google.com") !== -1) {
      return await this.extractGoogleDrive(streamUrl);
    }

    // Fallback: generic media sniffer
    return await this.extractGenericMedia(streamUrl, referer);
  }

  parseAnimeGrid(html) {
    var results = [];
    var seen = {};

    var gridHtml = html;
    var gridStart = html.indexOf("grid grid-cols-2");
    if (gridStart !== -1) {
      var gridEnd = html.indexOf("lg:sticky", gridStart);
      if (gridEnd !== -1) {
        gridHtml = html.substring(gridStart, gridEnd);
      } else {
        gridHtml = html.substring(gridStart);
      }
    }

    var cardRegex = /<a[^>]*href=["']((?:https?:\/\/witanime\.site)?\/(?:anime|movie)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = cardRegex.exec(gridHtml)) !== null) {
      var rawLink = match[1];
      var link = rawLink.indexOf("http") === 0 ? rawLink : (this.baseUrl + (rawLink.indexOf("/") === 0 ? "" : "/") + rawLink);
      if (seen[link] || link.endsWith("/browse") || link.endsWith("/movies")) continue;
      seen[link] = true;

      var cardContent = match[2];
      var imgMatch = cardContent.match(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["']/i) ||
                     cardContent.match(/<img[^>]*src=["']([^"']+)["']/i);
      var titleMatch = cardContent.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i);

      var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      if (!title && imgMatch && imgMatch[2]) {
        title = imgMatch[2].trim();
      }
      var cover = imgMatch ? imgMatch[1] : "";

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
    var p = page || 1;
    var url = p > 1 ? (this.baseUrl + "/browse?page=" + p) : (this.baseUrl + "/browse");
    var res = await this.request(url, {
      headers: { Referer: this.baseUrl + "/" },
    });
    var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
    return this.parseAnimeGrid(html);
  }

  async search(kw, page) {
    var p = page || 1;
    var url = this.baseUrl + "/search?q=" + encodeURIComponent(kw) + "&page=" + p;
    var res = await this.request(url, {
      headers: { Referer: this.baseUrl + "/" },
    });
    var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));
    var gridResults = this.parseAnimeGrid(html);

    if (gridResults.length > 0) {
      return gridResults;
    }

    // Fallback: Attempt smart scoring target search
    var target = await this.searchAnimeTarget(kw);
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
    var fullUrl = url.indexOf("http") === 0 ? url : (this.baseUrl + (url.indexOf("/") === 0 ? "" : "/") + url);
    var isMovieEntry = fullUrl.indexOf("/movie/") !== -1;

    var res = await this.request(fullUrl, {
      headers: { Referer: this.baseUrl + "/" },
    });
    var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));

    // Title
    var titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    var title = titleMatch ? this.decodeHtml(titleMatch[1].replace(/<[^>]+>/g, "").trim()) : "";

    // Cover
    var coverMatch = html.match(/<img[^>]*src=["'](https:\/\/images\.witanime\.site\/posters\/[^"']+)["']/i) ||
                     html.match(/<img[^>]*src=["'](https:\/\/images\.witanime\.site\/banners\/[^"']+)["']/i) ||
                     html.match(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["'][^"']*poster[^"']*["']/i);
    var cover = coverMatch ? coverMatch[1] : "";

    // Description
    var descMatch = html.match(/<p[^>]*class=["'][^"']*leading-relaxed[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    var desc = descMatch ? this.decodeHtml(descMatch[1].replace(/<[^>]+>/g, "").trim()) : "";

    // Check if page indicates it's a Movie
    if (!isMovieEntry) {
      isMovieEntry = this.looksLikeMovie(title) || (html.indexOf("فيلم") !== -1 && html.indexOf("نوع الأنمي : فيلم") !== -1);
    }

    if (isMovieEntry) {
      var movieSlugMatch = fullUrl.match(/\/movie\/([a-zA-Z0-9_-]+)/);
      var slug = movieSlugMatch ? movieSlugMatch[1] : this.toSlug(title);
      var watchUrl = this.baseUrl + "/watch/movie/" + slug;

      var watchMatch = html.match(/href=["'](https?:\/\/witanime\.site\/watch\/movie\/[^"']+)["']/i);
      if (watchMatch && watchMatch[1]) {
        watchUrl = watchMatch[1];
      }

      return {
        title: title,
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
    var animeSlugMatch = fullUrl.match(/\/anime\/([a-zA-Z0-9_-]+)/);
    var slug = animeSlugMatch ? animeSlugMatch[1] : this.toSlug(title);

    var epNumbers = [];
    var epNumberSet = {};

    var epPattern = new RegExp('href=["\'](?:https?:\\/\\/witanime\\.site)?\\/watch\\/' + slug + '\\/([0-9.]+)[^"\']*["\']', "gi");
    var match;
    while ((match = epPattern.exec(html)) !== null) {
      var num = parseFloat(match[1]);
      if (!isNaN(num) && !epNumberSet[num]) {
        epNumberSet[num] = true;
        epNumbers.push(num);
      }
    }

    // Fallback regex if slug wasn't strictly matching
    if (epNumbers.length === 0) {
      var generalEpPattern = /href=["'](?:https?:\/\/witanime\.site)?\/watch\/[a-zA-Z0-9_-]+\/([0-9.]+)[^"']*["']/gi;
      while ((match = generalEpPattern.exec(html)) !== null) {
        var num = parseFloat(match[1]);
        if (!isNaN(num) && !epNumberSet[num]) {
          epNumberSet[num] = true;
          epNumbers.push(num);
        }
      }
    }

    var episodes = [];

    if (epNumbers.length > 0) {
      epNumbers.sort(function(a, b) {
        return a - b;
      });

      for (var i = 0; i < epNumbers.length; i++) {
        var epNum = epNumbers[i];
        var epStr = epNum % 1 === 0 ? epNum.toString() : epNum.toString();
        episodes.push({
          name: "Episode " + epStr,
          url: this.baseUrl + "/watch/" + slug + "/" + epStr,
        });
      }
    } else {
      // Fallback: Generate 12 standard episodes if page is protected or unreleased
      for (var i = 1; i <= 12; i++) {
        episodes.push({
          name: "Episode " + i,
          url: this.baseUrl + "/watch/" + slug + "/" + i,
        });
      }
    }

    return {
      title: title,
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

  async watch(url) {
    var fullUrl = url.indexOf("http") === 0 ? url : (this.baseUrl + (url.indexOf("/") === 0 ? "" : "/") + url);
    var res = await this.request(fullUrl, {
      headers: {
        Referer: this.baseUrl + "/",
      },
    });
    var html = typeof res === "string" ? res : (res && res.body ? res.body : JSON.stringify(res));

    // 1. Extract CSRF token
    var csrfMatch = html.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i);
    var csrfToken = csrfMatch ? csrfMatch[1] : "";

    if (!csrfToken) {
      try {
        var homeRes = await this.request(this.baseUrl, {
          headers: { Referer: this.baseUrl + "/" },
        });
        var homeHtml = typeof homeRes === "string" ? homeRes : (homeRes && homeRes.body ? homeRes.body : JSON.stringify(homeRes));
        csrfMatch = homeHtml.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i);
        csrfToken = csrfMatch ? csrfMatch[1] : "";
      } catch (err) {}
    }

    // 2. Extract sourcesUrl
    var sourcesUrlMatch = html.match(/sourcesUrl:\s*['"]([^'"]+)['"]/);
    var sourcesPath = sourcesUrlMatch
      ? sourcesUrlMatch[1].replace(/\\\//g, "/")
      : (fullUrl.replace(/\/$/, "") + "/sources");
    var fullSourcesUrl = sourcesPath.indexOf("http") === 0
      ? sourcesPath
      : (this.baseUrl + (sourcesPath.indexOf("/") === 0 ? "" : "/") + sourcesPath);

    var manifest = await this.request(fullSourcesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-TOKEN": csrfToken,
        Referer: fullUrl,
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    var parsedManifest = manifest;
    if (typeof parsedManifest === "string") {
      try {
        parsedManifest = JSON.parse(parsedManifest);
      } catch (e) {
        parsedManifest = {};
      }
    }

    var sources = [];
    var seenStreamUrls = {};
    var players = parsedManifest && typeof parsedManifest === "object" && parsedManifest.players ? parsedManifest.players : {};

    // Filter out non-streaming download services like MEGA, 4SHARED, UPTOBOX
    function isPlayableServer(label) {
      var l = (label || "").toLowerCase();
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
    }

    // Collect candidates prioritized by quality and host
    var candidates = [];
    var qualities = ["FHD", "HD", "SD"];
    for (var qi = 0; qi < qualities.length; qi++) {
      var q = qualities[qi];
      var serverList = players[q] || [];
      for (var si = 0; si < serverList.length; si++) {
        var s = serverList[si];
        if (!s || !s.token) continue;
        var label = (s.label || "").toLowerCase();
        if (!isPlayableServer(label)) continue;

        var priority = 10;
        if (label.indexOf("hgcloud") !== -1 || label.indexOf("dhcplay") !== -1) priority = 1;
        else if (label.indexOf("ok") !== -1) priority = 2;
        else if (label.indexOf("mp4upload") !== -1) priority = 3;
        else if (label.indexOf("yourupload") !== -1) priority = 4;
        else if (label.indexOf("streamwish") !== -1) priority = 5;
        else if (label.indexOf("filemoon") !== -1) priority = 6;
        else if (label.indexOf("yonaplay") !== -1) priority = 7;
        else if (label.indexOf("videa") !== -1) priority = 8;
        else if (label.indexOf("gdrive") !== -1 || label.indexOf("google") !== -1) priority = 9;

        var qWeight = q === "FHD" ? 0 : (q === "HD" ? 20 : 40);
        candidates.push({
          quality: q,
          label: s.label || "Server",
          token: s.token,
          rank: priority + qWeight,
        });
      }
    }

    // Sort by best server and quality
    candidates.sort(function(a, b) {
      return a.rank - b.rank;
    });

    for (var ci = 0; ci < candidates.length; ci++) {
      var item = candidates[ci];
      try {
        // 1. Authorize token via POST /watch/stream-source/$token
        await this.request(this.baseUrl + "/watch/stream-source/" + item.token, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-CSRF-TOKEN": csrfToken,
            Referer: fullUrl,
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        // 2. Resolve 302 redirect location via GET /watch/stream-gate/$token
        var gateUrl = this.baseUrl + "/watch/stream-gate/" + item.token;
        var gateRes = await this.request(gateUrl, {
          followRedirects: false,
          fullResponse: true,
          headers: {
            Referer: fullUrl,
          },
        });

        var streamUrl = gateUrl;
        if (typeof gateRes === "object" && gateRes !== null) {
          var loc = (gateRes.headers && (gateRes.headers.location || gateRes.headers.Location)) || gateRes.url || "";
          if (loc) {
            streamUrl = loc.indexOf("http") === 0 ? loc : (this.baseUrl + loc);
          } else if (gateRes.body && typeof gateRes.body === "string") {
            var m = gateRes.body.match(/https?:\/\/(?:hgcloud|hglink|dhcplay|vibuxer|ok\.ru|mp4upload|yonaplay|yourupload|streamwish|filemoon)[^"'\s<>]*/i);
            if (m) streamUrl = m[0];
          }
        }

        var cleanLabel = item.label.trim();
        if (!cleanLabel) cleanLabel = "Server";
        var lowerLabel = cleanLabel.toLowerCase();

        // 3. Unpack Yonaplay multi-server container if present
        if (lowerLabel.indexOf("yonaplay") !== -1 || streamUrl.indexOf("yonaplay") !== -1) {
          var yonaSources = await this.extractYonaplay(streamUrl, item.quality);
          if (yonaSources.length > 0) {
            for (var yi = 0; yi < yonaSources.length; yi++) {
              var ys = yonaSources[yi];
              if (ys && ys.url && !seenStreamUrls[ys.url]) {
                seenStreamUrls[ys.url] = true;
                sources.push(ys);
              }
            }
            if (sources.length >= 4) break;
            continue;
          }
        }

        var authHeaders = {
          Referer: fullUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };

        // 4. Attempt direct video resolution for embeds
        var direct = await this.resolveEmbedDirectStream(streamUrl, fullUrl, authHeaders);

        // Strictly only add verified direct video streams (no web download links!)
        if (direct && direct.url && !seenStreamUrls[direct.url]) {
          seenStreamUrls[direct.url] = true;
          var isHls = direct.type === "hls" || direct.url.indexOf(".m3u8") !== -1;
          sources.push({
            server: "WitAnime • " + cleanLabel.toUpperCase() + " (" + item.quality + " - Direct)",
            quality: item.quality,
            url: direct.url,
            type: isHls ? "hls" : "mp4",
            headers: direct.headers || authHeaders,
          });
        }
      } catch (e) {
        // Continue to next candidate
      }

      if (sources.length >= 4) break;
    }

    return {
      sources: sources,
    };
  }
}
