// ==MiruExtension==
// @name         HiAnime
// @version      v0.1.0
// @author       Yomiru
// @lang         en
// @license      MIT
// @icon         https://hianime.at/theme/images/icons-192.png
// @package      hianime.at
// @type         bangumi
// @webSite      https://hianime.at
// ==/MiruExtension==

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

  // 1. Latest Anime Releases
  async latest(page) {
    const res = await this.req(`/recently-updated?page=${page}`);
    const html = typeof res === "string" ? res : res.html || "";
    const items = [];
    const itemRegex =
      /<div class="flw-item[\s\S]*?class="film-detail"[\s\S]*?<a href="([^"]+)"[\s\S]*?title="([^"]+)"[\s\S]*?<img[^>]*?(?:src|data-src)="([^"]+)"/g;

    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      items.push({
        title: match[2].trim(),
        url: match[1],
        cover: match[3],
      });
    }
    return items;
  }

  // 2. Search Anime by Keyword
  async search(kw, page) {
    const res = await this.req(`/search?keyword=${encodeURIComponent(kw)}&page=${page}`);
    const html = typeof res === "string" ? res : res.html || "";
    const items = [];
    const itemRegex =
      /<div class="flw-item[\s\S]*?class="film-detail"[\s\S]*?<a href="([^"]+)"[\s\S]*?title="([^"]+)"[\s\S]*?<img[^>]*?(?:src|data-src)="([^"]+)"/g;

    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      items.push({
        title: match[2].trim(),
        url: match[1],
        cover: match[3],
      });
    }
    return items;
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
