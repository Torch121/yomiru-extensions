// ==MiruExtension==
// @name         AnimeOnsen
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://www.animeonsen.xyz/assets/icons/icon-192x192.png
// @package      xyz.animeonsen
// @type         bangumi
// @webSite      https://www.animeonsen.xyz
// @nsfw         false
// @description  AnimeOnsen official API provider with live OAuth token negotiation, DASH adaptive streaming, and multilingual soft subtitles.
// ==/MiruExtension==

export default class extends Extension {
  get authUrl() {
    return "https://auth.animeonsen.xyz/oauth/token";
  }

  get apiBase() {
    return "https://api.animeonsen.xyz/v4";
  }

  get clientId() {
    return "f296be26-28b5-4358-b5a1-6259575e23b7";
  }

  get clientSecret() {
    return "349038c4157d0480784753841217270c3c5b35f4281eaee029de21cb04084235";
  }

  get commonHeaders() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.3",
      "Accept": "application/json",
      "Origin": "https://www.animeonsen.xyz",
      "Referer": "https://www.animeonsen.xyz/",
    };
  }

  constructor() {
    super();
    this.cachedToken = null;
    this.tokenExpiry = 0;
    this.titleToContentIdCache = {};
    this.stopWords = [
      "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of",
      "with", "by", "anime", "season", "part", "no", "wa", "ga", "ni", "de", "wo"
    ];
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

  /// Live OAuth 2.0 client_credentials token negotiation
  async getValidToken() {
    var now = Date.now();
    if (this.cachedToken && this.tokenExpiry && now < (this.tokenExpiry - 300000)) {
      return this.cachedToken;
    }

    var body =
      "client_id=" + encodeURIComponent(this.clientId) +
      "&client_secret=" + encodeURIComponent(this.clientSecret) +
      "&grant_type=client_credentials";

    var res = await this.request(this.authUrl, {
      method: "POST",
      headers: Object.assign({}, this.commonHeaders, {
        "Content-Type": "application/x-www-form-urlencoded",
      }),
      data: body,
      body: body,
    });

    var data = this.parseJson(res);
    if (data && data.access_token) {
      this.cachedToken = data.access_token;
      var expiresIn = parseInt(data.expires_in) || 604800;
      this.tokenExpiry = Date.now() + (expiresIn * 1000);
      return this.cachedToken;
    }

    throw new Error("Failed to obtain AnimeOnsen access token");
  }

  /// Searches AnimeOnsen for the given title and returns the best matching content_id
  async searchContentId(title) {
    var clean = (title || "").trim();
    if (!clean) return null;
    if (this.titleToContentIdCache[clean]) {
      return this.titleToContentIdCache[clean];
    }

    try {
      var token = await this.getValidToken();
      var url = this.apiBase + "/search/" + encodeURIComponent(clean);
      var res = await this.request(url, {
        headers: Object.assign({}, this.commonHeaders, {
          "Authorization": "Bearer " + token,
        }),
      });

      var data = this.parseJson(res);
      if (data && Array.isArray(data.result) && data.result.length > 0) {
        var list = data.result;
        var bestId = null;
        var highestScore = -1;
        var normalizedTarget = clean.toLowerCase();
        var targetWords = normalizedTarget
          .split(/[\s:–—\-]+/)
          .filter(function (w) {
            return w.length > 1 && this.stopWords.indexOf(w) === -1;
          }.bind(this));

        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          if (!item || !item.content_id) continue;
          var id = item.content_id;
          var titleEn = (item.content_title_en || "").toLowerCase();
          var titleJp = (item.content_title || "").toLowerCase();

          var score = 0;
          if (titleEn === normalizedTarget || titleJp === normalizedTarget) {
            score = 100;
          } else if (titleEn.indexOf(normalizedTarget) === 0 || titleJp.indexOf(normalizedTarget) === 0) {
            score = 80;
          } else if (titleEn.indexOf(normalizedTarget) !== -1 || titleJp.indexOf(normalizedTarget) !== -1) {
            score = 50;
          } else {
            var matched = 0;
            for (var w = 0; w < targetWords.length; w++) {
              if (titleEn.indexOf(targetWords[w]) !== -1 || titleJp.indexOf(targetWords[w]) !== -1) {
                matched++;
                score += 15;
              }
            }
            if (targetWords.length > 0 && matched < Math.ceil(targetWords.length / 2)) {
              score = 0;
            }
          }

          if (score > highestScore) {
            highestScore = score;
            bestId = id;
          }
        }

        if (highestScore >= 15 && bestId) {
          this.titleToContentIdCache[clean] = bestId;
          return bestId;
        }
      }
    } catch (e) {
      // Fallback: try prefix before colon or dash
      var stripped = clean.split(/[:–—-]/)[0].trim();
      if (stripped && stripped !== clean) {
        return await this.searchContentId(stripped);
      }
    }

    return null;
  }

  /// Popular/Trending anime from spotlight or index
  async popular(page) {
    try {
      var p = page || 1;
      if (p === 1) {
        var token = await this.getValidToken();
        var spotlightUrl = this.apiBase + "/content/index/recent/spotlight";
        var res = await this.request(spotlightUrl, {
          headers: Object.assign({}, this.commonHeaders, {
            "Authorization": "Bearer " + token,
          }),
        });
        var data = this.parseJson(res);
        if (data && Array.isArray(data.content) && data.content.length > 0) {
          return data.content.map(function (item) {
            var title = (Array.isArray(item.content_title) ? item.content_title[1] || item.content_title[0] : item.content_title) ||
                        item.content_title_en ||
                        item.content_id;
            return {
              title: title,
              url: "https://api.animeonsen.xyz/v4/content/" + item.content_id,
              cover: "https://api.animeonsen.xyz/v4/image/210x300/" + item.content_id,
            };
          });
        }
      }
    } catch (e) {}

    return this.latest(page);
  }

  /// Latest anime releases catalog with pagination
  async latest(page) {
    var p = page || 1;
    var limit = 24;
    var start = (p - 1) * limit;

    try {
      var token = await this.getValidToken();
      var url = this.apiBase + "/content/index?start=" + start + "&limit=" + limit;
      var res = await this.request(url, {
        headers: Object.assign({}, this.commonHeaders, {
          "Authorization": "Bearer " + token,
        }),
      });

      var data = this.parseJson(res);
      if (data && Array.isArray(data.content)) {
        return data.content.map(function (item) {
          var title = item.content_title_en || item.content_title || item.content_id;
          return {
            title: title,
            url: "https://api.animeonsen.xyz/v4/content/" + item.content_id,
            cover: "https://api.animeonsen.xyz/v4/image/210x300/" + item.content_id,
          };
        });
      }
    } catch (e) {}

    return [];
  }

  /// Title search on AnimeOnsen
  async search(kw, page) {
    var clean = (kw || "").trim();
    if (!clean) return [];

    try {
      var token = await this.getValidToken();
      var url = this.apiBase + "/search/" + encodeURIComponent(clean);
      var res = await this.request(url, {
        headers: Object.assign({}, this.commonHeaders, {
          "Authorization": "Bearer " + token,
        }),
      });

      var data = this.parseJson(res);
      if (data && Array.isArray(data.result) && data.result.length > 0) {
        return data.result.map(function (item) {
          var title = item.content_title_en || item.content_title || item.content_id;
          return {
            title: title,
            url: "https://api.animeonsen.xyz/v4/content/" + item.content_id,
            cover: "https://api.animeonsen.xyz/v4/image/210x300/" + item.content_id,
          };
        });
      }

      // Fallback: smart target search
      var matchedId = await this.searchContentId(clean);
      if (matchedId) {
        return [
          {
            title: clean,
            url: "https://api.animeonsen.xyz/v4/content/" + matchedId,
            cover: "https://api.animeonsen.xyz/v4/image/210x300/" + matchedId,
          },
        ];
      }
    } catch (e) {}

    return [];
  }

  /// Details and episode listing retrieval
  async detail(url) {
    var idMatch = url.match(/\/content\/([a-zA-Z0-9_-]+)/) ||
                  url.match(/\/details\/([a-zA-Z0-9_-]+)/) ||
                  url.match(/^([a-zA-Z0-9_-]{10,24})$/);
    var contentId = idMatch ? idMatch[1] : url;

    var token = await this.getValidToken();

    // 1. Fetch metadata
    var metaUrl = this.apiBase + "/content/" + contentId;
    var metaRes = await this.request(metaUrl, {
      headers: Object.assign({}, this.commonHeaders, {
        "Authorization": "Bearer " + token,
      }),
    });
    var metaData = this.parseJson(metaRes) || {};
    var title = metaData.content_title_en || metaData.content_title || contentId;
    var isMovie = metaData.is_movie === true;

    // 2. Fetch episodes list
    var epUrl = this.apiBase + "/content/" + contentId + "/episodes";
    var epRes = await this.request(epUrl, {
      headers: Object.assign({}, this.commonHeaders, {
        "Authorization": "Bearer " + token,
      }),
    });
    var epData = this.parseJson(epRes) || {};

    var epEntries = [];
    for (var k in epData) {
      if (epData.hasOwnProperty(k)) {
        var num = parseFloat(k);
        if (!isNaN(num)) {
          epEntries.push({ num: num, rawKey: k, value: epData[k] });
        }
      }
    }

    epEntries.sort(function (a, b) {
      return a.num - b.num;
    });

    var episodes = [];
    if (epEntries.length > 0) {
      for (var i = 0; i < epEntries.length; i++) {
        var item = epEntries[i];
        var epInt = parseInt(item.num);
        var epName = isMovie ? "Full Movie" : ("Episode " + epInt);

        if (item.value && item.value.contentTitle_episode_en) {
          var subTitle = item.value.contentTitle_episode_en.trim();
          if (subTitle) {
            epName = isMovie ? ("Movie: " + subTitle) : ("Episode " + epInt + ": " + subTitle);
          }
        }

        episodes.push({
          name: epName,
          url: "https://api.animeonsen.xyz/v4/content/" + contentId + "/video/" + epInt,
        });
      }
    } else {
      // Fallback for single movie or unlisted
      episodes.push({
        name: isMovie ? "Full Movie" : "Episode 1",
        url: "https://api.animeonsen.xyz/v4/content/" + contentId + "/video/1",
      });
    }

    return {
      title: title,
      cover: "https://api.animeonsen.xyz/v4/image/210x300/" + contentId,
      desc: metaData.content_description || "",
      episodes: [
        {
          title: "Episodes",
          urls: episodes,
        },
      ],
    };
  }

  /// Streams & Subtitles extraction (DASH manifest)
  async watch(url) {
    var match = url.match(/\/content\/([a-zA-Z0-9_-]+)\/video\/([0-9.]+)/);
    var contentId = match ? match[1] : null;
    var epNum = match ? parseInt(match[2]) : 1;

    if (!contentId) {
      var directId = url.match(/\/content\/([a-zA-Z0-9_-]+)/);
      contentId = directId ? directId[1] : url;
    }

    var token = await this.getValidToken();
    var videoUrl = this.apiBase + "/content/" + contentId + "/video/" + epNum;
    var res = await this.request(videoUrl, {
      headers: Object.assign({}, this.commonHeaders, {
        "Authorization": "Bearer " + token,
      }),
    });

    var data = this.parseJson(res) || {};
    var uriObj = data.uri || {};
    var metaObj = data.metadata || {};
    var streamUrl = uriObj.stream;

    if (!streamUrl) {
      throw new Error("No stream URL available from AnimeOnsen");
    }

    var authHeaders = {
      "Referer": "https://www.animeonsen.xyz/",
      "Origin": "https://www.animeonsen.xyz",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.3",
    };

    // Subtitles extraction
    var subtitles = [];
    var rawSubs = uriObj.subtitles || {};
    var metaSubs = metaObj.subtitles || {};

    for (var langCode in rawSubs) {
      if (rawSubs.hasOwnProperty(langCode)) {
        var subUrl = rawSubs[langCode];
        var langTitle = metaSubs[langCode] || langCode;
        subtitles.push({
          title: langTitle,
          language: langCode,
          url: subUrl,
          default: langCode.toLowerCase().indexOf("en") === 0,
        });
      }
    }

    return {
      url: streamUrl,
      type: "dash",
      headers: authHeaders,
      subtitles: subtitles,
      sources: [
        {
          server: "AnimeOnsen • DASH 1080p (Official)",
          quality: "1080p",
          url: streamUrl,
          type: "dash",
          headers: authHeaders,
        },
      ],
    };
  }
}
