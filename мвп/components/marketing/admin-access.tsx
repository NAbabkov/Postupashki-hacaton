'use client';
import {useState} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
export default function AdminAccess({admin,load}:{admin:boolean;load:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 async function login(e:React.SyntheticEvent<HTMLFormElement>){e.preventDefault();setBusy(true);try{const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const b=await r.json() as {error?:string};if(!r.ok)throw new Error(b.error);setPassword('');setOpen(false);await load();toast.success('Доступ команды открыт на 12 часов.');}catch(e){toast.error(e instanceof Error?e.message:'Не удалось войти.');}finally{setBusy(false);}}
 return <><Button variant="outline" size="sm" onClick={()=>{if(admin)void fetch('/api/admin',{method:'DELETE'}).then(load);else setOpen(true);}}>{admin?'Выйти из команды':'Вход команды'}</Button><Dialog open={open} onOpenChange={v=>{setOpen(v);if(!v)setPassword('');}}><DialogContent><DialogHeader><DialogTitle>Доступ команды</DialogTitle><DialogDescription>Просмотр открыт всем. Для планирования, импорта CSV и регистрации оплат нужен ключ команды. Он хранится только на сервере.</DialogDescription></DialogHeader><form onSubmit={login}><label className="field">Ключ команды<Input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><Button className="mt-4" disabled={busy} type="submit">{busy?'Вход…':'Войти'}</Button></form></DialogContent></Dialog></>;
}
