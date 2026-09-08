// 越南 10 天 · 「今天」tab —— W1
(function () {
  'use strict';

  function renderToday(root, params) {
    var VNAPP = window.VNAPP;
    var DATA = VNAPP.DATA, esc = VNAPP.esc, itemCard = VNAPP.itemCard;
    root.innerHTML = '';

    var day = (params && params.day) || VNAPP.state.ui.day;
    if (!VNAPP.findDay(day)) {
      day = VNAPP.todayKey() || (DATA.days[0] && DATA.days[0].d) || '';
    }
    var dayObj = VNAPP.findDay(day);

    var wrap = document.createElement('div');

    // 页头：压在顶栏花砖上（越南文城市名 + 中文大字 + 一句话）
    var VNCITY = {'河内':'HÀ NỘI','岘港':'ĐÀ NẴNG','会安':'HỘI AN','芽庄':'NHA TRANG',
                  '胡志明':'SÀI GÒN','五行山':'NGŨ HÀNH SƠN','巴拿山':'BÀ NÀ HILLS'};
    function kickerOf(city) {
      var first = String(city || '').split(/[→·]/)[0].trim();
      return VNCITY[first] || 'VIỆT NAM';
    }

    // 日期条
    var chipRow = document.createElement('div');
    chipRow.className = 'chip-row';
    (DATA.days || []).forEach(function (d) {
      var c = document.createElement('div');
      c.className = 'chip' + (d.d === day ? ' on' : '');
      c.textContent = d.d + ' ' + d.w;
      c.addEventListener('click', function () { VNAPP.go('today', { day: d.d }); });
      chipRow.appendChild(c);
    });
    var ph = document.createElement('div');
    ph.className = 'pagehead';
    ph.innerHTML = '<div class="ph-k">' + esc(kickerOf(dayObj && dayObj.city)) + '</div>'
      + '<div class="ph-t serif">' + esc((dayObj && dayObj.city) || '越南 10 天') + '</div>'
      + '<div class="ph-s">' + esc(day + ' ' + ((dayObj && dayObj.w) || '')) + (dayObj && dayObj.title ? ' · ' + esc(dayObj.title) : '') + '</div>';
    wrap.appendChild(ph);
    wrap.appendChild(chipRow);

    if (!dayObj) {
      var emptyEl = document.createElement('div');
      emptyEl.className = 'empty';
      emptyEl.textContent = '这天没排（数据没对上，找枳看看）';
      wrap.appendChild(emptyEl);
      root.appendChild(wrap);
      return;
    }

    // 天头
    if (dayObj.note) {
      var head = document.createElement('div');
      head.className = 'card';
      head.innerHTML = '<details><summary class="small" style="cursor:pointer">展开今日提示</summary>'
        + '<div class="small" style="margin-top:6px;white-space:pre-wrap;line-height:1.6">' + esc(dayObj.note) + '</div></details>';
      wrap.appendChild(head);
    }

    // 各时段模块
    (dayObj.slots || []).forEach(function (slotObj) {
      var eff = VNAPP.slotItems(day, slotObj.slot);
      var planSlot = (VNAPP.state.plan[day] && VNAPP.state.plan[day][slotObj.slot]) || {};
      var slotSkipped = planSlot.skipped || [];
      var rendered = {};
      var card = document.createElement('div');
      card.className = 'card';

      var titleHtml = '<div class="card-title sl-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
        + '<span class="sl-txt">' + esc(slotObj.label)
        + (slotObj.slot === 'dawn' ? '<span class="ic-tag" style="margin-left:6px">选做</span>' : '')
        + '</span>'
        + '<button class="btn ghost" data-act="add-slot" data-day="' + esc(day) + '" data-slot="' + esc(slotObj.slot) + '" style="min-height:30px;padding:0 10px;font-size:12px">＋ 加一个</button>'
        + '</div>';

      var bodyHtml = '';
      if (slotObj.note) bodyHtml += '<div class="small" style="margin-bottom:8px;white-space:pre-wrap;line-height:1.6">' + esc(slotObj.note) + '</div>';

      var mainHtml = '';
      var todoHtml = '';
      (slotObj.main || []).forEach(function (entry, idx) {
        if (entry.ids && entry.ids.length) {
          var visibleIds = entry.ids.filter(function (id) { return eff.main.indexOf(id) !== -1; });
          if (!visibleIds.length) return; // 整条被跳过了
          if (entry.text) mainHtml += '<div class="small" style="margin:6px 0 2px">' + esc(entry.text) + '</div>';
          visibleIds.forEach(function (id) {
            rendered[id] = true;
            mainHtml += itemCard(id, { showSkip: true, showReplace: true, day: day, slot: slotObj.slot });
          });
        } else if (entry.text) {
          var key = 'todo:' + day + ':' + slotObj.slot + ':' + idx;
          var checked = !!VNAPP.state.done[key];
          todoHtml += '<label class="row" data-todo="' + esc(key) + '"><input type="checkbox" ' + (checked ? 'checked' : '') + '>'
            + '<span' + (checked ? ' style="color:var(--t3);text-decoration:line-through"' : '') + '>' + esc(entry.text) + '</span></label>';
        }
      });
      // 挪进来 / 换上来、但不属于任何默认 main 条目的项
      eff.main.forEach(function (id) {
        if (!rendered[id]) {
          rendered[id] = true;
          mainHtml += itemCard(id, { showSkip: true, showReplace: true, day: day, slot: slotObj.slot });
        }
      });

      if (!mainHtml && !todoHtml) {
        bodyHtml += '<div class="empty" style="padding:10px 0">这段没排</div>';
      } else {
        bodyHtml += mainHtml + todoHtml;
      }

      // 或：alt —— 每个候选独立成卡，可换上来 / 替换 / 取消
      var altParts = [];
      (slotObj.alt || []).forEach(function (entry) {
        if (entry.ids && entry.ids.length) {
          var visibleAltIds = entry.ids.filter(function (id) { return slotSkipped.indexOf(id) === -1; });
          if (!visibleAltIds.length) return; // 整条被取消了
          if (entry.text && visibleAltIds.length > 1) {
            altParts.push('<div class="small" style="margin:8px 0 2px">' + esc(entry.text) + '</div>');
          }
          visibleAltIds.forEach(function (id) {
            altParts.push(itemCard(id, { compact: true, showPromote: true, showReplace: true, showSkip: true, day: day, slot: slotObj.slot }));
          });
        } else if (entry.text) {
          altParts.push('<div class="small" style="padding:6px 2px">· ' + esc(entry.text) + '</div>');
        }
      });
      if (altParts.length) {
        bodyHtml += '<div class="small" style="margin:10px 0 4px">或：</div>' + altParts.join('');
      }

      card.innerHTML = titleHtml + bodyHtml;
      wrap.appendChild(card);

      var todoLabels = card.querySelectorAll('[data-todo]');
      for (var j = 0; j < todoLabels.length; j++) {
        (function (label) {
          var key = label.getAttribute('data-todo');
          var cb = label.querySelector('input');
          cb.addEventListener('change', function () {
            if (cb.checked) VNAPP.state.done[key] = new Date().toISOString();
            else delete VNAPP.state.done[key];
            VNAPP.save();
          });
        })(todoLabels[j]);
      }
    });

    // 吃
    if (dayObj.food) {
      var foodCard = document.createElement('div');
      foodCard.className = 'card';
      foodCard.innerHTML = '<div class="card-title">🍜 吃</div><div style="font-size:13.5px;line-height:1.6">' + esc(dayObj.food) + '</div>';
      wrap.appendChild(foodCard);
    }

    // 这天怎么改
    var noteCard = document.createElement('div');
    noteCard.className = 'card';
    var noteKey = 'day:' + day;
    noteCard.innerHTML = '<div class="card-title">这天怎么改</div>'
      + '<textarea placeholder="随手记两句，改动、想法都行…">' + esc(VNAPP.state.notes[noteKey] || '') + '</textarea>';
    wrap.appendChild(noteCard);
    var ta = noteCard.querySelector('textarea');
    var noteTimer = null;
    ta.addEventListener('input', function () {
      var v = ta.value;
      if (noteTimer) clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { VNAPP.state.notes[noteKey] = v; VNAPP.save(); }, 300);
    });

    root.appendChild(wrap);
  }

  window.VNAPP.registerTab('today', {
    title: '今天',
    icon: '📅',
    render: renderToday
  });
})();
