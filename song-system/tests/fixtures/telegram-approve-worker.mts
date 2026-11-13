import {decideTelegramBinding} from '../../lib/telegram-approval';
if(process.env.LOCAL_ONLY!=='1'||!process.env.DATA_DIR?.startsWith('/tmp/tg-approval-'))throw Error('Isolated fixture only');
process.on('message',()=>{try{decideTelegramBinding(process.env.QA_ORDER!,process.env.QA_PENDING!,'approve');process.send?.({result:'approved'})}catch(e){process.send?.({result:e instanceof Error?e.message:'error'})}process.disconnect?.()});process.send?.({ready:true});
