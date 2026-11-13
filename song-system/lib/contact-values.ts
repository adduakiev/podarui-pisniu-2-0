export const contactTypes=['email','phone','telegram','instagram'] as const;
export type ContactType=typeof contactTypes[number];
export function contactValue(type:ContactType,value:string){const v=value.trim();if(type==='email'&&/^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}$/i.test(v))return v;
 if(type==='phone'){const phone=v.replace(/[\s()-]/g,'');if(/^\+[1-9]\d{7,14}$/.test(phone))return phone;}
 if(type==='telegram'&&/^@[a-z0-9_]{5,32}$/i.test(v))return v;
 if(type==='instagram'&&/^@[a-z0-9_][a-z0-9_.]{0,29}$/i.test(v))return v;
}
