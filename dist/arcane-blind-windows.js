/* Arcane Blind Windows 1.1.0
 * https://github.com/deekay2153/arcane-blind-windows
 *
 * Every room drawn as its windows, each blind shown at its real height and
 * sliding as it moves. The sky outside follows the sun.
 *
 *   Tap a window      open / close it (tap again while it moves = stop)
 *   Drag up or down   set a height, sent when you let go
 *   Room buttons      open / stop / close every blind in the room
 *   Top buttons       open / close every blind on the card
 *
 *   type: custom:arcane-blind-windows
 *   title: Blinds                 (header: false hides the top row)
 *   stagger: 0                    seconds between blinds when several move
 *                                 at once (for hubs that drop commands)
 *   script: script.my_sender      optional: open / close of script_min or
 *   script_min: 2                 more blinds goes through this script,
 *   script_data: {}               called with {covers, command} plus script_data
 *   fabric: "#dcd7cc"             blind colour
 *   rooms:
 *     - name: Bedroom
 *       icon: mdi:bed
 *       blinds:
 *         - entity: cover.bedroom_left
 *           name: Left
 *           travel: 20            seconds from fully open to fully closed
 *           shape: window         window | door
 *           panes: 1              how wide it is drawn (2 = twice as wide)
 *           join: false           true = shares a frame with the one before
 *           bar: true             doors: false hides the middle bar
 *
 * Blinds that report where they are slide to the reported height. Blinds that
 * don't (most motor hubs without feedback) are drawn moving at their travel
 * time and settle on what Home Assistant believes afterwards.
 */
const VERSION = '1.1.0';
const HEAD = 6; // % of the window the rolled-up blind always covers

const ICON = {
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7.5" y="7.5" width="9" height="9" rx="1.5" class="fill" /></svg>',
};

const CSS = `
  :host { display: block; container-type: inline-size; }
  * { box-sizing: border-box; }
  .top { display: flex; align-items: center; gap: 12px; padding: 2px 4px 14px; }
  .top h1 { margin: 0; font-size: 22px; font-weight: 500; line-height: 1.2;
    color: var(--primary-text-color, #fff); }
  .top .sum { font-size: 14px; color: var(--secondary-text-color, #9aa); margin-top: 2px; }
  .top .grow { flex: 1; min-width: 0; }
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 16px 0 10px;
    border-radius: 20px; border: 0; cursor: pointer; font: inherit; font-size: 14px; font-weight: 500;
    color: var(--primary-text-color, #fff);
    background: var(--ha-card-background, var(--card-background-color, #1c1f24));
    box-shadow: inset 0 0 0 1px var(--divider-color, rgba(255,255,255,0.12));
    -webkit-tap-highlight-color: transparent; }
  .pill:active, .rb:active { transform: scale(0.94); }
  svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.2;
    stroke-linecap: round; stroke-linejoin: round; display: block; }
  svg .fill { fill: currentColor; stroke: none; }

  .rooms { display: grid; grid-template-columns: 1fr; gap: 14px; }
  @container (min-width: 620px) { .rooms { grid-template-columns: 1fr 1fr; } }
  @container (min-width: 1500px) { .rooms { grid-template-columns: repeat(4, 1fr); } }

  .room { border-radius: var(--ha-card-border-radius, 14px); padding: 12px 14px 14px;
    background: var(--ha-card-background, var(--card-background-color, #1c1f24));
    box-shadow: inset 0 0 0 1px var(--divider-color, rgba(255,255,255,0.08)); }
  .rh { display: flex; align-items: center; gap: 10px; min-height: 40px; }
  .rh ha-icon { color: var(--secondary-text-color, #9aa); --mdc-icon-size: 22px; flex: none; }
  .rh .grow { flex: 1; min-width: 0; }
  .rn { font-size: 16px; font-weight: 500; color: var(--primary-text-color, #fff);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rs { font-size: 12.5px; color: var(--secondary-text-color, #9aa); }
  .rbs { display: flex; flex: none; border-radius: 20px; overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--divider-color, rgba(255,255,255,0.12)); }
  .rb { width: 42px; height: 38px; border: 0; background: none; cursor: pointer; padding: 0;
    display: flex; align-items: center; justify-content: center;
    color: var(--primary-text-color, #fff); -webkit-tap-highlight-color: transparent; }
  .rb + .rb { box-shadow: -1px 0 0 var(--divider-color, rgba(255,255,255,0.12)); }

  .wall { display: flex; justify-content: center; align-items: flex-start; gap: 14px;
    padding: 16px 4px 2px; }
  .unit { flex: 1 1 0; min-width: 54px; max-width: 124px; text-align: center; }
  .unit.door { flex-grow: 1.4; max-width: 172px; }
  .win { position: relative; height: 168px; border-radius: 5px; overflow: hidden; cursor: pointer;
    border: 5px solid #eceae6; background: #6fb1e8;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.28), 0 6px 14px rgba(0,0,0,0.28);
    touch-action: none; user-select: none; -webkit-user-select: none;
    -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
  .unit.door .win { height: 190px; }
  .wall.doors .unit:not(.door) .win { margin-top: 22px; }
  .unit.join { margin-left: -14px; }
  .unit.join .win { border-left-width: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .unit:has(+ .unit.join) .win { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .sky { position: absolute; inset: 0; transition: opacity 1.5s; }
  .sky.day { background:
    radial-gradient(circle at 78% 20%, rgba(255,250,225,0.95) 0 7%, rgba(255,246,200,0.35) 14%, transparent 32%),
    linear-gradient(#5ea6e6, #a9d2f3 58%, #dcecf6 59%, #b9c9a8 60%, #8fae82); }
  .sky.dusk { background:
    radial-gradient(circle at 30% 60%, rgba(255,214,140,0.95) 0 6%, rgba(255,170,90,0.4) 16%, transparent 40%),
    linear-gradient(#3b4a86, #b9698a 40%, #f2a66a 59%, #4b4f46 60%, #33382f); }
  .sky.night { background:
    radial-gradient(circle at 74% 22%, #f3f1e4 0 5%, rgba(243,241,228,0.18) 6% 12%, transparent 13%),
    radial-gradient(1.2px 1.2px at 18% 14%, #fff, transparent),
    radial-gradient(1px 1px at 38% 30%, #dfe6ff, transparent),
    radial-gradient(1.2px 1.2px at 56% 10%, #fff, transparent),
    radial-gradient(1px 1px at 28% 46%, #cfd8ff, transparent),
    radial-gradient(1px 1px at 86% 44%, #fff, transparent),
    linear-gradient(#070d22, #142246 58%, #1b2a4a 59%, #0c1210 60%, #080c0b); }
  .sky:not(.on) { opacity: 0; }
  .bar { position: absolute; top: 0; bottom: 0; left: 50%; width: 5px; margin-left: -2.5px;
    background: #eceae6; box-shadow: 0 0 0 1px rgba(0,0,0,0.12); }
  .glare { position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(115deg, rgba(255,255,255,0.20) 0 18%, transparent 19% 34%,
      rgba(255,255,255,0.09) 35% 44%, transparent 45%); }
  .blind { position: absolute; left: 0; right: 0; top: 0; height: ${HEAD}%;
    transition: height 0.5s linear; will-change: height;
    background:
      repeating-linear-gradient(rgba(0,0,0,0) 0 9px, rgba(0,0,0,0.035) 9px 10px),
      linear-gradient(90deg, rgba(0,0,0,0.10), rgba(255,255,255,0.10) 18% 82%, rgba(0,0,0,0.12)),
      var(--blind-fabric, #dcd7cc);
    box-shadow: 0 3px 7px rgba(0,0,0,0.38); }
  .blind::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 9px;
    background: linear-gradient(#f6f5f2, #c9c6bf); box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
  .blind::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 6px;
    background: linear-gradient(#b9b5ac, #8f8b83); }
  .unit.drag .blind { transition: none; }
  .unit.off .win { opacity: 0.4; }
  .pct { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
    padding: 3px 9px; border-radius: 11px; font-size: 13px; font-weight: 600; color: #fff;
    background: rgba(0,0,0,0.62); opacity: 0; transition: opacity 0.15s; pointer-events: none;
    white-space: nowrap; }
  .unit.drag .pct { opacity: 1; }
  .bn { margin-top: 9px; font-size: 13.5px; font-weight: 500; color: var(--primary-text-color, #fff);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bs { font-size: 12.5px; color: var(--secondary-text-color, #9aa); white-space: nowrap; }
  .unit.moving .bs { color: var(--primary-color, #4aa3ff); }
`;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

class ArcaneBlindWindows extends HTMLElement {
  // Card picker: every cover, grouped into rooms by area.
  static getStubConfig(hass) {
    const covers = Object.keys((hass && hass.states) || {})
      .filter((id) => id.startsWith('cover.'))
      .slice(0, 24);
    const ents = (hass && hass.entities) || {};
    const devs = (hass && hass.devices) || {};
    const areas = (hass && hass.areas) || {};
    const rooms = new Map();
    covers.forEach((id) => {
      const e = ents[id] || {};
      const areaId = e.area_id || (e.device_id && devs[e.device_id] && devs[e.device_id].area_id) || '';
      const name = (areas[areaId] && areas[areaId].name) || 'Blinds';
      if (!rooms.has(name)) rooms.set(name, []);
      const st = hass.states[id];
      rooms.get(name).push({ entity: id, name: (st && st.attributes.friendly_name) || id });
    });
    if (!rooms.size) rooms.set('Living room', [{ entity: 'cover.living_room', name: 'Window' }]);
    return {
      title: 'Blinds',
      rooms: [...rooms].map(([name, blinds]) => ({ name, icon: 'mdi:blinds', blinds })),
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms) || !config.rooms.length) {
      throw new Error('arcane-blind-windows: list at least one room under "rooms"');
    }
    config.rooms.forEach((room, i) => {
      if (!room || !Array.isArray(room.blinds) || !room.blinds.length) {
        throw new Error(`arcane-blind-windows: room ${i + 1} needs a "blinds" list`);
      }
      room.blinds.forEach((b) => {
        if (!b || !b.entity) throw new Error(`arcane-blind-windows: every blind needs an "entity" (room ${i + 1})`);
      });
    });
    this._config = config;
    this._stagger = Math.max(0, Math.min(10, Number(config.stagger) || 0));
    this._script = config.script ? String(config.script).replace(/^script\./, '') : null;
    this._scriptMin = Math.max(1, Number(config.script_min) || 2);
    this._scriptData = config.script_data && typeof config.script_data === 'object' ? config.script_data : {};
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._blinds) this._update();
  }

  getCardSize() { return 10; }
  getGridOptions() { return { columns: 'full' }; }

  disconnectedCallback() {
    clearTimeout(this._tick);
  }

  connectedCallback() {
    if (this._hass && this._blinds) this._update();
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const c = this._config;
    this._blinds = [];
    this._rooms = [];
    const rooms = c.rooms.map((room, ri) => {
      const units = (room.blinds || []).map((b, bi) => `
        <div class="unit ${b.shape === 'door' ? 'door' : ''} ${b.join ? 'join' : ''}" ${Number(b.panes) > 0 ? `style="flex-grow:${1.4 * b.panes};max-width:${120 * b.panes}px"` : ''} data-r="${ri}" data-b="${bi}">
          <div class="win">
            <div class="sky day on"></div><div class="sky dusk"></div><div class="sky night"></div>
            ${b.shape === 'door' && b.bar !== false ? '<div class="bar"></div>' : ''}
            <div class="glare"></div>
            <div class="blind"></div>
            <div class="pct"></div>
          </div>
          <div class="bn">${esc(b.name || '')}</div>
          <div class="bs">&nbsp;</div>
        </div>`).join('');
      return `
        <div class="room" data-r="${ri}">
          <div class="rh">
            ${room.icon ? `<ha-icon icon="${esc(room.icon)}"></ha-icon>` : ''}
            <div class="grow"><div class="rn">${esc(room.name || '')}</div><div class="rs">&nbsp;</div></div>
            <div class="rbs">
              <button class="rb" data-cmd="open" aria-label="Open ${esc(room.name)}">${ICON.up}</button>
              <button class="rb" data-cmd="stop" aria-label="Stop ${esc(room.name)}">${ICON.stop}</button>
              <button class="rb" data-cmd="close" aria-label="Close ${esc(room.name)}">${ICON.down}</button>
            </div>
          </div>
          <div class="wall ${(room.blinds || []).some((b) => b.shape === 'door') ? 'doors' : ''}">${units}</div>
        </div>`;
    }).join('');

    this.shadowRoot.innerHTML = `<style>${CSS}</style>
      ${c.header === false ? '<div class="sum" hidden></div>' : `<div class="top">
        <div class="grow"><h1>${esc(c.title == null ? 'Blinds' : c.title)}</h1><div class="sum">&nbsp;</div></div>
        <button class="pill" data-cmd="open">${ICON.up}Open all</button>
        <button class="pill" data-cmd="close">${ICON.down}Close all</button>
      </div>`}
      <div class="rooms">${rooms}</div>`;
    if (c.fabric) this.style.setProperty('--blind-fabric', c.fabric);

    const root = this.shadowRoot;
    this._sum = root.querySelector('.sum');
    c.rooms.forEach((room, ri) => {
      const rel = root.querySelector(`.room[data-r="${ri}"]`);
      const r = { el: rel, sum: rel.querySelector('.rs'), blinds: [] };
      (room.blinds || []).forEach((cfg, bi) => {
        const unit = rel.querySelector(`.unit[data-b="${bi}"]`);
        const b = {
          id: cfg.entity,
          travel: Number(cfg.travel) || 20,
          unit,
          win: unit.querySelector('.win'),
          blind: unit.querySelector('.blind'),
          pct: unit.querySelector('.pct'),
          label: unit.querySelector('.bs'),
          skies: unit.querySelectorAll('.sky'),
          pos: null,
        };
        this._wire(b);
        r.blinds.push(b);
        this._blinds.push(b);
      });
      rel.querySelectorAll('.rb').forEach((btn) =>
        btn.addEventListener('click', () => this._many(r.blinds, btn.dataset.cmd)));
      this._rooms.push(r);
    });
    root.querySelectorAll('.pill').forEach((btn) =>
      btn.addEventListener('click', () => this._many(this._blinds, btn.dataset.cmd)));
  }

  /* ---------- pointer handling on one window ---------- */

  _wire(b) {
    const w = b.win;
    let y0 = 0;
    let pid = null;
    let dragPos = null;
    let from = 100;
    const posAt = (e) => {
      const r = w.getBoundingClientRect();
      const frac = (e.clientY - r.top) / r.height; // 0 top .. 1 bottom
      const p = 100 - ((frac * 100 - HEAD) / (100 - HEAD)) * 100;
      return Math.max(0, Math.min(100, Math.round(p / 5) * 5));
    };
    w.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      pid = e.pointerId;
      y0 = e.clientY;
      dragPos = null;
      try { w.setPointerCapture(pid); } catch (_) { /* older browsers */ }
    });
    w.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      if (!this._canSet(b)) return;
      if (dragPos === null && Math.abs(e.clientY - y0) < 8) return;
      if (dragPos === null) from = this._seen(b);
      dragPos = posAt(e);
      b.drag = true;
      b.unit.classList.add('drag');
      this._show(b, dragPos, 0);
      b.pct.textContent = dragPos >= 100 ? 'Open' : dragPos <= 0 ? 'Closed' : `${dragPos}% open`;
    });
    const end = (e, cancelled) => {
      if (e.pointerId !== pid) return;
      pid = null;
      const wasDrag = dragPos !== null;
      b.drag = false;
      b.unit.classList.remove('drag');
      if (cancelled) {
        if (wasDrag) this._show(b, from, 0);
        this._update();
        return;
      }
      if (wasDrag) {
        // The drag was a preview. Put the picture back where the blind really
        // is, then let it travel to the new height at its real speed.
        this._show(b, from, 0);
        void b.blind.offsetHeight;
        if (dragPos >= 97) this._go(b, 'open', 100, true);
        else if (dragPos <= 3) this._go(b, 'close', 0, true);
        else this._go(b, 'set', dragPos, true);
      } else if (this._isMoving(b)) {
        this._stop(b, true);
      } else {
        const p = b.pos == null ? 100 : b.pos;
        if (p > 50) this._go(b, 'close', 0, true);
        else this._go(b, 'open', 100, true);
      }
      this._update();
    };
    w.addEventListener('pointerup', (e) => end(e, false));
    w.addEventListener('pointercancel', (e) => end(e, true));
  }

  // Can this cover be sent to a height? (supported_features bit 4)
  _canSet(b) {
    const st = this._hass && this._hass.states[b.id];
    return !!st && (Number(st.attributes && st.attributes.supported_features) & 4) === 4;
  }

  /* ---------- drawing ---------- */

  _show(b, pos, seconds) {
    b.blind.style.transitionDuration = `${Math.max(0, seconds)}s`;
    b.blind.style.height = `${HEAD + ((100 - pos) * (100 - HEAD)) / 100}%`;
  }

  // Where the blind is on screen right now (mid-animation included).
  _seen(b) {
    const wh = b.win.clientHeight;
    if (!wh) return b.pos == null ? 100 : b.pos;
    const h = (b.blind.getBoundingClientRect().height / wh) * 100;
    return Math.max(0, Math.min(100, 100 - ((h - HEAD) / (100 - HEAD)) * 100));
  }

  _isMoving(b) {
    const now = Date.now();
    if (b.anim && now < b.anim.end) return true;
    const st = this._hass && this._hass.states[b.id];
    return !!st && (st.state === 'opening' || st.state === 'closing') && !(b.hold > now);
  }

  _update() {
    const hass = this._hass;
    if (!hass) return;
    const now = Date.now();
    let next = 0;
    const sun = hass.states['sun.sun'];
    let sky = 'day';
    if (sun) {
      const el = Number(sun.attributes && sun.attributes.elevation);
      if (sun.state === 'below_horizon') sky = el > -6 ? 'dusk' : 'night';
      else if (el < 6) sky = 'dusk';
    }

    for (const b of this._blinds) {
      if (b.sky !== sky) {
        b.sky = sky;
        b.skies.forEach((s) => s.classList.toggle('on', s.classList.contains(sky)));
      }
      const st = hass.states[b.id];
      const dead = !st || st.state === 'unavailable' || st.state === 'unknown';
      b.unit.classList.toggle('off', dead);
      if (dead) {
        b.label.textContent = st ? 'Unavailable' : 'Not found';
        b.unit.classList.remove('moving');
        b.pos = null;
        continue;
      }
      const attr = st.attributes && st.attributes.current_position;
      const real = attr == null ? (st.state === 'closed' ? 0 : 100) : Number(attr);
      const hmoving = st.state === 'opening' || st.state === 'closing';

      // Our own command: keep the estimate running until it is due to finish,
      // unless Home Assistant says it stopped somewhere else.
      if (b.anim) {
        const stoppedElsewhere = now > b.anim.start + 2500 && !hmoving &&
          now < b.anim.end && Math.abs(real - b.anim.to) > 3;
        if (stoppedElsewhere) b.anim = null;
        else if (now >= b.anim.end + 1200) {
          // Still reported as moving: hold the picture until it settles.
          if (hmoving) b.soft = { pos0: real };
          b.anim = null;
        } else next = next ? Math.min(next, b.anim.end + 1250) : b.anim.end + 1250;
      }
      if (b.hold && now >= b.hold) b.hold = 0;
      if (b.hold) next = next ? Math.min(next, b.hold + 50) : b.hold + 50;

      let moving = false;
      let dir = '';
      if (b.anim) {
        b.pos = b.anim.to;
        moving = now < b.anim.end;
        dir = b.anim.dir;
      } else if (b.hold) {
        // just stopped by hand: leave the picture where it was
      } else {
        if (hmoving && !b.soft && b.lastState !== st.state) {
          // Something else started it. Estimate until it reports for itself.
          const to = st.state === 'opening' ? 100 : 0;
          const from = this._seen(b);
          b.soft = { pos0: real };
          if (!b.drag) this._show(b, to, (b.travel * Math.abs(to - from)) / 100);
        } else if (b.soft && (!hmoving || real !== b.soft.pos0)) {
          b.soft = null;
        }
        if (!b.soft && !b.drag) this._show(b, real, hmoving ? 1.2 : 0.5);
        b.pos = real;
        moving = hmoving;
        dir = st.state;
      }
      b.lastState = st.state;

      b.unit.classList.toggle('moving', moving);
      const p = Math.round(b.pos == null ? real : b.pos);
      b.label.textContent = moving
        ? (dir === 'opening' ? 'Opening…' : dir === 'closing' ? 'Closing…' : 'Moving…')
        : p >= 97 ? 'Open' : p <= 3 ? 'Closed' : `${p}% open`;
    }

    const describe = (list) => {
      const live = list.filter((b) => b.pos != null);
      if (!live.length) return 'Unavailable';
      const open = live.filter((b) => b.pos >= 97).length;
      const shut = live.filter((b) => b.pos <= 3).length;
      const part = live.length - open - shut;
      if (open === live.length) return live.length > 1 ? 'All open' : 'Open';
      if (shut === live.length) return live.length > 1 ? 'All closed' : 'Closed';
      const bits = [];
      if (open) bits.push(`${open} open`);
      if (part) bits.push(`${part} part-way`);
      if (shut) bits.push(`${shut} closed`);
      return bits.join(' · ');
    };
    this._rooms.forEach((r) => { r.sum.textContent = describe(r.blinds); });
    this._sum.textContent = describe(this._blinds);

    clearTimeout(this._tick);
    if (next) this._tick = setTimeout(() => this._update(), Math.max(60, next - Date.now()));
  }

  /* ---------- commands ---------- */

  _call(domain, service, data) {
    if (!this._hass) return;
    const p = this._hass.callService(domain, service, data);
    if (p && p.catch) p.catch((err) => console.warn('arcane-blind-windows: call failed', err));
  }

  // Start the on-screen estimate; send the command too when `send` is set.
  _go(b, kind, to, send) {
    if (b.pos == null && !(this._hass && this._hass.states[b.id])) return;
    const from = this._seen(b);
    const secs = Math.max(0.3, (b.travel * Math.abs(to - from)) / 100);
    const now = Date.now();
    b.soft = null;
    b.hold = 0;
    b.anim = { to, start: now, end: now + secs * 1000, dir: to > from ? 'opening' : 'closing' };
    this._show(b, to, secs);
    if (!send) return;
    if (kind === 'open') this._call('cover', 'open_cover', { entity_id: b.id });
    else if (kind === 'close') this._call('cover', 'close_cover', { entity_id: b.id });
    else this._call('cover', 'set_cover_position', { entity_id: b.id, position: to });
  }

  _stop(b, send) {
    clearTimeout(b.later);
    const at = this._seen(b);
    b.anim = null;
    b.soft = null;
    b.hold = Date.now() + 2500;
    b.pos = Math.round(at);
    this._show(b, at, 0);
    if (send) this._call('cover', 'stop_cover', { entity_id: b.id });
  }

  _many(blinds, cmd) {
    const live = blinds.filter((b) => this._hass && this._hass.states[b.id]);
    if (!live.length) return;
    const ids = live.map((b) => b.id);
    if (cmd === 'stop') {
      live.forEach((b) => this._stop(b, false));
      this._call('cover', 'stop_cover', { entity_id: ids });
    } else {
      const to = cmd === 'open' ? 100 : 0;
      if (this._script && live.length >= this._scriptMin) {
        // Your own script sends the commands (for example one that queues
        // them with your automations). The picture starts each blind on the
        // `stagger` beat, if set, to match the script's spacing.
        live.forEach((b, i) => {
          clearTimeout(b.later);
          if (i && this._stagger) {
            b.later = setTimeout(() => { this._go(b, cmd, to, false); this._update(); }, i * this._stagger * 1000);
          } else {
            this._go(b, cmd, to, false);
          }
        });
        this._call('script', this._script, { ...this._scriptData, covers: ids, command: cmd });
      } else if (this._stagger && live.length > 1) {
        // One blind at a time, `stagger` seconds apart, for hubs that drop
        // commands sent together. The picture starts each blind on its beat.
        live.forEach((b, i) => {
          clearTimeout(b.later);
          const go = () => { this._go(b, cmd, to, true); this._update(); };
          if (i) b.later = setTimeout(go, i * this._stagger * 1000);
          else this._go(b, cmd, to, true);
        });
      } else {
        live.forEach((b) => { clearTimeout(b.later); this._go(b, cmd, to, false); });
        this._call('cover', cmd === 'open' ? 'open_cover' : 'close_cover', { entity_id: ids });
      }
    }
    this._update();
  }
}

if (!customElements.get('arcane-blind-windows')) {
  customElements.define('arcane-blind-windows', ArcaneBlindWindows);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'arcane-blind-windows',
    name: 'Arcane Blind Windows',
    description: 'Rooms drawn as windows, with blinds you tap to open or close and drag to any height.',
    preview: true,
    documentationURL: 'https://github.com/deekay2153/arcane-blind-windows',
  });
  console.info(`%c ARCANE-BLIND-WINDOWS %c ${VERSION} `,
    'color:#fff;background:#3b82f6;font-weight:700', 'color:#3b82f6;background:#fff');
}
