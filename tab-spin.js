// tab-spin.js — W3：「转盘」随机挑 + 是/否硬币
// 依赖 VNAPP.slotItems(day,slot)（若 W1 还没实现，本文件自带 fallback：localSlotItems）。
(function () {
  'use strict';

  var SLOT_LABEL = { dawn: '凌晨', am: '上午', pm: '下午', eve: '晚上' };
  var KNOWN_CITIES = ['河内', '岘港', '会安', '芽庄', '胡志明', '宁平', '顺化'];
  var COIN_PHRASES = [
    '听我的没错',
    '再想想也不迟',
    '那就这样定了',
    '宇宙沉默不语，但骰子说了算',
    '要不掷两次？'
  ];

  // ---- 小 DOM helper（与 tab-bag.js 同款，各文件独立不共享） ----
  function el(tag, props) {
    var e = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null) return;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style') { e.style.cssText = v; }
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          e.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          try { e[k] = v; } catch (_e) {}
          if (typeof v === 'string' || typeof v === 'number') {
            if (e.setAttribute) e.setAttribute(k, v);
          }
        }
      });
    }
    children.forEach(function (c) { appendChild(e, c); });
    return e;
  }
  function appendChild(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (cc) { appendChild(e, cc); }); return; }
    if (typeof c === 'string' || typeof c === 'number') {
      e.appendChild(document.createTextNode(String(c)));
    } else {
      e.appendChild(c);
    }
  }
  function safe(s) { return s == null ? '' : String(s); }

  var STYLE = [
    '.spin-tab{padding:12px 14px 90px;display:flex;flex-direction:column;gap:14px}',
    '.spin-chips{display:flex;gap:8px;flex-wrap:wrap}',
    '.spin-zone-sel{width:100%;background:var(--card,#141418);border:1px solid var(--line,#26262c);color:var(--t1,#e8e4dc);border-radius:8px;padding:10px;font-size:14px;min-height:44px}',
    '.spin-wheel-area{display:flex;flex-direction:column;align-items:center;gap:14px;padding:16px 0}',
    '.spin-wheel-pointer{width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-top:16px solid var(--accent,#d4503c);margin-bottom:-2px;z-index:2}',
    '.spin-wheel-outer{position:relative;width:260px;height:260px}',
    '.spin-wheel-wrap{width:260px;height:260px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 4px var(--line,#26262c)}',
    '.spin-result{text-align:center;min-height:44px;font-size:14px;color:var(--t2,#9b96a0)}',
    '.spin-result b{color:var(--t1,#e8e4dc);font-size:16px}',
    '.spin-empty{color:var(--t3,#6e6b66);font-size:13px;text-align:center;padding:20px 0}',
    '.spin-coin-btn{width:100%;font-size:16px;padding:16px}',
    '.spin-coin-result{text-align:center;padding:14px 0}',
    '.spin-coin-result .big{font-size:40px;font-weight:700;line-height:1.2}',
    '.spin-coin-result .big.yes{color:var(--accent,#d4503c)}',
    '.spin-coin-result .big.no{color:var(--t2,#9b96a0)}',
    '.spin-history{font-size:13px;color:var(--t2,#9b96a0)}',
    '.spin-history-row{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--line,#26262c)}',
    '.spin-history-row:first-child{border-top:none}'
  ].join('');

  // ---- 模块级状态（纯本地 UI 状态，不进 VNAPP.state） ----
  var poolMode = 'today'; // today | zone | hearts
  var poolZone = null;
  var wheelItems = null;
  var wheelRotation = 0;
  var spinning = false;
  var lastResultId = null;
  var coinFlipping = false;
  var coinResult = null; // {yes, phrase}

  function ensureBag() {
    var st = VNAPP.state;
    if (!st.bag) st.bag = {};
    var b = st.bag;
    if (!Array.isArray(b.spins)) b.spins = [];
    if (!Array.isArray(b.expenses)) b.expenses = [];
    if (!b.check) b.check = {};
    if (typeof b.memo !== 'string') b.memo = '';
    if (!b.open) b.open = {};
    return b;
  }

  function nameOf(id) {
    var it = VNAPP.item(id);
    return it ? it.name : id;
  }

  function cityOf(dayCity) {
    if (!dayCity) return null;
    for (var i = 0; i < KNOWN_CITIES.length; i++) {
      if (dayCity.indexOf(KNOWN_CITIES[i]) !== -1) return KNOWN_CITIES[i];
    }
    return null;
  }

  function currentDay(D, state) {
    return VNAPP.todayKey() || (state.ui && state.ui.day) || (D.days[0] && D.days[0].d) || null;
  }

  function defaultZoneId(D, state) {
    var day = (D.days || []).filter(function (d) { return d.d === currentDay(D, state); })[0];
    var city = day ? cityOf(day.city) : null;
    var zoneIds = Object.keys(D.zones || {});
    if (city) {
      for (var i = 0; i < zoneIds.length; i++) {
        if (D.zones[zoneIds[i]].city === city) return zoneIds[i];
      }
    }
    return zoneIds[0] || null;
  }

  // fallback：若 VNAPP.slotItems 还没实现
  function localSlotItems(D, state, day, slot) {
    var d = (D.days || []).filter(function (x) { return x.d === day; })[0];
    if (!d) return [];
    var sl = (d.slots || []).filter(function (s) { return s.slot === slot; })[0];
    if (!sl) return [];
    var planned = state.plan && state.plan[day] && state.plan[day][slot];
    var ids = [];
    if (planned && planned.chosen) {
      ids = planned.chosen.slice();
    } else {
      (sl.main || []).forEach(function (m) { (m.ids || []).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); }); });
    }
    var skipped = (planned && planned.skipped) || [];
    (sl.alt || []).forEach(function (a) {
      (a.ids || []).forEach(function (id) {
        if (ids.indexOf(id) === -1 && skipped.indexOf(id) === -1) ids.push(id);
      });
    });
    ids = ids.filter(function (id) { return skipped.indexOf(id) === -1; });
    Object.keys(state.moved || {}).forEach(function (id) {
      var mv = state.moved[id];
      if (mv && mv.to === day && mv.slot === slot && ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }

  function slotItemsOf(D, state, day, slot) {
    // SPEC §2：slotItems 返回 {main:[ids], alt:[ids], moved_in:[ids]}，转盘要的是当天所有候选 → 拍平去重
    if (typeof VNAPP.slotItems === 'function') {
      var r = VNAPP.slotItems(day, slot) || {};
      if (Array.isArray(r)) return r;
      var seen = {}, out = [];
      [].concat(r.main || [], r.alt || [], r.moved_in || []).forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
      return out;
    }
    return localSlotItems(D, state, day, slot);
  }

  function computePool(D, state) {
    if (poolMode === 'hearts') {
      return Object.keys(state.hearts || {}).filter(function (id) { return VNAPP.item(id); });
    }
    if (poolMode === 'zone') {
      var z = D.zones[poolZone];
      if (!z) return [];
      return (z.items || []).filter(function (id) { return VNAPP.item(id); });
    }
    // today
    var day = currentDay(D, state);
    if (!day) return [];
    var ids = [];
    Object.keys(SLOT_LABEL).forEach(function (slot) {
      slotItemsOf(D, state, day, slot).forEach(function (id) {
        if (ids.indexOf(id) === -1) ids.push(id);
      });
    });
    return ids.filter(function (id) { return !(state.done && state.done[id]); });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pickPool(D, state) {
    var pool = computePool(D, state);
    wheelItems = shuffle(pool).slice(0, 12);
    wheelRotation = 0;
    lastResultId = null;
  }

  function drawWheel(canvas, ids) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width || 260, h = canvas.height || 260;
    var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 4;
    if (ctx.clearRect) ctx.clearRect(0, 0, w, h);
    var n = ids.length;
    if (!n) return;
    var step = (2 * Math.PI) / n;
    ids.forEach(function (id, i) {
      var it = VNAPP.item(id);
      var color = it ? VNAPP.color(it.type) : '#888';
      var start = -Math.PI / 2 + i * step;
      var end = start + step;
      if (ctx.beginPath) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.25)';
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(start + step / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#111';
        ctx.font = '12px sans-serif';
        var label = it ? String(it.name).slice(0, 6) : '?';
        ctx.fillText(label, r - 8, 4);
        ctx.restore();
      }
    });
  }

  function render(root) {
    var D = VNAPP.DATA;
    var state = VNAPP.state;
    ensureBag();

    if (poolZone == null) poolZone = defaultZoneId(D, state);
    if (wheelItems == null) pickPool(D, state);

    root.innerHTML = '';
    var style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);

    var wrap = el('div', { class: 'spin-tab' });

    // 池子来源 chip
    var modes = [['today', '今天的候选'], ['zone', '某个区块'], ['hearts', '全部 ❤']];
    var chipsRow = el('div', { class: 'spin-chips' });
    modes.forEach(function (m) {
      var on = poolMode === m[0];
      chipsRow.appendChild(el('button', {
        class: 'chip' + (on ? ' on' : ''), type: 'button', onclick: function () {
          if (poolMode === m[0]) return;
          poolMode = m[0];
          if (poolMode === 'zone' && !poolZone) poolZone = defaultZoneId(D, state);
          pickPool(D, state);
          render(root);
        }
      }, m[1]));
    });
    var poolCard = el('div', { class: 'card', style: 'padding:12px' }, chipsRow);

    if (poolMode === 'zone') {
      var sel = el('select', { class: 'spin-zone-sel', style: 'margin-top:10px' });
      var cityGroups = {};
      var cityOrder = [];
      Object.keys(D.zones || {}).forEach(function (zid) {
        var z = D.zones[zid];
        var c = z.city || '其它';
        if (!cityGroups[c]) { cityGroups[c] = []; cityOrder.push(c); }
        cityGroups[c].push(zid);
      });
      cityOrder.forEach(function (c) {
        var grp = el('optgroup', { label: c });
        cityGroups[c].forEach(function (zid) {
          grp.appendChild(el('option', { value: zid, selected: zid === poolZone || null }, D.zones[zid].name));
        });
        sel.appendChild(grp);
      });
      sel.addEventListener('change', function () {
        poolZone = sel.value;
        pickPool(D, state);
        render(root);
      });
      poolCard.appendChild(sel);
    }
    wrap.appendChild(poolCard);

    // 转盘
    var wheelCard = el('div', { class: 'card' });
    if (!wheelItems.length) {
      wheelCard.appendChild(el('div', { class: 'spin-empty' }, '这个池子是空的，换一个来源试试'));
    } else {
      var canvas = el('canvas', { width: 260, height: 260 });
      var wheelWrap = el('div', { class: 'spin-wheel-wrap', style: 'transform:rotate(' + wheelRotation + 'deg);transition:none' }, canvas);
      var resultBox = el('div', { class: 'spin-result' },
        lastResultId ? el('span', null, '停在了 ', el('b', null, nameOf(lastResultId))) : '转一下试试'
      );
      var spinBtn = el('button', { class: 'btn', type: 'button', style: 'width:100%' }, spinning ? '转呢…' : '转 🎡');
      spinBtn.addEventListener('click', function () {
        if (spinning) return;
        var pool = wheelItems;
        if (!pool.length) { VNAPP.toast('这个池子是空的'); return; }
        spinning = true;
        spinBtn.textContent = '转呢…';
        resultBox.textContent = '';
        var n = pool.length;
        var step = 360 / n;
        var winnerIdx = Math.floor(Math.random() * n);
        var winnerId = pool[winnerIdx];
        var extraSpins = 4 + Math.floor(Math.random() * 3);
        var base = wheelRotation - (wheelRotation % 360);
        var targetWithinTurn = 360 - (winnerIdx * step + step / 2);
        var finalRotation = base + extraSpins * 360 + targetWithinTurn;
        if (finalRotation <= wheelRotation) finalRotation += 360;
        wheelWrap.style.transition = 'transform 2.6s cubic-bezier(.17,.67,.22,1)';
        void wheelWrap.offsetWidth; // 强制 reflow，让 transition 生效
        wheelWrap.style.transform = 'rotate(' + finalRotation + 'deg)';
        setTimeout(function () {
          wheelRotation = finalRotation;
          spinning = false;
          lastResultId = winnerId;
          var bag = ensureBag();
          bag.spins.unshift({ type: 'wheel', id: winnerId, name: nameOf(winnerId), t: new Date().toISOString() });
          bag.spins = bag.spins.slice(0, 5);
          VNAPP.save();
          VNAPP.itemSheet(winnerId);
        }, 2650);
      });
      drawWheel(canvas, wheelItems);
      wheelCard.appendChild(el('div', { class: 'spin-wheel-area' },
        el('div', { class: 'spin-wheel-pointer' }),
        el('div', { class: 'spin-wheel-outer' }, wheelWrap),
        resultBox,
        spinBtn
      ));
    }
    wrap.appendChild(wheelCard);

    // 是/否硬币
    var coinCard = el('div', { class: 'card', style: 'padding:14px' });
    var coinResultBox = el('div', { class: 'spin-coin-result' },
      coinResult
        ? [el('div', { class: 'big ' + (coinResult.yes ? 'yes' : 'no') }, coinResult.yes ? '是' : '否'),
           el('div', null, coinResult.phrase)]
        : el('div', { style: 'color:var(--t3,#6e6b66)' }, '拿不定主意？丢一次')
    );
    var coinBtn = el('button', { class: 'btn spin-coin-btn', type: 'button' }, coinFlipping ? '…' : '抛一下');
    coinBtn.addEventListener('click', function () {
      if (coinFlipping) return;
      coinFlipping = true;
      coinBtn.textContent = '…';
      coinResultBox.innerHTML = '';
      coinResultBox.appendChild(el('div', { style: 'color:var(--t3,#6e6b66)' }, '…'));
      setTimeout(function () {
        var yes = Math.random() < 0.5;
        var phrase = COIN_PHRASES[Math.floor(Math.random() * COIN_PHRASES.length)];
        coinResult = { yes: yes, phrase: phrase };
        coinFlipping = false;
        var bag = ensureBag();
        bag.spins.unshift({ type: 'coin', yes: yes, phrase: phrase, t: new Date().toISOString() });
        bag.spins = bag.spins.slice(0, 5);
        VNAPP.save();
      }, 1000);
    });
    coinCard.appendChild(el('div', null, coinResultBox, coinBtn));
    wrap.appendChild(coinCard);

    // 历史
    var bag = ensureBag();
    var histCard = el('div', { class: 'card', style: 'padding:12px' },
      el('div', { style: 'font-weight:600;margin-bottom:6px' }, '最近 5 次')
    );
    if (!bag.spins.length) {
      histCard.appendChild(el('div', { class: 'spin-empty' }, '还没转过'));
    } else {
      var histList = el('div', { class: 'spin-history' });
      bag.spins.forEach(function (s) {
        var label = s.type === 'coin' ? (s.yes ? '是' : '否') + '（' + safe(s.phrase) + '）' : safe(s.name || nameOf(s.id));
        var when = safe(s.t || '').slice(5, 16).replace('T', ' ');
        histList.appendChild(el('div', { class: 'spin-history-row' }, el('span', null, label), el('span', null, when)));
      });
      histCard.appendChild(histList);
    }
    wrap.appendChild(histCard);

    root.appendChild(wrap);
  }

  VNAPP.registerTab('spin', {
    kicker: 'QUAY SỐ', title: '转盘', icon: '🎡', render: render });
})();
