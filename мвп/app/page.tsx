'use client';
import {useCallback,useEffect,useState}from 'react';
import TelegramControl from '@/components/marketing/telegram-control';
import AdminAccess from '@/components/marketing/admin-access';
import {CalendarDays,Waypoints,Filter,RefreshCw,FileText}from 'lucide-react';
import {SidebarProvider,Sidebar,SidebarHeader,SidebarContent,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton}from '@/components/ui/sidebar';
import {Button}from '@/components/ui/button';
import {Toaster}from '@/components/ui/sonner';
import {toast}from 'sonner';
import seed from '@/data/seed.json';
import type{Workspace,ReportScope}from '@/lib/types';
import Calendar from '@/components/marketing/calendar';
import Funnel from '@/components/marketing/funnel';
import Results from '@/components/marketing/results';
import {normalizeWorkspace}from '@/lib/funnel-data';
import ScopeBar from '@/components/marketing/scope';
import {defaults,reportingScope}from '@/lib/reporting';
const initial=normalizeWorkspace(seed as unknown as Workspace);
const nav=[{id:'calendar',label:'Календарь',icon:CalendarDays},{id:'funnel',label:'Воронка',icon:Filter},{id:'results',label:'Результаты',icon:Waypoints}];
export default function Home(){
 const[scope,setScope]=useState<ReportScope>(defaults('all'));
 const[tab,setTab]=useState('calendar'),[data,setData]=useState<Workspace>(initial),[error,setError]=useState(''),[refresh,setRefresh]=useState(false);
 const load=useCallback(async()=>{const r=await fetch('/api/workspace',{cache:'no-store'});if(!r.ok)throw new Error('Не удалось получить данные с сервера');const d=await r.json() as Workspace;setData(d);setError(d.integration?.databaseReady?'':'Хранилище пока не готово. Исходные данные доступны, сохранение временно недоступно.');},[]);
 useEffect(()=>{const initial=setTimeout(()=>{void load().catch(()=>setError('Сервер недоступен; показаны исходные данные.'));},0);const timer=setInterval(()=>{void load().catch(()=>{});},15000);return()=>{clearTimeout(initial);clearInterval(timer);};},[load]);
 async function mutate(action:string,value:unknown){try{const r=await fetch(action==='payment'?'/api/payments':action==='refund'?'/api/payments/'+encodeURIComponent((value as {id:string}).id)+'/refund':'/api/workspace',{method:action==='refund'?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='payment'?value:action==='refund'?{amount:(value as {amount:number}).amount}:{action,value})});const body=await r.json() as {error?:string;userId?:string};if(!r.ok)throw new Error(body.error??'Не удалось сохранить');await load();toast.success(action==='demo'?'Тестовый путь записан':action==='payment'?'Оплата зарегистрирована':action==='issue_link'?'Ссылка выпущена':'Сохранено');return body;}catch(e){toast.error(e instanceof Error?e.message:'Не удалось сохранить. Проверьте соединение.');throw e;}}
 async function reload(){setRefresh(true);try{await load();toast.success('Данные обновлены');}catch{toast.error('Не удалось обновить данные');}finally{setRefresh(false);}}
 return <SidebarProvider className="app-shell" style={{'--sidebar-width':'232px'} as React.CSSProperties}><Sidebar collapsible="none" className="side"><SidebarHeader className="p-0"><div className="brand"><span className="brand-mark">П</span><div>Поступашки<small>Маркетинг</small></div></div><div className="side-label">РАБОЧЕЕ ПРОСТРАНСТВО</div></SidebarHeader><SidebarContent className="overflow-visible"><SidebarMenu className="site-nav">{nav.map(n=><SidebarMenuItem key={n.id}><SidebarMenuButton onClick={()=>{setTab(n.id);if(n.id!=='calendar'&&scope.mode==='all'){setScope(reportingScope(data,scope));}}} isActive={tab===n.id} className={'nav-item '+(tab===n.id?'active':'')}><n.icon/><span>{n.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="side-footer"><div><span className="status-dot"/>Команда «Наступашки»<small>От размещения до оплаты</small></div><a href="/solution.pdf" target="_blank" rel="noreferrer" className="mt-4 text-sm text-[#bdcafa] flex gap-2 items-center"><FileText size={16}/>PDF решения</a></SidebarFooter></Sidebar><main className="workspace"><header className="topbar"><span>Команда / <strong>{nav.find(n=>n.id===tab)?.label}</strong></span><div className="actions"><TelegramControl admin={!!data.integration?.isAdmin} load={load}/><AdminAccess admin={!!data.integration?.isAdmin} load={load}/><span className="pill neutral">{data.integration?.databaseReady?'Данные сохраняются на сервере':'Загружаем хранилище…'}</span><Button variant="ghost" size="icon-sm" onClick={reload} disabled={refresh} aria-label="Обновить данные"><RefreshCw size={17} className={refresh?'animate-spin':''}/></Button></div></header><div className="page-body">{error&&<div className="error-box" role="alert">{error}</div>}{<ScopeBar data={data} scope={scope} setScope={setScope} calendar={tab==='calendar'}/>} {tab==='calendar'?<Calendar data={data} mutate={mutate} scope={scope} load={load}/>:tab==='funnel'?<Funnel data={data} mutate={mutate} scope={scope} setScope={setScope} load={load}/>:<Results data={data} scope={scope} mutate={mutate}/>}</div></main><Toaster position="bottom-right" richColors/></SidebarProvider>;
}
