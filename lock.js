// 密码门 —— 真解密，不是把内容藏起来。
// data.enc.js 里只有密文；密码对了才解得出 window.VN，然后才去加载 app.js 和各个 tab。
// 密码不对就是解不开，没有「绕过去看源码」这条路。
(function () {
  'use strict';

  var TABS = ['app.js', 'tab-today.js', 'tab-map.js', 'tab-pool.js', 'tab-bag.js', 'tab-spin.js'];
  var PW_KEY = 'vn10_pw';

  // 跟着 lock.js 自己的 ?v= 走，免得解锁后加载到旧缓存
  var VER = (function () {
    var s = document.currentScript && document.currentScript.src || '';
    var m = s.match(/[?&]v=([^&]+)/);
    return m ? '?v=' + m[1] : '';
  })();

  function b2u(b64) {
    var s = atob(b64), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  async function decrypt(pw, enc) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw),
      'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b2u(enc.salt), iterations: enc.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b2u(enc.iv) }, key, b2u(enc.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  function loadSeq(list, done) {
    if (!list.length) return done();
    var s = document.createElement('script');
    s.src = list[0] + VER;
    s.onload = function () { loadSeq(list.slice(1), done); };
    s.onerror = function () { console.warn('[lock] 加载不到 ' + list[0]); loadSeq(list.slice(1), done); };
    document.body.appendChild(s);
  }

  function start(data) {
    window.VN = data;
    loadSeq(TABS.slice(), function () {
      var g = document.getElementById('vn-lock');
      if (g) g.parentNode.removeChild(g);
      if (window.VNAPP && typeof VNAPP._boot === 'function') VNAPP._boot();
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  function gate() {
    var enc = window.VN_ENC;
    var box = document.createElement('div');
    box.id = 'vn-lock';
    box.innerHTML = ''
      + '<div class="vl-tile"></div>'
      + '<div class="vl-in">'
      + '  <div class="vl-k">VIỆT NAM</div>'
      + '  <div class="vl-t serif">越南 10 天</div>'
      + '  <div class="vl-s">这页在公网上，内容是加密的。输密码打开。</div>'
      + '  <input class="vl-pw" type="password" autocomplete="current-password" '
      + '         inputmode="text" placeholder="密码">'
      + '  <button class="vl-go" type="button">打开</button>'
      + '  <div class="vl-err"></div>'
      + '</div>';
    document.body.appendChild(box);

    var inp = box.querySelector('.vl-pw'), btn = box.querySelector('.vl-go'),
        err = box.querySelector('.vl-err');

    if (!window.crypto || !crypto.subtle) {
      err.textContent = '这个网址不是 https，浏览器不给解密。用 GitHub Pages 那个网址打开。';
      inp.disabled = btn.disabled = true;
      return;
    }
    if (!enc) { err.textContent = '找不到数据文件（data.enc.js 没加载）。'; return; }

    async function tryPw(pw, silent) {
      if (!pw) return false;
      btn.disabled = true; btn.textContent = '解锁中…';
      try {
        var data = await decrypt(pw, enc);
        try { localStorage.setItem(PW_KEY, pw); } catch (e) {}
        start(data);
        return true;
      } catch (e) {
        btn.disabled = false; btn.textContent = '打开';
        if (!silent) { err.textContent = '密码不对'; inp.select(); }
        return false;
      }
    }

    btn.addEventListener('click', function () { err.textContent = ''; tryPw(inp.value.trim()); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { err.textContent = ''; tryPw(inp.value.trim()); }
    });

    var saved = '';
    try { saved = localStorage.getItem(PW_KEY) || ''; } catch (e) {}
    if (saved) tryPw(saved, true).then(function (ok) { if (!ok) inp.focus(); });
    else setTimeout(function () { inp.focus(); }, 60);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', gate);
  else gate();
})();
