/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "093ae006a8d8010a904de231bc6a6097"
  }, {
    "url": "pwa-512x512.png",
    "revision": "406773e96cbac74511a5399e78dc08b8"
  }, {
    "url": "pwa-192x192.png",
    "revision": "623698d5ba2f873f3c33f0f10ce4be7b"
  }, {
    "url": "index.html",
    "revision": "6a326e023b37652ca1d56d9726e5771a"
  }, {
    "url": "favicon.svg",
    "revision": "38551c27c08537582c7a3112f1577d36"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "ee8f074866b82fe4b941d827fe556c98"
  }, {
    "url": "ocr/worker.min.js",
    "revision": "b1ab464237e687b323da236fff45ba05"
  }, {
    "url": "ocr/tesseract-core-lstm.wasm.js",
    "revision": "a3c227d2e04b7be5d1ef50d75f3a5ee3"
  }, {
    "url": "ocr/eng.traineddata.gz",
    "revision": "fc3fd803ea042eed89dbb5f96dad14f7"
  }, {
    "url": "assets/xauusdSeasonality-C1LcdJuR.js",
    "revision": null
  }, {
    "url": "assets/wifi-Cu9kKePx.js",
    "revision": null
  }, {
    "url": "assets/web-DFerm0pS.js",
    "revision": null
  }, {
    "url": "assets/web-D3YBuxI0.js",
    "revision": null
  }, {
    "url": "assets/web-CGGCrziT.js",
    "revision": null
  }, {
    "url": "assets/useCycleConfluenceData-CA7FHsde.js",
    "revision": null
  }, {
    "url": "assets/trending-down-D7L6Z-PA.js",
    "revision": null
  }, {
    "url": "assets/tradeSimulation-D83uJG26.js",
    "revision": null
  }, {
    "url": "assets/src-BmUdCsRu.js",
    "revision": null
  }, {
    "url": "assets/sliders-horizontal-CIxn7PmW.js",
    "revision": null
  }, {
    "url": "assets/rolldown-runtime-BCiCTKAo.js",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-vietnamese-wght-normal-qRpaaN48.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-wght-normal-eXO_dkmS.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-ext-wght-normal-DmpS2jIq.woff2",
    "revision": null
  }, {
    "url": "assets/jsx-dev-runtime-1n_Y3mdv.js",
    "revision": null
  }, {
    "url": "assets/inter-vietnamese-wght-normal-CBcvBZtf.woff2",
    "revision": null
  }, {
    "url": "assets/inter-latin-wght-normal-Dx4kXJAl.woff2",
    "revision": null
  }, {
    "url": "assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2",
    "revision": null
  }, {
    "url": "assets/inter-greek-wght-normal-CkhJZR-_.woff2",
    "revision": null
  }, {
    "url": "assets/inter-greek-ext-wght-normal-DlzME5K_.woff2",
    "revision": null
  }, {
    "url": "assets/inter-cyrillic-wght-normal-DqGufNeO.woff2",
    "revision": null
  }, {
    "url": "assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2",
    "revision": null
  }, {
    "url": "assets/index-Bgv1F5_D.css",
    "revision": null
  }, {
    "url": "assets/index--PRR3xra.js",
    "revision": null
  }, {
    "url": "assets/clientSideMacroAnalyzer-CmTgtotj.js",
    "revision": null
  }, {
    "url": "assets/circle-question-mark-B3nOWk_M.js",
    "revision": null
  }, {
    "url": "assets/SmcSignalPage-DgFm3peF.js",
    "revision": null
  }, {
    "url": "assets/SettingsView-DTwn56DE.js",
    "revision": null
  }, {
    "url": "assets/RiskCalculatorView-CY_q_tOr.js",
    "revision": null
  }, {
    "url": "assets/MacroNewsView-HuwejKht.js",
    "revision": null
  }, {
    "url": "assets/FundamentalGoldView-B_o3k3yv.js",
    "revision": null
  }, {
    "url": "assets/CycleConfluencePage-Ko6yCDhq.js",
    "revision": null
  }, {
    "url": "assets/AnalyticsView-DvMVvHJ4.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "ee8f074866b82fe4b941d827fe556c98"
  }, {
    "url": "favicon.svg",
    "revision": "38551c27c08537582c7a3112f1577d36"
  }, {
    "url": "pwa-192x192.png",
    "revision": "623698d5ba2f873f3c33f0f10ce4be7b"
  }, {
    "url": "pwa-512x512.png",
    "revision": "406773e96cbac74511a5399e78dc08b8"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "093ae006a8d8010a904de231bc6a6097"
  }, {
    "url": "ocr/eng.traineddata.gz",
    "revision": "fc3fd803ea042eed89dbb5f96dad14f7"
  }, {
    "url": "ocr/tesseract-core-lstm.wasm.js",
    "revision": "a3c227d2e04b7be5d1ef50d75f3a5ee3"
  }, {
    "url": "ocr/worker.min.js",
    "revision": "b1ab464237e687b323da236fff45ba05"
  }, {
    "url": "manifest.webmanifest",
    "revision": "26a89add5537a064cd10d5ff5258a575"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//]
  }));
  workbox.registerRoute(/\/ocr\/.*/i, new workbox.CacheFirst({
    "cacheName": "vlo-offline-ocr-assets",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
