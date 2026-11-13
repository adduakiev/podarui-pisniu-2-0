import {requestsNoContact,escalationReason} from './olena-escalation';
import {conversation, dialogueContext, beginDialogueTurn} from './conversation';
import {interpretationSchema, responsesInterpreter, type Interpreter} from './olena-interpreter';

export function configuredDialogueModel(){
 const candidate=process.env.OLENA_MODEL_CANDIDATE;
 const model=candidate&&['luna','terra','sol'].includes(candidate)?process.env['OLENA_MODEL_'+candidate.toUpperCase()]:undefined;
 return model&&!/astra/i.test(model)?model:undefined;
}

export async function olenaDialogue(id: string, message?: string, confirm = false, interpreter?: Interpreter, requestId?: string,lease?:{revision:number;current:()=>boolean}) {
  const apply=(proposal?:Parameters<typeof conversation>[3],ordering?:ReturnType<typeof beginDialogueTurn>)=>{
    if(lease&&!lease.current())throw Error('CLAIM_LOST');
    return conversation(id,message,confirm,proposal,requestId,ordering);
  };
  const selected=configuredDialogueModel();
  const enabled = process.env.OLENA_RESPONSES_ENABLED === '1'&&!!selected;
  const context = dialogueContext(id, message);
  const ordering=lease?beginDialogueTurn(id,lease.revision,message,confirm,requestId):undefined;
  if(lease&&context.revision!==lease.revision)return apply(undefined,ordering);
  if (!interpreter && (!enabled || !process.env.OPENAI_API_KEY || !selected)) return apply(undefined,ordering);
  if (context.contactPaused || requestsNoContact(context.message) || escalationReason(context.message) || context.completed || context.orderId !== id || !context.message || confirm || context.mode === 'producer') return apply(undefined,ordering);
  const reserved=ordering??beginDialogueTurn(id,context.revision,message,confirm,requestId);
  try {
    const interpret = interpreter ?? responsesInterpreter({apiKey: process.env.OPENAI_API_KEY!, model: selected!});
    const proposal = interpretationSchema.parse(await interpret(context));
    if (proposal.updates.some(update => !context.message.includes(update.evidence))) throw new Error('UNSUPPORTED_EVIDENCE');
    return apply({revision:context.revision,proposal},reserved);
  } catch {
    // Retain the captured revision on failures too: delayed fallback is not a new intent.
    return apply(undefined,reserved);
  }
}
