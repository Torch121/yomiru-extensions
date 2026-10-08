// ==YomiruExtension==
// @name         AniWaves
// @version      v1.0.0
// @author       Yomiru
// @lang         all
// @license      MIT
// @icon         https://aniwaves.ru/assets/images/favicons/favicon-96x96.png
// @package      ru.aniwaves
// @type         bangumi
// @webSite      https://aniwaves.ru
// @nsfw         false
// @description  Watch Anime Online with high-quality subbed and dubbed streaming from AniWaves.
// ==/YomiruExtension==

export default class extends Extension {
  get defaultBaseUrl() {
    return "https://aniwaves.ru";
  }

  async getBaseUrl() {
    const custom = await this.getSetting("aniwaves_url");
    return (custom && custom.trim()) ? custom.trim().replace(/\/+$/, "") : this.defaultBaseUrl;
  }

  async req(pathOrUrl, options = {}) {
    const base = await this.getBaseUrl();
    const fullUrl = pathOrUrl.startsWith("http") ? pathOrUrl : `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    return this.request(fullUrl, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "en-US,en;q=0.9",
        ...(options.headers || {}),
      },
    });
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

  async load() {
    await this.registerSetting({
      title: "AniWaves URL",
      key: "aniwaves_url",
      type: "input",
      description: "Base domain URL for AniWaves mirror",
      defaultValue: "https://aniwaves.ru",
    });

    await this.registerSetting({
      title: "Preferred Audio",
      key: "preferred_audio",
      type: "radio",
      description: "Default audio preference (Sub or Dub)",
      defaultValue: "sub",
    });
  }

  _parseItems(html, baseUrl = "https://aniwaves.ru") {
    if (!html || typeof html !== "string") return [];
    const items = [];
    const parts = html.split(/<div class="item\b/);

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const titleMatch =
        part.match(/<a[^>]+class="[^"]*name[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
        part.match(/<a[^>]+href="(\/watch\/[^"]+)"[^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

      const coverMatch =
        part.match(/<img[^>]+src="([^"]+)"/i) ||
        part.match(/<img[^>]+data-src="([^"]+)"/i);

      const subMatch = part.match(/class="ep-status sub"[^>]*>[\s\S]*?(\d+)[\s\S]*?<\/div>/i);

      if (titleMatch) {
        let title = titleMatch[2].replace(/<[^>]*>/g, "").trim();
        const rawUrl = titleMatch[1];
        let cover = coverMatch ? coverMatch[1] : "";
        if (cover && !cover.startsWith("http")) {
          cover = `${baseUrl}${cover.startsWith("/") ? "" : "/"}${cover}`;
        }

        const subCount = subMatch ? subMatch[1] : null;

        items.push({
          title,
          url: rawUrl,
          cover,
          update: subCount ? `${subCount} Ep` : "",
        });
      }
    }

    return items;
  }

  // 1. Popular Anime
  async popular(page) {
    const base = await this.getBaseUrl();
    const res = await this.req(`/top-airing?page=${page || 1}`);
    const html = typeof res === "string" ? res : res.body || "";
    return this._parseItems(html, base);
  }

  // 2. Latest Anime
  async latest(page) {
    const base = await this.getBaseUrl();
    const res = await this.req(`/updated?page=${page || 1}`);
    const html = typeof res === "string" ? res : res.body || "";
    return this._parseItems(html, base);
  }

  // 3. Search Anime
  async search(kw, page, filter) {
    const base = await this.getBaseUrl();
    const query = kw ? encodeURIComponent(kw.trim()) : "";
    const p = page || 1;
    const url = `/filter?keyword=${query}&page=${p}`;

    const res = await this.req(url);
    const html = typeof res === "string" ? res : res.body || "";
    return this._parseItems(html, base);
  }

  // 4. Anime Detail & Episodes List
  async detail(url) {
    const base = await this.getBaseUrl();
    const fullWatchUrl = url.startsWith("http") ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;

    const res = await this.req(fullWatchUrl);
    const html = typeof res === "string" ? res : res.body || "";

    const titleMatch =
      html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "Unknown Title";

    const coverMatch =
      html.match(/class="poster"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
      html.match(/<img[^>]+src="([^"]+)"[^>]*itemprop="image"/i);
    let cover = coverMatch ? coverMatch[1] : "";
    if (cover && !cover.startsWith("http")) {
      cover = `${base}${cover.startsWith("/") ? "" : "/"}${cover}`;
    }

    const descMatch =
      html.match(/class="content"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/class="shorting"[^>]*>([\s\S]*?)<\/div>/i);
    const desc = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";

    // Extract numeric anime ID (from #watch-main data-id or url slug)
    const idMatch =
      html.match(/id="watch-main"[^>]*data-id="(\d+)"/i) ||
      url.match(/-(\d+)(?:\?|$)/);

    const episodesList = [];

    if (idMatch) {
      const animeId = idMatch[1];
      const epRes = await this.req(`/ajax/episode/list/${animeId}`, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Referer: fullWatchUrl,
        },
      });

      const epData = this.parseJson(epRes);
      const epHtml = epData && epData.result ? epData.result : (typeof epRes === "string" ? epRes : "");

      const epRegex = /<a[^>]+data-ids="([^"]+)"[^>]*data-num="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = epRegex.exec(epHtml)) !== null) {
        const rawIds = m[1].replace(/&amp;/g, "&");
        const num = m[2];
        const spanMatch = m[3].match(/<span>([\s\S]*?)<\/span>/i);
        const epTitle = spanMatch ? spanMatch[1].replace(/<[^>]*>/g, "").trim() : `Episode ${num}`;

        episodesList.push({
          name: `Episode ${num}: ${epTitle}`,
          url: rawIds, // data-ids passed to watch() e.g. "78067&eps=1"
        });
      }
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

  // 5. Watch & Direct Stream Extraction
  async watch(episodeDataIds) {
    const base = await this.getBaseUrl();
    const prefAudio = ((await this.getSetting("preferred_audio")) || "sub").toLowerCase();

    // Query servers list
    const serverRes = await this.req(`/ajax/server/list?servers=${episodeDataIds}`, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${base}/`,
      },
    });

    const svData = this.parseJson(serverRes);
    const svHtml = svData && svData.result ? svData.result : (typeof serverRes === "string" ? serverRes : "");

    // Parse servers
    const servers = [];
    const serverGroups = svHtml.split(/<div class="type"/i);

    for (let i = 1; i < serverGroups.length; i++) {
      const grp = serverGroups[i];
      const typeMatch = grp.match(/data-type="([^"]+)"/i);
      const grpType = typeMatch ? typeMatch[1].toLowerCase() : "sub";

      const liMatches = [...grp.matchAll(/<li[^>]+data-sv-id="([^"]+)"[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi)];
      for (const m of liMatches) {
        const svId = m[1];
        const linkId = m[2];
        const name = m[3].replace(/<[^>]*>/g, "").trim();
        servers.push({
          name,
          svId,
          linkId,
          type: grpType,
        });
      }
    }

    if (servers.length === 0) {
      throw new Error(`No available video servers found for episode ${episodeDataIds}`);
    }

    // Prioritize Vidplay matching preferred audio, otherwise any Vidplay, otherwise first
    let chosenServer =
      servers.find((s) => s.type === prefAudio && s.name.toLowerCase().includes("vidplay")) ||
      servers.find((s) => s.name.toLowerCase().includes("vidplay")) ||
      servers.find((s) => s.type === prefAudio) ||
      servers[0];

    // Fetch embed URL from /ajax/sources
    const srcRes = await this.req(`/ajax/sources?id=${encodeURIComponent(chosenServer.linkId)}&asi=1&autoPlay=0`, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${base}/`,
      },
    });

    const srcData = this.parseJson(srcRes);
    if (!srcData || !srcData.result || !srcData.result.url) {
      throw new Error(`Failed to resolve source embed URL for server ${chosenServer.name}`);
    }

    const embedUrl = srcData.result.url;

    // Direct extraction for EchoVideo / Vidplay
    if (embedUrl.includes("echovideo")) {
      const dataIdMatch = embedUrl.match(/\/embed-1\/([^?&/]+)/);
      if (dataIdMatch) {
        const dataId = dataIdMatch[1];
        try {
          const streamRes = await this.request(`https://play.echovideo.ru/embed-1/getSources?id=${encodeURIComponent(dataId)}`, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
              "X-Requested-With": "XMLHttpRequest",
              Referer: `https://play.echovideo.ru/embed-1/${dataId}?v=1`,
            },
          });

          const streamData = this.parseJson(streamRes);
          const masterUrl =
            typeof streamData?.sources === "string"
              ? streamData.sources
              : streamData?.sources?.[0]?.file;

          if (masterUrl) {
            return {
              type: "hls",
              url: masterUrl,
              headers: {
                Referer: "https://play.echovideo.ru/",
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
              },
              subtitles: [],
            };
          }
        } catch (e) {
          // Fallback to embed
        }
      }
    }

    // Fallback: embed frame
    return {
      type: "hls",
      url: embedUrl,
      headers: {
        Referer: `${base}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      subtitles: [],
    };
  }
}
