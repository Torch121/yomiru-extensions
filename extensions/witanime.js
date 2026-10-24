// ==YomiruExtension==
// @name         WitAnime
// @version      v1.0.0
// @author       Yomiru
// @lang         ar
// @license      MIT
// @icon         https://witanime.site/favicon.ico
// @package      site.witanime
// @type         bangumi
// @webSite      https://witanime.site
// @nsfw         false
// @description  مشاهدة وتحميل مسلسلات وأفلام الأنمي المترجمة أون لاين بجودات متعددة عبر WitAnime
// ==/YomiruExtension==

export default class extends Extension {
  get baseUrl() {
    return "https://witanime.site";
  }

  async req(url, options = {}) {
    const rawUrl = url.startsWith("http") ? url : `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
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

  _extractEpNum(str) {
    if (!str) return 1;
    const arMatch = str.match(/(?:الحلقة|الحلقه|الأونا|الأوفا|الخاصة|الفلم|الفيلم)\s*(\d+(?:\.\d+)?)/i);
    if (arMatch) return parseFloat(arMatch[1]);
    const dec = decodeURIComponent(str);
    const decMatch = dec.match(/(?:الحلقة|الحلقه|الأونا|الأوفا|الخاصة|الفلم|الفيلم)[-_ ]*(\d+(?:\.\d+)?)/i);
    if (decMatch) return parseFloat(decMatch[1]);
    const slashMatch = dec.match(/\/(\d+)(?:\/|$)/);
    if (slashMatch) return parseFloat(slashMatch[1]);
    const numMatch = str.match(/\b(\d+(?:\.\d+)?)\b/);
    if (numMatch) return parseFloat(numMatch[1]);
    return 1;
  }

  // 1. Popular Anime Catalog
  async popular(page) {
    const p = Math.max(1, page || 1);
    const path = p > 1 ? `/browse?page=${p}` : `/browse`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : (res && res.body) || "";
    return this._parseGrid(html);
  }

  // 2. Latest Updates
  async latest(page) {
    const p = Math.max(1, page || 1);
    const path = p > 1 ? `/?page=${p}` : `/`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : (res && res.body) || "";
    return this._parseGrid(html);
  }

  // 3. Search Anime
  async search(kw, page) {
    const p = Math.max(1, page || 1);
    let term = "";

    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      term = en || jp || "";
    } else {
      term = String(kw || "").trim();
    }

    if (!term) {
      return this.popular(p);
    }

    const path = p > 1 ? `/search?q=${encodeURIComponent(term)}&page=${p}` : `/search?q=${encodeURIComponent(term)}`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : (res && res.body) || "";
    return this._parseGrid(html);
  }

  _parseGrid(html) {
    const results = [];
    const seenUrls = new Set();
    if (!html || typeof html !== "string") return results;

    const linkRegex = /<a[^>]*href=['"]([^'"]*\/anime\/[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (seenUrls.has(url) || url.endsWith("/anime/") || url.endsWith("/anime")) continue;
      seenUrls.add(url);

      const block = match[2];
      const imgMatch =
        block.match(/src=['"]([^'"]+)['"]/i) ||
        block.match(/data-src=['"]([^'"]+)['"]/i) ||
        block.match(/data-image=['"]([^'"]+)['"]/i);
      const cover = imgMatch ? imgMatch[1] : "";

      let title = "";
      const altMatch = block.match(/alt=['"]([^'"]+)['"]/i);
      if (altMatch) {
        title = this._cleanText(altMatch[1]);
      } else {
        const text = this._cleanText(block);
        title = text.replace(/^(?:TV|Movie|Special|ONA|OVA)\s*/i, "").replace(/\b(19\d\d|20\d\d)\b.*$/, "").trim();
      }

      const fullBlockText = this._cleanText(block);
      let type = "TV";
      if (/Special|خاصة/i.test(fullBlockText)) type = "Special";
      else if (/Movie|فيلم|فلم/i.test(fullBlockText)) type = "Movie";
      else if (/ONA|أونا/i.test(fullBlockText)) type = "ONA";
      else if (/OVA|أوفا/i.test(fullBlockText)) type = "OVA";

      if (title) {
        results.push({
          title,
          url,
          cover,
          extra: {
            type,
          },
        });
      }
    }

    return results;
  }

  // 4. Anime Details & Episodes
  async detail(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    const res = await this.req(fullUrl);
    const html = typeof res === "string" ? res : (res && res.body) || "";

    let title = "";
    let desc = "";
    let cover = "";
    let genres = [];
    let status = 1; // Completed by default

    // Parse Schema.org LD+JSON
    const ldRegex = /<script[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(html)) !== null) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        if (ld && (ld["@type"] === "TVSeries" || ld["@type"] === "Movie")) {
          title = ld.name || title;
          desc = ld.description || desc;
          cover = ld.image || cover;
          if (Array.isArray(ld.genre)) genres = ld.genre;
        }
      } catch (_) {}
    }

    if (!title) {
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      title = h1Match ? this._cleanText(h1Match[1]).replace(/جميع حلقات انمي|مترجمة اون لاين|— WitAnime/gi, "").trim() : "Anime";
    }

    if (!desc) {
      const descMatch =
        html.match(/<meta[^>]*property=['"]og:description['"][^>]*content=['"]([^'"]+)['"]/i) ||
        html.match(/<meta[^>]*name=['"]description['"][^>]*content=['"]([^'"]+)['"]/i);
      desc = descMatch ? this._cleanText(descMatch[1]) : "";
    }

    if (!cover) {
      const ogImgMatch = html.match(/<meta[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i);
      cover = ogImgMatch ? ogImgMatch[1] : "";
    }

    if (html.includes("حالة الأنمي:") && html.includes("مستمر")) {
      status = 0; // Ongoing
    }

    // Extract episodes list
    const episodes = [];
    const seenEpNums = new Set();
    const epRegex = /<a[^>]*href=['"]([^'"]*\/watch\/[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi;
    let epMatch;

    while ((epMatch = epRegex.exec(html)) !== null) {
      const epUrl = epMatch[1];
      if (epUrl.endsWith("/watch") || epUrl.endsWith("/watch/")) continue;

      const epText = this._cleanText(epMatch[2]);
      if (epText === "شاهد الآن") continue;

      const epNum = this._extractEpNum(epText) || this._extractEpNum(epUrl);
      if (seenEpNums.has(epNum)) continue;
      seenEpNums.add(epNum);

      episodes.push({
        num: epNum,
        name: epText && epText !== String(epNum) ? epText : `الحلقة ${epNum}`,
        url: epUrl,
      });
    }

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

  // 5. Episode Streams & Sources
  async watch(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
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

    // Extract CSRF token
    const csrfMatch = html.match(/<meta[^>]*name=['"]csrf-token['"][^>]*content=['"]([^'"]+)['"]/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : "";

    // Extract sourcesUrl from watchPlayer
    const mSources = html.match(/sourcesUrl:\s*['"]([^'"]+)['"]/i);
    let sourcesUrl = mSources ? mSources[1].replace(/\\\//g, "/") : null;
    if (!sourcesUrl) {
      const mSlug = fullUrl.match(/\/watch\/([^/]+)\/(\d+)/);
      if (mSlug) {
        sourcesUrl = `/watch/${mSlug[1]}/${mSlug[2]}/sources`;
      }
    }

    if (sourcesUrl) {
      try {
        const manifestFullUrl = sourcesUrl.startsWith("http") ? sourcesUrl : `${this.baseUrl}${sourcesUrl.startsWith("/") ? "" : "/"}${sourcesUrl}`;
        const sRes = await this.request(manifestFullUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "X-CSRF-TOKEN": csrfToken,
            Referer: fullUrl,
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        let manifest = null;
        if (typeof sRes === "object" && sRes !== null && sRes.players) {
          manifest = sRes;
        } else if (typeof sRes === "string") {
          try {
            manifest = JSON.parse(sRes);
          } catch (_) {}
        } else if (sRes && sRes.body) {
          try {
            manifest = JSON.parse(sRes.body);
          } catch (_) {}
        }

        if (manifest && manifest.players) {
          const players = manifest.players;
          for (const [qualKey, serverList] of Object.entries(players)) {
            if (!Array.isArray(serverList)) continue;
            for (const srv of serverList) {
              const token = srv.token;
              const label = srv.label || `Server (${qualKey})`;
              const embedUrl = `https://witanime.site/watch/stream-gate/${token}`;

              if (label.toLowerCase().includes("videa") && !label.toLowerCase().includes("videas")) {
                const viStreams = await this._extractVidea(embedUrl);
                for (const s of viStreams) addSource(s);
              } else if (label.toLowerCase().includes("videas")) {
                const vsStreams = await this._extractVideas(embedUrl);
                for (const s of vsStreams) addSource(s);
              } else {
                addSource({
                  server: `${label} (${qualKey})`,
                  url: embedUrl,
                  type: "hls",
                  quality: this._normalizeQuality(qualKey),
                  headers: { Referer: "https://witanime.site/" },
                });
              }
            }
          }
        }
      } catch (_) {}
    }

    // Fallback: check DOM iframes
    const iframeRegex = /<iframe[^>]*src=['"]([^'"]+)['"][^>]*>/gi;
    let ifMatch;
    while ((ifMatch = iframeRegex.exec(html)) !== null) {
      const src = ifMatch[1];
      if (src.includes("google") || src.includes("analytics")) continue;

      if (src.includes("videa.hu")) {
        const viStreams = await this._extractVidea(src);
        for (const s of viStreams) addSource(s);
      } else if (src.includes("videas.fr")) {
        const vsStreams = await this._extractVideas(src);
        for (const s of vsStreams) addSource(s);
      } else {
        addSource({
          server: "Embedded Player",
          url: src,
          type: src.includes(".m3u8") ? "hls" : "mp4",
          quality: "Auto",
          headers: { Referer: "https://witanime.site/" },
        });
      }
    }

    return {
      sources: resolvedSources,
      subtitles,
    };
  }

  // Dedicated Videa (videa.hu) Extractor
  async _extractVidea(embedUrl) {
    const streams = [];
    try {
      const htmlRes = await this.req(embedUrl, {
        headers: { Referer: "https://witanime.site/" },
      });
      const html = typeof htmlRes === "string" ? htmlRes : (htmlRes && htmlRes.body) || "";

      const xtMatch = html.match(/_xt\s*=\s*['"]([^'"]+)['"]/i);
      if (!xtMatch) return streams;

      const nonce = xtMatch[1];
      const staticSecret = "xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p";
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

      const vMatch = embedUrl.match(/[?&]v=([a-zA-Z0-9_-]+)/) || embedUrl.match(/\/player\/v\/([a-zA-Z0-9_-]+)/);
      const videoId = vMatch ? vMatch[1] : "";
      if (!videoId) return streams;

      const xmlUrl = `https://videa.hu/player/xml?v=${videoId}&_s=${randomSeed}&_t=${result.substring(0, 16)}`;
      const xmlResp = await this.req(xmlUrl, {
        headers: { Referer: embedUrl },
      });

      const content = typeof xmlResp === "string" ? xmlResp : (xmlResp && xmlResp.body) || "";
      let xml = content;
      if (!xml.startsWith("<?xml")) {
        let xs = "";
        if (xmlResp && xmlResp.headers) {
          xs = xmlResp.headers["x-videa-xs"] || xmlResp.headers["X-Videa-Xs"] || "";
        }
        const key = result.substring(16) + randomSeed + xs;
        xml = this._rc4Decrypt(content, key);
      }

      if (!xml) return streams;

      const smRegex = /<video_source\s+[^>]*name=['"]([^'"]+)['"][^>]*exp=['"]([^'"]*)['"][^>]*>(.*?)<\/video_source>/gis;
      let match;
      const sources = [];
      while ((match = smRegex.exec(xml)) !== null) {
        sources.push({ name: match[1], exp: match[2], url: match[3].trim() });
      }

      const hashMatches = {};
      const hmRegex = /<hash_value_([a-zA-Z0-9]+)>([^<]+)<\/hash_value_/gi;
      let hMatch;
      while ((hMatch = hmRegex.exec(xml)) !== null) {
        hashMatches[hMatch[1]] = hMatch[2];
      }

      for (const sc of sources) {
        let u = sc.url;
        if (u.startsWith("//")) u = `https:${u}`;
        const hv = hashMatches[sc.name];
        if (hv) {
          u += (u.includes("?") ? "&" : "?") + `md5=${hv}&expires=${sc.exp}`;
        }

        const qual = this._normalizeQuality(sc.name);
        streams.push({
          server: `Videa Direct (${qual})`,
          quality: qual,
          url: u,
          type: u.includes(".m3u8") ? "hls" : "mp4",
          headers: { Referer: "https://videa.hu/" },
        });
      }
    } catch (_) {}

    return streams;
  }

  // Dedicated Videas (app.videas.fr) Extractor
  async _extractVideas(embedUrl) {
    const streams = [];
    try {
      const idMatch = embedUrl.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (!idMatch) return streams;
      const embedId = idMatch[1];

      const visitorUrl = `https://app.videas.fr/api/visitor/embed/${embedId}/`;
      const visRes = await this.req(visitorUrl, {
        headers: { Accept: "application/json" },
      });

      let visData = null;
      if (typeof visRes === "object" && visRes !== null && visRes.playback_token) {
        visData = visRes;
      } else {
        const text = typeof visRes === "string" ? visRes : (visRes && visRes.body) || "";
        try {
          visData = JSON.parse(text);
        } catch (_) {}
      }

      if (!visData || !visData.playback_token) return streams;

      const playbackToken = visData.playback_token;
      const assetId = visData.items?.[0]?.asset?.uid;
      const sessionId = visData.session_id;

      if (!assetId) return streams;

      const pbUrl = "https://app.videas.fr/api/visitor/playback/info/";
      const pbRes = await this.req(pbUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          asset_id: assetId,
          playback_token: playbackToken,
          session_id: sessionId,
        }),
      });

      let pbData = null;
      if (typeof pbRes === "object" && pbRes !== null && pbRes.hls_url) {
        pbData = pbRes;
      } else {
        const pbText = typeof pbRes === "string" ? pbRes : (pbRes && pbRes.body) || "";
        try {
          pbData = JSON.parse(pbText);
        } catch (_) {}
      }

      let hlsUrl = pbData?.hls_url?.url;
      if (!hlsUrl) return streams;

      if (hlsUrl.startsWith("/")) {
        hlsUrl = `https://app.videas.fr${hlsUrl}`;
      }

      // Fetch master manifest to parse variants
      try {
        const mRes = await this.req(hlsUrl, {
          headers: { Referer: "https://app.videas.fr/" },
        });
        const mText = typeof mRes === "string" ? mRes : (mRes && mRes.body) || "";

        const lines = mText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        let currentStreamInf = null;
        let foundVariants = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith("#EXT-X-STREAM-INF:")) {
            currentStreamInf = line;
          } else if (!line.startsWith("#") && currentStreamInf) {
            let vUrl = line;
            if (!vUrl.startsWith("http")) {
              vUrl = new URL(vUrl, hlsUrl).href;
            }
            const resMatch = currentStreamInf.match(/RESOLUTION=(\d+)x(\d+)/i);
            const qual = resMatch ? this._normalizeQuality(`${resMatch[2]}p`) : "Auto";
            streams.push({
              server: `Videas HLS (${qual})`,
              quality: qual,
              url: vUrl,
              type: "hls",
              headers: { Referer: "https://app.videas.fr/" },
            });
            foundVariants = true;
            currentStreamInf = null;
          }
        }

        if (!foundVariants) {
          streams.push({
            server: "Videas Master HLS",
            quality: "Auto",
            url: hlsUrl,
            type: "hls",
            headers: { Referer: "https://app.videas.fr/" },
          });
        }
      } catch (_) {
        streams.push({
          server: "Videas Master HLS",
          quality: "Auto",
          url: hlsUrl,
          type: "hls",
          headers: { Referer: "https://app.videas.fr/" },
        });
      }
    } catch (_) {}

    return streams;
  }

  _rc4Decrypt(b64Data, key) {
    try {
      const binaryString = atob(String(b64Data || "").trim());
      const raw = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        raw[i] = binaryString.charCodeAt(i);
      }

      const S = new Uint8Array(256);
      for (let i = 0; i < 256; i++) S[i] = i;

      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (j + S[i] + key.charCodeAt(i % key.length)) % 256;
        const tmp = S[i];
        S[i] = S[j];
        S[j] = tmp;
      }

      let i = 0;
      let j2 = 0;
      const decrypted = new Uint8Array(raw.length);
      for (let y = 0; y < raw.length; y++) {
        i = (i + 1) % 256;
        j2 = (j2 + S[i]) % 256;
        const tmp = S[i];
        S[i] = S[j2];
        S[j2] = tmp;
        decrypted[y] = raw[y] ^ S[(S[i] + S[j2]) % 256];
      }

      let out = "";
      for (let y = 0; y < decrypted.length; y++) {
        out += String.fromCharCode(decrypted[y]);
      }
      return decodeURIComponent(escape(out));
    } catch (_) {
      return "";
    }
  }
}
