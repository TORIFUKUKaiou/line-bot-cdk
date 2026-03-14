export const PROFILE_SUMMARY_LIMIT = 120;
export const RECENT_SUMMARY_LIMIT = 160;
export const OPEN_LOOP_LIMIT = 3;
export const OPEN_LOOP_CHAR_LIMIT = 30;

export interface ConversationMemory {
  profile_summary: string;
  recent_summary: string;
  open_loops: string[];
  updated_at: string;
}

export const EMPTY_CONVERSATION_MEMORY: ConversationMemory = {
  profile_summary: '',
  recent_summary: '',
  open_loops: [],
  updated_at: '',
};
