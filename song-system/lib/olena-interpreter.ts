import {runtimeInstructions} from './olena-instructions';
import {z} from 'zod';

const fields = ['recipient', 'sender', 'occasion', 'eventDate', 'story', 'narrator', 'sound', 'avoid'] as const;
const updateSchema = z.object({
  field: z.enum(fields),
  value: z.string().trim().min(1).max(15000),
  evidence: z.string().trim().min(1),
  correction: z.boolean(),
}).strict();
export const interpretationSchema = z.object({
  action: z.enum(['clarify', 'support', 'answer', 'summarize', 'handoff']),
  reply: z.string().trim().min(1).max(3000),
  updates: z.array(updateSchema).max(12),
}).strict();
export type Interpretation = z.infer<typeof interpretationSchema>;
type ContextFact={value:string;status:'explicit'|'inferred'|'unconfirmed'|'legacy_unknown';source_message_id:number|null;confidence:number;source_page?:string;source?:string;source_field?:'story'};
export type DialogueContext = {
  ownerReferences?: {source_message_id:number;replacement:string;reason:string}[];
  capabilities?: {voiceMessages: boolean;songDelivery?:boolean;deliveryReceipts?:boolean};
  status?:string;
  revision: number;
  mode: 'assistant' | 'producer';
  messages: {role: 'user' | 'assistant'; text: string}[];
  facts: Record<string, string>;
  factMetadata?: Record<string, ContextFact>;
  avoidanceSources?: ContextFact[];
  message: string;
};
export type Interpreter = (context: DialogueContext) => Promise<Interpretation>;



// This server module is only imported by the server-side dialogue wrapper.
export function responsesInterpreter(options: {apiKey: string; model: string; transport?: typeof fetch}): Interpreter {
  const transport = options.transport ?? fetch;
  return async context => {
    const response = await transport('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${options.apiKey}`, 'Content-Type': 'application/json'},
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: options.model,
        store: false,
        instructions: runtimeInstructions,
        input: [{role: 'user', content: JSON.stringify(context)}],
        text: {format: {type: 'json_schema', name: 'olena_turn', strict: true, schema: z.toJSONSchema(interpretationSchema, {target: 'draft-7'})}},
      }),
    });
    if (!response.ok) throw new Error('INTERPRETER_UNAVAILABLE');
    const body = await response.json();
    if (body.status !== 'completed' || !Array.isArray(body.output)) throw new Error('INTERPRETER_INCOMPLETE');
    const text = body.output.flatMap((item: {type: string; content?: {type: string; text?: string}[]}) =>
      item.type === 'message' ? item.content ?? [] : []).filter((item: {type: string}) => item.type === 'output_text')
      .map((item: {text?: string}) => item.text ?? '').join('');
    const result = interpretationSchema.parse(JSON.parse(text));
    if (result.updates.some(update => !context.message.includes(update.evidence))) throw new Error('UNSUPPORTED_EVIDENCE');
    return result;
  };
}
