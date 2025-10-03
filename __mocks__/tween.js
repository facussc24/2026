// Mock for @tweenjs/tween.js
const TWEEN = {
  Tween: function(target) {
    return {
      to: () => this,
      easing: () => this,
      onUpdate: () => this,
      start: () => this,
    };
  },
  Easing: {
    Quadratic: {
      Out: (k) => k * (2 - k),
    },
  },
  update: () => {},
};

export default TWEEN;