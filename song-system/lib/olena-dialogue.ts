import {conversation, dialogueContext} from './conversation';
import {interpretationSchema, responsesInterpreter, type Interpreter} from './olena-interpreter';

export async function olenaDialogue(id: string, message?: string, confirm = false, interpreter?: Interpreter) {
  const enabled = process.env.OLENA_RESPONSES_ENABLED === '1';
  if (!interpreter && (!enabled || !process.env.OPENAI_API_KEY || !process.env.OLENA_MODEL)) return conversation(id, message, confirm);
  const context = dialogueContext(id, message);
  if (!context.message || confirm || context.mode === 'producer') return conversation(id, message, confirm);
  try {
    const interpret = interpreter ?? responsesInterpreter({apiKey: process.env.OPENAI_API_KEY!, model: process.env.OLENA_MODEL!});
    const proposal = interpretationSchema.parse(await interpret(context));
    if (proposal.updates.some(update => !context.message.includes(update.evidence))) throw new Error('UNSUPPORTED_EVIDENCE');
    return conversation(id, message, confirm, {revision: context.revision, proposal});
  } catch {
    // The synchronous engine still records the inbound message if the provider fails.
    return conversation(id, message, confirm);
  }
}
