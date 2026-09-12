import {redirect}from 'next/navigation';
export default async function Demo({params}:{params:Promise<{placementId:string}>}){const{placementId}=await params;redirect('/r/'+placementId);}
