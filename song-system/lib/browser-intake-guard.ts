// Browser-local warning guard, not authentication or server deduplication.
// Durable state contains no replay key, payload digest or customer data.
const markerKey='pisnia-intake-unresolved',ownerKey='pisnia-intake-owner';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class UnresolvedIntakeError extends Error {}
function marker():string|null {
 const raw=localStorage.getItem(markerKey);if(raw===null)return null;
 let value;try{value=JSON.parse(raw)}catch{throw Error('Позначку незавершеної заявки пошкоджено. Надсилання зупинено; зверніться до команди для уточнення.')}
 if(!value||value.v!==1||typeof value.owner!=='string'||!uuid.test(value.owner)||Object.keys(value).length!==2)throw Error('Позначку незавершеної заявки пошкоджено. Надсилання зупинено; зверніться до команди для уточнення.');
 return value.owner;
}
async function locked<T>(action:()=>T):Promise<T>{
 if(!navigator.locks?.request)throw Error('Цей браузер не підтримує безпечне узгодження вкладок. Заявку не надіслано. Скористайтеся підтримуваним браузером або зверніться до команди.');
 return navigator.locks.request('pisnia-intake-guard',()=>action());
}
function claim(){const owner=crypto.randomUUID();sessionStorage.setItem(ownerKey,owner);localStorage.setItem(markerKey,JSON.stringify({v:1,owner}));return owner}
export function startGuardedIntake<T>(send:(owner:string)=>T){return locked(()=>{
 const current=marker(),mine=sessionStorage.getItem(ownerKey);
 if(current&&current!==mine)throw new UnresolvedIntakeError('У цьому браузері є незавершена спроба. Попередня заявка вже могла зберегтися.');
 const owner=current||claim();
 // Start HTTP under the lock; caller awaits it after releasing the lock.
 return {owner,result:send(owner)};
})}
export function prepareSeparateIntake(){return locked(()=>{marker();const owner=claim();sessionStorage.removeItem('pisnia-intake-pending');return owner})}
export function persistOwnedIntake(owner:string,persist:()=>void){return locked(()=>{
 if(marker()!==owner||sessionStorage.getItem(ownerKey)!==owner)return false;
 persist(); // Failure retains unresolved marker and retry identity.
 localStorage.removeItem(markerKey);
 sessionStorage.removeItem('pisnia-intake-pending');sessionStorage.removeItem(ownerKey);
 return true;
})}
export function disconnectOwnedBrowserChat(session:{id:string;token:string}|null){return locked(()=>{
 const current=marker(),mine=sessionStorage.getItem(ownerKey);
 if(current&&current===mine)localStorage.removeItem(markerKey);
 sessionStorage.removeItem('pisnia-intake-pending');sessionStorage.removeItem(ownerKey);
 const raw=localStorage.getItem('pisnia-chat');let saved;try{saved=JSON.parse(raw||'null')}catch{return}
 if(session&&saved?.id===session.id&&saved?.token===session.token)localStorage.removeItem('pisnia-chat');
})}
export function persistBrowserSessionTransition(previous:{id:string;token:string},next:{id:string;token:string;telegramUrl?:string}){return locked(()=>{
 // A later tab may have claimed an intake or replaced the durable chat since mount.
 if(marker()!==null)return false;
 let saved;try{saved=JSON.parse(localStorage.getItem('pisnia-chat')||'null')}catch{return false}
 if(saved?.id!==previous.id||saved?.token!==previous.token)return false;
 localStorage.setItem('pisnia-chat',JSON.stringify(next));return true;
})}
