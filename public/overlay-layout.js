export const TAVERN_ASSETS = {
  base: '/assets/tavern-scale/base.png',
  beam: '/assets/tavern-scale/beam_no_vs.png',
  panBack: '/assets/tavern-scale/pan_back.png',
  panFront: '/assets/tavern-scale/pan_front.png',
  title: '/assets/tavern-scale/title_parchment.png',
  leftBanner: '/assets/tavern-scale/left_banner.png',
  rightBanner: '/assets/tavern-scale/right_banner.png',
  items: {
    coin: '/assets/tavern-scale/item_coin.png',
    pelmen: '/assets/tavern-scale/item_pelmen.png',
    pancake: '/assets/tavern-scale/item_pancake.png'
  }
};

export const TAVERN_LAYOUT = {
  stage: {
    width: 1920,
    height: 1080
  },

  overlay: {
    x: 0,
    y: 0,
    scale: 1
  },

  title: {
    top: 20,
    centerX: 960,
    width: 690,
    height: 225,
    textInset: {
      top: 46,
      right: 96,
      bottom: 62,
      left: 96
    }
  },

  stats: {
    top: 782,
    width: 320,
    height: 96,
    leftX: 284,
    rightX: 1316,
    gapFromBowl: 14
  },

  rig: {
    width: 1536,
    height: 1024,
    top: 174,
    centerX: 960,
    scale: 0.68
  },

  geometry: {
    beamWrapY: -145,
    pivot: { x: 768, y: 467 },
    attachLeft: { x: 175, y: 550 },
    attachRight: { x: 1360, y: 550 },
    panHang: { x: 760, y: 55 },
    panScale: 0.55,
    itemBox: { x: 430, y: 718, width: 660, height: 184 },
    vsSize: 134
  },

  tilt: {
    maxDeg: 11
  },

  animation: {
    durationMs: 950,
    easing: 'cubic-bezier(.34,1.2,.5,1)'
  },

  items: {
    type: 'coin',
    maxPerPan: 24,
    size: 154,
    stepX: 86,
    stepY: 22,
    rows: [6, 5, 5, 4, 4, 3, 2]
  }
};
