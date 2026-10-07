// ==YomiruExtension==
// @name         Animerco
// @version      v1.0.0
// @author       Yomiru
// @lang         ar
// @license      MIT
// @icon         https://det.animerco.org/wp-content/uploads/2024/03/favicon-16x16-1.png
// @package      org.animerco.det
// @type         bangumi
// @webSite      https://det.animerco.org
// @nsfw         false
// @description  مشاهدة وتحميل مسلسلات وأفلام الأنمي المترجمة أون لاين بجودة عالية عبر انمي ركو (Animerco)
// ==/YomiruExtension==

export default class extends Extension {
  get baseUrl() {
    return "https://det.animerco.org";
  }

  async req(url, options = {}) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    return this.request(fullUrl, {
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

  // 1. Popular Anime Catalog
  async popular(page) {
    const p = Math.max(1, page || 1);
    const path = p > 1 ? `/trending/page/${p}/` : `/trending/`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : (res && res.body) || "";
    return this._parseGrid(html);
  }

  // 2. Latest Updates
  async latest(page) {
    const p = Math.max(1, page || 1);
    const path = p > 1 ? `/episodes/page/${p}/` : `/episodes/`;
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

    const path = p > 1 ? `/page/${p}/?s=${encodeURIComponent(kw.trim())}` : `/?s=${encodeURIComponent(kw.trim())}`;
    const res = await this.req(path);
    const html = typeof res === "string" ? res : (res && res.body) || "";
    return this._parseGrid(html);
  }

  _parseGrid(html) {
    const results = [];
    const cardRegex = /<div class=['"](?:anime-card|search-card)['"][\s\S]*?<\/div>\s*<\/div>/g;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
      const block = match[0];
      const linkMatch = block.match(/href=['"]([^'"]+)['"]/);
      if (!linkMatch) continue;

      const url = linkMatch[1];
      const titleMatch =
        block.match(/<h3>([^<]+)<\/h3>/) ||
        block.match(/title=['"]([^'"]+)['"]/);
      const title = titleMatch ? titleMatch[1].trim() : "";

      const coverMatch =
        block.match(/data-src=['"]([^'"]+)['"]/) ||
        block.match(/src=['"]([^'"]+)['"]/);
      const cover = coverMatch ? coverMatch[1] : "";

      const yearMatch = block.match(/class=['"]anime-aired['"]>([^<]+)</);
      const year = yearMatch ? yearMatch[1].trim() : "";

      if (title && url) {
        results.push({
          title,
          url,
          cover,
          update: year,
        });
      }
    }

    return results;
  }

  // 4. Series Details & Episode List
  async detail(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const res = await this.req(fullUrl);
    const html = typeof res === "string" ? res : (res && res.body) || "";

    // Title
    let title = "";
    const titleMatch =
      html.match(/<div class=['"]media-title['"]>[\s\S]*?<h1>([^<]+)<\/h1>/) ||
      html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (titleMatch) title = titleMatch[1].trim();

    // Cover
    let cover = "";
    const coverMatch =
      html.match(/<aside class=['"]widget-sidebar[\s\S]*?data-src=['"]([^'"]+)['"]/) ||
      html.match(/<meta property=['"]og:image['"] content=['"]([^'"]+)['"]/);
    if (coverMatch) cover = coverMatch[1];

    // Description
    let desc = "";
    const descMatch =
      html.match(/<div class=['"]media-story[\s\S]*?<p>([\s\S]*?)<\/p>/) ||
      html.match(/<meta property=['"]og:description['"] content=['"]([^'"]+)['"]/);
    if (descMatch) {
      desc = descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    // Episodes
    const episodeList = [];

    // Is it a movie?
    if (fullUrl.includes("/movies/")) {
      episodeList.push({
        name: "فلم " + title,
        url: fullUrl,
      });
      return {
        title,
        cover,
        desc,
        episodes: [{ title: "الأفلام", urls: episodeList }],
      };
    }

    // Check for Seasons
    const seasonUrls = [];
    const seasonRegex = /href=['"](https:\/\/det\.animerco\.org\/seasons\/[^'"]+)['"]/g;
    let sMatch;
    while ((sMatch = seasonRegex.exec(html)) !== null) {
      if (!seasonUrls.includes(sMatch[1])) {
        seasonUrls.push(sMatch[1]);
      }
    }

    if (seasonUrls.length > 0) {
      for (const sUrl of seasonUrls) {
        try {
          const sRes = await this.req(sUrl);
          const sHtml = typeof sRes === "string" ? sRes : (sRes && sRes.body) || "";
          this._extractEpisodesFromHtml(sHtml, episodeList);
        } catch {}
      }
    } else {
      this._extractEpisodesFromHtml(html, episodeList);
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "الحلقات",
          urls: episodeList,
        },
      ],
    };
  }

  _extractEpisodesFromHtml(html, episodeList) {
    const epRegex = /<li[^>]*data-number=['"]([^'"]+)['"][\s\S]*?href=['"]([^'"]+)['"][\s\S]*?<h3>([^<]+)<\/h3>/g;
    let match;
    const seen = new Set();

    while ((match = epRegex.exec(html)) !== null) {
      const epNum = match[1];
      const epUrl = match[2];
      const epTitle = match[3].trim();

      if (!seen.has(epUrl)) {
        seen.add(epUrl);
        episodeList.push({
          name: epTitle || `الحلقة ${epNum}`,
          url: epUrl,
        });
      }
    }
  }

  // 5. Watch Stream Extraction
  async watch(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const res = await this.req(fullUrl);
    const html = typeof res === "string" ? res : (res && res.body) || "";

    // Extract fast player embed URL
    const optionRegex = /<a[^>]+class=['"][^'"]*option[^'"]*['"][^>]*data-embed-url=['"]([^'"]+)['"][^>]*data-embed-exp=['"](\d+)['"][^>]*>/g;
    let match;
    let targetEmbedUrl = "";

    const now = Math.floor(Date.now() / 1000);

    while ((match = optionRegex.exec(html)) !== null) {
      const embedUrl = match[1].replace(/&amp;/g, "&");
      const exp = parseInt(match[2], 10);
      if (embedUrl && (exp === 0 || now < exp - 10)) {
        targetEmbedUrl = embedUrl;
        break;
      }
    }

    // Fallback to admin-ajax.php player_ajax
    if (!targetEmbedUrl) {
      const postMatch = html.match(/data-post=['"](\d+)['"]/);
      const securityMatch = html.match(/data-nonce=['"]([a-zA-Z0-9]+)['"]/) || html.match(/"security":"([a-zA-Z0-9]+)"/);
      if (postMatch && securityMatch) {
        const ajaxRes = await this.req("/wp-admin/admin-ajax.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: fullUrl,
          },
          body: `action=player_ajax&security=${securityMatch[1]}&post=${postMatch[1]}&nume=1&type=tv`,
        });
        const ajaxJson = typeof ajaxRes === "string" ? JSON.parse(ajaxRes) : ajaxRes;
        if (ajaxJson && ajaxJson.embed_url) {
          targetEmbedUrl = ajaxJson.embed_url.replace(/\\/g, "").replace(/&amp;/g, "&");
        }
      }
    }

    if (!targetEmbedUrl) {
      throw new Error(`Could not resolve video player embed for ${fullUrl}`);
    }

    // 1. Check if it's the native Vidrco custom player
    if (targetEmbedUrl.includes("/player/") && !targetEmbedUrl.includes("pnonce=")) {
      const vRes = await this.req(targetEmbedUrl, { headers: { Referer: fullUrl } });
      const vHtml = typeof vRes === "string" ? vRes : (vRes && vRes.body) || "";
      const stream = this._extractVidrcoStream(vHtml);
      if (stream) return stream;
    }

    // Fetch the player embed
    const pRes = await this.req(targetEmbedUrl, { headers: { Referer: fullUrl } });
    const pHtml = typeof pRes === "string" ? pRes : (pRes && pRes.body) || "";

    if (pHtml.includes("mirai-quality-group") || pHtml.includes("id=\"mirai-player\"")) {
      const stream = this._extractVidrcoStream(pHtml);
      if (stream) return stream;
    }

    // Extract iframe source inside player
    const iframeMatch = pHtml.match(/<iframe[^>]+src=['"]([^'"]+)['"]/i);
    const iframeSrc = iframeMatch ? iframeMatch[1].replace(/&amp;/g, "&") : "";
    const cleanSrc = iframeSrc.startsWith("//") ? `https:${iframeSrc}` : iframeSrc;

    // BurstCloud
    if (cleanSrc.includes("burstcloud.co")) {
      const bRes = await this.req(cleanSrc, { headers: { Referer: this.baseUrl } });
      const bHtml = typeof bRes === "string" ? bRes : (bRes && bRes.body) || "";
      const fMatch = bHtml.match(/data-file-id=['"](\d+)['"]/);
      if (fMatch) {
        const prRes = await this.req("https://www.burstcloud.co/file/play-request/", {
          method: "POST",
          headers: { Referer: cleanSrc },
          body: `fileId=${fMatch[1]}`,
        });
        const prJson = typeof prRes === "string" ? JSON.parse(prRes) : prRes;
        if (prJson?.purchase?.cdnUrl) {
          return {
            type: "mp4",
            url: prJson.purchase.cdnUrl,
            headers: { Referer: "https://www.burstcloud.co/" },
          };
        }
      }
    }

    // Vidmoly
    if (cleanSrc.includes("vidmoly")) {
      const vmRes = await this.req(cleanSrc, { headers: { Referer: this.baseUrl } });
      const vmHtml = typeof vmRes === "string" ? vmRes : (vmRes && vmRes.body) || "";
      const m3u8Match = vmHtml.match(/file\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i);
      if (m3u8Match) {
        return {
          type: "hls",
          url: m3u8Match[1],
          headers: { Referer: "https://vidmoly.biz/" },
        };
      }
    }

    // YourUpload
    if (cleanSrc.includes("yourupload.com")) {
      const yuRes = await this.req(cleanSrc, { headers: { Referer: this.baseUrl } });
      const yuHtml = typeof yuRes === "string" ? yuRes : (yuRes && yuRes.body) || "";
      const ogMatch = yuHtml.match(/property=['"]og:video['"]\s+content=['"](https?:[^'"]+)['"]/i);
      if (ogMatch) {
        return {
          type: "mp4",
          url: ogMatch[1],
          headers: { Referer: "https://www.yourupload.com/" },
        };
      }
    }

    // Fallback: return iframe URL
    return {
      type: "mp4",
      url: cleanSrc || targetEmbedUrl,
      headers: { Referer: this.baseUrl },
    };
  }

  _extractVidrcoStream(html) {
    const variantsMatch = html.match(/data-variants=['"](\[\{[\s\S]*?\}\])['"]/);
    if (variantsMatch) {
      try {
        const raw = variantsMatch[1].replace(/&quot;/g, '"');
        const list = JSON.parse(raw);
        if (list.length > 0 && list[0].file) {
          return {
            type: "mp4",
            url: list[0].file,
            headers: { Referer: this.baseUrl },
          };
        }
      } catch {}
    }

    const srcMatch = html.match(/<video[^>]+src=['"]([^'"]+)['"]/i);
    if (srcMatch) {
      return {
        type: "mp4",
        url: srcMatch[1].replace(/&#038;/g, "&"),
        headers: { Referer: this.baseUrl },
      };
    }
    return null;
  }
}
