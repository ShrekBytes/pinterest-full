// ==UserScript==
// @name         Pinterest Full
// @namespace    https://github.com/ShrekBytes
// @description  View & download original full size images/videos with a great UI and gallery view
// @version      1.0.0
// @author       ShrekBytes
// @match        https://*.pinterest.com/*
// @match        https://*.pinterest.at/*
// @match        https://*.pinterest.ca/*
// @match        https://*.pinterest.ch/*
// @match        https://*.pinterest.cl/*
// @match        https://*.pinterest.co.kr/*
// @match        https://*.pinterest.co.uk/*
// @match        https://*.pinterest.com.au/*
// @match        https://*.pinterest.com.mx/*
// @match        https://*.pinterest.de/*
// @match        https://*.pinterest.dk/*
// @match        https://*.pinterest.es/*
// @match        https://*.pinterest.fr/*
// @match        https://*.pinterest.ie/*
// @match        https://*.pinterest.info/*
// @match        https://*.pinterest.it/*
// @match        https://*.pinterest.jp/*
// @match        https://*.pinterest.nz/*
// @match        https://*.pinterest.ph/*
// @match        https://*.pinterest.pt/*
// @match        https://*.pinterest.se/*
// @icon         https://raw.githubusercontent.com/ShrekBytes/pinterest-full/refs/heads/main/pinterest.png
// @grant        GM_openInTab
// @grant        GM_download
// @run-at       document-start
// @license      GPL-3.0
// @noframes
// @homepageURL  https://github.com/ShrekBytes/pinterest-full
// @supportURL   https://github.com/ShrekBytes/pinterest-full/issues
// @downloadURL  https://github.com/ShrekBytes/pinterest-full/raw/main/pinterest-full.user.js
// @updateURL    https://github.com/ShrekBytes/pinterest-full/raw/main/pinterest-full.user.js
// ==/UserScript==

(() => {
    'use strict';
  
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const qs  = (sel, root=document) => root.querySelector(sel);
  

  
    const CSS = `
    /* ===== Pinterest Plus Modern CSS ===== */
    .pp-btn {
      all: unset;
      display: inline-flex; align-items: center; gap: .5rem;
      font-weight: 700; cursor: pointer; user-select: none;
      border-radius: 9999px; padding: .5rem .9rem; line-height: 1;
      box-shadow: 0 4px 12px rgba(0,0,0,.15);
      transition: transform .12s ease, background .2s ease, opacity .2s ease;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      background: #e60023; color: #fff;
    }
    .pp-btn:hover { background: #ad081b; }
    .pp-btn:disabled { 
      opacity: 0.6; 
      cursor: not-allowed; 
      background: #666; 
    }
    .pp-btn:disabled:hover { background: #666; }
    
    /* Add margin between View and Download buttons */
    #pp-main-btn { margin-right: 8px; }
  
    .pp-overlay {
      position: fixed; inset:0; background: rgba(0,0,0,.85); z-index: 2147483647;
      display: grid; grid-template-rows: auto 1fr auto;
      opacity: 0; pointer-events: none; transition: opacity .2s ease;
    }
    .pp-overlay.open { opacity: 1; pointer-events: auto; }
  
    .pp-head {
      display:flex; align-items:center; justify-content: space-between; padding: 10px 14px;
      background: rgba(20,20,20,.6); backdrop-filter: blur(4px);
    }
    .pp-head .pp-actions { display:flex; gap:8px; align-items:center; }
    .pp-chip { font-size:12px; background:#222; color:#fff; padding:.3rem .6rem; border-radius:999px; }
  
    .pp-stage {
      display:grid; place-items:center; overflow:auto; padding: 16px;
    }
    .pp-img, .pp-video { max-width: 95vw; max-height: 82vh; border-radius: 12px; box-shadow: 0 12px 48px rgba(0,0,0,.4); }
  
    .pp-footer {
      display:flex; align-items:center; justify-content:center; gap:8px; padding:10px; background: rgba(20,20,20,.6);
      flex-wrap: wrap;
    }
    .pp-thumb {
      width: 72px; height: 72px; object-fit: cover; border-radius: 8px; opacity:.7; cursor:pointer; border:2px solid transparent;
    }
    .pp-thumb.active { opacity:1; border-color:#fff; }
    `;
  
    // Inject CSS once
    function ensureCSS() {
      if (qs('#pp-css')) return;
      const style = document.createElement('style');
      style.id = 'pp-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  
    // Helpers to derive “original” URL from <img> (fallback path)
    function fromSrcOrSrcset(img) {
      if (!img) return null;
      // Prefer largest from srcset
      if (img.srcset) {
        const parts = img.srcset.split(',').map(p => p.trim());
        let best = null, bestW = 0;
        for (const p of parts) {
          const [url, size] = p.split(' ');
          const w = parseInt(size || '0', 10) || 0;
          if (w >= bestW) { best = url; bestW = w; }
        }
        if (best) return best.replace(/\/\d+x\//, '/originals/');
      }
      if (img.src) return img.src.replace(/\/\d+x\//, '/originals/');
      return null;
    }
  
    // Extract pin id from location
    function getPinIdFromUrl(url = location.href) {
      // /pin/1234567890/   OR  /pin/some-slug/
      const m = url.match(/\/pin\/([^\/?#]+)/i);
      return m ? m[1] : null;
    }
  
      async function fetchPinData(pinId) {
        // Use Pinterest internal resource endpoint (best quality + videos/story pages)
        try {
          const t = Date.now();
          const u = `https://${location.host}/resource/PinResource/get/?source_url=%2Fpin%2F${encodeURIComponent(pinId)}%2F&data=%7B%22options%22%3A%7B%22id%22%3A%22${encodeURIComponent(pinId)}%22%2C%22field_set_key%22%3A%22detailed%22%2C%22noCache%22%3Atrue%7D%2C%22context%22%3A%7B%7D%7D&_=${t}`;
          const res = await fetch(u, { 
            headers: { 'X-Pinterest-PWS-Handler': 'www/pin/[id].js' }, 
            credentials: 'include',
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });
          if (!res.ok) throw new Error('Pin API not ok: ' + res.status);
          const json = await res.json();
          if (json?.resource_response?.status !== 'success') throw new Error('Pin API bad payload');
          return json.resource_response.data; // contains images.orig, videos, story_pin_data.pages, etc.
        } catch (e) {
          // Silent fail for network errors
          return null;
        }
      }
  
    function getBestFromPinData(pin) {
      /** Returns {items: [{type:'image'|'video', url, width, height, thumb?}], title?} */
      const pack = { items: [], title: (pin?.grid_title || pin?.title || '').trim() || '' };
      if (!pin) return pack;
  
      if (pin.videos?.video_list) {
        // choose the largest video by width
        const entries = Object.values(pin.videos.video_list);
        entries.sort((a,b)=> (b.width||0)-(a.width||0));
        const v = entries[0];
        if (v?.url) pack.items.push({ type:'video', url: v.url, width: v.width, height: v.height, thumb: pin.images?.['orig']?.url || '' });
      }
  
      if (pin.story_pin_data?.pages?.length) {
        for (const page of pin.story_pin_data.pages) {
          // story pages can place image in different keys; try a few
          let url = page?.image?.images?.originals?.url
                 || page?.blocks?.[0]?.image?.images?.originals?.url
                 || page?.blocks?.[0]?.image?.images?.orig?.url
                 || '';
          if (url) pack.items.push({ type:'image', url, width: 0, height: 0, thumb: url });
        }
      }
  
      const orig = pin.images?.orig;
      if (orig?.url) {
        // If we already pushed story/video, keep this as first (cover) if items is empty
        if (!pack.items.length) {
          pack.items.push({ type:'image', url: orig.url, width: orig.width||0, height: orig.height||0, thumb: orig.url });
        } else {
          // ensure main orig is present once (dedupe)
          if (!pack.items.some(i => i.url === orig.url)) {
            pack.items.unshift({ type:'image', url: orig.url, width: orig.width||0, height: orig.height||0, thumb: orig.url });
          }
        }
      }
  
      // Dedupe
      const seen = new Set();
      pack.items = pack.items.filter(i => i.url && !seen.has(i.url) && (seen.add(i.url) || true));
      return pack;
    }
  
    function deriveFromDomAsFallback() {
      // Try nearest image from the closeup
      const closeup = qs("div[data-test-id='CloseupMainPin'], div.reactCloseupScrollContainer") || document;
      const img = qs('img[srcset], img[src]', closeup);
      const url = fromSrcOrSrcset(img);
      return url ? [{ type:'image', url, width: 0, height: 0, thumb: url }] : [];
    }
  
    // Overlay (persistent gallery)
    const Overlay = (() => {
      let root, stage, footer, head, titleEl, resEl;
      let currentIndex = 0;
      let items = [];
  
      function build() {
        if (root) return;
        root = document.createElement('div');
        root.className = 'pp-overlay';
        root.innerHTML = `
          <div class="pp-head">
            <div class="pp-actions">
              <button class="pp-btn" id="pp-download">Download</button>
              <button class="pp-btn" id="pp-open">Open</button>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span id="pp-title" class="pp-chip"></span>
              <span id="pp-res" class="pp-chip"></span>
              <button class="pp-btn" id="pp-close">Close</button>
            </div>
          </div>
          <div class="pp-stage"></div>
          <div class="pp-footer"></div>
        `;
        document.body.appendChild(root);
        stage   = qs('.pp-stage', root);
        footer  = qs('.pp-footer', root);
        head    = qs('.pp-head', root);
        titleEl = qs('#pp-title', root);
        resEl   = qs('#pp-res', root);
  
        // Events
        qs('#pp-close', root).addEventListener('click', () => close());
        qs('#pp-download', root).addEventListener('click', async () => {
          const btn = qs('#pp-download', root);
          const originalText = btn.textContent;
          btn.textContent = 'Downloading...';
          btn.disabled = true;
          
          try {
            await downloadCurrent();
            // Add a small delay to make the loading state visible
            await sleep(500);
          } catch (error) {
            btn.textContent = 'Error';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.disabled = false;
            }, 2000);
            return;
          }
          
          // Restore button state
          btn.textContent = originalText;
          btn.disabled = false;
        });
        qs('#pp-open', root).addEventListener('click', () => openCurrent());
  
        // Keyboard nav
        document.addEventListener('keydown', (e) => {
          if (!isOpen()) return;
          if (e.key === 'Escape') close();
          if (e.key === 'ArrowRight') next();
          if (e.key === 'ArrowLeft') prev();
          if (e.key.toLowerCase() === 'd') downloadCurrent();
        }, { capture:true });
        // Swipe (mobile)
        let touchX = 0;
        stage.addEventListener('touchstart', (e) => touchX = e.touches[0].clientX, {passive:true});
        stage.addEventListener('touchend', (e) => {
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
        });
      }
  
      function open(pack) {
        build();
        items = pack.items || [];
        titleEl.textContent = pack.title || '';
        currentIndex = 0;
        render();
        root.classList.add('open');
      }
  
      function close() {
        root?.classList.remove('open');
      }
  
      function isOpen() { return root?.classList.contains('open'); }
  
      function render() {
        // Stage
        stage.innerHTML = '';
        const cur = items[currentIndex];
        if (!cur) return;
  
        let el;
        if (cur.type === 'video') {
          el = document.createElement('video');
          el.className = 'pp-video';
          el.controls = true;
          el.src = cur.url;
        } else {
          el = document.createElement('img');
          el.className = 'pp-img';
          el.alt = titleEl.textContent || 'Image';
          el.src = cur.url;
        }
        el.addEventListener('load', () => {
          const w = (el.videoWidth || el.naturalWidth || cur.width || 0);
          const h = (el.videoHeight || el.naturalHeight || cur.height || 0);
          resEl.textContent = w && h ? `${w}×${h}` : '';
        }, { once:true });
  
        stage.appendChild(el);
  
        // Footer thumbnails
        footer.innerHTML = '';
        items.forEach((it, i) => {
          const t = document.createElement('img');
          t.className = 'pp-thumb' + (i===currentIndex ? ' active' : '');
          t.src = it.thumb || it.url;
          t.title = (i+1) + '/' + items.length;
          t.addEventListener('click', () => { currentIndex = i; render(); });
          footer.appendChild(t);
        });
      }
  
      function next() { if (currentIndex < items.length-1) { currentIndex++; render(); } }
      function prev() { if (currentIndex > 0) { currentIndex--; render(); } }
  
      function current() { return items[currentIndex]; }
  
      async function download(url, filenameHint='image') {
        try {
          const name = filenameHint.replace(/[\/\\?%*:|"<>]/g, '-').slice(0,80) || 'pinterest';
          if (typeof GM_download === 'function') {
            GM_download({ url, name: name + getExt(url) });
          } else {
            const a = document.createElement('a');
            a.href = url; a.download = name + getExt(url);
            document.body.appendChild(a); a.click(); a.remove();
          }
        } catch (e) {
          // Silent fail for download errors
        }
      }
  
      function getExt(u) {
        const q = u.split('?')[0];
        const m = q.match(/\.(mp4|webm|jpg|jpeg|png|gif)$/i);
        return m ? m[0] : (u.includes('mp4') ? '.mp4' : '.jpg');
      }
  
      async function downloadCurrent() {
        const c = current();
        if (!c) return;
        await download(c.url, titleEl.textContent || 'pinterest');
      }
  
      function openCurrent() {
        const c = current();
        if (!c) return;
        if (typeof GM_openInTab === 'function') {
          GM_openInTab(c.url, { active:true, insert:true });
        } else if (typeof GM?.openInTab === 'function') {
          GM.openInTab(c.url, { active:true, insert:true });
        } else {
          window.open(c.url, '_blank');
        }
      }

      return { open, close, isOpen, next, prev, build };
    })();
  
    // Main page logic
    const App = (() => {
      let routeObserverSetup = false;
      let domObserver;
  
      async function init() {
        ensureCSS();
  
        // SPA route detection: patch pushState/replaceState + popstate
        if (!routeObserverSetup) {
          routeObserverSetup = true;
          const push = history.pushState;
          const replace = history.replaceState;
          history.pushState = function(...args) { const r = push.apply(this, args); onRoute(); return r; };
          history.replaceState = function(...args) { const r = replace.apply(this, args); onRoute(); return r; };
          window.addEventListener('popstate', onRoute, { passive:true });
        }
  
        // DOM observer (adds buttons when UI mounts/changes)
        if (!domObserver) {
          domObserver = new MutationObserver((mutations) => {
            // Only process if we're on a pin page and mutations contain relevant nodes
            if (getPinIdFromUrl() && mutations.some(m => 
              m.type === 'childList' && 
              (m.target.matches?.('[data-test-id*="Closeup"]') || 
               m.target.matches?.('[data-test-id*="share"]') ||
               m.target.closest?.('[data-test-id*="Closeup"]'))
            )) {
              injectCloseupButton();
            }
          });
          domObserver.observe(document.documentElement, { childList:true, subtree:true });
        }
  
        // Initial pass
        onRoute();
      }
  
      async function onRoute() {
        // slight debounce wait for pinterest to draw
        await sleep(150);
        injectCloseupButton();
      }
  
      function injectCloseupButton() {
        if (!getPinIdFromUrl()) return; // not on a pin closeup
        // Find a stable action area
        const bar =
          qs("div[data-test-id='share-button']")?.parentElement ||
          qs("div[data-test-id='closeupActionBar']>div>div") ||
          qs("div[data-test-id='CloseupDetails']") ||
          qs("div[data-test-id='CloseupMainPin'] div:has(button)") ||
          null;
  
        if (!bar) return;
        if (qs('#pp-main-btn', bar)) return;
  
        const btn = document.createElement('button');
        btn.id = 'pp-main-btn';
        btn.className = 'pp-btn';
        btn.textContent = 'View';
        btn.setAttribute('aria-label', 'View full size image or video');
        btn.setAttribute('role', 'button');
  
        // Click behaviors
        btn.addEventListener('mousedown', async (e) => {
          e.preventDefault();
          
          // Prevent multiple rapid clicks
          if (btn.disabled) return;
          
          // Left = open overlay
          if (e.button === 0) {
            const pack = await resolveCurrentPinPack();
            if (pack.items.length) Overlay.open(pack);
          }
          // Middle = open first in tab
          if (e.button === 1) {
            const pack = await resolveCurrentPinPack();
            if (pack.items[0]) {
              if (typeof GM_openInTab === 'function') {
                GM_openInTab(pack.items[0].url, { active:true, insert:true });
              } else if (typeof GM?.openInTab === 'function') {
                GM.openInTab(pack.items[0].url, { active:true, insert:true });
              } else {
                window.open(pack.items[0].url, '_blank');
              }
            }
          }
        }, { passive:false });
  
        // Mobile support: tap = open
        btn.addEventListener('touchend', async (e) => {
          const pack = await resolveCurrentPinPack();
          if (pack.items.length) Overlay.open(pack);
        }, { passive:true });
  
        bar.appendChild(btn);
  
        // Also add a small secondary "Download" button next to it
        if (!qs('#pp-mini-download', bar)) {
          const d = document.createElement('button');
          d.id = 'pp-mini-download';
          d.className = 'pp-btn';
          d.textContent = 'Download';
          d.setAttribute('aria-label', 'Download current image or video');
          d.setAttribute('role', 'button');
          d.addEventListener('click', async () => {
            // Prevent multiple rapid clicks
            if (d.disabled) return;
            
            // Show loading state
            const originalText = d.textContent;
            d.textContent = 'Downloading...';
            d.disabled = true;
            
            try {
              const pack = await resolveCurrentPinPack();
              if (!pack.items.length) return;
              const cur = pack.items[0];
              if (typeof GM_download === 'function') {
                GM_download({ url: cur.url, name: (pack.title || 'pinterest') + (cur.url.includes('.mp4')?'.mp4':'.jpg') });
              } else {
                const a = document.createElement('a');
                a.href = cur.url; a.download = (pack.title || 'pinterest');
                document.body.appendChild(a); a.click(); a.remove();
              }
            } catch (error) {
              // Handle errors gracefully
              d.textContent = 'Error';
              setTimeout(() => {
                d.textContent = originalText;
                d.disabled = false;
              }, 2000);
              return;
            }
            
            // Restore button state
            d.textContent = originalText;
            d.disabled = false;
          });
          bar.appendChild(d);
        }
      }

      async function resolveCurrentPinPack() {
        const pinId = getPinIdFromUrl();
        if (!pinId) {
          // fallback from DOM
          const items = deriveFromDomAsFallback();
          return { title:'', items };
        }
        const data = await fetchPinData(pinId);
        const pack = getBestFromPinData(data);
        if (!pack.items.length) {
          // fallback to DOM
          const items = deriveFromDomAsFallback();
          pack.items = items;
        }
        if (!pack.title) {
          // Try alt text near image
          const img = qs('img[alt]');
          if (img?.alt?.length) pack.title = img.alt;
        }
        pack.title = (pack.title || '').replace(/[\/\\?%*:|"<>]/g, '-').slice(0, 80);
        return pack;
      }
  
      return { init };
    })();
  
    // Initialize
    window.addEventListener('load', () => App.init());
  })();
  