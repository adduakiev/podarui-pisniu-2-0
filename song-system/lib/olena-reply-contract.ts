// Current dialogue entrypoints have no verified incoming-audio pipeline.
// Vocal/style preferences for the song are unrelated to this capability.
export const dialogueCapabilities = Object.freeze({voiceMessages: false,songDelivery:false,deliveryReceipts:false});

export type ReplyViolation = 'voice_input' | 'emotional_promise' | 'delivery_promise' | 'personal_demo' | 'producer_text_review' | 'human_identity';

// Bounded output checks, not a semantic safety proof. Business terms remain
// server-owned. Split contrast clauses so a disclaimer cannot excuse a promise.
export function replyViolation(reply: string): ReplyViolation | undefined {
  // Retain name-plus-role apposition across commas; a name alone is valid.
  // Only affirmative first-person identity is covered, not attributed quotations.
  const identityClauses=reply.toLowerCase().split(/[.!?;\n]+|,?\s+(?:але|проте|однак|зате)\s+/u);
  if(identityClauses.some(part=>/^я\s+(?:[\p{L}’'ʼ-]+,\s*)?(?:(?:справжня|справжній|жива|живий)\s+(?:людина|менеджерка|менеджер)|людина|власник\s+студії|власниця\s+студії)(?=[\s,.!]|$)/u.test(part.trim())))return 'human_identity';
  const clauses = reply.toLowerCase().split(/[.!?;\n]+|,?\s+(?:але|проте|однак|зате)\s+|,(?!(?:\s*)(?:що|коли|чи|перевірить|погодить|уточнить|підтвердить)\s)\s*/u);
  for (const raw of clauses) {
    const clause = raw.trim();
    // A custom preview is not an offered service. Keep refusal and attributed history.
    const demoOffer = /^(?:(?:я|ми)\s+)?(?:(?:можу|можемо|готова|готові)\s+)?(?:зроблю|зробимо|зробити|створю|створимо|створити|підготую|підготуємо|підготувати|запропоную|пропоную)\s+/u.test(clause);
    const personalDemo = /персональн\S*\s+(?:демо|демозапис)|пробн\S*\s+уривок[^.!?]*(?:саме\s+для\s+вас|вашої\s+пісні)/u.test(clause);
    if(demoOffer && personalDemo)return 'personal_demo';
    // Client brief confirmation is not evidence of producer text review.
    // No producer-review record exists; preserve pending/negative formulations.
    const producerReviewed = /^продюсер\s+(?:(?:уже|вже)\s+)?(?:перевірив|переглянув|погодив|схвалив)\s+(?:ваш\s+)?текст(?:\s|$)/u.test(clause);
    const textApproved = /^(?:ваш\s+)?текст\s+(?:(?:уже|вже)\s+)?(?:погоджено|схвалено)(?:\s+продюсером|\s+для\s+роботи|$)/u.test(clause);
    if(producerReviewed || textApproved)return 'producer_text_review';
    const voiceInput = /голосов\S*|войс|аудіо(?:повідомлен|запис)?|(?:запиш|записа|розкаж|наговор)\S*\s+голосом/u.test(clause);
    // Incoming audio is unavailable: reject affirmative references rather than
    // trying to enumerate every request verb (send, tell, record, listen).
    const voiceUnavailable = /^(?:тут\s+|поки що\s+|я\s+|ми\s+)*(?:не\s+(?:можу|можемо|прийма|підтрим|прослуха|надсила|відправля|записуй)|голосов\S*\s+повідомлен\S*\s+(?:тут\s+)?не\s+(?:підтрим|прийма))/u.test(clause);
    if (!dialogueCapabilities.voiceMessages && voiceInput && !voiceUnavailable) return 'voice_input';

    const disclaimer = /^(?:я\s+|ми\s+)?не\s+(?:(?:можу|можемо)\s+)?(?:гаранту|обіця)/u.test(clause);
    const emotion = /заплаче|розплаче|зраді|сльоз|щаст|щаслив|усміх|посміх|сподоба|захват|розчул|зворуш|емоційн\S*\s+реакц/u.test(clause);
    const certainty = /гаранту|обіця|точно|неодмінно|обов[’'ʼ]язково|безсумнів|напевно|буде\s+(?:в\s+)?захват/u.test(clause);
    if ((emotion && certainty || /^(?:гаранту|обіця)/u.test(clause)) && !disclaimer) return 'emotional_promise';

    const delivery = /готов\S*|зроблено|встигн|зробимо|створимо|завершимо|підготуємо|надішлемо|отримаєте|буде\s+(?:у|в)\s+вас/u.test(clause);
    // Recognize duration units independently of whether their count is digits or words.
    const duration = /(?:за|через|протягом)\s+(?:[\p{L}’\x27ʼ-]+\s+|\d+\s+){0,4}(?:дні|днів|день|доб\S*|тиж\S*|місяц\S*|годин\S*|хвилин\S*)(?:\s|$)/u.test(clause);
    const time = duration || /сьогодні|завтра|післязавтра|зранку|увечері|(?:до|у|в)\s+(?:понеділ|вівтор|серед|четвер|п[’'ʼ]ятниц|субот|неділ|свят|вечор|ранк|\d)|(?:через|за)\s+(?:\d|тижд|місяц|день|доб|пару|декілька|кілька)|наступн\S*\s+(?:тиж|місяц|дн|день)/u.test(clause);
    const producerCheck = !/точно|гаранту|обіця|неодмінно/u.test(clause) && /^(?:(?:можливість|чи\s+(?:зможемо|встигнемо))[^.!?]*(?:перевірить|погодить|уточнить|підтвердить)\s+продюсер|продюсер\s+(?:перевірить|погодить|уточнить|підтвердить)\s+(?:можливість|чи))/u.test(clause);
    if (delivery && time && !disclaimer && !producerCheck) return 'delivery_promise';
  }
}
