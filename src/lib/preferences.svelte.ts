import type { Gif } from "./gif.ts";

/**
 * Topics and favourites live in this browser only (no accounts, no database). Svelte 5 runes in a
 * .svelte.ts module make them reactive anywhere they are imported.
 */
const TOPICS_KEY = "giftastic:v1:topics";
const FAVOURITES_KEY = "giftastic:v1:favourites";

export const DEFAULT_TOPICS = [
  "Monday mood",
  "Coffee",
  "Celebrate",
  "Facepalm",
  "Mind blown",
  "Thank you",
  "Cats",
  "This is fine",
];

function read<T>(key: string, valid: (value: unknown) => value is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : undefined;
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the app still works, it just won't remember.
  }
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");
const isGifList = (value: unknown): value is Gif[] =>
  Array.isArray(value) &&
  value.every(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as Gif).id === "string" &&
      typeof (v as Gif).mp4 === "string",
  );

class Preferences {
  topics = $state<string[]>(DEFAULT_TOPICS);
  favourites = $state<Gif[]>([]);
  loaded = $state(false);

  /** Called once in the browser; the server always renders the defaults. */
  load() {
    if (this.loaded) return;
    this.topics = read(TOPICS_KEY, isStringList, DEFAULT_TOPICS);
    this.favourites = read(FAVOURITES_KEY, isGifList, []);
    this.loaded = true;
  }

  addTopic(name: string): boolean {
    const topic = name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!topic || this.topics.some((t) => t.toLowerCase() === topic.toLowerCase())) return false;
    this.topics = [...this.topics, topic];
    write(TOPICS_KEY, this.topics);
    return true;
  }

  removeTopic(name: string) {
    this.topics = this.topics.filter((t) => t !== name);
    write(TOPICS_KEY, this.topics);
  }

  isFavourite(id: string) {
    return this.favourites.some((g) => g.id === id);
  }

  toggleFavourite(gif: Gif) {
    this.favourites = this.isFavourite(gif.id)
      ? this.favourites.filter((g) => g.id !== gif.id)
      : [gif, ...this.favourites].slice(0, 100);
    write(FAVOURITES_KEY, this.favourites);
  }
}

export const preferences = new Preferences();
