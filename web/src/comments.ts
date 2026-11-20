import { nanoid } from "nanoid";
import type { CommentMessage } from "./types";

export const MAX_COMMENT_CHARS = 500; // one message
export const MAX_THREAD = 50; // messages in one comment (keeps the object far below the 64 000 character limit)

export const newMessage = (author: string, text: string, at = Date.now()): CommentMessage => ({
  id: nanoid(8),
  author: author.slice(0, 40),
  text,
  at,
});

export const countOpen = (objects: { type: string; resolved?: boolean }[]) =>
  objects.filter((o) => o.type === "comment" && !o.resolved).length;
