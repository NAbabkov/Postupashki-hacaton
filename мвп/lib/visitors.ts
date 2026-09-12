import type{Placement,Workspace}from './types';
export const COOKIE='postupashki_visitor';
export function visitor(req:Request){return /(?:^|;\s*)postupashki_visitor=([a-f0-9]{32})(?:;|$)/.exec(req.headers.get('cookie')??'')?.[1]??null;}
export function visitorUser(id:string,p:Placement){return p.mode+'_web_'+id;}
export function eventTime(data:Workspace,p:Placement,userId:string){
 const last=Math.max(0,...data.events.filter(e=>e.userId===userId&&e.mode===p.mode).map(e=>Date.parse(e.at)));
 return new Date(p.mode==='demo'?Math.max(Date.now(),Date.parse(p.startsAt)+3600000,last+60000):Date.now()).toISOString();
}
