// 越南 10 天 · 「池子」tab —— W1
// 数据现状（2026-09-07 核）：zone 全部对得上 g_* 区块，city 全部有值，孤儿 item 为 0。
// 早先那版（commit 6620b1d）有 165/356 个 item 的 zone 卡在 z_* 旧 id 上、28 个 city 为空，
// 已在 0f65c38 修掉：z_* 走 old2new / z2g / Z_FALLBACK 三级映射，大叻整城在 add_item 里直接 return。
// 下面的「其他」兜底桶保留——它还要接住没有 zone 的 item 和没复活的灰区，不是只为那批孤儿准备的。
(function () {
  'use strict';

  var typeFilters = [];   // 本次打开 App 期间的临时筛选，不写进 state（§3 没定义要存）
  var onlyHeart = false;
  var onlyUndone = false;

  function isGreyZoneId(zid) {
    var DATA = window.VNAPP.DATA;
    return (DATA.grey || []).some(function (g) { return g.zone === zid; });
  }

  // ---- 「排进…」小选择器：11 天 × 有的时段，点一个就 promoteAlt 进那个槽 ----
  function openSlotPicker(id) {
    var VNAPP = window.VNAPP;
    var DATA = VNAPP.DATA, esc = VNAPP.esc, labelSlot = VNAPP.labelSlot;
    var it = VNAPP.item(id);
    if (!it) { VNAPP.toast('找不到这个点'); return; }
    var rows = (DATA.days || []).map(function (d) {
      var btns = (d.slots || []).map(function (s) {
        return '<button class="btn ghost" data-day="' + esc(d.d) + '" data-slot="' + esc(s.slot) + '" style="margin:3px">'
          + esc(labelSlot(s.slot)) + '</button>';
      }).join('');
      return '<div style="margin-bottom:8px"><div class="small" style="margin-bottom:4px">' + esc(d.d + ' ' + d.w) + '</div>'
        + '<div style="display:flex;flex-wrap:wrap">' + btns + '</div></div>';
    }).join('');
    var html = '<h3 class="serif" style="margin:4px 26px 8px 0">排进哪天</h3>'
      + '<div class="small" style="margin-bottom:10px">' + esc(it.name) + '</div>'
      + rows;
    VNAPP.sheet(html, function (box, close) {
      box.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-day]');
        if (!btn) return;
        var day = btn.getAttribute('data-day');
        var slot = btn.getAttribute('data-slot');
        VNAPP.promoteAlt(day, slot, [id]);
        VNAPP.toast('排进了 ' + day + ' ' + labelSlot(slot));
        close();
      });
    });
  }
  window.VNAPP._openSlotPicker = openSlotPicker;

  function renderPool(root, params) {
    var VNAPP = window.VNAPP;
    var DATA = VNAPP.DATA, esc = VNAPP.esc, itemCard = VNAPP.itemCard, item = VNAPP.item;
    root.innerHTML = '';
    var wrap = document.createElement('div');

    function passFilter(it) {
      if (typeFilters.length && typeFilters.indexOf(it.type) === -1) return false;
      if (onlyHeart && !VNAPP.state.hearts[it.id]) return false;
      if (onlyUndone && VNAPP.state.done[it.id]) return false;
      return true;
    }

    // ---- 过滤 chip ----
    var filterCard = document.createElement('div');
    var typeChips = (DATA.types || []).filter(function (t) { return t !== '交通'; }).map(function (t) {
      return '<div class="chip' + (typeFilters.indexOf(t) !== -1 ? ' on' : '') + '" data-type="' + esc(t) + '">'
        + '<span class="dot" style="background:' + VNAPP.color(t) + ';margin:0"></span>' + esc(t) + '</div>';
    }).join('');
    filterCard.innerHTML = '<div class="chip-row">' + typeChips
      + '<div class="chip' + (onlyHeart ? ' on' : '') + '" data-only-heart="1">只看 ❤</div>'
      + '<div class="chip' + (onlyUndone ? ' on' : '') + '" data-only-undone="1">只看未打卡</div>'
      + '</div>';
    wrap.appendChild(filterCard);

    // ---- 组区块：city -> zone -> items ----
    var blocks = [];
    Object.keys(DATA.zones || {}).forEach(function (zid) {
      if (zid.indexOf('g_stay_') === 0) return; // 住宿不进池子（§0 规则 5）
      if (isGreyZoneId(zid) && !VNAPP.state.revived[zid]) return; // 灰的且没复活
      var z = DATA.zones[zid];
      blocks.push({ id: zid, name: z.name, city: z.city || '', best: z.best, items: (z.items || []).slice() });
    });
    // 复活了、但不在 zones 字典里的灰区（grey 里有几个是独立的，不挂在 zones 上）
    (DATA.grey || []).forEach(function (g) {
      if (!VNAPP.state.revived[g.zone] || DATA.zones[g.zone]) return;
      var counts = {}, cityGuess = '', best = 0;
      (g.items || []).forEach(function (id) { var it = item(id); if (it && it.city) counts[it.city] = (counts[it.city] || 0) + 1; });
      Object.keys(counts).forEach(function (c) { if (counts[c] > best) { best = counts[c]; cityGuess = c; } });
      blocks.push({ id: g.zone, name: g.name, city: cityGuess, items: (g.items || []).slice() });
    });

    var usedItemIds = {};
    blocks.forEach(function (b) {
      b.items = b.items.filter(function (id) {
        var it = item(id);
        if (!it || it.type === '交通' || it.type === '住') return false;
        usedItemIds[id] = true;
        return passFilter(it);
      });
    });

    // 没被任何正常区块盖到的 item（zone 对不上 / 没 zone / 灰区还没复活但类型不明）
    var orphans = {};
    Object.keys(DATA.items || {}).forEach(function (id) {
      var it = item(id);
      if (!it || it.type === '交通' || it.type === '住') return;
      if (usedItemIds[id]) return;
      if (isGreyZoneId(it.zone) && !VNAPP.state.revived[it.zone]) return; // 交给灰区块显示
      if (!passFilter(it)) return;
      var c = it.city || '未分类';
      if (!orphans[c]) orphans[c] = [];
      orphans[c].push(id);
    });

    // ---- 城市顺序：spec 五城在前，数据里其余城市按发现顺序补在后面 ----
    var cityOrder = ['河内', '岘港', '会安', '芽庄', '胡志明'];
    var seen = {};
    cityOrder.forEach(function (c) { seen[c] = true; });
    blocks.forEach(function (b) { if (b.city && !seen[b.city]) { seen[b.city] = true; cityOrder.push(b.city); } });
    Object.keys(orphans).forEach(function (c) { if (!seen[c]) { seen[c] = true; cityOrder.push(c); } });

    var anyRendered = false;
    cityOrder.forEach(function (city) {
      var cityBlocks = blocks.filter(function (b) { return b.city === city; });
      var cityOrphans = orphans[city] || [];
      var hasContent = cityOrphans.length > 0 || cityBlocks.some(function (b) { return b.items.length > 0; });
      if (!hasContent) return;
      anyRendered = true;
      var cityCard = document.createElement('div');
      cityCard.className = 'card';
      var html = '<div class="card-title serif">' + esc(city) + '</div>';
      cityBlocks.forEach(function (b) {
        if (!b.items.length) return;
        html += '<div style="margin:10px 0 6px">'
          + '<b style="font-size:13px">' + esc(b.name) + '</b>'
          + (b.best ? '<div class="small">最佳时段：' + esc(b.best) + '</div>' : '')
          + '</div>';
        b.items.forEach(function (id) { html += itemCard(id, { compact: true, showDay: true, showAddToPlan: true }); });
      });
      if (cityOrphans.length) {
        html += '<div style="margin:10px 0 6px"><b style="font-size:13px">其他</b></div>';
        cityOrphans.forEach(function (id) { html += itemCard(id, { compact: true, showDay: true, showAddToPlan: true }); });
      }
      cityCard.innerHTML = html;
      wrap.appendChild(cityCard);
    });
    if (!anyRendered) {
      var emptyEl = document.createElement('div');
      emptyEl.className = 'empty';
      emptyEl.textContent = '这个筛选下什么都没有';
      wrap.appendChild(emptyEl);
    }

    // ---- 灰点区：否掉的 ----
    var greyList = (DATA.grey || []).filter(function (g) { return !VNAPP.state.revived[g.zone]; });
    if (greyList.length) {
      var greyHead = document.createElement('div');
      greyHead.className = 'card-title';
      greyHead.style.margin = '18px 4px 6px';
      greyHead.textContent = '否掉的';
      wrap.appendChild(greyHead);
      greyList.forEach(function (g) {
        var gcard = document.createElement('div');
        gcard.className = 'card';
        gcard.style.opacity = '.72';
        var visibleIds = (g.items || []).filter(function (id) { var it = item(id); return it && passFilter(it); });
        var cardsHtml = visibleIds.map(function (id) { return itemCard(id, { compact: true }); }).join('');
        gcard.innerHTML = '<div class="card-title" style="color:var(--t2)">' + esc(g.name) + '</div>'
          + '<div class="small" style="margin-bottom:8px;line-height:1.6">' + esc(g.why || '') + '</div>'
          + (cardsHtml ? '<div style="filter:grayscale(1)">' + cardsHtml + '</div>' : '')
          + '<button class="btn gold" data-revive="' + esc(g.zone) + '" style="margin-top:8px">复活这个区块</button>';
        wrap.appendChild(gcard);
      });
    }

    root.appendChild(wrap);

    // ---- 绑定交互（每次 render 都是全新元素，直接绑不会累加）----
    var typeEls = wrap.querySelectorAll('[data-type]');
    for (var i = 0; i < typeEls.length; i++) {
      (function (chip) {
        chip.addEventListener('click', function () {
          var t = chip.getAttribute('data-type');
          var idx = typeFilters.indexOf(t);
          if (idx === -1) typeFilters.push(t); else typeFilters.splice(idx, 1);
          renderPool(root, params);
        });
      })(typeEls[i]);
    }
    var heartChip = wrap.querySelector('[data-only-heart]');
    if (heartChip) heartChip.addEventListener('click', function () { onlyHeart = !onlyHeart; renderPool(root, params); });
    var undoneChip = wrap.querySelector('[data-only-undone]');
    if (undoneChip) undoneChip.addEventListener('click', function () { onlyUndone = !onlyUndone; renderPool(root, params); });
    var reviveEls = wrap.querySelectorAll('[data-revive]');
    for (var j = 0; j < reviveEls.length; j++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          VNAPP.state.revived[btn.getAttribute('data-revive')] = true;
          VNAPP.save();
          VNAPP.toast('复活了');
        });
      })(reviveEls[j]);
    }
  }

  window.VNAPP.registerTab('pool', {
    kicker: 'ĐIỂM ĐẾN',
    title: '池子',
    icon: '🗂',
    render: renderPool
  });
})();
