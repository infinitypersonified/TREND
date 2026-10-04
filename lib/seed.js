// lib/seed.js
// Generates a realistic-feeling starter feed (~100 posts) across all five
// domains on first boot, so a fresh install isn't an empty room. Templates
// are hand-written per domain; the generator fills in authors, timestamps,
// and vote/reaction counts so nothing looks identical or robotic.

import { collection, newId } from './db.js';

const AUTHORS = [
  'devkelechi', 'marcopl', 'kwame_fx', 'aisha_codes', 'tundeb', 'drfunmi',
  'okoye.beats', 'thrift.tolu', 'zainab.k', 'chiomaa', 'segunw', 'nadia_r',
  'priya.codes', 'lucasm', 'hana.b', 'femi_o', 'yusuf.trades', 'aminat',
  'rico_v', 'mei.lin'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const TEMPLATES = {
  tech: {
    claim: [
      "Claude Code alone is pulling in about $2.5B a year, bigger than most public SaaS companies.",
      "On-device AI models will be the default on flagships within 3 years.",
      "Meta's Muse Spark is actually enough to put it back in the AI race.",
      "Post-quantum crypto migration will be mandatory for most banks by 2027.",
      "Most 'AI startups' in 2026 are really just API wrappers with no moat.",
      "Open-weight models will match closed frontier models within 18 months.",
      "Humanoid robots are further from warehouses than the funding suggests.",
      "Browser agents will replace half of what people use Zapier for today."
    ],
    take: [
      "Spent the weekend testing three coding agents back to back — the gap between them is bigger than people admit.",
      "Every job posting now says 'AI-native' and nobody can define what that means.",
      "The real bottleneck for on-device AI isn't the model, it's battery life.",
      "Unpopular opinion: most 'agent' demos are just a for-loop with good marketing."
    ],
    update: [
      "Meta launched Muse Spark, its first model from the new Superintelligence Labs.",
      "A major cloud provider cut GPU rental prices by double digits this week.",
      "A popular open-source inference library shipped a 2x speed-up release."
    ]
  },
  finance: {
    claim: [
      "Anthropic's implied valuation has passed $1 trillion, overtaking OpenAI.",
      "Private credit is quietly becoming the next shadow-banking risk.",
      "Retail options volume keeps climbing and nobody's talking about it.",
      "Tokenized treasuries will hold more assets than money-market funds by 2028.",
      "Regional bank consolidation is nowhere near finished.",
      "The AI capex boom looks more like the fiber-optic buildout of the 2000s than people admit."
    ],
    take: [
      "Everyone's watching valuations. I'm watching who's actually getting paid: enterprise seats.",
      "Secondary market pricing on AI labs is basically vibes at this point.",
      "Nobody prices in regulatory risk on stablecoins enough."
    ],
    update: [
      "A major AI lab's secondary-market valuation moved sharply this week.",
      "A regional bank announced a new round of branch consolidations.",
      "Options open interest on a mega-cap tech name hit a fresh high."
    ]
  },
  health: {
    claim: [
      "GLP-1 drugs are peaking. Growth has to slow down from here.",
      "About 1 in 8 US adults have now used a GLP-1 drug.",
      "mRNA cancer vaccines will see their first approval within 3 years.",
      "Continuous glucose monitors will be standard-issue for non-diabetics within a decade.",
      "Wearable-driven early detection will cut ER visits meaningfully by 2030.",
      "Telehealth for weight loss is a bubble that's about to correct hard."
    ],
    take: [
      "190+ obesity drugs in active pipelines and people still think this is peaking.",
      "The supplement industry riding the GLP-1 wave is going to have a rough correction.",
      "Insurance coverage, not demand, is what decides how long this cycle runs."
    ],
    update: [
      "A large GLP-1 manufacturer reported another strong quarter of sales growth.",
      "A new mRNA vaccine trial moved into its next phase.",
      "A wearable maker added a new early-detection feature to its lineup."
    ]
  },
  music: {
    claim: [
      "AI-made tracks are about to go fully mainstream on streaming.",
      "Stereo is basically outdated now that spatial audio is exploding.",
      "Vinyl's comeback has peaked and streaming will win back the nostalgia crowd.",
      "Short-form video is now the actual A&R department for major labels.",
      "AI disclosure tags on tracks will become a legal requirement within 2 years."
    ],
    take: [
      "Labels are already requiring AI-disclosure tags on submissions — that's not a fad signal.",
      "Where AI music is landing first is mood and background tracks, not lead singles.",
      "Rights and royalty questions are the real thing slowing wider adoption, not quality."
    ],
    update: [
      "A major streaming platform updated its policy on AI-generated tracks.",
      "A big-name artist quietly crossed a massive career streaming milestone.",
      "A spatial-audio feature rolled out to a wider set of devices this week."
    ]
  },
  fashion: {
    claim: [
      "Resale is on track to outgrow fast fashion.",
      "Fast fashion is already dying, most people just haven't noticed.",
      "Quiet luxury is over and maximalism is back within two seasons.",
      "Sneaker resale prices are in a bubble that's about to pop.",
      "Nearly 8 in 10 Gen Z shoppers check secondhand before buying new."
    ],
    take: [
      "Half my closet is secondhand now and nobody can tell. The stigma is gone.",
      "Logistics, not demand, is the real bottleneck slowing resale platforms down.",
      "Fast fashion brands launching their own resale arms is a tell, not a trend."
    ],
    update: [
      "A major fast-fashion brand launched its own in-house resale platform.",
      "A resale marketplace announced a new authentication partnership.",
      "A fashion house reported a shift in sales toward its pre-owned line."
    ]
  }
};

const DOMAINS = Object.keys(TEMPLATES);

function makeBatch(domain, type, count) {
  const rows = [];
  const pool = TEMPLATES[domain][type];
  for (let i = 0; i < count; i++) {
    const text = pool[i % pool.length];
    const trueVotes = type === 'claim' ? randInt(20, 400) : 0;
    const falseVotes = type === 'claim' ? randInt(10, 350) : 0;
    rows.push({
      domain,
      type,
      text,
      authorName: pick(AUTHORS),
      trueVotes,
      falseVotes,
      reacts: randInt(2, 80),
      createdAt: Date.now() - randInt(0, 21) * 86400000 - randInt(0, 86400000)
    });
  }
  return rows;
}

export function seedIfEmpty() {
  const posts = collection('posts');
  if (posts.all().length > 0) return;

  let all = [];
  for (const domain of DOMAINS) {
    all = all.concat(makeBatch(domain, 'claim', 8));
    all = all.concat(makeBatch(domain, 'take', 6));
    all = all.concat(makeBatch(domain, 'update', 6));
  }
  // ~100 posts total (5 domains x 20), newest-looking mixed order
  all.sort(() => Math.random() - 0.5);

  for (const p of all) {
    posts.insert({ id: newId(), authorId: null, mediaUrl: null, mediaType: null, ...p });
  }
}
