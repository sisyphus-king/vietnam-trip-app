// tab-bag.js — W3：「行囊」交通/订票/预算/记账/备忘/紧急/清单/住宿/导出
// 只用 document.createElement 搭 DOM（不拼 innerHTML 字符串），文本一律走 text 节点，天然转义。
(function () {
  'use strict';

  var SLOT_LABEL = { dawn: '凌晨', am: '上午', pm: '下午', eve: '晚上' };

  // ---- 小 DOM helper：el(tag, props, ...children) ----
  function el(tag, props) {
    var e = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null) return;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v; // 只给 <style> 用
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
  function text(s) { return document.createTextNode(s == null ? '' : String(s)); }
  function safe(s) { return s == null ? '' : String(s); }

  var STYLE = [
    '.bag-tab{padding:12px 14px 90px;display:flex;flex-direction:column;gap:12px}',
    '.bag-tab summary{cursor:pointer;font-weight:600;padding:14px;list-style:none;display:flex;align-items:center;justify-content:space-between;min-height:44px}',
    '.bag-tab summary::-webkit-details-marker{display:none}',
    '.bag-tab summary::after{content:"▾";opacity:.5;transition:transform .15s}',
    '.bag-tab details[open]>summary::after{transform:rotate(180deg)}',
    '.bag-body{padding:0 14px 14px}',
    '.bag-leg{padding:10px 0;border-top:1px solid var(--line,#26262c)}',
    '.bag-leg:first-child{border-top:none}',
    '.bag-leg-title{font-weight:600;margin-bottom:4px}',
    '.bag-row{font-size:13px;color:var(--t2,#9b96a0);margin-top:3px;line-height:1.5}',
    '.bag-tips{color:var(--t3,#6e6b66)}',
    '.bag-table{width:100%;border-collapse:collapse;font-size:13px}',
    '.bag-table th,.bag-table td{text-align:left;padding:8px 4px;border-top:1px solid var(--line,#26262c);vertical-align:top}',
    '.bag-table th{color:var(--t3,#6e6b66);font-weight:500}',
    '.bag-book-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:10px 0;border-top:1px solid var(--line,#26262c)}',
    '.bag-book-row:first-child{border-top:none}',
    '.bag-book-name{font-weight:600;font-size:13.5px}',
    '.bag-book-meta{font-size:12px;color:var(--t2);margin-top:2px}',
    '.bag-book-right{display:flex;align-items:center;gap:6px;flex:none}',
    '.bag-book-done{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--t2);white-space:nowrap}',
    '.bag-book-del{width:30px;height:30px;flex:none;border:1px solid var(--line);background:transparent;',
    '  border-radius:2px;color:var(--t3);font-size:17px;line-height:1;cursor:pointer;padding:0}',
    '.bag-book-del:active{background:var(--line)}',
    '.bag-alts{margin-top:6px}',
    '.bag-alts>summary{cursor:pointer;font-size:12px;color:var(--gold);padding:4px 0;min-height:28px;list-style:none;display:inline-flex;align-items:center;gap:4px}',
    '.bag-alts>summary::-webkit-details-marker{display:none}',
    '.bag-alts>summary::after{content:"▾";opacity:.6}',
    '.bag-alts[open]>summary::after{transform:rotate(180deg);display:inline-block}',
    '.bag-alt{margin:4px 0 0 10px;padding-left:9px;border-left:2px solid var(--line)}',
    '.bag-book-warn{font-size:12px;color:var(--gold);line-height:1.55;margin-top:6px;',
    '  background:var(--tile-cream);border-radius:2px;padding:7px 9px}',
    '.bag-book-foot{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--t3);padding-top:10px}',
    '.bag-book-lk{display:inline-block;margin-top:6px;font-size:12.5px;color:#fff;background:var(--gold);',
    '  border-radius:2px;padding:5px 11px;text-decoration:none;font-weight:600}',
    '.stay-g{border:1px solid var(--line);border-radius:2px;background:var(--card);margin:8px 0}',
    '.stay-g>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:9px;',
    '  padding:13px 14px;min-height:48px;font-size:14.5px;font-weight:700;color:var(--t1)}',
    '.stay-g>summary::-webkit-details-marker{display:none}',
    '.stay-g>summary::after{content:"▾";margin-left:auto;opacity:.55;font-weight:400}',
    '.stay-g[open]>summary::after{content:"▴"}',
    '.stay-g[open]>summary{border-bottom:1px solid var(--line)}',
    '.stay-g-city{font-size:16px}',
    '.stay-g-night{font-size:12.5px;font-weight:400;color:var(--t2)}',
    '.stay-g-n{font-size:12px;font-weight:400;color:var(--t3)}',
    '.stay-g-body{padding:4px 12px 12px}',
    '.bag-check-row{display:flex;align-items:center;gap:10px;min-height:44px;border-top:1px solid var(--line,#26262c)}',
    '.bag-check-row:first-child{border-top:none}',
    '.bag-check-row input[type=checkbox]{width:20px;height:20px;flex:none}',
    '.bag-check-row.done{color:var(--t3,#6e6b66);text-decoration:line-through}',
    '.bag-sub{font-size:12px;color:var(--t3,#6e6b66);margin:10px 0 4px}',
    '.bag-expense-form{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px}',
    '.bag-expense-form select,.bag-expense-form input{background:var(--card,#141418);border:1px solid var(--line,#26262c);color:var(--t1,#e8e4dc);border-radius:8px;padding:8px;font-size:14px;min-height:44px}',
    '.bag-expense-form input[data-what]{flex:1;min-width:80px}',
    '.bag-expense-form input[data-cny]{width:72px}',
    '.bag-total{display:flex;justify-content:space-between;font-weight:700;font-size:15px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line,#26262c)}',
    '.bag-total.over{color:var(--accent,#d4503c)}',
    '.bag-day-group{margin-top:10px}',
    '.bag-day-head{display:flex;justify-content:space-between;font-size:12px;color:var(--t3,#6e6b66);margin-bottom:4px}',
    '.bag-exp-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;border-top:1px solid var(--line,#26262c)}',
    '.bag-exp-row:first-child{border-top:none}',
    '.bag-exp-del{background:none;border:none;color:var(--t3,#6e6b66);font-size:16px;padding:4px 8px;min-height:32px}',
    '.bag-memo{width:100%;min-height:120px;background:var(--card,#141418);border:1px solid var(--line,#26262c);color:var(--t1,#e8e4dc);border-radius:8px;padding:10px;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box}',
    '.bag-empty{color:var(--t3,#6e6b66);font-size:13px;padding:10px 0}',
    '.bag-tel{color:var(--gold,#c9a86a)}',
    '.bag-export-btn{width:100%}'
  ].join('');

  function ensureBag() {
    var st = VNAPP.state;
    if (!st.bag) st.bag = {};
    var b = st.bag;
    if (!b.open) b.open = {};
    if (!b.check) b.check = {};
    if (!Array.isArray(b.expenses)) b.expenses = [];
    if (typeof b.memo !== 'string') b.memo = '';
    if (!Array.isArray(b.spins)) b.spins = [];
    return b;
  }

  function todayDateKey() {
    var D = VNAPP.DATA;
    var st = VNAPP.state;
    return VNAPP.todayKey() || (st.ui && st.ui.day) || (D.days[0] && D.days[0].d) || '9/9';
  }

  function nameOf(id) {
    var it = VNAPP.item(id);
    return it ? it.name : id;
  }

  // ---- 一节可折叠卡片 ----
  var DEFAULT_OPEN = { transport: true };
  function section(bag, key, title, bodyNode) {
    var isOpen = key in bag.open ? !!bag.open[key] : !!DEFAULT_OPEN[key];
    var det = el('details', { class: 'card', open: isOpen || null },
      el('summary', null, title),
      el('div', { class: 'bag-body' }, bodyNode)
    );
    det.addEventListener('toggle', function () {
      bag.open[key] = det.open;
      VNAPP.saveQuiet();   // 只落盘不重渲，否则每次开合都要重建整页
    });
    return det;
  }

  // ---- 1 交通 ----
  function buildTransport(D) {
    var list = D.transport || [];
    if (!list.length) return el('div', { class: 'bag-empty' }, '没有交通段');
    var wrap = el('div');
    list.forEach(function (t) {
      var kids = [
        el('div', { class: 'bag-leg-title' }, safe(t.leg)),
        t.pick ? el('div', { class: 'bag-row' }, el('b', null, '怎么订：'), safe(t.pick)) : null,
        t.how ? el('div', { class: 'bag-row' }, el('b', null, '渠道：'), safe(t.how)) : null,
        t.tips ? el('div', { class: 'bag-row bag-tips' }, safe(t.tips)) : null
      ];
      if (t.klook) {
        kids.push(el('a', { class: 'btn ghost', href: t.klook, target: '_blank', rel: 'noopener', style: 'display:inline-block;margin-top:8px' }, 'Klook'));
      }
      wrap.appendChild(el('div', { class: 'bag-leg' }, kids));
    });
    return wrap;
  }

  // ---- 2 要订的 ----
  function buildBookings(D, bag) {
    var list = D.bookings || [];
    if (!list.length) return el('div', { class: 'bag-empty' }, '没有待订项');
    if (!bag.bookDel) bag.bookDel = {};
    var wrap = el('div');
    var foot = el('div', { class: 'bag-book-foot' });

    function paintFoot() {
      var n = Object.keys(bag.bookDel).filter(function (k) { return bag.bookDel[k]; }).length;
      foot.innerHTML = '';
      if (!n) return;
      foot.appendChild(el('span', null, '已删掉 ' + n + ' 条'));
      var undo = el('button', { class: 'btn ghost', type: 'button' }, '全部恢复');
      undo.addEventListener('click', function () { bag.bookDel = {}; VNAPP.save(); });
      foot.appendChild(undo);
    }

    function altLine(a) {
      return el('div', { class: 'bag-alt' },
        el('div', { class: 'bag-book-name' }, safe(a.name)),
        el('div', { class: 'bag-book-meta' }, [a.price, a.rating].filter(Boolean).join(' · ')),
        a.note ? el('div', { class: 'bag-book-meta' }, safe(a.note)) : null,
        a.url ? el('div', null, el('a', { class: 'bag-book-lk', href: a.url,
          target: '_blank', rel: 'noopener' }, '打开看 ↗')) : null);
    }

    list.forEach(function (b) {
      var id = b.id || b.name;
      if (bag.bookDel[id]) return;

      var key = 'book/' + b.name;
      var cb = el('input', {
        type: 'checkbox', checked: !!bag.check[key], onchange: function (ev) {
          bag.check[key] = ev.target.checked;
          VNAPP.saveQuiet();
        }
      });

      var body = el('div', { style: 'flex:1;min-width:0' },
        el('div', { class: 'bag-book-name' }, safe(b.name)),
        el('div', { class: 'bag-book-meta' }, [safe(b.when), b.price, b.rating].filter(Boolean).join(' · ')),
        b.note ? el('div', { class: 'bag-book-meta' }, safe(b.note)) : null,
        b.url ? el('div', null, el('a', { class: 'bag-book-lk', href: b.url,
          target: '_blank', rel: 'noopener' }, '打开看 ↗')) : null);

      // 同一件事的其他买法：折起来，别在清单上占三行
      if (b.alts && b.alts.length) {
        var det = el('details', { class: 'bag-alts' });
        var px = b.alts.map(function (a) { return a.price; }).filter(Boolean).join(' / ');
        det.appendChild(el('summary', null, '另 ' + b.alts.length + ' 种买法' + (px ? '（' + px + '）' : '')));
        b.alts.forEach(function (a) { det.appendChild(altLine(a)); });
        body.appendChild(det);
      }
      if (b.warn) body.appendChild(el('div', { class: 'bag-book-warn' }, safe(b.warn)));

      var right = el('div', { class: 'bag-book-right' });
      right.appendChild(el('label', { class: 'bag-book-done' }, cb, '订好了'));
      var del = el('button', { class: 'bag-book-del', type: 'button', title: '从清单删掉' }, '×');
      var row = el('div', { class: 'bag-book-row' }, body, right);
      del.addEventListener('click', function () {
        bag.bookDel[id] = true;
        row.parentNode && row.parentNode.removeChild(row);
        paintFoot();
        VNAPP.saveQuiet();
        VNAPP.toast('已删，下面可以恢复');
      });
      right.appendChild(del);
      wrap.appendChild(row);
    });

    paintFoot();
    wrap.appendChild(foot);
    return wrap;
  }

  // ---- 3 预算 + 记账 ----
  function buildBudget(D, bag, root) {
    var wrap = el('div');
    var table = el('table', { class: 'bag-table' });
    (D.budget || []).forEach(function (row) {
      table.appendChild(el('tr', null, el('td', null, safe(row[0])), el('td', { style: 'text-align:right;white-space:nowrap' }, safe(row[1]))));
    });
    wrap.appendChild(table);

    wrap.appendChild(el('div', { class: 'bag-sub' }, '记账流水'));

    // 加一条
    var daySel = el('select', { 'data-day': true });
    (D.days || []).forEach(function (d) {
      daySel.appendChild(el('option', { value: d.d, selected: d.d === todayDateKey() || null }, d.d + ' ' + (d.city || '')));
    });
    var whatInput = el('input', { type: 'text', 'data-what': true, placeholder: '什么' });
    var cnyInput = el('input', { type: 'number', 'data-cny': true, placeholder: '¥', min: '0', step: '0.01' });
    var addBtn = el('button', {
      class: 'btn', type: 'button', onclick: function () {
        var what = (whatInput.value || '').trim();
        var cny = Number(cnyInput.value);
        if (!what || !cny || !isFinite(cny) || cny <= 0) {
          VNAPP.toast('填一下花了什么、多少钱');
          return;
        }
        bag.expenses.push({ d: daySel.value || todayDateKey(), what: what, cny: cny });
        VNAPP.save();
      }
    }, '加');
    wrap.appendChild(el('div', { class: 'bag-expense-form' }, daySel, whatInput, cnyInput, addBtn));

    // 按天分组列表
    var byDay = {};
    var order = [];
    (bag.expenses || []).forEach(function (e, idx) {
      var d = e && e.d ? e.d : '其它';
      if (!byDay[d]) { byDay[d] = []; order.push(d); }
      byDay[d].push({ e: e, idx: idx });
    });
    var dayOrderMap = {};
    (D.days || []).forEach(function (d, i) { dayOrderMap[d.d] = i; });
    order.sort(function (a, b) {
      var ai = a in dayOrderMap ? dayOrderMap[a] : 999;
      var bi = b in dayOrderMap ? dayOrderMap[b] : 999;
      return ai - bi;
    });

    var total = 0;
    if (!order.length) {
      wrap.appendChild(el('div', { class: 'bag-empty' }, '还没记账'));
    } else {
      order.forEach(function (d) {
        var rows = byDay[d];
        var sub = 0;
        var listNode = el('div');
        rows.forEach(function (r) {
          var amt = Number(r.e.cny) || 0;
          sub += amt; total += amt;
          listNode.appendChild(el('div', { class: 'bag-exp-row' },
            el('span', null, safe(r.e.what)),
            el('span', { style: 'display:flex;align-items:center;gap:6px' },
              '¥' + amt,
              el('button', {
                class: 'bag-exp-del', type: 'button', 'aria-label': '删除', onclick: function () {
                  bag.expenses.splice(r.idx, 1);
                  VNAPP.save();
                }
              }, '×')
            )
          ));
        });
        wrap.appendChild(el('div', { class: 'bag-day-group' },
          el('div', { class: 'bag-day-head' }, el('span', null, d), el('span', null, '小计 ¥' + sub)),
          listNode
        ));
      });
    }

    var cap = D.meta && D.meta.budget_cap;
    var over = typeof cap === 'number' && total > cap;
    wrap.appendChild(el('div', { class: 'bag-total' + (over ? ' over' : '') },
      el('span', null, '总计'),
      el('span', null, '¥' + Math.round(total * 100) / 100 + (typeof cap === 'number' ? ' / ¥' + cap : ''))
    ));
    return wrap;
  }

  // ---- 4 备忘 ----
  var memoDebounce = null;
  var memoRestoreSel = null; // {start,end} 记住光标，重渲后恢复
  function buildMemo(bag) {
    var ta = el('textarea', { class: 'bag-memo', placeholder: '随手记点什么…' });
    ta.value = bag.memo || '';
    ta.addEventListener('input', function () {
      bag.memo = ta.value;
      memoRestoreSel = { start: ta.selectionStart, end: ta.selectionEnd };
      if (memoDebounce) clearTimeout(memoDebounce);
      memoDebounce = setTimeout(function () {
        VNAPP.saveQuiet();
      }, 500);
    });
    if (memoRestoreSel) {
      // 上一次因 debounce 触发的重渲：恢复焦点和光标
      setTimeout(function () {
        try {
          ta.focus();
          ta.setSelectionRange(memoRestoreSel.start, memoRestoreSel.end);
        } catch (_e) {}
        memoRestoreSel = null;
      }, 0);
    }
    return ta;
  }

  // ---- 5 紧急联络 ----
  function buildEmergency(D) {
    var list = D.emergency || [];
    if (!list.length) return el('div', { class: 'bag-empty' }, '没有紧急联络信息');
    var wrap = el('div');
    list.forEach(function (item) {
      var v = safe(item.v);
      var isTel = /^\+?[\d\s-]{3,}$/.test(v.split('（')[0].trim());
      var valNode;
      if (isTel) {
        var telNum = v.split('（')[0].replace(/[^\d+]/g, '');
        valNode = el('a', { class: 'bag-tel', href: 'tel:' + telNum }, v);
      } else {
        valNode = text(v);
      }
      wrap.appendChild(el('div', { class: 'bag-row', style: 'display:flex;justify-content:space-between;gap:10px' },
        el('b', null, safe(item.k)),
        el('span', null, valNode)
      ));
    });
    return wrap;
  }

  // ---- 6 清单 ----
  function buildChecklist(D, bag) {
    var wrap = el('div');
    var groups = D.checklist || {};
    var dateKey = todayDateKey();
    Object.keys(groups).forEach(function (gname) {
      var items = groups[gname] || [];
      wrap.appendChild(el('div', { class: 'bag-sub' }, gname));
      if (!items.length) {
        wrap.appendChild(el('div', { class: 'bag-empty' }, '空'));
        return;
      }
      items.forEach(function (item) {
        var key = gname === '每天' ? (gname + '/' + item + '@' + dateKey) : (gname + '/' + item);
        var checked = !!bag.check[key];
        var cb = el('input', {
          type: 'checkbox', checked: checked, onchange: function (ev) {
            bag.check[key] = ev.target.checked;
            VNAPP.saveQuiet();
          }
        });
        wrap.appendChild(el('div', { class: 'bag-check-row' + (checked ? ' done' : '') },
          cb,
          el('span', null, safe(item))
        ));
      });
    });
    return wrap;
  }

  // ---- 7 住宿候选池（每城一组，勾选 = 想订它）----
  function buildStay(D) {
    var stay = D.stay || {}, groups = stay.groups || [];
    var wrap = el('div', null);
    if (!groups.length) {
      return el('div', { class: 'bag-row' }, el('b', null, '住宿 · ' + safe(stay.status || '待定')),
        el('br'), safe(stay.note || '还没定。'));
    }
    var picked = VNAPP.state.bag.check || {};
    var n = 0;
    groups.forEach(function (g) { g.items.forEach(function (x) { if (picked['stay/' + x.id]) n++; }); });
    wrap.appendChild(el('div', { class: 'bag-row', style: 'margin-bottom:10px' },
      el('b', null, '选中 ' + n + ' 家'), el('br'), safe(stay.note || '')));

    if (!VNAPP.state.bag.stayOpen) VNAPP.state.bag.stayOpen = {};
    var sOpen = VNAPP.state.bag.stayOpen;

    groups.forEach(function (g) {
      // 一个城市一个抽屉，默认收起——三十来家全摊开根本看不动
      var gn = 0;
      g.items.forEach(function (x) { if (picked['stay/' + x.id]) gn++; });
      var det = el('details', { class: 'stay-g', open: sOpen[g.city] ? true : null });
      var cnt = el('span', { class: 'stay-g-n' }, g.items.length + ' 家' + (gn ? ' · 选了 ' + gn : ''));
      det.appendChild(el('summary', null,
        el('span', { class: 'stay-g-city' }, safe(g.city)),
        el('span', { class: 'stay-g-night' }, safe(g.night)),
        cnt));
      det.addEventListener('toggle', function () { sOpen[g.city] = det.open; VNAPP.saveQuiet(); });
      var body = el('div', { class: 'stay-g-body' });
      function repaintCount() {
        var k = 0;
        g.items.forEach(function (x) { if (VNAPP.state.bag.check['stay/' + x.id]) k++; });
        cnt.textContent = g.items.length + ' 家' + (k ? ' · 选了 ' + k : '');
      }
      g.items.forEach(function (x) {
        var key = 'stay/' + x.id, on = !!picked[key];
        var card = el('div', { class: 'stay-c' + (on ? ' on' : '') });
        var head = el('div', { class: 'stay-hd' });
        var box = el('div', { class: 'stay-box' + (on ? ' on' : '') }, on ? '✓' : '');
        box.addEventListener('click', function () {
          if (!VNAPP.state.bag.check) VNAPP.state.bag.check = {};
          var now = !VNAPP.state.bag.check[key];
          if (now) VNAPP.state.bag.check[key] = true; else delete VNAPP.state.bag.check[key];
          box.className = 'stay-box' + (now ? ' on' : '');
          box.textContent = now ? '✓' : '';
          card.className = 'stay-c' + (now ? ' on' : '');
          repaintCount();
          VNAPP.saveQuiet();
        });
        head.appendChild(box);
        var tt = el('div', { style: 'flex:1;min-width:0' },
          el('div', { class: 'stay-nm' }, safe(x.name),
            x.tier ? el('span', { class: 'stay-tier' }, safe(x.tier)) : null),
          el('div', { class: 'stay-px' + (x.mine ? ' mine' : '') },
            safe(x.price || '价格点链接看') + (x.rating ? '　' + safe(x.rating) : '')));
        head.appendChild(tt);
        card.appendChild(head);
        if (x.dist) card.appendChild(el('div', { class: 'stay-r' }, '位置　' + safe(x.dist)));
        if (x.pro) card.appendChild(el('div', { class: 'stay-r pro' }, '优　' + safe(x.pro)));
        if (x.con) card.appendChild(el('div', { class: 'stay-r con' }, '缺　' + safe(x.con)));
        if (x.note) card.appendChild(el('div', { class: 'stay-note' }, safe(x.note)));
        if (x.url && x.url.indexOf('http') === 0) {
          var a = el('a', { class: 'stay-lk', href: x.url, target: '_blank', rel: 'noopener' },
            '打开看实价 ↗');
          card.appendChild(el('div', null, a));
        }
        body.appendChild(card);
      });
      det.appendChild(body);
      wrap.appendChild(det);
    });
    return wrap;
  }

  // ---- 7.5 汇率换算 + 划不划算 ----
  function buildFx(D) {
    var F = D.fx || {}, R = F.rates || {};
    var wrap = el('div', null);
    if (!R.CNY_VND) return el('div', { class: 'bag-row' }, '汇率数据没生成。');

    var st = VNAPP.state.bag.fx || (VNAPP.state.bag.fx = { base: R.CNY_VND, usd: R.USD_VND });
    if (!VNAPP.state.bag.fxlive) VNAPP.state.bag.fxlive = null;
    var baseCNY = Number(st.base) || R.CNY_VND, baseUSD = Number(st.usd) || R.USD_VND;

    function fmt(n, d) { if (!isFinite(n)) return '—';
      return n.toLocaleString('zh-CN', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }

    // ── 内排机场 ATM（落地第一件事）──
    var NB = F.noibai;
    if (NB) {
      wrap.appendChild(el('div', { class: 'fx-h' }, NB.title));
      var nb = el('div', { class: 'atm-box' });
      (NB.where || []).forEach(function (w) {
        var r = el('div', { class: 'atm-w' });
        var h = el('div', { class: 'atm-wh' }); h.innerHTML = w[0];
        r.appendChild(h);
        var bk = el('div', { class: 'atm-banks' }); bk.innerHTML = w[1];
        r.appendChild(bk);
        var n = el('div', { class: 'atm-note' }); n.innerHTML = w[2];
        r.appendChild(n);
        nb.appendChild(r);
      });
      wrap.appendChild(nb);
      var stp = el('ol', { class: 'atm-steps' });
      (NB.steps || []).forEach(function (t) { var li = el('li'); li.innerHTML = t; stp.appendChild(li); });
      wrap.appendChild(stp);
      var hr = el('div', { class: 'fx-tip' }); hr.innerHTML = NB.hours; wrap.appendChild(hr);
      wrap.appendChild(el('div', { class: 'fx-tip' }, NB.note));
    }

    // ── 实时汇率条 ──
    var live = VNAPP.state.bag.fxlive || null;   // {cny,usd,at,src}
    if (live && live.cny) { baseCNY = live.cny; baseUSD = live.usd; }
    var bar = el('div', { class: 'fx-live' });
    function paintBar(status) {
      bar.innerHTML = '';
      var l = VNAPP.state.bag.fxlive;
      var txt, cls = '';
      if (status === 'loading') { txt = '正在取实时汇率…'; }
      else if (l && l.cny) {
        var age = (Date.now() - l.at) / 36e5;
        cls = age < 30 ? 'ok' : 'warn';
        txt = '<b>1 元 = ' + fmt(l.cny) + ' 盾</b>　<b>1 美元 = ' + fmt(l.usd) + ' 盾</b><br>' +
          '<span class="fx-age">' + (age < 1 ? '刚刚更新' : age < 24 ? Math.round(age) + ' 小时前更新'
            : Math.round(age / 24) + ' 天前更新') + '　' + VNAPP.esc(l.src || '') + '</span>';
      } else {
        cls = 'warn';
        txt = '<b>1 元 = ' + fmt(baseCNY) + ' 盾</b>　<b>1 美元 = ' + fmt(baseUSD) + ' 盾</b><br>' +
          '<span class="fx-age">没联网，用的是出发前存的基准（' + VNAPP.esc(F.asof || '') + '）</span>';
      }
      bar.className = 'fx-live ' + cls;
      var t = el('div', { style: 'flex:1;min-width:0' }); t.innerHTML = txt;
      bar.appendChild(t);
      var btn = el('div', { class: 'fx-refresh' }, status === 'loading' ? '···' : '刷新');
      btn.addEventListener('click', pull);
      bar.appendChild(btn);
    }
    function pull() {
      if (typeof fetch !== 'function') { paintBar(); return; }
      if (VNAPP._fxPulling) return;      // 每次重渲都会走到这，别把请求打成一串
      VNAPP._fxPulling = true;
      paintBar('loading');
      fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var vnd = d && d.rates && d.rates.VND, cny = d && d.rates && d.rates.CNY;
          if (!vnd || !cny) throw 0;
          VNAPP.state.bag.fxlive = { usd: vnd, cny: vnd / cny, at: Date.now(), src: 'open.er-api.com' };
          VNAPP._fxPulling = false;
          VNAPP.save();
        })
        .catch(function () { VNAPP._fxPulling = false; paintBar(); VNAPP.toast('取不到实时汇率，用存的基准'); });
    }
    wrap.appendChild(bar);
    paintBar();
    if (!live || (Date.now() - live.at) > 6 * 36e5) pull();   // 超过 6 小时自动拉一次

    // ── 底线表：站在金店门口扫一眼牌子，不用输入 ──
    wrap.appendChild(el('div', { class: 'fx-h' }, '换钱底线表'));
    wrap.appendChild(el('div', { class: 'fx-tip', style: 'margin-top:0' },
      '金店门口挂牌子。对着这张表看他的牌价够不够，柜台前不用算。'));
    var tb = el('div', { class: 'fx-tb' });
    var hd = el('div', { class: 'fx-tr fx-thead' });
    ['我给', '好价 ✓', '还行', '低于这个换一家'].forEach(function (h) { hd.appendChild(el('div', null, h)); });
    tb.appendChild(hd);
    [100, 200, 500, 1000].forEach(function (amt) {
      var tr = el('div', { class: 'fx-tr' });
      tr.appendChild(el('div', { class: 'fx-amt' }, '$' + amt));
      tr.appendChild(el('div', { class: 'fx-good' }, fmt(amt * baseUSD * 0.99)));
      tr.appendChild(el('div', null, fmt(amt * baseUSD * 0.97)));
      tr.appendChild(el('div', { class: 'fx-bad' }, fmt(amt * baseUSD * 0.94)));
      tb.appendChild(tr);
    });
    wrap.appendChild(tb);
    wrap.appendChild(el('div', { class: 'fx-tip' },
      '数字随上面的实时汇率走。$1000 全换的话，好价和「换一家」之间差 ' +
      fmt(1000 * baseUSD * 0.05) + ' 盾 ≈ ' + fmt(1000 * baseUSD * 0.05 / baseCNY, 0) + ' 元 —— 值得多走两家。'));

    // ── 三向换算 ──
    wrap.appendChild(el('div', { class: 'fx-h' }, '换算'));
    var box = el('div', { class: 'fx-box' });
    var rows = [
      { k: 'vnd', label: '越南盾 ₫', ph: '20万写 200000' },
      { k: 'cny', label: '人民币 ¥', ph: '' },
      { k: 'usd', label: '美元 $', ph: '' }
    ];
    var inputs = {};
    rows.forEach(function (r) {
      var row = el('div', { class: 'fx-row' });
      row.appendChild(el('div', { class: 'fx-lb' }, r.label));
      var inp = el('input', { class: 'fx-in', type: 'text', inputmode: 'decimal', placeholder: r.ph });
      inputs[r.k] = inp;
      inp.addEventListener('input', function () {
        var v = parseFloat(inp.value.replace(/[,，\s]/g, ''));
        if (!isFinite(v)) { Object.keys(inputs).forEach(function (k) { if (k !== r.k) inputs[k].value = ''; }); return; }
        var vnd = r.k === 'vnd' ? v : (r.k === 'cny' ? v * baseCNY : v * baseUSD);
        if (r.k !== 'vnd') inputs.vnd.value = fmt(vnd);
        if (r.k !== 'cny') inputs.cny.value = fmt(vnd / baseCNY, 1);
        if (r.k !== 'usd') inputs.usd.value = fmt(vnd / baseUSD, 1);
      });
      row.appendChild(inp);
      box.appendChild(row);
    });
    wrap.appendChild(box);
    wrap.appendChild(el('div', { class: 'fx-tip' },
      '心算：越南盾去掉三个零再除 4，就是人民币。20 万 → 200 ÷ 4 = 50 元（实际 ' + fmt(200000 / baseCNY, 0) + '）'));

    // ── 划不划算 ──
    wrap.appendChild(el('div', { class: 'fx-h' }, '有人口头报价时用'));
    wrap.appendChild(el('div', { class: 'fx-tip', style: 'margin-top:0' },
      '牌子上没写、对方口头报价的时候，把两个数填进去。'));
    var jb = el('div', { class: 'fx-box judge' });
    var give = el('input', { class: 'fx-in', type: 'text', inputmode: 'decimal', placeholder: '我给 100' });
    var cur = el('select', { class: 'fx-sel' });
    ['美元 $', '人民币 ¥'].forEach(function (t, i) { var o = el('option', { value: i ? 'cny' : 'usd' }, t); cur.appendChild(o); });
    var get = el('input', { class: 'fx-in', type: 'text', inputmode: 'decimal', placeholder: '他给我 2600000 盾' });
    var r1 = el('div', { class: 'fx-row' }); r1.appendChild(el('div', { class: 'fx-lb' }, '我给')); r1.appendChild(give); r1.appendChild(cur);
    var r2 = el('div', { class: 'fx-row' }); r2.appendChild(el('div', { class: 'fx-lb' }, '他给我')); r2.appendChild(get);
    jb.appendChild(r1); jb.appendChild(r2);
    var out = el('div', { class: 'fx-out' }, '填完两个数就出结果');
    jb.appendChild(out);
    function judge() {
      var a = parseFloat(give.value.replace(/[,，\s]/g, '')), b = parseFloat(get.value.replace(/[,，\s]/g, ''));
      if (!isFinite(a) || !isFinite(b) || a <= 0) { out.className = 'fx-out'; out.textContent = '填完两个数就出结果'; return; }
      var base = cur.value === 'usd' ? baseUSD : baseCNY;
      var got = b / a, diff = (got - base) / base * 100;
      var label, cls;
      if (diff >= -1) { label = '好价，收'; cls = 'ok'; }
      else if (diff >= -3) { label = '正常，可以接受'; cls = 'ok'; }
      else if (diff >= -6) { label = '偏低，能砍就砍'; cls = 'warn'; }
      else { label = '亏太多，换一家'; cls = 'bad'; }
      out.className = 'fx-out ' + cls;
      out.innerHTML = '<b>' + label + '</b><br>他给的汇率 1' + (cur.value === 'usd' ? '$' : '¥') + ' = ' +
        fmt(got) + ' 盾<br>基准是 ' + fmt(base) + ' 盾，<b>' + (diff >= 0 ? '高' : '低') +
        ' ' + Math.abs(diff).toFixed(1) + '%</b>' +
        (diff < -1 ? '（少拿约 ' + fmt(a * base - b) + ' 盾 ≈ ' + fmt((a * base - b) / baseCNY, 0) + ' 元）' : '');
    }
    [give, get].forEach(function (i) { i.addEventListener('input', judge); });
    cur.addEventListener('change', judge);
    wrap.appendChild(jb);
    wrap.appendChild(el('div', { class: 'fx-tip' },
      '换钱所和金店的价本来就比基准低一点点（那是人家的利润）。低 1-3% 正常，低 6% 以上换一家。'));

    // ── 基准汇率（可改）──
    wrap.appendChild(el('div', { class: 'fx-h' }, '离线基准（拿不到实时汇率时用这个）'));
    var bb = el('div', { class: 'fx-box' });
    [['base', '1 元 = ? 盾', baseCNY], ['usd', '1 美元 = ? 盾', baseUSD]].forEach(function (t) {
      var row = el('div', { class: 'fx-row' });
      row.appendChild(el('div', { class: 'fx-lb' }, t[1]));
      var inp = el('input', { class: 'fx-in', type: 'text', inputmode: 'decimal', value: String(t[2]) });
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value.replace(/[,，\s]/g, ''));
        if (isFinite(v) && v > 0) { VNAPP.state.bag.fx[t[0]] = v; VNAPP.save(); }
      });
      row.appendChild(inp); bb.appendChild(row);
    });
    wrap.appendChild(bb);
    wrap.appendChild(el('div', { class: 'fx-tip' }, VNAPP.esc(F.note || '') + '　数据：' + VNAPP.esc(F.asof || '')));
    return wrap;
  }

  // ---- 8 导出 ----
  function buildExport(D, state) {
    return el('div', null,
      el('div', { class: 'bag-row', style: 'margin-bottom:10px' }, '把这次改过的所有东西（换的、跳的、挪的、打卡的、❤、复活的、备注、行囊里的勾选和记账）整理成一段文字，复制粘给枳。'),
      el('button', {
        class: 'btn bag-export-btn', type: 'button', onclick: function () {
          var txt = buildExportText(D, state);
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(function () {
              VNAPP.toast('已复制');
            }).catch(function () {
              VNAPP.toast('复制失败，长按选择文字');
            });
          } else {
            VNAPP.toast('这个浏览器不支持自动复制');
          }
        }
      }, '复制我的所有改动')
    );
  }

  function buildExportText(D, state) {
    var lines = ['=== 越南行程 · 我的改动 ==='];
    var plan = state.plan || {};
    var planDays = Object.keys(plan);
    if (planDays.length) {
      lines.push('', '【换过的候选】');
      planDays.forEach(function (day) {
        var slots = plan[day] || {};
        Object.keys(slots).forEach(function (slot) {
          var p = slots[slot] || {};
          var label = SLOT_LABEL[slot] || slot;
          if (p.chosen && p.chosen.length) lines.push(day + ' ' + label + '：选了 ' + p.chosen.map(nameOf).join('、'));
          if (p.skipped && p.skipped.length) lines.push(day + ' ' + label + '：跳过 ' + p.skipped.map(nameOf).join('、'));
        });
      });
    }
    var moved = state.moved || {};
    var movedIds = Object.keys(moved);
    if (movedIds.length) {
      lines.push('', '【挪了天的】');
      movedIds.forEach(function (id) {
        var m = moved[id];
        lines.push(nameOf(id) + ' → 挪到 ' + m.to + ' ' + (SLOT_LABEL[m.slot] || m.slot));
      });
    }
    var done = state.done || {};
    var doneIds = Object.keys(done);
    if (doneIds.length) {
      lines.push('', '【已打卡】(' + doneIds.length + ' 处)');
      doneIds.forEach(function (id) { lines.push(nameOf(id) + ' · ' + done[id]); });
    }
    var hearts = Object.keys(state.hearts || {});
    if (hearts.length) {
      lines.push('', '【❤ 收藏】');
      lines.push(hearts.map(nameOf).join('、'));
    }
    var revived = Object.keys(state.revived || {});
    if (revived.length) {
      lines.push('', '【复活的灰点】');
      revived.forEach(function (zid) {
        var z = D.zones[zid];
        var grey = (D.grey || []).filter(function (g) { return g.zone === zid; })[0];
        lines.push(z ? z.name : (grey ? grey.name : zid));
      });
    }
    var notes = state.notes || {};
    var noteKeys = Object.keys(notes).filter(function (k) { return notes[k]; });
    if (noteKeys.length) {
      lines.push('', '【备注】');
      noteKeys.forEach(function (k) {
        if (k.indexOf('day:') === 0) lines.push(k.slice(4) + ' 这天：' + notes[k]);
        else lines.push(nameOf(k) + '：' + notes[k]);
      });
    }
    var bag = state.bag || {};
    var checkKeys = Object.keys(bag.check || {}).filter(function (k) { return bag.check[k]; });
    if (checkKeys.length) {
      lines.push('', '【已勾选】');
      lines.push(checkKeys.join('、'));
    }
    if (bag.memo) lines.push('', '【备忘】', bag.memo);
    if (bag.expenses && bag.expenses.length) {
      lines.push('', '【记账流水】');
      var total = 0;
      bag.expenses.forEach(function (e) {
        total += Number(e.cny) || 0;
        lines.push(e.d + ' ' + e.what + ' ¥' + e.cny);
      });
      lines.push('合计 ¥' + Math.round(total * 100) / 100);
    }
    return lines.join('\n');
  }

  function render(root) {
    var D = VNAPP.DATA;
    var state = VNAPP.state;
    var bag = ensureBag();

    root.innerHTML = '';
    var style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);

    var wrap = el('div', { class: 'bag-tab' });
    wrap.appendChild(section(bag, 'transport', '🚌 交通', buildTransport(D)));
    wrap.appendChild(section(bag, 'bookings', '🎫 要订的', buildBookings(D, bag)));
    wrap.appendChild(section(bag, 'budget', '💰 预算 & 记账', buildBudget(D, bag, root)));
    wrap.appendChild(section(bag, 'memo', '📝 备忘', buildMemo(bag)));
    wrap.appendChild(section(bag, 'emergency', '🆘 紧急联络', buildEmergency(D)));
    wrap.appendChild(section(bag, 'checklist', '✅ 清单', buildChecklist(D, bag)));
    wrap.appendChild(section(bag, 'stay', '🏨 住宿', buildStay(D)));
    wrap.appendChild(section(bag, 'fx', '💱 汇率 · 划不划算', buildFx(D)));
    wrap.appendChild(section(bag, 'export', '📤 导出', buildExport(D, state)));
    root.appendChild(wrap);
  }

  VNAPP.registerTab('bag', {
    kicker: 'HÀNH LÝ', title: '行囊', icon: '🎒', render: render });
})();
