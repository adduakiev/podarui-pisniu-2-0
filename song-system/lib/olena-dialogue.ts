import {requestsNoContact,escalationReason} from './olena-escalation';
import {conversation, dialogueContext, beginDialogueTurn} from './conversation';
import {interpretationSchema, responsesInterpreter, type Interpreter} from './olena-interpreter';

export function configuredDialogueModel(){
 const candidate=process.env.OLENA_MODEL_CANDIDATE;
 const model=candidate&&['luna','terra','sol'].includes(candidate)?process.env['OLENA_MODEL_'+candidate.toUpperCase()]:undefined;
 return model&&!/astra/i.test(model)?model:undefined;
}

export async function olenaDialogue(id: string, message?: string, confirm = false, interpreter?: Interpreter, requestId?: string) {
  const selected=configuredDialogueModel();
  const enabled = process.env.OLENA_RESPONSES_ENABLED === '1'&&!!selected;
  if (!interpreter && (!enabled || !process.env.OPENAI_API_KEY || !selected)) return conversation(id, message, confirm, undefined, requestId);
  const context = dialogueContext(id, message);
  if (context.contactPaused || requestsNoContact(context.message) || escalationReason(context.message) || context.completed || context.orderId !== id || !context.message || confirm || context.mode === 'producer') return conversation(id, message, confirm, undefined, requestId);
  const ordering=beginDialogueTurn(id,context.revision,message,confirm,requestId);
  try {
    const interpret = interpreter ?? responsesInterpreter({apiKey: process.env.OPENAI_API_KEY!, model: selected!});
    const proposal = interpretationSchema.parse(await interpret(context));
    if (proposal.updates.some(update => !context.message.includes(update.evidence))) throw new Error('UNSUPPORTED_EVIDENCE');
    return conversation(id, message, confirm, {revision: context.revision, proposal}, requestId, ordering);
  } catch {
    // Retain the captured revision on failures too: delayed fallback is not a new intent.
    return conversation(id, message, confirm, undefined, requestId, ordering);
  }
}
