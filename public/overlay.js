import { TAVERN_ASSETS, TAVERN_LAYOUT } from './overlay-layout.js';

const root = document.getElementById('overlay-root');
const params = new URLSearchParams(window.location.search);

function numberParam(name, fallback) {
  const raw = params.get(name);
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function textParam(name, fallback) {
  const raw = params.get(name);
  return raw === null || raw === '' ? fallback : raw;
}

function boolParam(name, fallback = true) {
  const raw = params.get(name);
  if (raw === null) return fallback;
  return raw !== '0' && raw !== 'false';
}

function normalizeItemType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pelmeni' || normalized === 'dumpling' || normalized === 'dumplings') return 'pelmen';
  if (normalized === 'pancakes' || normalized === 'oladushki' || normalized === 'oladya') return 'pancake';
  if (TAVERN_ASSETS.items[normalized]) return normalized;
  return TAVERN_LAYOUT.items.type;
}

const layout = {
  ...TAVERN_LAYOUT,
  overlay: {
    x: numberParam('overlayX', TAVERN_LAYOUT.overlay.x),
    y: numberParam('overlayY', TAVERN_LAYOUT.overlay.y),
    scale: numberParam('overlayScale', TAVERN_LAYOUT.overlay.scale)
  },
  title: {
    ...TAVERN_LAYOUT.title,
    top: numberParam('titleTop', TAVERN_LAYOUT.title.top),
    centerX: numberParam('titleX', TAVERN_LAYOUT.title.centerX),
    width: numberParam('titleWidth', TAVERN_LAYOUT.title.width),
    height: numberParam('titleHeight', TAVERN_LAYOUT.title.height),
    textInset: {
      top: numberParam('questionTop', TAVERN_LAYOUT.title.textInset.top),
      right: numberParam('questionRight', TAVERN_LAYOUT.title.textInset.right),
      bottom: numberParam('questionBottom', TAVERN_LAYOUT.title.textInset.bottom),
      left: numberParam('questionLeft', TAVERN_LAYOUT.title.textInset.left)
    }
  },
  stats: {
    ...TAVERN_LAYOUT.stats,
    top: numberParam('statsTop', TAVERN_LAYOUT.stats.top),
    leftX: numberParam('leftStatsX', TAVERN_LAYOUT.stats.leftX),
    rightX: numberParam('rightStatsX', TAVERN_LAYOUT.stats.rightX),
    width: numberParam('statsWidth', TAVERN_LAYOUT.stats.width),
    height: numberParam('statsHeight', TAVERN_LAYOUT.stats.height)
  },
  rig: {
    ...TAVERN_LAYOUT.rig,
    top: numberParam('rigTop', TAVERN_LAYOUT.rig.top),
    centerX: numberParam('rigX', TAVERN_LAYOUT.rig.centerX),
    scale: numberParam('rigScale', TAVERN_LAYOUT.rig.scale)
  },
  geometry: {
    ...TAVERN_LAYOUT.geometry,
    beamWrapY: numberParam('beamWrapY', TAVERN_LAYOUT.geometry.beamWrapY),
    pivot: {
      x: numberParam('pivotX', TAVERN_LAYOUT.geometry.pivot.x),
      y: numberParam('pivotY', TAVERN_LAYOUT.geometry.pivot.y)
    },
    attachLeft: {
      x: numberParam('attachLeftX', TAVERN_LAYOUT.geometry.attachLeft.x),
      y: numberParam('attachLeftY', TAVERN_LAYOUT.geometry.attachLeft.y)
    },
    attachRight: {
      x: numberParam('attachRightX', TAVERN_LAYOUT.geometry.attachRight.x),
      y: numberParam('attachRightY', TAVERN_LAYOUT.geometry.attachRight.y)
    },
    panHang: {
      x: numberParam('panHangX', TAVERN_LAYOUT.geometry.panHang.x),
      y: numberParam('panHangY', TAVERN_LAYOUT.geometry.panHang.y)
    },
    panScale: numberParam('panScale', TAVERN_LAYOUT.geometry.panScale),
    itemBox: {
      x: numberParam('itemBoxX', TAVERN_LAYOUT.geometry.itemBox.x),
      y: numberParam('itemBoxY', TAVERN_LAYOUT.geometry.itemBox.y),
      width: numberParam('itemBoxWidth', TAVERN_LAYOUT.geometry.itemBox.width),
      height: numberParam('itemBoxHeight', TAVERN_LAYOUT.geometry.itemBox.height)
    },
    vsSize: numberParam('vsSize', TAVERN_LAYOUT.geometry.vsSize)
  },
  tilt: {
    maxDeg: numberParam('maxTilt', TAVERN_LAYOUT.tilt.maxDeg)
  },
  animation: {
    durationMs: numberParam('animationMs', TAVERN_LAYOUT.animation.durationMs),
    easing: textParam('animationEase', TAVERN_LAYOUT.animation.easing)
  },
  items: {
    ...TAVERN_LAYOUT.items,
    type: normalizeItemType(params.get('item') || params.get('itemType') || TAVERN_LAYOUT.items.type),
    maxPerPan: numberParam('maxItems', TAVERN_LAYOUT.items.maxPerPan),
    size: numberParam('itemSize', TAVERN_LAYOUT.items.size),
    stepX: numberParam('itemStepX', TAVERN_LAYOUT.items.stepX),
    stepY: numberParam('itemStepY', TAVERN_LAYOUT.items.stepY)
  }
};

const config = {
  token: params.get('token') || '',
  mode: params.get('mode') || 'scale',
  metric: params.get('metric') || 'votes',
  showTitle: params.get('showTitle') !== '0',
  showTimer: params.get('showTimer') !== '0',
  showMeta: params.get('showMeta') !== '0',
  animation: params.get('animation') || 'full',
  pairOrder: params.get('pairOrder') || 'source',
  fitStage: boolParam('fit', true),
  itemValue: numberParam('itemValue', 0),
  preview: params.get('preview') === '1' || params.get('data') === 'query'
};

root.className = `overlay-root theme-tavern animation-${config.animation}`;

let snapshot = null;
let socket = null;
let reconnectTimer = null;
let lastValues = new Map();
let lastChoiceValues = new Map();
let timerInterval = null;
let activeView = null;
let dom = {};
let vsRotation = 0;
let lastPairHash = '';
let itemState = {
  left: { count: 0, type: layout.items.type },
  right: { count: 0, type: layout.items.type }
};

applyLayoutVars();
syncStageFit();
window.addEventListener('resize', syncStageFit);

if (params.get('demo') === '1') {
  fetch(`/api/demo/start?token=${encodeURIComponent(config.token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Overlay-Token': config.token },
    body: JSON.stringify({
      title: textParam('question', 'Кто перевесит в таверне?'),
      choices: [textParam('leftLabel', 'Синяя дружина'), textParam('rightLabel', 'Фиолетовая дружина')]
    })
  }).catch(() => {});
}

const previewSnapshot = buildQuerySnapshot();
if (previewSnapshot) {
  snapshot = previewSnapshot;
  render();
} else {
  connect();
}

function applyLayoutVars() {
  const rootStyle = document.documentElement.style;
  const vars = {
    '--stage-w': `${layout.stage.width}px`,
    '--stage-h': `${layout.stage.height}px`,
    '--overlay-x': `${layout.overlay.x}px`,
    '--overlay-y': `${layout.overlay.y}px`,
    '--overlay-scale': layout.overlay.scale,
    '--rig-top': `${layout.rig.top}px`,
    '--rig-center-x': `${layout.rig.centerX}px`,
    '--rig-scale': layout.rig.scale,
    '--beam-wrap-y': `${layout.geometry.beamWrapY}px`,
    '--pivot-x': `${layout.geometry.pivot.x}px`,
    '--pivot-y': `${layout.geometry.pivot.y}px`,
    '--pan-hang-x': `${layout.geometry.panHang.x}px`,
    '--pan-hang-y': `${layout.geometry.panHang.y}px`,
    '--pan-scale': layout.geometry.panScale,
    '--vs-x': `${layout.geometry.pivot.x}px`,
    '--vs-y': `${layout.geometry.pivot.y + layout.geometry.beamWrapY}px`,
    '--vs-size': `${layout.geometry.vsSize}px`,
    '--title-top': `${layout.title.top}px`,
    '--title-center-x': `${layout.title.centerX}px`,
    '--title-width': `${layout.title.width}px`,
    '--title-height': `${layout.title.height}px`,
    '--title-pad-top': `${layout.title.textInset.top}px`,
    '--title-pad-right': `${layout.title.textInset.right}px`,
    '--title-pad-bottom': `${layout.title.textInset.bottom}px`,
    '--title-pad-left': `${layout.title.textInset.left}px`,
    '--stats-top': `${layout.stats.top}px`,
    '--stats-left-x': `${layout.stats.leftX}px`,
    '--stats-right-x': `${layout.stats.rightX}px`,
    '--stats-width': `${layout.stats.width}px`,
    '--stats-height': `${layout.stats.height}px`,
    '--item-box-x': `${layout.geometry.itemBox.x}px`,
    '--item-box-y': `${layout.geometry.itemBox.y}px`,
    '--item-box-w': `${layout.geometry.itemBox.width}px`,
    '--item-box-h': `${layout.geometry.itemBox.height}px`,
    '--item-size': `${layout.items.size}px`,
    '--motion-duration': `${layout.animation.durationMs}ms`,
    '--motion-ease': layout.animation.easing
  };

  Object.entries(vars).forEach(([name, value]) => rootStyle.setProperty(name, value));
}

function syncStageFit() {
  const fit = config.fitStage
    ? Math.min(window.innerWidth / layout.stage.width, window.innerHeight / layout.stage.height)
    : 1;
  document.documentElement.style.setProperty('--stage-fit', String(fit));
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.host}/ws/overlay?token=${encodeURIComponent(config.token)}`;
  socket = new WebSocket(wsUrl);

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'snapshot') {
        snapshot = message.payload;
        render();
      }
    } catch (error) {
      console.error('Overlay message parse failed:', error);
    }
  });

  socket.addEventListener('close', () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 2000);
  });
}

function metricLabel() {
  if (config.metric === 'points') return 'баллов';
  if (config.metric === 'cpVotes') return 'CP votes';
  return 'голосов';
}

function valueFor(choice) {
  if (!choice) return 0;
  if (config.metric === 'points') return Number(choice.pointsSpent || 0);
  if (config.metric === 'cpVotes') return Number(choice.channelPointsVotes || 0);
  return Number(choice.votes || 0);
}

function formatValue(value) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0));
}

function percent(value, total) {
  if (!total) return 0;
  return (Number(value || 0) / total) * 100;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function timeLeft(poll) {
  if (!poll?.endsAt || poll.status !== 'running') return poll?.status === 'ended' ? 'END' : '';
  const ms = Math.max(0, new Date(poll.endsAt).getTime() - Date.now());
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function sortedChoices(poll) {
  return [...(poll.choices || [])].sort((a, b) => valueFor(b) - valueFor(a));
}

function pairChoices(poll) {
  const source = poll.choices || [];
  const choices = config.pairOrder === 'ranked' ? sortedChoices(poll) : source;
  const left = choices[0] || { id: 'left-empty', title: 'Left', votes: 0, pointsSpent: 0 };
  const right = choices[1] || { id: 'right-empty', title: 'Right', votes: 0, pointsSpent: 0 };
  return [left, right];
}

function totalsFor(poll) {
  const choices = poll.choices || [];
  const values = choices.map(valueFor);
  return {
    metricTotal: values.reduce((sum, value) => sum + value, 0),
    votes: poll.totals?.votes || choices.reduce((sum, item) => sum + Number(item.votes || 0), 0),
    points: poll.totals?.pointsSpent || choices.reduce((sum, item) => sum + Number(item.pointsSpent || 0), 0)
  };
}

function animateNumber(element, key, target, formatter = formatValue) {
  const previous = Number(lastValues.get(key) ?? target);
  const next = Number(target || 0);
  lastValues.set(key, next);

  if (!element) return;
  if (config.animation === 'reduced' || previous === next) {
    element.textContent = formatter(next);
    return;
  }

  const duration = Math.min(900, Math.max(260, layout.animation.durationMs * 0.7));
  const start = performance.now();
  const delta = next - previous;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    element.textContent = formatter(previous + delta * eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function animateNumbers(scope = root) {
  scope.querySelectorAll('[data-number-key]').forEach((element) => {
    const key = element.dataset.numberKey;
    const target = Number(element.dataset.numberTarget || 0);
    const kind = element.dataset.numberKind || 'value';
    animateNumber(element, key, target, (value) => {
      if (kind === 'percent') return `${Math.round(value)}%`;
      return formatValue(value);
    });
  });
}

function buildQuerySnapshot() {
  const hasData = config.preview
    || params.has('question')
    || params.has('leftVotes')
    || params.has('rightVotes')
    || params.has('leftPoints')
    || params.has('rightPoints')
    || params.has('leftPercent')
    || params.has('rightPercent');

  if (!hasData) return null;

  const leftPercent = numberParam('leftPercent', NaN);
  const rightPercent = numberParam('rightPercent', NaN);
  const percentagesProvided = Number.isFinite(leftPercent) || Number.isFinite(rightPercent);
  const resolvedLeftPercent = Number.isFinite(leftPercent) ? leftPercent : Math.max(0, 100 - (Number.isFinite(rightPercent) ? rightPercent : 50));
  const resolvedRightPercent = Number.isFinite(rightPercent) ? rightPercent : Math.max(0, 100 - resolvedLeftPercent);

  const defaultLeft = percentagesProvided ? resolvedLeftPercent : 46;
  const defaultRight = percentagesProvided ? resolvedRightPercent : 54;
  const leftVotes = numberParam('leftVotes', numberParam('leftValue', defaultLeft));
  const rightVotes = numberParam('rightVotes', numberParam('rightValue', defaultRight));
  const leftPoints = numberParam('leftPoints', leftVotes);
  const rightPoints = numberParam('rightPoints', rightVotes);
  const timerSeconds = numberParam('timer', 180);
  const status = textParam('status', 'running');

  return {
    poll: {
      id: 'query-preview',
      title: textParam('question', 'Кто перевесит в таверне?'),
      status,
      source: 'query',
      startedAt: new Date(Date.now() - 30_000).toISOString(),
      endsAt: status === 'running' ? new Date(Date.now() + timerSeconds * 1000).toISOString() : null,
      choices: [
        {
          id: 'query-left',
          title: textParam('leftLabel', 'Синяя дружина'),
          votes: leftVotes,
          channelPointsVotes: leftVotes,
          pointsSpent: leftPoints
        },
        {
          id: 'query-right',
          title: textParam('rightLabel', 'Фиолетовая дружина'),
          votes: rightVotes,
          channelPointsVotes: rightVotes,
          pointsSpent: rightPoints
        }
      ],
      totals: {
        votes: leftVotes + rightVotes,
        channelPointsVotes: leftVotes + rightVotes,
        pointsSpent: leftPoints + rightPoints
      }
    }
  };
}

function renderHeader(poll) {
  return `
    <header class="header">
      ${config.showTitle ? `<div class="poll-title">${escapeHtml(poll.title)}</div>` : '<div></div>'}
      ${config.showTimer ? `<div class="status-pill"><span>${poll.status === 'running' ? 'LIVE' : 'DONE'}</span><span class="timer" data-timer>${escapeHtml(timeLeft(poll))}</span></div>` : ''}
    </header>
  `;
}

function renderMeta(poll, totals) {
  if (!config.showMeta) return '';
  return `
    <div class="meta-row">
      <span class="meta-chip">Всего: <span data-number-key="total-${config.metric}" data-number-target="${totals.metricTotal}">${formatValue(totals.metricTotal)}</span> ${metricLabel()}</span>
      <span class="meta-chip">Votes: <span data-number-key="total-votes" data-number-target="${totals.votes}">${formatValue(totals.votes)}</span></span>
      ${totals.points ? `<span class="meta-chip">Channel Points: <span data-number-key="total-points" data-number-target="${totals.points}">${formatValue(totals.points)}</span></span>` : ''}
    </div>
  `;
}

function renderBars(poll) {
  const totals = totalsFor(poll);
  const choices = sortedChoices(poll);
  const winnerValue = choices.length ? valueFor(choices[0]) : 0;
  const rows = choices.map((choice) => {
    const value = valueFor(choice);
    const pct = percent(value, totals.metricTotal);
    return `
      <div class="bar-row ${value === winnerValue && value > 0 ? 'winner' : ''}">
        <div class="bar-fill" style="--target-width:${pct.toFixed(2)}%"></div>
        <div class="choice-title">${escapeHtml(choice.title)}</div>
        <div class="choice-value" data-number-key="bar-value-${choice.id}-${config.metric}" data-number-target="${value}">${formatValue(value)}</div>
        <div class="choice-percent" data-number-kind="percent" data-number-key="bar-pct-${choice.id}-${config.metric}" data-number-target="${pct}">${Math.round(pct)}%</div>
      </div>
    `;
  }).join('');

  return `
    <section class="overlay-card">
      ${renderHeader(poll)}
      <div class="bars">${rows}</div>
      ${renderMeta(poll, totals)}
    </section>
  `;
}

function resetOverlayRuntimeState() {
  dom = {};
  lastValues = new Map();
  lastChoiceValues = new Map();
  lastPairHash = '';
  vsRotation = 0;
  itemState = {
    left: { count: 0, type: layout.items.type },
    right: { count: 0, type: layout.items.type }
  };
}

function stopTimerInterval() {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;
}

function renderEmpty() {
  activeView = 'empty';
  resetOverlayRuntimeState();
  stopTimerInterval();
  root.innerHTML = '';
}

function render() {
  const poll = snapshot?.poll;
  if (!poll || !poll.choices?.length || poll.status === 'ended') {
    renderEmpty();
    return;
  }

  if (config.mode === 'bars') {
    activeView = 'bars';
    root.innerHTML = renderBars(poll);
    requestAnimationFrame(() => animateNumbers(root));
    ensureTimerInterval();
    return;
  }

  ensureScaleMarkup();
  updateScale(poll);
  ensureTimerInterval();
}

function ensureScaleMarkup() {
  if (activeView === 'scale') return;
  activeView = 'scale';
  itemState = {
    left: { count: 0, type: layout.items.type },
    right: { count: 0, type: layout.items.type }
  };

  root.innerHTML = `
    <section id="stage" class="stage" aria-label="Twitch voting scale overlay">
      <div class="stage-inner">
        <div class="title-scroll" style="background-image:url('${TAVERN_ASSETS.title}')">
          <div id="question-text" class="question-text"></div>
          <div id="status-badge" class="status-badge">
            <span class="status-dot"></span>
            <span id="status-text">LIVE</span>
            <span id="timer-text" class="timer-text" data-timer></span>
          </div>
        </div>

        <div id="score-left" class="score-card left">
          <span id="left-name" class="score-name"></span>
          <div class="score-row">
            <span id="left-percent" class="score-percent">0%</span>
            <span class="score-value"><span id="left-value">0</span> <span id="left-metric-label">${metricLabel()}</span></span>
          </div>
        </div>

        <div id="score-right" class="score-card right">
          <span id="right-name" class="score-name"></span>
          <div class="score-row">
            <span id="right-percent" class="score-percent">0%</span>
            <span class="score-value"><span id="right-value">0</span> <span id="right-metric-label">${metricLabel()}</span></span>
          </div>
        </div>

        <div id="scale-rig" class="scale-rig">
          <div class="rig-layer base-layer"><img src="${TAVERN_ASSETS.base}" alt="" draggable="false"></div>
          <div id="beam-wrap" class="beam-wrap">
            <div id="beam" class="beam">
              ${renderPanMarkup('left')}
              ${renderPanMarkup('right')}
              <img class="beam-image" src="${TAVERN_ASSETS.beam}" alt="" draggable="false">
            </div>
          </div>
          <div id="vs-medallion" class="vs-medallion"><span>VS</span></div>
        </div>

        <div id="extra-ranks" class="extra-ranks" hidden></div>
      </div>
    </section>
  `;

  dom = {
    stage: root.querySelector('#stage'),
    stageInner: root.querySelector('.stage-inner'),
    question: root.querySelector('#question-text'),
    statusBadge: root.querySelector('#status-badge'),
    statusText: root.querySelector('#status-text'),
    timerText: root.querySelector('#timer-text'),
    beam: root.querySelector('#beam'),
    panLeft: root.querySelector('#pan-left'),
    panRight: root.querySelector('#pan-right'),
    itemsLeft: root.querySelector('#items-left'),
    itemsRight: root.querySelector('#items-right'),
    vs: root.querySelector('#vs-medallion'),
    leftCard: root.querySelector('#score-left'),
    rightCard: root.querySelector('#score-right'),
    leftName: root.querySelector('#left-name'),
    rightName: root.querySelector('#right-name'),
    leftPercent: root.querySelector('#left-percent'),
    rightPercent: root.querySelector('#right-percent'),
    leftValue: root.querySelector('#left-value'),
    rightValue: root.querySelector('#right-value'),
    leftMetricLabel: root.querySelector('#left-metric-label'),
    rightMetricLabel: root.querySelector('#right-metric-label'),
    extraRanks: root.querySelector('#extra-ranks')
  };
}

function renderPanMarkup(side) {
  return `
    <div id="pan-${side}" class="pan ${side}">
      <div class="pan-scale">
        <img class="pan-img pan-back" src="${TAVERN_ASSETS.panBack}" alt="" draggable="false">
        <div id="items-${side}" class="items-layer"></div>
        <img class="pan-img pan-front" src="${TAVERN_ASSETS.panFront}" alt="" draggable="false">
      </div>
    </div>
  `;
}

function updateScale(poll) {
  const totals = totalsFor(poll);
  const [left, right] = pairChoices(poll);
  const leftValue = valueFor(left);
  const rightValue = valueFor(right);
  const pairTotal = leftValue + rightValue;
  const displayTotal = totals.metricTotal || pairTotal;
  const leftPct = percent(leftValue, displayTotal);
  const rightPct = percent(rightValue, displayTotal);
  const tilt = pairTotal ? ((rightValue - leftValue) / pairTotal) * layout.tilt.maxDeg : 0;
  const leftWins = leftValue >= rightValue && leftValue > 0;
  const rightWins = rightValue > leftValue;
  const panCounterRotation = -tilt;
  const panLeftX = layout.geometry.attachLeft.x - layout.geometry.panHang.x;
  const panLeftY = layout.geometry.attachLeft.y - layout.geometry.panHang.y;
  const panRightX = layout.geometry.attachRight.x - layout.geometry.panHang.x;
  const panRightY = layout.geometry.attachRight.y - layout.geometry.panHang.y;
  const leftStatsDrop = pairTotal ? ((leftValue - rightValue) / pairTotal) * 12 : 0;
  const rightStatsDrop = pairTotal ? ((rightValue - leftValue) / pairTotal) * 12 : 0;

  dom.question.textContent = config.showTitle ? poll.title : '';
  dom.statusBadge.hidden = !config.showTimer;
  dom.statusBadge.classList.toggle('is-live', poll.status === 'running');
  dom.statusText.textContent = poll.status === 'running' ? 'LIVE' : 'DONE';
  dom.timerText.textContent = timeLeft(poll);

  dom.beam.style.setProperty('--tilt', `${tilt.toFixed(3)}deg`);
  dom.beam.style.transform = `rotate(${tilt.toFixed(3)}deg)`;
  dom.panLeft.style.transform = `translate(${panLeftX}px, ${panLeftY}px) rotate(${panCounterRotation.toFixed(3)}deg)`;
  dom.panRight.style.transform = `translate(${panRightX}px, ${panRightY}px) rotate(${panCounterRotation.toFixed(3)}deg)`;

  updateVsRotation(leftValue, rightValue);

  dom.leftName.textContent = left.title || 'Left';
  dom.rightName.textContent = right.title || 'Right';
  dom.leftMetricLabel.textContent = metricLabel();
  dom.rightMetricLabel.textContent = metricLabel();
  dom.leftCard.style.setProperty('--stats-dy', `${leftStatsDrop.toFixed(1)}px`);
  dom.rightCard.style.setProperty('--stats-dy', `${rightStatsDrop.toFixed(1)}px`);
  dom.leftCard.classList.toggle('winner', leftWins);
  dom.rightCard.classList.toggle('winner', rightWins);

  animateNumber(dom.leftPercent, `scale-pct-${left.id}-${config.metric}`, leftPct, (value) => `${Math.round(value)}%`);
  animateNumber(dom.rightPercent, `scale-pct-${right.id}-${config.metric}`, rightPct, (value) => `${Math.round(value)}%`);
  animateNumber(dom.leftValue, `scale-value-${left.id}-${config.metric}`, leftValue, formatValue);
  animateNumber(dom.rightValue, `scale-value-${right.id}-${config.metric}`, rightValue, formatValue);

  updateItems('left', leftValue, Math.max(leftValue, rightValue, 1));
  updateItems('right', rightValue, Math.max(leftValue, rightValue, 1));
  pulseIfIncreased('left', left, leftValue);
  pulseIfIncreased('right', right, rightValue);
  updateExtraRanks(poll, totals);
}

function updateVsRotation(leftValue, rightValue) {
  const pairHash = `${leftValue}:${rightValue}`;
  if (pairHash !== lastPairHash) {
    if (lastPairHash) {
      const delta = Math.abs(rightValue - leftValue);
      vsRotation += 135 + Math.min(180, delta * 2.4);
    }
    lastPairHash = pairHash;
  }
  dom.vs.style.setProperty('--vs-rotation', `${vsRotation.toFixed(2)}deg`);
}

function pulseIfIncreased(side, choice, value) {
  const key = `${side}:${choice.id}`;
  const previous = lastChoiceValues.get(key);
  lastChoiceValues.set(key, value);
  if (previous !== undefined && value > previous) {
    const pan = side === 'left' ? dom.panLeft : dom.panRight;
    const card = side === 'left' ? dom.leftCard : dom.rightCard;
    [pan, card].forEach((element) => {
      element.classList.remove('pulse');
      void element.offsetWidth;
      element.classList.add('pulse');
      window.setTimeout(() => element.classList.remove('pulse'), 620);
    });
  }
}

function updateItems(side, value, reference) {
  const container = side === 'left' ? dom.itemsLeft : dom.itemsRight;
  const type = layout.items.type;
  const count = itemCountFor(value, reference);
  const state = itemState[side];

  if (state.type !== type || count < state.count) {
    container.innerHTML = '';
    state.count = 0;
    state.type = type;
  }

  while (container.children.length > count) {
    container.lastElementChild.remove();
  }

  for (let index = state.count; index < count; index += 1) {
    container.appendChild(createItem(index, side, type, true));
  }

  state.count = count;
  state.type = type;
}

function itemCountFor(value, reference) {
  const numeric = Number(value || 0);
  if (numeric <= 0) return 0;
  if (config.itemValue > 0) return Math.max(1, Math.min(layout.items.maxPerPan, Math.round(numeric / config.itemValue)));
  const normalized = reference > 0 ? numeric / reference : 0;
  return Math.max(1, Math.min(layout.items.maxPerPan, Math.round(normalized * layout.items.maxPerPan)));
}

function createItem(index, side, type, entering) {
  const position = itemPosition(index, side);
  const element = document.createElement('span');
  element.className = `vote-item ${entering && config.animation !== 'reduced' ? 'entering' : ''}`;
  element.style.backgroundImage = `url('${TAVERN_ASSETS.items[type]}')`;
  element.style.setProperty('--item-x', `${position.x.toFixed(1)}px`);
  element.style.setProperty('--item-y', `${position.y.toFixed(1)}px`);
  element.style.setProperty('--item-r', `${position.rotation.toFixed(1)}deg`);
  element.style.setProperty('--item-s', position.scale.toFixed(3));
  element.style.zIndex = String(position.zIndex);
  if (entering) window.setTimeout(() => element.classList.remove('entering'), 800);
  return element;
}

function itemPosition(index, side) {
  const rows = layout.items.rows;
  let row = 0;
  let localIndex = index;
  while (row < rows.length - 1 && localIndex >= rows[row]) {
    localIndex -= rows[row];
    row += 1;
  }

  const capacity = rows[row] || rows[rows.length - 1];
  const salt = side === 'left' ? 17 : 71;
  const jitterX = (hash01(index, salt) - 0.5) * 20;
  const jitterY = (hash01(index, salt + 9) - 0.5) * 13;
  const rowWidth = (capacity - 1) * layout.items.stepX;
  const x = ((layout.geometry.itemBox.width - layout.items.size) / 2) - (rowWidth / 2) + localIndex * layout.items.stepX + jitterX;
  const y = layout.geometry.itemBox.height - layout.items.size * 0.78 - (row + 1) * layout.items.stepY + jitterY;
  const rotation = (hash01(index, salt + 21) - 0.5) * 28;
  const scale = 0.87 + hash01(index, salt + 37) * 0.18;

  return {
    x,
    y,
    rotation,
    scale,
    zIndex: 20 + row * 3 + localIndex
  };
}

function hash01(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function updateExtraRanks(poll, totals) {
  const choices = sortedChoices(poll);
  if (choices.length <= 2) {
    dom.extraRanks.hidden = true;
    dom.extraRanks.innerHTML = '';
    return;
  }

  dom.extraRanks.hidden = false;
  dom.extraRanks.innerHTML = choices.slice(2, 6).map((choice, index) => {
    const value = valueFor(choice);
    const pct = percent(value, totals.metricTotal);
    return `
      <div class="rank-row">
        <span>#${index + 3}</span>
        <span class="rank-title">${escapeHtml(choice.title)}</span>
        <span class="rank-percent">${Math.round(pct)}%</span>
      </div>
    `;
  }).join('');
}

function ensureTimerInterval() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    const timer = root.querySelector('[data-timer]');
    if (timer && snapshot?.poll) timer.textContent = timeLeft(snapshot.poll);
  }, 1000);
}
