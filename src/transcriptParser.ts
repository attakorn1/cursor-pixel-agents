export type AgentActivityType =
  | 'idle'
  | 'typing'
  | 'reading'
  | 'running'
  | 'editing'
  | 'searching'
  | 'celebrating'
  | 'phoning'
  | 'error'
  | 'newSession'
  | 'sessionEnd'
  | 'toolDone';

export interface ParsedStatus {
  activity: AgentActivityType;
  statusText: string | null;
  sessionId?: string;
  tool?: string;
  composerMode?: 'agent' | 'ask' | 'edit';
  isBackgroundAgent?: boolean;
}

export function inferActivityFromText(text: string): ParsedStatus | null {
  const t = text.toLowerCase();

  if (
    /\b(read|reading|check|look at|inspect|examin|open)\b/.test(t) &&
    /\b(file|code|content|config|package|module|source|dir|folder)\b/.test(t)
  ) {
    return { activity: 'reading', statusText: 'Working...' };
  }
  if (/\b(search|grep|find|glob|looking for|scan|explor)\b/.test(t)) {
    return { activity: 'searching', statusText: 'Working...' };
  }
  if (
    /\b(run |running|execute|\$ |shell|terminal|npm |git |install|build|test|command)\b/.test(t)
  ) {
    return { activity: 'running', statusText: 'Working...' };
  }
  if (
    /\b(edit|updat|replac|modif|fix|chang|rewrit|writ|add .* to|creat|implement|refactor)\b/.test(
      t,
    ) &&
    /\b(file|code|function|component|line|class|module|method)\b/.test(t)
  ) {
    return { activity: 'editing', statusText: 'Working...' };
  }
  if (/\b(web|fetch|url|browse|http|download)\b/.test(t)) {
    return { activity: 'reading', statusText: 'Working...' };
  }
  if (/\b(complet|done|finish|success|all .* complete)\b/.test(t)) {
    return { activity: 'celebrating', statusText: 'Done!' };
  }
  if (/\b(let me|i'll|going to|need to|now|start)\b/.test(t) && text.length < 200) {
    return { activity: 'typing', statusText: 'Working...' };
  }

  if (text.length > 50) {
    return { activity: 'typing', statusText: null };
  }

  return null;
}

export function parseTranscriptLine(line: string): ParsedStatus | null {
  try {
    const record = JSON.parse(line);
    const role = record.role || record.type;
    if (!role) return null;

    if (role === 'user') {
      return { activity: 'idle', statusText: null };
    }

    if (role === 'assistant') {
      let text = '';

      if (record.message?.content) {
        const content = record.message.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) {
              text += part.text + ' ';
            }
          }
        } else if (typeof content === 'string') {
          text = content;
        }
      }

      if (!text && typeof record.message === 'string') {
        text = record.message;
      }
      if (!text && record.text) {
        text = record.text;
      }
      if (!text && record.content?.[0]?.text) {
        text = record.content[0].text;
      }

      text = text.trim();
      if (!text || text.length > 2000) return null;

      return inferActivityFromText(text);
    }

    return null;
  } catch {
    return null;
  }
}
