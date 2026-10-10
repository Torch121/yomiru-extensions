// ==YomiruExtension==
// @name         Mangakatana
// @version      v0.0.2
// @author       shashankx86
// @lang         en
// @license      MIT
// @icon         https://mangakatana.com/static/img/fav.png
// @package      mangakatana.com
// @type         manga
// @webSite      https://mangakatana.com/
// ==/YomiruExtension==

export default class extends Extension {
  async req(url) {
    return this.request(url, {
      headers: {
        "Miru-Url": await this.getSetting("mangakatana"),
      },
    });
  }

  async load() {
    await this.registerSetting({
      title: "Mangakatana URL",
      key: "mangakatana",
      type: "input",
      description: "Homepage URL for Mangakatana",
      defaultValue: "https://mangakatana.com/",
    });

    await this.registerSetting({
      title: "Reverse Order of Chapters",
      key: "reverseChaptersOrderMangakatana",
      type: "toggle",
      description: "Reverse the order of chapters in ascending order",
      defaultValue: "true",
    });
  }

  async popular(page) {
    const p = page || 1;
    const res = await this.req(`/manga/page/${p}/?filter=1&order=num_views`);
    const latest = await this.querySelectorAll(res, "#book_list .item");

    let manga = [];
    for (const element of latest) {
      const html = await element.content;
      const url = await this.getAttributeText(html, "a", "href");
      const title = await this.querySelector(html, "h3.title a").text;
      const cover = await this.getAttributeText(html, ".wrap_img img", "src");

      manga.push({
        title: title.trim(),
        url,
        cover: cover,
      });
    }
    return manga.length > 0 ? manga : this.latest(page);
  }

  async latest(page) {
    const res = await this.req(`/page/${page}/`);
    const latest = await this.querySelectorAll(res, "#book_list .item");

    let manga = [];
    for (const element of latest) {
      const html = await element.content;
      const url = await this.getAttributeText(html, "a", "href");
      const title = await this.querySelector(html, "h3.title a").text;
      const cover = await this.getAttributeText(html, ".wrap_img img", "src");

      manga.push({
        title: title.trim(),
        url,
        cover: cover,
      });
    }
    return manga;
  }

  async search(kw, page) {
    if (typeof kw === "object" && kw !== null) {
      const jp = kw.japaneseTitle || kw.nativeTitle || kw.japanese || "";
      const en = kw.englishTitle || kw.english || kw.query || "";
      if (jp && jp.trim()) {
        const jpResults = await this._rawSearch(jp.trim(), page);
        if (jpResults && jpResults.length > 0) {
          return jpResults;
        }
      }
      return this._rawSearch(en || jp || "", page);
    }
    return this._rawSearch(kw, page);
  }

  async _rawSearch(kw, page) {
    const res = await this.req(`/?search=${encodeURIComponent(kw || "")}`);
    const searchList = await this.querySelectorAll(res, "#book_list .item");
    const result = await Promise.all(
      searchList.map(async (element) => {
        const html = await element.content;
        const url = await this.getAttributeText(html, "a", "href");
        const title = await this.querySelector(html, "h3.title a").text;
        const cover = await this.getAttributeText(html, ".wrap_img img", "src");
        return {
          title: title.trim(),
          url,
          cover,
        };
      })
    );
    return result;
  }

  async detail(url) {
    const res = await this.request("", {
      headers: {
        "Miru-Url": url,
      },
    });

    const title = await this.querySelector(res, "div.info > h1").text;
    const cover = await this.getAttributeText(res, ".cover img", "src");
    let descS = await this.querySelector(res, ".summary p").text;
    let desc = descS.replace(/<br>/g, "");

    const epiList = await this.querySelectorAll(res, "div.chapters > table > tbody > tr");
    const chapters = await Promise.all(
      epiList.map(async (element) => {
        const html = await element.content;
        const name = await this.querySelector(html, "div.chapter > a").text;
        const url = await this.getAttributeText(html, "div.chapter > a", "href");
        return {
          name,
          url: url,
        };
      })
    );

    if ((await this.getSetting("reverseChaptersOrderMangakatana")) === "true") {
      chapters.reverse();
    }

    return {
      title: title || "Unknown Title",
      cover,
      desc: desc || "N/A",
      episodes: [
        {
          title: "Chapters",
          urls: chapters,
        },
      ],
    };
  }

  async watch(url) {
    const res = await fetch(url);
    const html = await res.text();

    const thzqMatch = html.match(/var thzq=\[(.*?)\];/);
    let images = [];

    if (thzqMatch) {
      const thzqContent = thzqMatch[1];
      images = thzqContent.match(/'(https:\/\/[^']+)'/g).map((match) => match.slice(1, -1));
    }

    return {
      urls: images,
    };
  }
}
