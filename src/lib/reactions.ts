/**
 * Paste a message, get reaction searches. A small, readable lexicon instead of a model: it runs
 * in the browser as you type, works offline, and can always say *why* it suggested something.
 */
interface Intent {
  id: string;
  label: string;
  emoji: string;
  /** Searches to offer, best first. */
  queries: string[];
  /** Lowercase English words or phrases (matched on word boundaries) and Chinese substrings. */
  triggers: string[];
}

const INTENTS: Intent[] = [
  {
    id: "celebrate",
    label: "Celebrate",
    emoji: "🎉",
    queries: ["celebrate", "high five"],
    triggers: [
      "congrats",
      "congratulations",
      "promoted",
      "promotion",
      "we did it",
      "shipped",
      "launched",
      "nailed it",
      "won",
      "恭喜",
      "太棒了",
      "上线",
      "发布",
      "成功",
    ],
  },
  {
    id: "thanks",
    label: "Thank you",
    emoji: "🙏",
    queries: ["thank you", "grateful"],
    triggers: ["thanks", "thank you", "thx", "ty", "appreciate", "谢谢", "感谢", "多谢"],
  },
  {
    id: "tired",
    label: "Tired",
    emoji: "😴",
    queries: ["tired", "monday mood"],
    triggers: [
      "tired",
      "exhausted",
      "sleepy",
      "monday",
      "long day",
      "ugh",
      "累",
      "困",
      "周一",
      "加班",
    ],
  },
  {
    id: "facepalm",
    label: "Facepalm",
    emoji: "🤦",
    queries: ["facepalm", "this is fine"],
    triggers: [
      "oops",
      "bug",
      "broke",
      "broken",
      "prod is down",
      "outage",
      "error",
      "crashed",
      "崩了",
      "挂了",
      "又错了",
      "bug了",
    ],
  },
  {
    id: "wow",
    label: "Mind blown",
    emoji: "🤯",
    queries: ["mind blown", "wow"],
    triggers: [
      "wow",
      "whoa",
      "amazing",
      "insane",
      "incredible",
      "no way",
      "卧槽",
      "太强了",
      "牛",
      "厉害",
    ],
  },
  {
    id: "laugh",
    label: "Laughing",
    emoji: "😂",
    queries: ["laughing", "lol"],
    triggers: ["lol", "lmao", "haha", "hahaha", "rofl", "funny", "哈哈", "笑死", "好笑"],
  },
  {
    id: "love",
    label: "Love",
    emoji: "❤️",
    queries: ["love", "heart eyes"],
    triggers: ["love", "adore", "cute", "❤", "爱你", "喜欢", "可爱"],
  },
  {
    id: "food",
    label: "Food & coffee",
    emoji: "☕",
    queries: ["coffee", "hungry"],
    triggers: [
      "coffee",
      "lunch",
      "dinner",
      "hungry",
      "snack",
      "pizza",
      "burger",
      "咖啡",
      "饿",
      "吃饭",
      "午饭",
    ],
  },
  {
    id: "confused",
    label: "Confused",
    emoji: "😕",
    queries: ["confused", "what"],
    triggers: ["what", "huh", "confused", "wtf", "??", "啥", "什么鬼", "不懂", "懵"],
  },
  {
    id: "excited",
    label: "Excited",
    emoji: "🤩",
    queries: ["excited", "weekend"],
    triggers: [
      "friday",
      "weekend",
      "can't wait",
      "cant wait",
      "excited",
      "vacation",
      "holiday",
      "周末",
      "期待",
      "放假",
    ],
  },
  {
    id: "sorry",
    label: "Sorry",
    emoji: "🙇",
    queries: ["sorry", "my bad"],
    triggers: ["sorry", "my bad", "apologies", "apologize", "抱歉", "对不起", "不好意思"],
  },
  {
    id: "agree",
    label: "Agree",
    emoji: "👍",
    queries: ["exactly", "nodding"],
    triggers: ["yes", "agreed", "agree", "exactly", "+1", "same", "对", "同意", "没错", "是的"],
  },
];

export interface Suggestion {
  id: string;
  label: string;
  emoji: string;
  queries: string[];
  /** The words in the message that triggered this, shown to the user ("because you wrote…"). */
  because: string[];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matches(message: string, trigger: string): boolean {
  if (/^[a-z' ]+$/.test(trigger)) return new RegExp(`\\b${escapeRegExp(trigger)}\\b`).test(message);
  return message.includes(trigger);
}

/** Up to three reactions, strongest first (most matched words, then order of the list above). */
export function suggestReactions(message: string, limit = 3): Suggestion[] {
  const text = message.toLowerCase().slice(0, 500);
  if (!text.trim()) return [];
  return INTENTS.map((intent) => ({
    intent,
    because: intent.triggers.filter((t) => matches(text, t)),
  }))
    .filter(({ because }) => because.length > 0)
    .sort((a, b) => b.because.length - a.because.length)
    .slice(0, limit)
    .map(({ intent, because }) => ({
      id: intent.id,
      label: intent.label,
      emoji: intent.emoji,
      queries: intent.queries,
      because,
    }));
}
