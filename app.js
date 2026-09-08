// 越南 10 天 · 共享层 VNAPP —— W1
// 接口按 SPEC-APP.md §2 写；额外补的小口子（promoteAlt/skipItem/labelSlot/findDay/findSlot）
// 是给 tab-*.js 用的实现细节，不算破坏接口。
(function () {
  'use strict';

  var DATA = window.VN || {
    meta: {}, colors: {}, types: [], days: [], items: {}, zones: {},
    grey: [], bookings: [], transport: [], budget: [], emergency: [],
    checklist: { 出发前: [], 每天: [] }, stay: {}
  };

  var STORE_KEY = 'vn:state:v2';
  var SLOT_LABEL = { dawn: '凌晨', am: '上午', pm: '下午', eve: '晚上' };
  var SLOT_ORDER = ['dawn', 'am', 'pm', 'eve'];

  // ---------- state ----------
  function defaultState() {
    return {
      v: 2,
      ui: { tab: 'today', day: (DATA.days[0] && DATA.days[0].d) || '', params: {} },
      plan: {},
      moved: {},
      done: {},
      hearts: {},
      revived: {},
      notes: {},
      bag: { check: {}, memo: '', expenses: [] }
    };
  }

  function loadState() {
    var d = defaultState();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return d;
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return d;
      return {
        v: 2,
        ui: Object.assign({}, d.ui, p.ui || {}),
        plan: p.plan || {},
        moved: p.moved || {},
        done: p.done || {},
        hearts: p.hearts || {},
        revived: p.revived || {},
        notes: p.notes || {},
        bag: Object.assign({}, d.bag, p.bag || {}, { expenses: (p.bag && p.bag.expenses) || [] })
      };
    } catch (e) {
      console.warn('[VNAPP] state 读取失败，用默认值', e);
      return d;
    }
  }

  var state = loadState();

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('[VNAPP] state 写入失败', e); }
  }

  // 只落盘、不重渲。折叠、勾选、记事这类纯界面状态用它——
  // 走 save() 会把整个「行囊」页（一万六千像素、32 家酒店）拆掉重建，点一下卡半天。
  var quietTimer = null;
  function saveQuiet() {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(function () { quietTimer = null; persist(); }, 200);
  }

  var saveTimer = null;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      persist();
      renderCurrentTab();
    }, 200);
  }

  // ---------- helpers ----------
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function item(id) { return (DATA.items && DATA.items[id]) || null; }
  function color(type) { return (DATA.colors && DATA.colors[type]) || '#8a8f98'; }
  function labelSlot(slot) { return SLOT_LABEL[slot] || slot || ''; }

  function flat(arrOfArr) {
    var out = [];
    (arrOfArr || []).forEach(function (a) { out = out.concat(a || []); });
    return out;
  }

  function findDay(day) {
    return (DATA.days || []).filter(function (d) { return d.d === day; })[0] || null;
  }
  function findSlot(dayObj, slot) {
    if (!dayObj) return null;
    return (dayObj.slots || []).filter(function (s) { return s.slot === slot; })[0] || null;
  }

  function todayKey() {
    var now = new Date();
    var key = (now.getMonth() + 1) + '/' + now.getDate();
    return findDay(key) ? key : null;
  }

  // ---------- 槽位求解（§3 末尾公式） ----------
  function slotItems(day, slot) {
    var dayObj = findDay(day);
    var slotObj = findSlot(dayObj, slot);
    var defaultMain = slotObj ? flat((slotObj.main || []).map(function (e) { return e.ids || []; })) : [];
    var defaultAlt = slotObj ? flat((slotObj.alt || []).map(function (e) { return e.ids || []; })) : [];
    var planSlot = (state.plan[day] && state.plan[day][slot]) || {};
    var base = planSlot.chosen || defaultMain;
    var skipped = planSlot.skipped || [];
    var main = base.filter(function (id) { return skipped.indexOf(id) === -1; });
    // 挪去别天别槽的项，从它默认/chosen 出现的位置里摘掉
    main = main.filter(function (id) {
      var m = state.moved[id];
      return !m || (m.to === day && m.slot === slot);
    });
    var movedIn = [];
    Object.keys(state.moved || {}).forEach(function (id) {
      var m = state.moved[id];
      if (m && m.to === day && m.slot === slot) {
        movedIn.push(id);
        if (main.indexOf(id) === -1) main.push(id);
      }
    });
    return { main: main, alt: defaultAlt, moved_in: movedIn };
  }

  function ensurePlanSlot(day, slot) {
    if (!state.plan[day]) state.plan[day] = {};
    if (!state.plan[day][slot]) state.plan[day][slot] = {};
    return state.plan[day][slot];
  }

  // alt 条目「换上来」：把 ids 并进这个槽当前有效的 main 列表
  function promoteAlt(day, slot, ids) {
    var cur = slotItems(day, slot);
    var ps = ensurePlanSlot(day, slot);
    var merged = cur.main.slice();
    (ids || []).forEach(function (id) { if (merged.indexOf(id) === -1) merged.push(id); });
    ps.chosen = merged;
    save();
  }

  // 单个 item 从这个槽「跳过」
  function skipItem(day, slot, id) {
    if (!day || !slot || !id) return;
    var ps = ensurePlanSlot(day, slot);
    if (!ps.skipped) ps.skipped = [];
    if (ps.skipped.indexOf(id) === -1) ps.skipped.push(id);
    save();
  }

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  // ---------- sheet ----------
  function sheet(html, onMount) {
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    var box = document.createElement('div');
    box.className = 'sheet';
    box.innerHTML = '<div class="sheet-drag"></div><div class="sheet-close" data-act="sheet-close">✕</div>' + html;
    document.body.appendChild(mask);
    document.body.appendChild(box);
    requestAnimationFrame(function () { mask.classList.add('show'); box.classList.add('show'); });

    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      mask.classList.remove('show');
      box.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { mask.remove(); box.remove(); }, 220);
    }
    mask.addEventListener('click', close);
    box.querySelector('[data-act="sheet-close"]').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    if (typeof onMount === 'function') onMount(box, close);
    return close;
  }

  // ---------- itemCard ----------
  function itemCard(id, opts) {
    opts = opts || {};
    var it = item(id);
    if (!it) return '';
    var isDone = !!state.done[id];
    var isHeart = !!state.hearts[id];
    var usedTag = '';
    if (opts.showDay) {
      if (it.used && it.used.length) {
        usedTag = it.used.map(function (u) {
          return '<span class="ic-tag">用在 ' + esc(u.d + ' ' + labelSlot(u.slot)) + '</span>';
        }).join('');
      } else {
        usedTag = '<span class="ic-tag" style="opacity:.6">备选</span>';
      }
    }
    var btns = [];
    btns.push('<button class="btn ' + (isDone ? 'on' : '') + '" data-act="checkin" data-id="' + id + '">' + (isDone ? '✓ 已打卡' : '✓ 打卡') + '</button>');
    if (opts.showPromote) {
      btns.push('<button class="btn ghost" data-act="promote-one" data-id="' + id + '" data-day="' + esc(opts.day || '') + '" data-slot="' + esc(opts.slot || '') + '">换上来</button>');
    }
    if (opts.showReplace) {
      btns.push('<button class="btn ghost" data-act="replace" data-id="' + id + '" data-day="' + esc(opts.day || '') + '" data-slot="' + esc(opts.slot || '') + '">替换</button>');
    }
    if (opts.showSkip) {
      btns.push('<button class="btn ghost" data-act="skip" data-id="' + id + '" data-day="' + esc(opts.day || '') + '" data-slot="' + esc(opts.slot || '') + '">取消</button>');
    }
    btns.push('<button class="btn ' + (isHeart ? 'on' : '') + '" data-act="heart" data-id="' + id + '">' + (isHeart ? '❤' : '♡') + '</button>');
    if (opts.showAddToPlan) {
      btns.push('<button class="btn ghost" data-act="add-to-plan" data-id="' + id + '">' + (it.used && it.used.length ? '再排一次' : '排进…') + '</button>');
    }
    if (it.klook) btns.push('<a class="btn ghost" data-stop href="' + esc(it.klook) + '" target="_blank" rel="noopener">Klook</a>');
    if (it.gmaps) btns.push('<a class="btn ghost" data-stop href="' + esc(it.gmaps) + '" target="_blank" rel="noopener">地图</a>');
    return '<div class="ic ' + (opts.compact ? 'compact' : '') + ' ' + (isDone ? 'done' : '') + '" style="--tc:' + color(it.type) + '" data-act="open" data-id="' + id + '">'
      + '<div class="dot" style="background:' + color(it.type) + '"></div>'
      + '<div class="ic-body">'
      + '<div class="ic-name"><span class="nm">' + esc(it.name) + '</span>' + usedTag + '</div>'
      + (!opts.compact && it.intro ? '<div class="ic-intro">' + esc(it.intro) + '</div>' : '')
      + '<div class="ic-btns">' + btns.join('') + '</div>'
      + '</div></div>';
  }

  function fieldRow(label, val) {
    if (!val) return '';
    return '<div class="small" style="margin-top:8px"><b style="color:var(--t1)">' + esc(label) + '</b>&nbsp;' + esc(val) + '</div>';
  }

  // ---------- itemSheet ----------
  function itemSheet(id) {
    var it = item(id);
    if (!it) { toast('找不到这个点'); return; }
    var isDone = !!state.done[id];
    var isHeart = !!state.hearts[id];
    var movedInfo = state.moved[id];
    var dayOpts = (DATA.days || []).map(function (d) {
      return '<option value="' + esc(d.d) + '"' + (movedInfo && movedInfo.to === d.d ? ' selected' : '') + '>' + esc(d.d + ' ' + d.w) + '</option>';
    }).join('');
    var slotOpts = ['dawn', 'am', 'pm', 'eve'].map(function (k) {
      return '<option value="' + k + '"' + (movedInfo && movedInfo.slot === k ? ' selected' : '') + '>' + labelSlot(k) + '</option>';
    }).join('');

    var html = ''
      + '<h3 class="serif" style="margin:4px 26px 2px 0">' + esc(it.name) + '</h3>'
      + (it.name_local ? '<div class="small">' + esc(it.name_local) + '</div>' : '')
      + '<div style="display:flex;align-items:center;gap:6px;margin:8px 0">'
      + '<span class="dot lg" style="background:' + color(it.type) + '"></span>'
      + '<span class="small">' + esc(it.type) + (it.city ? ' · ' + esc(it.city) : '') + '</span></div>'
      + (it.intro ? '<div>' + esc(it.intro) + '</div>' : '')
      + (it.why ? '<div class="small" style="margin-top:8px">为什么选它：' + esc(it.why) + '</div>' : '')
      + fieldRow('时间', it.hours) + fieldRow('花费', it.price) + fieldRow('建议停留', it.time)
      + fieldRow('地址', it.address) + fieldRow('提示', it.tips)
      + fieldRow('Klook 价', it.klook_note) + fieldRow('可信度', it.confidence)
      + '<div class="ic-btns" style="margin-top:14px">'
      + '<button class="btn ' + (isDone ? 'on' : '') + '" data-act="checkin" data-id="' + id + '">' + (isDone ? '✓ 已打卡' : '✓ 打卡') + '</button>'
      + '<button class="btn ' + (isHeart ? 'on' : '') + '" data-act="heart" data-id="' + id + '">' + (isHeart ? '❤ 已收藏' : '♡ 收藏') + '</button>'
      + (it.klook ? '<a class="btn ghost" data-stop href="' + esc(it.klook) + '" target="_blank" rel="noopener">Klook</a>' : '')
      + (it.gmaps ? '<a class="btn ghost" data-stop href="' + esc(it.gmaps) + '" target="_blank" rel="noopener">地图</a>' : '')
      + '</div>'
      + '<hr class="thin">'
      + '<div class="small" style="margin-bottom:4px">备注</div>'
      + '<textarea data-role="note" placeholder="随手记两句…">' + esc(state.notes[id] || '') + '</textarea>'
      + '<hr class="thin">'
      + '<div class="small" style="margin-bottom:4px">挪到…</div>'
      + '<div style="display:flex;gap:6px">'
      + '<select data-role="move-day" style="flex:1">' + dayOpts + '</select>'
      + '<select data-role="move-slot" style="flex:1">' + slotOpts + '</select>'
      + '</div>'
      + '<div class="ic-btns" style="margin-top:8px">'
      + '<button class="btn gold" data-act="do-move" data-id="' + id + '">确认挪动</button>'
      + (movedInfo ? '<button class="btn ghost" data-act="undo-move" data-id="' + id + '">取消挪动</button>' : '')
      + '</div>'
      + (movedInfo ? '<div class="small" style="margin-top:6px">已挪到 ' + esc(movedInfo.to) + ' ' + esc(labelSlot(movedInfo.slot)) + '</div>' : '');

    sheet(html, function (box, close) {
      var noteEl = box.querySelector('[data-role="note"]');
      var noteTimer = null;
      noteEl.addEventListener('input', function () {
        var v = noteEl.value;
        if (noteTimer) clearTimeout(noteTimer);
        noteTimer = setTimeout(function () { state.notes[id] = v; save(); }, 300);
      });
      var doMoveBtn = box.querySelector('[data-act="do-move"]');
      doMoveBtn.addEventListener('click', function () {
        var to = box.querySelector('[data-role="move-day"]').value;
        var slot = box.querySelector('[data-role="move-slot"]').value;
        state.moved[id] = { to: to, slot: slot };
        save();
        toast('已挪到 ' + to + ' ' + labelSlot(slot));
        close();
      });
      var undoBtn = box.querySelector('[data-act="undo-move"]');
      if (undoBtn) undoBtn.addEventListener('click', function () {
        delete state.moved[id];
        save();
        toast('已取消挪动');
        close();
      });
    });
  }

  // ---------- pickerSheet：替换 / 加一个 的候选池弹层 ----------
  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function splitCitySegments(cityStr) {
    return String(cityStr || '').split(/[→·]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function recBadge(rec) {
    if (!rec) return '';
    var parts = [];
    if (rec.day) parts.push(rec.day);
    if (rec.slot) parts.push(labelSlot(rec.slot));
    if (!parts.length) return '';
    return '推荐 ' + parts.join(' ');
  }

  function recPairHtml(rec) {
    if (!rec || !rec.pair) return '';
    return '<div class="small" style="margin-top:4px">搭配：' + esc(truncate(rec.pair, 70)) + '</div>';
  }

  function recWithHtml(rec) {
    if (!rec || !rec.with || !rec.with.length) return '';
    return '<div class="small" style="margin-top:2px">同槽：' + esc(rec.with.join(' · ')) + '</div>';
  }

  function pickCandidateCard(it) {
    var rec = it.rec || {};
    var badge = recBadge(rec);
    var introT = truncate(it.intro || '', 60);
    return '<div class="ic pick" style="--tc:' + color(it.type) + '">'
      + '<div class="dot" style="background:' + color(it.type) + '"></div>'
      + '<div class="ic-body">'
      + '<div class="ic-name" style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      + '<span class="nm">' + esc(it.name) + '</span>'
      + '<button class="btn gold" style="min-height:44px" data-act="pick-choose" data-id="' + it.id + '">选它</button>'
      + '</div>'
      + (introT ? '<div class="ic-intro">' + esc(introT) + '</div>' : '')
      + (badge ? '<div class="ic-tag" style="margin:4px 0 0;display:inline-block">' + esc(badge) + '</div>' : '')
      + recPairHtml(rec) + recWithHtml(rec)
      + '</div></div>';
  }

  // day/slot：要操作的那个槽；replaceId：被替换的 id（没有就是「加一个」模式）
  function pickerSheet(day, slot, replaceId) {
    var dayObj = findDay(day);
    if (!dayObj) { toast('这天没数据'); return function () {}; }

    var segments = splitCitySegments(dayObj.city);
    var excludeSet = {};
    (dayObj.slots || []).forEach(function (s) {
      var eff = slotItems(day, s.slot);
      (eff.main || []).forEach(function (id) { excludeSet[id] = true; });
      (eff.alt || []).forEach(function (id) { excludeSet[id] = true; });
      (eff.moved_in || []).forEach(function (id) { excludeSet[id] = true; });
    });

    var pool = [];
    Object.keys(DATA.items || {}).forEach(function (id) {
      var it = DATA.items[id];
      if (!it) return;
      if (it.type === '交通' || it.type === '住') return;
      if (excludeSet[id]) return;
      if (segments.indexOf(it.city) === -1) return;
      pool.push(it);
    });

    var replacedItem = replaceId ? item(replaceId) : null;
    var titleHtml = replaceId
      ? '<h3 class="serif" style="margin:4px 26px 8px 0">替换 · ' + esc(day + ' ' + labelSlot(slot)) + '</h3>'
        + (replacedItem ? '<div class="small" style="margin-bottom:8px">换掉：' + esc(replacedItem.name) + '</div>' : '')
      : '<h3 class="serif" style="margin:4px 26px 8px 0">加进 ' + esc(day + ' ' + labelSlot(slot)) + '</h3>';

    var typeChoices = (DATA.types || []).filter(function (t) { return t !== '交通'; });

    var html = titleHtml
      + '<input type="text" data-role="pick-search" placeholder="搜索名字…" style="margin-bottom:8px">'
      + '<div class="chip-row" data-role="pick-chips"></div>'
      + '<div data-role="pick-list"></div>';

    return sheet(html, function (box, close) {
      var searchVal = '';
      var activeTypes = [];

      function passFilter(it) {
        if (activeTypes.length && activeTypes.indexOf(it.type) === -1) return false;
        if (searchVal && it.name.toLowerCase().indexOf(searchVal) === -1) return false;
        return true;
      }

      function buildGroups(list) {
        var g1 = [], g2 = [], g3 = {}, g4 = [];
        list.forEach(function (it) {
          var rec = it.rec || {};
          if (rec.slot && rec.slot === slot) { g1.push(it); }
          else if (rec.day && rec.day === day) { g2.push(it); }
          else if (rec.slot) {
            if (!g3[rec.slot]) g3[rec.slot] = [];
            g3[rec.slot].push(it);
          } else { g4.push(it); }
        });
        g2.sort(function (a, b) {
          return SLOT_ORDER.indexOf((a.rec && a.rec.slot) || '') - SLOT_ORDER.indexOf((b.rec && b.rec.slot) || '');
        });
        return { g1: g1, g2: g2, g3: g3, g4: g4 };
      }

      function renderChips() {
        var chipHtml = typeChoices.map(function (t) {
          return '<div class="chip' + (activeTypes.indexOf(t) !== -1 ? ' on' : '') + '" data-role="pick-type" data-type="' + esc(t) + '">'
            + '<span class="dot" style="background:' + color(t) + ';margin:0"></span>' + esc(t) + '</div>';
        }).join('');
        box.querySelector('[data-role="pick-chips"]').innerHTML = chipHtml;
      }

      function renderList() {
        var listEl = box.querySelector('[data-role="pick-list"]');
        if (!pool.length) {
          listEl.innerHTML = '<div class="empty">这个城市没有别的候选了</div>';
          return;
        }
        var filtered = pool.filter(passFilter);
        if (!filtered.length) {
          listEl.innerHTML = '<div class="empty">没有匹配的候选</div>';
          return;
        }
        var groups = buildGroups(filtered);
        var out = '';
        if (groups.g1.length) out += '<div class="small" style="margin:10px 0 4px;color:var(--t1)">推荐放在这个时段</div>' + groups.g1.map(pickCandidateCard).join('');
        if (groups.g2.length) out += '<div class="small" style="margin:10px 0 4px;color:var(--t1)">推荐放在这天别的时段</div>' + groups.g2.map(pickCandidateCard).join('');
        var g3Keys = SLOT_ORDER.filter(function (k) { return groups.g3[k] && groups.g3[k].length; });
        if (g3Keys.length) {
          out += '<div class="small" style="margin:10px 0 4px;color:var(--t1)">其他时段</div>';
          g3Keys.forEach(function (k) {
            out += '<div class="small" style="margin:6px 0 2px">' + esc(labelSlot(k)) + '</div>' + groups.g3[k].map(pickCandidateCard).join('');
          });
        }
        if (groups.g4.length) out += '<div class="small" style="margin:10px 0 4px;color:var(--t1)">时段不限</div>' + groups.g4.map(pickCandidateCard).join('');
        listEl.innerHTML = out;
      }

      renderChips();
      renderList();

      box.addEventListener('input', function (e) {
        if (e.target && e.target.getAttribute && e.target.getAttribute('data-role') === 'pick-search') {
          searchVal = e.target.value.trim().toLowerCase();
          renderList();
        }
      });

      box.addEventListener('click', function (e) {
        var chipEl = e.target.closest && e.target.closest('[data-role="pick-type"]');
        if (chipEl) {
          var t = chipEl.getAttribute('data-type');
          var idx = activeTypes.indexOf(t);
          if (idx === -1) activeTypes.push(t); else activeTypes.splice(idx, 1);
          renderChips();
          renderList();
          return;
        }
        var pickEl = e.target.closest && e.target.closest('[data-act="pick-choose"]');
        if (pickEl) {
          var chosenId = pickEl.getAttribute('data-id');
          var chosenItem = item(chosenId);
          if (replaceId) {
            skipItem(day, slot, replaceId);
            promoteAlt(day, slot, [chosenId]);
            toast('换成了 ' + (chosenItem ? chosenItem.name : chosenId));
          } else {
            promoteAlt(day, slot, [chosenId]);
            toast('已加进 ' + day + ' ' + labelSlot(slot));
          }
          close();
        }
      });
    });
  }

  // ---------- 全局按钮委托（只处理 itemCard/itemSheet 自带的通用动作）----------
  function onGlobalClick(e) {
    if (e.target.closest && e.target.closest('[data-stop]')) return; // 跳转链自己处理
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    if (act === 'checkin') {
      e.preventDefault();
      if (state.done[id]) delete state.done[id]; else state.done[id] = new Date().toISOString();
      save();
    } else if (act === 'heart') {
      e.preventDefault();
      if (state.hearts[id]) delete state.hearts[id]; else state.hearts[id] = true;
      save();
    } else if (act === 'skip') {
      e.preventDefault();
      skipItem(el.getAttribute('data-day'), el.getAttribute('data-slot'), id);
      toast('已取消');
    } else if (act === 'promote-one') {
      e.preventDefault();
      promoteAlt(el.getAttribute('data-day'), el.getAttribute('data-slot'), [id]);
      toast('已换上');
    } else if (act === 'replace') {
      e.preventDefault();
      pickerSheet(el.getAttribute('data-day'), el.getAttribute('data-slot'), id);
    } else if (act === 'add-slot') {
      e.preventDefault();
      pickerSheet(el.getAttribute('data-day'), el.getAttribute('data-slot'), null);
    } else if (act === 'add-to-plan') {
      e.preventDefault();
      if (typeof window.VNAPP._openSlotPicker === 'function') window.VNAPP._openSlotPicker(id);
    } else if (act === 'open') {
      itemSheet(id);
    }
  }
  document.addEventListener('click', onGlobalClick);

  // ---------- tabs / 路由 ----------
  var tabs = [];
  var tabsByName = {};

  function registerTab(name, def) {
    if (tabsByName[name]) return;
    var entry = Object.assign({ name: name }, def);
    tabs.push(entry);
    tabsByName[name] = entry;
    renderTabbar();
  }

  function renderTabbar() {
    var slot = document.getElementById('tabbar-slot');
    if (!slot) return;
    var nav = document.createElement('div');
    nav.className = 'tabbar';
    tabs.forEach(function (t) {
      var el = document.createElement('div');
      el.className = 'tab' + (state.ui.tab === t.name ? ' on' : '');
      el.innerHTML = '<div class="tab-ic">' + (t.icon || '•') + '</div><div>' + esc(t.title || t.name) + '</div>';
      el.addEventListener('click', function () { go(t.name); });
      nav.appendChild(el);
    });
    slot.innerHTML = '';
    slot.appendChild(nav);
  }

  function renderCurrentTab() {
    var root = document.getElementById('app');
    if (!root) return;
    var t = tabsByName[state.ui.tab];
    if (!t) {
      root.innerHTML = '<div class="empty">这个页面还没做好</div>';
      return;
    }
    try {
      t.render(root, state.ui.params || {});
      if (!root.querySelector('.pagehead')) {
        var ph = document.createElement('div');
        ph.className = 'pagehead';
        ph.innerHTML = '<div class="ph-k">' + esc(t.kicker || 'VIỆT NAM') + '</div>'
          + '<div class="ph-t serif">' + esc(t.title || '') + '</div>'
          + (t.sub ? '<div class="ph-s">' + esc(t.sub) + '</div>' : '');
        root.insertBefore(ph, root.firstChild);
      }
      var band = document.createElement('div');
      band.className = 'hdr-tile tilebg';
      root.insertBefore(band, root.firstChild);
    } catch (err) {
      console.error('[VNAPP] render 失败：', t.name, err);
      root.innerHTML = '<div class="empty">这页出了点问题：' + esc(String((err && err.message) || err)) + '</div>';
    }
  }

  function go(name, params) {
    if (!tabsByName[name] && tabs.length) name = tabs[0].name;
    if (!tabsByName[name]) return;
    state.ui.tab = name;
    state.ui.params = params || {};
    // 给 body 打上当前页，CSS 才能按页调头部（地图页要把花砖压扁腾高度）
    try { document.body.setAttribute('data-tab', name); } catch (e) {}
    if (params && params.day) state.ui.day = params.day;
    persist();
    renderTabbar();
    renderCurrentTab();
    var t = tabsByName[name];
    if (t && typeof t.onShow === 'function') {
      try { t.onShow(); } catch (e) { console.error('[VNAPP] onShow 出错', e); }
    }
  }

  function boot() {
    var start = tabsByName[state.ui.tab] ? state.ui.tab : (tabs[0] && tabs[0].name);
    if (!start) {
      var root = document.getElementById('app');
      if (root) root.innerHTML = '<div class="empty">还没有任何页面加载成功</div>';
      renderTabbar();
      return;
    }
    go(start, state.ui.params || {});
  }

  window.VNAPP = {
    DATA: DATA,
    state: state,
    save: save,
    saveQuiet: saveQuiet,
    go: go,
    item: item,
    color: color,
    esc: esc,
    toast: toast,
    sheet: sheet,
    itemCard: itemCard,
    itemSheet: itemSheet,
    todayKey: todayKey,
    registerTab: registerTab,
    slotItems: slotItems,
    pickerSheet: pickerSheet,
    // 扩展口子（不在 SPEC §2 原表里，给 tab-*.js 复用，避免各自重写）：
    promoteAlt: promoteAlt,
    skipItem: skipItem,
    labelSlot: labelSlot,
    findDay: findDay,
    findSlot: findSlot,
    _boot: boot
  };
})();
