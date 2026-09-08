// tab-map.js — W2：「地图」Leaflet 地图 tab
// 只碰这一个文件（+ test/render-map.js）。内容只从 window.VN 读，状态只走 VNAPP.state/VNAPP.save()。
(function () {
  'use strict';

  var CITIES = ['河内', '岘港', '会安', '芽庄', '胡志明'];
  var GOLDEN_ANGLE = 137.5 * Math.PI / 180;
  var VN_CENTER = [16.0, 107.8]; // 全越南兜底视图中心
  var VN_ZOOM = 6;

  var map = null;        // 当前 Leaflet map 实例
  var itemsLayer = null; // 承载所有可见 marker 的 layerGroup
  var itemMarkers = [];  // [{id,type,done,marker}]
  var greyMarkers = [];  // [{zone,name,marker}]
  var filter = { types: null, showGrey: false, showDone: true }; // types: Set

  function ensureStyle() {
    if (document.getElementById('vnmap-style')) return;
    var style = document.createElement('style');
    style.id = 'vnmap-style';
    style.textContent =
      '.map-tab{display:flex;flex-direction:column;height:100%;min-height:0;}' +
      '.mapbar{display:flex;flex-direction:column;gap:6px;padding:8px 10px;background:var(--card,#141418);border-bottom:1px solid var(--line,#26262c);flex:0 0 auto;}' +
      '.mapbar-row{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px;}' +
      '.mapbar-row .chip{flex:0 0 auto;white-space:nowrap;}' +
      '.mapbar-toggles{align-items:center;}' +
      '.mapbar-toggles label.chip{display:flex;align-items:center;gap:4px;min-height:32px;}' +
      '#vnmap-wrap{position:relative;flex:1 1 auto;min-height:420px;}' +
      '#vnmap{position:absolute;inset:0;background:#1a1a1f;}' +
      '.legend{display:flex;flex-wrap:wrap;gap:10px;padding:8px 10px;font-size:12px;color:var(--t2,#9b96a0);background:var(--card,#141418);border-top:1px solid var(--line,#26262c);flex:0 0 auto;}' +
      '.legend .lg-item{display:flex;align-items:center;gap:4px;}' +
      '.legend .dot{width:10px;height:10px;border-radius:50%;display:inline-block;}' +
      '.vnmap-count{color:var(--t3,#6e6b66);font-size:12px;margin-left:auto;}' +
      '.vnmap-empty{padding:16px;text-align:center;color:var(--t3,#6e6b66);font-size:13px;}';
    document.head.appendChild(style);
  }

  // -- 数据整理：把区块级坐标扎堆的点按黄金角螺旋在 15-40 米内散开（仅影响显示坐标）--
  function jitterGroups(list) {
    var groups = {};
    list.forEach(function (it) {
      var k = it.lat.toFixed(5) + ',' + it.lon.toFixed(5);
      (groups[k] = groups[k] || []).push(it);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      var n = g.length;
      if (n <= 1) {
        g[0]._jlat = g[0].lat;
        g[0]._jlon = g[0].lon;
        return;
      }
      g.forEach(function (it, idx) {
        var angle = idx * GOLDEN_ANGLE;
        var radius = 15 + Math.sqrt(idx / (n - 1)) * 25; // 15-40 米
        var dLat = radius * Math.cos(angle) / 111320;
        var dLon = radius * Math.sin(angle) / (111320 * Math.cos(it.lat * Math.PI / 180) || 1);
        it._jlat = it.lat + dLat;
        it._jlon = it.lon + dLon;
      });
    });
  }

  function cityOf(dayCity) {
    if (!dayCity) return '';
    for (var i = 0; i < CITIES.length; i++) {
      if (dayCity.indexOf(CITIES[i]) === 0) return CITIES[i];
    }
    // 兜底：宁平/顺化等非五城，取字符串开头的连续汉字段
    var m = /^[^\s→·]+/.exec(dayCity);
    return m ? m[0] : dayCity;
  }

  function html(root, params, DATA, VNAPP) {
    var typeChips = (DATA.types || []).filter(function (t) { return t !== '交通'; });
    var cityBtns = CITIES.map(function (c) {
      return '<button type="button" class="chip city-chip" data-city="' + VNAPP.esc(c) + '">' + VNAPP.esc(c) + '</button>';
    }).join('');
    var typeBtns = typeChips.map(function (t) {
      return '<button type="button" class="chip type-chip on" data-type="' + VNAPP.esc(t) + '">' +
        '<span class="dot" style="background:' + VNAPP.color(t) + '"></span>' + VNAPP.esc(t) + '</button>';
    }).join('');
    var legend = typeChips.map(function (t) {
      return '<span class="lg-item"><span class="dot" style="background:' + VNAPP.color(t) + '"></span>' + VNAPP.esc(t) + '</span>';
    }).join('') +
      '<span class="lg-item"><span class="dot" style="background:#55555e"></span>否掉的</span>' +
      '<span class="lg-item"><span class="dot" style="background:#3a3a44;border:1.5px solid #7fb069"></span>已打卡</span>';

    root.innerHTML =
      '<div class="map-tab">' +
      '<div class="mapbar">' +
      '<div class="mapbar-row mapbar-cities">' + cityBtns + '</div>' +
      '<div class="mapbar-row mapbar-types">' + typeBtns + '</div>' +
      '<div class="mapbar-row mapbar-toggles">' +
      '<label class="chip toggle"><input type="checkbox" id="vnmap-toggle-grey"> 灰点</label>' +
      '<label class="chip toggle"><input type="checkbox" id="vnmap-toggle-done" checked> 已打卡</label>' +
      '<span class="vnmap-count" id="vnmap-count"></span>' +
      '</div>' +
      '</div>' +
      '<div id="vnmap-wrap"><div id="vnmap"></div></div>' +
      '<div class="legend">' + legend + '</div>' +
      '</div>';
  }

  function render(root, params) {
    var VNAPP = window.VNAPP;
    var DATA = VNAPP.DATA;
    ensureStyle();
    html(root, params, DATA, VNAPP);

    // 重置本次渲染的过滤态（六类型默认全开，灰点默认关，已打卡默认显示）
    filter = { types: new Set((DATA.types || []).filter(function (t) { return t !== '交通'; })), showGrey: false, showDone: true };

    if (typeof L === 'undefined') {
      var wrap = root.querySelector('#vnmap-wrap');
      if (wrap) wrap.innerHTML = '<div class="vnmap-empty">地图库未加载，稍后重试</div>';
      return;
    }

    // 切走再切回：容器要能重建
    if (map) {
      try { map.remove(); } catch (e) { /* 静默 */ }
      map = null;
    }

    var mapEl = root.querySelector('#vnmap');
    map = L.map(mapEl, { scrollWheelZoom: true, tap: true });
    var tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19
    });
    tiles.on('tileerror', function () { /* 离线/加载失败，静默 */ });
    tiles.addTo(map);

    itemsLayer = L.layerGroup().addTo(map);

    // -- 数据 --
    var allItems = Object.keys(DATA.items).map(function (id) { return DATA.items[id]; })
      .filter(function (i) { return i.lat && i.type !== '住'; });
    var allGrey = (DATA.grey || []).filter(function (g) { return g.lat; });
    jitterGroups(allItems.concat(allGrey));

    var state = VNAPP.state || {};
    var doneMap = state.done || {};
    var revivedMap = state.revived || {};

    itemMarkers = allItems.map(function (it) {
      var done = !!doneMap[it.id];
      var marker = L.circleMarker([it._jlat, it._jlon], {
        radius: 7,
        weight: 1.5,
        color: done ? '#7fb069' : '#0c0c0e',
        fillColor: done ? '#3a3a44' : VNAPP.color(it.type),
        fillOpacity: 0.9
      });
      marker.on('click', function () { VNAPP.itemSheet(it.id); });
      return { id: it.id, type: it.type, done: done, marker: marker };
    });

    greyMarkers = allGrey.map(function (g) {
      var marker = L.circleMarker([g._jlat, g._jlon], {
        radius: 6,
        weight: 1,
        color: '#55555e',
        fillColor: '#55555e',
        fillOpacity: 0.5
      });
      marker.on('click', function () { openGreySheet(g, VNAPP); });
      return { zone: g.zone, marker: marker };
    });

    function openGreySheet(g, VNAPP) {
      var body = '<div class="sheet-grey">' +
        '<h3>' + VNAPP.esc(g.name || '') + '</h3>' +
        (g.why ? '<p class="t2">' + VNAPP.esc(g.why) + '</p>' : '') +
        '<button type="button" class="btn" id="vnmap-revive-btn">复活</button>' +
        '</div>';
      var closeFn = VNAPP.sheet(body, function (el) {
        var btn = el.querySelector('#vnmap-revive-btn');
        if (!btn) return;
        btn.addEventListener('click', function () {
          VNAPP.state.revived = VNAPP.state.revived || {};
          VNAPP.state.revived[g.zone] = true;
          VNAPP.save();
          VNAPP.toast('已复活：' + (g.name || ''));
          redraw();
          if (closeFn) closeFn();
        });
      });
    }

    function updateCount() {
      var el = root.querySelector('#vnmap-count');
      if (el) el.textContent = '共 ' + itemsLayer.getLayers().length + ' 处';
    }

    function redraw() {
      itemsLayer.clearLayers();
      var revived = (VNAPP.state && VNAPP.state.revived) || {};
      itemMarkers.forEach(function (m) {
        var typeVisible = m.type === '交通' || filter.types.has(m.type);
        if (!typeVisible) return;
        if (m.done && !filter.showDone) return;
        itemsLayer.addLayer(m.marker);
      });
      if (filter.showGrey) {
        greyMarkers.forEach(function (m) {
          if (!revived[m.zone]) itemsLayer.addLayer(m.marker);
        });
      }
      updateCount();
    }
    redraw();

    // -- 事件绑定 --
    var allItemsWithCity = allItems; // 已过滤 lat && type!=='住'
    Array.prototype.forEach.call(root.querySelectorAll('.city-chip'), function (btn) {
      btn.addEventListener('click', function () {
        var city = btn.getAttribute('data-city');
        var pts = allItemsWithCity.filter(function (i) { return i.city === city; }).map(function (i) { return [i.lat, i.lon]; });
        if (pts.length) {
          map.fitBounds(pts, { padding: [24, 24] });
        } else {
          VNAPP.toast('该城市暂无点位标记');
        }
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('.type-chip'), function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-type');
        if (filter.types.has(t)) { filter.types.delete(t); btn.classList.remove('on'); }
        else { filter.types.add(t); btn.classList.add('on'); }
        redraw();
      });
    });
    var greyToggle = root.querySelector('#vnmap-toggle-grey');
    if (greyToggle) greyToggle.addEventListener('change', function () { filter.showGrey = !!greyToggle.checked; redraw(); });
    var doneToggle = root.querySelector('#vnmap-toggle-done');
    if (doneToggle) doneToggle.addEventListener('change', function () { filter.showDone = !!doneToggle.checked; redraw(); });

    // -- 视图定位 --
    function fitToZone(zoneId) {
      var z = (DATA.zones || {})[zoneId];
      if (!z) { fitDefault(); return; }
      var ids = z.items || [];
      var pts = ids.map(function (id) { return DATA.items[id]; })
        .filter(function (i) { return i && i.lat; })
        .map(function (i) { return [i.lat, i.lon]; });
      if (pts.length) map.fitBounds(pts, { padding: [24, 24] });
      else if (z.lat) map.setView([z.lat, z.lon], 14);
      else fitDefault();
    }

    function fitDefault() {
      var key = VNAPP.todayKey && VNAPP.todayKey();
      if (key) {
        var day = (DATA.days || []).filter(function (d) { return d.d === key; })[0];
        if (day) {
          var city = cityOf(day.city);
          var pts = allItemsWithCity.filter(function (i) { return i.city === city; }).map(function (i) { return [i.lat, i.lon]; });
          if (pts.length) { map.fitBounds(pts, { padding: [24, 24] }); return; }
        }
      }
      var allPts = allItemsWithCity.map(function (i) { return [i.lat, i.lon]; })
        .concat(allGrey.map(function (g) { return [g.lat, g.lon]; }));
      if (allPts.length) map.fitBounds(allPts, { padding: [24, 24] });
      else map.setView(VN_CENTER, VN_ZOOM);
    }

    if (params && params.focus) {
      var it = VNAPP.item(params.focus);
      if (it && it.lat) map.setView([it.lat, it.lon], 15);
      else fitDefault();
      VNAPP.itemSheet(params.focus);
    } else if (params && params.zone) {
      fitToZone(params.zone);
    } else {
      fitDefault();
    }
  }

  window.VNAPP.registerTab('map', {
    kicker: 'BẢN ĐỒ',
    title: '地图',
    icon: '🗺',
    render: render,
    onShow: function () {
      if (map) {
        try { map.invalidateSize(); } catch (e) { /* 静默 */ }
      }
    }
  });
})();
