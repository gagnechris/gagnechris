# Bears 2.0 prototype logic (reference)

Game logic extracted from the design canvas prototypes (the "Public
Site Redesign" Claude artifact, row "Don't Feed the Bears 2.0"). This is
**reference only**: the real implementation lives in pure, tested modules under
`apps/web/src/games/bears/`. [README.md](README.md) summarizes the tuning
numbers.

The prototypes run inside the canvas's `DCLogic` component runtime; templates
and styles are omitted.

## Camp Rules (playable)

```js
var LAYOUT = [
  {
    id: 'trash',
    label: 'Trash',
    x: 18,
    y: 72,
    guest: 'Someone set a trash bag down',
  },
  {
    id: 'feeder',
    label: 'Bird feeder',
    x: 44,
    y: 46,
    guest: 'A guest refilled the bird feeder',
  },
  {
    id: 'cooler',
    label: 'Cooler',
    x: 68,
    y: 74,
    guest: 'The cooler got left open',
  },
  {
    id: 'grill',
    label: 'Grill',
    x: 84,
    y: 50,
    guest: 'Burgers are done. The grill is still greasy',
  },
  {
    id: 'pet',
    label: 'Pet food',
    x: 30,
    y: 52,
    guest: 'The dog’s bowl is out on the porch',
  },
];
var TIPS = {
  trash: [
    'Store trash securely',
    'Ordinary trash cans alone are not enough. Keep garbage in a secure building or a certified bear-resistant container until collection day.',
  ],
  feeder: [
    'Bird feeders: December–March only',
    'Take bird feeders down outside of winter. Vermont guidance is to offer bird seed only from December through March, when bears are typically denning.',
  ],
  cooler: [
    'Keep a clean campsite',
    'Do not leave food, coolers, or cooking gear accessible at camp. Store attractants in a vehicle or bear-resistant storage when you are away from the site.',
  ],
  grill: [
    'Keep a clean campsite',
    'Do not leave food, coolers, or cooking gear accessible at camp. Store attractants in a vehicle or bear-resistant storage when you are away from the site.',
  ],
  pet: [
    'Feed pets indoors',
    'Bring pet food bowls inside. Outdoor pet food is an easy attractant that draws bears into yards and camps.',
  ],
  none: [
    'Never feed bears',
    'Do not leave food out for bears or offer them snacks. In Vermont, purposely feeding bears is illegal — and it puts people and bears at risk.',
  ],
};
function fresh() {
  return {
    phase: 'ready',
    t: 0,
    meter: 0,
    saves: 0,
    seq: 1,
    items: LAYOUT.map(function (l, i) {
      return { id: l.id, open: i % 2 === 0 };
    }),
    bears: [],
    lost: [],
    toast: '',
    toastUntil: 0,
    nextGuest: 2500,
    nextBear: 1500,
    shooReadyAt: 0,
  };
}
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = fresh();
  }
  componentWillUnmount() {
    if (this.timer) clearInterval(this.timer);
  }
  dur() {
    return (this.props.roundSeconds ?? 60) * 1000;
  }
  begin() {
    if (this.timer) clearInterval(this.timer);
    var s = fresh();
    s.phase = 'playing';
    this.setState(s);
    var self = this;
    this.timer = setInterval(function () {
      self.step();
    }, 100);
  }
  end(st) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    st.phase = 'over';
    return st;
  }
  step() {
    var s = this.state;
    if (s.phase !== 'playing') return;
    var D = this.dur();
    var t = s.t + 100,
      p = Math.min(1, t / D);
    var items = s.items.map(function (i) {
      return Object.assign({}, i);
    });
    var bears = s.bears.map(function (b) {
      return Object.assign({}, b);
    });
    var meter = s.meter,
      lost = s.lost.slice(),
      toast = s.toast,
      toastUntil = s.toastUntil;
    var nextGuest = s.nextGuest,
      nextBear = s.nextBear,
      seq = s.seq;
    var byId = function (id) {
      return items.filter(function (i) {
        return i.id === id;
      })[0];
    };
    var layout = function (id) {
      return LAYOUT.filter(function (l) {
        return l.id === id;
      })[0];
    };
    if (t >= nextGuest) {
      var shut = items.filter(function (i) {
        return !i.open;
      });
      if (shut.length) {
        var g = shut[Math.floor(Math.random() * shut.length)];
        g.open = true;
        toast = layout(g.id).guest + '.';
        toastUntil = t + 2200;
      }
      nextGuest = t + 4200 - 2000 * p + Math.random() * 1200;
    }
    var open = items.filter(function (i) {
      return i.open;
    });
    if (t >= nextBear && open.length) {
      var target = open[Math.floor(Math.random() * open.length)];
      var left = Math.random() < 0.5;
      bears.push({
        id: 'b' + seq,
        x: left ? -6 : 106,
        y: 40 + Math.random() * 45,
        target: target.id,
        flee: false,
      });
      seq += 1;
      nextBear = t + 3600 - 1800 * p + Math.random() * 800;
    }
    var speed = (7 + 7 * p) * 0.1;
    bears = bears.filter(function (b) {
      if (b.flee) {
        b.x += (b.x < 50 ? -1 : 1) * speed * 2.4;
        return b.x > -10 && b.x < 110;
      }
      var it = byId(b.target);
      if (!it || !it.open) {
        b.flee = true;
        return true;
      }
      var L = layout(b.target),
        dx = L.x - b.x,
        dy = L.y - b.y,
        d = Math.sqrt(dx * dx + dy * dy);
      if (d < 4) {
        meter += 1;
        lost.push(b.target);
        it.open = false;
        toast = 'A bear got into the ' + L.label.toLowerCase() + '!';
        toastUntil = t + 2200;
        b.flee = true;
        return true;
      }
      var k = Math.min(1, speed / d);
      b.x += dx * k;
      b.y += dy * k;
      return true;
    });
    var next = {
      t: t,
      items: items,
      bears: bears,
      meter: meter,
      lost: lost,
      toast: toast,
      toastUntil: toastUntil,
      nextGuest: nextGuest,
      nextBear: nextBear,
      seq: seq,
    };
    if (meter >= 3 || t >= D) next = this.end(next);
    this.setState(next);
  }
  renderVals() {
    var self = this;
    var s = this.state;
    var D = this.dur();
    var p = Math.min(1, s.t / D);
    var items = s.items.map(function (i) {
      var L = LAYOUT.filter(function (l) {
        return l.id === i.id;
      })[0];
      var threatened = s.bears.some(function (b) {
        return !b.flee && b.target === i.id;
      });
      return {
        label: L.label,
        open: i.open,
        isTrash: i.id === 'trash',
        isFeeder: i.id === 'feeder',
        isCooler: i.id === 'cooler',
        isGrill: i.id === 'grill',
        isPet: i.id === 'pet',
        lidY: i.open ? 6 : 11,
        aria:
          L.label + (i.open ? ', out — activate to put away' : ', put away'),
        badge: i.open ? (threatened ? 'Bear coming!' : 'Out') : 'Put away',
        badgeStyle:
          'font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 9999px; ' +
          (i.open
            ? threatened
              ? 'background: #a3341f; color: #ffffff'
              : 'background: #f4b942; color: #3d2a05'
            : 'background: #2d7471; color: #ffffff'),
        secure: function () {
          var st = self.state;
          if (st.phase !== 'playing') return;
          var cur = st.items.filter(function (x) {
            return x.id === i.id;
          })[0];
          if (!cur || !cur.open) return;
          var save = st.bears.some(function (b) {
            return !b.flee && b.target === i.id;
          });
          self.setState({
            items: st.items.map(function (x) {
              return x.id === i.id ? Object.assign({}, x, { open: false }) : x;
            }),
            saves: st.saves + (save ? 1 : 0),
          });
        },
        style:
          'position: absolute; left: ' +
          L.x +
          '%; top: ' +
          L.y +
          '%; transform: translate(-50%,-50%); width: 84px; min-height: 84px; padding: 8px 4px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; gap: 3px; color: #16191d; ' +
          (i.open
            ? 'background: #fff8e6; border: 2px solid #c08a1e; box-shadow: 0 0 0 6px rgba(244,185,66,.25)'
            : 'background: rgba(255,255,255,.75); border: 2px solid transparent'),
      };
    });
    var bears = s.bears.map(function (b) {
      return {
        aria: b.flee
          ? 'Bear leaving'
          : 'Bear heading for food — activate to make noise',
        shoo: function () {
          var st = self.state;
          if (st.phase !== 'playing' || st.t < st.shooReadyAt) return;
          self.setState({
            bears: st.bears.map(function (x) {
              return x.id === b.id ? Object.assign({}, x, { flee: true }) : x;
            }),
            shooReadyAt: st.t + 6000,
            toast: 'Clap clap! The bear wanders off.',
            toastUntil: st.t + 1600,
          });
        },
        style:
          'position: absolute; left: ' +
          b.x +
          '%; top: ' +
          b.y +
          '%; transform: translate(-50%,-50%); width: 64px; height: 60px; padding: 0; border: 0; background: transparent; transition: left .1s linear, top .1s linear; ' +
          (b.flee ? 'opacity: .55' : ''),
      };
    });
    var slots = [0, 1, 2].map(function (k) {
      return {
        style:
          'width: 22px; height: 10px; border-radius: 9999px; ' +
          (k < s.meter ? 'background: #f4b942' : 'background: #4a515a'),
      };
    });
    var counts = {};
    s.lost.forEach(function (k) {
      counts[k] = (counts[k] || 0) + 1;
    });
    var worst =
      Object.keys(counts).sort(function (a, b) {
        return counts[b] - counts[a];
      })[0] || 'none';
    var tip = TIPS[worst];
    var habituated = s.meter >= 3;
    var pawsN = habituated ? 0 : 3 - s.meter;
    var secs = Math.floor(s.t / 1000);
    var score = secs * 10 + s.saves * 25;
    var shooIn = Math.max(0, Math.ceil((s.shooReadyAt - s.t) / 1000));
    return {
      timeLeft: Math.max(0, Math.ceil((D - s.t) / 1000)) + 's',
      meterSlots: slots,
      meterLabel: 'Bear snacks: ' + s.meter + ' of 3',
      saves: s.saves,
      score: score,
      shooLabel:
        s.phase !== 'playing'
          ? ''
          : shooIn > 0
            ? 'Noise recharging… ' + shooIn + 's'
            : 'Tap a bear to make noise',
      items: items,
      bears: bears,
      duskStyle:
        'position: absolute; inset: 0; pointer-events: none; background: rgba(18,28,58,' +
        (0.5 * p).toFixed(3) +
        ')',
      hasToast: !!s.toast && s.t < s.toastUntil,
      toast: s.toast,
      isReady: s.phase === 'ready',
      isOver: s.phase === 'over',
      start: function () {
        self.begin();
      },
      resultKicker: habituated
        ? 'THE BEARS GOT TOO COMFORTABLE'
        : 'CAMP MADE IT TO DARK',
      resultColor: habituated ? '#a3341f' : '#235a58',
      resultTitle: habituated
        ? 'Three snacks, and the bears learned your camp means food.'
        : s.meter === 0
          ? 'Not a single bear snack. Perfect evening.'
          : 'You held camp together until dark.',
      paws: [0, 1, 2].map(function (k) {
        return { fill: k < pawsN ? '#16191d' : '#d1d6df' };
      }),
      pawsLabel: pawsN + ' of 3 paws',
      statsLine: secs + 's · ' + s.saves + ' saves · score ' + score,
      tipKicker: worst === 'none' ? 'BEAR TIP' : 'WHAT GOT YOU',
      tipTitle: tip[0],
      tipBody: tip[1],
    };
  }
}
```

## Stay Wild level (desktop, lightly playable)

```js
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      fat: 42,
      hab: 0,
      sniffing: false,
      eaten: {},
      toast: '',
      bad: false,
    };
  }
  eat(key, gain, label) {
    var eaten = Object.assign({}, this.state.eaten);
    eaten[key] = true;
    this.setState({
      eaten: eaten,
      fat: Math.min(100, this.state.fat + gain),
      toast: '+' + gain + '% ' + label,
      bad: false,
    });
  }
  renderVals() {
    var self = this;
    var s = this.state;
    var berries = [
      { k: 'b1', x: 190, y: 524 },
      { k: 'b2', x: 460, y: 462 },
    ]
      .filter(function (b) {
        return !s.eaten[b.k];
      })
      .map(function (b) {
        return {
          aria: 'Berry bush, natural food',
          eat: function () {
            self.eat(b.k, 6, 'berries');
          },
          style:
            'position: absolute; left: ' +
            b.x +
            'px; top: ' +
            b.y +
            'px; width: 60px; height: 44px; padding: 0; border: 0; background: transparent',
        };
      });
    var nuts = [
      { k: 'n1', x: 930, y: 400 },
      { k: 'n2', x: 978, y: 420 },
      { k: 'n3', x: 1026, y: 396 },
    ]
      .filter(function (n) {
        return !s.eaten[n.k];
      })
      .map(function (n) {
        return {
          aria: 'Beechnut, natural food',
          eat: function () {
            self.eat(n.k, 4, 'beechnuts');
          },
          style:
            'position: absolute; left: ' +
            n.x +
            'px; top: ' +
            n.y +
            'px; width: 28px; height: 32px; padding: 0; border: 0; background: transparent',
        };
      });
    var fatColor = s.fat >= 70 ? '#3f7a5f' : '#c08a1e';
    return {
      berries: berries,
      nuts: nuts,
      sniffing: s.sniffing && !s.eaten.ants,
      sniffPressed: s.sniffing ? 'true' : 'false',
      sniff: function () {
        self.setState({ sniffing: !self.state.sniffing });
      },
      eatAnts: function () {
        self.eat('ants', 8, 'ants');
        self.setState({ sniffing: false });
      },
      eatTrash: function () {
        var h = Math.min(3, self.state.hab + 1);
        self.setState({
          hab: h,
          fat: Math.min(100, self.state.fat + 15),
          bad: true,
          toast:
            h >= 3
              ? 'Maple is too comfortable around people. Run over.'
              : '+15% fat… but people noticed Maple. That’s ' + h + ' of 3.',
        });
      },
      fat: s.fat,
      fatBar:
        'height: 100%; width: ' +
        s.fat +
        '%; border-radius: 9999px; background: ' +
        fatColor +
        '; transition: width .3s ease',
      hab: [0, 1, 2].map(function (k) {
        return { fill: k < s.hab ? '#c2552d' : '#d1d6df' };
      }),
      habLabel: 'Too comfortable with people: ' + s.hab + ' of 3',
      hasToast: !!s.toast,
      toast: s.toast,
      toastStyle:
        'position: absolute; left: 50%; top: 104px; transform: translateX(-50%); padding: 8px 16px; border-radius: 9999px; font-size: 15px; font-weight: 700; box-shadow: 0 6px 16px rgba(0,0,0,.15); white-space: nowrap; ' +
        (s.bad
          ? 'background: #fdecea; color: #a3341f'
          : 'background: #ffffff; color: #235a58'),
      mapleStyle:
        'position: absolute; left: 640px; top: 400px; transform: rotate(-6deg)',
    };
  }
}
```

## Stay Wild end (outcome: den / habituated)

```js
class Component extends DCLogic {
  renderVals() {
    var win = (this.props.outcome ?? 'den') === 'den';
    var flakes = [];
    for (var i = 0; i < 18; i++)
      flakes.push({
        style:
          'position: absolute; left: ' +
          ((i * 71) % 1280) +
          'px; top: ' +
          (((i * 137) % 700) - 40) +
          'px; width: 6px; height: 6px; border-radius: 50%; background: #ffffff; opacity: .85; animation-delay: -' +
          i * 0.5 +
          's',
      });
    return {
      win: win,
      lose: !win,
      flakes: flakes,
      rootStyle:
        'position: relative; width: 1280px; height: 720px; overflow: hidden; font-family: Inter, system-ui, sans-serif; color: #16191d; background: ' +
        (win ? '#22324a' : '#f6e3c8'),
      kicker: win ? 'MAPLE MADE IT TO THE DEN' : 'RUN OVER',
      kickerColor: win ? '#235a58' : '#a3341f',
      title: win
        ? 'Fat, happy, and still wild. Goodnight, Maple.'
        : 'Maple got too comfortable around people.',
      lede: win
        ? 'She found enough berries, beechnuts and ants to last the winter, and stayed away from the campsites.'
        : 'Campsite food was easy, so she kept coming back. People started seeing her every day, and that’s the start of a problem for a bear.',
      stats: win
        ? [
            { k: 'WINTER FAT', v: '88%' },
            { k: 'NATURAL FOOD', v: '31' },
            { k: 'CAMP SNACKS', v: '0' },
          ]
        : [
            { k: 'WINTER FAT', v: '64%' },
            { k: 'NATURAL FOOD', v: '12' },
            { k: 'CAMP SNACKS', v: '3' },
          ],
      again: win ? 'Play again' : 'Try again, stay wild',
    };
  }
}
```
