// ==YomiruExtension==
// @name         AniGoGo
// @version      v0.0.5
// @author       OshekharO
// @lang         en
// @license      MIT
// @icon         https://anilist.co/img/icons/apple-touch-icon.png
// @package      ani.gogo
// @type         bangumi
// @webSite      https://animex.one
// ==/YomiruExtension==

export default class extends Extension {
  async req(url, options = {}) {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Origin: "https://animex.one",
      Referer: "https://animex.one/",
      ...(options.headers || {}),
      "Miru-Url": url,
    };
    return this.request("", {
      ...options,
      headers,
    });
  }

  async popular(page) {
    const p = page || 1;
    const query = `
      query PopularAnime($page: Int, $limit: Int) {
        catalogAnime(sort: POPULARITY_DESC, page: $page, limit: $limit) {
          items {
            id
            anilistId
            titleEnglish
            titleRomaji
            coverImage
          }
        }
      }
    `;
    try {
      const res = await this.req("https://graphql.animex.one/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          query,
          variables: { page: p, limit: 20 },
        }),
      });
      const items = res?.data?.catalogAnime?.items || [];
      if (items.length > 0) {
        return items.map((item) => ({
          title: item.titleEnglish || item.titleRomaji || "",
          url: item.id.toString(),
          cover: item.coverImage?.extraLarge || item.coverImage?.large || "",
        }));
      }
    } catch (_) {}
    return this.latest(page);
  }

  async latest(page) {
    const p = page || 1;
    const res = await this.req(`https://graphql.animex.one/api/recent?page=${p}`);
    const results = res?.results || [];
    return results.map((item) => {
      const title = item.titleEnglish || item.titleRomaji || item.titleNative || "";
      const cover = item.coverImage?.extraLarge || item.coverImage?.large || "";
      return {
        title,
        url: item.id.toString(),
        cover,
      };
    });
  }

  async search(kw, page) {
    let queryStr = "";
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      if (jp && jp.trim()) {
        const jpResults = await this._rawSearch(jp.trim(), page);
        if (jpResults && jpResults.length > 0) return jpResults;
      }
      queryStr = en || jp || "";
    } else {
      queryStr = (kw || "").trim();
    }
    if (!queryStr) return this.popular(page);
    return this._rawSearch(queryStr, page);
  }

  async _rawSearch(queryStr, page) {
    const query = `
      query FastSearch($query: String, $limit: Int) {
        catalogAnime(filter: { query: $query }, limit: $limit) {
          items {
            id
            anilistId
            titleEnglish
            titleRomaji
            coverImage
          }
        }
      }
    `;
    const res = await this.req("https://graphql.animex.one/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        query,
        variables: {
          query: queryStr,
          limit: 15,
        },
      },
    });

    const items = res?.data?.catalogAnime?.items || [];
    return items.map((item) => {
      const title = item.titleEnglish || item.titleRomaji || item.id || "N/A";
      const coverObj = typeof item.coverImage === "string" ? JSON.parse(item.coverImage || "{}") : (item.coverImage || {});
      const cover = coverObj.extraLarge || coverObj.large || coverObj.medium || "";
      return {
        title,
        url: item.id.toString(),
        cover,
      };
    });
  }

  async detail(url) {
    const animeId = url;
    let title = animeId;
    let cover = "";
    let desc = "";

    // Query GraphQL for anime info by ID
    try {
      const query = `
        query GetAnime($id: String!) {
          anime(id: $id) {
            id
            titleEnglish
            titleRomaji
            coverImage
            description
          }
        }
      `;
      const infoRes = await this.req("https://graphql.animex.one/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          query,
          variables: { id: animeId },
        },
      });
      const item = infoRes?.data?.anime;
      if (item) {
        title = item.titleEnglish || item.titleRomaji || animeId;
        const coverObj = typeof item.coverImage === "string" ? JSON.parse(item.coverImage || "{}") : (item.coverImage || {});
        cover = coverObj.extraLarge || coverObj.large || coverObj.medium || "";
        desc = item.description || "";
      }
    } catch (e) {
      // Fallback
    }

    // Fetch episode list from Animex REST API
    let episodeUrls = [];
    try {
      const epRes = await this.req(
        `https://pp.animex.one/rest/api/episodes?id=${encodeURIComponent(animeId)}`
      );
      if (Array.isArray(epRes) && epRes.length > 0) {
        episodeUrls = epRes.map((ep) => {
          const epNum = ep.number;
          const epTitle =
            ep.titles?.en || ep.titles?.x_jat || ep.titles?.ja || `Episode ${epNum}`;
          return {
            name: `Ep ${epNum}: ${epTitle}`,
            url: `${animeId};${epNum}`,
          };
        });
      }
    } catch (e) {
      // Fallback
    }

    if (episodeUrls.length === 0) {
      episodeUrls = [
        {
          name: "Episode 1",
          url: `${animeId};1`,
        },
      ];
    }

    return {
      title,
      cover,
      desc,
      episodes: [
        {
          title: "Episodes",
          urls: episodeUrls,
        },
      ],
    };
  }

  async watch(url) {
    const parts = url.split(";");
    const animeId = parts[0];
    const epNum = parts[1] || "1";

    let providerId = "beep";
    try {
      const serverRes = await this.req(
        `https://pp.animex.one/rest/api/servers?id=${encodeURIComponent(
          animeId
        )}&epNum=${encodeURIComponent(epNum)}`
      );
      if (serverRes?.subProviders && serverRes.subProviders.length > 0) {
        const defaultProv = serverRes.subProviders.find((p) => p.default);
        providerId = defaultProv ? defaultProv.id : serverRes.subProviders[0].id;
      }
    } catch (e) {
      // Fallback to default providerId "beep"
    }

    const sourcesRes = await this.req(
      `https://pp.animex.one/rest/api/sources?id=${encodeURIComponent(
        animeId
      )}&epNum=${encodeURIComponent(epNum)}&type=sub&providerId=${encodeURIComponent(
        providerId
      )}`
    );

    const sources = sourcesRes?.sources || [];
    const sortedSources = [...sources].sort((a, b) => {
      const aHls = (a.type?.includes("mpegurl") || a.url?.includes(".m3u8")) ? 1 : 0;
      const bHls = (b.type?.includes("mpegurl") || b.url?.includes(".m3u8")) ? 1 : 0;
      return bHls - aHls;
    });

    let streamUrl = "";
    if (sortedSources.length > 0) {
      streamUrl = sortedSources[0].url || "";
    }

    const isHls = streamUrl.includes(".m3u8") || (sortedSources[0]?.type?.includes("mpegurl") ?? false);

    const subtitles = (sourcesRes?.tracks || [])
      .filter((t) => t.url)
      .map((t) => ({
        title: t.label || t.lang || "Subtitle",
        url: t.url,
      }));

    const reqHeaders = sourcesRes?.headers || {
      Referer: "https://playeng.animeapps.top/",
    };

    return {
      type: isHls ? "hls" : "mp4",
      url: streamUrl,
      headers: reqHeaders,
      subtitles,
    };
  }
}
