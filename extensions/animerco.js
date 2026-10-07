// ==YomiruExtension==
// @name         Animerco
// @version      v1.0.1
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

    // Is it a movie?
    if (fullUrl.includes("/movies/")) {
      return {
        title,
        cover,
        desc,
        episodes: [
          {
            title: "الأفلام",
            urls: [
              {
                name: "Full Movie - " + title,
                url: fullUrl,
              },
            ],
          },
        ],
      };
    }

    // Discover Seasons on Anime Page
    const seasons = [];
    const seasonBlockMatch = html.match(
      /class=['"][^'"]*media-seasons[^'"]*['"][\s\S]*?<\/ul>/
    );
    const searchHtml = seasonBlockMatch ? seasonBlockMatch[0] : html;
    const seasonLiRegex = /<li[^>]*data-number=['"]([^'"]+)['"][\s\S]*?<\/li>/g;
    let sLiMatch;
    const seenSeasonUrls = new Set();

    while ((sLiMatch = seasonLiRegex.exec(searchHtml)) !== null) {
      const li = sLiMatch[0];
      const sNum = parseInt(sLiMatch[1], 10);
      const linkMatch = li.match(
        /href=['"](https?:\/\/[^'"]*\/seasons\/[^'"]+)['"]/
      );
      if (!linkMatch) continue;
      const sUrl = linkMatch[1];
      if (seenSeasonUrls.has(sUrl)) continue;
      seenSeasonUrls.add(sUrl);

      let sTitle = "";
      const h3Match = li.match(/<h3>([\s\S]*?)<\/h3>/);
      if (h3Match) {
        sTitle = h3Match[1]
          .replace(/<span[\s\S]*?<\/span>/gi, "")
          .replace(/<[^>]+>/g, "")
          .trim();
      }
      if (!sTitle) {
        const titleMatch = li.match(/title=['"]([^'"]+)['"]/);
        if (titleMatch) sTitle = titleMatch[1].trim();
      }
      if (!sTitle) {
        sTitle = sNum === 0 ? "حلقات خاصة" : `الموسم ${sNum}`;
      }

      seasons.push({ num: isNaN(sNum) ? 1 : sNum, title: sTitle, url: sUrl });
    }

    // Sort seasons: Regular seasons (1, 2, 3...) first, then Specials (0) last
    seasons.sort((a, b) => {
      if (a.num === 0 && b.num > 0) return 1;
      if (b.num === 0 && a.num > 0) return -1;
      return a.num - b.num;
    });

    const episodeGroups = [];

    if (seasons.length > 0) {
      for (const season of seasons) {
        try {
          const sRes = await this.req(season.url);
          const sHtml =
            typeof sRes === "string" ? sRes : (sRes && sRes.body) || "";
          const seasonEps = [];
          this._extractEpisodesFromHtml(sHtml, seasonEps);
          if (seasonEps.length > 0) {
            episodeGroups.push({
              title: season.title,
              urls: seasonEps,
            });
          }
        } catch {}
      }
    }

    // If no seasons discovered or all failed, extract directly from the target page
    if (episodeGroups.length === 0) {
      const flatList = [];
      this._extractEpisodesFromHtml(html, flatList);
      episodeGroups.push({
        title: "الحلقات",
        urls: flatList,
      });
    }

    return {
      title,
      cover,
      desc,
      episodes: episodeGroups,
    };
  }

  _extractEpisodesFromHtml(html, episodeList) {
    const liRegex = /<li[^>]*data-number=['"]([^'"]+)['"][\s\S]*?<\/li>/g;
    let match;
    const seen = new Set();

    while ((match = liRegex.exec(html)) !== null) {
      const li = match[0];
      const epNum = match[1];

      const linkMatch = li.match(
        /href=['"](https?:\/\/[^'"]*\/episodes\/[^'"]+)['"]/
      );
      if (!linkMatch) continue;
      const epUrl = linkMatch[1];

      if (seen.has(epUrl)) continue;
      seen.add(epUrl);

      let epTitle = "";
      const h3Match = li.match(/<h3>([\s\S]*?)<\/h3>/);
      if (h3Match) {
        epTitle = h3Match[1]
          .replace(/<span[\s\S]*?<\/span>/gi, "")
          .replace(/<[^>]+>/g, "")
          .trim();
      }
      if (!epTitle) {
        const titleAttrMatch = li.match(/title=['"]([^'"]+)['"]/);
        if (titleAttrMatch) epTitle = titleAttrMatch[1].trim();
      }

      // Format clean episode title for reliable numbering and display
      const cleanSubtitle = epTitle
        .replace(/^الحلقة\s*\d+\s*(?:والاخيرة)?(?:\s*[:\-–])?\s*/i, "")
        .trim();

      let displayName = `Episode ${epNum}`;
      if (cleanSubtitle) {
        displayName += `: ${cleanSubtitle}`;
      } else if (epTitle) {
        displayName = `Episode ${epNum}: ${epTitle}`;
      }

      episodeList.push({
        name: displayName,
        url: epUrl,
      });
    }
  }

  // 5. Watch Stream Extraction
  async watch(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const res = await this.req(fullUrl);
    const html = typeof res === "string" ? res : (res && res.body) || "";

    const servers = [];
    const optionRegex =
      /<a[^>]+class=['"][^'"]*option[^'"]*['"][^>]*data-embed-url=['"]([^'"]+)['"][^>]*data-embed-exp=['"](\d+)['"][^>]*>([\s\S]*?)<\/a>/g;
    let match;
    const now = Math.floor(Date.now() / 1000);

    while ((match = optionRegex.exec(html)) !== null) {
      const sName = match[3].replace(/<[^>]+>/g, "").trim();
      const embedUrl = match[1].replace(/&amp;/g, "&");
      const exp = parseInt(match[2], 10);
      servers.push({
        name: sName || "Server",
        embedUrl,
        exp,
      });
    }

    // Fallback: If no server options with data-embed-url, check admin-ajax.php
    if (servers.length === 0) {
      const postMatch = html.match(/data-post=['"](\d+)['"]/);
      const securityMatch =
        html.match(/data-nonce=['"]([a-zA-Z0-9]+)['"]/) ||
        html.match(/"security":"([a-zA-Z0-9]+)"/);
      if (postMatch && securityMatch) {
        for (let num = 1; num <= 6; num++) {
          try {
            const ajaxRes = await this.req("/wp-admin/admin-ajax.php", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: fullUrl,
              },
              body: `action=player_ajax&security=${securityMatch[1]}&post=${postMatch[1]}&nume=${num}&type=tv`,
            });
            const ajaxJson =
              typeof ajaxRes === "string" ? JSON.parse(ajaxRes) : ajaxRes;
            if (ajaxJson && ajaxJson.embed_url) {
              servers.push({
                name: `Server ${num}`,
                embedUrl: ajaxJson.embed_url
                  .replace(/\\/g, "")
                  .replace(/&amp;/g, "&"),
                exp: 0,
              });
            }
          } catch {}
        }
      }
    }

    const resolvedSources = [];

    // Iterate through all discovered servers to find all playable video streams
    for (const srv of servers) {
      try {
        let embedUrl = srv.embedUrl;
        if (!embedUrl) continue;

        // 1. Direct native Vidrco custom player
        if (embedUrl.includes("/player/") && !embedUrl.includes("pnonce=")) {
          const vRes = await this.req(embedUrl, {
            headers: { Referer: fullUrl },
          });
          const vHtml =
            typeof vRes === "string" ? vRes : (vRes && vRes.body) || "";
          const vidrcoStreams = this._extractVidrcoStreams(vHtml, srv.name);
          if (vidrcoStreams.length > 0) {
            resolvedSources.push(...vidrcoStreams);
            continue;
          }
        }

        // Fetch intermediate player page
        const pRes = await this.req(embedUrl, {
          headers: { Referer: fullUrl },
        });
        const pHtml =
          typeof pRes === "string" ? pRes : (pRes && pRes.body) || "";

        // Check if player page directly contains Vidrco / Mirai
        if (
          pHtml.includes("mirai-quality-group") ||
          pHtml.includes('id="mirai-player"')
        ) {
          const vidrcoStreams = this._extractVidrcoStreams(pHtml, srv.name);
          if (vidrcoStreams.length > 0) {
            resolvedSources.push(...vidrcoStreams);
            continue;
          }
        }

        // Extract iframe
        const iframeMatch = pHtml.match(/<iframe[^>]+src=['"]([^'"]+)['"]/i);
        const iframeSrc = iframeMatch
          ? iframeMatch[1].replace(/&amp;/g, "&")
          : "";
        const cleanSrc = iframeSrc.startsWith("//")
          ? `https:${iframeSrc}`
          : iframeSrc;

        if (!cleanSrc) continue;

        // BurstCloud resolver
        if (cleanSrc.includes("burstcloud.co")) {
          const bRes = await this.req(cleanSrc, {
            headers: { Referer: this.baseUrl },
          });
          const bHtml =
            typeof bRes === "string" ? bRes : (bRes && bRes.body) || "";
          const fMatch = bHtml.match(/data-file-id=['"](\d+)['"]/);
          if (fMatch) {
            const prRes = await this.req(
              "https://www.burstcloud.co/file/play-request/",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Referer: cleanSrc,
                },
                body: `fileId=${fMatch[1]}`,
              }
            );
            const prJson =
              typeof prRes === "string" ? JSON.parse(prRes) : prRes;
            if (prJson && prJson.purchase && prJson.purchase.cdnUrl) {
              resolvedSources.push({
                server: `BurstCloud (${srv.name})`,
                url: prJson.purchase.cdnUrl,
                type: "mp4",
                quality: "1080p",
                headers: { Referer: "https://www.burstcloud.co/" },
              });
              continue;
            }
          }
        }

        // Vidmoly resolver
        if (cleanSrc.includes("vidmoly")) {
          const vmRes = await this.req(cleanSrc, {
            headers: { Referer: this.baseUrl },
          });
          const vmHtml =
            typeof vmRes === "string" ? vmRes : (vmRes && vmRes.body) || "";
          const m3u8Match = vmHtml.match(
            /file\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i
          );
          if (m3u8Match) {
            resolvedSources.push({
              server: `Vidmoly (${srv.name})`,
              url: m3u8Match[1],
              type: "hls",
              quality: "Auto",
              headers: { Referer: "https://vidmoly.biz/" },
            });
            continue;
          }
        }

        // YourUpload resolver
        if (cleanSrc.includes("yourupload.com")) {
          const yuRes = await this.req(cleanSrc, {
            headers: { Referer: this.baseUrl },
          });
          const yuHtml =
            typeof yuRes === "string" ? yuRes : (yuRes && yuRes.body) || "";
          const ogMatch =
            yuHtml.match(
              /property=['"]og:video['"]\s+content=['"](https?:[^'"]+)['"]/i
            ) ||
            yuHtml.match(/file\s*:\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i);
          if (ogMatch) {
            resolvedSources.push({
              server: `YourUpload (${srv.name})`,
              url: ogMatch[1],
              type: "mp4",
              quality: "Auto",
              headers: { Referer: "https://www.yourupload.com/" },
            });
            continue;
          }
        }

        // Mp4Upload resolver
        if (cleanSrc.includes("mp4upload.com")) {
          const mp4Res = await this.req(cleanSrc, {
            headers: { Referer: this.baseUrl },
          });
          const mp4Html =
            typeof mp4Res === "string" ? mp4Res : (mp4Res && mp4Res.body) || "";
          const unpacked = this._unpackJs(mp4Html) + " " + mp4Html;
          const mp4Match =
            unpacked.match(
              /player\.src\(\s*(?:\{\s*src\s*:\s*)?['"](https?:[^'"]+\.mp4[^'"]*)['"]/i
            ) ||
            unpacked.match(
              /https?:\/\/[a-zA-Z0-9_.:-]+\.mp4upload\.com:[0-9]+\/d\/[^\s"'<>]+\/video\.mp4/i
            );
          if (mp4Match) {
            resolvedSources.push({
              server: `Mp4Upload (${srv.name})`,
              url: mp4Match[1] || mp4Match[0],
              type: "mp4",
              quality: "Auto",
              headers: { Referer: "https://www.mp4upload.com/" },
            });
            continue;
          }
        }

        // Direct media stream in player or iframe
        const directMedia =
          cleanSrc.match(/https?:\/\/[^'"]+\.(?:m3u8|mp4)(?:\?[^'"]*)?/i) ||
          pHtml.match(/<video[^>]+src=['"]([^'"]+)['"]/i);
        if (directMedia) {
          const streamUrl = directMedia[1] || directMedia[0];
          resolvedSources.push({
            server: srv.name,
            url: streamUrl,
            type: streamUrl.includes(".m3u8") ? "hls" : "mp4",
            quality: "Auto",
            headers: { Referer: this.baseUrl },
          });
        }
      } catch {}
    }

    // Fallback if no streams were resolved: return primary option as fallback
    if (resolvedSources.length === 0 && servers.length > 0) {
      const fallbackUrl = servers[0].embedUrl;
      resolvedSources.push({
        server: servers[0].name,
        url: fallbackUrl,
        type: fallbackUrl.includes(".m3u8") ? "hls" : "mp4",
        quality: "Auto",
        headers: { Referer: this.baseUrl },
      });
    }

    return {
      sources: resolvedSources,
      subtitles: [],
    };
  }

  _extractVidrcoStreams(html, serverName) {
    const list = [];
    const variantsMatch = html.match(
      /data-variants=['"](\[\{[\s\S]*?\}\])['"]/
    );
    if (variantsMatch) {
      try {
        const raw = variantsMatch[1].replace(/&quot;/g, '"');
        const parsed = JSON.parse(raw);
        for (const item of parsed) {
          if (item && item.file) {
            list.push({
              server: `${serverName} (${item.label || "Auto"})`,
              url: item.file,
              type: "mp4",
              quality: item.label || "Auto",
              headers: { Referer: this.baseUrl },
            });
          }
        }
        if (list.length > 0) return list;
      } catch {}
    }

    const srcMatch = html.match(/<video[^>]+src=['"]([^'"]+)['"]/i);
    if (srcMatch) {
      list.push({
        server: serverName,
        url: srcMatch[1].replace(/&#038;/g, "&"),
        type: "mp4",
        quality: "Auto",
        headers: { Referer: this.baseUrl },
      });
    }
    return list;
  }

  _unpackJs(source) {
    if (!source || typeof source !== "string") return "";
    const packerRegex =
      /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]*?\.split\s*\(\s*['"]\|['"]\s*\)\s*\)\s*\)/g;
    let match;
    let result = source;

    while ((match = packerRegex.exec(source)) !== null) {
      try {
        const fullMatch = match[0];
        const innerMatch = fullMatch.match(
          /\}\s*\(\s*(['"][\s\S]*?['"])\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]*?)['"]\.split/
        );
        if (innerMatch) {
          let p = innerMatch[1].slice(1, -1);
          const a = parseInt(innerMatch[2], 10);
          let c = parseInt(innerMatch[3], 10);
          const k = innerMatch[4].split("|");

          while (c--) {
            const key = c.toString(a);
            const replacement = k[c] || key;
            p = p.replace(new RegExp(`\\b${key}\\b`, "g"), replacement);
          }
          result += "\n" + p;
        }
      } catch {}
    }
    return result;
  }
}
