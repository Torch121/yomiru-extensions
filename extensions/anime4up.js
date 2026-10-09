// ==YomiruExtension==
// @name         Anime4up
// @version      v1.0.1
// @author       Yomiru
// @lang         ar
// @license      MIT
// @icon         https://w1.anime4up.rest/wp-content/uploads/2019/03/Anime4up-Icon-1.png
// @package      site.anime4up
// @type         bangumi
// @webSite      https://w1.anime4up.rest
// @nsfw         false
// @description  مشاهدة وتحميل أفضل مسلسلات وأفلام الأنمي المترجمة أون لاين بجودة عالية عبر Anime4up
// ==/YomiruExtension==

export default class extends Extension {
  get baseUrl() {
    return "https://w1.anime4up.rest";
  }

  async req(url, options = {}) {
    const rawUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const cleanUrl = encodeURI(decodeURI(rawUrl));
    return this.request(cleanUrl, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        ...(options.headers || {}),
      },
    });
  }

  _decodeHtml(str) {
    if (!str || typeof str !== "string") return "";
    return str
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 16))
      )
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'")
      .replace(/&#038;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  _cleanText(str) {
    if (!str || typeof str !== "string") return "";
    return this._decodeHtml(str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  }

  _normalizeQuality(quality) {
    if (!quality) return "Auto";
    const q = String(quality).trim().toUpperCase();
    if (q.includes("4K") || q.includes("2160")) return "4K";
    if (q.includes("FHD") || q.includes("1080")) return "FHD";
    if (q.includes("HD") || q.includes("720")) return "HD";
    if (q.includes("SD") || q.includes("480") || q.includes("360")) return "SD";
    return q;
  }

  // 1. Popular Anime Catalog
  async popular(page) {
    const p = Math.max(1, page || 1);
    const path =
      p > 1
        ? `/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/page/${p}/`
        : `/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : (res && res.body) || "";
    return this._parseGrid(html);
  }

  // 2. Latest Updates
  async latest(page) {
    const p = Math.max(1, page || 1);
    const path = p > 1 ? `/episode/page/${p}/` : `/episode/`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : (res && res.body) || "";
    return this._parseGrid(html);
  }

  // 3. Search Anime
  async search(kw, page) {
    const p = Math.max(1, page || 1);
    if (!kw || kw.trim() === "") {
      return this.popular(p);
    }

    const path =
      p > 1
        ? `/page/${p}/?s=${encodeURIComponent(kw.trim())}`
        : `/?s=${encodeURIComponent(kw.trim())}`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : (res && res.body) || "";
    return this._parseGrid(html);
  }

  _parseGrid(html) {
    const results = [];
    const seenUrls = new Set();
    if (!html || typeof html !== "string") return results;

    // Split page into individual anime card blocks for reliable parsing
    const rawBlocks = html.split(/<div class=['"][^'"]*anime-card-themex[^'"]*['"]/i);
    const cardBlocks = rawBlocks.length > 1 ? rawBlocks.slice(1) : [];

    for (const block of cardBlocks) {
      // Extract anime URL
      const animeLinkMatch = block.match(/href=['"]([^'"]*\/anime\/[^'"]*)['"]/i);
      const anyLinkMatch = block.match(/href=['"]([^'"]+)['"]/i);
      const url = animeLinkMatch ? animeLinkMatch[1] : (anyLinkMatch ? anyLinkMatch[1] : "");
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);

      // Extract title
      const titleMatch =
        block.match(/class=['"][^'"]*anime-card-title[^'"]*['"][^>]*title=['"]([^'"]+)['"]/i) ||
        block.match(/<div class=['"][^'"]*anime-card-title[^'"]*['"][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/class=['"]overlay['"][^>]*aria-label=['"]([^'"]+)['"]/i);

      let title = "";
      if (titleMatch) {
        title = this._cleanText(titleMatch[1]);
      }

      // Extract poster image
      const imgMatch =
        block.match(/data-image=['"]([^'"]+)['"]/i) ||
        block.match(/data-src=['"]([^'"]+)['"]/i) ||
        block.match(/src=['"]([^'"]+)['"]/i);
      const cover = imgMatch ? imgMatch[1] : "";

      // Extract type (TV, Movie, ONA, etc.)
      const typeMatch = block.match(/class=['"][^'"]*anime-card-type[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i);
      const type = typeMatch ? this._cleanText(typeMatch[1]) : "TV";

      // Extract short synopsis
      const descMatch = block.match(/data-content=['"]([^'"]+)['"]/i);
      const desc = descMatch ? this._cleanText(descMatch[1]) : "";

      if (title) {
        results.push({
          title,
          url,
          cover,
          extra: {
            type,
            description: desc,
          },
        });
      }
    }

    return results;
  }

  // 4. Anime Details & Episodes
  async detail(url) {
    let fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;

    // If episode URL was passed, fetch it first to locate the parent anime page
    if (fullUrl.includes("/episode/")) {
      const epRes = await this.req(fullUrl);
      const epHtml = typeof epRes === "string" ? epRes : (epRes && epRes.body) || "";
      const animeLink = epHtml.match(/href=['"]([^'"]*\/anime\/[^'"]*)['"]/i);
      if (animeLink) {
        fullUrl = animeLink[1];
      }
    }

    const res = await this.req(fullUrl);
    const html = typeof res === "string" ? res : (res && res.body) || "";

    const titleMatch =
      html.match(/<h1[^>]*class=['"][^'"]*anime-details-title[^'"]*['"][^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? this._cleanText(titleMatch[1]) : "Anime";

    const coverMatch =
      html.match(/class=['"][^'"]*anime-details-poster[^'"]*['"][\s\S]*?src=['"]([^'"]+)['"]/i) ||
      html.match(/class=['"][^'"]*img-responsive[^'"]*['"][\s\S]*?src=['"]([^'"]+)['"]/i);
    const cover = coverMatch ? coverMatch[1] : "";

    const descMatch =
      html.match(/class=['"][^'"]*anime-story[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/class=['"][^'"]*anime-details-story[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/class=['"][^'"]*story[^'"]*['"][^>]*>([\s\S]*?)<\/p>/i);
    const desc = descMatch ? this._cleanText(descMatch[1]) : "";

    const genres = [];
    const genreRegex = /href=['"][^'"]*\/(?:anime-genre|genre)\/[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi;
    let gMatch;
    while ((gMatch = genreRegex.exec(html)) !== null) {
      const g = this._cleanText(gMatch[1]);
      if (g && !genres.includes(g)) genres.push(g);
    }

    let status = 1; // Completed by default
    if (html.includes("حالة الأنمي:") && html.includes("مستمر")) {
      status = 0; // Ongoing
    }

    // Extract episodes list
    const episodes = [];
    const seenEpUrls = new Set();
    const epRegex = /<div class=['"]ep_num['"][\s\S]*?<a href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
    let epMatch;

    while ((epMatch = epRegex.exec(html)) !== null) {
      const epUrl = epMatch[1];
      if (seenEpUrls.has(epUrl)) continue;
      seenEpUrls.add(epUrl);

      const epName = this._cleanText(epMatch[2]);
      const epNum = this._extractEpNum(epName) || this._extractEpNum(epUrl);

      episodes.push({
        num: epNum,
        name: epName || `الحلقة ${epNum}`,
        url: epUrl,
      });
    }

    // Fallback if .ep_num is not found
    if (episodes.length === 0) {
      const fallbackRegex = /<a[^>]*href=['"]([^'"]*\/episode\/[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi;
      let fbMatch;
      while ((fbMatch = fallbackRegex.exec(html)) !== null) {
        const epUrl = fbMatch[1];
        if (seenEpUrls.has(epUrl) || epUrl.endsWith("/episode/") || epUrl.endsWith("/episode")) continue;
        seenEpUrls.add(epUrl);

        const epName = this._cleanText(fbMatch[2]);
        if (!epName || epName.includes("المزيد")) continue;

        const epNum = this._extractEpNum(epName) || this._extractEpNum(epUrl);
        episodes.push({
          num: epNum,
          name: epName || `الحلقة ${epNum}`,
          url: epUrl,
        });
      }
    }

    // Sort episodes ascending (1, 2, 3...)
    episodes.sort((a, b) => a.num - b.num);

    return {
      title,
      cover,
      desc,
      status,
      genres,
      episodes: [
        {
          title: "الحلقات",
          urls: episodes.map((e) => ({
            name: e.name,
            url: e.url,
          })),
        },
      ],
    };
  }

  _extractEpNum(str) {
    if (!str) return 1;
    const arMatch = str.match(/(?:الحلقة|الحلقه|الأونا|الأوفا|الخاصة|الفلم|الفيلم)\s*(\d+(?:\.\d+)?)/i);
    if (arMatch) return parseFloat(arMatch[1]);
    const dec = decodeURIComponent(str);
    const decMatch = dec.match(/(?:الحلقة|الحلقه|الأونا|الأوفا|الخاصة|الفلم|الفيلم)[-_ ]*(\d+(?:\.\d+)?)/i);
    if (decMatch) return parseFloat(decMatch[1]);
    const numMatch = str.match(/\b(\d+(?:\.\d+)?)\b/);
    if (numMatch) return parseFloat(numMatch[1]);
    return 1;
  }

  // 5. Episode Streams & Direct Playable Sources
  async watch(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const res = await this.req(fullUrl);
    const html = typeof res === "string" ? res : (res && res.body) || "";

    const resolvedSources = [];
    const subtitles = [];
    const seenUrls = new Set();

    const addSource = (src) => {
      if (!src || !src.url || seenUrls.has(src.url)) return;
      seenUrls.add(src.url);
      resolvedSources.push(src);
    };

    // A. Parse Download Mirror Table (direct MP4 endpoints like Pixeldrain and Mp4upload)
    const dlTableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = dlTableRegex.exec(html)) !== null) {
      const row = trMatch[1];
      const linkMatch = row.match(/href=['"]([^'"]+)['"]/i);
      if (!linkMatch) continue;
      const dlLink = linkMatch[1];

      // Extract server and quality columns
      const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
        this._cleanText(m[1])
      );
      const qualRaw = tdMatches[2] || "Auto";
      const quality = this._normalizeQuality(qualRaw);

      // Pixeldrain Direct MP4 high-speed streaming
      if (dlLink.includes("pixeldrain.com/u/")) {
        const pdId = dlLink.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i);
        if (pdId) {
          addSource({
            server: `Pixeldrain Direct (${quality})`,
            url: `https://pixeldrain.com/api/file/${pdId[1]}`,
            type: "mp4",
            quality,
            headers: { Referer: "https://pixeldrain.com/" },
          });
          continue;
        }
      }
    }

    // B. Parse Episode Watch Servers
    const serverRegex = /<li[^>]*data-watch=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/li>/gi;
    let srvMatch;
    const watchServers = [];

    while ((srvMatch = serverRegex.exec(html)) !== null) {
      const sUrl = srvMatch[1];
      const sName = this._cleanText(srvMatch[2]);
      watchServers.push({ url: sUrl, name: sName });
    }

    // Fallback if data-watch is missing
    if (watchServers.length === 0) {
      const fbSrvRegex = /<li[^>]*data-(?:src|url)=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/li>/gi;
      let fbMatch;
      while ((fbMatch = fbSrvRegex.exec(html)) !== null) {
        watchServers.push({
          url: fbMatch[1],
          name: this._cleanText(fbMatch[2]),
        });
      }
    }

    for (const srv of watchServers) {
      const sUrl = srv.url;

      // 1. Direct VnxPlayer HLS servers (anime4up1, anime4up2, 4q. shop)
      if (sUrl.includes("4q.") || sUrl.includes("/mal/") || sUrl.includes("Anime4up-S")) {
        const vnxRes = await this._extractVnxPlayerStreams(sUrl, fullUrl, srv.name);
        for (const s of vnxRes.sources) addSource(s);
        for (const sub of vnxRes.subtitles) {
          if (!subtitles.some((x) => x.url === sub.url)) subtitles.push(sub);
        }
        continue;
      }

      // 2. Megamax / Share4max multi-quality multi-mirror player
      if (sUrl.includes("share4max.com/iframe/") || sUrl.includes("megamax.me/")) {
        const s4mStreams = await this._extractShare4maxStreams(sUrl);
        for (const s of s4mStreams) addSource(s);
        continue;
      }

      // 3. Mp4upload embed
      if (sUrl.includes("mp4upload.com/embed-")) {
        try {
          const mpRes = await this.req(sUrl, { headers: { Referer: fullUrl } });
          const mpHtml = typeof mpRes === "string" ? mpRes : (mpRes && mpRes.body) || "";
          const mpMatch =
            mpHtml.match(/player\.src\(\s*\{\s*src:\s*["']([^"']+)["']/i) ||
            mpHtml.match(/src:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
          if (mpMatch) {
            addSource({
              server: `${srv.name || "Mp4upload"} (Direct MP4)`,
              url: mpMatch[1],
              type: "mp4",
              quality: "FHD",
              headers: { Referer: sUrl },
            });
            continue;
          }
        } catch {}
      }

      // 4. Videa player with RC4 decryption
      if (sUrl.includes("videa.hu/player")) {
        const viStreams = await this._extractVidea(sUrl);
        for (const s of viStreams) addSource(s);
        continue;
      }

      // 5. Standalone Watch Servers (if direct media stream)
      let qual = "Auto";
      if (srv.name.includes("FHD") || srv.name.includes("1080")) qual = "FHD";
      else if (srv.name.includes("HD") || srv.name.includes("720")) qual = "HD";
      else if (srv.name.includes("SD") || srv.name.includes("480")) qual = "SD";

      if (sUrl.includes(".mp4") || sUrl.includes(".m3u8")) {
        addSource({
          server: srv.name || "Watch Server",
          url: sUrl,
          type: sUrl.includes(".m3u8") ? "hls" : "mp4",
          quality: qual,
          headers: { Referer: this.baseUrl },
        });
      }
    }

    // Sort sources: direct MP4s & HLS first, highest qualities first
    const qualWeights = { FHD: 3, HD: 2, SD: 1, Auto: 0 };
    resolvedSources.sort((a, b) => {
      const aDirect =
        a.url.includes("k1c6x8p.shop") ||
        a.url.includes("tnmr.org") ||
        a.url.includes("mp4upload.com") ||
        a.url.includes("pixeldrain.com/api/file") ||
        a.url.includes(".m3u8") ||
        a.url.includes(".mp4");
      const bDirect =
        b.url.includes("k1c6x8p.shop") ||
        b.url.includes("tnmr.org") ||
        b.url.includes("mp4upload.com") ||
        b.url.includes("pixeldrain.com/api/file") ||
        b.url.includes(".m3u8") ||
        b.url.includes(".mp4");
      if (aDirect && !bDirect) return -1;
      if (!aDirect && bDirect) return 1;
      const wa = qualWeights[a.quality] || 0;
      const wb = qualWeights[b.quality] || 0;
      return wb - wa;
    });

    return {
      sources: resolvedSources,
      subtitles,
    };
  }

  async _extractVnxPlayerStreams(serverUrl, episodeUrl, serverName) {
    const sources = [];
    const subtitles = [];
    try {
      const res = await this.req(serverUrl, { headers: { Referer: episodeUrl } });
      const html = typeof res === "string" ? res : (res && res.body) || "";

      // Extract direct HLS master playlist URL
      const streamMatch = html.match(/let\s+streamUrl\s*=\s*["']([^"']+)["']/i);
      if (streamMatch) {
        sources.push({
          server: `${serverName || "Anime4up"} (Direct HLS)`,
          url: streamMatch[1],
          type: "hls",
          quality: "FHD",
          headers: { Referer: serverUrl },
        });
      }

      // Extract Arabic subtitle track
      const tracksMatch = html.match(/const\s+tracks\s*=\s*(\[[\s\S]*?\]);/i);
      if (tracksMatch) {
        try {
          const parsed = JSON.parse(tracksMatch[1]);
          for (const t of parsed) {
            if (t.file) {
              subtitles.push({
                url: t.file,
                lang: t.label || "Arabic",
                default: !!t.default,
              });
            }
          }
        } catch {}
      }
    } catch {}
    return { sources, subtitles };
  }

  async _extractShare4maxStreams(iframeUrl) {
    const list = [];
    try {
      const res = await this.req(iframeUrl, {
        headers: { Referer: this.baseUrl },
      });
      const html = typeof res === "string" ? res : (res && res.body) || "";

      let version = null;
      const jsonScriptMatch =
        html.match(/<script[^>]*id=['"]app['"][^>]*type=['"]application\/json['"][^>]*>([\s\S]*?)<\/script>/i) ||
        html.match(/<script[^>]*data-page=['"]app['"][^>]*type=['"]application\/json['"][^>]*>([\s\S]*?)<\/script>/i);

      if (jsonScriptMatch) {
        try {
          const parsed = JSON.parse(jsonScriptMatch[1]);
          version = parsed.version;
        } catch {}
      }

      if (!version) {
        const pageMatch = html.match(/data-page=['"]([^'"]+)['"]/i);
        if (pageMatch) {
          try {
            const raw = pageMatch[1].replace(/&quot;/g, '"');
            const parsed = JSON.parse(raw);
            version = parsed.version;
          } catch {}
        }
      }

      if (!version) return list;

      const partialRes = await this.req(iframeUrl, {
        headers: {
          Referer: iframeUrl,
          "X-Inertia": "true",
          "X-Inertia-Version": version,
          "X-Inertia-Partial-Component": "files/mirror/video",
          "X-Inertia-Partial-Data": "streams",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "text/html, application/xhtml+xml",
        },
      });

      // Handle both pre-parsed JSON Object and raw JSON string
      let parsed = null;
      if (partialRes && typeof partialRes === "object") {
        if (partialRes.body && typeof partialRes.body === "string") {
          try {
            parsed = JSON.parse(partialRes.body);
          } catch {}
        } else if (partialRes.props) {
          parsed = partialRes;
        }
      } else if (typeof partialRes === "string") {
        try {
          parsed = JSON.parse(partialRes);
        } catch {}
      }

      const streamsData =
        (parsed && parsed.props && parsed.props.streams && parsed.props.streams.data) || [];

      for (const item of streamsData) {
        const qual = this._normalizeQuality(item.label || item.resolution || "Auto");
        const mirrors = item.mirrors || [];

        for (const m of mirrors) {
          let link = m.link || "";
          if (link.startsWith("//")) link = `https:${link}`;
          if (!link.startsWith("http")) continue;

          const driver = (m.driver || m.symbol || "Mirror").toLowerCase();
          const driverTitle = driver.charAt(0).toUpperCase() + driver.slice(1);

          // Try resolving direct video stream from mirror
          let directStream = null;
          try {
            if (driver === "lulustream" || link.includes("lulustream.com")) {
              const lRes = await this.req(link, { headers: { Referer: iframeUrl } });
              const lHtml = typeof lRes === "string" ? lRes : (lRes && lRes.body) || "";
              const unp = this._unpackJs(lHtml) + " " + lHtml;
              const m3u8Match = unp.match(/["'](https?:[^"']+\.m3u8[^"']*)["']/);
              if (m3u8Match) {
                directStream = { url: m3u8Match[1], type: "hls" };
              }
            } else if (driver === "mp4upload" || link.includes("mp4upload.com")) {
              const mpRes = await this.req(link, { headers: { Referer: iframeUrl } });
              const mpHtml = typeof mpRes === "string" ? mpRes : (mpRes && mpRes.body) || "";
              const mpMatch =
                mpHtml.match(/player\.src\(\s*\{\s*src:\s*["']([^"']+)["']/i) ||
                mpHtml.match(/src:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
              if (mpMatch) {
                directStream = { url: mpMatch[1], type: "mp4" };
              }
            } else if (driver === "krakenfiles" || link.includes("krakenfiles.com")) {
              const kRes = await this.req(link, { headers: { Referer: iframeUrl } });
              const kHtml = typeof kRes === "string" ? kRes : (kRes && kRes.body) || "";
              const kMatch = kHtml.match(/<source\s+src=['"]([^'"]+)['"]/i);
              if (kMatch) {
                directStream = { url: kMatch[1], type: "mp4" };
              }
            } else if (driver === "earnvids" || link.includes("morencius.com")) {
              const eRes = await this.req(link, { headers: { Referer: iframeUrl } });
              const eHtml = typeof eRes === "string" ? eRes : (eRes && eRes.body) || "";
              const unp = this._unpackJs(eHtml) + " " + eHtml;
              const m3u8Match = unp.match(/["'](https?:[^"']+\.m3u8[^"']*)["']/);
              if (m3u8Match) {
                directStream = { url: m3u8Match[1], type: "hls" };
              }
            }
          } catch {}

          if (directStream) {
            list.push({
              server: `Megamax - ${driverTitle} Direct`,
              url: directStream.url,
              type: directStream.type,
              quality: qual,
              headers: { Referer: link },
            });
            break; // Resolved a high-speed direct stream for this quality
          }
        }
      }
    } catch {}

    return list;
  }

  async _extractVidea(embedUrl) {
    try {
      const res = await this.req(embedUrl, {
        headers: { Referer: this.baseUrl },
      });
      const html = typeof res === "string" ? res : (res && res.body) || "";
      const xtMatch = html.match(/_xt\s*=\s*['"]([^'"]+)['"]/i);
      if (!xtMatch) return [];

      const nonce = xtMatch[1];
      const staticSecret =
        "xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p";
      const l = nonce.substring(0, 32);
      const s = nonce.substring(32);
      let result = "";
      for (let i = 0; i < 32; i++) {
        result += s[i - (staticSecret.indexOf(l[i]) - 31)];
      }

      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let randomSeed = "";
      for (let i = 0; i < 8; i++) {
        randomSeed += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const vMatch = embedUrl.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      const videoId = vMatch ? vMatch[1] : "";
      if (!videoId) return [];

      const xmlUrl = `https://videa.hu/player/xml?v=${videoId}&_s=${randomSeed}&_t=${result.substring(0, 16)}`;
      const xmlResp = await this.req(xmlUrl, {
        fullResponse: true,
        headers: { Referer: embedUrl },
      });

      let b64 = "";
      let xs = "";
      if (xmlResp && typeof xmlResp === "object") {
        b64 = xmlResp.body || "";
        const h = xmlResp.headers || {};
        xs = h["x-videa-xs"] || h["X-Videa-Xs"] || "";
      } else if (typeof xmlResp === "string") {
        try {
          const parsed = JSON.parse(xmlResp);
          b64 = parsed.body || xmlResp;
          const h = parsed.headers || {};
          xs = h["x-videa-xs"] || h["X-Videa-Xs"] || "";
        } catch {
          b64 = xmlResp;
        }
      }

      const key = result.substring(16) + randomSeed + xs;
      const xml = this._rc4Decrypt(b64, key);
      if (!xml) return [];

      const sources = [];
      const smRegex =
        /<video_source\s+[^>]*name=['"]([^'"]+)['"][^>]*exp=['"]([^'"]*)['"][^>]*>(.*?)<\/video_source>/gis;
      let match;
      while ((match = smRegex.exec(xml)) !== null) {
        sources.push({ name: match[1], exp: match[2], url: match[3].trim() });
      }

      const hashMatches = {};
      const hmRegex = /<hash_value_([a-zA-Z0-9]+)>([^<]+)<\/hash_value_/gi;
      let hMatch;
      while ((hMatch = hmRegex.exec(xml)) !== null) {
        hashMatches[hMatch[1]] = hMatch[2];
      }

      const streams = [];
      for (const sc of sources) {
        let u = sc.url;
        if (u.startsWith("//")) u = "https:" + u;
        const hv = hashMatches[sc.name];
        if (hv) {
          u += (u.includes("?") ? "&" : "?") + `md5=${hv}&expires=${sc.exp}`;
        }
        streams.push({
          server: `Videa Direct (${sc.name})`,
          quality: this._normalizeQuality(sc.name),
          url: u,
          type: u.includes(".m3u8") ? "hls" : "mp4",
          headers: { Referer: "https://videa.hu/" },
        });
      }
      return streams;
    } catch {
      return [];
    }
  }

  _rc4Decrypt(b64Data, key) {
    try {
      const raw = atob(b64Data.trim());
      const s = [];
      for (let i = 0; i < raw.length; i++) s.push(raw.charCodeAt(i));
      const k = [];
      for (let i = 0; i < key.length; i++) k.push(key.charCodeAt(i));

      const S = [];
      for (let i = 0; i < 256; i++) S[i] = i;
      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (j + S[i] + k[i % k.length]) % 256;
        const tmp = S[i];
        S[i] = S[j];
        S[j] = tmp;
      }

      let i = 0,
        j2 = 0;
      const res = [];
      for (let y = 0; y < s.length; y++) {
        i = (i + 1) % 256;
        j2 = (j2 + S[i]) % 256;
        const tmp = S[i];
        S[i] = S[j2];
        S[j2] = tmp;
        res.push(String.fromCharCode(s[y] ^ S[(S[i] + S[j2]) % 256]));
      }
      return res.join("");
    } catch {
      return "";
    }
  }

  _unpackJs(source) {
    if (!source || typeof source !== "string") return "";
    const packerRegex =
      /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]*?\}\(([\s\S]*?)\.split\(['"]\|['"]\)\)\)/g;
    let match;
    let result = source;

    while ((match = packerRegex.exec(source)) !== null) {
      try {
        const rawArgs = match[1];
        const lastComma = rawArgs.lastIndexOf(",'");
        if (lastComma === -1) continue;
        const pPart = rawArgs.substring(0, lastComma);
        const kPart = rawArgs.substring(lastComma + 2);
        const matchP = pPart.match(/^'([\s\S]*)',\s*(\d+),\s*(\d+)/);
        if (!matchP) continue;
        let payload = matchP[1];
        const a = parseInt(matchP[2], 10);
        let c = parseInt(matchP[3], 10);
        const k = kPart.split("|");

        while (c--) {
          if (k[c]) {
            payload = payload.replace(new RegExp(`\\b${c.toString(a)}\\b`, "g"), k[c]);
          }
        }
        result += "\n" + payload;
      } catch {}
    }
    return result;
  }
}
