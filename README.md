# Yomiru Extensions Repository

Official remote extension catalog for [Yomiru](https://github.com/Torch121/Yomiru).

> **Last Synced**: 2026-10-04 15:57 UTC  
> **Repository**: `Torch121/yomiru-extensions` (branch: `main`)  
> **Manifest URL**: `https://raw.githubusercontent.com/Torch121/yomiru-extensions/main/index.json`

## Available Extensions

| Icon | Extension | Package | Version | Type | Lang | Author | Source |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| <img src="https://www.animeonsen.xyz/assets/icons/icon-192x192.png" width="28" height="28" /> | **AnimeOnsen** | `xyz.animeonsen` | `v1.0.0` | `bangumi` | ALL | Yomiru | [animeonsen.js](./extensions/animeonsen.js) |
| <img src="https://anilist.co/img/icons/apple-touch-icon.png" width="28" height="28" /> | **AniGoGo** | `ani.gogo` | `v0.0.4` | `bangumi` | EN | OshekharO | [animex.js](./extensions/animex.js) |
| <img src="https://hianime.at/theme/images/icons-192.png" width="28" height="28" /> | **HiAnime** | `hianime.at` | `v0.1.0` | `bangumi` | EN | Yomiru | [hianime.js](./extensions/hianime.js) |
| <img src="https://raw.githubusercontent.com/keiyoushi/extensions-source/main/src/all/kagane/res/mipmap-xxhdpi/ic_launcher.png" width="28" height="28" /> | **Kagane** | `kagane.to` | `v0.0.1` | `manga` | ALL | Yomiru | [kagane.js](./extensions/kagane.js) |
| <img src="https://mangaball.com/images/favicon.png" width="28" height="28" /> | **MangaBall** | `mangaball.com` | `v0.0.2` | `manga` | ALL | Yomiru | [mangaball.js](./extensions/mangaball.js) |
| <img src="https://mangafire.to/assets/mangafire/favicon.svg" width="28" height="28" /> | **MangaFire** | `mangafire.to` | `v1.0.1` | `manga` | ALL | Yomiru | [mangafire.js](./extensions/mangafire.js) |
| <img src="https://mangakatana.com/static/img/fav.png" width="28" height="28" /> | **Mangakatana** | `mangakatana.com` | `v0.0.1` | `manga` | EN | shashankx86 | [mangakatana.js](./extensions/mangakatana.js) |
| <img src="https://witanime.site/assets/images/favicon.ico" width="28" height="28" /> | **WitAnime** | `site.witanime` | `v1.0.9` | `bangumi` | AR | Yomiru | [witanime.js](./extensions/witanime.js) |

## How to Use in Yomiru
1. Open **Yomiru** on your device.
2. Navigate to **Profile** > **Extensions**.
3. Switch to the **Explore GitHub** tab to browse and install extensions.
4. When a new version is pushed to this repository, Yomiru will automatically notify you or update based on your settings.

## Updating or Adding Extensions
To update or publish an extension, edit the JS file in `extensions/` or run the push script from the Yomiru repository:
```bash
./scripts/push_extensions.sh
```

---
Licensed under [MIT](LICENSE).
